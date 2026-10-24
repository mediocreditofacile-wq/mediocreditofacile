// Quale istruzione mostrare per installare l'app, telefono per telefono.
// Le stringhe sono user agent veri dei browser che usano gli agenti.

import { describe, expect, it } from 'vitest';
import { comeInstallare, fasciaDaMostrare, RIMANDO_GIORNI } from './app-installa-regole';

const UA = {
  iphoneSafari:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Mobile/15E148 Safari/604.1',
  // iPadOS si presenta come un Mac: lo distingue solo il tocco
  ipadOMac:
    'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.5 Safari/605.1.15',
  ipadVecchio:
    'Mozilla/5.0 (iPad; CPU OS 16_7 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.6 Mobile/15E148 Safari/604.1',
  iphoneChrome:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) CriOS/138.0.7204.156 Mobile/15E148 Safari/604.1',
  iphoneFirefox:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) FxiOS/140.0 Mobile/15E148 Safari/605.1.15',
  iphoneFacebook:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 [FBAN/FBIOS;FBAV/520.0.0.38.101;FBBV/750000000]',
  iphoneGmail:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148',
  iphoneAppGoogle:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) GSA/380.0.788169938 Mobile/15E148 Safari/604.1',
  androidChrome:
    'Mozilla/5.0 (Linux; Android 10; K) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Mobile Safari/537.36',
  tabletAndroid:
    'Mozilla/5.0 (Linux; Android 14; SM-X710) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
  androidSamsung:
    'Mozilla/5.0 (Linux; Android 14; SAMSUNG SM-S918B) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/27.0 Chrome/125.0.0.0 Mobile Safari/537.36',
  androidWebView:
    'Mozilla/5.0 (Linux; Android 13; SM-S918B Build/TP1A.220624.014; wv) AppleWebKit/537.36 (KHTML, like Gecko) Version/4.0 Chrome/138.0.0.0 Mobile Safari/537.36',
  windowsChrome:
    'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/138.0.0.0 Safari/537.36',
};

const via = (ua: string, extra: { toccoMax?: number; standalone?: boolean; promptPronto?: boolean } = {}) =>
  comeInstallare({ ua, toccoMax: extra.toccoMax ?? 5, standalone: extra.standalone ?? false, promptPronto: extra.promptPronto ?? false });

describe('come si installa, telefono per telefono', () => {
  it('iPhone con Safari: i passaggi dal tasto Condividi in basso', () => {
    expect(via(UA.iphoneSafari)).toBe('iphone-safari');
  });

  it('iPad con Safari, anche quando si presenta come un Mac', () => {
    expect(via(UA.ipadOMac, { toccoMax: 5 })).toBe('ipad-safari');
    expect(via(UA.ipadVecchio)).toBe('ipad-safari');
  });

  it('Chrome su iPhone installa dal tasto Condividi accanto all indirizzo', () => {
    expect(via(UA.iphoneChrome)).toBe('ios-chrome');
  });

  it('dentro Facebook, Gmail, l app Google o Firefox su iPhone non si installa: si apre in Safari', () => {
    expect(via(UA.iphoneFacebook)).toBe('apri-safari');
    expect(via(UA.iphoneGmail)).toBe('apri-safari');
    expect(via(UA.iphoneAppGoogle)).toBe('apri-safari');
    expect(via(UA.iphoneFirefox)).toBe('apri-safari');
  });

  it('Android con Chrome: bottone quando il browser lo offre, menu altrimenti', () => {
    expect(via(UA.androidChrome, { promptPronto: true })).toBe('android-bottone');
    expect(via(UA.androidChrome)).toBe('android-menu');
    expect(via(UA.tabletAndroid)).toBe('android-menu');
  });

  it('Samsung Internet ha il suo menu, ma se offre il bottone vale il bottone', () => {
    expect(via(UA.androidSamsung)).toBe('samsung-menu');
    expect(via(UA.androidSamsung, { promptPronto: true })).toBe('android-bottone');
  });

  it('dentro un app Android (WebView) non si installa: si apre in Chrome', () => {
    expect(via(UA.androidWebView)).toBe('apri-chrome');
  });

  it('sul computer niente, nemmeno su un Mac senza tocco', () => {
    expect(via(UA.windowsChrome, { toccoMax: 0 })).toBe('computer');
    expect(via(UA.ipadOMac, { toccoMax: 0 })).toBe('computer');
  });

  it('dentro l app gia installata non c e niente da installare', () => {
    expect(via(UA.iphoneSafari, { standalone: true })).toBe('installata');
    expect(via(UA.androidChrome, { standalone: true, promptPronto: true })).toBe('installata');
  });
});

describe('quando si vede la fascia', () => {
  const GIORNO = 24 * 60 * 60 * 1000;
  const ora = Date.UTC(2026, 9, 24, 10, 0);

  it('si vede finche non la rimandi', () => {
    expect(fasciaDaMostrare('iphone-safari', null, ora)).toBe(true);
  });

  it('"Piu tardi" la nasconde per sette giorni, poi torna', () => {
    expect(RIMANDO_GIORNI).toBe(7);
    expect(fasciaDaMostrare('android-menu', ora - 6 * GIORNO, ora)).toBe(false);
    expect(fasciaDaMostrare('android-menu', ora - 7 * GIORNO, ora)).toBe(true);
  });

  it('una data di rimando nel futuro (orologio spostato) non la nasconde per sempre', () => {
    expect(fasciaDaMostrare('android-menu', ora + 30 * GIORNO, ora)).toBe(true);
  });

  it('mai sul computer e mai dentro l app', () => {
    expect(fasciaDaMostrare('computer', null, ora)).toBe(false);
    expect(fasciaDaMostrare('installata', null, ora)).toBe(false);
  });
});
