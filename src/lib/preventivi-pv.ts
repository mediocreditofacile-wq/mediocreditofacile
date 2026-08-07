// Logica condivisa dei portali fornitore che generano preventivi fotovoltaico
// (oggi InnovaLux, domani chiunque altro: basta una voce nel registro partner).
//
// ATTENZIONE — FILE SERVER-ONLY: importa il motore, che importa i coefficienti.
//
// Cosa fa a ogni preventivo:
//  - calcola i numeri qui, server-side
//  - chiama il microservizio PDF passandogli il JSON gia' composto
//  - salva i due PDF e il record storico su Vercel Blob (store privato)
//  - manda la mail a MCF con i numeri chiave e i due PDF in allegato
//
// Se il microservizio non risponde il preventivo NON fallisce: si salva comunque
// il record, si manda comunque la mail (senza allegati) e il portale mostra i
// numeri avvisando che i PDF arrivano a breve.

import { put } from '@vercel/blob';
import { pathPreventivi, ruoloDaChiave, type PortalePartner } from '../data/portali-partner';
import {
  buildPayloadPdf,
  calcolaPreventivo,
  coefficientiPerImporto,
  euro,
  importoQuotabile,
  slugCliente,
  type Calcolo,
  type FormaGiuridica,
  type Installazione,
  type InputPreventivo,
  type Profilo,
} from './prospetti-pv';
import { DURATE, IMPORTO_MAX, IMPORTO_MIN, RISCATTO } from './prospetti-pv-coefficienti';

const DESTINATARIO = 'mediocreditofacile@gmail.com';
/** Oltre questo tempo si degrada e si consegnano i soli numeri */
const TIMEOUT_PDF_MS = 25000;

interface DocumentoGenerato {
  nome: string;
  pathname: string;
  size: number;
}

