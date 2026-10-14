// Disegno HTML del dettaglio eventi negativi (protesti, pregiudizievoli, procedure).
// Lo usano la scheda Protesti dei documenti ufficiali e le righe di soci e
// amministratori. La lettura dei dati sta in src/lib/eventi-negativi.ts.

import type { EventiNegativi, VoceGenerica } from '../lib/eventi-negativi';

const esc = (s: unknown) =>
  String(s ?? '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c] as string));
const euro = (n: number | null) =>
  n == null ? '<span class="vuoto">—</span>' : `${n.toLocaleString('it-IT', { maximumFractionDigits: 2, useGrouping: 'always' })} €`;
const oVuoto = (s: string) => (s ? esc(s) : '<span class="vuoto">—</span>');

function tabellaProtesti(e: EventiNegativi): string {
  const piu = e.protesti.length > 1;
  const righe = e.protesti.flatMap((p) => p.effetti.map((x) => `<tr>
    <td><strong>${oVuoto(x.tipo)}</strong>${piu ? `<br><span class="cf">${esc(p.denominazione)}</span>` : ''}</td>
    <td class="num">${euro(x.importo)}</td>
    <td>${oVuoto(x.dataLevata)}${x.luogoLevata ? `<br><span class="ev-sub">${esc(x.luogoLevata)}</span>` : ''}</td>
    <td>${oVuoto(x.dataIscrizione)}${x.cciaa ? `<br><span class="ev-sub">CCIAA ${esc(x.cciaa)}</span>` : ''}${x.repertorio ? `<br><span class="ev-sub">rep. ${esc(x.repertorio)}</span>` : ''}</td>
    <td>${oVuoto(x.motivo)}${x.motivoEsteso ? `<br><span class="ev-sub">${esc(x.motivoEsteso)}</span>` : ''}</td>
    <td>${oVuoto(x.stato)}${x.informazione ? `<br><span class="ev-sub">${esc(x.informazione)}</span>` : ''}${x.dataScadenza ? `<br><span class="ev-sub">scadenza ${esc(x.dataScadenza)}</span>` : ''}</td>
  </tr>`)).join('');
  const totale = e.effetti > 1
    ? `<tr class="ev-tot"><td>Totale protestato</td><td class="num">${euro(e.totaleProtestato)}</td><td colspan="4">${e.effetti} effetti</td></tr>`
    : '';
  return `<div class="ev-scroll"><table class="ev-tab"><thead><tr>
    <th>Effetto</th><th class="num">Importo</th><th>Levata</th><th>Iscrizione</th><th>Motivo del mancato pagamento</th><th>Stato</th>
  </tr></thead><tbody>${righe}${totale}</tbody></table></div>`;
}

function vociGeneriche(titolo: string, voci: VoceGenerica[]): string {
  return voci.map((v, i) => `<h5 class="ev-h">${esc(titolo)}${voci.length > 1 ? ` ${i + 1}` : ''}</h5>
    <table class="ev-tab ev-tab--kv"><tbody>${v.campi.map(([k, x]) => `<tr><td>${esc(k)}</td><td>${esc(x)}</td></tr>`).join('')}</tbody></table>`).join('');
}

/** Il dettaglio completo; stringa vuota se non c'e' nessun evento. */
export function htmlEventi(e: EventiNegativi | null): string {
  if (!e) return '';
  let h = '';
  if (e.protesti.length) h += tabellaProtesti(e);
  if (e.pregiudizievoli.length) {
    h += vociGeneriche('Pregiudizievole', e.pregiudizievoli)
      + '<p class="ev-sub">Campi riportati come li restituisce la fonte: è il primo pregiudizievole che vediamo, la forma non è ancora interpretata.</p>';
  }
  if (e.procedure.length) {
    h += vociGeneriche('Procedura concorsuale', e.procedure)
      + '<p class="ev-sub">Campi riportati come li restituisce la fonte: è la prima procedura che vediamo, la forma non è ancora interpretata.</p>';
  }
  if (!e.dettaglioDisponibile) {
    h += '<p class="ev-sub">L\'evento risulta presente ma il dettaglio non è leggibile da qui: per i protesti fa fede il PDF della visura protesti ufficiale.</p>';
  }
  return h;
}
