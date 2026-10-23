// Pannello MCF: spesa del mese, configurazione della carrozzeria, catalogo.
// Lo vede solo l'admin MCF; le API lo ricontrollano comunque.
//
// L'import del catalogo legge le righe copiate da Excel: prima riga con le
// intestazioni, separatore tabulazione, punto e virgola o virgola. Le colonne
// riconosciute stanno in src/lib/motore/catalogo-import.ts.
//
// Sul settore distinta (Led Office) in piu': canali di quotazione, societa'
// fornitrice, categorie, checklist della pratica, clienti segnalati, pratiche
// esterne, storico prezzi del catalogo e, per le ultime proposte e pratiche,
// canale, maggiorazione e proposta per il locatore. I nomi dei canali arrivano
// dall'API admin e non stanno in questo codice; questo pezzo lo scarica solo
// l'admin (portale.ts).
//
// Sul settore mezzi (Bergamelli) la sezione "Venditori, categorie e leasing" con la
// configurazione in un campo di testo JSON, e i canali con le condizioni sul bene
// (venditori, categorie escluse, mezzi targati): si vedono, non si cambiano da qui, e il
// salvataggio dei canali le conserva. I pezzi puri stanno in admin-mezzi.ts.

import { $, api, apiJson, esc, euro, euroEsatto, messaggio, num, stato, traduci } from './comune';
import { aggiornaCatalogo } from './proposte';
import { leggiIncollato, numero } from '../../lib/motore/catalogo-import';
import { etichettaMese } from '../../lib/motore/richieste';
import { canaleConservato, condizioniSulBene, configDaTesto, configInTesto, notaConfigurazione } from './admin-mezzi';

let dati: any = null;

const opzioni = (lista: { valore: string; etichetta: string }[] | undefined, scelto: string) =>
  (lista ?? []).map((o) => `<option value="${esc(o.valore)}" ${o.valore === scelto ? 'selected' : ''}>${esc(o.etichetta)}</option>`).join('');

// --- settore distinta: aiuti ------------------------------------------------------

/** Il nome di un canale, dall'API: qui il codice non ne contiene */
const nomeCanale = (id: string | null | undefined) =>
  (dati?.opzioni?.canali ?? []).find((o: any) => o.valore === id)?.etichetta ?? id ?? '—';
const nomeCanaleEsterno = (id: string | null | undefined) =>
  id ? (dati?.opzioni?.canaliEsterni ?? []).find((o: any) => o.valore === id)?.etichetta ?? id : '—';

/** Un numero da rimettere in un campo di testo: 5.000.000, 2,5 */
const comeTesto = (v: unknown) => {
  if (v === null || v === undefined || v === '') return '';
  const n = Number(v);
  if (!Number.isFinite(n)) return String(v);
  return Number.isInteger(n) ? n.toLocaleString('it-IT', { useGrouping: 'always' } as Intl.NumberFormatOptions) : String(n).replace('.', ',');
};

/**
 * Un campo numerico: vuoto = assente; letto = numero; illeggibile = il testo com'e',
 * cosi' il server lo rifiuta con un messaggio invece di perderlo in silenzio.
 */
function campoNumero(el: HTMLInputElement | null): number | string | undefined {
  const t = (el?.value ?? '').trim();
  if (!t) return undefined;
  const n = numero(t);
  return Number.isFinite(n) ? n : t;
}

const elenco = (t: string) => t.split(/[,;\s]+/).map((x) => x.trim()).filter(Boolean);
/** Prefissi ATECO: "62.01" e' 6201; il resto lo giudica il server */
const prefissi = (t: string) => elenco(t).map((x) => x.replace(/\./g, ''));
const data = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('it-IT') : '—');
const giorno = (aaaammgg: string | null | undefined) => (aaaammgg ? aaaammgg.split('-').reverse().join('/') : '—');

/** Il messaggio di un rifiuto: quello del server se c'e', altrimenti la traduzione */
const ERRORI_PANNELLO: Record<string, string> = {
  solo_distinta: 'Questa parte del pannello vale solo sul settore distinta (i canali anche sui mezzi).',
  solo_mezzi: 'Questa parte del pannello vale solo sul settore mezzi.',
  segnalazione_non_trovata: 'Questa partita IVA non è più fra i clienti segnalati.',
  categoria_non_valida: 'La categoria della voce non è fra quelle del pannello.',
};
const errore = (corpo: any) => corpo?.messaggio ?? ERRORI_PANNELLO[corpo?.error] ?? traduci(corpo?.error ?? '');

const CONDIZIONI = [
  { k: 'fatturatoMin', et: 'Fatturato oltre, euro', tipo: 'numero' },
  { k: 'importoMin', et: 'Beni da, euro', tipo: 'numero' },
  { k: 'anniMin', et: 'Anni di attività, almeno', tipo: 'numero' },
  { k: 'sogliaProvvisorio', et: 'Bilancio provvisorio sopra, euro', tipo: 'numero' },
  { k: 'formeEscluse', et: 'Forme giuridiche escluse (codici, es. RS)', tipo: 'elenco' },
  { k: 'settoriEsclusi', et: 'Settori esclusi (prefissi ATECO)', tipo: 'ateco' },
] as const;

/** Le condizioni sul bene di un canale (mezzi), in sola lettura. Senza condizioni non scrive niente */
function righeSulBene(c: any): string {
  const righe = condizioniSulBene(c);
  return righe.length
    ? `<p class="mt-nota" style="margin:12px 0 0">Condizioni sul bene, non si cambiano da qui:<br>${righe.map(esc).join('<br>')}</p>`
    : '';
}

