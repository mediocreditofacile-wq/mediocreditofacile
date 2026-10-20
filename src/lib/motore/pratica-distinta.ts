// La pratica sul settore "distinta" (oggi Led Office). Spec mcf_spec-ledoffice-motore_v1,
// paragrafi 5 ("Rosso", "Eventi che arrivano dopo") e 9.
//
// ATTENZIONE — FILE SERVER-ONLY: legge il database, lo store Blob e il registro
// delle verifiche. Le regole pure stanno in pratica-distinta-regole.ts (client-safe) e
// si riesportano da qui.
//
// /api/motore/pratica, sulle carrozzerie col settore distinta, passa TUTTA la richiesta
// da creaPraticaDistinta, qualunque cosa mandi il browser: il percorso di sempre prende
// l'importo dal browser, tratta la proposta come facoltativa e non guarda il semaforo.
// Qui invece:
//  - il prefiltro si ricalcola sul server con i segnali riletti (MCF puo' aver segnato il
//    cliente dopo la verifica) e con gli eventi aggiornati: un esito chiuso dopo il giro
//    in background e mai letto si legge qui (una lettura, come riaprendo la ricerca), poi
//    conta il registro. Un rosso arrivato dopo il preventivo trasforma l'invio in una
//    segnalazione;
//  - la proposta deve essere della ricerca indicata, non solo dello stesso cliente;
//  - importo, righe, consegna, canale e dati di vendita si rileggono dalla proposta
//    salvata. Solo nella segnalazione senza proposta la distinta viene dal corpo, e la
//    si ricontrolla sul catalogo come per il preventivo;
//  - una segnalazione chiesta su un cliente verde o giallo passa solo se nessun canale
//    regge l'importo, e lo si prova rifacendo l'instradamento: il browser non si crede;
//  - la forma giuridica che decide la checklist viene dal Registro;
//  - i documenti si tengono solo se caricati sotto una voce della checklist di quel cliente.
//
// Cosa va dove: `app.pratica.dati` porta anche IBAN e dati di vendita (codice fiscale
// dell'amministratore), `canale` e `riservato` sono copiati dalla proposta e sono solo di
// MCF. Sulla segnalazione `canale` resta vuoto: non e' andata su nessun canale, e la
// regola 9 delle verifiche successive non deve mostrare a MCF un canale mai usato; se
// c'era una proposta, i suoi dati restano nel `riservato` con `canaleProposta`. Nessuna lista li legge: lo storico seleziona colonne esplicite. Al commerciale la
// risposta dice soltanto id e se e' una segnalazione; tutto il resto va nella mail a MCF,
// con la proposta per il locatore in allegato.

import { get } from '@vercel/blob';
import { BASE_URL } from '../auth';
import { controllaDatiCliente } from '../dati-cliente-pratica';
import { env, query, queryUna } from '../db';
import { formattaIban } from '../iban';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail, type Allegato } from '../mail-portale';
import { leggiVerifica } from '../openapi';
import { percorsoPortale } from '../percorso-portale';
import { euro } from '../prospetti-pv';
import { decidiVerifica, type Decisione } from '../verifiche-cache';
import { componiCalcolo, type Consegna } from './calcolo-distinta';
import { ricercaVisibile, type RicercaSalvata } from './calcolo-proposta';
import { catalogo } from './carrozzeria';
import { vociChecklist, type Categoria, type IdCanale } from './config-distinta';
import type { DatiVendita } from './dati-vendita';
import { totaleRighe, type RigaDistinta } from './distinta';
import { riprendiEventi } from './eventi-merito';
import { codiceVerifica, eventiNonAvviati, serveControllo, statoDaEsito, type EventiRicerca } from './eventi-stato';
import { instrada, type Instradamento } from './instradamento';
import { FONTE_PRATICA, type DatiMailVerifica } from './mail-verifica';
import type { DatiCreditoMotore, SchedaRidotta } from './merito';
import { nomeCanale as nomeDelCanale } from './nomi-canale';
import { percorsoConsentito } from './percorso-riservato';
import { bozzaValida, documentiDellaBozza, negativitaAllInvio } from './pratica';
import {
  decidiInvio,
  documentiMancanti,
  type DocumentoVoce,
} from './pratica-distinta-regole';
import {
  datiPrefiltro,
  TESTI_PREFILTRO,
  valutaPrefiltro,
  type DistintaPrefiltro,
  type EsitoPrefiltro,
  type SegnaliPrefiltro,
} from './prefiltro';
import type { DatiProposta, NumeriProposta, RiservatoProposta } from './preventivo-distinta';
import { salvaSegnali, segnaliPrefiltro, unisciSegnali } from './segnali-prefiltro';
import { classeForma, TESTO_EVENTI, type ClasseForma, type StatoEventi } from './semaforo-locatore';
import { filtroVisibilita, generaId, type EsitoMotore } from './sessione';

export * from './pratica-distinta-regole';

type Sessione = Extract<EsitoMotore, { ok: true }>;

