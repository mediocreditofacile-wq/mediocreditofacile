// L'app installabile dei portali del motore: chi ce l'ha e com'e' fatta.

import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { APP_PORTALI, appDelPortale, manifestPortale } from './app-portale';

describe('quali portali hanno l app', () => {
  it('Duplex si, gli altri finche non si accendono no', () => {
    expect(appDelPortale('duplex')).not.toBeNull();
    expect(appDelPortale('led-office')).toBeNull();
    expect(appDelPortale('bergamelli')).toBeNull();
    expect(appDelPortale('inesistente')).toBeNull();
  });

  it('ogni app accesa ha le sue icone nel sito', () => {
    for (const app of Object.values(APP_PORTALI)) {
      for (const icona of [app.icona192, app.icona512, app.iconaMaschera, app.iconaApple]) {
        expect(icona.startsWith('/'), icona).toBe(true);
        expect(existsSync(`public${icona}`), icona).toBe(true);
      }
    }
  });
});

describe('il manifest', () => {
  const app = appDelPortale('duplex')!;
  const m = manifestPortale('duplex', app, '#1B3A57');

  it('si apre sul portale e resta nel portale', () => {
    expect(m.id).toBe('/portale/duplex');
    expect(m.start_url).toBe('/portale/duplex');
    expect(m.scope).toBe('/portale/duplex');
    expect(m.display).toBe('standalone');
  });

  it('nome breve sotto l icona, colori del fornitore', () => {
    expect(m.short_name).toBe('Duplex');
    expect(m.theme_color).toBe('#1B3A57');
    expect(m.background_color).toBe(app.sfondo);
    expect(m.lang).toBe('it');
  });

  it('icone a 192 e 512, piu quella che Android ritaglia', () => {
    expect(m.icons).toContainEqual({ src: app.icona192, sizes: '192x192', type: 'image/png', purpose: 'any' });
    expect(m.icons).toContainEqual({ src: app.icona512, sizes: '512x512', type: 'image/png', purpose: 'any' });
    expect(m.icons).toContainEqual({ src: app.iconaMaschera, sizes: '512x512', type: 'image/png', purpose: 'maskable' });
  });

  it('un colore della testata illeggibile non finisce nel manifest', () => {
    expect(manifestPortale('duplex', app, 'blu').theme_color).toBe(app.sfondo);
    expect(manifestPortale('duplex', app, null).theme_color).toBe(app.sfondo);
  });
});
