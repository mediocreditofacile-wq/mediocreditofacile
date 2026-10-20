// Scheda Proposte del settore "distinta" (oggi Led Office): il commerciale compone
// la fornitura dal catalogo e con righe fuori listino, sceglie dove si consegna,
// scrive le motivazioni che il prefiltro chiede e i dati per la proposta di vendita.
// Spec mcf_spec-ledoffice-motore_v1, paragrafi 5 e 7.
//
// Il conto lo fa il server (/api/motore/proposte): prefiltro sulla fornitura, rata
// per durata e, quando la rata non esce, il perche'. Nel browser non arriva nessun
// canale, nessuna tabella e nessun coefficiente: qui si raccolgono le scelte e si
// disegna quello che torna. Ogni cambio rifa' il conto dopo una breve pausa.
//
// Le caselle che il commerciale sta scrivendo (quantita', prezzi, motivazioni, dati
// di vendita) non si ridisegnano a ogni conto, altrimenti perderebbero il fuoco: si
// aggiornano solo totali, avvisi e pulsanti.

import { giornoItaliano, totaleRighe } from '../../lib/motore/distinta';
import { MOTIVAZIONE_MINIMA, motivazioneValida, TESTI_PREFILTRO } from '../../lib/motore/prefiltro';
import { bloccoSemaforo } from './cliente';
import { $, apiJson, apriTab, esc, euro, euroEsatto, messaggio, stato, traduci } from './comune';
import {
  filtraCatalogo,
  leggiNumero,
  mancantiProposte,
  motivazioniDopoTolta,
  opzioniConsegna,
  prezzoDaRiconfermare,
  righePerServer,
  type OpzioneConsegna,
  type RigaBrowser,
} from './distinta-browser';
import { bottoneDoc, caricaStorico } from './storico';
import { aggiornaVendita, datiVenditaCorrenti, rendiVendita, venditaMancanti } from './vendita-distinta';

interface Riga extends RigaBrowser {
  /** Prezzo del catalogo accanto a quello trattato. Null fuori listino */
  listino: number | null;
  validoFino: unknown;
}

let righe: Riga[] = [];
/** Per chiave del prefiltro: 'perdita', 'addetti', 'riga-N' */
let motivazioni: Record<string, string> = {};
let ledwallConfermato = false;
let opzioni: OpzioneConsegna[] = [];
/** Indice in `opzioni`, oppure 'altro' */
let consegnaScelta = 'altro';
let consegnaAltro = '';
/** L'ultima risposta del server sulla distinta a schermo */
let ultimoEsito: any = null;
/** Un conto e' in arrivo: i pulsanti restano spenti finche' non torna */
let inAttesa = false;
/** Un preventivo si sta generando: niente doppio clic */
let generando = false;
/** Le motivazioni chieste dall'ultimo conto: se non cambiano, le caselle restano dove sono */
let firmaMotivazioni = '';
let timer: ReturnType<typeof setTimeout> | undefined;
let richiesta = 0;
/** Durate quotate e totale dei beni dei preventivi fatti in questa sessione: li usa il modulo della pratica */
const preventivi = new Map<string, { durate: number[]; evidenza: number | null; beni: number }>();

const MOTIVI: Record<string, string> = {
  rosso: 'Con il prefiltro rosso la rata e i documenti per il cliente non escono. Puoi segnalare il cliente a Mediocredito Facile con la distinta: lo guarda e ti dice come procedere.',
  motivazioni: 'Scrivi le motivazioni che il prefiltro chiede: poi escono la rata e i documenti.',
  ledwall: "Conferma l'installazione del LEDwall: senza la spunta la rata e i documenti non escono.",
  nessun_canale: 'Su questo importo il portale non ha una rata da proporre. Segnala il cliente a Mediocredito Facile con la distinta: lo guarda e ti dice come presentarlo.',
};

const SUGGERIMENTO = '<p class="mt-vuoto" style="margin-top:24px">Aggiungi i beni dal catalogo o una riga fuori listino: qui compaiono il prefiltro sulla fornitura e la rata.</p>';

const categorie = (): { nome: string; postazione: boolean; ledwall: boolean }[] => stato.carrozzeria?.categorie ?? [];
const conLedwall = () => righe.some((r) => categorie().some((c) => c.nome === r.categoria && c.ledwall));
const campoTesto = (id: string) => (document.getElementById(id) as HTMLInputElement | null)?.value.trim() ?? '';
/** Come si rimette un numero nella casella: all'italiana, senza separatore delle migliaia */
const inCasella = (n: number) => (Number.isFinite(n) ? String(n).replace('.', ',') : '');

