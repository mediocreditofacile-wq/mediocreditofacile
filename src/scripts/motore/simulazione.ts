// Scheda Simulazione, settore distinta (oggi Led Office), prima di Cliente. Decisa da
// Alberto il 21/10/2026 con Maurizio Palumbo: il commerciale scrive l'importo e vede i
// canoni a 24, 36, 48 e 60 mesi senza verificare il cliente, e dal tablet scarica il
// preventivo del canone da dare subito. Il conto lo fa il server
// (/api/motore/simulazione): qui non c'e' nessun coefficiente. Sul settore mezzi la
// scheda e' quella di simulazione-mezzi.ts.

import { $, apiJsonSicura, esc, euro, messaggio, stato, traduci } from './comune';
import { leggiNumero } from './distinta-browser';
import { montaSimulazioneMezzi } from './simulazione-mezzi';
import { apriSubito, bottoneDoc, caricaStorico } from './storico';

/** Pausa fra l'ultima cifra scritta e il conto */
const ATTESA_MS = 350;

let timer: ReturnType<typeof setTimeout> | undefined;
/** Le risposte vecchie non coprono quella dell'importo appena scritto */
let turno = 0;
let ultimo: any = null;
let generando = false;

const valore = (id: string) => $<HTMLInputElement>(id).value.trim();

/** Il fornitore va nel corpo, come nelle altre POST del motore */
function corpo(documento: boolean) {
  return {
    f: stato.slug,
    importo: leggiNumero(valore('sim-importo')),
    intestatario: valore('sim-intestatario'),
    descrizione: valore('sim-descrizione'),
    documento,
  };
}

function rendiRate(r: any) {
  // Solo per MCF, gia' scritta dal server
  const riservato = typeof r.riservato === 'string' ? `<p class="mt-nota">${esc(r.riservato)}</p>` : '';
  $('sim-esito').innerHTML = `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--rate">
      <thead><tr><th>Durata</th><th class="num">Canone mensile, IVA esclusa</th></tr></thead>
      <tbody>${(r.rate ?? []).map((x: any) => `
        <tr class="${x.durata === r.durataEvidenza ? 'scelta' : ''}"><td>${esc(x.durata)} mesi</td><td class="num">${euro(x.canone, 2)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${r.daConfermare ? '<p class="mt-da-confermare">Rata indicativa, da confermare.</p>' : ''}
    ${r.nota ? `<p class="mt-nota">${esc(r.nota)}</p>` : ''}
    <p class="mt-nota">Rata indicativa, prima della verifica del cliente: quella definitiva dipende dal suo esito.</p>
    ${riservato}`;
}

/** Il conto a schermo: niente si salva */
async function calcola() {
  const c = corpo(false);
  const msg = $('sim-msg');
  ultimo = null;
  rendiAzioni();
  if (!valore('sim-importo')) {
    messaggio(msg, '', false);
    $('sim-esito').innerHTML = '';
    return;
  }
  if (!(c.importo > 0)) {
    messaggio(msg, traduci('importo_non_valido'), false);
    $('sim-esito').innerHTML = '';
    return;
  }
  const mio = ++turno;
  $('sim-esito').classList.add('mt-in-attesa');
  const risposta = await apiJsonSicura('/api/motore/simulazione', { method: 'POST', body: JSON.stringify(c) });
  if (mio !== turno) return;
  $('sim-esito').classList.remove('mt-in-attesa');
  if (!risposta) return messaggio(msg, traduci('connessione_assente'), false);
  if (!risposta.res.ok || !risposta.corpo?.ok) {
    $('sim-esito').innerHTML = '';
    return messaggio(msg, traduci(risposta.corpo?.error ?? ''), false);
  }
  messaggio(msg, '', false);
  ultimo = risposta.corpo;
  rendiRate(ultimo);
  rendiAzioni();
}

function rendiAzioni() {
  const b = document.getElementById('sim-pdf') as HTMLButtonElement | null;
  if (b && !generando) b.disabled = !ultimo;
}

async function scaricaPreventivo(btn: HTMLButtonElement) {
  const esito = $('sim-documenti');
  esito.innerHTML = '';
  generando = true;
  btn.disabled = true;
  const testo = btn.textContent;
  btn.textContent = 'Preparo il preventivo...';
  const risposta = await apiJsonSicura('/api/motore/simulazione', { method: 'POST', body: JSON.stringify(corpo(true)) });
  generando = false;
  btn.textContent = testo;
  rendiAzioni();
  if (!risposta || !risposta.res.ok || !risposta.corpo?.ok) {
    const errore = risposta ? risposta.corpo?.error ?? '' : 'connessione_assente';
    esito.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci(errore))}</p>`;
    return;
  }
  const r = risposta.corpo;
  const docs = (r.documenti ?? []) as { nome: string; pathname: string }[];
  esito.innerHTML = `
    <div class="mt-card" style="margin-top:16px">
      <p class="mt-semaforo__tit">Preventivo ${esc(r.id)} salvato</p>
      ${docs.length
        ? `<p class="mt-nota" style="margin:0 0 8px">Da consegnare al cliente. Resta riscaricabile dallo Storico.</p>
           <p>${docs.map((d) => bottoneDoc(d, 'Preventivo del canone')).join(' · ')}</p>`
        : '<p class="mt-nota" style="margin:0">Il PDF non è pronto: la simulazione è salvata nello Storico, riprova tra qualche minuto.</p>'}
      <p class="mt-nota">Per la proposta di vendita e la pratica, verifica il cliente nella sezione Cliente.</p>
    </div>`;
  apriSubito(esito, docs);
  void caricaStorico();
}

export function montaSimulazione() {
  const box = document.getElementById('simulazione');
  if (!box) return;
  // Sui mezzi la simulazione chiede anche categoria, targa e chi vende: e' un'altra scheda
  if (stato.settore === 'mezzi') return montaSimulazioneMezzi();
  box.innerHTML = `
    <div class="mt-griglia">
      <label class="mt-campo"><span>Importo della fornitura, IVA esclusa</span>
        <input type="text" id="sim-importo" class="mt-input" inputmode="decimal" autocomplete="off" placeholder="35.000" /></label>
      <label class="mt-campo"><span>Intestato a, facoltativo</span>
        <input type="text" id="sim-intestatario" class="mt-input" maxlength="120" autocomplete="off" placeholder="Nome del cliente" />
        <small>Va sul preventivo. Nessuna partita IVA: il cliente non è ancora verificato.</small></label>
      <label class="mt-campo"><span>Cosa si noleggia, facoltativo</span>
        <input type="text" id="sim-descrizione" class="mt-input" maxlength="200" autocomplete="off" placeholder="LEDwall 3x2" />
        <small>Senza marca né modello. Vuoto, il preventivo dice "fornitura di beni strumentali".</small></label>
    </div>
    <p id="sim-msg" class="mt-msg" hidden></p>
    <div id="sim-esito"></div>
    <div class="mt-azioni"><button type="button" id="sim-pdf" class="mt-btn" disabled>Scarica il preventivo del canone</button></div>
    <div id="sim-documenti"></div>`;

  $('sim-importo').addEventListener('input', () => {
    clearTimeout(timer);
    timer = setTimeout(() => void calcola(), ATTESA_MS);
  });
  $('sim-pdf').addEventListener('click', (e) => void scaricaPreventivo(e.currentTarget as HTMLButtonElement));
}