function sezioneCanali(): string {
  const canali: any[] = dati.canali ?? [];
  const avvisi = dati.avvisiCanale ?? {};
  if (!canali.length) return '<p class="mt-nota">Nessun canale configurato: il portale non propone niente.</p>';
  return `${canali.map((c, i) => `
    <article class="mt-card" data-canale="${i}">
      <p class="mt-semaforo__tit">${i + 1}. ${esc(nomeCanale(c.canale))} <span class="mt-id">listino ${esc(c.tabella)}</span></p>
      <label class="mt-toggle"><input type="checkbox" data-k="attivo" ${c.attivo ? 'checked' : ''} /> Acceso</label>
      ${avvisi[c.canale] ? `<p class="mt-msg mt-msg--errore" style="margin:8px 0 0">${esc(avvisi[c.canale])}</p>` : ''}
      <div class="mt-griglia" style="margin-top:12px">
        <label class="mt-campo"><span>Maggiorazione sui beni, %</span><input data-k="maggiorazionePerc" class="mt-input" inputmode="decimal" value="${esc(comeTesto(c.maggiorazionePerc))}" /></label>
        ${CONDIZIONI.map((x) => `<label class="mt-campo"><span>${esc(x.et)}</span><input data-k="${x.k}" class="mt-input" ${x.tipo === 'numero' ? 'inputmode="decimal"' : ''}
          value="${esc(x.tipo === 'numero' ? comeTesto(c[x.k]) : (c[x.k] ?? []).join(', '))}" placeholder="vuoto: nessuna condizione" /></label>`).join('')}
      </div>
      <label class="mt-toggle" style="margin-top:12px"><input type="checkbox" data-k="soloCapitali" ${c.soloCapitali ? 'checked' : ''} /> Solo società di capitali</label>
      ${righeSulBene(c)}
    </article>`).join('')}
    <p class="mt-nota">L'ordine è la priorità: il motore prende il primo canale acceso che regge cliente e importo. Una condizione vuota non si applica.${canali.some((c) => condizioniSulBene(c).length) ? ' Le condizioni sul bene non si cambiano da qui: il salvataggio dei canali le lascia come sono.' : ''}</p>
    <div class="mt-azioni"><button type="button" id="cn-salva" class="mt-btn">Salva i canali</button></div>
    <p id="cn-msg" class="mt-msg" hidden></p>`;
}

/** I campi di un canale che il pannello sa modificare: tutto il resto del canale salvato si conserva */
const CHIAVI_CANALE_DEL_PANNELLO = ['attivo', 'maggiorazionePerc', 'soloCapitali', ...CONDIZIONI.map((x) => x.k)];

/**
 * I canali letti dal pannello: canale e listino restano quelli salvati, e con loro le
 * condizioni sul bene dei mezzi (venditori, categorie escluse, mezzi targati) che il
 * pannello mostra ma non modifica: senza questa cura ogni salvataggio le cancellerebbe.
 */
function canaliDalPannello(): any[] {
  return (dati.canali ?? []).map((orig: any, i: number) => {
    const box = document.querySelector<HTMLElement>(`[data-canale="${i}"]`)!;
    const campo = (k: string) => box.querySelector<HTMLInputElement>(`[data-k="${k}"]`);
    const c: Record<string, unknown> = {
      canale: orig.canale, tabella: orig.tabella, attivo: campo('attivo')!.checked,
      maggiorazionePerc: campoNumero(campo('maggiorazionePerc')) ?? '',
    };
    for (const x of CONDIZIONI) {
      const t = campo(x.k)!.value;
      const v = x.tipo === 'numero' ? campoNumero(campo(x.k)) : x.tipo === 'ateco' ? prefissi(t) : elenco(t).map((f) => f.toUpperCase());
      if (v !== undefined && !(Array.isArray(v) && v.length === 0)) c[x.k] = v;
    }
    if (campo('soloCapitali')!.checked) c.soloCapitali = true;
    return canaleConservato(orig, CHIAVI_CANALE_DEL_PANNELLO, c);
  });
}

// --- settore mezzi ----------------------------------------------------------------

function sezioneMezzi(): string {
  return `
    <p class="mt-nota" style="margin-top:0">I venditori che firmano le offerte, le categorie con la domanda sul targato, l'anticipo e gli spread del leasing (un partner con "soloUsato": true compare solo se un bene è usato), e se mostrare i nomi dei partner a schermo. Ci sono partite IVA e spread: la vede solo MCF. È un testo JSON che si salva com'è o non si salva: un campo non previsto o un valore che non si legge fa rifiutare il salvataggio, e il messaggio dice quale.</p>
    <textarea id="mz-config" class="mt-input" rows="28" spellcheck="false" style="font-family:ui-monospace,Menlo,monospace;font-size:13px;white-space:pre;overflow:auto">${esc(configInTesto(dati.mezzi))}</textarea>
    ${dati.mezzi ? '' : '<p class="mt-nota">Nessuna configurazione salvata, oppure quella salvata non si legge: il portale dei mezzi non parte finché non ne salvi una valida.</p>'}
    <div class="mt-azioni"><button type="button" id="mz-salva" class="mt-btn">Salva</button></div>
    <p id="mz-msg" class="mt-msg" hidden></p>`;
}

function sezioniMezzi(): string {
  return `
    <h3 class="mt-h3">Venditori, categorie e leasing</h3>${sezioneMezzi()}
    <h3 class="mt-h3">Canali di quotazione</h3>${sezioneCanali()}`;
}

