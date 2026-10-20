// Pratica e segnalazione sul settore "distinta" (oggi Led Office).
// Spec mcf_spec-ledoffice-motore_v1, paragrafi 5 e 9.
//
// Niente menu di forma giuridica, prodotto e importo: la forma viene dal Registro,
// beni, consegna, canale e dati di vendita dalla proposta salvata (o, nella
// segnalazione, dalla distinta a schermo). Un caricamento per voce della checklist,
// solo PDF e JPG: l'input con accept="application/pdf,image/jpeg" fa convertire a
// Safari le foto HEIC dell'iPhone, e se arriva comunque un formato che non passa il
// commerciale legge "Solo PDF o JPG" sulla voce, non un errore generico.
//
// Cosa parte:
//  - pratica: una proposta di questa verifica con la proposta di vendita (quelle "solo
//    canone" non hanno i dati per il contratto);
//  - segnalazione sul rosso: una proposta gia' salvata (il server la trasforma in
//    segnalazione con le sue righe, i suoi dati e la proposta per il locatore) oppure
//    la distinta a schermo;
//  - segnalazione senza canale: la distinta a schermo, che il server rifa' passare
//    dall'instradamento. Una proposta salvata qui partirebbe come pratica normale.
// Il server ricontrolla tutto: un rosso arrivato dopo il preventivo trasforma una
// pratica in segnalazione, e la pagina lo dice.

import { upload } from '@vercel/blob/client';
import { documentiMancanti, formatoAmmesso, testoFormati, vociPerInvio } from '../../lib/motore/pratica-distinta-regole';
import { TESTI_PREFILTRO } from '../../lib/motore/prefiltro';
import { initCampoIban, type CampoIban } from '../campo-iban';
import { $, apiJsonSicura, data, esc, euro, messaggio, stato, traduci } from './comune';
import { classeDaForma, controllaContatti, vociDaChiedere, type VoceChecklistBrowser } from './distinta-browser';
import {
  corpoSegnalazione,
  infoPreventivo,
  motivoBloccoCorrente,
  quanteRighe,
  totaleBeniCorrente,
} from './proposte-distinta';
import { caricaStorico, suStorico, type DatiStorico } from './storico';
import { datiVenditaCorrenti } from './vendita-distinta';

/** Come il server (/api/motore/upload) */
const MAX_FILE_BYTES = 25 * 1024 * 1024;
/** Il valore del menu che manda la distinta a schermo invece di una proposta salvata */
const DISTINTA = 'distinta';

/** Una cosa che si puo' mandare: una proposta salvata oppure la distinta a schermo */
interface Opzione {
  valore: string;
  etichetta: string;
  /** Proposta con la proposta di vendita: i contatti vuoti li prende il server dai suoi dati */
  conVendita: boolean;
  beni: number;
  /** Durata salvata con la proposta (Storico) */
  durata: number | null;
}

let bozza = '';
let segnalazione = false;
/** Sul rosso la segnalazione puo' portare una proposta salvata; senza canale no */
let rosso = false;
/** Il modulo aperto: 'in-attesa' aspetta che lo Storico porti una proposta del cliente */
let aperto: false | true | 'in-attesa' = false;
let voci: VoceChecklistBrowser[] = [];
/** I file scelti, per nome della voce di checklist */
const file = new Map<string, File[]>();
let campoIban: CampoIban | null = null;
/** Le proposte dello Storico: il modulo offre quelle della ricerca aperta */
let proposte: any[] = [];

const formati = (): ('pdf' | 'jpg')[] => stato.carrozzeria?.checklist?.formati ?? ['pdf', 'jpg'];
const haPropostaVendita = (documenti: any[] | null | undefined) =>
  (documenti ?? []).some((d: any) => /proposta-vendita/i.test(String(d?.nome ?? '')));

/**
 * Le proposte di questa verifica, la piu' recente in cima: il server accetta solo una
 * proposta della stessa verifica. L'ultimo preventivo di questa sessione c'e' anche se
 * lo Storico non e' ancora tornato.
 */
