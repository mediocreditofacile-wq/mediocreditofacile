// Scheda Proposte del settore "mezzi" (Bergamelli): l'agente descrive i beni a mano
// (descrizione, categoria, quantita', prezzo, se il mezzo e' targato e se e' usato), sceglie chi
// vende e l'anticipo del leasing, e vede il noleggio e il leasing dei partner a
// confronto. Spec mcf_spec-bergamelli-motore_v2, sezioni 4 e 5.
//
// Il conto lo fa il server (/api/motore/proposte): canale del noleggio, rate dei
// partner, semaforo. Nel browser non arriva nessun canale, nessuno spread, nessun
// coefficiente: qui si raccolgono le scelte e si disegna quello che torna. Prima di
// chiamare il server i beni passano da validaBeni, lo stesso controllo del server,
// cosi' la riga che non regge si segna subito. Ogni cambio rifa' il conto dopo una
// pausa e le risposte partite prima si scartano.
//
// Le caselle che l'agente sta scrivendo non si ridisegnano a ogni conto, altrimenti
// perderebbero il fuoco: si aggiornano totali, esito e pulsanti.

import { validaBeni } from '../../lib/motore/beni-mezzi';
import type { MezziSchermo } from '../../lib/motore/calcolo-mezzi';
import type { CategoriaMezzo, MezziBrowser } from '../../lib/motore/config-mezzi';
import { leggiPrezzo, leggiQuantita, totaleRighe } from '../../lib/motore/distinta';
import { serveFraseDaConfermare } from '../../lib/motore/nota-canone';
import { bloccoSemaforo } from './cliente';
import { $, apiJsonSicura, apriTab, esc, euro, euroEsatto, messaggio, num, stato, traduci } from './comune';
import { turni } from './distinta-browser';
import {
  campoDiErrore,
  chiavePdf,
  colonneConRighe,
  corpoProposte,
  durateLeasing,
  etichettaColonna,
  leggiAnticipo,
  messaggioRiga,
  rigaASchermo,
  righeDaMandare,
  rigaVuota,
  targatoDaMenu,
  targatoIniziale,
  usatoDaMenu,
  venditoreSuggerito,
  type ColonnaLeasing,
  type RigaInPagina,
} from './mezzi-browser';
import { apriSubito, bottoneDoc, caricaStorico } from './storico';

/** Pausa fra l'ultima cifra scritta e il conto, come nella simulazione */
const ATTESA_MS = 350;

let righe: RigaInPagina[] = [];
/** Il codice del venditore nel menu "Vende" */
let venditore = '';
/** L'agente ha cambiato il menu a mano: da quel momento non segue piu' la prima riga */
let venditoreManuale = false;
let anticipoTesto = '';
/** La colonna del leasing scelta dall'agente per il PDF; null = quella del server */
let sceltaPdf: string | null = null;
/** L'ultima risposta del server e il corpo che l'ha prodotta: il preventivo riparte da li' */
let ultimoEsito: MezziSchermo | null = null;
let ultimoCorpo: Record<string, unknown> | null = null;
/** Per ogni bene di ultimoCorpo, la sua riga a schermo: l'errore del preventivo torna li' */
let ultimiIndici: number[] = [];
/** L'errore a schermo: "Aggiungi un bene" ridisegna le caselle, e il segno va rimesso */
let erroreAttuale: { riga: number | null; errore: string } | null = null;
/** Un conto e' in arrivo: il pulsante resta spento finche' non torna */
let inAttesa = false;
/** Un preventivo si sta generando: niente doppio clic */
let generando = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Ogni cambio apre un turno: le risposte dei turni vecchi si scartano */
const turno = turni();

const SUGGERIMENTO =
  '<p class="mt-vuoto" style="margin-top:24px">Descrivi i beni qui sopra: marca e modello, categoria, quantità e prezzo. Qui compaiono la valutazione del cliente, il noleggio e il leasing.</p>';
const NOTA_ROSSO =
  'Con il semaforo rosso le proposte e il preventivo escono lo stesso: la pratica arriva a Mediocredito Facile da rivalutare.';