// --- quello che serve agli altri pezzi del portale ------------------------------------

/** L'indirizzo di consegna scelto: della scheda, oppure quello scritto a mano */
export function indirizzoConsegna(): string {
  if (consegnaScelta === 'altro') return consegnaAltro.trim();
  return opzioni[Number(consegnaScelta)]?.indirizzo ?? '';
}

/** Il corpo del conto (Task 8), senza i dati di vendita. Null se una riga non regge o manca il cliente */
export function inputDistinta() {
  if (!stato.ricerca) return null;
  const r = righePerServer(righe);
  if (!r.ok) return null;
  return {
    f: stato.slug,
    ricercaId: stato.ricerca.id,
    righe: r.righe,
    consegna: { indirizzo: indirizzoConsegna() },
    motivazioni: { ...motivazioni },
    ledwallConfermato,
  };
}

/**
 * La segnalazione a Mediocredito Facile porta la distinta a schermo: le righe se
 * reggono, la consegna, le motivazioni, la spunta e i dati di vendita scritti.
 */
export function corpoSegnalazione() {
  const r = righePerServer(righe);
  return {
    ...(r.ok ? { righe: r.righe } : {}),
    consegna: { indirizzo: indirizzoConsegna() },
    motivazioni: { ...motivazioni },
    ledwallConfermato,
    vendita: datiVenditaCorrenti(),
  };
}

/** Il totale dei beni delle righe che reggono: la checklist della segnalazione ci guarda */
export const totaleBeniCorrente = () => totaleRighe(righe.filter(rigaLeggibile));

/** Righe in distinta, per il riepilogo della segnalazione */
export const quanteRighe = () => righe.length;

/** Perche' la rata non esce, dall'ultimo conto */
export const motivoBloccoCorrente = (): string | null => ultimoEsito?.motivoBlocco ?? null;

/** Durate e beni di un preventivo fatto in questa sessione; null per quelli dello Storico */
export const infoPreventivo = (id: string | null) => (id ? preventivi.get(id) ?? null : null);

// --- catalogo ------------------------------------------------------------------------

function rendiCatalogo() {
  const elenco = document.getElementById('dc-elenco');
  if (!elenco) return;
  if (!stato.catalogo.length) {
    elenco.innerHTML = '<p class="mt-vuoto">Il catalogo di questo fornitore è vuoto. Scrivi a Mediocredito Facile, oppure aggiungi una riga fuori listino.</p>';
    return;
  }
  const lista = filtraCatalogo(stato.catalogo, $<HTMLSelectElement>('dc-categoria').value || null, $<HTMLInputElement>('dc-testo').value);
  const oggi = giornoItaliano(new Date());
  elenco.innerHTML = lista.length
    ? `<ul class="mt-dc-lista">${lista.map((v) => `
        <li>
          <span>
            <span class="mt-voce__nome">${esc(v.nome)}</span>
            <span class="mt-id">${esc(v.attributi?.categoria ?? '')} · listino ${euroEsatto(v.prezzo)}${
              prezzoDaRiconfermare(v.attributi?.valido_fino, oggi) ? ' · <span class="mt-riconferma">prezzo da riconfermare</span>' : ''}</span>
          </span>
          <button type="button" class="mt-btn mt-btn--secondario" data-aggiungi="${esc(v.codice)}">Aggiungi</button>
        </li>`).join('')}</ul>`
    : '<p class="mt-nota">Nessun bene con queste parole. Cambia categoria o testo, oppure aggiungi una riga fuori listino.</p>';
}

function aggiungiVoce(codice: string) {
  const v = stato.catalogo.find((x) => x.codice === codice);
  if (!v) return;
  // La stessa voce aggiunta di nuovo aumenta la quantita' invece di fare una riga doppia
  const gia = righe.findIndex((r) => r.codice === v.codice);
  if (gia >= 0) {
    const q = righe[gia].quantita;
    righe[gia].quantita = Number.isInteger(q) && q >= 1 ? q + 1 : 1;
  } else {
    righe.push({
      codice: v.codice,
      descrizione: v.nome,
      categoria: String(v.attributi?.categoria ?? ''),
      quantita: 1,
      prezzo: Number(v.prezzo),
      listino: Number(v.prezzo),
      validoFino: v.attributi?.valido_fino,
    });
  }
  rendiRighe();
  dopoCambio();
  const i = gia >= 0 ? gia : righe.length - 1;
  document.querySelector<HTMLInputElement>(`#dr-tabella [data-campo="quantita"][data-i="${i}"]`)?.focus();
}

