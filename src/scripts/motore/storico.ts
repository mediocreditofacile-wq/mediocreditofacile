// Storico: ricerche di merito, preventivi generati, pratiche caricate.
// L'agente vede il proprio, referente e MCF tutto il fornitore: lo decide l'API.

import { etichettaMese } from '../../lib/motore/richieste';
import { riapriRicerca } from './cliente';
import { $, api, apiJson, data, esc, euro, stato } from './comune';

/** esterne = pratiche lavorate prima del portale: arrivano solo a referente e MCF */
export interface DatiStorico {
  ricerche: any[]; proposte: any[]; pratiche: any[]; esterne: any[];
  /** Solo per MCF: il menu degli stati della pratica, coi canali */
  stati?: [string, string][];
}

let ultimo: DatiStorico = { ricerche: [], proposte: [], pratiche: [], esterne: [] };
/** Mese delle verifiche mostrate (AAAA-MM) e richieste per mese, dal server */
let mese = '';
let mesi: { mese: string; richieste: number }[] = [];
/** Il fornitore paga le verifiche: referente e MCF vedono il conteggio */
let conteggio = false;
const ascoltatori: ((d: DatiStorico) => void)[] = [];

/** Chi vuole lo storico aggiornato (la sezione Pratiche) si iscrive qui */
export function suStorico(fn: (d: DatiStorico) => void) {
  ascoltatori.push(fn);
}

export async function caricaStorico(meseScelto = mese) {
  const { res, corpo } = await apiJson(api('storico', meseScelto ? { mese: meseScelto } : {}));
  if (!res.ok || !corpo?.ok) return;
  ultimo = {
    ricerche: corpo.ricerche ?? [], proposte: corpo.proposte ?? [], pratiche: corpo.pratiche ?? [], esterne: corpo.esterne ?? [],
    stati: Array.isArray(corpo.stati) ? corpo.stati : undefined,
  };
  mese = corpo.mese ?? '';
  mesi = corpo.mesi ?? [];
  conteggio = Boolean(corpo.conteggio);
  rendi();
  for (const fn of ascoltatori) fn(ultimo);
}

/** Bottone di download di un documento dallo store privato */
export const bottoneDoc = (d: { nome: string; pathname: string }, etichetta?: string) =>
  `<button type="button" class="mt-link" data-doc="${esc(d.pathname)}">${esc(etichetta ?? d.nome)}</button>`;