const config = (): MezziBrowser | null => stato.carrozzeria?.mezzi ?? null;
const rigaNuova = (): RigaInPagina => ({ descrizione: '', categoria: '', quantita: '1', prezzo: '', targato: null, usato: false });

// --- quello che serve agli altri pezzi del portale ------------------------------------

/** Il corpo del conto per i beni a schermo. Null se manca il cliente o una casella non regge */
export function inputMezzi(): Record<string, unknown> | null {
  const cfg = config();
  if (!stato.ricerca || !cfg) return null;
  const anticipo = leggiAnticipo(anticipoTesto);
  if (anticipo === null) return null;
  const corpo = corpoProposte(stato.slug, stato.ricerca.id, righeDaMandare(righe).righe, venditore, anticipo);
  return validaBeni(cfg.categorie, corpo.beni).ok ? corpo : null;
}

/**
 * Noleggio a schermo: rate per durata, oppure il perche' non c'e'. La riusa la simulazione.
 * "Da confermare" una volta sola: la frase fissa solo se la nota del listino non lo dice
 * gia' (Econocom), la stessa regola del PDF.
 */
export function riquadroNoleggio(r: Pick<MezziSchermo, 'noleggio' | 'motivoNoNoleggio'>): string {
  const n = r.noleggio;
  if (!n) return `<p class="mt-msg">${esc(r.motivoNoNoleggio ?? '')}</p>`;
  return `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--rate">
      <thead><tr><th>Durata</th><th class="num">Canone mensile, IVA esclusa</th></tr></thead>
      <tbody>${n.rate.map((x) => `
        <tr class="${x.durata === n.durataEvidenza ? 'scelta' : ''}"><td>${esc(x.durata)} mesi</td><td class="num">${euro(x.canone, 2)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${serveFraseDaConfermare(n.daConfermare, n.nota) ? '<p class="mt-da-confermare">Rata indicativa, da confermare.</p>' : ''}
    ${n.nota ? `<p class="mt-nota">${esc(n.nota)}</p>` : ''}`;
}

/** Una cella del leasing: rata e le voci che la compongono. Con i nomi spenti, solo il totale delle spese */
function cellaLeasing(x: ColonnaLeasing['righe'][number]): string {
  const dettaglio = x.speseIstruttoria != null && x.speseIncassoRata != null
    ? ` <span class="mt-id">(istruttoria ${euroEsatto(x.speseIstruttoria)}, incasso ${euroEsatto(x.speseIncassoRata)} a rata)</span>`
    : '';
  return `
    <span class="mt-mz-rata">${euro(x.rata, 2)}</span> <span class="mt-id">al mese</span>
    <span class="mt-mz-voce">Anticipo ${euro(x.anticipo)} (${num(x.anticipoPerc)}%) e ${esc(x.numRate)} rate</span>
    <span class="mt-mz-voce">Riscatto ${euro(x.riscatto)} (${num(x.riscattoPerc)}%)</span>
    <span class="mt-mz-voce">Spese ${euroEsatto(x.spese)}${dettaglio}</span>
    <span class="mt-mz-voce">Totale ${euro(x.totale)}</span>`;
}

/**
 * Il leasing a schermo: una colonna per partner (il nome se si mostra, altrimenti
 * "Soluzione A"), una riga per durata. Una colonna che non quota dice perche'. La
 * colonna che va nel PDF e' segnata. La riusa la simulazione, con `nelPdf` null.
 */
export function tabellaLeasing(leasing: ColonnaLeasing[], nelPdf: string | null): string {
  if (!leasing.length) return '';
  const note = `
    <p class="mt-da-confermare">Rata indicativa: si conferma con il bilancio.</p>
    <p class="mt-nota">Il totale somma anticipo, rate, riscatto e spese, IVA esclusa.</p>`;
  if (!colonneConRighe(leasing).length) {
    return `<ul class="mt-avvisi">${leasing.map((c) => `<li><strong>${esc(etichettaColonna(c))}</strong>: ${esc(c.motivo ?? 'non quota su questo importo.')}</li>`).join('')}</ul>`;
  }
  const durate = durateLeasing(leasing);
  const segno = (c: ColonnaLeasing) => (c.chiave === nelPdf ? ' mt-mz-nelpdf' : '');
  const intestazione = leasing
    .map((c) => `<th class="${segno(c)}">${esc(etichettaColonna(c))}${c.chiave === nelPdf ? '<br><span class="mt-mz-segno">nel PDF</span>' : ''}</th>`)
    .join('');
  const corpo = durate.map((d, i) => `
    <tr><td>${esc(d)} mesi</td>${leasing.map((c) => {
      // Una colonna senza righe ha una cella sola, alta quanto la tabella, col motivo
      if (!c.righe.length) {
        return i === 0 ? `<td rowspan="${durate.length}" class="mt-mz-motivo">${esc(c.motivo ?? 'Su questo importo non quota.')}</td>` : '';
      }
      const x = c.righe.find((r) => r.durata === d);
      return x ? `<td class="${segno(c)}">${cellaLeasing(x)}</td>` : `<td class="mt-id${segno(c)}">—</td>`;
    }).join('')}</tr>`).join('');
  return `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--leasing">
      <thead><tr><th>Durata</th>${intestazione}</tr></thead>
      <tbody>${corpo}</tbody>
    </table></div>
    ${note}`;
}

// --- le righe dei beni -----------------------------------------------------------------

/** Il totale di una riga quando quantita' e prezzo si leggono come li legge il server */
function totaleRiga(r: RigaInPagina): number | null {
  const q = leggiQuantita(r.quantita);
  const p = leggiPrezzo(r.prezzo);
  return q !== null && p !== null ? totaleRighe([{ quantita: q, prezzo: p }]) : null;
}

function aggiornaTotali() {
  righe.forEach((r, i) => {
    const cella = document.querySelector(`#mr-tabella [data-totale="${i}"]`);
    const t = totaleRiga(r);
    if (cella) cella.textContent = t === null ? '—' : euroEsatto(t);
  });
  const totale = righe.reduce((s, r) => s + (totaleRiga(r) ?? 0), 0);
  const cella = document.getElementById('mr-totale');
  if (cella) cella.textContent = euroEsatto(Math.round(totale * 100) / 100);
}