const CAMPI_SOCIETA = [
  ['ragioneSociale', 'Ragione sociale'], ['piva', 'Partita IVA'], ['rea', 'REA'], ['indirizzo', 'Indirizzo'],
  ['telefono', 'Telefono'], ['email', 'Email'], ['pec', 'PEC'],
] as const;

function sezioneSocieta(): string {
  const s = dati.societaFornitrice ?? {};
  return `
    <p class="mt-nota" style="margin-top:0">La società che firma la proposta di vendita e le condizioni verso il cliente.</p>
    <div class="mt-griglia">
      ${CAMPI_SOCIETA.map(([k, et]) => `<label class="mt-campo"><span>${et}</span><input id="so-${k}" class="mt-input" value="${esc(s[k] ?? '')}" /></label>`).join('')}
    </div>
    <p class="mt-nota">Logo: ${s.logo ? esc(s.logo) : 'nessuno'}. Il logo non si cambia da qui.</p>
    <div class="mt-azioni"><button type="button" id="so-salva" class="mt-btn">Salva la società</button></div>
    <p id="so-msg" class="mt-msg" hidden></p>`;
}

const rigaCategoria = (c: any, i: number) => `
  <tr data-categoria="${i}">
    <td><input data-k="nome" class="mt-input" value="${esc(c.nome ?? '')}" /></td>
    <td><input data-k="settoriTipici" class="mt-input" value="${esc((c.settoriTipici ?? []).join(', '))}" placeholder="vuoto: tutti" /></td>
    <td><input type="checkbox" data-k="postazione" ${c.postazione ? 'checked' : ''} aria-label="Postazione di lavoro" /></td>
    <td><input type="checkbox" data-k="ledwall" ${c.ledwall ? 'checked' : ''} aria-label="LEDwall" /></td>
    <td><button type="button" class="mt-link" data-togli-categoria="${i}">Togli</button></td>
  </tr>`;

function sezioneCategorie(): string {
  return `
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Nome</th><th>Settori tipici (prefissi ATECO)</th><th>Postazione</th><th>LEDwall</th><th></th></tr></thead>
      <tbody id="ca-righe">${(dati.categorie ?? []).map(rigaCategoria).join('')}</tbody></table></div>
    <p class="mt-nota">Settori tipici vuoti: la categoria è tipica per ogni settore. Postazione: le righe contano come postazioni di lavoro. LEDwall: serve la conferma dell'installazione fissa.</p>
    <div class="mt-azioni">
      <button type="button" id="ca-aggiungi" class="mt-btn mt-btn--secondario">Aggiungi una categoria</button>
      <button type="button" id="ca-salva" class="mt-btn">Salva le categorie</button>
    </div>
    <p id="ca-msg" class="mt-msg" hidden></p>`;
}

function categorieDalPannello(): any[] {
  return [...document.querySelectorAll<HTMLElement>('[data-categoria]')].map((r) => {
    const campo = (k: string) => r.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!;
    return {
      nome: campo('nome').value.trim(), settoriTipici: prefissi(campo('settoriTipici').value),
      postazione: campo('postazione').checked, ledwall: campo('ledwall').checked,
    };
  });
}

const FORME = [['capitali', 'Capitali'], ['persone', 'Persone'], ['individuale', 'Individuale']] as const;

const rigaChecklist = (v: any, i: number) => `
  <tr data-ck="${i}">
    <td><input data-k="nome" class="mt-input" value="${esc(v.nome ?? '')}" /></td>
    <td><input type="checkbox" data-k="obbligatoria" ${v.obbligatoria ? 'checked' : ''} aria-label="Obbligatoria" /></td>
    <td><input data-k="sopraImporto" class="mt-input mt-input--p" inputmode="decimal" value="${esc(comeTesto(v.sopraImporto))}" placeholder="sempre" /></td>
    <td>${FORME.map(([f, et]) => `<label class="mt-toggle" style="margin-right:8px"><input type="checkbox" data-forma="${f}" ${v.forme?.includes(f) ? 'checked' : ''} /> ${et}</label>`).join('')}</td>
    <td><button type="button" class="mt-link" data-togli-ck="${i}">Togli</button></td>
  </tr>`;

function sezioneChecklist(): string {
  const ck = dati.checklist ?? { voci: [], formati: ['pdf', 'jpg'] };
  return `
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Documento</th><th>Obbligatorio</th><th>Solo sopra, euro</th><th>Solo per le forme</th><th></th></tr></thead>
      <tbody id="ck-righe">${ck.voci.map(rigaChecklist).join('')}</tbody></table></div>
    <p class="mt-nota">Nessuna forma spuntata: il documento si chiede a tutti. Un importo: si chiede solo sopra quell'importo dei beni.</p>
    <div class="mt-toggle-riga">Formati ammessi:
      <label class="mt-toggle"><input type="checkbox" id="ck-pdf" ${ck.formati.includes('pdf') ? 'checked' : ''} /> PDF</label>
      <label class="mt-toggle"><input type="checkbox" id="ck-jpg" ${ck.formati.includes('jpg') ? 'checked' : ''} /> JPG</label>
    </div>
    <div class="mt-azioni">
      <button type="button" id="ck-aggiungi" class="mt-btn mt-btn--secondario">Aggiungi un documento</button>
      <button type="button" id="ck-salva" class="mt-btn">Salva la checklist</button>
    </div>
    <p id="ck-msg" class="mt-msg" hidden></p>`;
}

