// Pannello "Documenti ufficiali" della scheda di /tools/valutazione: tre schede,
// visura camerale, bilanci depositati e protesti, servite da /api/documenti-ufficiali.
// Ogni pulsante che spende porta il prezzo scritto sopra; quello che e' gia'
// stato pagato si riapre dall'archivio senza costo.
//
// La scheda Protesti mette insieme due fonti: il dettaglio della verifica eventi
// negativi, gia' pagato con la scheda (gratis da rileggere), e la visura ufficiale
// del Registro dei protesti, che si ordina a parte. Quando la visura c'e', per i
// protesti fa fede lei: il 14/10/2026 la verifica vedeva un assegno, la visura tre.
//
// Il pannello ascolta due eventi sul proprio elemento radice, lanciati dalla scheda:
//   'verifiche-aggiornate'  una verifica eventi negativi e' appena arrivata: si ricarica
//   'apri-scheda'           detail = 'protesti' | 'visura' | 'bilanci': cambia scheda

import { leggiEventiNegativi, sintesiEventi, conEventi, senzaProtesti, confrontoVerificaVisura } from '../lib/eventi-negativi';
import { htmlEventi } from './eventi-negativi-html';

type Api = (path: string, init?: RequestInit) => Promise<any>;
type Scheda = 'visura' | 'bilanci' | 'protesti';

const ATTESA_MS = 5000;
const TENTATIVI = 72;          // sei minuti: DocuEngine evade di solito in pochi secondi
const ANNI_VISIBILI = 6;

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
const euro = (n: number | null | undefined) =>
  n == null ? '' : `${n.toLocaleString('it-IT', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} €`;
const data = (iso?: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '');

/** Un pulsante per file: il bilancio arriva come PDF depositato piu' il file XBRL. */
const bottoniFile = (file: any[]) => file.map((f: any) => {
  const est = String(f.percorso).split('.').pop()?.toUpperCase() ?? 'PDF';
  return `<button type="button" class="val-btn val-btn--2" data-scarica="${esc(f.percorso)}">Scarica ${esc(est)}</button>`;
}).join('');

const TIPO_VISURA: Record<string, string> = {
  capitale: 'società di capitali',
  persone: 'società di persone',
  individuale: 'impresa individuale',
};

interface Stato {
  piva: string;
  api: Api;
  chiave: () => string;
  radice: HTMLElement;
  arch: any;
  scheda: Scheda;
  tuttiGliAnni: boolean;
  messaggio: string;
  /** Chiamata a ogni archivio letto: la scheda ne prende le visure protesti per sé e per il PDF */
  suArchivio?: (arch: any) => void;
}

/** Monta il pannello dentro `radice` e carica l'archivio della partita IVA. */
export async function montaDocumenti(radice: HTMLElement, piva: string, api: Api, chiave: () => string, suArchivio?: (arch: any) => void) {
  const st: Stato = { piva, api, chiave, radice, arch: null, scheda: 'visura', tuttiGliAnni: false, messaggio: '', suArchivio };
  radice.innerHTML = '<span class="attesa">carico l\'archivio…</span>';
  radice.addEventListener('verifiche-aggiornate', () => { ricarica(st); });
  radice.addEventListener('apri-scheda', (e) => {
    const k = (e as CustomEvent).detail as Scheda;
    if (!['visura', 'bilanci', 'protesti'].includes(k)) return;
    st.scheda = k;
    st.messaggio = '';
    if (st.arch) disegna(st);
  });
  await ricarica(st);
  // Un ordine rimasto a meta' (pagina ricaricata durante l'attesa) riprende da solo
  if (st.arch?.visura?.stato === 'attesa') segui(st, 'visura');
  for (const [id, o] of Object.entries<any>(st.arch?.bilanci ?? {})) if (o.stato === 'attesa') segui(st, 'bilancio', id);
  if (st.arch?.protesti?.ordine?.stato === 'attesa') segui(st, 'protesti');
  for (const p of st.arch?.protesti?.persone ?? []) if (p.ordine?.stato === 'attesa') segui(st, 'protesti-persona', p.cf);
}

async function ricarica(st: Stato) {
  const r = await st.api(`/api/documenti-ufficiali?piva=${st.piva}`).catch((e) => ({ errore: String(e) }));
  if (r?.errore) { st.radice.innerHTML = `<span class="vuoto">${esc(r.errore)}</span>`; return; }
  st.arch = r;
  disegna(st);
  try { st.suArchivio?.(r); } catch { /* la scheda non deve rompere il pannello */ }
}

