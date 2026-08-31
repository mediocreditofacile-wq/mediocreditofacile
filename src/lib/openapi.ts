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
  // Estero: nessuna franchigia mensile, si paga dalla prima chiamata.
  // Listino pay-per-use 0,11 € + IVA, scende con i volumi.
  'AT-advanced': 0.11,
  'BE-advanced': 0.11,
  'CH-advanced': 0.11,
  'DE-advanced': 0.11,
  'ES-advanced': 0.11,
  'FR-advanced': 0.11,
  'GB-advanced': 0.11,
  'PL-advanced': 0.11,
  'PT-advanced': 0.11,
  'WW-advanced': 0.11,
  'EU-start': 0.03,
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
  'GET:company.openapi.com/EU-start',
  'GET:company.openapi.com/AT-advanced',
  'GET:company.openapi.com/BE-advanced',
  'GET:company.openapi.com/CH-advanced',
  'GET:company.openapi.com/DE-advanced',
  'GET:company.openapi.com/ES-advanced',
  'GET:company.openapi.com/FR-advanced',
  'GET:company.openapi.com/FR-search',
  'GET:company.openapi.com/GB-advanced',
  'GET:company.openapi.com/PL-advanced',
  'GET:company.openapi.com/PT-advanced',
  'GET:company.openapi.com/WW-start',
  'GET:company.openapi.com/WW-advanced',
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

// Il nome del token porta dentro l'impronta degli scope. Serve perche' il token
// esistente viene riusato finche' e' valido: se si aggiunge un servizio (per dire
// la Germania) senza cambiare nome, per giorni si continuerebbe a usare il vecchio
// token, che quel permesso non ce l'ha, e le chiamate fallirebbero con un errore
// che non spiega niente. Cambiando la lista degli scope cambia il nome, e il token
// nuovo nasce da solo alla prima chiamata.
function improntaScope(): string {
  let h = 0;
  for (const c of SCOPES.join('|')) h = (Math.imul(31, h) + c.charCodeAt(0)) | 0;
  return (h >>> 0).toString(36);
}
const NOME_TOKEN = `mcf-runtime-${improntaScope()}`;

export async function getToken(): Promise<string> {
  if (tokenCache && Date.now() < tokenCache.scade - 60_000) return tokenCache.token;

  const auth = credenziali();
  // Riusa un token nostro ancora valido invece di accumularne uno per avvio
  const lista = await fetch(`${OAUTH}/tokens`, { headers: { Authorization: auth } })
    .then((r) => r.json())
    .catch(() => null);
  const esistente = (lista?.data ?? []).find(
    (t: any) => t?.name === NOME_TOKEN && new Date(t?.expireAt ?? 0).getTime() > Date.now() + 3600_000,
  );
  if (esistente?.token) {
    tokenCache = { token: esistente.token, scade: new Date(esistente.expireAt).getTime() };
    return esistente.token;
  }

  const res = await fetch(`${OAUTH}/tokens`, {
    method: 'POST',
    headers: { Authorization: auth, 'Content-Type': 'application/json' },
    body: JSON.stringify({ name: NOME_TOKEN, scopes: SCOPES }),
  });
  const body = await res.json();
  if (!body?.success || !body?.data?.token) {
    throw new Error(`Token Openapi non creato: ${body?.message ?? res.status}`);
  }
  tokenCache = { token: body.data.token, scade: new Date(body.data.expireAt).getTime() };
  return body.data.token;
}

async function chiama(url: string, servizio: Servizio, init?: RequestInit, ritenta = true): Promise<any> {
  const token = await getToken();
  const res = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init?.headers ?? {}) },
  });
  // 204 = nessun risultato: partita IVA inesistente o non trovata
  if (res.status === 204) return { trovato: false, dati: null };
  const body = await res.json().catch(() => null);
  // Un token appena creato impiega qualche secondo a diventare operativo: la
  // prima chiamata dopo un avvio a freddo puo' tornare "Wrong Token". Si aspetta
  // e si riprova una volta sola, altrimenti l'utente vede un errore fantasma.
  if (ritenta && /wrong token/i.test(String(body?.message ?? ''))) {
    tokenCache = null;
    await new Promise((r) => setTimeout(r, 4000));
    return chiama(url, servizio, init, false);
  }
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

export interface Consumo {
  mese: string;
  chiamate: number;
  totale: number;
  /** Quante chiamate per ciascun servizio: serve al tetto sulla ricerca gratuita */
  perServizio: Record<string, number>;
}

