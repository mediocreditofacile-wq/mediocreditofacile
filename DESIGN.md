# DESIGN.md

Design system operativo di mediocreditofacile.it. Fotografa lo stato reale del codice, lo confronta con la documentazione di brand in `~/Desktop/_AI/knowledge/reference/mediocredito-facile/brand/brand-guidelines.md`, segnala cosa è coerente, cosa diverge, cosa manca. Non è un manifesto, è una mappa operativa da tenere aperta quando si tocca il codice.

## Scopo e fonte di verità

La documentazione di brand vive fuori dal repo, nel workflow AI-first di Alberto. Il `brand-guidelines.md` è la base. Questo file non la sostituisce e non la riassume: la estende al livello di implementazione (classi CSS, custom properties, pattern di componenti) e segnala dove il codice si è allontanato dal brand.

Regola: se qualcosa in questo documento confligge con `brand-guidelines.md`, vince `brand-guidelines.md`. Questo file va aggiornato, non il brand book.

## Stack e architettura del layer grafico

Astro 5.17 in output statico, adapter Vercel. Integrazioni attive: Preact (per le isole dei preventivatori), sitemap. Nessun framework CSS: Tailwind non è installato, il design system è a mano in CSS custom properties dichiarate in `src/layouts/Layout.astro` dentro un blocco `<style is:global>`.

Font caricati via `<link>` in `Layout.astro`: Manrope (300, 400, 500, 600, 700, 800) da Google Fonts, Material Icons Outlined da Google CDN. Nessun font self-hosted.

Animazioni: GSAP + ScrollTrigger caricati da CDN in testa al layout. Usati per fade-in sezione, stagger card, counter animati nelle stats band.

## Token system: doppio namespace

In `Layout.astro` convivono due set paralleli di CSS custom properties che puntano agli stessi colori ma con nomi diversi. È il debito più evidente del sistema.

Set legacy (usato nella maggior parte dei componenti esistenti):

```
--color-primary: #664CCD
--color-primary-light: #7d66d5
--color-primary-dark: #0F1020
--color-accent: #FE6F3A
--color-accent-dark: #E85A25
--color-accent-light: #FF8A5C
--color-text: #293C5B
--color-text-light: #787782
--color-bg: #FFFFFF
--color-bg-alt: #F8F7F9
--color-border: #E1DEE3
--max-width: 1120px
--radius: 12px
--font-family: 'Manrope', system-ui, sans-serif
```

Set nuovo (introdotto per allineare i nomi al brand book, usato soprattutto nei componenti tool più recenti):

```
--mcf-primary: #664CCD
--mcf-primary-light: #8A74D9
--mcf-accent: #FE6F3A
--mcf-text: #293C5B
--mcf-text-muted: #787782
--mcf-bg: #FFFFFF
--mcf-bg-alt: #F8F7F9
--mcf-border: #E1DEE3
--mcf-success: #2D8F4E
--mcf-warning: #E6A817
--mcf-error: #CC3333
```

Nessun componente usa entrambi i set, ma il repository nel suo insieme dipende da tutti e due. Rimuovere il legacy oggi rompe header, footer, form, homepage, chi-siamo. Rimuovere il nuovo rompe alcuni tool. La soluzione non è cancellare uno dei due: è avere un mapping esplicito e una roadmap di deprecazione. Vedi sezione "Roadmap di riconciliazione".

## Palette effettiva vs brand book