function disegna(st: Stato) {
  const a = st.arch;
  const tab = (k: Scheda, t: string) =>
    `<button type="button" class="doc-tab${st.scheda === k ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${st.scheda === k}">${t}</button>`;
  // pallino rosso sulla scheda Protesti quando un evento negativo c'e' gia'
  const allarme = eventiPresenti(a) ? ' <span class="doc-allarme" title="Eventi negativi presenti"></span>' : '';
  const pannello = st.scheda === 'visura' ? pannelloVisura(a)
    : st.scheda === 'bilanci' ? pannelloBilanci(a, st.tuttiGliAnni)
    : pannelloProtesti(a);
  st.radice.innerHTML = `<div class="doc-tabs" role="tablist">${tab('visura', 'Visura camerale')}${tab('bilanci', 'Bilanci depositati')}${tab('protesti', `Protesti${allarme}`)}</div>
    <div class="doc-pan">${pannello}</div>
    <p class="doc-msg">${esc(st.messaggio)}</p>`;
  collega(st);
}

const eventiDi = (neg: any) => (neg?.pronto ? leggiEventiNegativi(neg.dati) : null);

function eventiPresenti(a: any): boolean {
  const pr = a?.protesti;
  const di = (x: any) => conEventi(eventiDi(x?.negativita)) || conEventi(x?.visura ?? null);
  return di(pr) || (pr?.persone ?? []).some(di);
}

// --- scheda Protesti -------------------------------------------------------------

/** Esito della verifica eventi negativi in una riga, con la data. */
function esitoVerifica(neg: any): string {
  if (!neg?.id) return '<span class="vuoto">verifica non avviata</span>';
  if (!neg.pronto) return '<span class="attesa">verifica in corso…</span>';
  const e = eventiDi(neg);
  const quando = neg.avviata ? `<span class="gia">verificata il ${data(neg.avviata)}</span>` : '';
  return `<span class="${conEventi(e) ? 'esito-si' : 'esito-no'}">${esc(sintesiEventi(e))}</span>${quando}`;
}

/**
 * Pulsante o file della visura protesti, per l'azienda o per una persona. DocuEngine
 * consegna PDF, XML e JSON con lo stesso contenuto: si offre il PDF, gli altri due
 * restano in archivio (il JSON e' quello che la scheda legge).
 */
function cellaVisuraProtesti(o: any, prezzo: number, attr: string, etichetta: string): string {
  if (o?.stato === 'pronto' && o.file?.length) {
    const scade = new Date(new Date(o.avviato).getTime() + 30 * 864e5);
    const valida = scade.getTime() > Date.now();
    const pdf = o.file.filter((f: any) => /\.pdf$/i.test(f.percorso));
    const file = `<span class="doc-riga"><span>del ${data(o.concluso ?? o.avviato)}</span>${bottoniFile(pdf.length ? pdf : o.file)}</span>`;
    return valida
      ? `${file}<span class="gia">si riapre senza costo fino al ${scade.toLocaleDateString('it-IT')}</span>`
      : `${file}<button type="button" class="val-btn val-btn--2" ${attr}>Aggiorna · ${euro(prezzo)} + IVA</button>`;
  }
  if (o?.stato === 'attesa') return '<span class="attesa">in preparazione…</span>';
  const err = o?.stato === 'errore' ? `<span class="esito-si">ultimo ordine non riuscito${o.errore ? `: ${esc(o.errore)}` : ''}</span> ` : '';
  return `${err}<button type="button" class="val-btn" ${attr}>${etichetta} · ${euro(prezzo)} + IVA</button>`;
}

const titoloCase = (s: string) => s.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

function ruoliPersona(p: any): string {
  return [
    p.quota != null && `socio ${String(p.quota).replace('.', ',')}%`,
    p.amministratore && (p.legaleRappresentante ? 'amministratore, legale rappresentante' : 'amministratore'),
  ].filter(Boolean).join(' · ');
}

/**
 * Dettaglio per un soggetto: i protesti dalla visura se c'e', altrimenti dalla
 * verifica; pregiudizievoli e procedure sempre dalla verifica, che la visura
 * protesti non li copre.
 */
