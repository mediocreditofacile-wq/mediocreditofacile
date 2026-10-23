// Scheda Simulazione del settore "mezzi" (Bergamelli), prima della verifica del cliente:
// importo, categoria, "È targato?" e chi vende. Escono le stesse tabelle della scheda
// Proposte, noleggio e leasing, senza semaforo e senza PDF: un cliente che non si
// conosce non si valuta e non ha un preventivo. Spec mcf_spec-bergamelli-motore_v2,
// sezione 3.
//
// Il conto lo fa il server (/api/motore/simulazione), che non salva niente: qui nessun
// canale, nessuno spread, nessun coefficiente. Prima di chiamarlo il bene passa dallo
// stesso controllo del server (provaSimulazione), cosi' la casella che non regge si
// segna subito. Ogni cambio rifa' il conto dopo una pausa e le risposte partite prima
// si scartano, come nella scheda Proposte.

import type { MezziSchermo } from '../../lib/motore/calcolo-mezzi';
import type { MezziBrowser } from '../../lib/motore/config-mezzi';
import { $, apiJsonSicura, esc, messaggio, stato, traduci } from './comune';
import { turni } from './distinta-browser';
import {
  campoSimulazione,
  corpoSimulazione,
  messaggioSimulazione,
  provaSimulazione,
  targatoDaMenu,
  targatoIniziale,
  venditoreSuggerito,
  type SimulazioneInPagina,
} from './mezzi-browser';
import { opzioniCategoria, opzioniTargato, opzioniVenditore, riquadroNoleggio, tabellaLeasing } from './proposte-mezzi';

/** Pausa fra l'ultima cifra scritta e il conto */
const ATTESA_MS = 350;

const SUGGERIMENTO =
  '<p class="mt-vuoto" style="margin-top:24px">Scrivi l\'importo e scegli la categoria: qui compaiono il noleggio e il leasing.</p>';
const NOTA_SENZA_PIVA = 'Senza la partita IVA il noleggio sopra i 150.000 euro non si può dire: verifica il cliente.';

/** La casella di ogni campo della simulazione */
const CASELLA: Record<keyof SimulazioneInPagina, string> = {
  importo: 'sm-importo',
  categoria: 'sm-categoria',
  targato: 'sm-targato',
  venditore: 'sm-venditore',
};

const s: SimulazioneInPagina = { importo: '', categoria: '', targato: null, venditore: '' };
/** L'agente ha cambiato "Vende" a mano: da quel momento non segue piu' la categoria */
let venditoreManuale = false;
let timer: ReturnType<typeof setTimeout> | undefined;
/** Ogni cambio apre un turno: le risposte dei turni vecchi si scartano */
const turno = turni();

const config = (): MezziBrowser | null => stato.carrozzeria?.mezzi ?? null;

/** "Vende" segue la categoria finche' l'agente non lo cambia a mano */
function suggerisciVenditore(cfg: MezziBrowser) {
  if (venditoreManuale) return;
  s.venditore = venditoreSuggerito(cfg, s.categoria) ?? cfg.venditori[0]?.codice ?? '';
  $<HTMLSelectElement>('sm-venditore').value = s.venditore;
}

function pulisciErrori() {
  messaggio($('sm-msg'), '', false);
  for (const el of document.querySelectorAll('#simulazione [aria-invalid]')) el.removeAttribute('aria-invalid');
}

function mostraErrore(errore: string) {
  messaggio($('sm-msg'), messaggioSimulazione(errore, s) ?? traduci(errore), false);
  const campo = campoSimulazione(errore);
  if (campo) document.getElementById(CASELLA[campo])?.setAttribute('aria-invalid', 'true');
}

/** Le stesse tabelle della scheda Proposte: niente semaforo, niente colonna nel PDF */
function rendiEsito(r: MezziSchermo) {
  $('sm-esito').innerHTML = `
    <h3 class="mt-h3">Noleggio operativo</h3>
    ${riquadroNoleggio(r)}
    ${r.leasing.length ? `<h3 class="mt-h3">Leasing finanziario</h3>${tabellaLeasing(r.leasing, null)}` : ''}`;
}

