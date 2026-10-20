// Il preventivo della proposta di distinta (settore "distinta", oggi Led Office):
// salva la proposta, genera i PDF, tiene la proposta per il locatore dove arriva solo
// MCF e avvisa MCF. Spec mcf_spec-ledoffice-motore_v1, paragrafi 4 e 8.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Numeri e PDF escono dal calcolo dello schermo (CalcoloDistinta): non c'e' un secondo
// conto. Cosa va dove:
//  - `dati` e `numeri` di app.proposta li rileggono storico e pratiche anche per
//    referente e agente: dentro ci sono solo i beni del commerciale e la vista dello
//    schermo (distintaPerSchermo). Mai canale, maggiorazione, imponibile;
//  - `canale` e `riservato` (canale, beni, maggiorazione, imponibile e il percorso
//    della proposta per il locatore) li legge solo l'admin MCF;
//  - `documenti` sono i soli PDF del commerciale: preventivo del canone e, coi dati di
//    vendita, proposta di vendita. La proposta per il locatore sta nella cartella
//    riservata (percorso-riservato.ts) e /api/motore/doc la consegna solo all'admin;
//  - la mail a MCF porta tutto: canale, importi, segnali del prefiltro e i tre PDF.
//
// Se il salvataggio dei PDF fallisce in parte la proposta resta (come sugli altri
// settori): pdf_pronti falso e la mail parte lo stesso, con gli allegati e l'avviso.

import { randomBytes } from 'node:crypto';
import { put } from '@vercel/blob';
import { logoDaBlob } from '../brand-fornitore';
import { env, query } from '../db';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from '../mail-portale';
import { salvaPdf } from '../preventivi-pv';
import { distintaPerSchermo, type CalcoloDistinta, type Consegna, type DistintaSchermo } from './calcolo-distinta';
import type { Carrozzeria } from './carrozzeria';
import type { IdCanale } from './config-distinta';
import type { DatiVendita } from './dati-vendita';
import type { Distinta, RigaDistinta } from './distinta';
import { FONTE_PRATICA } from './mail-verifica';
import { euro } from './pdf-generico';
import { documentiLedOffice } from './pdf-ledoffice';
import { nomeNonIndovinabile, percorsoRiservato } from './percorso-riservato';
import type { EsitoPreventivo } from './preventivo';
import { generaId, type EsitoMotore } from './sessione';

export { percorsoRiservato } from './percorso-riservato';

type Sessione = Extract<EsitoMotore, { ok: true }>;
type Pdf = { filename: string; contenuto: string };
type Documento = { nome: string; pathname: string };

/** Il blocco di app.proposta.riservato: solo admin MCF */
export interface RiservatoProposta {
  canale: IdCanale;
  beni: number;
  maggiorazione: number;
  imponibile: number;
  /** Il percorso della proposta per il locatore, quando c'e' e si e' salvata */
  documenti: Documento[];
}

/**
 * Canale, importi e percorso della proposta per il locatore: quello che di una
 * proposta vede solo MCF. Senza instradamento non c'e' niente da riservare, e il
 * chiamante non ci arriva (la proposta e' bloccata prima).
 */
export function riservatoProposta(c: CalcoloDistinta, locatore: Documento | null): RiservatoProposta {
  const i = c.instradamento;
  if (!i) throw new Error('proposta riservata senza instradamento');
  return {
    canale: i.canale,
    beni: i.beni,
    maggiorazione: i.maggiorazione,
    imponibile: i.imponibile,
    documenti: locatore ? [{ nome: locatore.nome, pathname: locatore.pathname }] : [],
  };
}

/** La descrizione dello storico: "2 righe, <primo bene> e altri", oppure "1 riga, <bene>" */
export function descrizioneDistinta(d: Pick<Distinta, 'righe'>): string {
  const n = d.righe.length;
  const primo = d.righe[0]?.descrizione ?? '';
  if (n === 0) return 'Distinta vuota';
  return n === 1 ? `1 riga, ${primo}` : `${n} righe, ${primo} e altri`;
}

export interface NumeriProposta extends DistintaSchermo {
  scelta: { durata: number | null; canone: number | null };
}

/**
 * `numeri` di app.proposta: lo schermo del commerciale (distintaPerSchermo) e la scelta
 * che lo storico mostra. La durata della scelta e' quella in evidenza: 60 mesi se il
 * listino la quota, altrimenti la piu' lunga disponibile (stessa regola dello schermo
 * e del preventivo del canone); il canone e' quello di quella durata.
 */
