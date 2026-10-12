// Pannello "Documenti ufficiali" della scheda di /tools/valutazione: due schede,
// visura camerale e bilanci depositati, servite da /api/documenti-ufficiali.
// Ogni pulsante che spende porta il prezzo scritto sopra; quello che e' gia'
// stato pagato si riapre dall'archivio senza costo.

type Api = (path: string, init?: RequestInit) => Promise<any>;

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
  scheda: 'visura' | 'bilanci';
  tuttiGliAnni: boolean;
  messaggio: string;
}

/** Monta il pannello dentro `radice` e carica l'archivio della partita IVA. */
export async function montaDocumenti(radice: HTMLElement, piva: string, api: Api, chiave: () => string) {
  const st: Stato = { piva, api, chiave, radice, arch: null, scheda: 'visura', tuttiGliAnni: false, messaggio: '' };
  radice.innerHTML = '<span class="attesa">carico l\'archivio…</span>';
  await ricarica(st);
  // Un ordine rimasto a meta' (pagina ricaricata durante l'attesa) riprende da solo
  if (st.arch?.visura?.stato === 'attesa') segui(st, 'visura');
  for (const [id, o] of Object.entries<any>(st.arch?.bilanci ?? {})) if (o.stato === 'attesa') segui(st, 'bilancio', id);
}

async function ricarica(st: Stato) {
  const r = await st.api(`/api/documenti-ufficiali?piva=${st.piva}`).catch((e) => ({ errore: String(e) }));
  if (r?.errore) { st.radice.innerHTML = `<span class="vuoto">${esc(r.errore)}</span>`; return; }
  st.arch = r;
  disegna(st);
}

function disegna(st: Stato) {
  const a = st.arch;
  const tab = (k: Stato['scheda'], t: string) =>
    `<button type="button" class="doc-tab${st.scheda === k ? ' on' : ''}" data-tab="${k}" role="tab" aria-selected="${st.scheda === k}">${t}</button>`;
  st.radice.innerHTML = `<div class="doc-tabs" role="tablist">${tab('visura', 'Visura camerale')}${tab('bilanci', 'Bilanci depositati')}</div>
    <div class="doc-pan">${st.scheda === 'visura' ? pannelloVisura(a) : pannelloBilanci(a, st.tuttiGliAnni)}</div>
    <p class="doc-msg">${esc(st.messaggio)}</p>`;
  collega(st);
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
    st.scheda = b.dataset.tab as Stato['scheda'];
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
function blocca(st: Stato) {
  st.radice.querySelectorAll<HTMLButtonElement>('button[data-azione], button[data-bilancio]').forEach((b) => (b.disabled = true));
}

function fallisci(st: Stato, errore: string) {
  st.messaggio = `Errore: ${errore}`;
  disegna(st);
}

/** Ripassa a chiedere finche' il documento e' pronto, poi ridisegna. */
function segui(st: Stato, tipo: 'visura' | 'bilancio', id?: string) {
  let tentativi = TENTATIVI;
  const giro = async () => {
    const qs = tipo === 'visura' ? 'stato=visura' : `stato=bilancio&id=${encodeURIComponent(id!)}`;
    const r = await st.api(`/api/documenti-ufficiali?piva=${st.piva}&${qs}`).catch(() => null);
    const stato = r?.ordine?.stato;
    if (stato === 'pronto' || stato === 'errore') {
      st.messaggio = stato === 'pronto'
        ? (tipo === 'visura' ? 'Visura pronta.' : `Bilancio ${r.ordine.anno} pronto.`)
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
