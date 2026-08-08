// Client Openapi per lo strumento di valutazione interno MCF.
// SERVER-ONLY: qui dentro passano email, API key e token. Non importarlo mai da un'isola client.
//
// Autenticazione a due livelli (loro modello, non nostro):
//   email + API key in Basic Auth  ->  serve solo per creare/leggere i token
//   token con scope e scadenza     ->  autentica le chiamate ai dati
// La loro documentazione consiglia token a vita breve, quindi il token lo
// generiamo qui e lo rinnoviamo da soli: in .env restano solo email e chiave.
//
// Prezzi (listino console, IVA esclusa) in COSTI: servono al registro spesa.
// L'anagrafica ha 30 chiamate al mese gratis su IT-start e IT-advanced, quindi
// quelle voci sono a zero finche' non si sfonda la franchigia: il registro
// segna comunque la chiamata, il conto lo si legge sul wallet.

import { put, list, get } from '@vercel/blob';

// L'SDK Blob legge process.env, che in dev Astro non popola sempre: passiamo
// il token esplicitamente cosi' cache e registro costi funzionano anche in locale.
const blobToken = () => import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;

const OAUTH = 'https://oauth.openapi.com';
const COMPANY = 'https://company.openapi.com';
const RISK = 'https://risk.openapi.com';

/** Prezzo base per chiamata, euro IVA esclusa */
export const COSTI = {
  'IT-full': 0.30,
  'IT-advanced': 0.0,      // entro le 30/mese incluse
  'IT-start': 0.0,         // entro le 30/mese incluse
  'IT-shareholders': 0.0,  // entro le 30/mese incluse
  'IT-creditscore-advanced': 0.51,
  'IT-negativita': 0.45,
  'IT-negativita-dettaglio': 0.75,
  'IT-report-persona': 3.60,
} as const;
export type Servizio = keyof typeof COSTI;

const SCOPES = [
  'GET:company.openapi.com/IT-start',
  'GET:company.openapi.com/IT-advanced',
  'GET:company.openapi.com/IT-full',
  'GET:company.openapi.com/IT-search',
  'GET:company.openapi.com/IT-shareholders',
  'GET:risk.openapi.com/IT-creditscore-advanced',
  'POST:risk.openapi.com/IT-negativita',
  'GET:risk.openapi.com/IT-negativita',
  'POST:risk.openapi.com/IT-report-persona',
  'GET:risk.openapi.com/IT-report-persona',
];

function credenziali() {
  const email = import.meta.env.OPENAPI_EMAIL as string;
  const key = import.meta.env.OPENAPI_KEY as string;
  if (!email || !key) throw new Error('Credenziali Openapi non configurate');
  return 'Basic ' + Buffer.from(`${email}:${key}`).toString('base64');
}

// Il token vive nel modulo: su Fluid Compute l'istanza si riusa fra richieste,
// quindi in pratica lo si crea una volta ogni tanto, non a ogni ricerca.
let tokenCache: { token: string; scade: number } | null = null;

export async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.scade - 60_000) return tokenCache.token;

  const auth = credenziali();
  // Riusa un token nostro ancora valido invece di accumularne uno per avvio
  const lista = await fetch(`${OAUTH}/tokens`, { headers: { Authorization: auth } })
    .then((r) => r.json())
    .catch(() => null);
  const esistente = (lista?.data ?? []).find(
    (t: any) => t?.name === 'mcf-runtime' && new Date(t?.expireAt ?? 0).getTime() > Date.now() + 3600_000,
  );
  if (esistente?.token) {
    tokenCache = { token: esistente.token, scade: new Date(esistente.expireAt).getTime() };
    return esistente.token;
  }

  const res = await fetch(`${OAUTH}/tokens`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: 'mcf-runtime', scopes: SCOPES }),
  });
  const body = await res.json();
  if (!body?.success || !body?.data?.token) {
    throw new Error(`Token Openapi non creato: ${body?.message ?? res.status}`);
  }
  tokenCache = { token: body.data.token, scade: new Date(body.data.expireAt).getTime() };
  return body.data.token;
}

async function chiama(url: string, servizio: Servizio, init?: RequestInit) {
  const token = await getToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  // 204 = nessun risultato: partita IVA inesistente o non trovata
  if (res.status === 204) return { trovato: false, dati: null };
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) {
    throw new Error(`${servizio}: ${body?.message ?? res.status}`);
  }
  await registraCosto(servizio);
  const dati = Array.isArray(body?.data) ? body.data[0] ?? null : body?.data ?? null;
  return { trovato: dati != null, dati, lista: Array.isArray(body?.data) ? body.data : null };
}

// --- registro spesa ----------------------------------------------------------
// Un blob per chiamata: sommarli e' banale e non serve leggere-modificare-scrivere.
async function registraCosto(servizio: Servizio) {
  const costo = COSTI[servizio] ?? 0;
  const ora = new Date();
  const mese = `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`;
  try {
    await put(
      `openapi/costi/${mese}/${ora.getTime()}-${servizio}.json`,
      JSON.stringify({ servizio, costo, quando: ora.toISOString() }),
      { access: 'private', addRandomSuffix: true, contentType: 'application/json', token: blobToken() },
    );
  } catch {
    /* il registro non deve mai far fallire una ricerca */
  }
}