Il brand book definisce tre livelli: primari (Orange Crayola #FE6F3A, Iris #664CCD), supporti (Melon, Pale Dogwood, Platinum #E1DEE3, Ghost White), testi (Charcoal #444451, Rich Black #0F1020, Taupe #787782, Dark Blue #293C5B) e stati UI (Success #2D8F4E, Warning #E6A817, Error #CC3333, Info #3B82F6).

Il codice implementa i primari, il Platinum come `--color-border`, il Dark Blue come `--color-text`, il Rich Black come `--color-primary-dark`, il Taupe come `--color-text-light`. Gli stati UI esistono solo nel namespace nuovo `--mcf-*`.

Colori fuori palette presenti nel codice:

- `#FFF5F0` in `Hero.astro` come fine gradient hero. Un rosato caldo non codificato nel brand book. Funziona visivamente ma non è un token.
- `#1e1b3a`, `#2d2556`, `#1a1640` in `HowItWorks.astro`, `chi-siamo.astro` e altre sezioni dark. Gradient viola scuro usato come "sezione dark" al posto del Rich Black #0F1020. È la divergenza più vistosa dal brand: il brand book non prevede sfondi scuri viola, solo Rich Black puro.
- `#4A36A0` nel result card di `sabatini-calculator.css`, usato come coda del gradient primario. Non è un token.
- `#f5fbff` in `PartnerLogos.astro` come fallback di `--color-bg-alt`. Due problemi: è un colore diverso da `#F8F7F9` che è il vero `--color-bg-alt`, e contraddice il brand (tinta azzurrina fredda).
- Verdi Tailwind (`#f0fdf4`, `#bbf7d0`, `#16a34a`, `#15803d`) hardcoded in `simulatore-noleggio.css` per i messaggi di risparmio. Esiste già `--mcf-success: #2D8F4E`, ignorato.

Accessibilità: l'arancio #FE6F3A su bianco ha contrasto 2.78:1, sotto WCAG AA per testo normale. Il brand book lo nota e prescrive la variante scura #D45A2E per testi lunghi. In codice non c'è ancora una custom property `--color-accent-text` o simile: dove serve testo arancio (es. claim eyebrow), il codice usa `#FE6F3A` e passa un test visivo ma non un audit WCAG.

## Tipografia

Manrope è il font di sistema. Un solo font, nessuna famiglia serif a corollario. Pesi disponibili: 300, 400, 500, 600, 700, 800. Material Icons Outlined è caricato per le icone (uso sparso, presente soprattutto nelle card di homepage e nei tool).

Scala tipografica dedotta dal codice (non codificata in token):

- H1 hero: 2.6rem / 3rem desktop, 2rem mobile, font-weight 700, line-height 1.15.
- H1 pagina: 2.4rem desktop, 1.8rem mobile, font-weight 700.
- H2 sezione: 2rem desktop, 1.6rem mobile, font-weight 700, line-height 1.2.
- H3 card: 1.2rem / 1.3rem, font-weight 600 o 700 a seconda del contesto.
- Body: 1rem, font-weight 400, line-height 1.6.
- Small / meta: 0.9rem, font-weight 500, colore `--color-text-light`.
- Eyebrow: 0.85rem, font-weight 600, letter-spacing 0.08em, testo maiuscolo colore `--color-primary`.

Non esiste un token tipografico (`--font-size-h1`, `--font-size-body`). Le dimensioni sono ripetute a mano in ogni componente. Duplicazione consistente tra Layout.astro, ToolLayout.astro e i singoli componenti. Se domani il brand chiede di salire di mezzo punto tipografico ovunque, si cambiano decine di file.

Caratteri fortemente stilizzati:

- Il payoff "L'Officina del Credito" compare nel footer e nella firma email. Font Manrope, peso 500, colore chiaro.
- L'apostrofo in "L'Officina" è sempre l'apostrofo tipografico corretto, mai il `'` diritto.

## Logo

`src/components/Logo.astro` implementa il wordmark MCF come SVG inline in tre varianti (principale, compatto, inline). Colori hardcoded:

- "Medio": #664CCD, font-weight 700
- "credito": colore testo (#293C5B oppure #FFFFFF su sfondi scuri), font-weight 300
- "Facile": #FE6F3A, font-weight 800
- Linea separatrice sottotitolo: #E1DEE3 (Platinum)

Il logo è coerente con la specifica di brand. L'unica variante mancante è il monogramma "MCF" quadrato che il brand book prevede per favicon, social avatar, favicon iOS. Oggi la favicon è gestita altrove (public folder) e non c'è una versione componentizzata.

## Componenti e pattern ricorrenti

### Header

`Header.astro` è sticky, sfondo bianco con blur opzionale su scroll, border-bottom su `--color-border`. Logo a sinistra, nav centrale con dropdown "Servizi" (open on hover desktop, on click mobile), doppia CTA a destra: una primaria arancione "Richiedi analisi" e una secondaria outline viola "Diventa partner". Breakpoint hamburger a 960px. Il dropdown "Servizi" contiene le landing dinamiche generate da `src/data/landing-pages.json`.

### Footer

`Footer.astro` è su sfondo #0F1020 (Rich Black, coerente con brand). Tre colonne desktop: logo + payoff, colonna link servizi, colonna contatti e legal. Include `PartnerLogos` come strip separata sopra il contenuto. Presenti disclosure OAM e link trasparenza Affida obbligatori.

### Hero

`Hero.astro` è un componente generico con due modalità: background gradient bianco + `#FFF5F0` (rosato caldo), oppure `background-image` con overlay scuro rgba(0,0,0,0.5). La seconda modalità è usata dalle landing fotovoltaico. Struttura: eyebrow, h1, subtitle, coppia di CTA. Variante split con colonna immagine usata in homepage.

### Benefit / card sezione

Pattern ricorrente ovunque: grid a 3 colonne (1 su mobile), card con padding 1.5rem, border-radius 12px, border 1px `--color-border`, background `--color-bg`. Hover: translateY(-4px), box-shadow con tinta viola `rgba(102, 76, 205, 0.1)`. Stessa ricetta in `Benefits.astro`, nelle card dei tool nella homepage, nelle card chi-siamo, nelle card valori. Non esiste un componente `Card.astro` riusabile: il pattern è replicato in almeno 6 luoghi, con micro-varianti sullo stato hover e sui padding.

### CTA pulsante

Due stili principali:

- Primario: sfondo `--color-accent` (#FE6F3A), testo bianco, padding 0.9rem 1.8rem, border-radius 999px (pill), font-weight 600. Hover: sfondo `--color-accent-dark` (#E85A25), translateY(-1px).
- Outline: background trasparente, border 1.5px `--color-primary`, testo `--color-primary`, stesso padding e radius. Hover: background `--color-primary`, testo bianco.

Terza variante minore: CTA "ghost" testo + freccia, usata in fondo alle card per il link alla landing dedicata. Anche qui nessun componente `Button.astro` centralizzato.

### Eyebrow

Pattern ripetuto 7 volte nel codice (homepage, chi-siamo, landing, tool): testo corto maiuscolo, font-weight 600, letter-spacing 0.08em, colore `--color-primary`, spesso preceduto da un pallino o da una linea. Le implementazioni variano tra `.eyebrow`, `.section-eyebrow`, `.hero-eyebrow`. Tre classi per la stessa cosa.

### Stats band

Sezione sfondo viola `--color-primary`, testo bianco, tre o quattro numeri grossi con counter animato via GSAP. Dicitura sotto il numero in 0.9rem. Pattern usato in homepage, chi-siamo, landing fotovoltaico. Implementato sempre in prossimità della sezione "Come funziona". Non è un componente, è codice inline in ogni pagina.

### Dark section

Sezione su sfondo gradient `#1e1b3a → #2d2556 → #1a1640`. Usata per "Come funziona" in homepage, per metodologia in chi-siamo, per alcune sezioni CTA finali. Problema: non è un colore di brand. Il Rich Black #0F1020 è quello specificato. Il gradient viola scuro nasce come scelta visiva senza passare da `brand-guidelines.md`. Da allineare.

### Form

`ContactForm.astro` è il pattern form di riferimento. Label in `--color-primary`, font-weight 600, 0.9rem. Input e textarea: background `--color-bg-alt`, border 1.5px `--color-border`, border-radius 8px, padding 0.9rem 1rem, font-family ereditato, focus con border `--color-primary` e shadow viola diffusa. Campo honeypot nascosto con `name="website"`. Submit CTA arancione full width su mobile, inline desktop. Success state inline sostituisce il form dopo submit.

### FAQ

Pattern `<details>` / `<summary>` con chevron che ruota di 180° on open. Border-bottom `--color-border` tra item. Padding 1.25rem. Usato in homepage e in tutte le landing. Coerente, non duplicato.

### PartnerLogos

Strip autoscroll 40s a loop infinito, grayscale(1) opacity 0.6 di default, hover grayscale(0) opacity 1. Eccezione hardcoded: i loghi Affida e Gift Solutions sono sempre a colori pieni (grayscale 0) perché l'impatto visivo in bianco e nero era troppo debole. Fallback sfondo `var(--color-bg-alt, #f5fbff)`: il fallback `#f5fbff` è azzurrino e non matcha il vero `--color-bg-alt` (`#F8F7F9`). Da sostituire.

## Tool pages e preventivatori

I tool vivono in `src/pages/tools/*.astro` e usano `ToolLayout.astro` come layout. Ogni tool ha un CSS dedicato in `src/components/tools/[tool].css` importato dalla pagina.

Tool presenti: Simulatore Noleggio Operativo (`simulatore-noleggio.css`, prefisso BEM `.sim__`), Calcolatore Sabatini (`sabatini-calculator.css`, `.sab-calc__`), Check Fondo di Garanzia MCC (`fdg-check__`), Check Bando ISI INAIL (`isi-check__`), Simulatore Fotovoltaico (`simpv__`), Simulatore Inverso (`sim-inv__`).

`ToolLayout.astro` duplica quasi per intero il blocco di CSS variables di `Layout.astro`, con una divergenza che vale la pena documentare:

```
Layout.astro:     --color-primary-dark: #0F1020
ToolLayout.astro: --color-primary-dark: #061237
```

Nessuno dei due componenti documenta il motivo. `#061237` è una variante blu scuro più saturata, probabilmente introdotta per i grafici dei tool. Non è in palette. Il fix pulito è uniformare entrambi a `#0F1020` e introdurre un nuovo token `--mcf-chart-dark` se davvero serve un blu scuro diverso per i grafici.

I tool più recenti (fotovoltaico, inverso) usano `--mcf-*`. I tool più vecchi (noleggio, sabatini) usano un mix di `--mcf-*`, `--color-*` e colori Tailwind hardcoded. Il caso peggiore è `simulatore-noleggio.css`:

```
background-color: #f0fdf4;   /* Tailwind green-50 */
border: 1px solid #bbf7d0;   /* Tailwind green-200 */
color: #15803d;              /* Tailwind green-700 */
```

Usato per il riquadro "Risparmi 320€ al mese". Va sostituito con `--mcf-success` o con una terna dichiarata in token.

`sabatini-calculator.css` aggiunge un gradient personalizzato nel result card (`#664CCD → #4A36A0`) e radius custom `10px` invece di `12px`. Piccole derive, ma sommate fanno un sistema.

## Convenzioni di layout

Max-width principale: 1120px (`--max-width`). Usato sul wrapper `.container` presente in quasi tutte le sezioni con padding orizzontale `clamp(1rem, 3vw, 2rem)`.

Breakpoint dichiarati nel codice (senza token, ripetuti a mano):

- 960px: attivazione hamburger, collapse nav, transizione a layout stacked.
- 768px: grid 3-col diventa 1-col, hero split diventa stacked.
- 640px: riduzione font size h1, padding sezione.
- 480px: riduzione ulteriore, nascondiglio elementi secondari.

Spaziatura sezioni (padding verticale): tipicamente `clamp(3rem, 6vw, 5rem)` in alto e in basso. Alcune sezioni forzano `4.5rem` fisso (vedi `Benefits.astro`). Nessun token `--space-section` dedicato.

Radius: `--radius: 12px` è il default. In uso anche `999px` (pill CTA), `8px` (input), `6px` (badge), `10px` (sabatini result). Non c'è una scala pulita tipo `--radius-sm / md / lg / pill`.

Shadow: nessun token. Le ombre usate nel codice sono tre ricorrenti, dichiarate a mano:

- Card resting: `0 2px 8px rgba(102, 76, 205, 0.06)`.
- Card hover: `0 8px 24px rgba(102, 76, 205, 0.12)`.
- CTA pill hover: `0 4px 12px rgba(254, 111, 58, 0.25)`.

Vale la pena dichiararle come `--shadow-sm / md / cta`.

Durate animazioni: `0.2s ease` e `0.3s ease` ripetuti nella maggior parte delle transizioni, `0.6s / 0.8s` sui fade-in GSAP. Nessun token.

## Animazioni

GSAP + ScrollTrigger caricati in `Layout.astro` con script blocco globale. I pattern in uso:

- Fade-in su scroll: elementi con classe `.fade-in` entrano con `opacity 0 → 1` e `y 30 → 0` al 85% della viewport.
- Stagger card: gruppi di card con classe `.stagger-item` si animano con stagger 0.1s.
- Counter stats: numeri nella stats band animati da 0 al target in 2s con ease-out, triggerati quando la band entra in viewport.

Tutti gli handler sono nel blocco `<script>` di `Layout.astro`. Nessuno dei tool aggiunge animazioni custom. Preferenza `prefers-reduced-motion` non gestita.

## Landing dinamiche

`src/data/landing-pages.json` definisce 11 landing servite dal template dinamico `src/pages/[slug].astro`. Categorie:

- Prodotto: `/noleggio-operativo`, `/leasing-strumentale`, `/finanziamenti-pmi`.
- Verticale settore: `/ristorazione`, `/finanza-veloce`.
- Campagna: `/diventa-partner`.
- Fotovoltaico: 6 angoli di messaggio (`/fotovoltaico-zero-anticipo`, `/fotovoltaico-no-debito`, `/fotovoltaico-canone-fisso`, `/fotovoltaico-senza-burocrazia`, `/fotovoltaico-breve-termine`, `/fotovoltaico-tetto-affitto`).

Il template ricicla Hero + Benefits + ContactForm intermedio opzionale + value prop + stats band + HowItWorks + ContactForm finale. Ogni landing ha un set di testi e immagini, stesso sistema grafico.

Questo pattern è il punto di forza del design system: una modifica al template propaga a tutte le landing. È anche il punto di rigidità: aggiungere una landing con struttura diversa richiede o un nuovo template o un set di flag JSON che cresce.

## Tone of voice applicato all'interfaccia

Regole editoriali a livello di UI copy, coerenti con `brand-guidelines.md` e con il voice profile di Alberto:

- Mai em-dash, mai en-dash, mai doppio trattino. Testi già in produzione rispettano la regola. Prima di ogni merge, grep sul diff è buona pratica.
- Mai "Scopri di più" come CTA. Preferire verbi specifici: "Calcola la rata", "Richiedi analisi gratuita", "Scrivici in 60 secondi", "Diventa partner".
- Mai "Gentile utente", "Ciao!", "Benvenuto!". L'apertura del sito è diretta e impersonale, la landing riporta subito il problema del cliente.
- Microcopy errori form: frase breve, nessun "Oops". Es: "Manca l'email per risponderti".
- Claim headline: verbo forte in apertura, numero concreto dove possibile. Es: "Scegli la rata, noi troviamo la finanza. 12 operatori, una sola chiamata."
- Il numero degli operatori varia tra "oltre 10" (contesti di brand fissi, brochure, OAM) e il numero esatto attuale (conversazioni live, landing dinamiche aggiornabili). Oggi in codice compare in pochi punti: da centralizzare in una costante.
- Mai parola "broker" nel copy pubblico. Usare "intermediario del credito" o "punto di accesso". La parola "hub" è bandita.

## Sandbox IMC

Esiste un sotto-sistema completamente separato in `src/layouts/LayoutIMC.astro` + `src/components/imc/HeaderIMC.astro` + pagine sotto `/bozza-imc`. È il marchio "IMC Finanziamenti", gestito da Alberto come sandbox cliente. I token sono completamente diversi:

```
--color-primary: #3415FF
--color-accent: #FF5613
--max-width: 1200px
--radius: 16px
font-family: 'Open Sans', sans-serif
```

Pagine taggate `noindex`. Il design IMC non deve essere confuso con MCF, vive nello stesso repo per comodità di deploy ma non condivide nulla a livello di design tokens. Segnalato qui perché chi apre il repo per la prima volta rischia di pensare che ci siano due brand sovrapposti. Non è così: MCF è il brand del sito, IMC è una sandbox separata.

## Incoerenze da sistemare

Elenco operativo, in ordine di impatto sul brand.

1. Dark gradient fuori brand. `#1e1b3a → #2d2556 → #1a1640` usato in HowItWorks, chi-siamo e altre sezioni non è nel brand book. Opzioni: a) sostituire con Rich Black #0F1020 secco come prescrive il brand; b) codificare il gradient come token `--mcf-dark-gradient` e aggiornare il brand book per legittimarlo. Decisione di brand, non tecnica.

2. Doppio namespace token. `--color-*` e `--mcf-*` convivono. Serve mapping esplicito in un unico posto e un piano di migrazione. Vedi roadmap.

3. `--color-primary-dark` divergente tra `Layout.astro` (#0F1020) e `ToolLayout.astro` (#061237). Da uniformare a #0F1020. Se `#061237` serve davvero per i grafici, farlo diventare `--mcf-chart-dark` dichiarato esplicitamente.

4. Verdi Tailwind hardcoded in `simulatore-noleggio.css`. Sostituire con `--mcf-success` + derivati background/border coerenti.

5. `#FFF5F0` in Hero. Decidere se entra nel brand come "warm neutral" (e allora codificarlo) o se si sostituisce con Ghost White / Pale Dogwood del brand book.

6. `#f5fbff` fallback di `--color-bg-alt` in `PartnerLogos.astro`. Sostituire con `#F8F7F9` (valore reale del token) o rimuovere il fallback.

7. `#4A36A0` nel gradient del result card sabatini. Sostituire con una tinta viola già in sistema (es. `--color-primary` scuro calcolato) o dichiarare un nuovo token.

8. Pattern card duplicato in almeno 6 posti. Estrarre `Card.astro` con prop `variant` per gestire le micro-varianti.

9. CTA bottone duplicato in ogni componente. Estrarre `Button.astro` con `variant: primary | outline | ghost` e `size: sm | md | lg`.

10. Eyebrow con tre nomi classe diversi (`.eyebrow`, `.section-eyebrow`, `.hero-eyebrow`). Consolidare su `.eyebrow` e cancellare gli altri.

11. Stats band non componentizzata. Estrarre `StatsBand.astro` con prop `items: Stat[]` dove `Stat = { value: number, label: string, suffix?: string }`.

12. Accessibilità arancio: il brand prescrive #D45A2E per testi lunghi, il codice usa ovunque #FE6F3A. Introdurre `--color-accent-text` e applicarlo a tutto ciò che è runs di testo (non a pill, badge, CTA).

13. Favicon / monogramma MCF assente come componente. Aggiungere `MonogramMCF.astro` con varianti per avatar social e PWA icon.

14. `prefers-reduced-motion` non gestito. Aggiungere media query globale che disabilita stagger e fade-in per chi ha ridotto il movimento.

15. Numero "operatori" (12) hardcoded in più punti. Centralizzare in `src/data/brand-constants.ts` per evitare disallineamenti futuri.

## Lacune

Cose che non ci sono ancora e che il design system dovrebbe avere:

- Token scale spacing (`--space-1 … --space-10` oppure semantici `--space-xs / sm / md / lg / xl`).
- Token scale typography (h1 / h2 / h3 / body / small / eyebrow) con mobile e desktop.
- Token shadow (sm / md / cta).
- Token duration animazioni (`--dur-fast / base / slow`) + easing dichiarate.
- Component library di base: `Button`, `Card`, `Eyebrow`, `StatsBand`, `SectionTitle`.
- Storybook o equivalente leggero. Anche solo una pagina `/design-system` nascosta da noindex che mostri tutti i componenti e i token.
- Test di accessibilità automatico su build (assenza, il sito è stato auditato a mano).
- Plan per dark mode. Oggi nessun componente lo supporta. Non è prioritario ma va deciso se entra in roadmap o resta fuori scope.
- Variante scura dell'arancio `#D45A2E` come token (vedi incoerenza 12).
- Pattern di empty state, loading state, error state per i tool. Alcuni tool hanno stati vuoti incoerenti tra loro.
- Documentazione inline dei tool. Ogni tool ha ipotesi normative (tassi, coefficienti, soglie) che cambiano nel tempo. Oggi sono nel codice senza link al contesto di riferimento.

## Roadmap di riconciliazione

Tappe ordinate. Ogni tappa è fattibile in una sessione di lavoro, con commit atomico.

**Tappa 1: Mapping dei token.** Aggiungere in testa a `Layout.astro` un commento che documenta la relazione tra `--color-*` (legacy) e `--mcf-*` (target). Nessuna rimozione, solo chiarezza su chi è cosa. Questo sblocca la tappa 2.

**Tappa 2: Token mancanti.** Aggiungere `--mcf-space-*`, `--mcf-radius-*`, `--mcf-shadow-*`, `--mcf-dur-*` nel blocco `:root`. Non toccare i componenti esistenti. I nuovi componenti nascono con i nuovi token.

**Tappa 3: Componenti base.** Creare `src/components/ui/Button.astro`, `Card.astro`, `Eyebrow.astro`, `StatsBand.astro`, `SectionTitle.astro`. Coprire i casi d'uso attuali leggendo i componenti esistenti. Non sostituire niente ancora.

**Tappa 4: Migrazione progressiva.** Un componente alla volta, sostituire il CSS inline con l'uso dei componenti base. Partire dalle landing dinamiche (alto impatto, pattern ripetuti). Ogni migrazione è un PR separato.

**Tappa 5: Fix incoerenze palette.** Sistemare i punti 3, 4, 5, 6, 7 della sezione incoerenze. Sono fix puntuali, possono andare in un unico PR.

**Tappa 6: Dark section.** Decisione di brand (Alberto + eventuale consulente). Se si tiene il gradient, codificarlo come token. Se si torna al Rich Black, sostituire ovunque.

**Tappa 7: Deprecazione legacy.** Quando tutti i componenti usano `--mcf-*`, aggiungere un commento `@deprecated` nei vecchi `--color-*`. Rimozione definitiva al giro successivo.

**Tappa 8: Accessibilità e reduced motion.** Fix punto 12 e 14 della sezione incoerenze. Aggiungere un minimo di test manuale con VoiceOver.

**Tappa 9: Componenti pagina interna.** `/design-system` nascosta, mostra tutti i componenti e tutti i token. Utile per onboarding di collaboratori esterni e per confronti visivi con il brand book.

## Come tenere aggiornato questo file

Regola semplice: chi tocca un pattern grafico o introduce un colore nuovo, aggiorna DESIGN.md nello stesso commit. Se il pattern è già nel brand book, vive lì. Se è implementativo (scala di spacing, naming componenti, pattern di layout), vive qui. Se non è né carne né pesce, si decide con Alberto a quale dei due appartiene.

Fonte di verità di brand: `~/Desktop/_AI/knowledge/reference/mediocredito-facile/brand/brand-guidelines.md`. Fonte di verità di implementazione: questo file. Le due documentazioni non si sostituiscono e non si contraddicono, si completano.
