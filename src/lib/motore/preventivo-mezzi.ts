// Il preventivo del settore mezzi (Bergamelli): salva la proposta, genera i PDF, avvisa MCF.
// Spec mcf_spec-bergamelli-motore_v2, sezioni 3, 5 e 6.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Numeri e PDF escono dal calcolo dello schermo (CalcoloMezzi): non c'e' un secondo
// conto. Cosa va dove:
//  - `numeri` di app.proposta e' lo schermo (mezziPerSchermo) con i nomi che la
//    configurazione consente, piu' la `scelta` (durata, canone, rata del leasing nel
//    PDF) che lo Storico e la pratica leggono: lo rileggono anche referente e agente,
//    quindi niente che lo schermo nasconde;
//  - `dati` rifa' lo stesso conto e serve alla pratica. La mappa colonna -> partner
//    (A, B, C -> sella, credem, alba) sta SOLO li': e' server-side, non esce mai;
//  - `canale` e' la colonna riservata all'admin MCF (Grenke, Econocom o null);
//  - i PDF sono due: il preventivo di noleggio intestato al venditore (se un canale
//    quota) e il prospetto di leasing a marchio MCF di UN partner, quello che l'agente
//    sceglie con `leasingPdf` (A, B o C) o, senza scelta, la rata piu' bassa;
//  - la mail porta tutto: canale, nomi dei partner, spread e provvigione. E' per MCF
//    (DESTINATARIO_MCF) e per nessun altro. La risposta all'agente invece e' sempre
//    { ok, id, pdfPronti, documenti }.
//
// Il rosso del semaforo non blocca: la riga si salva col suo colore, i PDF escono. Una
// simulazione (calcolo senza ricerca) non si salva mai.

import { calcolaProvvigione, PARTNERS_LEASING } from '../../data/leasing';
import { query } from '../db';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from '../mail-portale';
import { salvaPdf } from '../preventivi-pv';
import type { BeneMezzo } from './beni-mezzi';
import { chiaveColonna, mezziPerSchermo, type CalcoloMezzi, type MezziSchermo } from './calcolo-mezzi';
import type { RicercaSalvata } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import { condizioneDaSpread, type PartnerConfronto } from './config-mezzi';
import { DURATA_EVIDENZA } from './instradamento';
import { spreadPerDurata, type LeasingDelPartner } from './leasing-confronto';
import { nomeCanale } from './nomi-canale';
import { euro } from './pdf-generico';
import { documentiMezzi } from './pdf-mezzi';
import type { EsitoPreventivo } from './preventivo';
import { generaId, type EsitoMotore } from './sessione';
import type { Valutazione } from './valutazione';

type Sessione = Extract<EsitoMotore, { ok: true }>;
type Pdf = { filename: string; contenuto: string };

/** La descrizione dello storico non va oltre questa lunghezza */
const MAX_DESCRIZIONE = 300;

// --- la colonna del leasing nel PDF -------------------------------------------

/**
 * Il partner di leasing che finisce nel PDF, come lettera della colonna (A, B, C).
 * Vale la chiave chiesta dall'agente se quella colonna ha righe; una chiave che non
 * c'e', non e' testo o e' di una colonna senza righe si ignora. Senza scelta vince la
 * rata piu' bassa a 60 mesi (DURATA_EVIDENZA) se tutte le colonne con righe la
 * quotano, altrimenti alla durata piu' lunga che hanno tutte in comune; a parita' di
 * rata resta la prima nell'ordine della configurazione. Senza nessuna durata in
 * comune si prende la prima colonna con righe. Null se nessun partner quota.
 */
export function chiavePerPdf(c: CalcoloMezzi, richiesta: unknown): string | null {
  const colonne = c.leasing
    .map((colonna, i) => ({ chiave: chiaveColonna(i), righe: colonna.righe }))
    .filter((x) => x.righe.length > 0);
  if (colonne.length === 0) return null;
  if (typeof richiesta === 'string' && colonne.some((x) => x.chiave === richiesta)) return richiesta;

  const comuni = colonne[0].righe
    .map((r) => r.durata)
    .filter((d) => colonne.every((x) => x.righe.some((r) => r.durata === d)));
  if (comuni.length === 0) return colonne[0].chiave;
  const durata = comuni.includes(DURATA_EVIDENZA) ? DURATA_EVIDENZA : Math.max(...comuni);

  const rata = (x: (typeof colonne)[number]) => x.righe.find((r) => r.durata === durata)!.rata;
  let migliore = colonne[0];
  for (const x of colonne.slice(1)) {
    // Strettamente minore: a parita' resta la prima nell'ordine della configurazione
    if (rata(x) < rata(migliore)) migliore = x;
  }
  return migliore.chiave;
}