function rendi() {
  const agente = stato.vedeTutto;
  const conta = agente && conteggio;
  $('storico-sub').textContent = agente
    ? 'Tutta la rete, con il nome di chi ha lavorato.'
    : 'Le tue verifiche e i tuoi preventivi.';
  const colAgente = agente ? '<th>Agente</th>' : '';

  // Il mese: quelli con verifiche, piu' quello mostrato anche se vuoto
  const elencoMesi = mesi.some((m) => m.mese === mese) || !mese ? mesi : [{ mese, richieste: 0 }, ...mesi];
  const richieste = elencoMesi.find((m) => m.mese === mese)?.richieste ?? 0;
  const sceltaMese = `
    <div class="mt-storico-mese">
      <label class="mt-campo" style="max-width:240px"><span>Mese</span>
        <select id="storico-mese" class="mt-input">${elencoMesi.map((m) =>
          `<option value="${esc(m.mese)}" ${m.mese === mese ? 'selected' : ''}>${esc(etichettaMese(m.mese))}</option>`).join('')}</select></label>
      ${conta ? `<p class="mt-lead" style="margin:0"><strong>Richieste di ${esc(etichettaMese(mese))}: ${richieste}</strong><br>
        <span class="mt-nota">Un cliente al mese: se la stessa partita IVA si verifica di nuovo nello stesso mese, si vede qui ma non conta di nuovo.</span></p>` : ''}
    </div>`;
  const ricerche = ultimo.ricerche.length
    ? `<div class="mt-scorri"><table class="mt-tabella">
        <thead><tr><th>Quando</th>${colAgente}<th>Cliente</th><th>Rating</th>${conta ? '<th>Richiesta</th>' : ''}<th></th></tr></thead>
        <tbody>${ultimo.ricerche.map((r) => `<tr class="${conta && !r.conta ? 'spenta' : ''}">
          <td>${data(r.creato)}</td>${agente ? `<td>${esc(r.agente_nome)}</td>` : ''}
          <td>${esc(r.ragione_sociale ?? '—')}<br><span class="mt-id">P.IVA ${esc(r.piva)}</span></td>
          <td>${esc(r.rating ?? '—')}</td>
          ${conta ? `<td>${r.conta ? 'Conta' : '<span class="mt-id">ripetuta, non conta</span>'}</td>` : ''}
          <td class="num"><button type="button" class="mt-link" data-riapri="${esc(r.id)}">Riapri</button></td>
        </tr>`).join('')}</tbody></table></div>`
    : `<p class="mt-vuoto">Nessuna verifica ${mese ? `a ${esc(etichettaMese(mese))}` : 'ancora'}.</p>`;

  // Settore distinta: dal preventivo con la proposta di vendita si crea la pratica (22/10/2026)
  const distinta = stato.settore === 'distinta';
  const praticaDi = new Map<string, string>(ultimo.pratiche.filter((x) => x.proposta_id).map((x) => [x.proposta_id, x.id]));
  const conVendita = (p: any) => (p.documenti ?? []).some((d: any) => /proposta-vendita/i.test(String(d?.nome ?? '')));
  const cellaPratica = (p: any) => {
    if (praticaDi.has(p.id)) return `<span class="mt-id">Pratica ${esc(praticaDi.get(p.id))}</span>`;
    if (!p.ricerca_id) return '';
    return conVendita(p)
      ? `<button type="button" class="mt-link" data-crea-pratica="${esc(p.id)}" data-ricerca="${esc(p.ricerca_id)}">Crea pratica</button>`
      : '<span class="mt-id">solo canone</span>';
  };
  const preventivi = ultimo.proposte.length
    ? `<div class="mt-scorri"><table class="mt-tabella">
        <thead><tr><th>Quando</th>${colAgente}<th>Cliente</th><th>Offerta</th><th class="num">Prezzo</th><th>Documenti</th>${distinta ? '<th>Pratica</th>' : ''}</tr></thead>
        <tbody>${ultimo.proposte.map((p) => `<tr>
          <td>${data(p.creato)}<br><span class="mt-id">${esc(p.id)}</span></td>${agente ? `<td>${esc(p.agente_nome)}</td>` : ''}
          <td>${esc(p.cliente_nome)}</td>
          <td>${esc(p.descrizione)}</td>
          <td class="num">${euro(p.prezzo)}</td>
          <td>${(p.documenti ?? []).length ? p.documenti.map((d: any) => bottoneDoc(d)).join('<br>') : '<span class="mt-id">PDF non disponibili</span>'}</td>
          ${distinta ? `<td>${cellaPratica(p)}</td>` : ''}
        </tr>`).join('')}</tbody></table></div>`
    : '<p class="mt-vuoto">Nessun preventivo ancora.</p>';

  $('storico').innerHTML = `
    <h3 class="mt-h3" style="margin-top:0">Verifiche</h3>${sceltaMese}${ricerche}
    <h3 class="mt-h3">Preventivi</h3>${preventivi}`;
}

/**
 * "Crea pratica" su un preventivo dello Storico: riapre la sua verifica, porta alla scheda
 * Pratiche e apre il modulo con quel preventivo gia' scelto. Serve ai preventivi fatti
 * prima, senza rifare la proposta.
 */
async function creaPraticaDa(propostaId: string, ricercaId: string) {
  if (!(await riapriRicerca(ricercaId, 'pratiche'))) return;
  // Dopo la riapertura, che azzera l'ultimo preventivo della sessione
  stato.ultimoPreventivo = propostaId;
  document.dispatchEvent(new CustomEvent('mt:nuova-pratica', { detail: { dove: 'pratiche' } }));
}

/** Download autenticato: lo store e' privato, passa dalla guardia del portale */
async function scarica(btn: HTMLButtonElement) {
  const percorso = btn.dataset.doc!;
  const testo = btn.textContent;
  btn.disabled = true;
  btn.textContent = 'Scarico...';
  try {
    const res = await fetch(`/api/motore/doc?${new URLSearchParams({ f: stato.slug, path: percorso })}`, { credentials: 'same-origin' });
    if (!res.ok) throw new Error(String(res.status));
    const blob = await res.blob();
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = percorso.split('/').pop() ?? 'documento.pdf';
    a.click();
    URL.revokeObjectURL(a.href);
  } catch {
    alert('Non sono riuscito a scaricare il documento. Riprova tra poco.');
  }
  btn.disabled = false;
  btn.textContent = testo;
}

export function montaStorico() {
  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const riapri = t.closest('[data-riapri]') as HTMLElement | null;
    if (riapri) return void riapriRicerca(riapri.dataset.riapri!);
    const crea = t.closest('[data-crea-pratica]') as HTMLElement | null;
    if (crea) return void creaPraticaDa(crea.dataset.creaPratica!, crea.dataset.ricerca!);
    const doc = t.closest('[data-doc]') as HTMLButtonElement | null;
    if (doc) void scarica(doc);
  });
  document.addEventListener('mt:tab', (e) => {
    if ((e as CustomEvent).detail === 'storico') void caricaStorico();
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'storico-mese' && t.value) void caricaStorico(t.value);
  });
}