function checklistDalPannello() {
  const voci = [...document.querySelectorAll<HTMLElement>('[data-ck]')].map((r) => {
    const campo = (k: string) => r.querySelector<HTMLInputElement>(`[data-k="${k}"]`)!;
    const voce: Record<string, unknown> = { nome: campo('nome').value.trim(), obbligatoria: campo('obbligatoria').checked };
    const sopra = campoNumero(campo('sopraImporto'));
    if (sopra !== undefined) voce.sopraImporto = sopra;
    const forme = [...r.querySelectorAll<HTMLInputElement>('[data-forma]')].filter((x) => x.checked).map((x) => x.dataset.forma);
    if (forme.length) voce.forme = forme;
    return voce;
  });
  const formati = [$<HTMLInputElement>('ck-pdf').checked ? 'pdf' : '', $<HTMLInputElement>('ck-jpg').checked ? 'jpg' : ''].filter(Boolean);
  return { voci, formati };
}

const MOTIVI = [['insoluto', 'Insoluto'], ['sofferenze', 'Sofferenze'], ['altro', 'Altro']] as const;
const EFFETTI = [['blocco', 'Blocco'], ['rosso', 'Rosso']] as const;
const scelte = (lista: readonly (readonly [string, string])[], scelto: string) =>
  lista.map(([v, et]) => `<option value="${v}" ${v === scelto ? 'selected' : ''}>${et}</option>`).join('');