/**
 * Le risposte del menu "targato": con la categoria che porta una risposta, solo Sì e No.
 * La riusa la simulazione.
 */
export function opzioniTargato(categorie: CategoriaMezzo[], r: Pick<RigaInPagina, 'categoria' | 'targato'>): string {
  const senzaDefault = targatoIniziale(categorie, r.categoria) === null;
  const opzione = (valore: string, testo: string, scelta: boolean) =>
    `<option value="${valore}" ${scelta ? 'selected' : ''}>${testo}</option>`;
  return `${senzaDefault ? opzione('', 'Da indicare', r.targato === null) : ''}${opzione('si', 'Sì', r.targato === true)}${opzione('no', 'No', r.targato === false)}`;
}

/** Le risposte del menu "Nuovo o usato?": due sole, si parte da Nuovo. La riusa la simulazione */
export const opzioniUsato = (usato: boolean) =>
  `<option value="nuovo" ${usato ? '' : 'selected'}>Nuovo</option><option value="usato" ${usato ? 'selected' : ''}>Usato</option>`;

/** Il menu delle categorie, con "Scegli" finche' non ce n'e' una. La riusa la simulazione */
export const opzioniCategoria = (cfg: MezziBrowser, scelta: string) =>
  `<option value="" ${scelta ? '' : 'selected'}>Scegli</option>${cfg.categorie
    .map((c) => `<option value="${esc(c.nome)}" ${c.nome === scelta ? 'selected' : ''}>${esc(c.nome)}</option>`).join('')}`;

/** Il menu "Vende": il valore lo mette chi lo usa. La riusa la simulazione */
export const opzioniVenditore = (cfg: MezziBrowser) =>
  cfg.venditori.map((v) => `<option value="${esc(v.codice)}">${esc(v.ragioneSociale)}</option>`).join('');

