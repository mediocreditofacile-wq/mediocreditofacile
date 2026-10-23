// Sezione Pratiche: caricamento della pratica con i documenti, elenco con lo
// stato, e per MCF il cambio di stato libero (anche saltando passaggi, anche
// su piu' pratiche insieme) e l'esito della verifica eventi negativi.
// Sul settore distinta il modulo di caricamento e' quello di pratiche-distinta.ts.
// Sul settore mezzi il modulo e' questo, ma parte solo da un preventivo salvato del
// cliente, scelto da un menu: quello appena scaricato o uno dello Storico, anche di un
// altro giorno. Importo, prodotti, partner del leasing e durate sono quelli del
// preventivo scelto (rendiModuloMezzi).

import { upload } from '@vercel/blob/client';
import { buildChecklist } from '../../lib/checklist-pratica';
import { controllaDatiCliente } from '../../lib/dati-cliente-pratica';
import { initCampoIban, type CampoIban } from '../campo-iban';
import { $, apiJson, data, esc, euro, euroEsatto, messaggio, stato, traduci } from './comune';
import {
  checklistPraticaMezzi,
  corpoPraticaMezzi,
  preventiviPerPratica,
  type PreventivoInMenu,
  type PreventivoStorico,
  type SceltePratica,
} from './mezzi-browser';
import { montaPraticheDistinta, rendiModuloDistinta } from './pratiche-distinta';
import { bottoneDoc, caricaStorico, suStorico, type DatiStorico } from './storico';

/**
 * Le etichette che leggono referente e agente. I tre stati "inserita su ..." arrivano
 * dal server gia' ridotti a "inserita": i nomi dei canali e il menu completo li manda
 * il server solo a MCF (storico, campo `stati`), cosi' questo codice non li contiene.
 */
const ETICHETTA: Record<string, string> = {
  'ricevuta': 'Ricevuta',
  'in-lavorazione': 'In lavorazione',
  'inserita': 'Inserita presso la società di noleggio',
  'in-delibera': 'In delibera',
  'approvata': 'Approvata',
  'declinata': 'Declinata',
};
/** Il menu degli stati per MCF, [codice, etichetta], dallo storico */
let statiAdmin: [string, string][] = [];
const FORME = ['Società di capitali', 'Società di persone', 'Ditta individuale', 'Lavoratore autonomo', 'Altro'];

let bozza = '';
let file: File[] = [];
let campoIban: CampoIban | null = null;
let pratiche: any[] = [];
/** Pratiche lavorate prima del portale: l'API le manda solo a referente e MCF */
let esterne: any[] = [];
/** Settore mezzi: il preventivo da cui parte il modulo aperto, con quello che offre */
let mezzi: SceltePratica | null = null;
/** Settore mezzi: i preventivi che il menu del modulo aperto offre */
let menuMezzi: PreventivoInMenu[] = [];
/** Settore mezzi: i preventivi dello Storico, per il menu */
let preventiviStorico: PreventivoStorico[] = [];
/** Settore mezzi: il modulo aperto non ha ancora un preventivo e aspetta lo Storico */
let mezziInAttesa = false;
/** Settore mezzi: la verifica per cui e' aperto il modulo; un'altra verifica non tocca il suo menu */
let ricercaModulo: string | null = null;

/** La forma giuridica del Registro, ridotta alle voci della checklist */
function formaDaScheda(forma: string | null): string {
  const f = (forma ?? '').toUpperCase();
  if (/RESPONSABILIT|AZION|S\.R\.L|S\.P\.A|COOPERATIV|CONSORZIO/.test(f)) return 'Società di capitali';
  if (/NOME COLLETTIVO|ACCOMANDITA|SEMPLICE|S\.N\.C|S\.A\.S/.test(f)) return 'Società di persone';
  if (/INDIVIDUAL/.test(f)) return 'Ditta individuale';
  return 'Altro';
}

function opzioniDurata(prodotto: string): number[] {
  const e = stato.proposta?.esito;
  const da = prodotto === 'leasing' ? e?.leasing : e?.noleggio;
  const durate = (da ?? []).map((x: any) => x.durata);
  return durate.length ? durate : [24, 36, 48, 60, 72, 84];
}

