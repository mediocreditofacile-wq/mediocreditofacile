// Generazione di un preventivo su un portale ad accesso nominale (Green-Go).
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Differenze rispetto a src/lib/preventivi-pv.ts, che serve i portali a
// password (InnovaLux):
//  - chi ha generato il preventivo e' un utente identificato, e resta attaccato
//    al record con il suo identificativo stabile, non con l'email, che cambia
//  - lo storico va su Postgres e non su file JSON: con duecento agenti la lista
//    su Blob significherebbe leggere N documenti a ogni apertura del portale
//  - il listino non e' cablato: arriva dalla riga del fornitore
//
// Restano condivisi il motore di calcolo, la chiamata al microservizio PDF e il
// salvataggio dei PDF sullo store privato: quelli non si duplicano.
//
// Se il microservizio PDF non risponde il preventivo NON fallisce: numeri a
// schermo, record salvato, mail senza allegati e un avviso esplicito.

import { agevolazioneAttiva } from '../data/leasing';
import { query } from './db';
import { DESTINATARIO_MCF, escapeHtml, inviaMail, layoutMail } from './mail-portale';
import type { Contesto } from './portale-auth';
import {
  FORMA_LABEL,
  generaPdf,
  leggiInput,
  salvaPdf,
  type DocumentoGenerato,
} from './preventivi-pv';
import {
  buildPayloadPdf,
  calcolaPreventivo,
  euro,
  slugCliente,
  type Calcolo,
  type InputPreventivo,
  type OpzioniProspetto,
} from './prospetti-pv';
import { getTabella } from './tabelle-canoni';