function rendiRighe() {
  const cfg = config();
  if (!cfg) return;
  const categorie = (scelta: string) => opzioniCategoria(cfg, scelta);
  $('mr-tabella').innerHTML = `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--righe">
      <thead><tr><th>#</th><th>Bene</th><th>Categoria</th><th>È targato?</th><th>Nuovo o usato?</th><th class="num">Quantità</th><th class="num">Prezzo unitario</th><th class="num">Totale</th><th></th></tr></thead>
      <tbody>${righe.map((r, i) => `
        <tr>
          <td class="mt-id">${i + 1}</td>
          <td><input type="text" class="mt-input mt-input--testo mt-input--desc" data-campo="descrizione" data-i="${i}" maxlength="200"
            value="${esc(r.descrizione)}" placeholder="Marca e modello" aria-label="Descrizione, riga ${i + 1}" autocomplete="off" /></td>
          <td><select class="mt-input mt-input--testo mt-input--cat" data-campo="categoria" data-i="${i}" aria-label="Categoria, riga ${i + 1}">${categorie(r.categoria)}</select></td>
          <td><select class="mt-input mt-input--testo mt-input--targa" data-campo="targato" data-i="${i}" aria-label="Il mezzo è targato? Riga ${i + 1}">${opzioniTargato(cfg.categorie, r)}</select></td>
          <td><select class="mt-input mt-input--testo mt-input--targa" data-campo="usato" data-i="${i}" aria-label="Il mezzo è nuovo o usato? Riga ${i + 1}">${opzioniUsato(r.usato)}</select></td>
          <td class="num"><input type="text" class="mt-input mt-input--q" data-campo="quantita" data-i="${i}" inputmode="numeric"
            value="${esc(r.quantita)}" aria-label="Quantità, riga ${i + 1}" autocomplete="off" /></td>
          <td class="num"><input type="text" class="mt-input mt-input--p" data-campo="prezzo" data-i="${i}" inputmode="decimal"
            value="${esc(r.prezzo)}" aria-label="Prezzo unitario IVA esclusa, riga ${i + 1}" autocomplete="off" /></td>
          <td class="num" data-totale="${i}">—</td>
          <td><button type="button" class="mt-link" data-togli-bene="${i}" aria-label="Togli la riga ${i + 1}">togli</button></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="7">Totale beni, IVA esclusa</td><td class="num" id="mr-totale"></td><td></td></tr></tfoot>
    </table></div>`;
  aggiornaTotali();
}

/** "Vende" segue la categoria della prima riga finche' l'agente non lo cambia a mano */
function suggerisciVenditore() {
  const cfg = config();
  if (!cfg || venditoreManuale) return;
  venditore = venditoreSuggerito(cfg, righe[0]?.categoria ?? '') ?? cfg.venditori[0]?.codice ?? '';
  const menu = document.getElementById('mr-venditore') as HTMLSelectElement | null;
  if (menu) menu.value = venditore;
}

/** Il testo di un errore, con la riga quando c'e' */
function testoErrore(riga: number | null, errore: string): string {
  if (riga == null) return traduci(errore);
  return `Riga ${riga + 1}: ${messaggioRiga(errore, righe[riga]) ?? traduci(errore)}`;
}

/** L'errore sotto le righe, e la casella giusta segnata */
function mostraErrore(riga: number | null, errore: string) {
  erroreAttuale = { riga, errore };
  messaggio($('mr-msg'), testoErrore(riga, errore), false);
  segnaCasella(riga, errore);
}

function segnaCasella(riga: number | null, errore: string) {
  const campo = campoDiErrore(errore);
  const casella = riga != null && campo
    ? document.querySelector(`#mr-tabella [data-campo="${campo}"][data-i="${riga}"]`)
    : errore === 'anticipo_non_valido'
      ? document.getElementById('mr-anticipo')
      : errore === 'venditore_non_valido'
        ? document.getElementById('mr-venditore')
        : null;
  casella?.setAttribute('aria-invalid', 'true');
}

function pulisciErrori() {
  erroreAttuale = null;
  messaggio($('mr-msg'), '', false);
  for (const el of document.querySelectorAll('#mezzi-righe [aria-invalid]')) el.removeAttribute('aria-invalid');
}

// --- il conto ----------------------------------------------------------------------------

/** I numeri a schermo non valgono piu' per i beni di adesso */
function azzera() {
  ultimoEsito = null;
  ultimoCorpo = null;
  ultimiIndici = [];
  stato.proposta = null;
}