// Il conteggio si legge elencando i blob del mese: una list() a ogni ricerca
// sarebbe uno spreco, quindi il risultato resta caldo un minuto. Il tetto e' una
// barriera contro l'abuso, non un contatore contabile: un minuto di ritardo va bene.
let consumoCache: { chiave: string; dato: Consumo; quando: number } | null = null;

export async function spesaDelMese(mese?: string): Promise<Consumo> {
  const ora = new Date();
  const m = mese ?? `${ora.getFullYear()}-${String(ora.getMonth() + 1).padStart(2, '0')}`;
  if (consumoCache && consumoCache.chiave === m && Date.now() - consumoCache.quando < 60_000) {
    return consumoCache.dato;
  }
  try {
    const { blobs } = await list({ prefix: `openapi/costi/${m}/`, limit: 1000, token: blobToken() });
    let totale = 0;
    const perServizio: Record<string, number> = {};
    for (const b of blobs) {
      const nome = b.pathname.split('/').pop() ?? '';
      const servizio = nome.replace(/^\d+-/, '').replace(/-[a-zA-Z0-9]+\.json$/, '.json').replace(/\.json$/, '');
      totale += (COSTI as Record<string, number>)[servizio] ?? 0;
      perServizio[servizio] = (perServizio[servizio] ?? 0) + 1;
    }
    const dato: Consumo = { mese: m, chiamate: blobs.length, totale: Math.round(totale * 100) / 100, perServizio };
    consumoCache = { chiave: m, dato, quando: Date.now() };
    return dato;
  } catch {
    return { mese: m, chiamate: 0, totale: 0, perServizio: {} };
  }
}

// --- tetto di spesa ----------------------------------------------------------
// Gli endpoint aperti al tool Marotta spendono soldi veri: senza un tetto, un
// abuso si accorge solo il wallet. Il tetto e' server-side e si configura da env,
// cosi' si stringe o si allarga senza toccare il codice.
//
//   OPENAPI_TETTO_MESE      euro di spesa a pagamento nel mese (default 30)
//   OPENAPI_TETTO_RICERCHE  chiamate IT-advanced nel mese (default 400)
//
// IT-advanced ha 30 chiamate al mese incluse e poi costa pochi centesimi: il suo
// tetto e' sul numero di chiamate, non sugli euro, altrimenti non si fermerebbe mai.
const numeroEnv = (chiave: string, difetto: number): number => {
  const v = Number(import.meta.env[chiave as keyof ImportMetaEnv]);
  return Number.isFinite(v) && v > 0 ? v : difetto;
};

export interface EsitoTetto {
  ok: boolean;
  motivo?: string;
  /** Consumo del mese al momento del controllo, per i log e per la UI */
  consumo: Consumo;
}