// --- righe ---------------------------------------------------------------------------

function rigaLeggibile(r: Riga) {
  return Number.isFinite(r.quantita) && Number.isFinite(r.prezzo) && r.quantita > 0 && r.prezzo > 0;
}
const totaleCella = (r: Riga) => (rigaLeggibile(r) ? euroEsatto(totaleRighe([r])) : '—');

function aggiornaTotale() {
  const cella = document.getElementById('dr-totale');
  if (cella) cella.textContent = euroEsatto(totaleRighe(righe.filter(rigaLeggibile)));
}

function rendiRighe() {
  const box = $('dr-tabella');
  if (!righe.length) {
    box.innerHTML = '<p class="mt-vuoto">Nessun bene ancora. Cercalo nel catalogo qui sopra, oppure aggiungi una riga fuori listino.</p>';
    rendiLedwall();
    return;
  }
  const oggi = giornoItaliano(new Date());
  box.innerHTML = `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--righe">
      <thead><tr><th>Bene</th><th class="num">Quantità</th><th class="num">Prezzo unitario</th><th class="num">Totale</th><th></th></tr></thead>
      <tbody>${righe.map((r, i) => `
        <tr>
          <td>${i + 1}. ${esc(r.descrizione)}<br>
            <span class="mt-id">${esc(r.categoria)}${r.codice ? '' : ' · fuori listino'}</span>
            ${r.codice && prezzoDaRiconfermare(r.validoFino, oggi) ? '<br><span class="mt-riconferma">prezzo da riconfermare</span>' : ''}</td>
          <td class="num"><input type="text" class="mt-input mt-input--q" data-campo="quantita" data-i="${i}" inputmode="numeric"
            value="${inCasella(r.quantita)}" aria-label="Quantità, riga ${i + 1}" autocomplete="off" /></td>
          <td class="num"><input type="text" class="mt-input mt-input--p" data-campo="prezzo" data-i="${i}" inputmode="decimal"
            value="${inCasella(r.prezzo)}" aria-label="Prezzo unitario, riga ${i + 1}" autocomplete="off" />
            ${r.listino != null ? `<br><small class="mt-id">listino ${euroEsatto(r.listino)}</small>` : ''}</td>
          <td class="num" data-totale="${i}">${totaleCella(r)}</td>
          <td><button type="button" class="mt-link" data-togli-riga="${i}" aria-label="Togli la riga ${i + 1}">togli</button></td>
        </tr>`).join('')}</tbody>
      <tfoot><tr><td colspan="3">Totale beni, IVA esclusa</td><td class="num" id="dr-totale"></td><td></td></tr></tfoot>
    </table></div>`;
  aggiornaTotale();
  rendiLedwall();
}

function togliRiga(i: number) {
  righe.splice(i, 1);
  // La motivazione della riga tolta sparisce e quelle dopo scalano: un testo non
  // deve mai finire sotto un altro bene. Le caselle tornano col prossimo conto.
  motivazioni = motivazioniDopoTolta(motivazioni, i);
  firmaMotivazioni = '';
  $('dr-motivazioni').innerHTML = '';
  rendiRighe();
  dopoCambio();
}

const ERRORE_RIGA: Record<string, string> = {
  quantita_non_valida: 'quantita',
  prezzo_non_valido: 'prezzo',
};

/** L'errore di una riga sotto la tabella, e la casella giusta segnata */
function mostraErroreRiga(riga: number | null, errore: string, testo?: string) {
  const msg = testo || traduci(errore);
  messaggio($('dr-msg'), riga != null ? `Riga ${riga + 1}: ${msg}` : msg, false);
  const campo = ERRORE_RIGA[errore];
  if (riga != null && campo) {
    document.querySelector(`#dr-tabella [data-campo="${campo}"][data-i="${riga}"]`)?.setAttribute('aria-invalid', 'true');
  }
}