function dopoCambio(ms = ATTESA_MS) {
  // Il preventivo appena scaricato era dei beni di prima
  const fatto = document.getElementById('mz-esito');
  if (fatto) fatto.innerHTML = '';
  pianifica(ms);
}

function pianifica(ms = ATTESA_MS) {
  clearTimeout(timer);
  // Turno nuovo: una risposta gia' in viaggio, partita coi beni di prima, si scarta
  turno.nuovo();
  inAttesa = true;
  document.getElementById('mezzi-esito')?.classList.add('mt-in-attesa');
  rendiAzioni();
  timer = setTimeout(() => void calcola(), ms);
}

async function calcola() {
  const cfg = config();
  const box = $('mezzi-esito');
  const fine = () => {
    inAttesa = false;
    box.classList.remove('mt-in-attesa');
  };
  if (!stato.ricerca || !cfg) return fine();
  pulisciErrori();

  // Nessun bene scritto: niente da contare e niente da rimproverare
  if (righe.every(rigaVuota)) {
    turno.nuovo();
    fine();
    azzera();
    box.innerHTML = SUGGERIMENTO;
    return rendiAzioni();
  }

  // Lo stesso controllo del server, prima di mandargli la richiesta. Le righe appena
  // aggiunte e mai toccate restano fuori: niente conto e niente rimprovero per loro
  const ricercaId = stato.ricerca.id;
  const { righe: daMandare, indici } = righeDaMandare(righe);
  const prova = validaBeni(cfg.categorie, corpoProposte(stato.slug, ricercaId, daMandare, venditore, 0).beni);
  const anticipo = leggiAnticipo(anticipoTesto);
  if (!prova.ok || anticipo === null) {
    turno.nuovo();
    fine();
    azzera();
    box.innerHTML = '';
    if (!prova.ok) mostraErrore(rigaASchermo(indici, prova.riga), prova.error);
    else mostraErrore(null, 'anticipo_non_valido');
    return rendiAzioni();
  }

  const corpo = corpoProposte(stato.slug, ricercaId, daMandare, venditore, anticipo);
  const mio = turno.nuovo();
  box.classList.add('mt-in-attesa');
  const risposta = await apiJsonSicura('/api/motore/proposte', { method: 'POST', body: JSON.stringify(corpo) });
  // Una risposta vecchia non deve coprire quella dei beni appena cambiati
  if (!turno.vale(mio)) return;
  fine();
  const r = risposta?.corpo;
  if (!risposta || !risposta.res.ok || !r?.ok) {
    azzera();
    box.innerHTML = '';
    mostraErrore(risposta ? rigaASchermo(indici, r?.riga) : null, risposta ? r?.error ?? '' : 'connessione_assente');
    return rendiAzioni();
  }
  const { ok: _ok, ...schermo } = r;
  ultimoEsito = schermo as MezziSchermo;
  ultimoCorpo = corpo;
  ultimiIndici = indici;
  stato.proposta = { input: corpo, esito: schermo };
  rendiEsito();
  rendiAzioni();
  document.dispatchEvent(new CustomEvent('mt:proposta'));
}

/** La colonna che va nel PDF con l'esito a schermo: la scelta dell'agente se regge ancora */
function chiaveNelPdf(): string | null {
  if (!ultimoEsito) return null;
  const chiave = chiavePdf(ultimoEsito.leasing, sceltaPdf);
  // La colonna scelta non quota piu': si torna alla regola, senza ricordare la scelta
  if (sceltaPdf && chiave !== sceltaPdf) sceltaPdf = null;
  return chiave;
}

function rendiEsito() {
  const r = ultimoEsito;
  if (!r) return;
  const rosso = r.semaforo?.semaforo === 'rosso';
  $('mezzi-esito').innerHTML = `
    ${r.semaforo ? bloccoSemaforo(r.semaforo, `Valutazione su ${euroEsatto(r.totale)}`) : ''}
    ${rosso ? `<p class="mt-msg">${NOTA_ROSSO}</p>` : ''}
    <p class="mt-totale-beni">Totale beni <strong>${euroEsatto(r.totale)}</strong> <span class="mt-id">IVA esclusa · vende ${esc(r.venditore.ragioneSociale)}</span></p>
    <h3 class="mt-h3">Noleggio operativo</h3>
    ${riquadroNoleggio(r)}
    ${r.leasing.length ? `<h3 class="mt-h3">Leasing finanziario</h3>${tabellaLeasing(r.leasing, chiaveNelPdf())}` : ''}`;
}

