// La fascia "Scarica l'app" in cima al portale, sui portali che hanno l'app
// (data-app sulla radice, acceso in src/lib/motore/app-portale.ts).
//
// Gli agenti non sanno cos'e' una PWA e non devono saperlo: la fascia dice,
// telefono per telefono, quali tasti toccare. Su Android con Chrome basta un
// bottone; su iPhone Apple non lo permette, quindi i passaggi col disegno del
// tasto Condividi. La regola su quale istruzione dare sta in
// app-installa-regole.ts, provata sugli user agent veri.

import { comeInstallare, fasciaDaMostrare, type ViaInstallazione } from './app-installa-regole';
import { $, esc, stato } from './comune';

// L'evento che Chrome manda quando l'app si puo' installare con un bottone.
// Arriva quando vuole, anche prima dell'accesso: lo teniamo da parte.
interface RichiestaInstallazione extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}
let richiesta: RichiestaInstallazione | null = null;

const chiave = (cosa: string) => `mt-app-${cosa}:${stato.slug}`;
function leggi(cosa: string): string | null {
  try { return localStorage.getItem(chiave(cosa)); } catch { return null; }
}
function scrivi(cosa: string, valore: string) {
  try { localStorage.setItem(chiave(cosa), valore); } catch { /* navigazione privata: pazienza */ }
}

const standalone = () =>
  window.matchMedia('(display-mode: standalone)').matches || (navigator as { standalone?: boolean }).standalone === true;

function via(): ViaInstallazione {
  return comeInstallare({
    ua: navigator.userAgent,
    toccoMax: navigator.maxTouchPoints ?? 0,
    // Installata da questo browser (Android lo dice): non serve piu' chiederlo
    standalone: standalone() || leggi('installata') === '1',
    promptPronto: richiesta != null,
  });
}

// I simboli che l'agente deve cercare sullo schermo, disegnati come li vede
const SIMBOLO = {
  condividi: `<svg class="mt-app__simbolo" viewBox="0 0 24 24" aria-label="tasto Condividi" role="img"><path d="M12 3v12M7.5 7.5 12 3l4.5 4.5" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/><path d="M8 10H6a1 1 0 0 0-1 1v9a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-9a1 1 0 0 0-1-1h-2" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
  puntini: `<svg class="mt-app__simbolo" viewBox="0 0 24 24" aria-label="tre puntini" role="img"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>`,
  lineette: `<svg class="mt-app__simbolo" viewBox="0 0 24 24" aria-label="tre lineette" role="img"><path d="M4 6h16M4 12h16M4 18h16" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>`,
};

const passi = (righe: string[]) => `<ol class="mt-app__passi">${righe.map((r) => `<li>${r}</li>`).join('')}</ol>`;
const NOTA_ACCESSO = '<p class="mt-app__nota">Se l\'app ti chiede di accedere, usa la stessa email e password di qui.</p>';

function istruzioni(v: ViaInstallazione, nome: string): string {
  const aggiungi = '<strong>Aggiungi alla schermata Home</strong> (se non la vedi, scorri l\'elenco verso il basso)';
  const indirizzo = `${location.origin}${location.pathname}`;
  const copia = (browser: string) => `
    <p>Da qui non si installa: questa pagina è aperta dentro un'altra app. Copia l'indirizzo, aprilo in <strong>${browser}</strong> e lì trovi i passaggi.</p>
    <p class="mt-app__indirizzo">${esc(indirizzo)}</p>
    <button type="button" class="mt-btn" data-app="copia">Copia l'indirizzo</button>`;

  switch (v) {
    case 'android-bottone':
      return `<p>Un tocco su Installa e poi conferma: l'icona ${esc(nome)} compare tra le tue app.</p>
        <button type="button" class="mt-btn" data-app="installa">Installa l'app</button>`;
    case 'android-menu':
      return passi([
        `Tocca i tre puntini ${SIMBOLO.puntini} in alto a destra.`,
        'Tocca <strong>Installa app</strong> oppure <strong>Aggiungi a schermata Home</strong>.',
        'Conferma con <strong>Installa</strong>.',
      ]);
    case 'samsung-menu':
      return passi([
        `Tocca le tre lineette ${SIMBOLO.lineette} in basso a destra.`,
        'Tocca <strong>Aggiungi pagina a</strong>, poi <strong>Schermata Home</strong>.',
        'Conferma con <strong>Aggiungi</strong>.',
      ]);
    case 'iphone-safari':
      return passi([
        `Tocca il tasto Condividi ${SIMBOLO.condividi} nella barra in basso. Se vedi solo i tre puntini <strong>···</strong> in basso a destra, tocca quelli e poi Condividi.`,
        `Tocca ${aggiungi}.`,
        'Tocca <strong>Aggiungi</strong> in alto a destra.',
      ]) + NOTA_ACCESSO;
    case 'ipad-safari':
      return passi([
        `Tocca il tasto Condividi ${SIMBOLO.condividi} in alto a destra, accanto all'indirizzo. Se non c'è, tocca i tre puntini <strong>···</strong> e poi Condividi.`,
        `Tocca ${aggiungi}.`,
        'Tocca <strong>Aggiungi</strong>.',
      ]) + NOTA_ACCESSO;
    case 'ios-chrome':
      return passi([
        `Tocca il tasto Condividi ${SIMBOLO.condividi} in alto, accanto all'indirizzo.`,
        `Tocca ${aggiungi}.`,
        'Tocca <strong>Aggiungi</strong>.',
      ]) + NOTA_ACCESSO;
    case 'apri-safari':
      return copia('Safari');
    case 'apri-chrome':
      return copia('Chrome');
    default:
      return '';
  }
}