function aggiungiFuoriListino() {
  const msg = $('df-msg');
  const riga: Riga = {
    codice: null,
    descrizione: campoTesto('df-descrizione'),
    categoria: $<HTMLSelectElement>('df-categoria').value,
    quantita: leggiNumero(campoTesto('df-quantita')),
    prezzo: leggiNumero(campoTesto('df-prezzo')),
    listino: null,
    validoFino: null,
  };
  const prova = righePerServer([riga]);
  if (!prova.ok) return messaggio(msg, traduci(prova.errore), false);
  messaggio(msg, '', false);
  righe.push(riga);
  for (const id of ['df-descrizione', 'df-prezzo']) $<HTMLInputElement>(id).value = '';
  $<HTMLInputElement>('df-quantita').value = '1';
  rendiRighe();
  dopoCambio();
}

// --- consegna, motivazioni, LEDwall ------------------------------------------------------

function rendiConsegna() {
  const s = stato.ricerca?.scheda ?? {};
  opzioni = opzioniConsegna({ sede: s.sede ?? null, unitaLocali: s.unitaLocali ?? [] });
  // Di solito si consegna alla sede legale: e' il punto di partenza
  consegnaScelta = opzioni.length ? '0' : 'altro';
  consegnaAltro = '';
  $('dr-consegna').innerHTML = `
    <p class="mt-semaforo__tit" style="margin-top:24px">Consegna</p>
    <div class="mt-consegna" role="radiogroup" aria-label="Indirizzo di consegna">
      ${opzioni.map((o, i) => `
        <label class="mt-toggle"><input type="radio" name="dr-consegna" value="${i}" ${i === 0 ? 'checked' : ''} /> ${esc(o.etichetta)}</label>`).join('')}
      <label class="mt-toggle"><input type="radio" name="dr-consegna" value="altro" ${opzioni.length ? '' : 'checked'} /> Altro indirizzo</label>
      <input type="text" id="dr-consegna-altro" class="mt-input" maxlength="200" autocomplete="off"
        placeholder="Via, numero civico, CAP, comune e provincia" aria-label="Altro indirizzo di consegna" ${opzioni.length ? 'hidden' : ''} />
    </div>
    <p class="mt-nota">Sede legale e unità locali sono quelle del Registro imprese. Un altro indirizzo si può usare: il prefiltro lo segnala.</p>`;
}

function rendiMotivazioni(esito: any) {
  const box = $('dr-motivazioni');
  const richieste: { chiave: string; testo: string }[] = esito?.prefiltro?.motivazioniRichieste ?? [];
  const firma = JSON.stringify(richieste);
  if (firma === firmaMotivazioni) return;
  firmaMotivazioni = firma;
  box.innerHTML = richieste.length
    ? `
      <p class="mt-semaforo__tit" style="margin-top:24px">Da motivare</p>
      <p class="mt-nota" style="margin-top:0">Il prefiltro chiede una spiegazione, di almeno ${MOTIVAZIONE_MINIMA} caratteri. Resta nella proposta
        salvata e arriva a Mediocredito Facile con la pratica: nei documenti per il cliente non compare.</p>
      ${richieste.map((m) => `
        <label class="mt-campo mt-motivazione"><span>${esc(m.testo)}</span>
          <textarea class="mt-input" rows="2" maxlength="1000" data-motivazione="${esc(m.chiave)}">${esc(motivazioni[m.chiave] ?? '')}</textarea>
          <small class="mt-campo__errore" data-corta="${esc(m.chiave)}" ${troppoCorta(m.chiave) ? '' : 'hidden'}>Almeno ${MOTIVAZIONE_MINIMA} caratteri.</small>
        </label>`).join('')}`
    : '';
}

/** Scritta ma troppo corta: quella vuota non si rimprovera, la chiede gia' il titolo */
const troppoCorta = (chiave: string) => {
  const t = motivazioni[chiave] ?? '';
  return t.trim() !== '' && !motivazioneValida(t);
};

function rendiLedwall() {
  const box = $('dr-ledwall');
  if (!conLedwall()) {
    // Tolto il LEDwall, la conferma si rida' se torna
    box.innerHTML = '';
    ledwallConfermato = false;
    return;
  }
  if (document.getElementById('dr-ledwall-ok')) return;
  box.innerHTML = `
    <div class="mt-ledwall">
      <p class="mt-semaforo__tit">LEDwall nella fornitura</p>
      <label class="mt-toggle"><input type="checkbox" id="dr-ledwall-ok" ${ledwallConfermato ? 'checked' : ''} /> ${esc(TESTI_PREFILTRO.ledwall)}</label>
      <p class="mt-nota" style="margin-bottom:0">Senza questa conferma la proposta non esce.</p>
    </div>`;
}