// --- le forme salvate ---------------------------------------------------------

/** La descrizione dello storico: le descrizioni dei beni separate da " + " */
export function descrizioneMezzi(beni: BeneMezzo[]): string {
  return beni.map((b) => b.descrizione).join(' + ').slice(0, MAX_DESCRIZIONE);
}

/** `dati` di app.proposta: l'input validato dal server, per rifare lo stesso conto e per la pratica */
export interface DatiPropostaMezzi {
  beni: BeneMezzo[];
  /** Il codice del venditore che firma l'offerta */
  venditore: string;
  anticipoPerc: number;
  /** La colonna del leasing messa nel PDF; null se nessun partner quota */
  chiaveLeasing: string | null;
  /** Colonna -> partner. Solo server: lo schermo mostra A, B, C e basta */
  partner: Record<string, PartnerConfronto>;
}

export function datiPropostaMezzi(c: CalcoloMezzi, chiaveLeasing: string | null): DatiPropostaMezzi {
  const partner: Record<string, PartnerConfronto> = {};
  c.leasing.forEach((colonna, i) => {
    partner[chiaveColonna(i)] = colonna.partner;
  });
  return {
    beni: c.beni.map((b) => ({ ...b })),
    venditore: c.venditore.codice,
    anticipoPerc: c.anticipoPerc,
    chiaveLeasing,
    partner,
  };
}

/**
 * La scelta in evidenza di un preventivo: quello che lo Storico mostra (`numeri->'scelta'`)
 * e da cui la pratica propone la durata. La durata e' quella in evidenza dello schermo
 * (60 mesi se il noleggio la quota, altrimenti la piu' lunga), o 60 senza noleggio. Il
 * canone e' la rata del noleggio a quella durata; la rata del leasing e' quella della
 * colonna messa nel PDF (`chiaveLeasing`). Null dove manca la riga, mai un numero
 * inventato. Sono cifre che l'agente ha gia' a schermo: nessun nome, nessuno spread.
 */
export interface SceltaMezzi {
  durata: number;
  canone: number | null;
  rataLeasing: number | null;
}

export function sceltaMezzi(c: CalcoloMezzi, chiaveLeasing: string | null): SceltaMezzi {
  const noleggio = mezziPerSchermo(c, false).noleggio;
  const durata = noleggio?.durataEvidenza ?? DURATA_EVIDENZA;
  const canone = noleggio?.rate.find((r) => r.durata === durata)?.canone ?? null;
  const indice = chiaveLeasing === null ? -1 : c.leasing.findIndex((_, i) => chiaveColonna(i) === chiaveLeasing);
  const rataLeasing = indice < 0 ? null : (c.leasing[indice].righe.find((r) => r.durata === durata)?.rata ?? null);
  return { durata, canone, rataLeasing };
}

/**
 * `numeri` di app.proposta: quello che vede lo schermo, con i nomi dei partner solo se la
 * configurazione li mostra, e la `scelta` che lo Storico legge.
 */
export function numeriPropostaMezzi(
  c: CalcoloMezzi,
  k: Pick<Carrozzeria, 'mezzi'>,
  chiaveLeasing: string | null,
): MezziSchermo & { scelta: SceltaMezzi } {
  return { ...mezziPerSchermo(c, k.mezzi?.mostraNomiPartner === true), scelta: sceltaMezzi(c, chiaveLeasing) };
}

// --- spread e provvigione (solo per la mail a MCF) ----------------------------

/** Le durate di un partner che hanno lo stesso spread e la stessa provvigione */
export interface CondizioneUsata {
  durate: number[];
  /** In punti percentuali: 2,25 */
  spread: number;
  /** In percentuale dell'importo finanziato: 1,5 */
  provvigionePerc: number;
}

/**
 * Lo spread applicato a ogni durata di un partner e la provvigione che ne viene, in
 * percentuale dell'importo, con le durate consecutive che condividono la stessa coppia
 * messe insieme. Sella e Credem ne hanno una sola, Alba due (cambia a 60 mesi).
 * Solo MCF: lo spread e la provvigione non escono verso nessun altro. Un partner senza
 * righe non ha condizioni.
 */