export type EsitoPraticaDistinta =
  | { ok: true; id: string; segnalazione: boolean }
  | { ok: false; status: number; error: string; messaggio?: string; riga?: number | null };

/** Perche' l'invio e' diventato una segnalazione */
export type MotivoSegnalazione = 'rosso' | 'nessun_canale';

/** La proposta salvata, come la rilegge la pratica. Canale e riservato: solo MCF */
export interface PropostaSalvata {
  id: string;
  dati: DatiProposta | null;
  numeri: NumeriProposta | null;
  canale: IdCanale | null;
  riservato: RiservatoProposta | null;
}

const MESSAGGI: Record<string, string> = {
  cliente_bloccato: TESTI_PREFILTRO.bloccato,
  proposta_mancante:
    'Per caricare la pratica serve una proposta salvata: prima scarica il preventivo e la proposta di vendita.',
  proposta_non_valida:
    'La proposta indicata non è di questo cliente o non si può usare: rifai il preventivo dalla scheda Proposte.',
  consegna_proposta: "Nella proposta manca l'indirizzo di consegna: rifai la proposta indicando dove vanno i beni.",
  consegna_corpo: "Manca l'indirizzo di consegna: indica dove vanno consegnati i beni.",
  proposta_senza_vendita:
    'Genera prima la proposta di vendita: completa i dati del cliente nella scheda Proposte e rifai il preventivo.',
};

const FORMA_PRATICA: Record<ClasseForma, string> = {
  capitali: 'Società di capitali',
  persone: 'Società di persone',
  individuale: 'Ditta individuale',
  'non-classificata': 'Altro',
};

const TIPO_CONSEGNA: Record<Consegna['tipo'], string> = {
  sede: 'sede legale',
  unita: 'unità locale',
  altro: 'altro indirizzo',
};

const oggetto = (v: unknown): Record<string, unknown> =>
  v !== null && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {};

const testo = (v: unknown, max = 200) =>
  (typeof v === 'string' || typeof v === 'number' ? String(v) : '').trim().slice(0, max);

function no(status: number, error: string, messaggio?: string, riga?: number | null): EsitoPraticaDistinta {
  const m = messaggio ?? MESSAGGI[error];
  return { ok: false, status, error, ...(m ? { messaggio: m } : {}), ...(riga !== undefined ? { riga } : {}) };
}

// --- regole pure del server ----------------------------------------------------

/**
 * Lo stato degli eventi negativi che conta all'invio. La ricerca ha quello salvato
 * dalla verifica (Postgres); il registro delle verifiche puo' averne uno piu' nuovo,
 * chiuso dopo che il commerciale ha scaricato il preventivo. Eventi presenti da una
 * parte qualsiasi vincono: e' il rosso che arriva dopo.
 */
export function statoEventiInvio(salvato: StatoEventi | null, registro: Decisione): StatoEventi {
  const dalRegistro = registro.azione === 'registro' && registro.pronto ? statoDaEsito(registro.dati) : null;
  if (salvato === 'presenti' || dalRegistro === 'presenti') return 'presenti';
  return dalRegistro ?? salvato ?? 'non-avviata';
}

/** Una proposta di distinta salvata: canale e riservato scritti, almeno una riga */
export function propostaUsabile(p: PropostaSalvata | null): p is PropostaSalvata & { dati: DatiProposta } {
  if (!p || !p.canale || !p.riservato) return false;
  const righe = oggetto(p.dati).righe;
  return Array.isArray(righe) && righe.length > 0;
}

/**
 * La proposta da cui parte una pratica normale (non una segnalazione): usabile, coi
 * dati di vendita e con la proposta per il locatore salvata nel riservato. Una proposta
 * col solo canone (dati di vendita mai completati, o PDF del locatore non salvato) a
 * MCF non darebbe ne' la proposta da far firmare ne' quella da mandare al locatore.
 * Il percorso lo controlla poi allegatoLocatore(), che lo legge solo dalla cartella
 * riservata del fornitore.
 */
export function propostaCompleta(p: PropostaSalvata | null): boolean {
  if (!propostaUsabile(p)) return false;
  const vendita = oggetto(p.dati).vendita;
  if (vendita === null || typeof vendita !== 'object' || Array.isArray(vendita)) return false;
  const documenti = oggetto(p.riservato).documenti;
  return Array.isArray(documenti) && documenti.some((d) => {
    const percorso = oggetto(d).pathname;
    return typeof percorso === 'string' && percorso !== '';
  });
}

/** La durata della pratica: quella chiesta se la proposta la quota, altrimenti quella in evidenza */
function durataDellaProposta(numeri: NumeriProposta | null, chiesta: unknown): number | null {
  const durate = (numeri?.rate ?? []).map((r) => r.durata);
  const n = Math.round(Number(chiesta));
  if (durate.includes(n)) return n;
  return numeri?.scelta?.durata ?? null;
}