// --- il conto ----------------------------------------------------------------------------

function dopoCambio() {
  // Il preventivo appena scaricato era della distinta di prima
  const fatto = document.getElementById('dz-esito');
  if (fatto) fatto.innerHTML = '';
  pianifica();
}

function pianifica(ms = 450) {
  clearTimeout(timer);
  inAttesa = true;
  rendiAzioni();
  timer = setTimeout(() => void calcola(), ms);
}

async function calcola() {
  if (!stato.ricerca) return;
  const esitoBox = $('distinta-esito');
  const prova = righePerServer(righe);
  if (!prova.ok) {
    richiesta++;
    inAttesa = false;
    ultimoEsito = null;
    stato.proposta = null;
    if (prova.errore === 'distinta_vuota') {
      messaggio($('dr-msg'), '', false);
      esitoBox.innerHTML = SUGGERIMENTO;
    } else {
      mostraErroreRiga(prova.riga, prova.errore);
      esitoBox.innerHTML = '';
    }
    firmaMotivazioni = '';
    $('dr-motivazioni').innerHTML = '';
    rendiAzioni();
    return;
  }
  messaggio($('dr-msg'), '', false);
  const input = inputDistinta()!;
  const mia = ++richiesta;
  esitoBox.classList.add('mt-in-attesa');
  const { res, corpo } = await apiJson('/api/motore/proposte', { method: 'POST', body: JSON.stringify(input) });
  // Una risposta vecchia non deve coprire quella della riga appena cambiata
  if (mia !== richiesta) return;
  inAttesa = false;
  esitoBox.classList.remove('mt-in-attesa');
  if (!res.ok || !corpo?.ok) {
    ultimoEsito = null;
    stato.proposta = null;
    esitoBox.innerHTML = '';
    mostraErroreRiga(corpo?.riga ?? null, corpo?.error ?? '', corpo?.messaggio);
    rendiAzioni();
    return;
  }
  ultimoEsito = corpo;
  stato.proposta = { input, esito: corpo };
  rendiEsito(corpo);
  rendiMotivazioni(corpo);
  rendiAzioni();
  document.dispatchEvent(new CustomEvent('mt:proposta'));
}

function tabellaRate(r: any): string {
  if (!r.rate?.length) return '<p class="mt-nota">Rata non disponibile su questo importo.</p>';
  return `
    <div class="mt-scorri"><table class="mt-tabella mt-tabella--rate">
      <thead><tr><th>Durata</th><th class="num">Canone mensile, IVA esclusa</th></tr></thead>
      <tbody>${r.rate.map((x: any) => `
        <tr class="${x.durata === r.durataEvidenza ? 'scelta' : ''}"><td>${esc(x.durata)} mesi</td><td class="num">${euro(x.canone, 2)}</td></tr>`).join('')}</tbody>
    </table></div>
    ${r.daConfermare ? '<p class="mt-da-confermare">Rata indicativa, da confermare.</p>' : ''}
    ${r.nota ? `<p class="mt-nota">${esc(r.nota)}</p>` : ''}
    ${r.richiedeProvvisorio ? "<p class=\"mt-nota\">Su questo importo la pratica chiede anche la situazione contabile dell'anno (bilancio provvisorio).</p>" : ''}`;
}

/** Sul bloccato resta solo il testo fisso: niente distinta, niente criteri, niente eventi */
function soloBloccato(r: any) {
  for (const id of ['distinta-catalogo', 'distinta-righe', 'distinta-vendita', 'distinta-azioni']) $(id).hidden = true;
  $('distinta-esito').innerHTML = bloccoSemaforo({ semaforo: 'bloccato', etichetta: r.prefiltro?.etichetta, righe: [TESTI_PREFILTRO.bloccato] }, 'Prefiltro');
}

function rendiEsito(r: any) {
  if (r.motivoBlocco === 'bloccato' || r.semaforo === 'bloccato') return soloBloccato(r);
  // Su rosso e senza canale la proposta di vendita non esce: i suoi dati non servono
  $('distinta-vendita').hidden = r.motivoBlocco === 'rosso' || r.motivoBlocco === 'nessun_canale';
  $('distinta-esito').innerHTML = `
    ${bloccoSemaforo(r.prefiltro, 'Prefiltro sulla fornitura')}
    <p class="mt-totale-beni">Totale beni <strong>${euroEsatto(r.totaleBeni)}</strong> <span class="mt-id">IVA esclusa</span></p>
    ${r.motivoBlocco ? `<p class="mt-msg mt-msg--errore">${esc(MOTIVI[r.motivoBlocco] ?? traduci(''))}</p>` : tabellaRate(r)}`;
}