function rendiChecklist() {
  const forma = (document.getElementById('pr-forma') as HTMLSelectElement | null)?.value ?? '';
  const extra = stato.carrozzeria?.documentiExtra ?? [];
  // Settore mezzi: l'importo e' quello del preventivo, e il leasing chiede il bilancio analitico
  const prodotto = (document.getElementById('pr-prodotto') as HTMLSelectElement | null)?.value ?? '';
  const lista = stato.settore === 'mezzi' && mezzi
    ? checklistPraticaMezzi(forma, mezzi.importo, extra, prodotto)
    : buildChecklist(forma, Number((document.getElementById('pr-importo') as HTMLInputElement | null)?.value) || 0, extra);
  const el = document.getElementById('pr-checklist');
  if (el) el.innerHTML = lista.map((v) => `<li>${esc(v)}</li>`).join('');
}

function rendiFile() {
  const el = document.getElementById('pr-file-lista');
  if (!el) return;
  el.innerHTML = file.length
    ? file.map((f, i) => `<li>${esc(f.name)} <span class="mt-id">${Math.round(f.size / 1024)} KB</span>
        <button type="button" class="mt-link" data-togli="${i}">togli</button></li>`).join('')
    : '<li class="mt-id">Nessun documento ancora.</li>';
}

/** La forma giuridica, partendo da quella del Registro */
const campoForma = (r: NonNullable<typeof stato.ricerca>) => `
        <label class="mt-campo"><span>Forma giuridica</span>
          <select id="pr-forma" class="mt-input">${FORME.map((f) => `<option ${f === formaDaScheda(r.scheda.formaGiuridica) ? 'selected' : ''}>${f}</option>`).join('')}</select></label>`;

/** Referente, cellulare ed email: le stesse caselle su ogni settore */
const CAMPI_REFERENTE = `
        <label class="mt-campo"><span>Referente del cliente</span><input type="text" id="pr-ref-nome" class="mt-input" placeholder="Nome e cognome" /></label>
        <label class="mt-campo"><span>Cellulare del referente *</span><input type="tel" id="pr-ref-tel" class="mt-input" required autocomplete="off" /></label>
        <label class="mt-campo"><span>Email del referente *</span><input type="email" id="pr-ref-email" class="mt-input" required autocomplete="off" /></label>`;

/** IBAN, note, documenti e invio: lo stesso modulo su ogni settore */
const CODA_MODULO = `
      <label class="mt-campo" style="margin-top:16px"><span>IBAN del conto aziendale *</span>
        <input type="text" id="pr-iban" class="mt-input mt-input--iban" required autocomplete="off" spellcheck="false"
          inputmode="text" maxlength="48" placeholder="27 caratteri, inizia con IT" aria-describedby="pr-iban-esito" />
        <small>Quello su cui il cliente pagherà i canoni. Senza IBAN la pratica non parte.</small>
        <span id="pr-iban-esito" class="mt-campo__errore" role="alert" hidden></span></label>
      <label class="mt-campo" style="margin-top:16px"><span>Note per Mediocredito Facile</span>
        <textarea id="pr-note" class="mt-input" rows="3" maxlength="2000"></textarea></label>
      <div class="mt-due" style="margin-top:24px">
        <div>
          <p class="mt-semaforo__tit">Documenti da allegare</p>
          <ul class="mt-criteri" id="pr-checklist"></ul>
          <p class="mt-nota">Quelli che mancano si possono mandare dopo: la pratica parte lo stesso.</p>
        </div>
        <div>
          <p class="mt-semaforo__tit">Carica i documenti</p>
          <input type="file" id="pr-file" multiple accept=".pdf,.jpg,.jpeg,.png,.heic,.p7m,.doc,.docx,.xls,.xlsx" />
          <ul class="mt-criteri" id="pr-file-lista"></ul>
          <p class="mt-nota">PDF, foto, p7m o Office, fino a 25 MB a file.</p>
        </div>
      </div>
      <div class="mt-azioni">
        <button type="button" id="pr-invia" class="mt-btn">Invia la pratica</button>
        <button type="button" id="pr-annulla" class="mt-link">annulla</button>
      </div>
      <p id="pr-msg" class="mt-msg" hidden></p>`;