function proposteDellaRicerca(): Opzione[] {
  const id = stato.ricerca?.id;
  const mie: Opzione[] = proposte
    .filter((p) => p.ricerca_id === id)
    .map((p) => ({
      valore: p.id,
      etichetta: `${p.id} · ${euro(p.prezzo)} di beni · ${data(p.creato)}`,
      conVendita: haPropostaVendita(p.documenti),
      beni: Number(p.prezzo),
      durata: p.scelta?.durata != null ? Number(p.scelta.durata) : null,
    }));
  const ultimo = stato.ultimoPreventivo;
  const info = infoPreventivo(ultimo);
  if (ultimo && info && !mie.some((p) => p.valore === ultimo)) {
    mie.unshift({ valore: ultimo, etichetta: `${ultimo} · ${euro(info.beni)} di beni · appena scaricato`, conVendita: info.conVendita, beni: info.beni, durata: info.evidenza });
  }
  return mie.map((p) => (p.conVendita ? p : { ...p, etichetta: `${p.etichetta} · solo canone` }));
}

/** Cosa si puo' mandare, nell'ordine del menu */
function opzioniInvio(): Opzione[] {
  const salvate = proposteDellaRicerca();
  if (!segnalazione) return salvate.filter((p) => p.conVendita);
  const righe = quanteRighe();
  const aSchermo: Opzione[] = righe
    ? [{
        valore: DISTINTA,
        etichetta: `La distinta a schermo · ${righe === 1 ? 'una riga' : `${righe} righe`}, ${euro(totaleBeniCorrente())} di beni`,
        conVendita: false,
        beni: totaleBeniCorrente(),
        durata: null,
      }]
    : [];
  // Senza canale una proposta salvata partirebbe come pratica: resta la distinta a schermo
  return rosso ? [...aSchermo, ...salvate] : aSchermo;
}

const opzioneScelta = (): Opzione | null => {
  const valore = (document.getElementById('prd-proposta') as HTMLSelectElement | null)?.value ?? '';
  return opzioniInvio().find((o) => o.valore === valore) ?? null;
};

function opzioniMenu(selezionata: string | null): string {
  return opzioniInvio()
    .map((o) => `<option value="${esc(o.valore)}" ${o.valore === selezionata ? 'selected' : ''}>${esc(o.etichetta)}</option>`)
    .join('');
}

/** Le durate della proposta scelta: quelle quotate se il preventivo e' di questa sessione, altrimenti quella salvata */
function rendiDurata() {
  const campo = document.getElementById('prd-durata-campo');
  const sel = document.getElementById('prd-durata') as HTMLSelectElement | null;
  if (!campo || !sel) return;
  const o = opzioneScelta();
  const info = infoPreventivo(o?.valore ?? null);
  const durate: number[] = info?.durate?.length ? info.durate : o?.durata ? [o.durata] : [];
  const scelta = info?.evidenza ?? o?.durata ?? null;
  campo.hidden = segnalazione || durate.length === 0;
  sel.innerHTML = durate.map((m) => `<option value="${m}" ${m === scelta ? 'selected' : ''}>${m} mesi</option>`).join('');
}

/** Con una proposta di vendita i contatti vuoti vengono dalla proposta: lo dice il segnaposto */
function rendiContatti() {
  const dallaProposta = Boolean(opzioneScelta()?.conVendita);
  const segnaposti: [string, string][] = [['prd-ref-tel', ''], ['prd-ref-email', ''], ['prd-iban', '27 caratteri, inizia con IT']];
  for (const [id, normale] of segnaposti) {
    const input = document.getElementById(id) as HTMLInputElement | null;
    if (input) input.placeholder = dallaProposta ? 'dalla proposta' : normale;
  }
  const nota = document.getElementById('prd-contatti-nota');
  if (nota) nota.hidden = !dallaProposta;
}

function elencoFile(nome: string): string {
  const lista = file.get(nome) ?? [];
  return lista.length
    ? lista.map((f, j) => `<li>${esc(f.name)} <span class="mt-id">${Math.round(f.size / 1024)} KB</span>
        <button type="button" class="mt-link" data-togli-file="${j}">togli</button></li>`).join('')
    : '<li class="mt-id">Nessun file.</li>';
}