/** Dopo ogni cambio dei dati di vendita (o della consegna): cosa manca e i pulsanti */
function dopoVendita(segna = false) {
  aggiornaVendita(indirizzoConsegna(), segna);
  rendiAzioni();
}

// --- pulsanti ----------------------------------------------------------------------------

/** L'ultimo markup dei pulsanti: se non cambia non si ridisegna, cosi' un clic non cade su un pulsante appena sostituito */
let ultimiBottoni = '';

function rendiAzioni() {
  const box = document.getElementById('dz-bottoni');
  if (!box || generando) return;
  const metti = (html: string) => {
    if (html === ultimiBottoni) return;
    ultimiBottoni = html;
    box.innerHTML = html;
  };
  const r = ultimoEsito;
  if (!stato.ricerca || !r || r.motivoBlocco === 'bloccato') return metti('');
  if (r.motivoBlocco === 'rosso' || r.motivoBlocco === 'nessun_canale') {
    return metti(`<button type="button" class="mt-btn" id="dz-segnala" ${inAttesa ? 'disabled' : ''}>Segnala a Mediocredito Facile</button>`);
  }
  const spenti = inAttesa || Boolean(r.motivoBlocco);
  const proposteFattibili = mancantiProposte(venditaMancanti(), indirizzoConsegna()).length === 0;
  metti(`
    <button type="button" class="mt-btn" id="dz-tutto" ${spenti || !proposteFattibili ? 'disabled' : ''}>Scarica il preventivo e la proposta</button>
    <button type="button" class="mt-btn mt-btn--secondario" id="dz-canone" ${spenti ? 'disabled' : ''}>Solo il preventivo del canone</button>
    <p class="mt-nota" style="flex-basis:100%;margin:0">${
      r.motivoBlocco
        ? 'I documenti escono quando la rata è calcolata: guarda il prefiltro qui sopra.'
        : proposteFattibili
          ? 'Il preventivo del canone e la proposta di vendita si salvano insieme e restano nello Storico.'
          : 'La proposta di vendita esce quando i dati qui sopra sono completi. Il preventivo del canone esce già.'}</p>`);
}

const ETICHETTA_DOC = (nome: string) =>
  /proposta-vendita/i.test(nome) ? 'Proposta di vendita' : /preventivo-canone/i.test(nome) ? 'Preventivo del canone' : nome;