function escapeHtml(value: string): string {
  return String(value).replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

function numero(v: unknown): number {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
  return Number.isFinite(n) ? n : 0;
}

const FORME: FormaGiuridica[] = ['societa-capitali', 'ditta-individuale', 'privato'];
const INSTALLAZIONI: Installazione[] = ['tetto', 'pensilina', 'terra'];

/** Normalizza il corpo della richiesta in un input valido per il motore */
export function leggiInput(raw: Record<string, unknown>): InputPreventivo {
  const testo = (k: string) => String(raw[k] ?? '').trim();
  const forma = testo('forma_giuridica') as FormaGiuridica;
  const installazione = testo('installazione') as Installazione;
  const profilo = testo('profilo') as Profilo;
  const durata = numero(raw.durata);

  return {
    cliente: testo('cliente').slice(0, 120),
    comune: testo('comune').slice(0, 80),
    provincia: testo('provincia').slice(0, 4),
    forma_giuridica: FORME.includes(forma) ? forma : 'societa-capitali',
    rif_preventivo: testo('rif_preventivo').slice(0, 120),
    kwp: numero(raw.kwp),
    kwh_accumulo: numero(raw.kwh_accumulo),
    importo: numero(raw.importo),
    installazione: INSTALLAZIONI.includes(installazione) ? installazione : 'tetto',
    consumo_annuo: numero(raw.consumo_annuo) || null,
    prezzo_kwh: numero(raw.prezzo_kwh) || null,
    profilo: profilo === 'h24' ? 'h24' : 'diurno',
    durata: DURATE.includes(durata) ? durata : null,
  };
}

/** Id leggibile: <PREFISSO>-AAAAMMGG-HHMMSS in ora italiana, come le pratiche */
function generaId(prefisso: string): string {
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefisso}-${rome.getFullYear()}${pad(rome.getMonth() + 1)}${pad(rome.getDate())}-${pad(rome.getHours())}${pad(rome.getMinutes())}${pad(rome.getSeconds())}`;
}

interface RispostaPdf {
  ok: boolean;
  err?: string;
  pdf?: { filename: string; contenuto: string }[];
}

/**
 * Chiama il microservizio. La tabella dei coefficienti viaggia qui dentro (non
 * nel payload del PDF) cosi' esiste in un posto solo: il motore Python la usa al
 * posto dei suoi valori di default.
 */
async function generaPdf(payload: Record<string, unknown>): Promise<RispostaPdf> {
  const url = import.meta.env.PROSPETTI_PDF_URL as string | undefined;
  const token = import.meta.env.PROSPETTI_TOKEN as string | undefined;
  if (!url || !token) return { ok: false, err: 'microservizio_non_configurato' };

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        dati: payload,
        // Coefficienti gia' risolti per questo importo: gli scaglioni li legge
        // solo il portale, il motore riceve una riga per durata.
        tabella: {
          durate: DURATE,
          coefficienti: { unica: coefficientiPerImporto(payload.importo as number) },
          riscatto: RISCATTO,
        },
      }),
      signal: AbortSignal.timeout(TIMEOUT_PDF_MS),
    });
    if (!res.ok) {
      const testo = await res.text();
      return { ok: false, err: `pdf_${res.status}: ${testo.slice(0, 200)}` };
    }
    const json = await res.json();
    if (!json?.ok) return { ok: false, err: 'pdf_risposta_negativa' };
    return {
      ok: true,
      pdf: [
        { filename: json.analitico.filename, contenuto: json.analitico.pdf_base64 },
        { filename: json.infografico.filename, contenuto: json.infografico.pdf_base64 },
      ],
    };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `pdf_exception: ${msg}` };
  }
}

async function salvaPdf(
  partner: PortalePartner,
  id: string,
  pdf: { filename: string; contenuto: string }[],
): Promise<DocumentoGenerato[]> {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return [];

  const salvati: DocumentoGenerato[] = [];
  for (const f of pdf) {
    const bytes = Uint8Array.from(atob(f.contenuto), (ch) => ch.charCodeAt(0));
    const pathname = `${pathPreventivi(partner.slug)}${id}/${f.filename}`;
    try {
      await put(pathname, bytes, {
        access: 'private',
        contentType: 'application/pdf',
        addRandomSuffix: false,
        allowOverwrite: true,
        cacheControlMaxAge: 60,
        token,
      });
      salvati.push({ nome: f.filename, pathname, size: bytes.length });
    } catch (e) {
      console.error(JSON.stringify({ event: 'preventivo_pdf_save_error', pathname, error: String(e) }));
    }
  }
  return salvati;
}

async function salvaRecord(
  partner: PortalePartner,
  id: string,
  input: InputPreventivo,
  c: Calcolo,
  documenti: DocumentoGenerato[],
  pdfPronti: boolean,
): Promise<boolean> {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return false;

  const record = {
    id,
    partner: partner.slug,
    creato: new Date().toISOString(),
    pdfPronti,
    cliente: {
      nome: input.cliente,
      comune: input.comune,
      provincia: input.provincia,
      forma_giuridica: input.forma_giuridica,
      rif_preventivo: input.rif_preventivo,
    },
    impianto: {
      kwp: input.kwp,
      kwh_accumulo: input.kwh_accumulo,
      importo: input.importo,
      installazione: input.installazione,
      consumo_annuo: input.consumo_annuo,
      prezzo_kwh: input.prezzo_kwh,
      profilo: input.profilo,
    },
    // Solo i risultati: nessun coefficiente e nessuna fascia nel record
    numeri: {
      durata: c.durata,
      durataConsigliata: c.durataConsigliata,
      canone: c.canone,
      canoni: c.canoni,
      riscatto: c.riscatto,
      totCanoni: c.totCanoni,
      produzione: c.produzione,
      autoconsumoQuota: c.autoconsumoQuota,
      beneficioAnno: c.beneficioAnno,
      beneficioMese: c.beneficioMese,
      fiscoNol: c.fiscoNol,
      costoNettoNol: c.costoNettoNol,
      rataLeasing: c.rataLeasing,
      sabatini: c.sabatini,
      iresIper: c.iresIper,
      coperturaCanone: c.coperturaCanone,
      margineMese: c.margineMese,
    },
    documenti,
  };

  try {
    await put(`${pathPreventivi(partner.slug)}${id}/preventivo.json`, JSON.stringify(record, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60,
      token,
    });
    return true;
  } catch (e) {
    console.error(JSON.stringify({ event: 'preventivo_record_error', id, error: String(e) }));
    return false;
  }
}

const FORMA_LABEL: Record<FormaGiuridica, string> = {
  'societa-capitali': 'Societa di capitali',
  'ditta-individuale': 'Ditta individuale / persona fisica',
  privato: 'Privato senza partita IVA',
};

async function mandaMail(
  partner: PortalePartner,
  id: string,
  input: InputPreventivo,
  c: Calcolo,
  pdf: { filename: string; contenuto: string }[],
): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const eur = (v: number, dec = 0) => `${euro(v, dec)} euro`;
  const riga = (etichetta: string, valore: string) =>
    `<tr><td style="padding:4px 12px 4px 0;width:210px"><strong>${etichetta}</strong></td><td>${escapeHtml(valore)}</td></tr>`;

  const avvisoForma =
    input.forma_giuridica !== 'societa-capitali'
      ? `<p style="font-size:14px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:16px 0 0">
           Forma giuridica da verificare: ${escapeHtml(FORMA_LABEL[input.forma_giuridica])}.
           ${input.forma_giuridica === 'privato'
             ? 'Il noleggio operativo non e\' percorribile: la strada e\' la detrazione del 50 per cento.'
             : 'Verificare partita IVA attiva e destinazione strumentale dell\'impianto (attenzione all\'utenza domestica).'}
         </p>`
      : '';

  const allegati = pdf.length
    ? ''
    : `<p style="font-size:14px;color:#b91c1c;background:#fef2f2;border:1px solid #fecaca;border-radius:8px;padding:10px 14px;margin:16px 0 0">
         I PDF non sono allegati: il servizio di generazione non ha risposto. I numeri qui sopra sono validi,
         i prospetti si rigenerano dal portale.
       </p>`;

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: [DESTINATARIO],
    subject: `Nuovo preventivo ${partner.nome} ${id} — ${input.cliente || 'cliente non indicato'} — ${eur(input.importo)}`,
    attachments: pdf.map((f) => ({ filename: f.filename, content: f.contenuto })),
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Portale ${escapeHtml(partner.nome)} — Preventivo ${escapeHtml(id)}
        </p>
        <h2 style="color:#664CCD;margin:0 0 16px">Prospetti generati dal fornitore</h2>

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Cliente finale</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          ${riga('Cliente', input.cliente || '-')}
          ${riga('Luogo di installazione', input.comune ? `${input.comune}${input.provincia ? ` (${input.provincia.toUpperCase()})` : ''}` : '-')}
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
          ${riga('Risparmio fiscale', eur(c.fiscoNol))}
          ${riga('Rata leasing di confronto', eur(c.rataLeasing, 2))}
        </table>

        ${avvisoForma}
        ${allegati}

        <p style="font-size:12px;color:#787782;margin-top:28px;border-top:1px solid #E1DEE3;padding-top:12px">
          Generato dal fornitore su /tools/${partner.slug}. Lo storico dei preventivi e' nel portale stesso.<br>
          ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
        </p>
      </div>
    `,
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) return { ok: false, err: `resend_${res.status}: ${(await res.text()).slice(0, 200)}` };
    return { ok: true };
  } catch (e) {
    return { ok: false, err: `resend_exception: ${e instanceof Error ? e.message : 'unknown'}` };
  }
}