function dettaglioSoggetto(neg: any, visura: any): string {
  const eNeg = eventiDi(neg);
  if (!visura) return conEventi(eNeg) ? htmlEventi(eNeg) : '';
  const altri = senzaProtesti(eNeg);
  return (conEventi(visura) ? htmlEventi(visura) : '') + (conEventi(altri) ? htmlEventi(altri) : '');
}

/** Esito della visura in una riga, con la data. */
function esitoVisura(visura: any, ordine: any): string {
  if (!visura) return '';
  return `<span class="${conEventi(visura) ? 'esito-si' : 'esito-no'}">${esc(sintesiEventi(visura))}</span>`
    + `<span class="gia">dalla visura protesti del ${data(ordine?.concluso ?? ordine?.avviato)}</span>`;
}

function pannelloProtesti(a: any): string {
  const pr = a.protesti ?? {};
  const az = a.azienda;
  const p = a.prezzi;

  // azienda: protesti dalla visura se c'e', altrimenti dalla verifica gia' pagata
  const confronto = confrontoVerificaVisura(eventiDi(pr.negativita), pr.visura);
  let h = '<div class="prot-sez"><div class="prot-tit">Eventi negativi sull\'azienda</div>';
  if (pr.visura) {
    h += `<div>${esitoVisura(pr.visura, pr.ordine)}</div>`
      + (confronto ? `<p class="prot-avviso">${esc(confronto)}</p>` : '')
      + (pr.visura.sintesi?.omonimie ? '<p class="prot-avviso">Il Registro segnala soggetti omonimi con protesti: controlla che non siano attribuiti a questa azienda.</p>' : '')
      + dettaglioSoggetto(pr.negativita, pr.visura)
      + `<div class="prot-verifica">Verifica eventi negativi: ${esitoVerifica(pr.negativita)}</div>`;
  } else {
    h += `<div>${esitoVerifica(pr.negativita)}</div>`
      + dettaglioSoggetto(pr.negativita, null)
      + (pr.negativita?.pronto
        ? '<p class="doc-nota">Letti con la verifica eventi negativi, già pagata con la scheda: rileggerla non costa. La sua banca dati può essere indietro di qualche settimana rispetto al Registro dei protesti; il dato aggiornato al giorno è nella visura ufficiale qui sotto.</p>'
        : '');
  }
  h += '</div>';

  // azienda: visura ufficiale
  h += '<div class="prot-sez"><div class="prot-tit">Visura protesti ufficiale</div>';
  if (!az) h += '<p class="vuoto">Scheda non trovata in archivio: riaprila per ordinare la visura protesti.</p>';
  else if (!az.visuraPossibile) h += '<p class="vuoto">La scheda non riporta numero REA e Camera di Commercio: la visura protesti non si può chiedere da qui.</p>';
  else {
    h += '<p class="doc-nota">Il documento del Registro informatico dei protesti, in PDF: è quello da allegare alla pratica.</p>'
      + `<div class="doc-riga">${cellaVisuraProtesti(pr.ordine, p.protesti, 'data-azione="protesti"', 'Ordina la visura protesti')}</div>`;
  }
  h += '</div>';

  // soci e amministratori
  const persone: any[] = pr.persone ?? [];
  if (persone.length) {
    const righe = persone.map((x) => {
      const nome = x.personaFisica ? titoloCase(`${x.nome} ${x.cognome}`) : x.nome || x.cf;
      const visura = x.personaFisica
        ? cellaVisuraProtesti(x.ordine, p.protestiPersona, `data-protesti-persona="${esc(x.cf)}"`, 'Ordina')
        : '<span class="vuoto">socio società: apri la sua scheda</span>';
      const conf = confrontoVerificaVisura(eventiDi(x.negativita), x.visura);
      const det = dettaglioSoggetto(x.negativita, x.visura) + (conf ? `<p class="prot-avviso">${esc(conf)}</p>` : '');
      const dettaglio = det ? `<tr class="prot-det"><td colspan="3">${det}</td></tr>` : '';
      return `<tr><td><strong>${esc(nome)}</strong><br><span class="cf">${esc(x.cf)}</span>${ruoliPersona(x) ? `<br><span class="ev-sub">${esc(ruoliPersona(x))}</span>` : ''}</td>
        <td>${esitoVerifica(x.negativita)}${x.visura ? `<div class="prot-verifica">${esitoVisura(x.visura, x.ordine)}</div>` : ''}</td>
        <td class="num">${visura}</td></tr>${dettaglio}`;
    }).join('');
    h += `<div class="prot-sez"><div class="prot-tit">Soci e amministratori</div>
      <div class="ev-scroll"><table class="prot-pers"><thead><tr><th>Persona</th><th>Eventi negativi</th><th class="num">Visura protesti</th></tr></thead><tbody>${righe}</tbody></table></div>
      <p class="doc-nota">La verifica eventi negativi su una persona si lancia dalle tabelle Soci e Amministratori più in basso (${euro(0.45)} a persona); l'esito compare anche qui.</p>
    </div>`;
  }
  return h;
}

