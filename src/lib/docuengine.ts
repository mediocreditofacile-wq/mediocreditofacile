// Documenti ufficiali (visura camerale e bilancio depositato) via Openapi DocuEngine.
// SERVER-ONLY: passa dal token Openapi e dallo store Blob privato.
//
// Flusso DocuEngine, verificato su una richiesta vera il 07/10/2026:
//   POST /requests {documentId, search}  -> {id, state, results?}
//   bilancio: la ricerca (0,10) risponde subito con tutti gli esercizi depositati
//             e state SEARCH; PATCH /requests/{id} {resultId} sceglie l'esercizio
//             e fa partire il documento (4,40). Un esercizio per richiesta.
//   GET  /requests/{id}                  -> state, finche' arriva DONE
//   GET  /requests/{id}/documents        -> [{downloadUrl, fileName, mimeType, urlExpire}]
// Il downloadUrl scade: il file si scarica subito e si tiene nello store privato,
// cosi' resta consultabile e il riuso non ripassa da Openapi.
//
// Le regole (archivio o nuovo ordine, scelta della visura) stanno in
// documenti-ufficiali.ts, che e' puro e testato.

import { put, get, list } from '@vercel/blob';
import { chiamaOpenapi, getToken, schedaDallaCache, type Servizio } from './openapi';
import {
  VISURA, BILANCIO, TTL_VISURA, tipoVisura, anniDaRicerca, avanzamento, decidi,
  resultIdRiusabile, anniValidi,
  type IndiceDocumenti, type OrdineDocumento, type OrdineVisura, type OrdineBilancio,
  type FileArchiviato, type AnnoBilancio, type TipoVisura,
} from './documenti-ufficiali';

const DOCUENGINE = 'https://docuengine.openapi.com';
const blobToken = () => import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;

const cartella = (piva: string) => `openapi/documenti/${piva}/`;
const cartellaIndice = (piva: string) => `${cartella(piva)}indice/`;
/** Primo formato, un file unico sovrascritto: resta leggibile come punto di partenza */
const indiceStorico = (piva: string) => `${cartella(piva)}indice.json`;

/** Un percorso di file e' leggibile solo se sta nella cartella di quella partita IVA. */
export function percorsoAmmesso(piva: string, percorso: string): boolean {
  return /^\d{11}$/.test(piva)
    && percorso.startsWith(cartella(piva))
    && !percorso.includes('..')
    && !percorso.startsWith(cartellaIndice(piva))
    && !percorso.endsWith('indice.json');
}

// --- indice --------------------------------------------------------------------
// L'indice NON si sovrascrive: ogni aggiornamento e' un file nuovo con l'ora nel
// nome, e si legge il piu' recente. Il motivo e' pagato: lo store Blob serve un
// file sovrascritto dalla cache per circa un minuto, e l'opzione useCache:false
// che doveva evitarlo e' dichiarata senza effetto nella versione installata.
// Il 07/10/2026 un bilancio appena ordinato non risultava nell'indice riletto
// cinque secondi dopo. Un percorso mai letto prima non ha copie in cache.
// list() invece interroga l'elenco, non la cache, e vede subito il file nuovo.

async function leggiJson(percorso: string): Promise<any | null> {
  try {
    const b = await get(percorso, { access: 'private', token: blobToken() });
    return b?.stream ? JSON.parse(await new Response(b.stream).text()) : null;
  } catch {
    return null;
  }
}

export async function leggiIndice(piva: string): Promise<IndiceDocumenti> {
  try {
    const { blobs } = await list({ prefix: cartellaIndice(piva), limit: 1000, token: blobToken() });
    // il nome comincia con l'ora a 13 cifre: l'ordine alfabetico e' quello cronologico
    const ultimo = blobs.map((b) => b.pathname).sort().pop();
    if (ultimo) {
      const i = await leggiJson(ultimo);
      if (i) return i;
    }
  } catch {
    /* elenco non disponibile: si prova il formato storico */
  }
  return (await leggiJson(indiceStorico(piva))) ?? { piva };
}