/** Gestisce la generazione di un preventivo per un portale fornitore. */
export async function gestisciPreventivo(request: Request, partner: PortalePartner): Promise<Response> {
  const rispondi = (payload: unknown, status = 200) =>
    new Response(JSON.stringify(payload), { status, headers: { 'Content-Type': 'application/json' } });

  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  const evento = partner.slug.replace(/-/g, '');

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return rispondi({ ok: false, error: 'invalid_json' }, 400);
  }

  const chiave =
    (request.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim() ||
    String(body.auth ?? '');
  if (!ruoloDaChiave(chiave, partner, adminKey)) {
    return rispondi({ ok: false, error: 'unauthorized' }, 401);
  }

  const input = leggiInput((body.input ?? {}) as Record<string, unknown>);
  if (!input.cliente || input.kwp <= 0 || input.importo <= 0) {
    return rispondi({ ok: false, error: 'dati_incompleti' }, 400);
  }
  // Fuori dal range quotabile non si inventa un canone: si dice perche'.
  if (!importoQuotabile(input.importo)) {
    return rispondi({
      ok: false,
      error: 'importo_fuori_range',
      min: IMPORTO_MIN,
      max: IMPORTO_MAX,
    }, 400);
  }

  const c = calcolaPreventivo(input);
  const payload = buildPayloadPdf(input, c);
  const id = generaId(partner.prefissoPratica);

  const risultatoPdf = await generaPdf(payload);
  const documenti = risultatoPdf.ok && risultatoPdf.pdf ? await salvaPdf(partner, id, risultatoPdf.pdf) : [];
  const pdfPronti = documenti.length === 2;

  const [recordOk, mail] = await Promise.all([
    salvaRecord(partner, id, input, c, documenti, pdfPronti),
    mandaMail(partner, id, input, c, pdfPronti ? risultatoPdf.pdf! : []),
  ]);

  console.log(JSON.stringify({
    event: `preventivo_generato_${evento}`,
    id,
    cliente: input.cliente.slice(0, 60),
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

  return rispondi({
    ok: true,
    id,
    pdfPronti,
    slug: slugCliente(input.cliente),
    numeri: {
      durata: c.durata,
      durataConsigliata: c.durataConsigliata,
      durataForzata: c.durataForzata,
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
      interessi: c.interessi,
      sabatini: c.sabatini,
      sabatiniNetto: c.sabatiniNetto,
      iresIper: c.iresIper,
      iperNetto: c.iperNetto,
      costoNettoLeasing: c.costoNettoLeasing,
      detrazionePrivati: c.detrazionePrivati,
    },
    documenti: documenti.map((d) => ({ nome: d.nome, pathname: d.pathname })),
  });
}