const clienteInstradamento = (d: DatiCreditoMotore) => ({
  formaCodice: d.formaCodice ?? null,
  inizioAttivita: d.inizioAttivita ?? null,
  fatturato: d.fatturato ?? null,
  atecoCodice: d.atecoCodice ?? null,
});

/** C'e' un LEDwall fra le righe? Lo dice la categoria della riga */
const conLedwall = (righe: RigaDistinta[], categorie: Categoria[]) =>
  righe.some((r) => categorie.find((c) => c.nome === r.categoria)?.ledwall === true);

// --- mail a MCF ------------------------------------------------------------------

export interface InputMailPratica {
  k: { nome: string; demo: boolean };
  agente: { nome: string; email: string };
  id: string;
  segnalazione: MotivoSegnalazione | null;
  cliente: { ragioneSociale: string; piva: string; rating?: SchedaRidotta['rating'] };
  forma: ClasseForma;
  referente: { nome: string; telefono: string; email: string };
  iban: string;
  durata: number | null;
  note: string;
  propostaId: string | null;
  righe: RigaDistinta[];
  totale: number;
  /** Dalla proposta: canale, beni, maggiorazione, imponibile per il locatore */
  riservato: RiservatoProposta | null;
  /** Segnalazione senza proposta: il canale che reggerebbe l'importo, se uno regge */
  canaleIndicativo: Pick<Instradamento, 'canale' | 'beni' | 'maggiorazione' | 'imponibile'> | null;
  /** Col dettaglio della distinta: criteri e domande delle motivazioni */
  prefiltro: EsitoPrefiltro;
  segnali: SegnaliPrefiltro;
  motivazioni: Record<string, string>;
  conLedwall: boolean;
  ledwallConfermato: boolean;
  consegna: Consegna;
  documenti: DocumentoVoce[];
  mancanti: { obbligatori: string[]; facoltativi: string[] };
  negativita: any;
  /** La proposta per il locatore: in allegato, non leggibile dall'archivio, o non c'e' */
  locatore: 'allegata' | 'illeggibile' | 'assente';
  /** Il portale del fornitore, per aprire documenti e stato */
  link?: string;
}

const TESTA_SEGNALAZIONE: Record<MotivoSegnalazione, string> = {
  rosso: 'SEGNALAZIONE, prefiltro rosso',
  nessun_canale: "SEGNALAZIONE, nessun canale regge l'importo",
};

const dataIt = (iso: string) => iso.split('-').reverse().join('/');

/** L'esito di un criterio del prefiltro, come sul blocco a video */
const ESITO_CRITERIO: Record<string, string> = { true: 'ok', false: 'non ok', null: 'da verificare' };

/**
 * La mail a MCF per una pratica (o segnalazione) di distinta. Pura: si prova senza
 * mandare niente. Porta tutto quello che il commerciale non vede: canale, maggiorazione
 * e imponibile per il locatore, la distinta con listino e prezzo trattato, motivazioni,
 * criteri del prefiltro, pratica recente con data, canale e fornitore, conferma del
 * LEDwall, documenti arrivati e mancanti.
 */