export function condizioniUsate(k: Pick<Carrozzeria, 'mezzi'>, colonna: LeasingDelPartner, importo: number): CondizioneUsata[] {
  const cfg = k.mezzi?.leasing.partner.find((p) => p.partner === colonna.partner);
  const listino = PARTNERS_LEASING.find((p) => p.key === colonna.partner);
  if (!cfg || !listino || importo <= 0) return [];

  const gruppi: CondizioneUsata[] = [];
  for (const riga of colonna.righe) {
    const spread = spreadPerDurata(cfg, riga.durata);
    const condizione = condizioneDaSpread(listino, riga.durata, spread);
    if (!condizione) continue;
    const provvigionePerc = (calcolaProvvigione(condizione, importo) / importo) * 100;
    const ultimo = gruppi.at(-1);
    if (ultimo && ultimo.spread === spread && Math.abs(ultimo.provvigionePerc - provvigionePerc) < 1e-9) {
      ultimo.durate.push(riga.durata);
    } else {
      gruppi.push({ durate: [riga.durata], spread, provvigionePerc });
    }
  }
  return gruppi;
}

// --- la mail a MCF ------------------------------------------------------------

const perc = (n: number) => `${euro(n, 2)}%`;

/** Le durate come le legge MCF: "36 e 48 mesi", "60, 72 e 84 mesi" */
function durateInTesto(durate: number[]): string {
  if (durate.length <= 1) return `${durate[0]} mesi`;
  return `${durate.slice(0, -1).join(', ')} e ${durate.at(-1)} mesi`;
}

/**
 * La mail a MCF per un preventivo di mezzi: cliente, semaforo, venditore, i beni, il
 * noleggio col nome del canale e le rate, il leasing partner per partner con nome,
 * spread e provvigione, e la colonna messa nel PDF. Pura: si prova senza mandare
 * niente. `avviso` dice cosa non e' andato coi PDF; `chiave` e' la colonna del PDF.
 */
