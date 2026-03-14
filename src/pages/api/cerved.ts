export const prerender = false;

/**
 * Proxy Cerved API — protegge la CONSUMER_KEY lato server.
 * GET /api/cerved?piva=XXXXXXXXXXX
 *
 * Flusso:
 *  1. POST entitySearch/advanced (P.IVA → id_soggetto)
 *  2. GET  entityProfile/live   (id_soggetto → dati completi + finanziari)
 *  3. GET  score/impresa/corporate (codice_fiscale → CGS) — opzionale, può dare 403
 */

const CERVED_BASE = 'https://api.cerved.com/cervedApi';
const ALLOWED_ORIGIN = 'https://mcf-marotta.netlify.app';

// Cache in-memory (TTL 24h) per risparmiare le 500 chiamate gratuite
const cache = new Map<string, { data: CervedResult; ts: number }>();
const TTL = 24 * 60 * 60 * 1000;

interface CervedResult {
  found: boolean;
  ragioneSociale?: string;
  formaGiuridica?: string;
  indirizzo?: string;
  ateco?: string;
  cgs?: number | null;
  fatturato?: number | null;
  patrimonioNetto?: number | null;
  utile?: number | null;
  mol?: number | null;
  attivo?: number | null;
  dipendenti?: number | null;
}

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: corsHeaders() });
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const piva = url.searchParams.get('piva')?.trim() ?? '';

  // Validazione formato P.IVA (11 cifre)
  if (!/^\d{11}$/.test(piva)) {
    return jsonResponse({ found: false, error: 'P.IVA non valida (11 cifre)' }, 400);
  }

  // Controlla cache
  const cached = cache.get(piva);
  if (cached && Date.now() - cached.ts < TTL) {
    return jsonResponse(cached.data);
  }

  const apiKey = import.meta.env.CERVED_CONSUMER_KEY as string;
  if (!apiKey) {
    return jsonResponse({ found: false, error: 'API key non configurata' }, 500);
  }

  try {
    // --- Step 1: Ricerca avanzata per P.IVA ---
    const searchRes = await fetch(`${CERVED_BASE}/v1/entitySearch/advanced`, {
      method: 'POST',
      headers: { 'apikey': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ vat_number: piva }),
    });

    if (!searchRes.ok) {
      return jsonResponse({ found: false, error: `Cerved search: ${searchRes.status}` }, 502);
    }

    const searchData = await searchRes.json();
    const subjects = searchData?.subjects ?? [];
    if (subjects.length === 0) {
      return jsonResponse({ found: false });
    }

    const subj = subjects[0];
    const idSoggetto = subj.subject_id;
    const codiceFiscale = subj.tax_code ?? '';

    // Dati anagrafici dalla ricerca
    const info = subj.company_info ?? {};
    const ragioneSociale = info.business_name ?? '';
    const formaGiuridica = info.legal_form?.description ?? '';

    // Indirizzo
    const addr = subj.address ?? {};
    const indirizzo = [
      addr.street?.description,
      addr.postal_code,
      addr.city?.description,
      addr.province?.code ? `(${addr.province.code})` : '',
    ].filter(Boolean).join(' ').trim();

    // ATECO
    const atecoObj = info.economic_activity?.ateco ?? {};
    const atecoCode = atecoObj.code ?? '';
    // Formatta codice ATECO: "10512" → "10.51.2"
    const atecoFmt = atecoCode.length >= 4
      ? atecoCode.slice(0,2) + '.' + atecoCode.slice(2,4) + (atecoCode.length > 4 ? '.' + atecoCode.slice(4) : '')
      : atecoCode;
    const ateco = atecoFmt
      ? `${atecoFmt} - ${atecoObj.description ?? ''}`
      : '';

    // --- Step 2: Profilo completo (dati finanziari) ---
    let fatturato: number | null = null;
    let patrimonioNetto: number | null = null;
    let utile: number | null = null;
    let mol: number | null = null;
    let attivo: number | null = null;
    let dipendenti: number | null = null;

    if (idSoggetto) {
      const profileRes = await fetch(
        `${CERVED_BASE}/v1/entityProfile/live?id_soggetto=${idSoggetto}`,
        { headers: { 'apikey': apiKey } },
      );

      if (profileRes.ok) {
        const profile = await profileRes.json();
        // I dati finanziari sono in migliaia di euro (x1000)
        const fin = profile?.dati_economici_dimensionali;
        if (fin) {
          fatturato = fin.fatturato != null ? fin.fatturato * 1000 : null;
          patrimonioNetto = fin.patrimonio_netto != null ? fin.patrimonio_netto * 1000 : null;
          utile = fin.utile_perdita_esercizio != null ? fin.utile_perdita_esercizio * 1000 : null;
          mol = fin.mol != null ? fin.mol * 1000 : null;
          attivo = fin.attivo != null ? fin.attivo * 1000 : null;
          dipendenti = fin.numero_dipendenti ?? null;
        }
      }
    }

    // --- Step 3: CGS (opzionale — può dare 403 se il prodotto Score non è attivo) ---
    let cgs: number | null = null;

    if (codiceFiscale) {
      try {
        const cgsRes = await fetch(
          `${CERVED_BASE}/v1.1/score/impresa/corporate/ALL?codice_fiscale=${codiceFiscale}`,
          { headers: { 'apikey': apiKey } },
        );
        if (cgsRes.ok) {
          const cgsData = await cgsRes.json();
          cgs = cgsData?.cgs ?? cgsData?.score ?? null;
        }
        // Se 403, ignoriamo — CGS non disponibile per questa app
      } catch (_) { /* CGS non critico */ }
    }

    // Costruisci risultato
    const result: CervedResult = {
      found: true,
      ragioneSociale,
      formaGiuridica,
      indirizzo,
      ateco,
      cgs,
      fatturato,
      patrimonioNetto,
      utile,
      mol,
      attivo,
      dipendenti,
    };

    // Salva in cache
    cache.set(piva, { data: result, ts: Date.now() });

    return jsonResponse(result);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return jsonResponse({ found: false, error: msg }, 502);
  }
}