function pianifica(ms = ATTESA_MS) {
  clearTimeout(timer);
  // Turno nuovo: una risposta gia' in viaggio, partita coi valori di prima, si scarta
  turno.nuovo();
  $('sm-esito').classList.add('mt-in-attesa');
  timer = setTimeout(() => void calcola(), ms);
}

async function calcola() {
  const cfg = config();
  const box = $('sm-esito');
  if (!cfg) return;
  pulisciErrori();

  const prova = provaSimulazione(cfg.categorie, s);
  if (prova !== 'pronta') {
    turno.nuovo();
    box.classList.remove('mt-in-attesa');
    box.innerHTML = prova === 'incompleta' ? SUGGERIMENTO : '';
    if (prova !== 'incompleta') mostraErrore(prova);
    return;
  }

  const mio = turno.nuovo();
  box.classList.add('mt-in-attesa');
  const risposta = await apiJsonSicura('/api/motore/simulazione', {
    method: 'POST',
    body: JSON.stringify(corpoSimulazione(stato.slug, s)),
  });
  // Una risposta vecchia non deve coprire quella dei valori appena cambiati
  if (!turno.vale(mio)) return;
  box.classList.remove('mt-in-attesa');
  const r = risposta?.corpo;
  if (!risposta || !risposta.res.ok || !r?.ok) {
    box.innerHTML = '';
    return mostraErrore(risposta ? r?.error ?? '' : 'connessione_assente');
  }
  const { ok: _ok, ...schermo } = r;
  rendiEsito(schermo as MezziSchermo);
}

export function montaSimulazioneMezzi() {
  const box = $('simulazione');
  const cfg = config();
  if (!cfg) {
    box.innerHTML = `<p class="mt-msg mt-msg--errore">${esc(traduci('configurazione_mancante'))}</p>`;
    return;
  }

  box.innerHTML = `
    <div class="mt-mezzi">
      <div class="mt-griglia">
        <label class="mt-campo"><span>Importo, IVA esclusa</span>
          <input type="text" id="sm-importo" class="mt-input" inputmode="decimal" autocomplete="off" placeholder="48.500,00" /></label>
        <label class="mt-campo"><span>Categoria</span>
          <select id="sm-categoria" class="mt-input">${opzioniCategoria(cfg, '')}</select></label>
        <label class="mt-campo"><span>È targato?</span>
          <select id="sm-targato" class="mt-input">${opzioniTargato(cfg.categorie, s)}</select></label>
        <label class="mt-campo"><span>Vende</span>
          <select id="sm-venditore" class="mt-input">${opzioniVenditore(cfg)}</select>
          <small>La società che firma l'offerta. Segue la categoria finché non la cambi.</small></label>
      </div>
      <p id="sm-msg" class="mt-msg" hidden></p>
      <div id="sm-esito">${SUGGERIMENTO}</div>
      <p class="mt-nota mt-sm-nota">${esc(NOTA_SENZA_PIVA)}</p>
    </div>`;
  suggerisciVenditore(cfg);

  $('sm-importo').addEventListener('input', (e) => {
    const t = e.target as HTMLInputElement;
    s.importo = t.value;
    t.removeAttribute('aria-invalid');
    pianifica();
  });
  box.addEventListener('change', (e) => {
    const t = e.target as HTMLSelectElement;
    if (t.id === 'sm-categoria') {
      s.categoria = t.value;
      // Categoria nuova, domanda nuova: si riparte dalla sua risposta, o da nessuna
      s.targato = targatoIniziale(cfg.categorie, s.categoria);
      const menu = $<HTMLSelectElement>('sm-targato');
      menu.innerHTML = opzioniTargato(cfg.categorie, s);
      menu.removeAttribute('aria-invalid');
      suggerisciVenditore(cfg);
    } else if (t.id === 'sm-targato') {
      s.targato = targatoDaMenu(t.value);
    } else if (t.id === 'sm-venditore') {
      s.venditore = t.value;
      venditoreManuale = true;
    } else return;
    t.removeAttribute('aria-invalid');
    pianifica(0);
  });
}