export function corpoMailMezzi(o: {
  k: Pick<Carrozzeria, 'nome' | 'demo' | 'mezzi'>;
  agente: { nome: string; email: string };
  c: CalcoloMezzi;
  id: string;
  chiave: string | null;
  avviso: string | null;
}): { subject: string; html: string } {
  const { k, agente, c, id, chiave } = o;
  const scheda = c.ricerca?.dati_credito.scheda;
  const cliente = scheda?.ragioneSociale || c.ricerca?.ragione_sociale || 'cliente senza nome';
  const piva = scheda?.piva || c.ricerca?.piva || '';
  const nomeAgente = agente.nome || agente.email;
  const eur = (v: number, dec = 2) => `${euro(v, dec)} euro`;
  const rateTesto = (rate: { durata: number; importo: number }[]) =>
    rate.map((r) => `${r.durata} mesi ${euro(r.importo)}`).join(' · ');

  const riga = (et: string, val: string, sub = '') =>
    `<tr><td style="padding:4px 12px 4px 0;width:200px;vertical-align:top"><strong>${escapeHtml(et)}</strong></td>` +
    `<td>${escapeHtml(val)}${sub ? `<br><span style="color:#787782;font-size:12px">${escapeHtml(sub)}</span>` : ''}</td></tr>`;

  const sem = c.valutazione
    ? `${c.valutazione.semaforo}${c.valutazione.locatore ? `, ${c.valutazione.locatore.etichetta}` : ''}`
    : 'nessuno, cliente non verificato';

  const noleggio = c.noleggio
    ? riga(
        'Noleggio',
        `${nomeCanale(c.noleggio.canale)}: ${rateTesto(c.noleggio.rate.map((r) => ({ durata: r.durata, importo: r.canone })))} (euro al mese)`,
        c.noleggio.daConfermare ? 'Rata da confermare col locatore.' : '',
      )
    : riga('Noleggio', c.motivoNoNoleggio ?? 'non disponibile');

  const indiceNelPdf = chiave === null ? -1 : c.leasing.findIndex((_, i) => chiaveColonna(i) === chiave);
  const nelPdf = indiceNelPdf >= 0
    ? `${c.leasing[indiceNelPdf].nome} (colonna ${chiave})`
    : 'nessun partner nel PDF: nessuno quota questo importo';

  const colonne = c.leasing.map((colonna, i) => {
    const titolo = `${colonna.nome} (colonna ${chiaveColonna(i)})${i === indiceNelPdf ? ', nel PDF' : ''}`;
    if (colonna.righe.length === 0) return riga(titolo, colonna.motivo ?? 'non quota');
    const condizioni = condizioniUsate(k, colonna, c.totale)
      .map((g) => `${durateInTesto(g.durate)}: spread ${perc(g.spread)}, provvigione ${perc(g.provvigionePerc)}`)
      .join('; ');
    return riga(titolo, `${rateTesto(colonna.righe.map((r) => ({ durata: r.durata, importo: r.rata })))} (euro al mese)`, condizioni);
  }).join('');

  const tabella = `
    <table style="font-size:14px;border-collapse:collapse;width:100%">
      ${riga('Cliente', `${cliente}, P.IVA ${piva}`)}
      ${riga('Semaforo', sem)}
      ${riga('Venditore', `${c.venditore.ragioneSociale} (${c.venditore.codice})`)}
      ${riga('Totale beni', eur(c.totale, Number.isInteger(c.totale) ? 0 : 2))}
      ${riga('Anticipo leasing', `${c.anticipoPerc}%`)}
      ${noleggio}
      ${riga('Leasing nel PDF', nelPdf)}
    </table>`;

  const cella = 'padding:4px 8px;border-bottom:1px solid #E1DEE3';
  const destra = `${cella};text-align:right;white-space:nowrap`;
  const beni = `
    <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Beni</h3>
    <table style="font-size:13px;border-collapse:collapse;width:100%">
      <tr style="color:#787782">
        <th style="${cella};text-align:left">Bene</th><th style="${destra}">Q.tà</th>
        <th style="${destra}">Prezzo</th><th style="${destra}">Totale</th>
      </tr>
      ${c.beni.map((b) => `<tr>
        <td style="${cella}">${escapeHtml(b.descrizione)}<br><span style="color:#787782;font-size:12px">${escapeHtml(b.categoria)}, ${b.targato ? 'targato' : 'non targato'}</span></td>
        <td style="${destra}">${b.quantita}</td>
        <td style="${destra}">${euro(b.prezzo)}</td>
        <td style="${destra}">${euro(b.totale)}</td>
      </tr>`).join('')}
      <tr><td colspan="3" style="${cella}"><strong>Totale beni</strong></td><td style="${destra}"><strong>${euro(c.totale)}</strong></td></tr>
    </table>`;

  const leasing = `
    <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Leasing: rate per partner</h3>
    <table style="font-size:14px;border-collapse:collapse;width:100%">${colonne}</table>`;

  const subject = `Preventivo ${k.nome} — ${c.venditore.ragioneSociale} — ${nomeAgente} — ${cliente} — ${eur(c.totale, Number.isInteger(c.totale) ? 0 : 2)}`;
  const html = layoutMail('Nuovo preventivo dal portale', `
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(k.nome)}${k.demo ? ' (dimostrativo)' : ''} — preventivo ${escapeHtml(id)}<br>
        Generato da ${escapeHtml(nomeAgente)} (${escapeHtml(agente.email)})
      </p>
      ${tabella}
      ${beni}
      ${leasing}
      ${o.avviso ? `<p style="font-size:14px;color:#8A2D0E;margin:16px 0 0">${escapeHtml(o.avviso)}</p>` : ''}
      <p style="font-size:13px;color:#787782;margin:16px 0 0">Valutazione indicativa, non è una delibera.</p>
    `);
  return { subject, html };
}

// --- salvataggio --------------------------------------------------------------