function togli() {
  document.getElementById('mt-app')?.remove();
}

function disegna() {
  const radice = $('motore');
  const nome = radice.dataset.app;
  if (!nome || $('tool').hidden) return;
  const v = via();
  const rimandata = Number(leggi('rimandata')) || null;
  if (!fasciaDaMostrare(v, rimandata, Date.now())) return togli();

  const fascia = document.getElementById('mt-app') ?? document.createElement('section');
  fascia.id = 'mt-app';
  fascia.className = 'mt-app';
  fascia.setAttribute('aria-label', `Scarica l'app ${nome}`);
  fascia.innerHTML = `
    <img class="mt-app__icona" src="${esc(radice.dataset.appIcona ?? '')}" alt="" width="56" height="56" />
    <div class="mt-app__corpo">
      <p class="mt-app__tit">Scarica l'app ${esc(nome)}</p>
      <p class="mt-app__sotto">Il portale con un tocco dalla schermata Home, a tutto schermo.</p>
      ${istruzioni(v, nome)}
      <p class="mt-app__dopo"><button type="button" class="mt-link" data-app="dopo">Più tardi</button></p>
    </div>`;
  if (!fascia.isConnected) document.querySelector('#tool .mt-testa')!.after(fascia);
}

async function installa(btn: HTMLButtonElement) {
  if (!richiesta) return disegna();
  btn.disabled = true;
  await richiesta.prompt();
  const { outcome } = await richiesta.userChoice;
  // Chrome usa l'evento una volta sola: se l'agente rinuncia, restano i passaggi dal menu
  richiesta = null;
  if (outcome === 'accepted') {
    scrivi('installata', '1');
    togli();
  } else {
    disegna();
  }
}

async function copia(btn: HTMLButtonElement) {
  const indirizzo = `${location.origin}${location.pathname}`;
  try {
    await navigator.clipboard.writeText(indirizzo);
    btn.textContent = 'Indirizzo copiato';
  } catch {
    // Senza permesso sugli appunti resta l'indirizzo scritto sopra, da tenere premuto
    btn.textContent = 'Tieni premuto l\'indirizzo qui sopra e copialo';
  }
}

/** All'apertura della pagina, prima dell'accesso: service worker e richiesta di Chrome */
export function preparaApp() {
  if (!$('motore').dataset.app) return;

  // Il service worker mostra "Serve la connessione" quando manca la rete; non salva niente
  if ('serviceWorker' in navigator) {
    void navigator.serviceWorker.register('/portale/sw.js', { scope: `/portale/${stato.slug}` }).catch(() => {});
  }

  window.addEventListener('beforeinstallprompt', (e) => {
    // Niente barra di Chrome: l'installazione la offre la nostra fascia
    e.preventDefault();
    richiesta = e as RichiestaInstallazione;
    if (document.getElementById('mt-app')) disegna();
  });
  window.addEventListener('appinstalled', () => {
    scrivi('installata', '1');
    togli();
  });

  document.addEventListener('click', (e) => {
    const t = (e.target as HTMLElement).closest<HTMLButtonElement>('#mt-app [data-app]');
    if (!t) return;
    if (t.dataset.app === 'dopo') {
      scrivi('rimandata', String(Date.now()));
      togli();
    }
    if (t.dataset.app === 'installa') void installa(t);
    if (t.dataset.app === 'copia') void copia(t);
  });
}

/** Dopo l'accesso: la fascia, se il telefono non ha ancora l'app */
export function mostraInvitoApp() {
  disegna();
}
