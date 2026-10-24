// Come si installa l'app del portale su questo telefono, e quando proporlo.
// Modulo puro: lo usa la fascia "Scarica l'app" e lo provano i test sugli
// user agent veri. Apple non lascia installare con un bottone, Android si',
// e dentro le app (Facebook, Gmail, l'app Google) non si installa per niente:
// li' l'unica cosa utile e' dire di aprire la pagina nel browser.

export type ViaInstallazione =
  | 'installata' // gia' dentro l'app
  | 'computer' // niente fascia
  | 'android-bottone' // Chrome ha offerto l'installazione: un tocco
  | 'android-menu' // tre puntini, Installa app
  | 'samsung-menu' // Samsung Internet, menu in basso
  | 'iphone-safari' // Condividi in basso, Aggiungi alla schermata Home
  | 'ipad-safari' // Condividi in alto a destra
  | 'ios-chrome' // Condividi accanto all'indirizzo
  | 'apri-safari' // browser interno di un'app su iPhone o iPad
  | 'apri-chrome'; // browser interno di un'app su Android

export interface Dispositivo {
  ua: string;
  /** navigator.maxTouchPoints: l'iPad si presenta come un Mac e lo tradisce solo il tocco */
  toccoMax: number;
  /** pagina aperta dall'icona sulla schermata Home */
  standalone: boolean;
  /** Chrome ha mandato beforeinstallprompt: l'installazione si fa da un bottone */
  promptPronto: boolean;
}

export const RIMANDO_GIORNI = 7;

export function comeInstallare(d: Dispositivo): ViaInstallazione {
  if (d.standalone) return 'installata';
  const ua = d.ua;

  const ipad = /iPad/.test(ua) || (/Macintosh/.test(ua) && d.toccoMax > 1);
  const ios = ipad || /iPhone|iPod/.test(ua);
  if (ios) {
    if (/CriOS\//.test(ua)) return 'ios-chrome';
    // Firefox, Edge, Opera, l'app Google e le app social non aggiungono alla Home
    const altro = /FxiOS|EdgiOS|OPiOS|GSA\/|FBAN|FBAV|Instagram|Line\//.test(ua);
    if (altro || !/Safari\//.test(ua)) return 'apri-safari';
    return ipad ? 'ipad-safari' : 'iphone-safari';
  }

  if (/Android/.test(ua)) {
    if (d.promptPronto) return 'android-bottone';
    // "; wv)" e' la WebView dentro un'altra app
    if (/; wv\)|FBAN|FBAV|Instagram/.test(ua)) return 'apri-chrome';
    if (/SamsungBrowser/.test(ua)) return 'samsung-menu';
    return 'android-menu';
  }

  return 'computer';
}

/** La fascia si vede su telefono e tablet, fuori dall'app, se non e' stata rimandata da meno di sette giorni */
export function fasciaDaMostrare(via: ViaInstallazione, rimandataIl: number | null, ora: number): boolean {
  if (via === 'installata' || via === 'computer') return false;
  if (rimandataIl == null) return true;
  const trascorso = ora - rimandataIl;
  // Un rimando "nel futuro" viene da un orologio spostato: non deve nasconderla per sempre
  if (trascorso < 0) return true;
  return trascorso >= RIMANDO_GIORNI * 24 * 60 * 60 * 1000;
}