// --- PDF e pulsanti ------------------------------------------------------------------------

/** L'ultimo markup di scelta e pulsanti: se non cambia non si ridisegna, cosi' un clic non cade su un elemento appena sostituito */
let ultimiBottoni = '';

function sceltaNelPdf(r: MezziSchermo, chiave: string | null): string {
  const colonne = colonneConRighe(r.leasing);
  if (!colonne.length) return '';
  const senzaNome = config()?.mostraNomiPartner ? ', senza il nome del partner' : '';
  if (colonne.length === 1) {
    return `<p class="mt-nota">Nel PDF va il leasing di ${esc(etichettaColonna(colonne[0]))}${senzaNome}.</p>`;
  }
  return `
    <fieldset class="mt-mz-pdf">
      <legend>Nel PDF</legend>
      ${colonne.map((c) => `
        <label class="mt-toggle"><input type="radio" name="mz-pdf" value="${esc(c.chiave)}" ${c.chiave === chiave ? 'checked' : ''} /> ${esc(etichettaColonna(c))}</label>`).join('')}
      <p class="mt-nota">Nel prospetto di leasing per il cliente va una soluzione sola${senzaNome}.</p>
    </fieldset>`;
}

/** Scelta del PDF e pulsante per l'esito a schermo; vuoto senza esito */
function markupAzioni(): string {
  const r = ultimoEsito;
  if (!stato.ricerca || !r) return '';
  const quota = Boolean(r.noleggio) || colonneConRighe(r.leasing).length > 0;
  return `
    ${sceltaNelPdf(r, chiaveNelPdf())}
    <div class="mt-azioni">
      <button type="button" class="mt-btn" id="mz-preventivo" ${inAttesa || !quota ? 'disabled' : ''}>Scarica il preventivo</button>
      <p class="mt-nota" style="flex-basis:100%;margin:0">${quota
        ? 'Il preventivo resta nello Storico: la pratica può partire da lì anche un altro giorno, dalla scheda Pratiche.'
        : "Né il noleggio né il leasing quotano questi beni: non c'è un preventivo da scaricare. Scrivi a Mediocredito Facile."}</p>
    </div>`;
}

function rendiAzioni() {
  const box = document.getElementById('mz-bottoni');
  if (!box || generando) return;
  const html = markupAzioni();
  if (html === ultimiBottoni) return;
  ultimiBottoni = html;
  box.innerHTML = html;
}

const ETICHETTA_DOC = (nome: string) =>
  /leasing/i.test(nome) ? 'Prospetto di leasing' : /noleggio/i.test(nome) ? 'Preventivo di noleggio' : nome;