/** Id leggibile: <PREFISSO>-AAAAMMGG-HHMMSS in ora italiana, come le pratiche */
function generaId(prefisso: string): string {
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefisso}-${rome.getFullYear()}${pad(rome.getMonth() + 1)}${pad(rome.getDate())}-${pad(rome.getHours())}${pad(rome.getMinutes())}${pad(rome.getSeconds())}`;
}

async function salvaRecord(
  id: string,
  contesto: Contesto,
  input: InputPreventivo,
  c: Calcolo,
  documenti: DocumentoGenerato[],
  pdfPronti: boolean,
): Promise<boolean> {
  try {
    await query(
      `INSERT INTO app.preventivo (
         id, fornitore_slug, organization_id, user_id,
         cliente_nome, comune, provincia, forma_giuridica, rif_preventivo,
         kwp, kwh_accumulo, importo, installazione, consumo_annuo, prezzo_kwh, profilo,
         tabella_canoni, durata, durata_consigliata, canone, numeri, documenti, pdf_pronti
       ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23)`,
      [
        id, contesto.fornitoreSlug, contesto.organizationId, contesto.userId,
        input.cliente, input.comune || null, input.provincia || null,
        input.forma_giuridica, input.rif_preventivo || null,
        input.kwp, input.kwh_accumulo, input.importo, input.installazione,
        input.consumo_annuo, input.prezzo_kwh, input.profilo ?? 'diurno',
        c.tabella, c.durata, c.durataConsigliata, c.canone,
        // Solo i risultati: nessun coefficiente e nessuna fascia nel record.
        JSON.stringify({
          canoni: c.canoni, riscatti: c.riscatti, riscatto: c.riscatto, totCanoni: c.totCanoni,
          durate: c.durate, riscattoPct: c.riscattoPct,
          produzione: c.produzione, autoconsumoQuota: c.autoconsumoQuota,
          beneficioAnno: c.beneficioAnno, beneficioMese: c.beneficioMese,
          coperturaCanone: c.coperturaCanone, margineMese: c.margineMese,
          fiscoNol: c.fiscoNol, costoNettoNol: c.costoNettoNol,
          rataLeasing: c.rataLeasing, sabatini: c.sabatini, iresIper: c.iresIper,
          conSabatini: c.conSabatini, conIper: c.conIper, costoNettoLeasing: c.costoNettoLeasing,
        }),
        JSON.stringify(documenti.map((d) => ({ nome: d.nome, pathname: d.pathname }))),
        pdfPronti,
      ],
    );
    return true;
  } catch (e) {
    console.error(JSON.stringify({ event: 'preventivo_record_error', id, error: String(e) }));
    return false;
  }
}

async function mandaMail(
  id: string,
  contesto: Contesto,
  input: InputPreventivo,
  c: Calcolo,
  pdf: { filename: string; contenuto: string }[],
): Promise<{ ok: boolean; err?: string }> {
  const eur = (v: number, dec = 0) => `${euro(v, dec)} euro`;
  const riga = (etichetta: string, valore: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:210px;vertical-align:top"><strong>${etichetta}</strong></td><td>${escapeHtml(valore)}</td></tr>`;

  const avvisoForma =
    input.forma_giuridica !== 'societa-capitali'
      ? `<p style="font-size:14px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:16px 0 0">
           Forma giuridica da verificare: ${escapeHtml(FORMA_LABEL[input.forma_giuridica])}.
           ${input.forma_giuridica === 'privato'
             ? "Il noleggio operativo non e' percorribile: la strada e' la detrazione del 50 per cento."
             : "Verificare partita IVA attiva e destinazione strumentale dell'impianto, attenzione all'utenza domestica su immobile abitativo."}
         </p>`
      : '';

  const senzaAllegati = pdf.length
    ? ''
    : `<p style="font-size:14px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:16px 0 0">
         I PDF non sono allegati: il servizio di generazione non ha risposto. I numeri qui sopra restano validi,
         i prospetti si rigenerano dal portale.
       </p>`;

  const esito = await inviaMail({
    to: DESTINATARIO_MCF,
    subject: `${contesto.fornitoreNome} — ${contesto.nome || contesto.email} — ${input.cliente || 'cliente non indicato'} — ${eur(input.importo)}`,
    allegati: pdf.map((f) => ({ filename: f.filename, content: f.contenuto })),
    html: layoutMail('Nuovo preventivo generato dalla rete', `
      <p style="font-size:14px;color:#787782;margin:0 0 18px">
        Portale ${escapeHtml(contesto.fornitoreNome ?? '')} — preventivo ${escapeHtml(id)}<br>
        Generato da ${escapeHtml(contesto.nome || contesto.email)} (${escapeHtml(contesto.email)})
      </p>

      <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Cliente finale</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Cliente', input.cliente || '-')}
        ${riga('Installazione', input.comune ? `${input.comune}${input.provincia ? ` (${input.provincia.toUpperCase()})` : ''}` : '-')}
        ${riga('Forma giuridica', FORMA_LABEL[input.forma_giuridica])}
        ${riga('Riferimento preventivo', input.rif_preventivo || '-')}
      </table>

      <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Impianto</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Potenza', `${euro(input.kwp, 0)} kWp`)}
        ${riga('Accumulo', input.kwh_accumulo ? `${euro(input.kwh_accumulo, 0)} kWh` : 'nessuno')}
        ${riga('Importo chiavi in mano', eur(input.importo))}
        ${riga('Consumi cliente', input.consumo_annuo ? `${euro(input.consumo_annuo, 0)} kWh/anno` : 'non forniti, stima di zona')}
        ${riga('Prezzo energia', `${euro(c.prezzoKwh, 2)} euro/kWh${input.prezzo_kwh ? ' (da bolletta)' : ' (default)'}`)}
      </table>

      <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Numeri chiave</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${riga('Durata', `${c.durata} mesi${c.durataForzata ? ` (forzata, la consigliata era ${c.durataConsigliata})` : ''}`)}
        ${riga('Canone mensile', eur(c.canone, 2))}
        ${riga('Riscatto indicativo', eur(c.riscatto, 2))}
        ${riga('Produzione stimata', `${euro(c.produzione, 0)} kWh/anno`)}
        ${riga('Autoconsumo', `${euro(c.autoconsumoQuota * 100, 0)}%`)}
        ${riga('Beneficio energetico', `${eur(c.beneficioAnno)}/anno, ${eur(c.beneficioMese)}/mese`)}
        ${riga('Copertura del canone', `${euro(c.coperturaCanone * 100, 0)}%`)}
      </table>

      ${avvisoForma}
      ${senzaAllegati}
    `),
  });
  return { ok: esito.ok, err: esito.err };
}

/** Inoltro a Pipedrive, se il webhook e' configurato. Non blocca il preventivo. */
async function inoltraZapier(
  id: string,
  contesto: Contesto,
  input: InputPreventivo,
  c: Calcolo,
): Promise<void> {
  const url = (import.meta as unknown as { env?: Record<string, string | undefined> }).env
    ?.ZAPIER_WEBHOOK_URL ?? process.env.ZAPIER_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        fonte: `portale-${contesto.fornitoreSlug}`,
        nome: `${input.cliente} — ${contesto.fornitoreNome} (preventivo fotovoltaico)`,
        agente: contesto.nome || contesto.email,
        agente_email: contesto.email,
        preventivo_id: id,
        comune: input.comune,
        provincia: input.provincia,
        forma_giuridica: input.forma_giuridica,
        kwp: input.kwp,
        importo: input.importo,
        durata: c.durata,
        canone: c.canone,
      }),
    });
  } catch (e) {
    console.warn(JSON.stringify({ event: 'zapier_preventivo_error', id, error: String(e) }));
  }
}