/** Le voci di questo cliente: forma dal Registro, beni della scelta; nella segnalazione senza la proposta firmata */
function rendiChecklist() {
  const r = stato.ricerca;
  const box = document.getElementById('prd-checklist');
  if (!r || !box) return;
  const tutte = (stato.carrozzeria?.checklist?.voci ?? []) as VoceChecklistBrowser[];
  voci = vociPerInvio(vociDaChiedere(tutte, classeDaForma(r.scheda.formaGiuridica), opzioneScelta()?.beni ?? NaN), segnalazione);
  // I file delle voci che non si chiedono piu' non partono
  for (const nome of [...file.keys()]) if (!voci.some((v) => v.nome === nome)) file.delete(nome);
  box.innerHTML = voci.map((v, i) => `
    <li data-voce-doc="${i}">
      <p class="mt-voce-doc">${esc(v.nome)}${v.obbligatoria ? ' <span class="mt-obbligatoria">obbligatoria</span>' : ''}</p>
      <input type="file" data-file-voce="${i}" accept="application/pdf,image/jpeg" multiple aria-label="${esc(v.nome)}" />
      <span class="mt-campo__errore" data-errore-voce="${i}" role="alert" hidden></span>
      <ul class="mt-criteri" data-lista-voce="${i}">${elencoFile(v.nome)}</ul>
    </li>`).join('');
}

/** I file scelti per una voce: passano solo PDF e JPG, il resto si dice sulla voce */
function aggiungiFile(i: number, scelti: File[]) {
  const voce = voci[i];
  if (!voce) return;
  const lista = file.get(voce.nome) ?? [];
  const scartati: string[] = [];
  const grandi: string[] = [];
  for (const f of scelti) {
    if (!formatoAmmesso(f.name, f.type, formati())) scartati.push(f.name);
    else if (f.size > MAX_FILE_BYTES) grandi.push(f.name);
    else lista.push(f);
  }
  file.set(voce.nome, lista);
  const errore = document.querySelector<HTMLElement>(`[data-errore-voce="${i}"]`);
  if (errore) {
    const testi = [
      scartati.length ? `${testoFormati(formati())}: ${scartati.join(', ')} non ${scartati.length === 1 ? 'è stato aggiunto' : 'sono stati aggiunti'}.` : '',
      grandi.length ? `Oltre 25 MB: ${grandi.join(', ')}.` : '',
    ].filter(Boolean);
    errore.textContent = testi.join(' ');
    errore.hidden = testi.length === 0;
  }
  const ul = document.querySelector(`[data-lista-voce="${i}"]`);
  if (ul) ul.innerHTML = elencoFile(voce.nome);
}

/** Niente da mandare ancora: si dice cosa manca e si aspetta lo Storico */
function rendiInAttesa(box: HTMLElement) {
  aperto = 'in-attesa';
  const soloCanone = proposteDellaRicerca().length > 0;
  const [titolo, testo] = segnalazione
    ? ['Prima la distinta', 'Per segnalare il cliente serve la distinta: componila nella sezione Proposte, con l\'indirizzo di consegna. Mediocredito Facile la guarda con i documenti.']
    : soloCanone
      ? ['Genera prima la proposta di vendita', 'Le proposte di questo cliente sono solo preventivi del canone. Nella sezione Proposte completa i dati per la proposta di vendita e scarica il preventivo e la proposta: la pratica parte da lì.']
      : ['Prima la proposta', 'Per caricare la pratica serve una proposta salvata: prima scarica il preventivo e la proposta di vendita dalla sezione Proposte. I beni, la consegna e i dati di vendita vengono da lì.'];
  box.innerHTML = `
    <div class="mt-card">
      <p class="mt-semaforo__tit">${esc(titolo)}</p>
      <p class="mt-nota" style="margin:0 0 12px">${esc(testo)}</p>
      <button type="button" class="mt-btn mt-btn--secondario" data-vai="proposte">Vai alle proposte</button>
    </div>`;
}

/** Sotto il menu: da dove vengono beni, consegna e dati di quello che si manda */
function spiegaScelta(opzioni: Opzione[]): string {
  if (!segnalazione) return 'Beni, consegna e dati di vendita vengono da questa proposta.';
  const aSchermo = opzioni.some((o) => o.valore === DISTINTA);
  const salvate = opzioni.some((o) => o.valore !== DISTINTA);
  if (aSchermo && salvate) return 'Una proposta già salvata porta le sue righe e i suoi dati; la distinta a schermo porta quella che vedi in Proposte.';
  if (aSchermo) return 'Parte la distinta che vedi in Proposte, con la consegna e le motivazioni.';
  return 'La proposta porta le sue righe, la consegna e i dati di vendita.';
}

/**
 * Il modulo della pratica sul settore distinta. `chiesta` = il commerciale ha premuto
 * "Segnala a Mediocredito Facile". Sul rosso e' comunque una segnalazione: il server
 * la tratterebbe cosi' in ogni caso, meglio che la pagina lo dica prima.
 */