/** Scrive una nuova versione dell'indice, applicando la modifica all'ultima letta. */
async function aggiornaIndice(piva: string, modifica: (i: IndiceDocumenti) => void): Promise<IndiceDocumenti> {
  const indice = await leggiIndice(piva);
  modifica(indice);
  await put(`${cartellaIndice(piva)}${Date.now()}.json`, JSON.stringify(indice), {
    access: 'private',
    addRandomSuffix: true,
    contentType: 'application/json',
    token: blobToken(),
  });
  return indice;
}

// --- dati dell'azienda -----------------------------------------------------------
// REA, Camera di Commercio e forma giuridica si prendono dalla scheda gia' pagata,
// mai dal browser: chi ordina una visura deve averla aperta, e i dati che decidono
// quale documento pagare non devono poter arrivare sbagliati dal client.

export interface DatiAzienda {
  piva: string;
  ragioneSociale: string;
  rea: string | null;
  cciaa: string | null;
  formaCodice: string | null;
  formaDescrizione: string | null;
  tipoVisura: TipoVisura;
}

export async function datiAzienda(piva: string): Promise<DatiAzienda | null> {
  const s = await schedaDallaCache(piva);
  if (!s?.trovata) return null;
  const F = s.full ?? {}, A = s.advanced ?? {};
  const det = F.companyDetails ?? {};
  const formaCodice = A.detailedLegalForm?.code ?? F.legalForm?.detailedLegalForm?.code ?? null;
  return {
    piva,
    ragioneSociale: String(det.companyName ?? A.companyName ?? '').trim(),
    rea: String(det.reaCode ?? A.reaCode ?? '').trim() || null,
    cciaa: String(det.cciaa ?? A.cciaa ?? '').trim().toUpperCase() || null,
    formaCodice,
    formaDescrizione: A.detailedLegalForm?.description ?? null,
    tipoVisura: tipoVisura(formaCodice),
  };
}

// --- chiamate DocuEngine -----------------------------------------------------------