async function scaricaPreventivo(btn: HTMLButtonElement) {
  // Il preventivo riparte dal corpo che ha prodotto i numeri a schermo: sono quelli che l'agente guarda
  const schermo = ultimoEsito;
  const corpo = ultimoCorpo;
  const indici = ultimiIndici;
  const ricercaId = stato.ricerca?.id;
  if (!schermo || !corpo || !ricercaId) return;
  const chiave = chiaveNelPdf();
  const esitoBox = $('mz-esito');
  esitoBox.innerHTML = '';
  generando = true;
  btn.disabled = true;
  btn.textContent = 'Preparo i documenti...';
  let risposta: Awaited<ReturnType<typeof apiJsonSicura>> = null;
  try {
    risposta = await apiJsonSicura('/api/motore/preventivo', {
      method: 'POST',
      body: JSON.stringify(chiave ? { ...corpo, leasingPdf: chiave } : corpo),
    });
  } finally {
    generando = false;
    // Il pulsante l'ha toccato questa funzione: si ridisegna da capo
    ultimiBottoni = '';
    rendiAzioni();
  }
  // Nel frattempo l'agente ha verificato un altro cliente: il preventivo e' salvato (lo
  // Storico lo mostra), ma non e' di questo cliente e la pratica non deve partire da li'
  if (stato.ricerca?.id !== ricercaId) {
    void caricaStorico();
    return;
  }
  if (!risposta) {
    esitoBox.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci('connessione_assente'))}</p>`;
    return;
  }
  const { res, corpo: r } = risposta;
  if (!res.ok || !r?.ok) {
    esitoBox.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(testoErrore(rigaASchermo(indici, r?.riga), r?.error ?? ''))}</p>`;
    return;
  }
  stato.ultimoPreventivo = r.id;
  stato.mezziPreventivo = { id: r.id, ricercaId, schermo, chiaveLeasing: chiave };
  const docs = (r.documenti ?? []) as { nome: string; pathname: string }[];
  esitoBox.innerHTML = `
    <div class="mt-card" style="margin-top:16px">
      <p class="mt-semaforo__tit">Preventivo ${esc(r.id)} salvato</p>
      ${docs.length
        ? `<p class="mt-nota" style="margin:0 0 8px">Da consegnare al cliente. Restano riscaricabili dallo Storico.</p>
           <p>${docs.map((d) => bottoneDoc(d, ETICHETTA_DOC(d.nome))).join(' · ')}</p>
           ${r.pdfPronti === false ? '<p class="mt-nota">Un documento non è stato salvato: rifai il preventivo tra qualche minuto.</p>' : ''}`
        : '<p class="mt-nota" style="margin:0">I PDF non sono pronti: la generazione non è andata a buon fine. Il preventivo è salvato nello Storico, riprova tra qualche minuto.</p>'}
      <div class="mt-azioni" style="margin-top:12px">
        <button type="button" class="mt-btn mt-btn--secondario" id="mz-pratica">Carica la pratica</button>
      </div>
    </div>`;
  apriSubito(esitoBox, docs);
  void caricaStorico();
}

// --- montaggio -----------------------------------------------------------------------------

/** Nuova ricerca: si riparte da una riga vuota, il cliente e' cambiato */
function suNuovaRicerca() {
  const r = stato.ricerca;
  const cfg = config();
  clearTimeout(timer);
  turno.nuovo();
  righe = [rigaNuova()];
  venditoreManuale = false;
  anticipoTesto = cfg ? String(cfg.anticipoPerc) : '';
  sceltaPdf = null;
  inAttesa = false;
  azzera();
  stato.mezziPreventivo = null;

  $('proposte-corpo').hidden = !r;
  $('proposte-cliente').textContent = r
    ? `Preventivo per ${r.scheda.ragioneSociale}, P.IVA ${r.scheda.piva}.`
    : 'Verifica prima un cliente nella sezione Cliente.';
  if (!cfg) return;
  $('mezzi-esito').innerHTML = r ? SUGGERIMENTO : '';
  $('mezzi-esito').classList.remove('mt-in-attesa');
  $('mz-esito').innerHTML = '';
  $<HTMLInputElement>('mr-anticipo').value = anticipoTesto;
  pulisciErrori();
  rendiRighe();
  suggerisciVenditore();
  rendiAzioni();
}

/** Il catalogo e' cambiato dal Pannello MCF: sui mezzi non si usa, ma il conto si rifa' sui beni a schermo */
export function aggiornaProposteMezzi(lista?: any[]) {
  if (lista) stato.catalogo = lista;
  if (stato.ricerca && !righe.every(rigaVuota)) pianifica(0);
}