export function numeriProposta(c: CalcoloDistinta): NumeriProposta {
  const schermo = distintaPerSchermo(c);
  const durata = schermo.durataEvidenza ?? null;
  const rata = durata === null ? undefined : schermo.rate?.find((r) => r.durata === durata);
  return { ...schermo, scelta: { durata, canone: rata?.canone ?? null } };
}

export interface DatiProposta {
  righe: RigaDistinta[];
  consegna: Consegna;
  motivazioni: Record<string, string>;
  ledwallConfermato: boolean;
  /** Null se il commerciale non li ha completati: allora non c'e' la proposta di vendita */
  vendita: DatiVendita | null;
}

/**
 * `dati` di app.proposta: la distinta come l'ha validata il server, per rifare lo
 * stesso conto e per la pratica. Delle motivazioni si tengono solo quelle che il
 * prefiltro chiede e che non risultano mancanti: le altre non si salvano.
 */
export function datiProposta(c: CalcoloDistinta): DatiProposta {
  const richieste = new Set<string>(c.prefiltro.motivazioniRichieste.map((m) => m.chiave));
  const mancanti = new Set(c.prefiltro.motivazioniMancanti);
  const motivazioni: Record<string, string> = {};
  for (const [chiave, testo] of Object.entries(c.motivazioni)) {
    if (richieste.has(chiave) && !mancanti.has(chiave)) motivazioni[chiave] = testo;
  }
  return {
    righe: c.distinta.righe.map((r) => ({ ...r })),
    consegna: { tipo: c.consegna.tipo, indirizzo: c.consegna.indirizzo },
    motivazioni,
    ledwallConfermato: c.ledwallConfermato,
    vendita: c.datiVendita,
  };
}

// --- mail a MCF --------------------------------------------------------------

const NOMI_CANALE: Record<IdCanale, string> = { econocom: 'Econocom', grenke: 'Grenke', pagarent: 'Pagarent' };
const TIPO_CONSEGNA: Record<Consegna['tipo'], string> = {
  sede: 'sede legale',
  unita: 'unità locale',
  altro: 'altro indirizzo',
};

/** AAAA-MM-GG -> GG/MM/AAAA */
const dataIt = (iso: string) => iso.split('-').reverse().join('/');

/**
 * La proposta per il locatore rispetto agli allegati della mail: allegata (il PDF e'
 * uscito, anche se l'archivio non l'ha preso), non generata (mancano i dati di vendita
 * o l'indirizzo di consegna, quindi esce solo il preventivo del canone), oppure
 * nessun PDF perche' la generazione e' fallita.
 */
export type LocatoreInMail = 'allegata' | 'non-generate' | 'errore';

/** La riga in coda alla mail: dice cosa e' allegato davvero, e la riga servizi solo se c'e' */
function rigaLocatore(c: CalcoloDistinta, stato: LocatoreInMail): string {
  if (stato === 'errore') return 'Nessun PDF in allegato: la generazione non è riuscita, quindi manca anche la proposta per il locatore.';
  if (stato === 'non-generate') {
    const perche = c.datiVendita ? "manca l'indirizzo di consegna" : 'mancano i dati per la proposta di vendita';
    return `Proposta di vendita e proposta per il locatore non generate: ${perche}. In allegato solo il preventivo del canone.`;
  }
  return (c.instradamento?.maggiorazione ?? 0) > 0
    ? 'La proposta per il locatore allegata è solo per MCF: porta la riga servizi e non va al cliente.'
    : 'La proposta per il locatore allegata è solo per MCF e non va al cliente.';
}

/**
 * La mail a MCF per una proposta di distinta: canale, beni, maggiorazione e
 * imponibile, la distinta con listino e prezzo trattato, motivazioni, criteri e segnali
 * del prefiltro (segnalazione di MCF, pratica recente con data, canale e fornitore).
 * Pura: si prova senza mandare niente. `avviso` dice cosa non e' andato coi PDF,
 * `locatore` se la proposta per il locatore e' fra gli allegati.
 */