function sezioneSegnalati(): string {
  const righe: any[] = dati.segnalati ?? [];
  return `
    <p class="mt-nota" style="margin-top:0">Elenco di MCF, vale per tutti i fornitori col prefiltro. Blocco: il cliente non è lavorabile dal portale. Rosso: il prefiltro esce rosso. Il commerciale vede solo il risultato, mai il motivo né la nota.</p>
    ${righe.length ? `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Partita IVA</th><th>Ragione sociale</th><th>Motivo</th><th>Effetto</th><th>Nota</th><th>Da</th><th></th></tr></thead>
      <tbody>${righe.map((s) => `<tr>
        <td>${esc(s.piva)}</td><td>${esc(s.ragioneSociale ?? '—')}</td><td>${esc(s.motivo)}</td>
        <td><select class="mt-input" style="min-width:110px" data-sg-effetto="${esc(s.piva)}">${scelte(EFFETTI, s.effetto)}</select></td>
        <td>${esc(s.nota ?? '')}</td><td class="mt-id">${esc(s.daUtente ?? '')}<br>${esc(data(s.creato))}</td>
        <td><button type="button" class="mt-link" data-sg-togli="${esc(s.piva)}">Togli</button></td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="mt-nota">Nessun cliente segnalato.</p>'}
    <div class="mt-griglia" style="margin-top:16px">
      <label class="mt-campo"><span>Partita IVA</span><input id="sg-piva" class="mt-input" inputmode="numeric" /></label>
      <label class="mt-campo"><span>Ragione sociale</span><input id="sg-rs" class="mt-input" /></label>
      <label class="mt-campo"><span>Motivo</span><select id="sg-motivo" class="mt-input">${scelte(MOTIVI, 'insoluto')}</select></label>
      <label class="mt-campo"><span>Effetto</span><select id="sg-effetto" class="mt-input">${scelte(EFFETTI, 'blocco')}</select></label>
    </div>
    <label class="mt-campo" style="margin-top:12px"><span>Nota (la vede solo MCF)</span><input id="sg-nota" class="mt-input" /></label>
    <div class="mt-azioni"><button type="button" id="sg-aggiungi" class="mt-btn">Segnala il cliente</button></div>
    <p id="sg-msg" class="mt-msg" hidden></p>`;
}

function sezionePraticheEsterne(): string {
  const righe: any[] = dati.praticheEsterne ?? [];
  const oggi = new Date().toLocaleDateString('en-CA');
  return `
    <p class="mt-nota" style="margin-top:0">Pratiche che MCF ha lavorato fuori dal portale: contano per la regola della pratica recente. Da qui si aggiungono e basta.</p>
    ${righe.length ? `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Data</th><th>Partita IVA</th><th>Ragione sociale</th><th>Canale</th><th>Esito</th><th class="num">Importo</th><th>Fonte</th></tr></thead>
      <tbody>${righe.map((p) => `<tr>
        <td>${esc(giorno(p.data))}</td><td>${esc(p.piva)}</td><td>${esc(p.ragioneSociale ?? '—')}</td><td>${esc(nomeCanaleEsterno(p.canale))}</td>
        <td>${esc(p.esito ?? '—')}</td><td class="num">${p.importo != null ? euroEsatto(p.importo) : '—'}</td><td class="mt-id">${esc(p.fonte ?? '')}</td>
      </tr>`).join('')}</tbody></table></div>` : '<p class="mt-nota">Nessuna pratica esterna.</p>'}
    <div class="mt-griglia" style="margin-top:16px">
      <label class="mt-campo"><span>Partita IVA</span><input id="pe-piva" class="mt-input" inputmode="numeric" /></label>
      <label class="mt-campo"><span>Ragione sociale</span><input id="pe-rs" class="mt-input" /></label>
      <label class="mt-campo"><span>Data</span><input id="pe-data" type="date" max="${esc(oggi)}" class="mt-input" /></label>
      <label class="mt-campo"><span>Canale</span><select id="pe-canale" class="mt-input"><option value="">Nessuno</option>${opzioni(dati.opzioni?.canaliEsterni, '')}</select></label>
      <label class="mt-campo"><span>Esito</span><input id="pe-esito" class="mt-input" placeholder="es. approvata" /></label>
      <label class="mt-campo"><span>Importo, euro</span><input id="pe-importo" class="mt-input" inputmode="decimal" /></label>
    </div>
    <div class="mt-azioni"><button type="button" id="pe-aggiungi" class="mt-btn">Aggiungi la pratica</button></div>
    <p id="pe-msg" class="mt-msg" hidden></p>`;
}

/** Canale, beni, maggiorazione, imponibile e proposta per il locatore: la vista di MCF */
function colonneRiservate(canale: string | null, r: any, segnalazione = false): string {
  const doc = (r?.documenti ?? []).find((d: any) => d?.pathname);
  const testoCanale = segnalazione
    ? `Segnalazione${r?.canaleProposta || r?.canale ? `, la proposta era su ${nomeCanale(r.canaleProposta ?? r.canale)}` : ''}`
    : nomeCanale(canale ?? r?.canale);
  return `<td>${esc(testoCanale)}</td>
    <td class="num">${r ? euroEsatto(r.beni) : '—'}</td>
    <td class="num">${r ? (r.maggiorazione > 0 ? euro(r.maggiorazione) : 'nessuna') : '—'}</td>
    <td class="num">${r ? euroEsatto(r.imponibile) : '—'}</td>
    <td>${doc ? `<a class="mt-link" href="${esc(api('doc', { path: doc.pathname }))}" target="_blank" rel="noopener">Proposta per il locatore</a>` : '—'}</td>`;
}

function sezioneUltime(): string {
  const proposte: any[] = dati.proposte ?? [];
  const pratiche: any[] = dati.pratiche ?? [];
  const testa = '<th>Canale</th><th class="num">Beni</th><th class="num">Maggiorazione</th><th class="num">Imponibile</th><th>Per il locatore</th>';
  return `
    <h3 class="mt-h3">Ultime proposte</h3>
    ${proposte.length ? `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Data</th><th>Proposta</th><th>Cliente</th>${testa}</tr></thead>
      <tbody>${proposte.map((p) => `<tr>
        <td>${esc(data(p.creato))}</td><td class="mt-id">${esc(p.id)}</td><td>${esc(p.cliente)}<br><span class="mt-id">${esc(p.piva)}</span></td>
        ${colonneRiservate(p.canale, p.riservato)}
      </tr>`).join('')}</tbody></table></div>` : '<p class="mt-nota">Nessuna proposta.</p>'}
    <h3 class="mt-h3">Ultime pratiche</h3>
    ${pratiche.length ? `<div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Data</th><th>Pratica</th><th>Cliente</th><th>Stato</th>${testa}</tr></thead>
      <tbody>${pratiche.map((p) => `<tr>
        <td>${esc(data(p.creato))}</td><td class="mt-id">${esc(p.id)}</td><td>${esc(p.cliente)}<br><span class="mt-id">${esc(p.piva)}</span></td>
        <td>${esc(p.stato)}</td>${colonneRiservate(p.canale, p.riservato, p.segnalazione)}
      </tr>`).join('')}</tbody></table></div>` : '<p class="mt-nota">Nessuna pratica.</p>'}`;
}

/** Lo storico di una voce: ultima riga in chiaro, le altre a richiesta */
function storicoVoce(codice: string): string {
  const righe: any[] = dati.storico?.[codice] ?? [];
  if (!righe.length) return '<span class="mt-id">nessuno</span>';
  const riga = (s: any) => `${euroEsatto(s.prezzo)}, valido fino ${esc(giorno(s.validoFino))}, ${esc(data(s.registrato))}${s.daUtente ? ` (${esc(s.daUtente)})` : ''}`;
  return righe.length === 1
    ? `<span class="mt-id">${riga(righe[0])}</span>`
    : `<details><summary>${righe.length} righe</summary><ul class="mt-righe">${righe.map((s) => `<li>${riga(s)}</li>`).join('')}</ul></details>`;
}

function sezioniDistinta(): string {
  return `
    <h3 class="mt-h3">Canali di quotazione</h3>${sezioneCanali()}
    <h3 class="mt-h3">Società fornitrice</h3>${sezioneSocieta()}
    <h3 class="mt-h3">Categorie</h3>${sezioneCategorie()}
    <h3 class="mt-h3">Checklist della pratica</h3>${sezioneChecklist()}
    <h3 class="mt-h3">Clienti segnalati</h3>${sezioneSegnalati()}
    <h3 class="mt-h3">Pratiche esterne</h3>${sezionePraticheEsterne()}
    ${sezioneUltime()}`;
}

function rendi() {
  const c = dati.config;
  const s = dati.spesa;
  const r = dati.richieste;
  const quante = (n: number) => `${num(n)} ${n === 1 ? 'richiesta' : 'richieste'}`;
  const conto = (x: any) => r.prezzo != null
    ? `${quante(x.richieste)} a ${euro(r.prezzo, 2)}: <strong>${euro(x.importo, 2)}</strong>`
    : quante(x.richieste);
  const fv = c.settore === 'fotovoltaico';
  const mc = c.settore === 'macchine';
  const ds = c.settore === 'distinta';
  const mz = c.settore === 'mezzi';
  $('mcf').innerHTML = `
    <article class="mt-card">
      <p class="mt-semaforo__tit">Ricerche del mese</p>
      <p class="mt-lead" style="margin:0">${euro(s.euro, 2)} su un tetto di ${euro(c.tettoMeseEuro)}, ${num(s.chiamate)} chiamate a Openapi (${esc(s.mese)}).
        Le schede già in cache non costano e non contano.</p>
    </article>
    ${r ? `<article class="mt-card">
      <p class="mt-semaforo__tit">Richieste da addebitare a ${esc(stato.carrozzeria?.nome ?? 'questo fornitore')}</p>
      <p class="mt-lead" style="margin:0">
        ${esc(etichettaMese(r.corrente.mese))}: ${conto(r.corrente)}${r.corrente.margine != null ? `, margine sulla spesa Openapi ${euro(r.corrente.margine, 2)}` : ''}.<br>
        ${esc(etichettaMese(r.precedente.mese))}: ${conto(r.precedente)}.
        ${r.prezzo == null ? '<br>Prezzo per richiesta non impostato: si imposta qui sotto, nella configurazione.' : ''}</p>
      <p class="mt-nota" style="margin:8px 0 0">Un cliente al mese: la stessa partita IVA verificata di nuovo nello stesso mese non conta. Il referente vede lo stesso conteggio nello Storico, senza importi.</p>
    </article>` : ''}

    <h3 class="mt-h3">Configurazione</h3>
    <div class="mt-griglia">
      <label class="mt-campo"><span>Settore</span><select id="cf-settore" class="mt-input">
        <option value="fotovoltaico" ${fv ? 'selected' : ''}>Fotovoltaico, con business plan</option>
        <option value="macchine" ${mc ? 'selected' : ''}>Macchine, con accessori e consegna</option>
        <option value="distinta" ${ds ? 'selected' : ''}>Distinta di beni, con prefiltro e canali</option>
        <option value="mezzi" ${mz ? 'selected' : ''}>Mezzi da cantiere, più venditori</option>
        <option value="generico" ${!fv && !mc && !ds && !mz ? 'selected' : ''}>Generico</option></select></label>
      <label class="mt-campo"><span>Etichetta del bene</span><input id="cf-etichetta" class="mt-input" value="${esc(c.etichettaBene)}" /></label>
      <label class="mt-campo"><span>Listino del noleggio</span><select id="cf-listino" class="mt-input">
        ${opzioni(dati.opzioni?.listini, c.tabellaCanoni)}</select></label>
      <label class="mt-campo"><span>Listino affiancato</span><select id="cf-alternativa" class="mt-input">
        <option value="">Nessuno</option>${opzioni(dati.opzioni?.listini, c.tabellaAlternativa ?? '')}</select></label>
      <label class="mt-campo"><span>Regole del semaforo</span><select id="cf-regole" class="mt-input">
        ${opzioni(dati.opzioni?.regole, c.regoleSemaforo)}</select></label>
      <label class="mt-campo"><span>Partner del leasing</span><select id="cf-partner" class="mt-input">
        ${opzioni(dati.opzioni?.partner, c.partnerLeasing)}</select></label>
      <label class="mt-campo"><span>Leasing da, euro (0 = sempre)</span><input id="cf-soglia" type="number" min="0" step="1000" class="mt-input" value="${esc(c.sogliaLeasing)}" /></label>
      <label class="mt-campo"><span>Tetto ricerche al mese, euro</span><input id="cf-tetto" type="number" min="0" step="5" class="mt-input" value="${esc(c.tettoMeseEuro)}" /></label>
      <label class="mt-campo"><span>Prezzo per richiesta al fornitore, euro</span><input id="cf-prezzo-verifica" type="number" min="0" step="any" class="mt-input" value="${esc(c.prezzoVerifica ?? '')}" placeholder="vuoto: non si fattura" /></label>
      <label class="mt-campo"><span>Colore della testata</span><input id="cf-colore" type="color" class="mt-input" value="${esc(c.colore ?? '#664CCD')}" /></label>
      <label class="mt-campo"><span>Colore dei titoli nei PDF</span><input id="cf-accento" type="color" class="mt-input" value="${esc(c.accento ?? c.colore ?? '#664CCD')}" /></label>
    </div>
    <label class="mt-campo" style="margin-top:16px"><span>Documenti in più nella checklist, uno per riga</span>
      <textarea id="cf-extra" class="mt-input" rows="3">${esc((c.documentiExtra ?? []).join('\n'))}</textarea></label>
    <label class="mt-toggle" style="margin-top:12px"><input type="checkbox" id="cf-demo" ${c.demo ? 'checked' : ''} /> Portale dimostrativo (scritto a video e nei PDF)</label>
    <label class="mt-toggle" style="margin-top:12px"><input type="checkbox" id="cf-leasing" ${c.leasing !== false ? 'checked' : ''} /> Proponi anche il leasing</label>
    ${notaConfigurazione(c.settore) ? `<p class="mt-nota" style="margin:12px 0 0">${esc(notaConfigurazione(c.settore))}</p>` : ''}
    <div class="mt-azioni"><button type="button" id="cf-salva" class="mt-btn">Salva la configurazione</button></div>
    <p id="cf-msg" class="mt-msg" hidden></p>

    ${ds ? sezioniDistinta() : ''}
    ${mz ? sezioniMezzi() : ''}

    <h3 class="mt-h3">Catalogo</h3>
    <div class="mt-scorri"><table class="mt-tabella">
      <thead><tr><th>Codice</th><th>Nome</th>${fv ? '<th class="num">kWp</th><th class="num">Accumulo</th>' : ''}${mc ? '<th>Famiglia</th><th>Tipo</th>' : ''}${ds ? '<th>Categoria</th><th>Valido fino</th>' : ''}<th class="num">Prezzo</th>${ds ? '<th>Storico prezzi</th>' : ''}<th>Stato</th></tr></thead>
      <tbody>${dati.catalogo.map((v: any) => `<tr class="${v.attivo ? '' : 'spenta'}">
        <td>${esc(v.codice)}</td><td>${esc(v.nome)}</td>
        ${fv ? `<td class="num">${v.attributi?.kwp != null ? num(v.attributi.kwp) : '—'}</td><td class="num">${v.attributi?.kwh_accumulo ? `${num(v.attributi.kwh_accumulo)} kWh` : '—'}</td>` : ''}
        ${mc ? `<td>${esc(v.attributi?.famiglia ?? '—')}</td><td>${v.attributi?.tipo === 'accessorio' ? `accessorio${v.attributi.passo > 1 ? `, a ${esc(v.attributi.passo)}` : ''}, max ${esc(v.attributi.massimo)}${v.attributi.allestimento ? `, solo versione ${esc(v.attributi.allestimento)}` : ''}` : esc(v.attributi?.allestimento ?? 'macchina')}</td>` : ''}
        ${ds ? `<td>${esc(v.attributi?.categoria ?? '—')}</td><td>${esc(giorno(v.attributi?.valido_fino))}</td>` : ''}
        <td class="num">${euroEsatto(v.prezzo)}</td>
        ${ds ? `<td>${storicoVoce(v.codice)}</td>` : ''}
        <td><button type="button" class="mt-link" data-voce-stato="${esc(v.codice)}" data-attivo="${v.attivo ? '0' : '1'}">${v.attivo ? 'Spegni' : 'Riaccendi'}</button></td>
      </tr>`).join('')}</tbody></table></div>

    <h3 class="mt-h3">Importa da Excel</h3>
    <p class="mt-nota" style="margin-top:0">Copia le righe dal foglio, intestazione compresa, e incollale qui. Colonne riconosciute: codice, nome,
      prezzo${fv ? ', kwp, accumulo, installazione' : ''}${mc ? ', famiglia, allestimento (cavo, batteria, steam; su un accessorio lo offre solo con quella versione), tipo (accessorio), passo, massimo, nota' : ''}${ds ? ', categoria (una di quelle qui sopra, scritta uguale), valido_fino (GG/MM/AAAA)' : ''}, descrizione. Lo stesso codice aggiorna la voce, non la duplica.</p>
    <textarea id="cf-incolla" class="mt-input" rows="6" placeholder="codice&#9;nome&#9;prezzo${fv ? '&#9;kwp&#9;accumulo' : ''}${ds ? '&#9;categoria&#9;valido_fino' : ''}"></textarea>
    <div class="mt-azioni">
      <button type="button" id="cf-importa" class="mt-btn mt-btn--secondario">Importa le righe</button>
      <span id="cf-anteprima" class="mt-nota"></span>
    </div>
    <p id="cf-import-msg" class="mt-msg" hidden></p>`;
}

async function carica() {
  const { res, corpo } = await apiJson(api('admin'));
  if (!res.ok || !corpo?.ok) {
    $('mcf').innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci(corpo?.error ?? ''))}</p>`;
    return;
  }
  dati = corpo;
  rendi();
}

async function ricaricaCatalogo() {
  const { corpo } = await apiJson(api('sessione'));
  if (corpo?.ok) aggiornaCatalogo(corpo.catalogo ?? []);
}

async function post(corpo: Record<string, unknown>) {
  return apiJson('/api/motore/admin', { method: 'POST', body: JSON.stringify({ f: stato.slug, ...corpo }) });
}

/** Manda un'azione del settore distinta e ricarica il pannello; il messaggio resta sotto la sezione */
async function salvaSezione(corpoAzione: Record<string, unknown>, idMsg: string, ok: string) {
  const { res, corpo } = await post(corpoAzione);
  if (!res.ok || !corpo?.ok) return messaggio($(idMsg), errore(corpo), false);
  await carica();
  messaggio($(idMsg), ok, true);
}

export function montaAdmin() {
  document.addEventListener('mt:tab', (e) => { if ((e as CustomEvent).detail === 'mcf') void carica(); });

  document.addEventListener('input', (e) => {
    if ((e.target as HTMLElement).id !== 'cf-incolla') return;
    const righe = leggiIncollato((e.target as HTMLTextAreaElement).value);
    $('cf-anteprima').textContent = righe.length ? `${righe.length} righe riconosciute` : '';
  });

  // Cambio d'effetto di un cliente segnalato: si risegnala con lo stesso motivo e la stessa nota
  document.addEventListener('change', async (e) => {
    const sel = (e.target as HTMLElement).closest('[data-sg-effetto]') as HTMLSelectElement | null;
    if (!sel) return;
    const s = (dati?.segnalati ?? []).find((x: any) => x.piva === sel.dataset.sgEffetto);
    if (!s) return;
    await salvaSezione({ azione: 'segnala', piva: s.piva, ragioneSociale: s.ragioneSociale, motivo: s.motivo, effetto: sel.value, nota: s.nota },
      'sg-msg', `Effetto cambiato per ${s.piva}.`);
  });

  document.addEventListener('click', async (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'cf-salva') {
      const val = (id: string) => $<HTMLInputElement>(id).value;
      const { res, corpo } = await post({
        azione: 'config',
        config: {
          settore: val('cf-settore'), etichettaBene: val('cf-etichetta'), tabellaCanoni: val('cf-listino'),
          partnerLeasing: val('cf-partner'), sogliaLeasing: Number(val('cf-soglia')), tettoMeseEuro: Number(val('cf-tetto')),
          colore: val('cf-colore'), accento: val('cf-accento'), demo: $<HTMLInputElement>('cf-demo').checked,
          documentiExtra: val('cf-extra').split('\n').map((x) => x.trim()).filter(Boolean),
          tabellaAlternativa: val('cf-alternativa'), regoleSemaforo: val('cf-regole'),
          leasing: $<HTMLInputElement>('cf-leasing').checked,
          prezzoVerifica: val('cf-prezzo-verifica'),
        },
      });
      if (!res.ok || !corpo?.ok) return messaggio($('cf-msg'), errore(corpo), false);
      await carica();
      messaggio($('cf-msg'), 'Configurazione salvata. Colori e settore si vedono ricaricando la pagina.', true);
    }
    if (t.id === 'cf-importa') {
      const righe = leggiIncollato($<HTMLTextAreaElement>('cf-incolla').value);
      if (!righe.length) return messaggio($('cf-import-msg'), "Non trovo righe: serve l'intestazione e almeno una riga.", false);
      const { res, corpo } = await post({ azione: 'importa', righe });
      if (!res.ok || !corpo?.ok) return messaggio($('cf-import-msg'), traduci(corpo?.error ?? ''), false);
      await carica();
      await ricaricaCatalogo();
      const note = [
        corpo.scartate?.length ? ` Righe scartate (manca codice, nome o prezzo): ${corpo.scartate.join(', ')}.` : '',
        corpo.senzaCategoria?.length ? ` Righe scartate perché la categoria manca o non è fra quelle del pannello: ${corpo.senzaCategoria.join(', ')}.` : '',
        ...(corpo.ambigue ?? []).map((a: any) => ` Riga ${a.riga} scartata, ${a.motivo}.`),
      ].join('');
      messaggio($('cf-import-msg'), `Voci salvate: ${corpo.salvate}.${note}`, !note);
    }
    const sv = t.closest('[data-voce-stato]') as HTMLElement | null;
    if (sv) {
      await post({ azione: 'attiva', codice: sv.dataset.voceStato, attivo: sv.dataset.attivo === '1' });
      await carica();
      await ricaricaCatalogo();
    }

    // --- settore distinta ---
    if (t.id === 'cn-salva') await salvaSezione({ azione: 'canali', canali: canaliDalPannello() }, 'cn-msg', 'Canali salvati.');
    // --- settore mezzi: un JSON che non si legge si ferma qui, senza chiamare il server ---
    if (t.id === 'mz-salva') {
      const letto = configDaTesto($<HTMLTextAreaElement>('mz-config').value);
      if (!letto.ok) return messaggio($('mz-msg'), letto.errore, false);
      await salvaSezione({ azione: 'mezzi', mezzi: letto.valore }, 'mz-msg', 'Configurazione dei mezzi salvata.');
    }
    if (t.id === 'so-salva') {
      const societa = Object.fromEntries(CAMPI_SOCIETA.map(([k]) => [k, $<HTMLInputElement>(`so-${k}`).value.trim()]));
      await salvaSezione({ azione: 'societa', societa }, 'so-msg', 'Società fornitrice salvata.');
    }
    if (t.id === 'ca-aggiungi' || t.closest('[data-togli-categoria]')) {
      // Le modifiche non salvate restano: si rilegge la tabella prima di ridisegnarla
      const righe = categorieDalPannello();
      const togli = (t.closest('[data-togli-categoria]') as HTMLElement | null)?.dataset.togliCategoria;
      const nuove = togli !== undefined ? righe.filter((_, i) => i !== Number(togli)) : [...righe, { nome: '', settoriTipici: [], postazione: false, ledwall: false }];
      $('ca-righe').innerHTML = nuove.map(rigaCategoria).join('');
    }
    if (t.id === 'ca-salva') await salvaSezione({ azione: 'categorie', categorie: categorieDalPannello() }, 'ca-msg', 'Categorie salvate.');
    if (t.id === 'ck-aggiungi' || t.closest('[data-togli-ck]')) {
      const { voci } = checklistDalPannello();
      const togli = (t.closest('[data-togli-ck]') as HTMLElement | null)?.dataset.togliCk;
      const nuove = togli !== undefined ? voci.filter((_, i) => i !== Number(togli)) : [...voci, { nome: '', obbligatoria: false }];
      $('ck-righe').innerHTML = nuove.map(rigaChecklist).join('');
    }
    if (t.id === 'ck-salva') await salvaSezione({ azione: 'checklist', checklist: checklistDalPannello() }, 'ck-msg', 'Checklist salvata.');
    if (t.id === 'sg-aggiungi') {
      const val = (id: string) => $<HTMLInputElement>(id).value.trim();
      await salvaSezione({
        azione: 'segnala', piva: val('sg-piva'), ragioneSociale: val('sg-rs'), motivo: val('sg-motivo'),
        effetto: val('sg-effetto'), nota: val('sg-nota'),
      }, 'sg-msg', 'Cliente segnalato.');
    }
    // Togliere cancella la riga: il primo clic chiede conferma sul bottone stesso
    const sg = t.closest('[data-sg-togli]') as HTMLElement | null;
    if (sg && !sg.dataset.conferma) {
      sg.dataset.conferma = '1';
      sg.textContent = 'Conferma: togli';
    } else if (sg) {
      await salvaSezione({ azione: 'togli-segnalazione', piva: sg.dataset.sgTogli }, 'sg-msg', `${sg.dataset.sgTogli} tolta dai clienti segnalati.`);
    }
    if (t.id === 'pe-aggiungi') {
      const val = (id: string) => $<HTMLInputElement>(id).value.trim();
      await salvaSezione({
        azione: 'pratica-esterna', piva: val('pe-piva'), ragioneSociale: val('pe-rs'), data: val('pe-data'),
        canale: val('pe-canale'), esito: val('pe-esito'), importo: val('pe-importo'),
      }, 'pe-msg', 'Pratica esterna aggiunta.');
    }
  });
}