function pannelloVisura(a: any): string {
  const v = a.visura;
  const az = a.azienda;
  if (!az) return '<p class="vuoto">Scheda non trovata in archivio: riaprila per ordinare la visura.</p>';
  if (!az.visuraPossibile) return '<p class="vuoto">La scheda non riporta numero REA e Camera di Commercio: la visura non si può chiedere da qui.</p>';
  const tipo = TIPO_VISURA[az.tipoVisura] ?? az.tipoVisura;
  let h = `<p class="doc-nota">Visura ordinaria per ${esc(tipo)}${az.forma ? ` (${esc(az.forma.toLowerCase())})` : ''}.</p>`;
  if (v?.stato === 'pronto' && v.file?.length) {
    const scade = new Date(new Date(v.avviato).getTime() + 30 * 864e5);
    const valida = scade.getTime() > Date.now();
    h += `<div class="doc-riga"><span>Visura del ${data(v.concluso ?? v.avviato)}</span>${bottoniFile(v.file)}</div>`;
    h += valida
      ? `<p class="doc-nota">Già pagata: fino al ${scade.toLocaleDateString('it-IT')} si riapre da qui senza costo.</p>`
      : `<button type="button" class="val-btn" data-azione="visura">Ordina una visura aggiornata · ${euro(a.prezzi.visura)} + IVA</button>`;
    return h;
  }
  if (v?.stato === 'attesa') return h + '<p class="attesa">Visura in preparazione presso la Camera di Commercio…</p>';
  if (v?.stato === 'errore') h += `<p class="esito-si">L'ultimo ordine non è andato a buon fine${v.errore ? `: ${esc(v.errore)}` : ''}.</p>`;
  return h + `<button type="button" class="val-btn" data-azione="visura">Ordina la visura · ${euro(a.prezzi.visura)} + IVA</button>`;
}

function pannelloBilanci(a: any, tutti: boolean): string {
  const ordini: Record<string, any> = a.bilanci ?? {};
  const anni: any[] = a.anni ?? [];
  const p = a.prezzi;
  let h = '';

  if (!anni.length) {
    // Senza elenco recente si mostrano comunque i bilanci gia' pagati
    const pagati = Object.values(ordini).filter((o: any) => o.stato === 'pronto').sort((x: any, y: any) => y.anno - x.anno);
    if (pagati.length) h += tabella(pagati.map((o: any) => ({ balanceSheetId: o.balanceSheetId, anno: o.anno, tipo: o.tipo })), ordini, p);
    h += `<p class="doc-nota">L'elenco degli esercizi depositati si legge dal Registro Imprese.</p>
      <button type="button" class="val-btn" data-azione="cerca">Cerca i bilanci depositati · ${euro(p.ricercaBilanci)} + IVA</button>`;
    return h;
  }

  const visibili = tutti ? anni : anni.slice(0, ANNI_VISIBILI);
  h += tabella(visibili, ordini, p);
  if (anni.length > ANNI_VISIBILI) {
    h += `<button type="button" class="doc-link" data-tutti="1">${tutti ? 'Mostra solo i più recenti' : `Mostra tutti gli esercizi (${anni.length})`}</button>`;
  }
  h += `<p class="doc-nota">Elenco letto il ${data(a.ricercaQuando)}. Ogni esercizio ordinato si riapre da qui senza costo, per sempre: un bilancio depositato non cambia.
    Se l'elenco ha più di 12 ore, ordinare un esercizio rifà prima la ricerca (${euro(p.ricercaBilanci)}).</p>`;
  return h;
}