/** Stato di una richiesta: lettura gratuita, quindi fuori dal registro spesa. */
async function statoRichiesta(id: string): Promise<{ state: string; dati: any }> {
  const token = await getToken();
  const res = await fetch(`${DOCUENGINE}/requests/${encodeURIComponent(id)}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(`DocuEngine stato: ${body?.message ?? res.status}`);
  return { state: String(body?.data?.state ?? ''), dati: body?.data };
}

/** Scarica i file di una richiesta evasa e li mette nello store privato. */
async function archiviaFile(piva: string, richiestaId: string, prefisso: string): Promise<FileArchiviato[]> {
  const token = await getToken();
  const res = await fetch(`${DOCUENGINE}/requests/${encodeURIComponent(richiestaId)}/documents`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.success === false) throw new Error(`DocuEngine documenti: ${body?.message ?? res.status}`);
  const elenco: any[] = Array.isArray(body?.data) ? body.data : body?.data ? [body.data] : [];
  if (!elenco.length) throw new Error('DocuEngine: richiesta evasa ma senza documenti');

  const file: FileArchiviato[] = [];
  for (const [i, d] of elenco.entries()) {
    if (!d?.downloadUrl) continue;
    const r = await fetch(String(d.downloadUrl));
    if (!r.ok) throw new Error(`DocuEngine: download fallito (${r.status})`);
    const dati = Buffer.from(await r.arrayBuffer());
    const mime = String(d.mimeType ?? r.headers.get('content-type') ?? 'application/pdf');
    const est = (String(d.fileName ?? '').match(/\.([a-z0-9]{2,5})$/i)?.[1] ?? (mime.includes('zip') ? 'zip' : 'pdf')).toLowerCase();
    const percorso = `${cartella(piva)}${prefisso}${elenco.length > 1 ? `-${i + 1}` : ''}.${est}`;
    await put(percorso, dati, {
      access: 'private',
      addRandomSuffix: false,
      allowOverwrite: true,
      contentType: mime,
      token: blobToken(),
    });
    file.push({ percorso, nome: String(d.fileName ?? `${prefisso}.${est}`), mime, dimensione: dati.byteLength });
  }
  if (!file.length) throw new Error('DocuEngine: nessun file scaricabile');
  return file;
}

/**
 * Porta avanti un ordine in attesa: legge lo stato e, se e' evaso, archivia i
 * file. Ritorna l'ordine aggiornato (non lo scrive: lo fa chi chiama).
 */
async function avanza(piva: string, ordine: OrdineDocumento, prefisso: string): Promise<OrdineDocumento> {
  if (ordine.stato !== 'attesa') return ordine;
  const { state, dati } = await statoRichiesta(ordine.richiestaId);
  const esito = avanzamento(state);
  if (esito === 'attesa') return { ...ordine, statoDocuengine: state };
  if (esito === 'errore') {
    return { ...ordine, stato: 'errore', statoDocuengine: state, errore: String(dati?.error ?? dati?.message ?? state), concluso: new Date().toISOString() };
  }
  const file = await archiviaFile(piva, ordine.richiestaId, prefisso);
  return { ...ordine, stato: 'pronto', statoDocuengine: state, file, concluso: new Date().toISOString() };
}

const prefissoVisura = (o: OrdineDocumento) => `visura-${o.avviato.slice(0, 10)}`;
const prefissoBilancio = (o: OrdineBilancio) => `bilancio-${o.anno}-${o.balanceSheetId}`;

// --- visura ----------------------------------------------------------------------

export async function ordinaVisura(piva: string): Promise<{ ordine: OrdineVisura; daArchivio: boolean }> {
  const az = await datiAzienda(piva);
  if (!az) throw new Error('Apri prima la scheda dell\'azienda: REA e forma giuridica arrivano da li\'');
  if (!az.rea || !az.cciaa) throw new Error('La scheda non riporta numero REA e Camera di Commercio: la visura non si puo\' chiedere');

  const indice = await leggiIndice(piva);
  const d = decidi(indice.visura, TTL_VISURA);
  if (d.azione === 'archivio') return { ordine: d.ordine as OrdineVisura, daArchivio: true };
  if (d.azione === 'attendi') return { ordine: await statoVisura(piva), daArchivio: false };

  const v = VISURA[az.tipoVisura];
  const servizio = `DOC-visura-${az.tipoVisura}` as Servizio;
  const r = await chiamaOpenapi(`${DOCUENGINE}/requests`, servizio, {
    method: 'POST',
    body: JSON.stringify({ documentId: v.documentId, search: { field0: az.rea, field1: az.cciaa } }),
  });
  const id = r?.dati?.id;
  if (!id) throw new Error('DocuEngine non ha restituito un id per la visura');
  const ordine: OrdineVisura = {
    richiestaId: String(id),
    avviato: new Date().toISOString(),
    stato: 'attesa',
    statoDocuengine: String(r.dati.state ?? ''),
    tipo: az.tipoVisura,
  };
  // l'id si salva appena l'ordine e' partito: un ricaricamento a meta' attesa non lo perde
  await aggiornaIndice(piva, (i) => { i.visura = ordine; });
  console.log(JSON.stringify({ evento: 'visura_ordinata', piva, tipo: az.tipoVisura, id: ordine.richiestaId, motivo: d.motivo }));
  return { ordine, daArchivio: false };
}

export async function statoVisura(piva: string): Promise<OrdineVisura> {
  const indice = await leggiIndice(piva);
  if (!indice.visura) throw new Error('Nessuna visura ordinata per questa partita IVA');
  if (indice.visura.stato !== 'attesa') return indice.visura;
  const nuovo = (await avanza(piva, indice.visura, prefissoVisura(indice.visura))) as OrdineVisura;
  if (nuovo.stato !== 'attesa' || nuovo.statoDocuengine !== indice.visura.statoDocuengine) {
    await aggiornaIndice(piva, (i) => { if (i.visura?.richiestaId === nuovo.richiestaId) i.visura = nuovo; });
  }
  if (nuovo.stato === 'pronto') console.log(JSON.stringify({ evento: 'visura_pronta', piva, id: nuovo.richiestaId }));
  return nuovo;
}

// --- bilanci ---------------------------------------------------------------------

/** Ricerca degli esercizi depositati (0,10). */
export async function cercaBilanci(piva: string): Promise<AnnoBilancio[]> {
  const r = await chiamaOpenapi(`${DOCUENGINE}/requests`, 'DOC-bilancio-ricerca', {
    method: 'POST',
    body: JSON.stringify({ documentId: BILANCIO.documentId, search: { field0: piva } }),
  });
  const id = r?.dati?.id;
  const anni = anniDaRicerca(r?.dati?.results);
  if (!id) throw new Error('DocuEngine non ha restituito un id per la ricerca dei bilanci');
  await aggiornaIndice(piva, (i) => {
    i.ricerca = { richiestaId: String(id), quando: new Date().toISOString(), anni, usata: false };
  });
  console.log(JSON.stringify({ evento: 'bilanci_cercati', piva, id, anni: anni.length }));
  return anni;
}

/** Esercizi da mostrare: dall'ultima ricerca se recente, altrimenti null (serve cercare). */
export function anniInArchivio(indice: IndiceDocumenti): AnnoBilancio[] | null {
  return anniValidi(indice.ricerca);
}

export async function ordinaBilancio(piva: string, balanceSheetId: string): Promise<{ ordine: OrdineBilancio; daArchivio: boolean }> {
  let indice = await leggiIndice(piva);
  // Il bilancio di un esercizio chiuso non cambia piu': si riusa senza scadenza
  const d = decidi(indice.bilanci?.[balanceSheetId], null);
  if (d.azione === 'archivio') return { ordine: d.ordine as OrdineBilancio, daArchivio: true };
  if (d.azione === 'attendi') return { ordine: await statoBilancio(piva, balanceSheetId), daArchivio: false };

  // Serve una ricerca pagata e non ancora usata che contenga quell'esercizio
  let resultId = resultIdRiusabile(indice.ricerca, balanceSheetId);
  if (!resultId) {
    await cercaBilanci(piva);
    indice = await leggiIndice(piva);
    resultId = resultIdRiusabile(indice.ricerca, balanceSheetId);
    if (!resultId) throw new Error('Esercizio non trovato fra i bilanci depositati');
  }
  const ricerca = indice.ricerca!;
  const anno = ricerca.anni.find((a) => a.balanceSheetId === balanceSheetId)!;

  const r = await chiamaOpenapi(`${DOCUENGINE}/requests/${encodeURIComponent(ricerca.richiestaId)}`, 'DOC-bilancio', {
    method: 'PATCH',
    body: JSON.stringify({ resultId }),
  });
  const ordine: OrdineBilancio = {
    richiestaId: ricerca.richiestaId,
    avviato: new Date().toISOString(),
    stato: 'attesa',
    statoDocuengine: String(r?.dati?.state ?? ''),
    anno: anno.anno,
    data: anno.data,
    tipo: anno.tipo,
    balanceSheetId,
  };
  await aggiornaIndice(piva, (i) => {
    i.bilanci = { ...(i.bilanci ?? {}), [balanceSheetId]: ordine };
    if (i.ricerca?.richiestaId === ordine.richiestaId) i.ricerca.usata = true;
  });
  console.log(JSON.stringify({ evento: 'bilancio_ordinato', piva, anno: anno.anno, id: ordine.richiestaId }));
  return { ordine, daArchivio: false };
}

export async function statoBilancio(piva: string, balanceSheetId: string): Promise<OrdineBilancio> {
  const indice = await leggiIndice(piva);
  const attuale = indice.bilanci?.[balanceSheetId];
  if (!attuale) throw new Error('Nessun bilancio ordinato per quell\'esercizio');
  if (attuale.stato !== 'attesa') return attuale;
  const nuovo = (await avanza(piva, attuale, prefissoBilancio(attuale))) as OrdineBilancio;
  if (nuovo.stato !== 'attesa' || nuovo.statoDocuengine !== attuale.statoDocuengine) {
    await aggiornaIndice(piva, (i) => {
      if (i.bilanci?.[balanceSheetId]?.richiestaId === nuovo.richiestaId) i.bilanci[balanceSheetId] = nuovo;
    });
  }
  if (nuovo.stato === 'pronto') console.log(JSON.stringify({ evento: 'bilancio_pronto', piva, anno: nuovo.anno, id: nuovo.richiestaId }));
  return nuovo;
}

// --- consegna --------------------------------------------------------------------

export async function leggiFile(percorso: string) {
  return get(percorso, { access: 'private', token: blobToken() });
}