/** Controlla se c'e' ancora budget per una chiamata a un dato servizio. */
export async function entroIlTetto(servizio: Servizio): Promise<EsitoTetto> {
  const consumo = await spesaDelMese();
  if (COSTI[servizio] === 0) {
    const tetto = numeroEnv('OPENAPI_TETTO_RICERCHE', 400);
    const fatte = consumo.perServizio[servizio] ?? 0;
    if (fatte >= tetto) {
      return { ok: false, motivo: `tetto ricerche del mese raggiunto (${fatte}/${tetto})`, consumo };
    }
    return { ok: true, consumo };
  }
  const tetto = numeroEnv('OPENAPI_TETTO_MESE', 30);
  if (consumo.totale >= tetto) {
    return { ok: false, motivo: `tetto di spesa del mese raggiunto (${consumo.totale} / ${tetto} euro)`, consumo };
  }
  return { ok: true, consumo };
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

// --- ricerca base (IT-advanced) ----------------------------------------------
// Serve al tool Marotta, che prima leggeva Cerved. E' la meta' gratuita del
// flusso a due tempi: qui c'e' tutto quello che non costa, l'approfondimento
// (patrimonio netto vero e punteggio di rischio) resta una chiamata a parte.
//
// ATTENZIONE al campo netWorth di IT-advanced: NON e' il patrimonio netto, e'
// l'utile d'esercizio dell'anno indicato. Verificato su quattro aziende contro il
// bilancio completo: su Latteria di Soligo advanced dice 22.946, che nel bilancio
// e' l'utile (IIC179), mentre il patrimonio netto vero e' 11.342.637. Su Officina
// Creativa advanced (2023) dice 1.489, che nel bilancio 2024 e' l'utile del 2023
// portato a nuovo. E' un difetto loro, ma e' costante: qui lo trattiamo per
// quello che e', cioe' l'utile.

const TTL_RICERCA = 30 * 24 * 60 * 60 * 1000;

export interface RicercaBase {
  trovata: boolean;
  piva: string;
  /** 'openapi' chiamata fresca, 'cache' gia' vista, 'scheda' derivata da una scheda completa gia' pagata */
  fonte: 'openapi' | 'cache' | 'scheda';
  ragioneSociale: string | null;
  formaGiuridica: string | null;
  stato: string | null;
  ateco: string | null;
  indirizzo: string | null;
  provincia: string | null;
  pec: string | null;
  inizioAttivita: string | null;
  iscrizioneRegistro: string | null;
  annoBilancio: number | null;
  fatturato: number | null;
  /** Utile d'esercizio: e' il netWorth di IT-advanced, vedi nota sopra */
  utile: number | null;
  dipendenti: number | null;
  capitaleSociale: number | null;
  totaleAttivo: number | null;
  /** Solo se la scheda completa era gia' in cache: patrimonio netto vero e rating */
  patrimonioNetto: number | null;
  punteggio: { rating: string | null; classe: string | null; descrizione: string | null } | null;
  storico: { anno: number; fatturato: number | null; utile: number | null }[];
}

/** "10512" -> "10.51.2", "822" -> "82.2". Il tool Marotta confronta prefissi puntati. */
function atecoPuntato(code: string): string {
  if (code.length < 3) return code;
  const testa = code.slice(0, 2) + '.' + code.slice(2, 4);
  return code.length > 4 ? `${testa}.${code.slice(4)}` : testa;
}

function componiAteco(A: any): string | null {
  const a = A?.atecoClassification ?? {};
  const scelta = a.ateco ?? a.ateco2007 ?? a.ateco2022;
  if (!scelta?.code) return null;
  const desc = String(scelta.description ?? '').trim();
  return desc ? `${atecoPuntato(String(scelta.code))} - ${desc}` : atecoPuntato(String(scelta.code));
}

function componiIndirizzo(A: any): { indirizzo: string | null; provincia: string | null } {
  // A volte annidato sotto registeredOffice, a volte piatto: servono i fallback
  const s = A?.address?.registeredOffice ?? A?.address ?? {};
  const via = s.streetName ?? [s.toponym, s.street, s.streetNumber].filter(Boolean).join(' ');
  const testo = [via, s.zipCode, s.town, s.province ? `(${s.province})` : '']
    .map((x: any) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return { indirizzo: testo || null, provincia: s.province ?? null };
}

const num = (v: any): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);

function normalizza(A: any, piva: string, fonte: RicercaBase['fonte']): RicercaBase {
  const b = A?.balanceSheets?.last ?? {};
  // Un bilancio con ricavi, utile e attivo tutti a zero non e' un pareggio: e' un
  // bilancio non depositato o vuoto. Passarlo come "utile = 0" farebbe scattare
  // nel tool il criterio "pareggio", cioe' un giudizio su un dato che non esiste.
  const vuoto = !num(b.turnover) && !num(b.netWorth) && !num(b.totalAssets);
  const { indirizzo, provincia } = componiIndirizzo(A);
  return {
    trovata: true,
    piva,
    fonte,
    ragioneSociale: A?.companyName ?? null,
    formaGiuridica: A?.detailedLegalForm?.description ?? null,
    stato: A?.activityStatus ?? null,
    ateco: componiAteco(A),
    indirizzo,
    provincia,
    pec: A?.pec ?? null,
    inizioAttivita: A?.startDate ?? null,
    iscrizioneRegistro: A?.registrationDate ?? null,
    annoBilancio: vuoto ? null : num(b.year),
    fatturato: vuoto ? null : num(b.turnover),
    utile: vuoto ? null : num(b.netWorth),
    dipendenti: num(b.employees),
    capitaleSociale: num(b.shareCapital),
    totaleAttivo: vuoto ? null : num(b.totalAssets),
    patrimonioNetto: null,
    punteggio: null,
    // Le annate senza niente dentro (tutti zeri) sono bilanci non depositati:
    // tenerle darebbe l'impressione di un fatturato a zero, che e' un'altra cosa.
    storico: (A?.balanceSheets?.all ?? [])
      .filter((r: any) => num(r?.year) && ((num(r?.turnover) ?? 0) > 0 || (num(r?.netWorth) ?? 0) !== 0))
      .map((r: any) => ({ anno: r.year, fatturato: num(r.turnover), utile: num(r.netWorth) })),
  };
}

async function ricercaDallaCache(piva: string): Promise<RicercaBase | null> {
  try {
    const { blobs } = await list({ prefix: `openapi/ricerche/${piva}.json`, limit: 1, token: blobToken() });
    if (!blobs.length) return null;
    if (Date.now() - new Date(blobs[0].uploadedAt).getTime() > TTL_RICERCA) return null;
    const b = await get(blobs[0].pathname, { access: 'private', token: blobToken() });
    if (!b) return null;
    return { ...JSON.parse(await new Response(b.stream).text()), fonte: 'cache' as const };
  } catch {
    return null;
  }
}

/**
 * Anagrafica e ultimo bilancio sintetico. Costa una chiamata IT-advanced, che ha
 * 30 pezzi al mese inclusi e poi vale pochi centesimi.
 *
 * Se la scheda completa della stessa azienda e' gia' in cache (qualcuno l'ha
 * analizzata da /tools/valutazione), la ricerca non chiama nessuno e restituisce
 * in piu' il patrimonio netto vero e il punteggio di rischio: sono dati gia'
 * pagati, tenerli nascosti non farebbe risparmiare niente.
 */
export async function ricercaBase(piva: string): Promise<RicercaBase> {
  const scheda = await dallaCache(piva);
  if (scheda?.advanced) {
    const r = normalizza(scheda.advanced, piva, 'scheda');
    const eco = scheda.full?.ecofin ?? {};
    r.patrimonioNetto = num(eco.netWorth);
    if (scheda.score) {
      r.punteggio = {
        rating: scheda.score.rating ?? null,
        classe: scheda.score.risk_score ?? null,
        descrizione: scheda.score.risk_score_description ?? null,
      };
    }
    return r;
  }

  const inCache = await ricercaDallaCache(piva);
  if (inCache) return inCache;

  const res = await chiama(`${COMPANY}/IT-advanced/${piva}`, 'IT-advanced');
  if (!res.trovato || !res.dati) {
    return {
      trovata: false, piva, fonte: 'openapi', ragioneSociale: null, formaGiuridica: null, stato: null,
      ateco: null, indirizzo: null, provincia: null, pec: null, inizioAttivita: null, iscrizioneRegistro: null,
      annoBilancio: null, fatturato: null, utile: null, dipendenti: null, capitaleSociale: null,
      totaleAttivo: null, patrimonioNetto: null, punteggio: null, storico: [],
    };
  }
  const r = normalizza(res.dati, piva, 'openapi');
  try {
    await put(`openapi/ricerche/${piva}.json`, JSON.stringify(r), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 60, token: blobToken(),
    });
  } catch {
    /* la cache che non scrive non e' un errore bloccante */
  }
  return r;
}