export function rendiModuloDistinta(chiesta: boolean) {
  const r = stato.ricerca;
  const box = $('pratica-nuova');
  box.hidden = false;
  aperto = false;
  if (!r) {
    box.innerHTML = '<p class="mt-vuoto">Per caricare una pratica verifica prima il cliente nella sezione Cliente.</p>';
    return;
  }
  if (r.credito?.semaforo === 'bloccato') {
    box.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(TESTI_PREFILTRO.bloccato)}</p>`;
    return;
  }
  rosso = r.credito?.semaforo === 'rosso' || motivoBloccoCorrente() === 'rosso';
  segnalazione = chiesta || rosso;
  const opzioni = opzioniInvio();
  if (!opzioni.length) return rendiInAttesa(box);
  const scelta = opzioni.some((o) => o.valore === stato.ultimoPreventivo) && !segnalazione ? stato.ultimoPreventivo : opzioni[0].valore;

  bozza = crypto.randomUUID();
  file.clear();
  aperto = true;
  const v = datiVenditaCorrenti();

  const testa = segnalazione
    ? `<p class="mt-semaforo__tit">Segnalazione a Mediocredito Facile</p>
       <p class="mt-meta" style="margin-top:0">${esc(r.scheda.ragioneSociale)} · P.IVA ${esc(r.scheda.piva)}</p>
       <p class="mt-nota">La rata e i documenti per il cliente non escono. Mediocredito Facile riceve la distinta, i tuoi dati e i
         documenti, guarda il cliente e ti dice come procedere.</p>`
    : `<p class="mt-semaforo__tit">Nuova pratica per ${esc(r.scheda.ragioneSociale)}</p>
       <p class="mt-meta" style="margin-top:0">P.IVA ${esc(r.scheda.piva)}</p>`;

  box.innerHTML = `
    <article class="mt-card mt-card--evidenza">
      ${testa}
      <div class="mt-griglia" style="margin-top:16px">
        <label class="mt-campo"><span>${segnalazione ? 'Cosa segnali' : 'Proposta'}</span>
          <select id="prd-proposta" class="mt-input">${opzioniMenu(scelta)}</select>
          <small>${spiegaScelta(opzioni)}</small></label>
        <label class="mt-campo" id="prd-durata-campo"><span>Durata</span><select id="prd-durata" class="mt-input"></select></label>
      </div>
      <div class="mt-griglia" style="margin-top:16px">
        <label class="mt-campo"><span>Referente del cliente</span>
          <input type="text" id="prd-ref-nome" class="mt-input" placeholder="Nome e cognome" value="${esc(v.amministratore.nome)}" autocomplete="off" /></label>
        <label class="mt-campo"><span>Cellulare del referente *</span>
          <input type="tel" id="prd-ref-tel" class="mt-input" autocomplete="off" value="${esc(v.telefono)}" /></label>
        <label class="mt-campo"><span>Email del referente *</span>
          <input type="email" id="prd-ref-email" class="mt-input" autocomplete="off" value="${esc(v.email)}" /></label>
      </div>
      <p id="prd-contatti-nota" class="mt-nota" hidden>Lasciati vuoti, cellulare, email e IBAN si prendono dalla proposta di vendita.</p>
      <label class="mt-campo" style="margin-top:16px"><span>IBAN del conto aziendale *</span>
        <input type="text" id="prd-iban" class="mt-input mt-input--iban" autocomplete="off" spellcheck="false"
          inputmode="text" maxlength="48" aria-describedby="prd-iban-esito" value="${esc(v.iban)}" />
        <small>Quello su cui il cliente pagherà i canoni. Senza IBAN ${segnalazione ? 'la segnalazione' : 'la pratica'} non parte.</small>
        <span id="prd-iban-esito" class="mt-campo__errore" role="alert" hidden></span></label>
      <label class="mt-campo" style="margin-top:16px"><span>Note per Mediocredito Facile</span>
        <textarea id="prd-note" class="mt-input" rows="3" maxlength="2000"></textarea></label>
      <p class="mt-semaforo__tit" style="margin-top:24px">Documenti</p>
      <p class="mt-nota" style="margin-top:0">Un caricamento per voce, solo PDF o JPG, fino a 25 MB a file. Le voci obbligatorie servono
        per l'invio; le altre possono arrivare dopo, e Mediocredito Facile sa cosa manca.</p>
      <ul class="mt-checklist" id="prd-checklist"></ul>
      <div class="mt-azioni">
        <button type="button" id="prd-invia" class="mt-btn">${segnalazione ? 'Invia la segnalazione' : 'Invia la pratica'}</button>
        <button type="button" id="prd-annulla" class="mt-link">annulla</button>
      </div>
      <p id="prd-msg" class="mt-msg" hidden></p>
    </article>`;

  campoIban = initCampoIban($<HTMLInputElement>('prd-iban'), $('prd-iban-esito'));
  rendiDurata();
  rendiContatti();
  rendiChecklist();
}

/** Il campo del modulo a cui si riferisce un errore sui dati del cliente */
const CAMPO_DELL_ERRORE: Record<string, string> = {
  cellulare_mancante: 'prd-ref-tel',
  cellulare_non_valido: 'prd-ref-tel',
  email_mancante: 'prd-ref-email',
  email_non_valida: 'prd-ref-email',
  iban_mancante: 'prd-iban',
  iban_non_valido: 'prd-iban',
};

function segnalaCampo(errore: string, testo: string) {
  const id = CAMPO_DELL_ERRORE[errore];
  const campo = id ? (document.getElementById(id) as HTMLInputElement | null) : null;
  if (!campo) return;
  campo.setAttribute('aria-invalid', 'true');
  campo.addEventListener('input', () => campo.removeAttribute('aria-invalid'), { once: true });
  if (id === 'prd-iban') {
    const esito = $('prd-iban-esito');
    esito.textContent = testo;
    esito.hidden = false;
  }
  campo.focus();
}

/** Il pezzo del corpo che dice cosa si manda; null se manca qualcosa, e il messaggio e' gia' a schermo */
function contenutoInvio(o: Opzione, msg: HTMLElement): Record<string, unknown> | null {
  if (o.valore === DISTINTA) {
    const c = corpoSegnalazione();
    if (!c.ok) {
      messaggio(msg, c.messaggio, false);
      return null;
    }
    return { segnalazione: true, ...c.corpo };
  }
  if (segnalazione) return { segnalazione: true, propostaId: o.valore };
  const durata = Number((document.getElementById('prd-durata') as HTMLSelectElement | null)?.value) || null;
  return { propostaId: o.valore, ...(durata ? { durata } : {}) };
}

async function invia(btn: HTMLButtonElement) {
  const r = stato.ricerca;
  const o = opzioneScelta();
  if (!r || !o) return;
  const msg = $('prd-msg');
  const val = (id: string) => $<HTMLInputElement>(id).value.trim();
  const etichetta = segnalazione ? 'Invia la segnalazione' : 'Invia la pratica';

  // Prima quello che il server rifiuterebbe: inutile caricare file per un invio che non parte
  if (val('prd-iban')) campoIban?.verifica();
  const cliente = controllaContatti({ telefono: val('prd-ref-tel'), email: val('prd-ref-email'), iban: val('prd-iban') }, o.conVendita);
  if (!cliente.ok) {
    messaggio(msg, cliente.messaggio, false);
    return segnalaCampo(cliente.errore, cliente.messaggio);
  }
  const contenuto = contenutoInvio(o, msg);
  if (!contenuto) return;
  const scelti = voci.flatMap((v) => (file.get(v.nome) ?? []).map((f) => ({ voce: v.nome, f })));
  const mancanti = documentiMancanti(voci, scelti.map((x) => ({ nome: x.f.name, pathname: '', size: x.f.size, voce: x.voce })), segnalazione);
  if (mancanti.obbligatori.length) {
    return messaggio(msg, `Per inviare ${segnalazione ? 'la segnalazione' : 'la pratica'} mancano: ${mancanti.obbligatori.join('; ')}.`, false);
  }
  messaggio(msg, '', false);
  btn.disabled = true;

  try {
    // 1. i documenti salgono dal browser allo store, nella cartella della bozza, ognuno con la sua voce
    const documenti: { nome: string; pathname: string; size: number; voce: string }[] = [];
    try {
      for (const [i, { voce, f }] of scelti.entries()) {
        btn.textContent = `Carico il documento ${i + 1} di ${scelti.length}...`;
        const nome = f.name.replace(/[^\w.\- ]/g, '_');
        const caricato = await upload(`pratiche/${stato.slug}/bozze/${bozza}/${nome}`, f, {
          access: 'private',
          handleUploadUrl: '/api/motore/upload',
          clientPayload: JSON.stringify({ f: stato.slug, bozza }),
        });
        documenti.push({ nome: f.name, pathname: caricato.pathname, size: f.size, voce });
      }
    } catch {
      return messaggio(msg, 'Il caricamento di un documento non è riuscito. Controlla la connessione e riprova, oppure togli il file e mandalo dopo.', false);
    }

    // 2. la pratica (o la segnalazione), con l'elenco dei documenti caricati
    btn.textContent = segnalazione ? 'Invio la segnalazione...' : 'Invio la pratica...';
    const risposta = await apiJsonSicura('/api/motore/pratica', {
      method: 'POST',
      body: JSON.stringify({
        f: stato.slug,
        ricercaId: r.id,
        bozza,
        documenti,
        // Vuoti, cellulare, email e IBAN il server li prende dalla proposta di vendita
        referente: { nome: val('prd-ref-nome'), telefono: cliente.telefono, email: cliente.email },
        iban: cliente.iban,
        note: $<HTMLTextAreaElement>('prd-note').value.trim(),
        ...contenuto,
      }),
    });
    if (!risposta) return messaggio(msg, traduci('connessione_assente'), false);
    const { res, corpo } = risposta;
    if (!res.ok || !corpo?.ok) {
      const testo = corpo?.messaggio || traduci(corpo?.error ?? '');
      messaggio(msg, corpo?.riga != null ? `Riga ${corpo.riga + 1} della distinta: ${testo}` : testo, false);
      return segnalaCampo(corpo?.error ?? '', corpo?.messaggio ?? '');
    }
    aperto = false;
    const quanti = documenti.length ? ` con ${documenti.length === 1 ? 'un documento' : `${documenti.length} documenti`}` : '';
    // Un rosso arrivato dopo il preventivo fa partire la pratica come segnalazione
    const diventata = corpo.segnalazione && !segnalazione
      ? ' Il prefiltro nel frattempo è diventato rosso: è partita come segnalazione, e Mediocredito Facile ti dice come procedere.'
      : '';
    $('pratica-nuova').innerHTML = `<p class="mt-msg mt-msg--ok">${corpo.segnalazione ? 'Segnalazione' : 'Pratica'} ${esc(corpo.id)} inviata${quanti}.${diventata} Lo stato lo segui qui sotto.</p>`;
    void caricaStorico();
  } finally {
    // Il pulsante torna com'era anche se la rete cade a meta'
    if (btn.isConnected) {
      btn.disabled = false;
      btn.textContent = etichetta;
    }
  }
}

export function montaPraticheDistinta() {
  // Lo Storico porta le proposte: il modulo aperto le offre appena arrivano
  suStorico((d: DatiStorico) => {
    proposte = d.proposte;
    if (aperto === 'in-attesa' && opzioniInvio().length) return rendiModuloDistinta(segnalazione);
    const sel = document.getElementById('prd-proposta') as HTMLSelectElement | null;
    if (aperto === true && sel) {
      const prima = sel.value;
      sel.innerHTML = opzioniMenu(prima);
      rendiDurata();
      rendiContatti();
    }
  });

  const box = $('pratica-nuova');
  box.addEventListener('change', (e) => {
    const t = e.target as HTMLInputElement;
    if (t.dataset.fileVoce) {
      aggiungiFile(Number(t.dataset.fileVoce), Array.from(t.files ?? []));
      t.value = '';
    }
    if (t.id === 'prd-proposta') {
      rendiDurata();
      rendiContatti();
      rendiChecklist();
    }
  });
  box.addEventListener('click', (e) => {
    const t = e.target as HTMLElement;
    if (t.id === 'prd-invia') void invia(t as HTMLButtonElement);
    if (t.id === 'prd-annulla') {
      aperto = false;
      box.hidden = true;
    }
    const togli = t.closest('[data-togli-file]') as HTMLElement | null;
    const li = t.closest('[data-voce-doc]') as HTMLElement | null;
    if (togli && li) {
      const i = Number(li.dataset.voceDoc);
      const voce = voci[i];
      if (!voce) return;
      file.get(voce.nome)?.splice(Number(togli.dataset.togliFile), 1);
      const ul = document.querySelector(`[data-lista-voce="${i}"]`);
      if (ul) ul.innerHTML = elencoFile(voce.nome);
    }
  });
}
