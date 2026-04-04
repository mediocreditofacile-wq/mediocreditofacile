# Mediocredito Facile — Progetto Astro

## Stack
- Framework: Astro (SSG)
- Hosting: Vercel
- Dominio: mediocreditofacile.it
- CRM: Pipedrive
- Ads: Google Ads (account AW-16800748626)
- Tracking: GTM + GA4
- Form: webhook Zapier → Pipedrive
- Webhook URL: https://hooks.zapier.com/hooks/catch/26268853/ul50ccv/

## Struttura progetto
- src/data/landing-pages.json → definizioni landing page (slug, titolo, sottotitolo, benefits, CTA)
- src/layouts/Layout.astro → layout base + CSS globale + GTM
- src/components/ → Header, Hero, Benefits, HowItWorks, ContactForm, Footer
- src/pages/[slug].astro → generatore dinamico landing da JSON
- src/pages/index.astro → homepage (navbar completa)
- public/images/ → foto (hero-fotovoltaico.png, pannelli-tetto.png, hero-homepage.png, consulenza-business.png)

## Architettura landing page
Le landing si generano da landing-pages.json. Per creare una nuova landing basta aggiungere un oggetto al JSON con: slug, title, subtitle, benefits (array 3 oggetti), ctaText. Il template [slug].astro fa il resto.

## Regole componenti
- Header.astro ha prop "minimal" (boolean). minimal=true → solo logo + telefono (per landing ads). minimal=false → navbar completa (per homepage e pagine sito).
- Le landing con slug che contiene "fotovoltaico" mostrano le foto hero-fotovoltaico.png e pannelli-tetto.png.
- Form invia a webhook Zapier. Thank you page: /grazie (vendor), /grazie-fv (end-user).

## Brand
- Viola primario: #664CCD
- Arancione CTA: #FE6F3A
- Testo body: #293C5B
- Font: Manrope (Google Fonts)
- Logo testo: MEDIOCREDITO (viola) FACILE (arancione), uppercase

## Convenzioni
- Telefono: +39 393 995 7840 (link tel:+393939957840)
- Email: mediocreditofacile@gmail.com
- Privacy: link a /privacy su tutti i form
- Immagini: sempre in public/images/, nomi kebab-case
- Form — campo "fonte" OBBLIGATORIO: ogni form del sito deve avere un campo nascosto `fonte` con lo slug della pagina. Per le landing dinamiche (da landing-pages.json), il componente ContactForm accetta la prop `fonte` e lo slug viene passato automaticamente in [slug].astro. Per i form inline nelle pagine statiche, usare `<input type="hidden" name="fonte" value="[slug]" />`. Il campo arriva a Zapier e da lì nella mail di notifica e in Pipedrive, così ogni lead porta con sé l'informazione della pagina di provenienza.

## API Routes (Vercel serverless)
- `src/pages/api/submit.ts` → webhook form contatti (POST → Zapier)
- `src/pages/api/cerved.ts` → proxy Cerved API per lookup P.IVA (GET, cache in-memory 24h, CORS per mcf-marotta.netlify.app)
- `src/pages/api/credit-ai.ts` → layer AI credit policy via Claude Haiku (POST, CORS per mcf-marotta.netlify.app)
- Tutte usano `export const prerender = false` per funzionare come serverless functions
- IMPORTANTE: il dominio fa redirect da `mediocreditofacile.it` a `www.mediocreditofacile.it` — usare sempre `www` nelle chiamate fetch dal frontend

## Environment Variables (Vercel)
- `ZAPIER_WEBHOOK_URL` → webhook form contatti
- `CERVED_CONSUMER_KEY` → API key Cerved (header: `apikey`)
- `ANTHROPIC_API_KEY` → API key Anthropic per layer AI credit policy

## Deploy
- Git push su main → Vercel auto-deploy
- Dev locale: npm run dev → http://localhost:4321

## Nota
Il Marotta Tool vive in ~/dev/marotta-tool/ con il suo CLAUDE.md dedicato.
Le API Cerved e credit-ai in src/pages/api/ servono anche il Marotta Tool (CORS abilitato per mcf-marotta.netlify.app).

---

# MCF Ads Engine — Guida operativa

## Approccio
Questo progetto si costruisce con un approccio **learning by doing**.
- Non dare mai per scontato che l'utente sappia dove si trovano i file o come eseguire i comandi
- Indica sempre il percorso completo dei file (es. `/Users/alberto/mediocreditofacile/mcf-ads-engine/`)
- Prima di chiedere di eseguire un comando, spiega cosa fa e cosa ci si aspetta di vedere
- Se qualcosa non va come previsto, fermati e analizza l'errore prima di andare avanti

## Dove si trova cosa
- **Progetto sito web (Astro):** `/Users/alberto/mediocreditofacile/`
- **MCF Ads Engine (da creare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/`
- **Landing pages JSON:** `/Users/alberto/mediocreditofacile/src/data/landing-pages.json`
- **Documentazione e piani:** `/Users/alberto/mediocreditofacile/docs/superpowers/`
- **Credenziali Google Ads (locale, mai committare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/google-ads.yaml`
- **Variabili d'ambiente (locale, mai committare):** `/Users/alberto/mediocreditofacile/mcf-ads-engine/.env`

## Come aprire il terminale nella cartella giusta
Quando devi eseguire comandi per il progetto ads engine:
```bash
cd /Users/alberto/mediocreditofacile/mcf-ads-engine
```

## Credenziali necessarie (da configurare una volta)
1. **Google Ads Developer Token** → va in `google-ads.yaml` come `developer_token`
2. **Google OAuth2 Client ID + Secret** → da Google Cloud Console, vanno in `google-ads.yaml`
3. **Google Refresh Token** → generato da `python setup_auth.py` (una volta sola)
4. **Anthropic API Key** → va in `.env` come `ANTHROPIC_API_KEY`
5. **Resend API Key** → va in `.env` come `RESEND_API_KEY`
6. **Email notifiche:** mediocreditofacile@gmail.com → va in `.env` come `NOTIFICATION_EMAIL`

## Account Google Ads
- Account ID: AW-16800748626
- Manager Account: configurato
- Developer Token: già ottenuto (non scrivere il valore qui)
