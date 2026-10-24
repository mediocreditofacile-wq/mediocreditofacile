// L'app installabile dei portali del motore (PWA): icona sulla schermata
// Home, il portale a tutto schermo senza barra del browser. Non e' un'app
// degli store: e' lo stesso portale, che il telefono apre come un'app.
//
// Si accende portale per portale. Per un fornitore nuovo: le icone si fanno
// con scripts/icone-app.py dal suo logo, poi una voce qui sotto.
// Nato il 24/10/2026 per Duplex, che ha chiesto il portale sul telefono.

export interface AppPortale {
  /** Il nome sotto l'icona: corto, lo taglia il telefono */
  nome: string;
  /** Il colore dietro il logo nell'icona, e dello schermo d'avvio su Android */
  sfondo: string;
  icona192: string;
  icona512: string;
  iconaMaschera: string;
  /** 180x180 per l'iPhone, che non legge le icone del manifest */
  iconaApple: string;
}

const icone = (slug: string) => ({
  icona192: `/app/${slug}/icona-192.png`,
  icona512: `/app/${slug}/icona-512.png`,
  iconaMaschera: `/app/${slug}/icona-512-maschera.png`,
  iconaApple: `/app/${slug}/icona-180.png`,
});

export const APP_PORTALI: Record<string, AppPortale> = {
  // Logo mandato da Alberto il 24/10/2026; il blu e' quello del logo vero,
  // piu' chiaro di quello della testata del portale
  duplex: { nome: 'Duplex', sfondo: '#158CCD', ...icone('duplex') },
};

export function appDelPortale(slug: string): AppPortale | null {
  return Object.hasOwn(APP_PORTALI, slug) ? APP_PORTALI[slug] : null;
}

const coloreValido = (v: string | null | undefined) => (v && /^#[0-9a-fA-F]{6}$/.test(v) ? v : null);

/** Il manifest dell'app: si apre sul portale e non ne esce */
export function manifestPortale(slug: string, app: AppPortale, coloreTesta: string | null) {
  const percorso = `/portale/${slug}`;
  return {
    id: percorso,
    name: `Portale ${app.nome}`,
    short_name: app.nome,
    start_url: percorso,
    scope: percorso,
    display: 'standalone',
    background_color: app.sfondo,
    theme_color: coloreValido(coloreTesta) ?? app.sfondo,
    lang: 'it',
    dir: 'ltr',
    icons: [
      { src: app.icona192, sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: app.icona512, sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: app.iconaMaschera, sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