/** Documenti e IBAN: gli stessi collegamenti su ogni settore, dopo quelli del prodotto */
function collegaModulo() {
  $<HTMLInputElement>('pr-file').addEventListener('change', (ev) => {
    const el = ev.target as HTMLInputElement;
    file.push(...Array.from(el.files ?? []));
    el.value = '';
    rendiFile();
  });
  campoIban = initCampoIban($<HTMLInputElement>('pr-iban'), $('pr-iban-esito'));
  rendiChecklist();
  rendiFile();
}

/** Settore mezzi: l'etichetta di un preventivo nel menu */
function etichettaPreventivo(p: PreventivoInMenu): string {
  return [
    p.scelte.propostaId,
    p.venditore,
    `${euroEsatto(p.scelte.importo)} di beni`,
    p.creato ? data(p.creato) : 'appena scaricato',
  ].filter(Boolean).join(' · ');
}

/** Settore mezzi: prodotto, partner, durata e importo del preventivo scelto */
function campiOfferta(m: SceltePratica): string {
  return `
        <label class="mt-campo"><span>Prodotto</span>
          <select id="pr-prodotto" class="mt-input">
            ${m.noleggio ? `<option value="noleggio" ${m.prodotto === 'noleggio' ? 'selected' : ''}>Noleggio operativo</option>` : ''}
            ${m.leasing.length ? `<option value="leasing" ${m.prodotto === 'leasing' ? 'selected' : ''}>Leasing finanziario</option>` : ''}
          </select></label>
        ${m.leasing.length ? `
        <label class="mt-campo" id="pr-partner-campo"><span>Partner del leasing</span>
          <select id="pr-partner" class="mt-input">${m.leasing
            .map((c) => `<option value="${esc(c.chiave)}" ${c.chiave === m.colonna ? 'selected' : ''}>${esc(c.etichetta)}</option>`).join('')}</select></label>` : ''}
        <label class="mt-campo"><span>Durata</span><select id="pr-durata" class="mt-input"></select></label>
        <div class="mt-campo"><span>Importo, IVA esclusa</span>
          <output class="mt-pr-importo">${esc(euroEsatto(m.importo))}</output>
          <small>Il totale dei beni del preventivo: per cambiarlo rifai il preventivo.</small></div>`;
}

/** Settore mezzi: le durate seguono prodotto e partner; si ricollega a ogni cambio di preventivo */
function collegaOfferta(m: SceltePratica) {
  const prodotto = $<HTMLSelectElement>('pr-prodotto');
  const durata = $<HTMLSelectElement>('pr-durata');
  const aggiorna = () => {
    const leasing = prodotto.value === 'leasing';
    const partner = document.getElementById('pr-partner') as HTMLSelectElement | null;
    const campo = document.getElementById('pr-partner-campo');
    if (campo) campo.hidden = !leasing;
    // Le durate di quel prodotto o di quella colonna, dalla sua durata di partenza
    const scelta = leasing ? m.leasing.find((c) => c.chiave === partner?.value) : m.noleggio;
    if (!scelta) return;
    durata.innerHTML = scelta.durate.map((x) => `<option value="${x}" ${x === scelta.durata ? 'selected' : ''}>${x} mesi</option>`).join('');
    rendiChecklist();
  };
  aggiorna();
  prodotto.addEventListener('change', aggiorna);
  document.getElementById('pr-partner')?.addEventListener('change', aggiorna);
}

/** Settore mezzi: le voci del menu dei preventivi, con quella scelta */
const opzioniPreventivi = (scelto: string | null) => menuMezzi
  .map((p) => `<option value="${esc(p.scelte.propostaId)}" ${p.scelte.propostaId === scelto ? 'selected' : ''}>${esc(etichettaPreventivo(p))}</option>`)
  .join('');

/**
 * Settore mezzi: la pratica parte solo da un preventivo salvato di questo cliente, scelto
 * da un menu: per primo quello appena scaricato, poi quelli dello Storico (anche di un
 * altro giorno, o di prima di un ricaricamento). L'importo si mostra e non si scrive; il
 * prodotto offre solo quello che il preventivo aveva; col leasing compare il partner (il
 * nome, o "Soluzione A") e le durate sono quelle della sua colonna. Il server ricontrolla
 * tutto sul preventivo salvato.
 */