// --- ricerca estera (WW-advanced) --------------------------------------------
// Un endpoint solo per tutti i paesi: `WW-advanced/{paese}/{identificativo}`.
// Verificato che su una stessa azienda risponde identico all'endpoint del singolo
// paese (Siemens su WW-advanced/DE e su DE-advanced tornano cifra per cifra
// uguali), quindi non servono nove integrazioni.
//
// ATTENZIONE: lo schema cambia da paese a paese, perche' il canale worldwide
// instrada al dataset nazionale. Germania, Spagna e Brasile rispondono con
// `operatingRevenue` / `equity` / `totalAssets`; la Francia con `turnover` /
// `ebitda` e SENZA `equity`. Da qui i fallback qui sotto.
//
// E il campo `netWorth` fa lo stesso scherzo dell'Italia: e' l'utile d'esercizio,
// non il patrimonio netto. Su Siemens netWorth vale 9,6 miliardi e equity 68,4;
// su Vale 4,7 contro 33,2; su Banco Santander 13,7 contro 107,3. Il patrimonio
// netto si legge da `equity` e da nessun altro posto.

export interface RicercaEstera {
  trovata: boolean;
  paese: string;
  identificativo: string;
  fonte: 'openapi' | 'cache';
  ragioneSociale: string | null;
  formaGiuridica: string | null;
  stato: string | null;
  classificazione: string | null;
  indirizzo: string | null;
  inizioAttivita: string | null;
  annoBilancio: number | null;
  fatturato: number | null;
  /** Patrimonio netto vero: solo da `equity`, mai da `netWorth` */
  patrimonioNetto: number | null;
  /** Utile d'esercizio: e' il campo `netWorth` di Openapi, vedi nota sopra */
  utile: number | null;
  totaleAttivo: number | null;
  dipendenti: number | null;
  /** Indicatore di solvibilita', dove il paese lo pubblica (Francia) */
  solvibile: boolean | null;
  storico: { anno: number; fatturato: number | null; utile: number | null }[];
}

function classificazioneEstera(d: any): string | null {
  const c = d?.internationalClassification ?? {};
  const scelta = c.nace ?? c.naf ?? c.naics ?? c.sic;
  if (!scelta?.code) return null;
  const desc = String(scelta.description ?? '').trim();
  return desc ? `${scelta.code} - ${desc}` : String(scelta.code);
}