async function genera(btn: HTMLButtonElement, conProposta: boolean) {
  const input = inputDistinta();
  if (!input) return;
  // Senza indirizzo di consegna o con i dati incompleti la proposta di vendita non si chiede
  const corpo = conProposta ? { ...input, vendita: datiVenditaCorrenti() } : input;
  const esitoBox = $('dz-esito');
  generando = true;
  for (const b of document.querySelectorAll<HTMLButtonElement>('#dz-bottoni .mt-btn')) b.disabled = true;
  btn.textContent = 'Preparo i documenti...';
  const { res, corpo: r } = await apiJson('/api/motore/preventivo', { method: 'POST', body: JSON.stringify(corpo) });
  generando = false;
  // I pulsanti li ha toccati questa funzione: si ridisegnano da capo
  ultimiBottoni = '';
  rendiAzioni();
  if (!res.ok || !r?.ok) {
    const testo = r?.messaggio || traduci(r?.error ?? '');
    esitoBox.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(r?.riga != null ? `Riga ${r.riga + 1}: ${testo}` : testo)}</p>`;
    return;
  }
  stato.ultimoPreventivo = r.id;
  preventivi.set(r.id, {
    durate: (ultimoEsito?.rate ?? []).map((x: any) => x.durata),
    evidenza: ultimoEsito?.durataEvidenza ?? null,
    beni: Number(ultimoEsito?.totaleBeni) || totaleBeniCorrente(),
  });
  const docs = (r.documenti ?? []) as { nome: string; pathname: string }[];
  const senzaProposta = conProposta && docs.length > 0 && !docs.some((d) => /proposta-vendita/i.test(d.nome));
  esitoBox.innerHTML = `
    <div class="mt-card" style="margin-top:16px">
      <p class="mt-semaforo__tit">Preventivo ${esc(r.id)} salvato</p>
      ${docs.length
        ? `<p class="mt-nota" style="margin:0 0 8px">Da consegnare al cliente. Restano riscaricabili dallo Storico.</p>
           <p>${docs.map((d) => bottoneDoc(d, ETICHETTA_DOC(d.nome))).join(' · ')}</p>
           ${r.pdfPronti === false ? '<p class="mt-nota">Un documento non è stato salvato: rifai il preventivo tra qualche minuto.</p>' : ''}
           ${senzaProposta ? '<p class="mt-nota">La proposta di vendita non è uscita: controlla i dati per la proposta e rifai.</p>' : ''}`
        : '<p class="mt-nota" style="margin:0">I PDF non sono pronti: la generazione non è andata a buon fine. Il preventivo è salvato nello Storico, riprova tra qualche minuto.</p>'}
      <div class="mt-azioni" style="margin-top:12px">
        <button type="button" class="mt-btn mt-btn--secondario" id="dz-pratica">Carica la pratica</button>
      </div>
    </div>`;
  void caricaStorico();
}

// --- montaggio -----------------------------------------------------------------------------

/** Nuova ricerca: si riparte da zero, il cliente e' cambiato */
function suNuovaRicerca() {
  const r = stato.ricerca;
  clearTimeout(timer);
  richiesta++;
  righe = [];
  motivazioni = {};
  ledwallConfermato = false;
  ultimoEsito = null;
  inAttesa = false;
  firmaMotivazioni = '';
  stato.proposta = null;

  // Sul bloccato la distinta non compare: resta il testo fisso
  const bloccato = r?.credito?.semaforo === 'bloccato';
  $('proposte-corpo').hidden = !r || bloccato;
  $('proposte-cliente').textContent = !r
    ? 'Verifica prima un cliente nella sezione Cliente.'
    : bloccato
      ? TESTI_PREFILTRO.bloccato
      : `Fornitura per ${r.scheda.ragioneSociale}, P.IVA ${r.scheda.piva}.`;
  for (const id of ['distinta-catalogo', 'distinta-righe', 'distinta-vendita', 'distinta-azioni']) $(id).hidden = false;
  $('distinta-esito').innerHTML = r && !bloccato ? SUGGERIMENTO : '';
  $('dr-motivazioni').innerHTML = '';
  $('dz-esito').innerHTML = '';
  messaggio($('dr-msg'), '', false);
  if (!r || bloccato) {
    $('dr-tabella').innerHTML = '';
    $('dr-consegna').innerHTML = '';
    $('dr-ledwall').innerHTML = '';
    $('distinta-vendita').innerHTML = '';
    rendiAzioni();
    return;
  }
  rendiConsegna();
  rendiRighe();
  rendiVendita();
  dopoVendita();
}

/** Il catalogo e' cambiato dal Pannello MCF: si ridisegna senza ricaricare. Le righe restano, il server dice se una voce non c'e' piu' */
export function aggiornaProposteDistinta(lista?: any[]) {
  if (lista) stato.catalogo = lista;
  rendiCatalogo();
  if (righe.length) pianifica(0);
}

export function montaProposteDistinta() {
  const cat = categorie();
  const opzioniCategoria = cat.map((c) => `<option value="${esc(c.nome)}">${esc(c.nome)}</option>`).join('');
  $('distinta-catalogo').innerHTML = `
    <div class="mt-griglia">
      <label class="mt-campo"><span>Categoria</span>
        <select id="dc-categoria" class="mt-input"><option value="">Tutte le categorie</option>${opzioniCategoria}</select></label>
      <label class="mt-campo"><span>Cerca nel catalogo</span>
        <input type="search" id="dc-testo" class="mt-input" placeholder="Modello, marca o codice" autocomplete="off" /></label>
    </div>
    <div id="dc-elenco"></div>`;
  $('distinta-righe').innerHTML = `
    <h3 class="mt-h3">Le righe della fornitura</h3>
    <div id="dr-tabella"></div>
    <p id="dr-msg" class="mt-msg" hidden></p>
    <details class="mt-fuori">
      <summary>Aggiungi una riga fuori listino</summary>
      <p class="mt-nota">Per i LEDwall a progetto, i beni che non sono ancora a catalogo e i servizi che il fornitore fattura davvero.</p>
      <div class="mt-griglia">
        <label class="mt-campo"><span>Descrizione</span><input type="text" id="df-descrizione" class="mt-input" maxlength="200" autocomplete="off" /></label>
        <label class="mt-campo"><span>Categoria</span>
          <select id="df-categoria" class="mt-input"><option value="">Scegli la categoria</option>${opzioniCategoria}</select></label>
        <label class="mt-campo"><span>Quantità</span><input type="text" id="df-quantita" class="mt-input" inputmode="numeric" value="1" autocomplete="off" /></label>
        <label class="mt-campo"><span>Prezzo unitario, IVA esclusa</span><input type="text" id="df-prezzo" class="mt-input" inputmode="decimal" autocomplete="off" /></label>
      </div>
      <div class="mt-azioni" style="margin-top:12px"><button type="button" id="df-aggiungi" class="mt-btn mt-btn--secondario">Aggiungi la riga</button></div>
      <p id="df-msg" class="mt-msg" hidden></p>
    </details>
    <div id="dr-consegna"></div>
    <div id="dr-motivazioni"></div>
    <div id="dr-ledwall"></div>`;
  $('distinta-azioni').innerHTML = '<div id="dz-bottoni" class="mt-azioni"></div><div id="dz-esito"></div>';
  rendiCatalogo();

  // catalogo
  $('dc-categoria').addEventListener('change', rendiCatalogo);
  $('dc-testo').addEventListener('input', rendiCatalogo);
  $('dc-elenco').addEventListener('click', (e) => {
    const b = (e.target as HTMLElement).closest('[data-aggiungi]') as HTMLElement | null;
    if (b) aggiungiVoce(b.dataset.aggiungi!);
  });

  // righe, fuori listino, consegna, motivazioni, LEDwall
  const righeBox = $('distinta-righe');
  righeBox.addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement | HTMLTextAreaElement;
    if (t.dataset.campo) {
      const i = Number(t.dataset.i);
      const r = righe[i];
      if (!r) return;
      // Quantita' e prezzo al server come numeri: "1.500" qui diventa 1500
      const n = leggiNumero(t.value);
      if (t.dataset.campo === 'quantita') r.quantita = n;
      else r.prezzo = n;
      t.removeAttribute('aria-invalid');
      const cella = righeBox.querySelector(`[data-totale="${i}"]`);
      if (cella) cella.textContent = totaleCella(r);
      aggiornaTotale();
      dopoCambio();
      return;
    }
    if (t.dataset.motivazione) {
      motivazioni[t.dataset.motivazione] = t.value;
      const corta = righeBox.querySelector<HTMLElement>(`[data-corta="${CSS.escape(t.dataset.motivazione)}"]`);
      if (corta) corta.hidden = !troppoCorta(t.dataset.motivazione);
      dopoCambio();
      return;
    }
    if (t.id === 'dr-consegna-altro') {
      consegnaAltro = t.value;
      dopoVendita();
      dopoCambio();
    }
  });
  righeBox.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.name === 'dr-consegna') {
      consegnaScelta = t.value;
      const altro = $<HTMLInputElement>('dr-consegna-altro');
      altro.hidden = t.value !== 'altro';
      if (t.value === 'altro') altro.focus();
      dopoVendita();
      pianifica(0);
    }
    if (t.id === 'dr-ledwall-ok') {
      ledwallConfermato = t.checked;
      pianifica(0);
    }
  });
  righeBox.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    const togli = t.closest('[data-togli-riga]') as HTMLElement | null;
    if (togli) return togliRiga(Number(togli.dataset.togliRiga));
    if (t.id === 'df-aggiungi') aggiungiFuoriListino();
  });

  // dati per la proposta di vendita
  const vendita = $('distinta-vendita');
  vendita.addEventListener('input', () => dopoVendita());
  vendita.addEventListener('focusout', () => dopoVendita(true));

  // pulsanti
  $('distinta-azioni').addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'dz-tutto') void genera(t as HTMLButtonElement, true);
    if (t.id === 'dz-canone') void genera(t as HTMLButtonElement, false);
    if (t.id === 'dz-pratica' || t.id === 'dz-segnala') {
      apriTab('pratiche');
      document.dispatchEvent(new CustomEvent('mt:nuova-pratica', { detail: { segnalazione: t.id === 'dz-segnala' } }));
    }
  });

  document.addEventListener('mt:ricerca', suNuovaRicerca);
  // Gli eventi negativi sono arrivati: il colore provvisorio diventa quello vero
  document.addEventListener('mt:eventi', () => { if (righe.length) pianifica(0); });
  suNuovaRicerca();
}