export function corpoMailPratica(o: InputMailPratica): { subject: string; html: string } {
  const { k, agente, cliente, prefiltro: p } = o;
  const eur = (v: number, dec = 2) => `${euro(v, dec)} euro`;
  const riga = (et: string, val: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:200px;vertical-align:top"><strong>${escapeHtml(et)}</strong></td><td>${escapeHtml(val)}</td></tr>`;
  const h3 = (t: string) => `<h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">${escapeHtml(t)}</h3>`;
  const elenco = (voci: string[]) =>
    `<ul style="font-size:14px;margin:0;padding-left:18px">${voci.map((v) => `<li>${escapeHtml(v)}</li>`).join('')}</ul>`;

  const importi = o.riservato ?? o.canaleIndicativo;
  const nomeCanale = (c: IdCanale) => nomeDelCanale(c) ?? c;
  const canale = o.riservato
    ? o.segnalazione ? `nessuno, segnalazione: la proposta era su ${nomeCanale(o.riservato.canale)}` : nomeCanale(o.riservato.canale)
    : o.canaleIndicativo
      ? `nessuna proposta; indicativo: ${nomeCanale(o.canaleIndicativo.canale)}`
      : 'nessuno';
  const neg = o.negativita?.pronto
    ? "già in registro, esito nel pannello"
    : o.negativita?.id ? "avviata, l'esito arriva nel pannello" : `non avviata (${o.negativita?.saltata ?? 'errore'}): lanciala da /tools/valutazione`;
  const segnalato = o.segnali.segnalato;
  const recente = o.segnali.praticaRecente;

  const tabella = `
    <table style="font-size:14px;border-collapse:collapse;width:100%">
      ${riga('Cliente', `${cliente.ragioneSociale}, P.IVA ${cliente.piva}`)}
      ${riga('Forma giuridica (Registro)', FORMA_PRATICA[o.forma])}
      ${riga('Rating', cliente.rating ? `${cliente.rating.classe} (${cliente.rating.descrizione ?? ''})` : 'non assegnato')}
      ${riga('Proposta', o.propostaId ?? 'nessuna proposta: segnalazione')}
      ${riga('Prefiltro', `${p.etichetta}${p.provvisorio ? ', eventi negativi ancora in verifica' : ''}`)}
      ${riga('Canale', canale)}
      ${importi ? riga('Beni', eur(importi.beni)) : ''}
      ${importi ? riga('Maggiorazione', importi.maggiorazione > 0 ? eur(importi.maggiorazione, 0) : 'nessuna') : ''}
      ${importi ? riga('Imponibile per il locatore', eur(importi.imponibile)) : ''}
      ${o.durata ? riga('Durata', `${o.durata} mesi, noleggio operativo`) : ''}
      ${riga('Consegna', `${TIPO_CONSEGNA[o.consegna.tipo]}: ${o.consegna.indirizzo || 'non indicato'}`)}
      ${o.conLedwall ? riga('LEDwall', o.ledwallConfermato ? 'installazione fissa confermata dal commerciale' : "spunta sull'installazione mancante") : ''}
      ${riga('Referente', o.referente.nome || '-')}
      ${riga('Cellulare', o.referente.telefono)}
      ${riga('Email', o.referente.email)}
      ${riga('IBAN', formattaIban(o.iban))}
      ${riga('Eventi negativi', `${TESTO_EVENTI[p.eventi]}; verifica all'invio ${neg}`)}
      ${segnalato ? riga('Cliente segnalato', `${segnalato.motivo}, effetto ${segnalato.effetto}`) : ''}
      ${recente ? riga('Pratica recente', [
        dataIt(recente.data),
        nomeDelCanale(recente.canale) ?? 'canale non indicato',
        recente.fornitore ?? 'fornitore non indicato',
        FONTE_PRATICA[recente.fonte],
      ].join(', ')) : ''}
      ${o.note ? riga('Note', o.note) : ''}
    </table>`;

  const cella = 'padding:4px 8px;border-bottom:1px solid #E1DEE3';
  const destra = `${cella};text-align:right;white-space:nowrap`;
  const righe = o.righe.map((r) => {
    const note = [r.codice ?? '', r.fuoriListino ? 'fuori listino' : '', r.scaduta ? 'prezzo da riconfermare' : '']
      .filter(Boolean).join(', ');
    return `<tr>
      <td style="${cella}">${escapeHtml(r.descrizione)}${note ? `<br><span style="color:#787782;font-size:12px">${escapeHtml(note)}</span>` : ''}</td>
      <td style="${destra}">${r.quantita}</td>
      <td style="${destra}">${r.listino !== null ? euro(r.listino) : '-'}</td>
      <td style="${destra}">${euro(r.prezzo)}</td>
      <td style="${destra}">${euro(r.totale)}</td>
    </tr>`;
  }).join('');
  const distinta = `
    ${h3('Distinta')}
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      <tr style="color:#787782">
        <th style="${cella};text-align:left">Bene</th><th style="${destra}">Q.tà</th>
        <th style="${destra}">Listino</th><th style="${destra}">Trattato</th><th style="${destra}">Totale</th>
      </tr>
      ${righe}
      <tr><td colspan="4" style="${cella}"><strong>Totale beni</strong></td><td style="${destra}"><strong>${euro(o.totale)}</strong></td></tr>
    </table>`;

  const domande = new Map<string, string>(p.motivazioniRichieste.map((m) => [m.chiave, m.testo]));
  const motivazioni = Object.entries(o.motivazioni);
  const bloccoMotivazioni = motivazioni.length
    ? `${h3('Motivazioni del commerciale')}
    <ul style="font-size:14px;margin:0;padding-left:18px">${motivazioni.map(([chiave, t]) =>
      `<li><strong>${escapeHtml(domande.get(chiave) ?? chiave)}</strong><br>${escapeHtml(t)}</li>`).join('')}</ul>`
    : '';
  const senzaRisposta = p.motivazioniMancanti.map((c) => domande.get(c) ?? c);

  const prefiltro = `
    ${p.righe.length ? `<div style="margin:16px 0 0">${elenco(p.righe)}</div>` : ''}
    ${p.criteri.length ? `${h3('Criteri del prefiltro')}${elenco(p.criteri.map((cr) => `${cr.nome}: ${cr.valore} (${ESITO_CRITERIO[String(cr.ok)]})`))}` : ''}
    ${senzaRisposta.length ? `${h3('Motivazioni non scritte')}${elenco(senzaRisposta)}` : ''}
    <p style="font-size:13px;color:#787782;margin:12px 0 0">Valutazione indicativa, non è una delibera.</p>`;

  const documenti = `
    ${h3(`Documenti caricati (${o.documenti.length})`)}
    ${o.documenti.length ? elenco(o.documenti.map((d) => `${d.voce}: ${d.nome}`)) : '<p style="font-size:14px;margin:0">Nessuno.</p>'}
    ${o.mancanti.obbligatori.length || o.mancanti.facoltativi.length
      ? `${h3('Documenti che mancano')}${elenco([
        ...o.mancanti.obbligatori.map((m) => `${m} (obbligatorio)`),
        ...o.mancanti.facoltativi,
      ])}`
      : ''}`;

  const locatore = o.locatore === 'allegata'
    ? 'La proposta per il locatore è in allegato, solo per MCF: porta la riga servizi e non va al cliente.'
    : o.locatore === 'illeggibile'
      ? "La proposta per il locatore non si è potuta leggere dall'archivio: scaricala dal Pannello MCF."
      : o.propostaId
        ? `La proposta per il locatore non risulta salvata con la proposta ${o.propostaId}.`
        : 'Nessuna proposta per il locatore: la segnalazione non ha una proposta.';

  const tipo = o.segnalazione ? 'Segnalazione' : 'Pratica';
  const subject = `${tipo} ${k.nome} — ${cliente.ragioneSociale} — ${eur(o.totale, 0)}`;
  const html = layoutMail(o.segnalazione ? 'Segnalazione dal portale' : 'Nuova pratica dal portale', `
      ${o.segnalazione ? `<p style="background:#FDECEA;color:#8A2D0E;font-weight:700;font-size:15px;padding:10px 12px;margin:0 0 16px">${escapeHtml(TESTA_SEGNALAZIONE[o.segnalazione])}</p>` : ''}
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(k.nome)}${k.demo ? ' (dimostrativo)' : ''} — ${o.segnalazione ? 'segnalazione' : 'pratica'} ${escapeHtml(o.id)}<br>
        Caricata da ${escapeHtml(agente.nome || agente.email)} (${escapeHtml(agente.email)})
      </p>
      ${tabella}
      ${distinta}
      ${bloccoMotivazioni}
      ${prefiltro}
      ${documenti}
      <p style="font-size:13px;color:#787782;margin:16px 0 0">${escapeHtml(locatore)}</p>
      ${o.link ? `<p style="margin:22px 0 0"><a href="${escapeHtml(o.link)}" style="color:#664CCD">Apri il portale</a> per i documenti e lo stato.</p>` : ''}
    `);
  return { subject, html };
}

// --- I/O ---------------------------------------------------------------------------

/**
 * La proposta, se l'utente la puo' vedere ed e' del fornitore, dello stesso cliente e
 * della stessa verifica: una proposta fatta su un'altra verifica dello stesso cliente
 * non vale, perche' prefiltro e segnali sono quelli di questa.
 */
async function propostaVisibile(e: Sessione, id: string, ricerca: RicercaSalvata): Promise<PropostaSalvata | null> {
  const { where, valori } = filtroVisibilita(e, '', 5);
  return queryUna<PropostaSalvata>(
    `SELECT id, dati, numeri, canale, riservato FROM app.proposta
      WHERE id = $1 AND fornitore_slug = $2 AND piva = $3 AND ricerca_id = $4 AND ${where}`,
    [id, e.carrozzeria.slug, ricerca.piva, ricerca.id, ...valori],
  );
}

/**
 * Gli eventi all'invio. Se la verifica e' ancora aperta e il giro in background e'
 * finito (serveControllo), l'esito si legge una volta su Openapi come quando si riapre
 * la ricerca: riprendiEventi lo salva sulla ricerca e, se arriva il rosso dopo la mail
 * della verifica, manda a MCF l'aggiornamento. Nessuna verifica nuova a pagamento. Poi
 * conta il registro, che puo' essere stato chiuso da un altro strumento. Una lettura
 * che fallisce non ferma la pratica: si va avanti con quello che c'e'.
 */
async function eventiAllInvio(e: Sessione, ricerca: RicercaSalvata, segnali: SegnaliPrefiltro): Promise<StatoEventi> {
  let ev: EventiRicerca | null = ricerca.eventi;
  if (ev && serveControllo(ev)) {
    const { scheda, dati } = ricerca.dati_credito;
    const mail: DatiMailVerifica = {
      fornitore: e.carrozzeria.nome,
      agente: { nome: e.contesto.nome ?? '', email: e.contesto.email },
      scheda,
      dati,
      nuova: { scheda: false, eventi: !ev.daRegistro },
      prefiltro: { segnali },
    };
    const aperta = ev;
    ev = await riprendiEventi(e.carrozzeria, ricerca.id, aperta, mail).catch((err) => {
      console.error(JSON.stringify({ evento: 'motore_pratica_eventi_errore', fornitore: e.carrozzeria.slug, ricercaId: ricerca.id, msg: String(err) }));
      return aperta;
    });
  }
  const registro = await leggiVerifica(codiceVerifica(ricerca)).catch(() => null);
  return statoEventiInvio(ev?.stato ?? null, decidiVerifica(registro, 'negativita'));
}

/**
 * La proposta per il locatore da allegare alla mail, letta dalla cartella riservata
 * del fornitore. Se non si legge la mail parte lo stesso e lo dice.
 */
async function allegatoLocatore(
  slug: string,
  riservato: RiservatoProposta | null,
): Promise<{ stato: InputMailPratica['locatore']; allegato: Allegato | null }> {
  const doc = riservato?.documenti?.find((d) => typeof d?.pathname === 'string' && d.pathname !== '');
  if (!doc) return { stato: 'assente', allegato: null };
  const illeggibile = { stato: 'illeggibile' as const, allegato: null };
  // Solo dalla cartella riservata di questo fornitore, anche se il percorso viene dal database
  if (percorsoConsentito(doc.pathname, slug, true) !== 'riservato') return illeggibile;
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return illeggibile;
  try {
    const r = await get(doc.pathname, { access: 'private', token });
    if (!r?.stream) return illeggibile;
    const contenuto = Buffer.from(await new Response(r.stream).arrayBuffer());
    if (contenuto.length === 0) return illeggibile;
    const filename = doc.nome || doc.pathname.split('/').pop() || 'proposta-locatore.pdf';
    return { stato: 'allegata', allegato: { filename, content: contenuto.toString('base64') } };
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_pratica_locatore_errore', pathname: doc.pathname, msg: String(err) }));
    return illeggibile;
  }
}

// --- la pratica ----------------------------------------------------------------------

/** Quello che la pratica porta della distinta: dalla proposta salvata o, nella segnalazione senza proposta, dal corpo */
interface Contenuto {
  righe: RigaDistinta[];
  totale: number;
  consegna: Consegna;
  motivazioni: Record<string, string>;
  ledwallConfermato: boolean;
  vendita: DatiVendita | null;
  canale: IdCanale | null;
  riservato: RiservatoProposta | null;
  durata: number | null;
  /** Il prefiltro col dettaglio della distinta, per la mail a MCF */
  prefiltro: EsitoPrefiltro;
}

/**
 * Crea la pratica (o la segnalazione) di distinta. Vedi l'intestazione del file per le
 * regole. `oggi` decide anni di attivita', scadenze del catalogo e canale, e serve ai
 * test; la finestra della pratica recente si conta dalla verifica, non da oggi.
 */
export async function creaPraticaDistinta(
  e: Sessione,
  corpo: Record<string, unknown>,
  oggi: Date = new Date(),
): Promise<EsitoPraticaDistinta> {
  const { contesto, carrozzeria: k } = e;
  const categorie = k.categorie ?? [];
  const config = k.checklist;
  if (!config) {
    console.error(JSON.stringify({ evento: 'motore_pratica_distinta_configurazione', fornitore: k.slug, manca: 'checklist' }));
    return no(500, 'configurazione_mancante');
  }

  // 1. la ricerca visibile
  const ricerca = await ricercaVisibile(e, testo(corpo.ricercaId, 60));
  if (!ricerca) return no(404, 'ricerca_non_trovata');
  const { dati, scheda } = ricerca.dati_credito;

  // 2. la proposta, se indicata: visibile, dello stesso cliente e del fornitore
  const propostaId = testo(corpo.propostaId, 60);
  const proposta = propostaId ? await propostaVisibile(e, propostaId, ricerca) : null;
  const propostaValida = propostaUsabile(proposta);

  // 3. segnali riletti (MCF puo' aver segnato il cliente dopo la verifica) e salvati;
  // la pratica recente conta fino al momento della verifica (Ruling 11). Eventi aggiornati.
  const verifica = new Date(ricerca.creato ?? Date.now());
  const prima = Number.isNaN(verifica.getTime()) ? new Date() : verifica;
  const segnali = unisciSegnali(await segnaliPrefiltro(ricerca.piva, prima), ricerca.segnali ?? null);
  await salvaSegnali(ricerca.id, segnali);
  const eventi = await eventiAllInvio(e, ricerca, segnali);
  const aggiornata: RicercaSalvata = {
    ...ricerca,
    segnali,
    eventi: { ...(ricerca.eventi ?? eventiNonAvviati(ricerca.piva)), stato: eventi },
  };

  // 4. il prefiltro sul cliente, senza distinta: e' li' che nascono rosso e bloccato
  const prefiltro = valutaPrefiltro(datiPrefiltro(dati), segnali, eventi, categorie, null, oggi);
  const segnalazioneChiesta = corpo.segnalazione === true;

  // Senza proposta la distinta del corpo serve solo a una segnalazione: sul rosso, o
  // quando il commerciale la chiede perche' nessun canale regge. In quel caso il
  // canale si rifa' qui: il browser non si crede.
  const serveCorpo = !propostaValida && prefiltro.semaforo !== 'bloccato'
    && (prefiltro.semaforo === 'rosso' || segnalazioneChiesta);
  const dalCorpo = serveCorpo ? componiCalcolo(aggiornata, k, await catalogo(k.slug), corpo, oggi) : null;
  const instradamentoCorpo = dalCorpo?.ok
    ? instrada(k.canali ?? [], clienteInstradamento(dati), dalCorpo.calcolo.distinta.totale, oggi)
    : null;

  const decisione = decidiInvio({
    semaforo: prefiltro.semaforo,
    propostaValida,
    segnalazioneChiesta,
    nessunCanale: Boolean(dalCorpo?.ok) && instradamentoCorpo === null,
    propostaIndicata: propostaId !== '',
  });
  if (decisione.tipo === 'rifiuto') {
    if (decisione.error === 'cliente_bloccato') return no(403, decisione.error);
    // Segnalazione chiesta su una distinta che non regge: si dice cosa non va nella
    // distinta, non che manca la proposta
    if (dalCorpo && !dalCorpo.ok) return no(400, dalCorpo.error, undefined, dalCorpo.riga);
    return no(400, decisione.error);
  }
  const segnalazione = decisione.tipo === 'segnalazione';
  const motivo: MotivoSegnalazione | null = !segnalazione ? null : prefiltro.semaforo === 'rosso' ? 'rosso' : 'nessun_canale';
  // Una pratica normale parte solo dalla proposta di vendita: il solo canone non basta.
  // Sulla segnalazione la proposta resta facoltativa e puo' essere quella col solo canone.
  if (!segnalazione && !propostaCompleta(proposta)) return no(400, 'proposta_senza_vendita');

  // 5. importo, righe, canale e dati di vendita dalla proposta; senza proposta dal corpo
  let c: Contenuto;
  if (propostaValida) {
    const d = proposta.dati;
    const righe = d.righe.map((r) => ({ ...r }));
    const consegna: Consegna = { tipo: d.consegna?.tipo ?? 'altro', indirizzo: testo(d.consegna?.indirizzo, 200) };
    const motivazioni = { ...oggetto(d.motivazioni) } as Record<string, string>;
    const ledwallConfermato = d.ledwallConfermato === true;
    const perPrefiltro: DistintaPrefiltro = {
      righe: righe.map((r) => ({ categoria: r.categoria, quantita: r.quantita })),
      consegna: consegna.tipo,
      ledwallConfermato,
      motivazioni,
    };
    c = {
      righe,
      totale: totaleRighe(righe),
      consegna,
      motivazioni,
      ledwallConfermato,
      vendita: d.vendita ?? null,
      canale: proposta.canale,
      riservato: proposta.riservato,
      durata: durataDellaProposta(proposta.numeri, corpo.durata),
      prefiltro: valutaPrefiltro(datiPrefiltro(dati), segnali, eventi, categorie, perPrefiltro, oggi),
    };
  } else {
    if (!dalCorpo) return no(400, 'proposta_mancante');
    if (!dalCorpo.ok) return no(400, dalCorpo.error, undefined, dalCorpo.riga);
    const calcolo = dalCorpo.calcolo;
    c = {
      righe: calcolo.distinta.righe,
      totale: calcolo.distinta.totale,
      consegna: calcolo.consegna,
      motivazioni: calcolo.motivazioni,
      ledwallConfermato: calcolo.ledwallConfermato,
      vendita: calcolo.datiVendita,
      canale: null,
      riservato: null,
      durata: null,
      prefiltro: calcolo.prefiltro,
    };
  }
  if (!c.consegna.indirizzo) return no(400, 'consegna_mancante', MESSAGGI[propostaValida ? 'consegna_proposta' : 'consegna_corpo']);

  // 6. la forma che decide la checklist viene dal Registro, non dal browser
  const classe = classeForma(dati.formaCodice);
  const voci = vociChecklist(config, classe, c.totale);

  // 7. cellulare, email e IBAN obbligatori (regola del 16/10/2026), precompilati dalla proposta
  const ref = oggetto(corpo.referente);
  const v = c.vendita;
  const cliente = controllaDatiCliente({
    telefono: testo(ref.telefono, 40) || v?.telefono,
    email: testo(ref.email, 160) || v?.email,
    iban: testo(corpo.iban, 60) || v?.iban,
  });
  if (!cliente.ok) return no(400, cliente.errore, cliente.messaggio);
  const referente = {
    nome: testo(ref.nome, 120) || v?.amministratore.nome || '',
    telefono: testo(cliente.telefono, 40),
    email: testo(cliente.email, 160),
  };

  // 8. i documenti della bozza, solo quelli caricati sotto una voce di questo cliente
  const bozza = testo(corpo.bozza, 40);
  if (!bozzaValida(bozza)) return no(400, 'bozza_non_valida');
  const nomiVoci = new Set(voci.map((x) => x.nome));
  const documenti = documentiDellaBozza(k.slug, bozza, corpo.documenti)
    .filter((d): d is DocumentoVoce => typeof d.voce === 'string' && nomiVoci.has(d.voce));

  // 9. le voci obbligatorie fermano l'invio; le altre possono arrivare dopo
  const mancanti = documentiMancanti(voci, documenti, segnalazione);
  if (mancanti.obbligatori.length) {
    return no(400, 'documenti_mancanti', `Per inviare ${segnalazione ? 'la segnalazione' : 'la pratica'} mancano: ${mancanti.obbligatori.join('; ')}.`);
  }

  // 10. verifica eventi all'invio come per gli altri fornitori: dal registro, non si ripaga
  const negativita = await negativitaAllInvio(e, codiceVerifica(ricerca));

  // 11. la pratica, con canale e riservato copiati dalla proposta (solo MCF)
  const adesso = new Date().toISOString();
  const datiPratica = {
    prodotto: 'noleggio',
    durata: c.durata,
    formaGiuridica: FORMA_PRATICA[classe],
    classeForma: classe,
    referente,
    iban: cliente.iban,
    note: testo(corpo.note, 2000),
    checklist: voci.map((x) => x.nome),
    mancanti: mancanti.facoltativi,
    bozza,
    segnalazione,
    motivoSegnalazione: motivo,
    // Il colore con le regole sulla distinta: rosso e bloccato sono gli stessi del
    // prefiltro sul cliente, il giallo puo' venire anche dalla distinta (consegna, addetti)
    semaforo: c.prefiltro.semaforo,
    eventi,
    righe: c.righe,
    consegna: c.consegna,
    motivazioni: c.motivazioni,
    ledwallConfermato: c.ledwallConfermato,
    vendita: c.vendita,
  };
  const storia = [{ a: 'ricevuta', chi: contesto.nome || contesto.email, quando: adesso }];
  const clienteNome = scheda.ragioneSociale || ricerca.ragione_sociale || 'Cliente';

  // Sulla segnalazione nessun canale (vedi l'intestazione); i dati della proposta restano a MCF
  const canalePratica = segnalazione ? null : c.canale;
  const riservatoPratica = c.riservato && segnalazione ? { ...c.riservato, canaleProposta: c.canale } : c.riservato;

  const idBase = generaId(k.prefisso, 'P');
  let id = '';
  for (let t = 0; t < 4 && !id; t++) {
    const prova = t ? `${idBase}-${t + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.pratica (id, fornitore_slug, organization_id, user_id, proposta_id, piva, cliente_nome,
                                importo, dati, documenti, negativita, storia, canale, riservato)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [prova, k.slug, contesto.organizationId, contesto.userId, propostaValida ? proposta.id : null, ricerca.piva,
       clienteNome, c.totale, JSON.stringify(datiPratica), JSON.stringify(documenti), JSON.stringify(negativita),
       JSON.stringify(storia), canalePratica, riservatoPratica ? JSON.stringify(riservatoPratica) : null],
    );
    if (righe.length) id = prova;
  }
  if (!id) throw new Error('id_pratica_occupato');

  // 12. la mail a MCF, con la proposta per il locatore in allegato. Una mail persa non
  // annulla la pratica, che e' gia' salvata.
  let mailOk = false;
  try {
    const locatore = await allegatoLocatore(k.slug, c.riservato);
    const m = corpoMailPratica({
      k: { nome: k.nome, demo: k.demo },
      agente: { nome: contesto.nome ?? '', email: contesto.email },
      id,
      segnalazione: motivo,
      cliente: { ragioneSociale: clienteNome, piva: scheda.piva || ricerca.piva, rating: scheda.rating },
      forma: classe,
      referente,
      iban: cliente.iban,
      durata: c.durata,
      note: datiPratica.note,
      propostaId: propostaValida ? proposta.id : null,
      righe: c.righe,
      totale: c.totale,
      riservato: c.riservato,
      canaleIndicativo: !c.riservato && instradamentoCorpo
        ? {
          canale: instradamentoCorpo.canale,
          beni: instradamentoCorpo.beni,
          maggiorazione: instradamentoCorpo.maggiorazione,
          imponibile: instradamentoCorpo.imponibile,
        }
        : null,
      prefiltro: c.prefiltro,
      segnali,
      motivazioni: c.motivazioni,
      conLedwall: conLedwall(c.righe, categorie),
      ledwallConfermato: c.ledwallConfermato,
      consegna: c.consegna,
      documenti,
      mancanti,
      negativita,
      locatore: locatore.stato,
      link: `${BASE_URL}${percorsoPortale(k.slug)}`,
    });
    const esito = await inviaMail({
      to: DESTINATARIO_MCF,
      subject: m.subject,
      html: m.html,
      allegati: locatore.allegato ? [locatore.allegato] : [],
    });
    mailOk = esito.ok;
    if (!esito.ok) console.error(JSON.stringify({ evento: 'motore_pratica_mail_errore', id, msg: esito.err }));
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_pratica_mail_errore', id, msg: String(err) }));
  }

  console.log(JSON.stringify({
    evento: 'motore_pratica_distinta',
    fornitore: k.slug,
    id,
    userId: contesto.userId,
    beni: c.totale,
    semaforo: c.prefiltro.semaforo,
    segnalazione: motivo,
    proposta: propostaValida,
    documenti: documenti.length,
    mancanti: mancanti.facoltativi.length,
    negativita: (negativita as any).daRegistro ? 'registro' : negativita.id ? 'avviata' : `saltata_${(negativita as any).saltata}`,
    mail_ok: mailOk,
  }));
  return { ok: true, id, segnalazione };
}