function indirizzoEstero(d: any): string | null {
  const s = d?.address?.registeredOffice ?? d?.address ?? {};
  const via = s.streetName ?? [s.street, s.streetNumber].filter(Boolean).join(' ');
  const testo = [via, s.zipCode, s.town, s.country ? `(${s.country})` : '']
    .map((x: any) => String(x ?? '').trim())
    .filter(Boolean)
    .join(' ')
    .trim();
  return testo || null;
}

function normalizzaEstera(d: any, paese: string, id: string, fonte: RicercaEstera['fonte']): RicercaEstera {
  const b = d?.balanceSheets?.last ?? {};
  const fatturato = num(b.turnover) ?? num(b.operatingRevenue);
  const vuoto = !fatturato && !num(b.equity) && !num(b.totalAssets) && !num(b.netWorth);
  const data = d?.incorporationDate ?? d?.registrationDate ?? null;
  return {
    trovata: true,
    paese,
    identificativo: id,
    fonte,
    ragioneSociale: d?.companyName ?? null,
    formaGiuridica: d?.detailedLegalForm?.description ?? d?.detailedLegalForm?.code ?? null,
    stato: d?.activityStatus ?? null,
    classificazione: classificazioneEstera(d),
    indirizzo: indirizzoEstero(d),
    inizioAttivita: typeof data === 'string' ? data.slice(0, 10) : null,
    annoBilancio: vuoto ? null : num(b.year),
    fatturato: vuoto ? null : fatturato,
    patrimonioNetto: vuoto ? null : num(b.equity),
    utile: vuoto ? null : num(b.netWorth),
    totaleAttivo: vuoto ? null : num(b.totalAssets),
    dipendenti: num(b.employees),
    solvibile: d?.creditWorthy == null ? null : Boolean(d.creditWorthy),
    storico: (d?.balanceSheets?.all ?? [])
      .filter((r: any) => num(r?.year) && ((num(r?.turnover) ?? num(r?.operatingRevenue) ?? 0) > 0 || (num(r?.netWorth) ?? 0) !== 0))
      .map((r: any) => ({
        anno: r.year,
        fatturato: num(r.turnover) ?? num(r.operatingRevenue),
        utile: num(r.netWorth),
      })),
  };
}

/** Chiave di cache: l'identificativo puo' contenere punti e barre (il CNPJ brasiliano) */
const chiaveEstera = (paese: string, id: string) =>
  `openapi/estero/${paese.toUpperCase()}-${id.replace(/[^A-Za-z0-9]/g, '')}.json`;

/**
 * Anagrafica e bilancio di una controparte estera. Costa una chiamata WW-advanced,
 * 0,11 EUR di listino: all'estero non c'e' la franchigia mensile che c'e' sull'Italia,
 * quindi si paga dal primo pezzo. Cache 30 giorni come sull'italiano.
 */
export async function ricercaEstera(paese: string, id: string): Promise<RicercaEstera> {
  const P = paese.toUpperCase();
  const chiave = chiaveEstera(P, id);

  try {
    const { blobs } = await list({ prefix: chiave, limit: 1, token: blobToken() });
    if (blobs.length && Date.now() - new Date(blobs[0].uploadedAt).getTime() <= TTL_RICERCA) {
      const b = await get(blobs[0].pathname, { access: 'private', token: blobToken() });
      if (b) return { ...JSON.parse(await new Response(b.stream).text()), fonte: 'cache' as const };
    }
  } catch {
    /* cache assente o illeggibile: si prosegue con la chiamata */
  }

  const res = await chiama(`${COMPANY}/WW-advanced/${P}/${encodeURIComponent(id)}`, 'WW-advanced');
  if (!res.trovato || !res.dati) {
    return {
      trovata: false, paese: P, identificativo: id, fonte: 'openapi', ragioneSociale: null,
      formaGiuridica: null, stato: null, classificazione: null, indirizzo: null, inizioAttivita: null,
      annoBilancio: null, fatturato: null, patrimonioNetto: null, utile: null, totaleAttivo: null,
      dipendenti: null, solvibile: null, storico: [],
    };
  }
  const r = normalizzaEstera(res.dati, P, id, 'openapi');
  try {
    await put(chiave, JSON.stringify(r), {
      access: 'private', addRandomSuffix: false, allowOverwrite: true,
      contentType: 'application/json', cacheControlMaxAge: 60, token: blobToken(),
    });
  } catch {
    /* la cache che non scrive non e' un errore bloccante */
  }
  return r;
}