function rendiModuloMezzi(r: NonNullable<typeof stato.ricerca>, box: HTMLElement) {
  box.hidden = false;
  ricercaModulo = r.id;
  menuMezzi = preventiviPerPratica({ ricercaId: r.id, piva: r.scheda.piva }, stato.mezziPreventivo, preventiviStorico);
  mezziInAttesa = menuMezzi.length === 0;
  if (mezziInAttesa) {
    mezzi = null;
    box.innerHTML = '<p class="mt-vuoto">Scarica prima il preventivo nella scheda Proposte: la pratica parte da lì.</p>';
    return;
  }
  mezzi = menuMezzi[0].scelte;
  bozza = crypto.randomUUID();
  file = [];
  box.innerHTML = `
    <article class="mt-card mt-card--evidenza">
      <p class="mt-semaforo__tit">Nuova pratica per ${esc(r.scheda.ragioneSociale)}</p>
      <p class="mt-meta" style="margin-top:0">P.IVA ${esc(r.scheda.piva)}</p>
      <div class="mt-griglia" style="margin-top:16px">
        <label class="mt-campo"><span>Preventivo</span>
          <select id="pr-preventivo" class="mt-input">${opzioniPreventivi(mezzi.propostaId)}</select>
          <small>Prodotto, partner, durate e importo vengono da questo preventivo.</small></label>
        <div id="pr-offerta" style="display:contents">${campiOfferta(mezzi)}</div>
        ${campoForma(r)}
        ${CAMPI_REFERENTE}
      </div>
      ${CODA_MODULO}
    </article>`;

  collegaOfferta(mezzi);
  $<HTMLSelectElement>('pr-preventivo').addEventListener('change', (ev) => {
    const scelto = menuMezzi.find((p) => p.scelte.propostaId === (ev.target as HTMLSelectElement).value);
    if (!scelto) return;
    mezzi = scelto.scelte;
    $('pr-offerta').innerHTML = campiOfferta(mezzi);
    collegaOfferta(mezzi);
  });
  $('pr-forma').addEventListener('change', rendiChecklist);
  collegaModulo();
}

/**
 * Settore mezzi: lo Storico e' tornato. Il modulo che aspettava un preventivo si apre; il
 * menu di quello gia' aperto prende i preventivi nuovi e tiene la scelta, cosi' i campi
 * gia' scritti restano.
 */
function aggiornaMenuMezzi() {
  const r = stato.ricerca;
  const box = document.getElementById('pratica-nuova');
  if (!r || !box || box.hidden || r.id !== ricercaModulo) return;
  if (mezziInAttesa) return rendiModuloMezzi(r, box);
  const sel = document.getElementById('pr-preventivo') as HTMLSelectElement | null;
  if (!sel || !mezzi) return;
  const aperto = mezzi.propostaId;
  const nuovo = preventiviPerPratica({ ricercaId: r.id, piva: r.scheda.piva }, stato.mezziPreventivo, preventiviStorico);
  // Il preventivo scelto resta nel menu anche se lo Storico non lo riporta piu' (lista piena)
  const scelto = menuMezzi.find((p) => p.scelte.propostaId === aperto);
  menuMezzi = nuovo.some((p) => p.scelte.propostaId === aperto) || !scelto ? nuovo : [scelto, ...nuovo];
  sel.innerHTML = opzioniPreventivi(aperto);
}

/**
 * Sul settore distinta il modulo della pratica si apre anche sotto la proposta appena
 * scaricata (scheda Proposte, decisione del 22/10/2026). Si sposta l'elemento, non se ne
 * crea un altro: gli ascoltatori restano i suoi e gli id restano unici.
 */
function collocaModulo(dove: 'proposte' | 'pratiche') {
  const box = $('pratica-nuova');
  const posto = dove === 'proposte' ? document.getElementById('dz-pratica-modulo') : document.getElementById('pratica-slot');
  if (posto && box.parentElement !== posto) posto.append(box);
}

