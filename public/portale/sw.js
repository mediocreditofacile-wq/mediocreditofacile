// Service worker dell'app dei portali del motore.
//
// Fa una cosa sola: se l'app si apre senza rete, invece della pagina di
// errore del telefono mostra "Serve la connessione". Non salva niente in
// cache, di proposito: il portale vive sul server (canoni, verifiche, PDF),
// e sul telefono di un agente non devono restare dati dei clienti ne' una
// versione vecchia del portale. Tocca solo l'apertura delle pagine, mai le
// chiamate alle API.

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()));

const PAGINA_SENZA_RETE = `<!doctype html>
<html lang="it"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>Serve la connessione</title>
<style>
  body { margin: 0; min-height: 100vh; display: grid; place-items: center; padding: 24px; box-sizing: border-box;
    font-family: Manrope, -apple-system, system-ui, sans-serif; background: #F8F7FA; color: #444451; text-align: center; }
  h1 { font-size: 20px; color: #0F1020; margin: 0 0 8px; }
  p { margin: 0 0 24px; line-height: 1.5; }
  button { font: inherit; font-weight: 700; color: #fff; background: #FE6F3A; border: 0; border-radius: 10px; padding: 14px 24px; }
</style></head>
<body><main>
  <h1>Serve la connessione</h1>
  <p>Il portale lavora in rete: canoni, verifiche e preventivi escono dal server.<br>Controlla la linea e riprova.</p>
  <button type="button" onclick="location.reload()">Riprova</button>
</main></body></html>`;

self.addEventListener('fetch', (event) => {
  if (event.request.mode !== 'navigate') return;
  event.respondWith(
    fetch(event.request).catch(
      () => new Response(PAGINA_SENZA_RETE, { headers: { 'Content-Type': 'text/html; charset=utf-8' } }),
    ),
  );
});