export function corpoMailDistinta(o: {
  k: Pick<Carrozzeria, 'nome' | 'demo'>;
  agente: { nome: string; email: string };
  c: CalcoloDistinta;
  id: string;
  avviso: string | null;
  locatore: LocatoreInMail;
}): { subject: string; html: string } {
  const { k, agente, c, id } = o;
  const i = c.instradamento;
  const p = c.prefiltro;
  const scheda = c.ricerca.dati_credito.scheda;
  const cliente = scheda.ragioneSociale || c.ricerca.ragione_sociale || 'cliente senza nome';
  const piva = scheda.piva || c.ricerca.piva;
  const eur = (v: number, dec = 2) => `${euro(v, dec)} euro`;
  const riga = (et: string, val: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:200px;vertical-align:top"><strong>${escapeHtml(et)}</strong></td><td>${escapeHtml(val)}</td></tr>`;
  const scelta = numeriProposta(c).scelta;
  const segnali = c.ricerca.segnali;
  const recente = segnali?.praticaRecente ?? null;
  const motivazioni = datiProposta(c).motivazioni;

  const avvisiRata = [
    i?.daConfermare ? 'rata da confermare col locatore' : '',
    i?.richiedeProvvisorio ? "la pratica chiede il bilancio provvisorio dell'anno" : '',
  ].filter(Boolean).join('; ');

  const tabella = `
    <table style="font-size:14px;border-collapse:collapse;width:100%">
      ${riga('Cliente', `${cliente}, P.IVA ${piva}`)}
      ${riga('Prefiltro', `${p.etichetta}${p.provvisorio ? ', eventi negativi ancora in verifica' : ''}`)}
      ${i ? riga('Canale', NOMI_CANALE[i.canale] ?? i.canale) : riga('Canale', 'nessuno')}
      ${i ? riga('Beni', eur(i.beni)) : ''}
      ${i ? riga('Maggiorazione', i.maggiorazione > 0 ? eur(i.maggiorazione, 0) : 'nessuna') : ''}
      ${i ? riga('Imponibile', eur(i.imponibile)) : ''}
      ${scelta.durata !== null && scelta.canone !== null ? riga('Rata in evidenza', `${scelta.durata} mesi, ${eur(scelta.canone)} al mese`) : ''}
      ${i && i.rate.length ? riga('Rate', i.rate.map((r) => `${r.durata} mesi ${eur(r.canone)}`).join(' · ')) : ''}
      ${avvisiRata ? riga('Avvisi', avvisiRata) : ''}
      ${riga('Consegna', `${TIPO_CONSEGNA[c.consegna.tipo]}: ${c.consegna.indirizzo || 'non indicato'}`)}
      ${c.distinta.conLedwall ? riga('LEDwall', c.ledwallConfermato ? 'installazione fissa confermata dal commerciale' : 'spunta sull\'installazione mancante') : ''}
      ${riga('Proposta di vendita', c.datiVendita
        ? `dati completi${o.locatore === 'allegata' ? ', proposta allegata' : ', proposta non allegata'}`
        : `non compilata${c.venditaMancanti.length ? ` (mancano: ${c.venditaMancanti.join(', ')})` : ''}`)}
      ${segnali?.segnalato ? riga('Cliente segnalato', `${segnali.segnalato.motivo}, effetto ${segnali.segnalato.effetto}`) : ''}
      ${recente ? riga('Pratica recente', [
        dataIt(recente.data),
        recente.canale ?? 'canale non indicato',
        recente.fornitore ?? 'fornitore non indicato',
        FONTE_PRATICA[recente.fonte],
      ].join(', ')) : ''}
    </table>`;

  const cella = 'padding:4px 8px;border-bottom:1px solid #E1DEE3';
  const destra = `${cella};text-align:right;white-space:nowrap`;
  const righe = c.distinta.righe.map((r) => {
    const note = [
      r.codice ? r.codice : '',
      r.fuoriListino ? 'fuori listino' : '',
      r.scaduta ? 'prezzo da riconfermare' : '',
    ].filter(Boolean).join(', ');
    return `<tr>
      <td style="${cella}">${escapeHtml(r.descrizione)}${note ? `<br><span style="color:#787782;font-size:12px">${escapeHtml(note)}</span>` : ''}</td>
      <td style="${destra}">${r.quantita}</td>
      <td style="${destra}">${r.listino !== null ? euro(r.listino) : '-'}</td>
      <td style="${destra}">${euro(r.prezzo)}</td>
      <td style="${destra}">${euro(r.totale)}</td>
    </tr>`;
  }).join('');
  const distinta = `
    <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Distinta</h3>
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      <tr style="color:#787782">
        <th style="${cella};text-align:left">Bene</th><th style="${destra}">Q.tà</th>
        <th style="${destra}">Listino</th><th style="${destra}">Trattato</th><th style="${destra}">Totale</th>
      </tr>
      ${righe}
      <tr><td colspan="4" style="${cella}"><strong>Totale beni</strong></td><td style="${destra}"><strong>${euro(c.distinta.totale)}</strong></td></tr>
    </table>`;

  const domande = new Map<string, string>(p.motivazioniRichieste.map((m) => [m.chiave, m.testo]));
  const voci = Object.entries(motivazioni);
  const bloccoMotivazioni = voci.length
    ? `<h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Motivazioni del commerciale</h3>
    <ul style="font-size:14px;margin:0;padding-left:18px">${voci.map(([chiave, testo]) =>
      `<li><strong>${escapeHtml(domande.get(chiave) ?? chiave)}</strong><br>${escapeHtml(testo)}</li>`).join('')}</ul>`
    : '';

  const prefiltro = `
    ${p.righe.length ? `<ul style="font-size:14px;margin:16px 0 0;padding-left:18px">${p.righe.map((r) => `<li>${escapeHtml(r)}</li>`).join('')}</ul>` : ''}
    ${p.criteri.length ? `<h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Criteri del prefiltro</h3>
    <ul style="font-size:14px;margin:0;padding-left:18px">${p.criteri.map((cr) => `<li>${escapeHtml(cr.nome)}: ${escapeHtml(cr.valore)}</li>`).join('')}</ul>` : ''}
    <p style="font-size:13px;color:#787782;margin:12px 0 0">Valutazione indicativa, non è una delibera.</p>`;

  const subject = `${k.nome} — ${agente.nome || agente.email} — ${cliente} — ${eur(c.distinta.totale, 0)}`;
  const html = layoutMail('Nuova proposta dal portale', `
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(k.nome)}${k.demo ? ' (dimostrativo)' : ''} — proposta ${escapeHtml(id)}<br>
        Generata da ${escapeHtml(agente.nome || agente.email)} (${escapeHtml(agente.email)})
      </p>
      ${tabella}
      ${distinta}
      ${bloccoMotivazioni}
      ${prefiltro}
      ${o.avviso ? `<p style="font-size:14px;color:#8A2D0E;margin:16px 0 0">${escapeHtml(o.avviso)}</p>` : ''}
      <p style="font-size:13px;color:#787782;margin:16px 0 0">${escapeHtml(rigaLocatore(c, o.locatore))}</p>
    `);
  return { subject, html };
}

// --- salvataggio --------------------------------------------------------------

/**
 * La proposta per il locatore nella cartella riservata, sullo store privato. Non passa
 * da salvaPdf(), che scrive nella cartella dei documenti della proposta. Il nome sullo
 * store ha un pezzo casuale (nomeNonIndovinabile): il percorso vero resta solo nel
 * `riservato`, il nome leggibile va in `nome` e negli allegati. Null se lo store non
 * e' configurato o la scrittura fallisce.
 */
async function salvaRiservato(slug: string, id: string, pdf: Pdf): Promise<Documento | null> {
  const token = env('BLOB_READ_WRITE_TOKEN');
  if (!token) return null;
  const pathname = percorsoRiservato(slug, id, nomeNonIndovinabile(pdf.filename, randomBytes(8).toString('hex')));
  try {
    await put(pathname, Buffer.from(pdf.contenuto, 'base64'), {
      access: 'private',
      contentType: 'application/pdf',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      token,
    });
    return { nome: pdf.filename, pathname };
  } catch (err) {
    console.error(JSON.stringify({ evento: 'motore_pdf_riservato_errore', pathname, error: String(err) }));
    return null;
  }
}

/** Inserisce la proposta; se l'id del secondo e' gia' preso si aggiunge un suffisso */
async function salvaProposta(e: Sessione, c: CalcoloDistinta, idBase: string): Promise<string> {
  const { contesto, carrozzeria: k } = e;
  const scheda = c.ricerca.dati_credito.scheda;
  // Il riservato parte senza documenti: il percorso del locatore si scrive dopo il PDF
  const fisse = [
    k.slug, contesto.organizationId, contesto.userId, c.ricerca.id, c.ricerca.piva || scheda.piva,
    scheda.ragioneSociale || c.ricerca.ragione_sociale || 'Senza intestatario',
    null, descrizioneDistinta(c.distinta), c.distinta.totale, c.prefiltro.semaforo, 0, 0,
    JSON.stringify(datiProposta(c)), JSON.stringify(numeriProposta(c)),
    c.instradamento!.canale, JSON.stringify(riservatoProposta(c, null)),
  ];
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    const id = tentativo ? `${idBase}-${tentativo + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.proposta (id, fornitore_slug, organization_id, user_id, ricerca_id, piva, cliente_nome,
                                 voce_codice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri,
                                 canale, riservato)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, ...fisse],
    );
    if (righe.length) return id;
  }
  throw new Error('id_proposta_occupato');
}

/**
 * Salva la proposta di distinta, genera i PDF e avvisa MCF. Rifiuta con
 * proposta_bloccata quando il prefiltro blocca o nessun canale regge: in quel caso non
 * si scrive niente. Al commerciale tornano id, pdfPronti e i soli suoi PDF.
 * Il corpo grezzo della richiesta non si salva: tutto esce dal calcolo validato.
 */
export async function generaPreventivoDistinta(
  e: Sessione,
  c: CalcoloDistinta,
  _corpo: Record<string, unknown>,
): Promise<EsitoPreventivo> {
  if (c.prefiltro.bloccaProposta || !c.instradamento) return { ok: false, error: 'proposta_bloccata' };
  const k = e.carrozzeria;

  // Prima si riserva l'id con la riga, poi si generano i PDF nella sua cartella
  const id = await salvaProposta(e, c, generaId(k.prefisso));

  const [marchio, fornitrice] = await Promise.all([
    logoDaBlob(k.brand.logo),
    logoDaBlob(k.societaFornitrice?.logo ?? null),
  ]);
  let pdf: { cliente: Pdf[]; locatore: Pdf | null } = { cliente: [], locatore: null };
  let errore: string | undefined;
  try {
    pdf = documentiLedOffice(c, k, id, { fornitrice, marchio });
  } catch (err) {
    errore = 'generazione_pdf';
    console.error(JSON.stringify({ evento: 'motore_pdf_distinta_errore', fornitore: k.slug, id, error: String(err) }));
  }

  const salvati = pdf.cliente.length ? await salvaPdf(k.slug, id, pdf.cliente) : [];
  const locatore = pdf.locatore ? await salvaRiservato(k.slug, id, pdf.locatore) : null;
  const attesi = pdf.cliente.length + (pdf.locatore ? 1 : 0);
  const pdfPronti = attesi > 0 && salvati.length === pdf.cliente.length && (pdf.locatore === null || locatore !== null);
  const documenti = salvati.map((d) => ({ nome: d.nome, pathname: d.pathname }));
  await query(`UPDATE app.proposta SET documenti = $2, pdf_pronti = $3, riservato = $4 WHERE id = $1`, [
    id, JSON.stringify(documenti), pdfPronti, JSON.stringify(riservatoProposta(c, locatore)),
  ]);

  // Gli allegati sono i PDF generati, anche quando l'archivio non li ha presi tutti
  const allegati = pdf.locatore ? [...pdf.cliente, pdf.locatore] : pdf.cliente;
  const avviso = errore
    ? 'I PDF non sono stati generati: la proposta è salvata, i numeri restano validi.'
    : pdfPronti ? null
    : "I PDF non si sono salvati tutti nell'archivio: nello Storico possono mancare. Gli allegati sono completi.";
  const statoLocatore: LocatoreInMail = pdf.locatore ? 'allegata' : errore ? 'errore' : 'non-generate';
  const m = corpoMailDistinta({
    k, agente: { nome: e.contesto.nome ?? '', email: e.contesto.email }, c, id, avviso, locatore: statoLocatore,
  });
  const mail = await inviaMail({
    to: DESTINATARIO_MCF,
    subject: m.subject,
    html: m.html,
    allegati: allegati.map((f) => ({ filename: f.filename, content: f.contenuto })),
  });

  console.log(JSON.stringify({
    evento: 'motore_preventivo_distinta',
    fornitore: k.slug,
    id,
    userId: e.contesto.userId,
    beni: c.distinta.totale,
    semaforo: c.prefiltro.semaforo,
    canale: c.instradamento.canale,
    pdf_ok: pdfPronti,
    pdf_err: errore ?? (pdfPronti ? undefined : 'salvataggio_pdf'),
    mail_ok: mail.ok,
  }));

  return { ok: true, id, pdfPronti, documenti };
}