function tabella(righe: any[], ordini: Record<string, any>, p: any): string {
  const azione = (r: any) => {
    const o = ordini[r.balanceSheetId];
    if (o?.stato === 'pronto' && o.file?.length) {
      return `<span class="doc-riga">${bottoniFile(o.file)}</span>`;
    }
    if (o?.stato === 'attesa') return '<span class="attesa">in preparazione…</span>';
    const err = o?.stato === 'errore' ? '<span class="esito-si">non riuscito</span> ' : '';
    return `${err}<button type="button" class="val-btn" data-bilancio="${esc(r.balanceSheetId)}">Ordina · ${euro(p.bilancio)} + IVA</button>`;
  };
  return `<table class="doc-tab-anni"><thead><tr><th>Esercizio</th><th>Tipo</th><th class="num"></th></tr></thead><tbody>${
    righe.map((r) => `<tr><td><strong>${esc(r.anno)}</strong></td><td>${esc(String(r.tipo ?? '').toLowerCase())}</td><td class="num">${azione(r)}</td></tr>`).join('')
  }</tbody></table>`;
}

function collega(st: Stato) {
  const q = <T extends Element>(sel: string) => [...st.radice.querySelectorAll<T>(sel)];

  q<HTMLButtonElement>('[data-tab]').forEach((b) => b.addEventListener('click', () => {
    st.scheda = b.dataset.tab as Scheda;
    st.messaggio = '';
    disegna(st);
  }));
  q<HTMLButtonElement>('[data-tutti]').forEach((b) => b.addEventListener('click', () => {
    st.tuttiGliAnni = !st.tuttiGliAnni;
    disegna(st);
  }));
  q<HTMLButtonElement>('[data-scarica]').forEach((b) => b.addEventListener('click', () => scarica(st, b)));

  q<HTMLButtonElement>('[data-azione="visura"]').forEach((b) => b.addEventListener('click', async () => {
    blocca(st);
    const r = await st.api('/api/documenti-ufficiali', { method: 'POST', body: JSON.stringify({ azione: 'visura', piva: st.piva }) })
      .catch((e) => ({ errore: String(e) }));
    if (r?.errore) return fallisci(st, r.errore);
    st.messaggio = r.daArchivio ? 'Visura già in archivio, nessun costo.' : '';
    await ricarica(st);
    if (r.ordine?.stato === 'attesa') segui(st, 'visura');
  }));

  q<HTMLButtonElement>('[data-azione="cerca"]').forEach((b) => b.addEventListener('click', async () => {
    blocca(st);
    st.messaggio = 'Cerco i bilanci depositati…';
    const r = await st.api('/api/documenti-ufficiali', { method: 'POST', body: JSON.stringify({ azione: 'cerca-bilanci', piva: st.piva }) })
      .catch((e) => ({ errore: String(e) }));
    if (r?.errore) return fallisci(st, r.errore);
    st.messaggio = r.anni?.length ? '' : 'Nessun bilancio depositato al Registro Imprese.';
    await ricarica(st);
  }));

  q<HTMLButtonElement>('[data-azione="protesti"]').forEach((b) => b.addEventListener('click', async () => {
    blocca(st, 'Ordino la visura protesti…');
    const r = await st.api('/api/documenti-ufficiali', { method: 'POST', body: JSON.stringify({ azione: 'protesti', piva: st.piva }) })
      .catch((e) => ({ errore: String(e) }));
    if (r?.errore) return fallisci(st, r.errore);
    st.messaggio = r.daArchivio ? 'Visura protesti già in archivio, nessun costo.' : '';
    await ricarica(st);
    if (r.ordine?.stato === 'attesa') segui(st, 'protesti');
  }));

  q<HTMLButtonElement>('[data-protesti-persona]').forEach((b) => b.addEventListener('click', async () => {
    const cf = b.dataset.protestiPersona!;
    blocca(st, 'Ordino la visura protesti…');
    const r = await st.api('/api/documenti-ufficiali', { method: 'POST', body: JSON.stringify({ azione: 'protesti-persona', piva: st.piva, cf }) })
      .catch((e) => ({ errore: String(e) }));
    if (r?.errore) return fallisci(st, r.errore);
    st.messaggio = r.daArchivio ? 'Visura protesti già in archivio, nessun costo.' : '';
    await ricarica(st);
    if (r.ordine?.stato === 'attesa') segui(st, 'protesti-persona', cf);
  }));

  q<HTMLButtonElement>('[data-bilancio]').forEach((b) => b.addEventListener('click', async () => {
    const id = b.dataset.bilancio!;
    blocca(st);
    const r = await st.api('/api/documenti-ufficiali', { method: 'POST', body: JSON.stringify({ azione: 'bilancio', piva: st.piva, id }) })
      .catch((e) => ({ errore: String(e) }));
    if (r?.errore) return fallisci(st, r.errore);
    st.messaggio = r.daArchivio ? 'Bilancio già in archivio, nessun costo.' : '';
    await ricarica(st);
    if (r.ordine?.stato === 'attesa') segui(st, 'bilancio', id);
  }));
}