function rendiModulo(evento?: Event) {
  // Settore distinta: un caricamento per voce (o un unico ZIP), niente forma, prodotto e
  // importo, e la segnalazione a Mediocredito Facile (pratiche-distinta.ts)
  if (stato.settore === 'distinta') {
    const dettaglio = (evento as CustomEvent | undefined)?.detail;
    collocaModulo(dettaglio?.dove === 'proposte' ? 'proposte' : 'pratiche');
    return rendiModuloDistinta(Boolean(dettaglio?.segnalazione));
  }
  const r = stato.ricerca;
  const box = $('pratica-nuova');
  if (!r) {
    mezziInAttesa = false;
    box.innerHTML = `<p class="mt-vuoto">Per caricare una pratica verifica prima il cliente nella sezione ${stato.settore === 'macchine' ? 'Verifica cliente' : 'Cliente'}.</p>`;
    box.hidden = false;
    return;
  }
  if (stato.settore === 'mezzi') return rendiModuloMezzi(r, box);
  bozza = crypto.randomUUID();
  file = [];
  const e = stato.proposta?.esito;
  const prodotto = e && !e.noleggio?.length && e.leasing?.length ? 'leasing' : 'noleggio';
  const scelta = e?.bp?.durata ?? e?.macchine?.durata ?? 60;
  box.hidden = false;
  box.innerHTML = `
    <article class="mt-card mt-card--evidenza">
      <p class="mt-semaforo__tit">Nuova pratica per ${esc(r.scheda.ragioneSociale)}</p>
      <p class="mt-meta" style="margin-top:0">P.IVA ${esc(r.scheda.piva)}${stato.ultimoPreventivo ? ` · preventivo ${esc(stato.ultimoPreventivo)}` : ''}</p>
      <div class="mt-griglia" style="margin-top:16px">
        <label class="mt-campo"><span>Prodotto</span>
          <select id="pr-prodotto" class="mt-input">
            <option value="noleggio" ${prodotto === 'noleggio' ? 'selected' : ''}>Noleggio operativo</option>
            ${stato.carrozzeria?.leasing === false ? '' : `<option value="leasing" ${prodotto === 'leasing' ? 'selected' : ''}>Leasing finanziario</option>`}
          </select></label>
        <label class="mt-campo"><span>Durata</span><select id="pr-durata" class="mt-input"></select></label>
        <label class="mt-campo"><span>Importo, IVA esclusa</span>
          <input type="number" id="pr-importo" class="mt-input" min="1" step="100" value="${esc(e?.importo ?? '')}" /></label>
        ${campoForma(r)}
        ${CAMPI_REFERENTE}
      </div>
      ${CODA_MODULO}
    </article>`;

  const durata = $<HTMLSelectElement>('pr-durata');
  const aggiornaDurate = () => {
    const opz = opzioniDurata($<HTMLSelectElement>('pr-prodotto').value);
    durata.innerHTML = opz.map((m) => `<option value="${m}" ${m === scelta ? 'selected' : ''}>${m} mesi</option>`).join('');
  };
  aggiornaDurate();
  $('pr-prodotto').addEventListener('change', aggiornaDurate);
  $('pr-forma').addEventListener('change', rendiChecklist);
  $('pr-importo').addEventListener('input', rendiChecklist);
  collegaModulo();
}

/** Il campo del modulo a cui si riferisce un errore sui dati del cliente */
const CAMPO_DELL_ERRORE: Record<string, string> = {
  cellulare_mancante: 'pr-ref-tel',
  cellulare_non_valido: 'pr-ref-tel',
  email_mancante: 'pr-ref-email',
  email_non_valida: 'pr-ref-email',
  iban_mancante: 'pr-iban',
  iban_non_valido: 'pr-iban',
};

function segnalaCampo(errore: string, testo: string) {
  const id = CAMPO_DELL_ERRORE[errore];
  if (!id) return;
  const campo = $<HTMLInputElement>(id);
  campo.setAttribute('aria-invalid', 'true');
  campo.addEventListener('input', () => campo.removeAttribute('aria-invalid'), { once: true });
  if (id === 'pr-iban') {
    const esito = $('pr-iban-esito');
    esito.textContent = testo;
    esito.hidden = false;
  }
  campo.focus();
}