export interface EsitoPreventivo {
  ok: boolean;
  error?: string;
  id?: string;
  pdfPronti?: boolean;
  numeri?: Record<string, unknown>;
  documenti?: { nome: string; pathname: string }[];
  min?: number;
  max?: number;
}

/**
 * Genera un preventivo per conto dell'utente della sessione.
 * Il fornitore e il listino escono dal contesto, mai dal corpo della richiesta.
 */
export async function generaPreventivo(
  corpo: Record<string, unknown>,
  contesto: Contesto,
  prefisso: string,
): Promise<EsitoPreventivo> {
  const tabella = getTabella(contesto.tabellaCanoni);
  const input = leggiInput(corpo, tabella);

  // Chi firma il prospetto e quali agevolazioni entrano nei conti. Il nome del
  // fornitore esce dal contesto, mai dalla richiesta: e' il nome che il cliente
  // finale legge sul documento.
  const opzioni: OpzioniProspetto = {
    fornitoreNome: contesto.fornitoreNome ?? undefined,
    fornitoreCitta: contesto.fornitoreCitta ?? undefined,
    fornitoreEtichetta: contesto.fornitoreNome ?? undefined,
    // Stesso controllo della simulazione: un'agevolazione chiusa nel registro
    // non entra nel prospetto nemmeno se il client la chiede.
    includiSabatini:
      agevolazioneAttiva('sabatini') && corpo.includi_sabatini !== false && corpo.includi_sabatini !== 'false',
    includiIper:
      agevolazioneAttiva('iperammortamento') && corpo.includi_iper !== false && corpo.includi_iper !== 'false',
  };

  if (!input.cliente || input.kwp <= 0 || input.importo <= 0) {
    return { ok: false, error: 'dati_incompleti' };
  }
  // Fuori dal range quotabile non si inventa un canone: si dice perche'.
  if (!tabella.quotabile(input.importo)) {
    return { ok: false, error: 'importo_fuori_range', min: tabella.importoMin, max: tabella.importoMax };
  }

  const c = calcolaPreventivo(input, tabella, opzioni);
  const payload = buildPayloadPdf(input, c, opzioni);
  const id = generaId(prefisso);

  const risultatoPdf = await generaPdf(payload, tabella);
  const documenti =
    risultatoPdf.ok && risultatoPdf.pdf ? await salvaPdf(contesto.fornitoreSlug!, id, risultatoPdf.pdf) : [];
  const pdfPronti = documenti.length === 2;

  const [recordOk, mail] = await Promise.all([
    salvaRecord(id, contesto, input, c, documenti, pdfPronti),
    mandaMail(id, contesto, input, c, pdfPronti ? risultatoPdf.pdf! : []),
  ]);
  void inoltraZapier(id, contesto, input, c);

  console.log(JSON.stringify({
    event: 'preventivo_generato',
    fornitore: contesto.fornitoreSlug,
    id,
    userId: contesto.userId,
    tabella: c.tabella,
    kwp: input.kwp,
    importo: input.importo,
    durata: c.durata,
    canone: c.canone,
    pdf_ok: pdfPronti,
    pdf_err: risultatoPdf.err,
    record_ok: recordOk,
    mail_ok: mail.ok,
    mail_err: mail.err,
  }));

  return {
    ok: true,
    id,
    pdfPronti,
    numeri: {
      slug: slugCliente(input.cliente),
      durata: c.durata,
      durataConsigliata: c.durataConsigliata,
      durataForzata: c.durataForzata,
      durate: c.durate,
      canoni: c.canoni,
      riscatti: c.riscatti,
      canone: c.canone,
      riscatto: c.riscatto,
      totCanoni: c.totCanoni,
      produzione: c.produzione,
      autoconsumoQuota: c.autoconsumoQuota,
      autoKwh: c.autoKwh,
      cedKwh: c.cedKwh,
      prezzoKwh: c.prezzoKwh,
      beneficioAnno: c.beneficioAnno,
      beneficioMese: c.beneficioMese,
      coperturaCanone: c.coperturaCanone,
      margineMese: c.margineMese,
      fiscoNol: c.fiscoNol,
      costoNettoNol: c.costoNettoNol,
      rataLeasing: c.rataLeasing,
      sabatini: c.sabatini,
      sabatiniNetto: c.sabatiniNetto,
      iresIper: c.iresIper,
      iperNetto: c.iperNetto,
      conSabatini: c.conSabatini,
      conIper: c.conIper,
      interessi: c.interessi,
      totLeasing: c.totLeasing,
      riscattoLeasing: c.riscattoLeasing,
      costoNettoLeasing: c.costoNettoLeasing,
      detrazionePrivati: c.detrazionePrivati,
    },
    documenti: documenti.map((d) => ({ nome: d.nome, pathname: d.pathname })),
  };
}