export function montaProposteMezzi() {
  document.addEventListener('mt:ricerca', suNuovaRicerca);
  const cfg = config();
  if (!cfg) {
    $('mezzi-righe').innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci('configurazione_mancante'))}</p>`;
    return suNuovaRicerca();
  }

  $('mezzi-righe').innerHTML = `
    <div id="mr-tabella"></div>
    <div class="mt-azioni" style="margin-top:12px">
      <button type="button" class="mt-btn mt-btn--secondario" id="mr-aggiungi">Aggiungi un bene</button>
    </div>
    <div class="mt-griglia" style="margin-top:24px">
      <label class="mt-campo"><span>Vende</span>
        <select id="mr-venditore" class="mt-input">${opzioniVenditore(cfg)}</select>
        <small>La società che firma l'offerta. Segue la categoria del primo bene finché non la cambi.</small></label>
      <label class="mt-campo"><span>Anticipo del leasing, %</span>
        <input type="text" id="mr-anticipo" class="mt-input" inputmode="numeric" maxlength="3" autocomplete="off" />
        <small>Da 0 a 30, vale per tutti i partner. Il noleggio è sempre senza anticipo.</small></label>
    </div>
    <p id="mr-msg" class="mt-msg" hidden></p>`;
  $('mezzi-azioni').innerHTML = '<div id="mz-bottoni"></div><div id="mz-esito"></div>';

  // Righe: le caselle aggiornano i beni senza ridisegnarsi, i menu ricalcolano subito
  const righeBox = $('mezzi-righe');
  righeBox.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.id === 'mr-anticipo') {
      anticipoTesto = t.value;
      t.removeAttribute('aria-invalid');
      return dopoCambio();
    }
    const i = Number(t.dataset.i);
    const r = righe[i];
    const campo = t.dataset.campo;
    if (!r || (campo !== 'descrizione' && campo !== 'quantita' && campo !== 'prezzo')) return;
    r[campo] = t.value;
    t.removeAttribute('aria-invalid');
    aggiornaTotali();
    dopoCambio();
  });
  righeBox.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'mr-venditore') {
      venditore = t.value;
      venditoreManuale = true;
      t.removeAttribute('aria-invalid');
      return dopoCambio(0);
    }
    const i = Number(t.dataset.i);
    const r = righe[i];
    if (!r) return;
    if (t.dataset.campo === 'categoria') {
      r.categoria = t.value;
      // Categoria nuova, domanda nuova: si riparte dalla sua risposta, o da nessuna
      r.targato = targatoIniziale(cfg.categorie, r.categoria);
      const menu = righeBox.querySelector<HTMLSelectElement>(`[data-campo="targato"][data-i="${i}"]`);
      if (menu) {
        menu.innerHTML = opzioniTargato(cfg.categorie, r);
        menu.removeAttribute('aria-invalid');
      }
      if (i === 0) suggerisciVenditore();
    } else if (t.dataset.campo === 'targato') {
      r.targato = targatoDaMenu(t.value);
    } else if (t.dataset.campo === 'usato') {
      r.usato = usatoDaMenu(t.value);
    } else return;
    t.removeAttribute('aria-invalid');
    dopoCambio(0);
  });
  righeBox.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'mr-aggiungi') {
      // Il bene nuovo e' ancora da scrivere: resta fuori dal conto, quindi niente
      // richiesta e niente rimprovero finche' l'agente non ci scrive
      righe.push(rigaNuova());
      rendiRighe();
      if (erroreAttuale) segnaCasella(erroreAttuale.riga, erroreAttuale.errore);
      document.querySelector<HTMLInputElement>(`#mr-tabella [data-campo="descrizione"][data-i="${righe.length - 1}"]`)?.focus();
      return;
    }
    const togli = t.closest('[data-togli-bene]') as HTMLElement | null;
    if (!togli) return;
    righe.splice(Number(togli.dataset.togliBene), 1);
    if (!righe.length) righe.push(rigaNuova());
    // I numeri di prima parlavano di beni che non ci sono piu'
    azzera();
    rendiRighe();
    suggerisciVenditore();
    dopoCambio(0);
  });

  // Scelta del PDF e pulsanti
  const azioni = $('mezzi-azioni');
  azioni.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name !== 'mz-pdf') return;
    sceltaPdf = t.value;
    rendiEsito();
    // Il pallino l'ha gia' spostato il browser: ridisegnare le scelte toglierebbe il fuoco
    ultimiBottoni = markupAzioni();
  });
  azioni.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'mz-preventivo') void scaricaPreventivo(t as HTMLButtonElement);
    if (t.id === 'mz-pratica') {
      apriTab('pratiche');
      document.dispatchEvent(new CustomEvent('mt:nuova-pratica'));
    }
  });

  // Gli eventi negativi sono arrivati: il colore provvisorio diventa quello vero
  document.addEventListener('mt:eventi', () => { if (stato.ricerca && !righe.every(rigaVuota)) pianifica(0); });
  suNuovaRicerca();
}