/** Un clic alla volta: un doppio clic su un pulsante a pagamento pagherebbe due volte. */
function blocca(st: Stato, avviso = '') {
  st.radice.querySelectorAll<HTMLButtonElement>('button[data-azione], button[data-bilancio], button[data-protesti-persona]').forEach((b) => (b.disabled = true));
  // l'ordine a DocuEngine impiega qualche secondo: senza avviso il pannello sembra fermo
  const msg = st.radice.querySelector('.doc-msg');
  if (avviso && msg) msg.textContent = avviso;
}

function fallisci(st: Stato, errore: string) {
  st.messaggio = `Errore: ${errore}`;
  disegna(st);
}

type Seguito = 'visura' | 'bilancio' | 'protesti' | 'protesti-persona';

const QS: Record<Seguito, (id?: string) => string> = {
  visura: () => 'stato=visura',
  bilancio: (id) => `stato=bilancio&id=${encodeURIComponent(id!)}`,
  protesti: () => 'stato=protesti',
  'protesti-persona': (cf) => `stato=protesti-persona&cf=${encodeURIComponent(cf!)}`,
};

const PRONTO: Record<Seguito, (o: any) => string> = {
  visura: () => 'Visura pronta.',
  bilancio: (o) => `Bilancio ${o.anno} pronto.`,
  protesti: () => 'Visura protesti pronta.',
  'protesti-persona': (o) => `Visura protesti di ${titoloCase(o.nome ?? '')} pronta.`,
};

/** Ripassa a chiedere finche' il documento e' pronto, poi ridisegna. */
function segui(st: Stato, tipo: Seguito, id?: string) {
  let tentativi = TENTATIVI;
  const giro = async () => {
    const r = await st.api(`/api/documenti-ufficiali?piva=${st.piva}&${QS[tipo](id)}`).catch(() => null);
    const stato = r?.ordine?.stato;
    if (stato === 'pronto' || stato === 'errore') {
      st.messaggio = stato === 'pronto'
        ? PRONTO[tipo](r.ordine)
        : `Ordine non riuscito${r.ordine.errore ? `: ${r.ordine.errore}` : ''}.`;
      return ricarica(st);
    }
    if (--tentativi > 0) setTimeout(giro, ATTESA_MS);
    else { st.messaggio = 'Ancora in preparazione: riapri la scheda fra qualche minuto, l\'ordine non va ripagato.'; disegna(st); }
  };
  setTimeout(giro, ATTESA_MS);
}

/** Il file passa dal nostro endpoint con la chiave: niente link pubblici. */
async function scarica(st: Stato, b: HTMLButtonElement) {
  const percorso = b.dataset.scarica!;
  const testo = b.textContent;
  b.disabled = true;
  b.textContent = 'Scarico…';
  try {
    const r = await fetch(`/api/documenti-ufficiali?piva=${st.piva}&file=${encodeURIComponent(percorso)}`, {
      headers: { Authorization: `Bearer ${st.chiave()}` },
    });
    if (!r.ok) throw new Error((await r.json().catch(() => null))?.errore ?? `errore ${r.status}`);
    const nome = /filename="([^"]+)"/.exec(r.headers.get('content-disposition') ?? '')?.[1] ?? percorso.split('/').pop()!;
    const url = URL.createObjectURL(await r.blob());
    const a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  } catch (e) {
    st.messaggio = `Non sono riuscito a scaricare il file: ${(e as Error).message}`;
    disegna(st);
    return;
  } finally {
    b.disabled = false;
    b.textContent = testo;
  }
}