async function invia(btn: HTMLButtonElement) {
  const msg = $('pr-msg');
  const val = (id: string) => $<HTMLInputElement>(id).value.trim();
  // Prima i dati del cliente, poi i documenti: inutile caricare file per una pratica che il server rifiuta
  campoIban?.verifica();
  const cliente = controllaDatiCliente({ telefono: val('pr-ref-tel'), email: val('pr-ref-email'), iban: val('pr-iban') });
  if (!cliente.ok) {
    messaggio(msg, cliente.messaggio, false);
    return segnalaCampo(cliente.errore, cliente.messaggio);
  }
  messaggio(msg, '', false);
  btn.disabled = true;

  // 1. i documenti salgono dal browser allo store, nella cartella della bozza
  const documenti: { nome: string; pathname: string; size: number }[] = [];
  try {
    for (const [i, f] of file.entries()) {
      btn.textContent = `Carico il documento ${i + 1} di ${file.length}...`;
      const nome = f.name.replace(/[^\w.\- ]/g, '_');
      const r = await upload(`pratiche/${stato.slug}/bozze/${bozza}/${nome}`, f, {
        access: 'private',
        handleUploadUrl: '/api/motore/upload',
        clientPayload: JSON.stringify({ f: stato.slug, bozza }),
      });
      documenti.push({ nome: f.name, pathname: r.pathname, size: f.size });
    }
  } catch {
    btn.disabled = false;
    btn.textContent = 'Invia la pratica';
    return messaggio(msg, 'Il caricamento di un documento non è riuscito. Riprova, oppure togli il file e mandalo dopo.', false);
  }

  // 2. la pratica, con l'elenco dei documenti caricati
  btn.textContent = 'Invio la pratica...';
  // Settore mezzi: il cliente e il preventivo del modulo aperto, la colonna del leasing, nessun importo
  const m = stato.settore === 'mezzi' ? mezzi : null;
  const { res, corpo } = await apiJson('/api/motore/pratica', {
    method: 'POST',
    body: JSON.stringify(m
      ? corpoPraticaMezzi(
        {
          f: stato.slug,
          ricercaId: m.ricercaId,
          bozza,
          formaGiuridica: $<HTMLSelectElement>('pr-forma').value,
          referente: { nome: val('pr-ref-nome'), telefono: cliente.telefono, email: cliente.email },
          iban: cliente.iban,
          note: $<HTMLTextAreaElement>('pr-note').value.trim(),
          documenti,
        },
        m.propostaId,
        $<HTMLSelectElement>('pr-prodotto').value,
        Number($<HTMLSelectElement>('pr-durata').value),
        (document.getElementById('pr-partner') as HTMLSelectElement | null)?.value ?? null,
      )
      : {
        f: stato.slug,
        ricercaId: stato.ricerca?.id,
        propostaId: stato.ultimoPreventivo,
        bozza,
        prodotto: $<HTMLSelectElement>('pr-prodotto').value,
        durata: Number($<HTMLSelectElement>('pr-durata').value),
        importo: Number(val('pr-importo')),
        formaGiuridica: $<HTMLSelectElement>('pr-forma').value,
        referente: { nome: val('pr-ref-nome'), telefono: cliente.telefono, email: cliente.email },
        iban: cliente.iban,
        note: $<HTMLTextAreaElement>('pr-note').value.trim(),
        documenti,
      }),
  });
  btn.disabled = false;
  btn.textContent = 'Invia la pratica';
  if (!res.ok || !corpo?.ok) {
    messaggio(msg, corpo?.messaggio || traduci(corpo?.error ?? ''), false);
    return segnalaCampo(corpo?.error ?? '', corpo?.messaggio ?? '');
  }
  $('pratica-nuova').innerHTML = `<p class="mt-msg mt-msg--ok">Pratica ${esc(corpo.id)} inviata${documenti.length ? ` con ${documenti.length === 1 ? 'un documento' : `${documenti.length} documenti`}` : ''}. Lo stato lo segui qui sotto.</p>`;
  void caricaStorico();
}

function esitoNegativita(n: any): string {
  if (!n) return '<span class="mt-id">—</span>';
  if (n.pronto) {
    const d = n.dati ?? {};
    const voci = [d.presenzaProtesti && 'protesti', d.presenzaPregiudizievoli && 'pregiudizievoli', d.presenzaProcedure && 'procedure'].filter(Boolean);
    return voci.length ? `<strong>Presenti: ${voci.join(', ')}</strong>` : 'Nessun evento';
  }
  if (n.id) return '<span class="mt-id">in corso</span>';
  return `<span class="mt-id">non avviata${n.saltata === 'tetto' ? ' (budget del mese finito)' : ''}</span>`;
}