export async function spesaDelMese(mese?: string): Promise<{ mese: string; chiamate: number; totale: number }> {
  const ora = new Date();
  const m = mese ?? `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`;
  try {
    const { blobs } = await list({ prefix: `openapi/costi/${m}/`, limit: 1000, token: blobToken() });
    let totale = 0;
    for (const b of blobs) {
      const nome = b.pathname.split('/').pop() ?? '';
      const servizio = nome.replace(/^\d+-/, '').replace(/-[a-zA-Z0-9]+\.json$/, '.json').replace(/\.json$/, '');
      totale += (COSTI as Record<string, number>)[servizio] ?? 0;
    }
    return { mese: m, chiamate: blobs.length, totale: Math.round(totale * 100) / 100 };
  } catch {
    return { mese: m, chiamate: 0, totale: 0 };
  }
}

// --- cache anagrafica --------------------------------------------------------
// 30 giorni: un bilancio non cambia in un mese e ogni miss costa 0,81 €.
const TTL_CACHE = 30 * 24 * 60 * 60 * 1000;

async function dallaCache(piva: string): Promise<any | null> {
  try {
    const { blobs } = await list({ prefix: `openapi/aziende/${piva}.json`, limit: 1, token: blobToken() });
    if (!blobs.length) return null;
    if (Date.now() - new Date(blobs[0].uploadedAt).getTime() > TTL_CACHE) return null;
    // store privato: l'URL non e' scaricabile in chiaro, serve get() autenticata
    const b = await get(blobs[0].pathname, { access: 'private', token: blobToken() });
    if (!b) return null;
    return JSON.parse(await new Response(b.stream).text());
  } catch {
    return null;
  }
}

async function inCache(piva: string, dati: any) {
  try {
    await put(`openapi/aziende/${piva}.json`, JSON.stringify(dati), {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: 'application/json',
      cacheControlMaxAge: 60,
      token: blobToken(),
    });
  } catch {
    /* la cache che non scrive non e' un errore bloccante */
  }
}

// --- chiamate ----------------------------------------------------------------

export interface SchedaAzienda {
  trovata: boolean;
  daCache?: boolean;
  piva: string;
  full: any;
  advanced: any;
  score: any;
  soci: any[];
  negativitaId?: string | null;
}

/**
 * Scheda completa: anagrafica e bilancio, punteggio di rischio, soci con le quote.
 * La verifica eventi negativi sull'azienda parte qui ma e' asincrona: torna l'id
 * e l'esito si recupera dopo con esitoNegativita().
 */
export async function schedaAzienda(piva: string, opts: { conNegativita?: boolean } = {}): Promise<SchedaAzienda> {
  const cached = await dallaCache(piva);
  if (cached) return { ...cached, daCache: true };

  const full = await chiama(`${COMPANY}/IT-full/${piva}`, 'IT-full');
  if (!full.trovato) return { trovata: false, piva, full: null, advanced: null, score: null, soci: [] };

  // advanced serve per PEC, ATECO e data di inizio attivita', che in full non ci sono
  const [advanced, score, soci] = await Promise.all([
    chiama(`${COMPANY}/IT-advanced/${piva}`, 'IT-advanced').catch(() => ({ dati: null })),
    chiama(`${RISK}/IT-creditscore-advanced/${piva}`, 'IT-creditscore-advanced').catch(() => ({ dati: null })),
    chiama(`${COMPANY}/IT-shareholders/${piva}`, 'IT-shareholders').catch(() => ({ lista: [] })),
  ]);

  let negativitaId: string | null = null;
  if (opts.conNegativita) negativitaId = await avviaNegativita(piva).catch(() => null);

  const scheda: SchedaAzienda = {
    trovata: true,
    piva,
    full: full.dati,
    advanced: (advanced as any).dati,
    score: (score as any).dati,
    soci: (soci as any).lista ?? [],
    negativitaId,
  };
  await inCache(piva, scheda);
  return scheda;
}

/** Avvia la verifica eventi negativi su una partita IVA o un codice fiscale. */
export async function avviaNegativita(cfPiva: string): Promise<string | null> {
  const r = await chiama(`${RISK}/IT-negativita`, 'IT-negativita', {
    method: 'POST',
    body: JSON.stringify({ cf_piva: cfPiva }),
  });
  return (r as any).dati?.id ?? null;
}

/** Esito della verifica. Finche' e' in lavorazione torna {pronto:false}. */
export async function esitoNegativita(id: string): Promise<{ pronto: boolean; dati?: any }> {
  const token = await getToken();
  const res = await fetch(`${RISK}/IT-negativita/${id}/dettaglio`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (body?.success) {
    // il dettaglio si paga solo quando c'e' davvero qualcosa da leggere
    const d = body.data ?? {};
    const qualcosa = d.presenzaProtesti || d.presenzaPregiudizievoli || d.presenzaProcedure;
    if (qualcosa) await registraCosto('IT-negativita-dettaglio');
    return { pronto: true, dati: d };
  }
  return { pronto: false };
}

/** Report completo su una persona: cariche, partecipazioni, eventi negativi, immobili. */
export async function avviaReportPersona(nome: string, cognome: string, cf: string): Promise<string | null> {
  const r = await chiama(`${RISK}/IT-report-persona/`, 'IT-report-persona', {
    method: 'POST',
    body: JSON.stringify({ name: nome, surname: cognome, taxCode: cf }),
  });
  return (r as any).dati?.id ?? null;
}

export async function esitoReportPersona(id: string): Promise<{ pronto: boolean; dati?: any }> {
  const token = await getToken();
  const res = await fetch(`${RISK}/IT-report-persona/${id}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (body?.success && body?.data?.status && body.data.status !== 'PENDING') {
    return { pronto: true, dati: body.data };
  }
  return { pronto: false };
}