/** Inserisce la proposta; se l'id del secondo e' gia' preso si aggiunge un suffisso */
async function salvaProposta(
  e: Sessione,
  c: CalcoloMezzi,
  ricerca: RicercaSalvata,
  valutazione: Valutazione,
  chiave: string | null,
  idBase: string,
): Promise<string> {
  const { contesto, carrozzeria: k } = e;
  const scheda = ricerca.dati_credito.scheda;
  const fisse = [
    k.slug, contesto.organizationId, contesto.userId, ricerca.id, ricerca.piva || scheda.piva,
    scheda.ragioneSociale || ricerca.ragione_sociale || 'Senza intestatario',
    null, descrizioneMezzi(c.beni), c.totale, valutazione.semaforo, c.anticipoPerc, 0,
    JSON.stringify(datiPropostaMezzi(c, chiave)), JSON.stringify(numeriPropostaMezzi(c, k, chiave)),
    c.noleggio?.canale ?? null,
  ];
  for (let tentativo = 0; tentativo < 4; tentativo++) {
    const id = tentativo ? `${idBase}-${tentativo + 1}` : idBase;
    const righe = await query(
      `INSERT INTO app.proposta (id, fornitore_slug, organization_id, user_id, ricerca_id, piva, cliente_nome,
                                 voce_codice, descrizione, prezzo, semaforo, anticipo, markup, dati, numeri,
                                 canale)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16)
       ON CONFLICT (id) DO NOTHING RETURNING id`,
      [id, ...fisse],
    );
    if (righe.length) return id;
  }
  throw new Error('id_proposta_occupato');
}

/**
 * Salva il preventivo di mezzi, genera i PDF e avvisa MCF. Corpo: quello di
 * /api/motore/proposte piu' `leasingPdf` ('A' | 'B' | 'C'). Un calcolo senza ricerca
 * (la simulazione) non si salva: ricerca_non_trovata. All'agente tornano id, pdfPronti
 * e i soli PDF; il resto sta nella riga e nella mail.
 * Se i PDF non si generano o non si salvano tutti la proposta resta, pdf_pronti e' falso
 * e la mail parte lo stesso con gli allegati che ci sono, dicendolo.
 */
export async function generaPreventivoMezzi(
  e: Sessione,
  c: CalcoloMezzi,
  corpo: Record<string, unknown>,
): Promise<EsitoPreventivo> {
  const { ricerca, valutazione } = c;
  if (!ricerca || !valutazione) return { ok: false, error: 'ricerca_non_trovata' };
  const k = e.carrozzeria;
  const agente = { nome: e.contesto.nome ?? '', email: e.contesto.email };
  const chiave = chiavePerPdf(c, corpo.leasingPdf);

  // Prima si riserva l'id con la riga, poi si generano i PDF nella sua cartella
  const id = await salvaProposta(e, c, ricerca, valutazione, chiave, generaId(k.prefisso));

  let pdf: Pdf[] = [];
  let errore: string | undefined;
  try {
    pdf = documentiMezzi(c, k, id, chiave, agente);
  } catch (err) {
    errore = 'generazione_pdf';
    console.error(JSON.stringify({ evento: 'motore_pdf_mezzi_errore', fornitore: k.slug, id, error: String(err) }));
  }

  const salvati = pdf.length ? await salvaPdf(k.slug, id, pdf) : [];
  const pdfPronti = pdf.length > 0 && salvati.length === pdf.length;
  const documenti = salvati.map((d) => ({ nome: d.nome, pathname: d.pathname }));
  await query(`UPDATE app.proposta SET documenti = $2, pdf_pronti = $3 WHERE id = $1`, [
    id, JSON.stringify(documenti), pdfPronti,
  ]);

  const avviso = errore
    ? 'I PDF non sono stati generati: la proposta è salvata, i numeri restano validi.'
    : pdf.length === 0
    ? 'Nessun PDF da allegare: né il noleggio né un partner di leasing quotano questo preventivo.'
    : pdfPronti
    ? null
    : "I PDF non si sono salvati tutti nell'archivio: nello Storico possono mancare. Gli allegati sono completi.";
  const m = corpoMailMezzi({ k, agente, c, id, chiave, avviso });
  const mail = await inviaMail({
    to: DESTINATARIO_MCF,
    subject: m.subject,
    html: m.html,
    allegati: pdf.map((f) => ({ filename: f.filename, content: f.contenuto })),
  });

  console.log(JSON.stringify({
    evento: 'motore_preventivo_mezzi',
    fornitore: k.slug,
    id,
    userId: e.contesto.userId,
    totale: c.totale,
    venditore: c.venditore.codice,
    semaforo: valutazione.semaforo,
    canale: c.noleggio?.canale ?? null,
    pdf_ok: pdfPronti,
    pdf_err: errore ?? (pdfPronti || pdf.length === 0 ? undefined : 'salvataggio_pdf'),
    mail_ok: mail.ok,
  }));

  return { ok: true, id, pdfPronti, documenti };
}