function rendiElenco() {
  const admin = stato.ruolo === 'admin';
  const el = $('pratiche-elenco');
  if (!pratiche.length) {
    el.innerHTML = '<p class="mt-vuoto">Nessuna pratica caricata dal portale.</p>';
    return;
  }
  const opzioniStato = (corrente: string) =>
    statiAdmin.map(([v, l]) => `<option value="${esc(v)}" ${v === corrente ? 'selected' : ''}>${esc(l)}</option>`).join('');
  el.innerHTML = `
    ${admin ? `
      <div class="mt-azioni" style="margin:0 0 12px">
        <span class="mt-nota" id="sel-conta">Nessuna selezionata</span>
        <select id="sel-stato" class="mt-input" style="width:auto">${opzioniStato('in-lavorazione')}</select>
        <button type="button" id="sel-sposta" class="mt-btn mt-btn--secondario">Sposta le selezionate</button>
      </div>` : ''}
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr>
        ${admin ? '<th><input type="checkbox" id="sel-tutte" aria-label="Seleziona tutte" /></th>' : ''}
        <th>Pratica</th>${stato.vedeTutto ? '<th>Agente</th>' : ''}<th>Cliente</th><th>Offerta</th><th class="num">Importo</th>
        <th>Stato</th><th>Documenti</th>${admin ? '<th>Eventi negativi</th>' : ''}
      </tr></thead>
      <tbody>${pratiche.map((p) => `<tr>
        ${admin ? `<td><input type="checkbox" class="sel-pratica" value="${esc(p.id)}" aria-label="Seleziona ${esc(p.id)}" /></td>` : ''}
        <td>${data(p.creato)}<br><span class="mt-id">${esc(p.id)}</span></td>
        ${stato.vedeTutto ? `<td>${esc(p.agente_nome)}</td>` : ''}
        <td>${esc(p.cliente_nome)}<br><span class="mt-id">P.IVA ${esc(p.piva)}</span></td>
        <td>${p.prodotto === 'leasing' ? 'Leasing' : 'Noleggio'}${p.durata ? `, ${esc(p.durata)} mesi` : ''}</td>
        <td class="num">${euro(p.importo)}</td>
        <td>${admin
          ? `<select class="mt-input stato-riga" data-pratica="${esc(p.id)}" style="width:auto">${opzioniStato(p.stato)}</select>`
          : `<strong>${ETICHETTA[p.stato] ?? esc(p.stato)}</strong>`}
          <br><span class="mt-id">aggiornata ${data(p.aggiornato)}</span></td>
        <td>${(p.documenti ?? []).length ? p.documenti.map((d: any) => bottoneDoc(d)).join('<br>') : '<span class="mt-id">nessuno</span>'}</td>
        ${admin ? `<td data-neg="${esc(p.id)}">${esitoNegativita(p.negativita)}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;

  // Per MCF: gli esiti in corso si chiedono uno per uno, senza bloccare la pagina
  if (admin) {
    for (const p of pratiche.filter((x) => x.negativita?.id && !x.negativita?.pronto)) {
      void apiJson(`/api/motore/negativita?${new URLSearchParams({ f: stato.slug, id: p.id })}`).then(({ corpo }) => {
        const cella = document.querySelector(`[data-neg="${CSS.escape(p.id)}"]`);
        if (corpo?.ok && cella) cella.innerHTML = esitoNegativita(corpo.negativita);
      });
    }
  }
}

// La tabella ha solo il giorno: niente ora, che sarebbe inventata
const giorno = (iso: string) => (iso ?? '').split('-').reverse().join('/');
const maiuscola = (t: string | null) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : '—');

function rendiEsterne() {
  const el = $('pratiche-esterne');
  if (!esterne.length) {
    el.innerHTML = '';
    return;
  }
  const admin = stato.ruolo === 'admin';
  el.innerHTML = `
    <h3 class="mt-h3">Pratiche lavorate prima del portale</h3>
    <p class="mt-nota">Inviate a MCF prima che il portale esistesse, con l'esito registrato. Sono storico: niente documenti e niente stato da spostare.</p>
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Data</th><th>Cliente</th><th class="num">Importo</th><th>Esito</th>${admin ? '<th>Canale</th>' : ''}</tr></thead>
      <tbody>${esterne.map((p) => `<tr>
        <td>${esc(giorno(p.data))}</td>
        <td>${esc(p.ragione_sociale ?? '—')}<br><span class="mt-id">P.IVA ${esc(p.piva)}</span></td>
        <td class="num">${euro(p.importo)}</td>
        <td>${esc(maiuscola(p.esito))}</td>
        ${admin ? `<td>${esc(p.canale ?? 'non indicato')}</td>` : ''}
      </tr>`).join('')}</tbody>
    </table></div>`;
}

async function sposta(ids: string[], nuovo: string) {
  const { res, corpo } = await apiJson('/api/motore/stato', {
    method: 'POST',
    body: JSON.stringify({ f: stato.slug, ids, stato: nuovo }),
  });
  if (!res.ok || !corpo?.ok) alert(traduci(corpo?.error ?? ''));
  void caricaStorico();
}

export function montaPratiche() {
  $('pratiche').innerHTML = `
    <div class="mt-azioni" style="margin-top:0">
      <button type="button" id="pratica-apri" class="mt-btn mt-btn--secondario">${stato.settore === 'distinta' ? 'Crea pratica' : 'Nuova pratica'}</button>
    </div>
    <div id="pratica-slot"><div id="pratica-nuova" hidden></div></div>
    <h3 class="mt-h3">Le pratiche</h3>
    <div id="pratiche-elenco"><p class="mt-vuoto">Nessuna pratica caricata dal portale.</p></div>
    <div id="pratiche-esterne"></div>`;

  suStorico((d: DatiStorico) => {
    pratiche = d.pratiche;
    esterne = d.esterne;
    statiAdmin = d.stati ?? [];
    rendiElenco();
    rendiEsterne();
    if (stato.settore === 'mezzi') {
      preventiviStorico = d.proposte;
      aggiornaMenuMezzi();
    }
  });
  if (stato.settore === 'distinta') montaPraticheDistinta();
  document.addEventListener('mt:nuova-pratica', rendiModulo);
  // Cliente nuovo: il modulo aperto sotto la proposta torna al suo posto, chiuso
  if (stato.settore === 'distinta') {
    document.addEventListener('mt:ricerca', () => {
      collocaModulo('pratiche');
      $('pratica-nuova').hidden = true;
    });
  }
  document.addEventListener('mt:tab', (e) => { if ((e as CustomEvent).detail === 'pratiche') void caricaStorico(); });

  document.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'pratica-apri') rendiModulo();
    if (t.id === 'pr-annulla') $('pratica-nuova').hidden = true;
    if (t.id === 'pr-invia') void invia(t as HTMLButtonElement);
    const togli = t.closest('[data-togli]') as HTMLElement | null;
    if (togli) { file.splice(Number(togli.dataset.togli), 1); rendiFile(); }
    if (t.id === 'sel-sposta') {
      const ids = [...document.querySelectorAll<HTMLInputElement>('.sel-pratica:checked')].map((c) => c.value);
      if (!ids.length) return alert(traduci('nessuna_pratica'));
      void sposta(ids, $<HTMLSelectElement>('sel-stato').value);
    }
  });
  document.addEventListener('change', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'sel-tutte') {
      const on = (t as HTMLInputElement).checked;
      document.querySelectorAll<HTMLInputElement>('.sel-pratica').forEach((c) => { c.checked = on; });
    }
    if (t.id === 'sel-tutte' || t.classList.contains('sel-pratica')) {
      const n = document.querySelectorAll('.sel-pratica:checked').length;
      const conta = document.getElementById('sel-conta');
      if (conta) conta.textContent = n ? `${n} selezionat${n === 1 ? 'a' : 'e'}` : 'Nessuna selezionata';
    }
    if (t.classList.contains('stato-riga')) {
      void sposta([(t as HTMLSelectElement).dataset.pratica!], (t as HTMLSelectElement).value);
    }
  });
}
