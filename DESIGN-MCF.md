# DESIGN.md — Mediocredito Facile

Design system per qualsiasi interfaccia digitale MCF: siti, landing page, PWA, dashboard, artifact HTML/React, tool interni, e i report HTML in `~/Desktop/_AI/output/report/`.

**Istruzione per l'AI:** usa questo file come unica fonte di verità per lo styling. Non inventare colori, font, spaziature o componenti che non siano qui dentro. Se serve qualcosa che non è previsto, derivalo dai token esistenti, non da default generici.

---

## 1. Varianti

Due varianti, stessa palette, ruoli invertiti.

- **Arancio** (default). Arancio dominante, viola accento. Uso: sito pubblico, landing, materiali commerciali, tool cliente.
- **Viola** (istituzionale). Viola dominante, arancio accento. Uso: documenti e interfacce investor-facing, The Campus, contesti freddi.

Se non specificato, usa Arancio.

---

## 2. Token colore

```css
:root {
  /* Core */
  --mcf-orange:    #FE6F3A;  /* Orange Crayola */
  --mcf-violet:    #664CCD;  /* Iris */

  /* Ruoli — variante ARANCIO (default) */
  --mcf-primary:   #FE6F3A;
  --mcf-accent:    #664CCD;

  /* Superfici */
  --mcf-melon:     #F0A78F;  /* sfondo caldo leggero, sidebar */
  --mcf-dogwood:   #E9C3B9;  /* sezioni alternate */
  --mcf-platinum:  #E1DEE3;  /* righe alterne, divider, superfici neutre */
  --mcf-surface:   #FFFFFF;

  /* Testo */
  --mcf-black:     #0F1020;  /* Rich Black — titoli minori, testo forte */
  --mcf-charcoal:  #444451;  /* corpo del testo */
  --mcf-taupe:     #787782;  /* secondario, didascalie, footer */

  /* Gradient */
  --mcf-gradient:  linear-gradient(135deg, #FE6F3A, #664CCD);
}

/* Variante VIOLA: inverti i due ruoli, il resto resta identico */
[data-theme="mcf-violet"] {
  --mcf-primary: #664CCD;
  --mcf-accent:  #FE6F3A;
}
```

**Regole ferree**

- Mai nero puro `#000000`. Il nero è `#0F1020`.
- Mai grigi di sistema (`#333`, `#666`, `#999`). Usa charcoal / taupe / platinum.
- Il gradient si usa una volta sola per schermata, su un elemento solo (hero, copertina, card principale). Mai su testo di corpo, mai su più elementi contemporaneamente.
- Arancio e viola non si toccano mai direttamente senza uno spazio bianco in mezzo, tranne dentro il gradient.
- Nessun colore semantico inventato: successo, errore e warning si derivano scurendo/schiarendo i token esistenti, oppure si comunicano con testo e icona, non con verde/rosso da bootstrap.

---

## 3. Tipografia

Font unico: **Manrope**.

```css
@import url('https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap');
font-family: 'Manrope', system-ui, -apple-system, sans-serif;
```

Scala (base 16px, rapporto 1.25):

| Elemento | Peso | Size | Line-height | Letter-spacing | Colore |
|---|---|---|---|---|---|
| Display / Hero | 800 | 3rem (48px) | 1.1 | -0.02em | `--mcf-primary` |
| H1 | 800 | 2rem (32px) | 1.15 | -0.02em | `--mcf-primary` |
| H2 | 700 | 1.5rem (24px) | 1.25 | -0.01em | `--mcf-primary` |
| H3 | 600 | 1.25rem (20px) | 1.35 | 0 | `--mcf-black` |
| Corpo | 400 | 1rem (16px) | 1.6 | 0 | `--mcf-charcoal` |
| Corpo lead | 500 | 1.125rem (18px) | 1.55 | 0 | `--mcf-charcoal` |
| Small / nota | 400 | 0.875rem (14px) | 1.5 | 0 | `--mcf-taupe` |
| Label / eyebrow | 600 | 0.75rem (12px) | 1.4 | 0.08em, uppercase | `--mcf-accent` |

**Regole**

- Misura di riga: 60-75 caratteri. Su desktop `max-width: 68ch` per i blocchi di testo.
- Un solo peso 800 per schermata. L'ExtraBold è l'accento tipografico, non la norma.
- Niente testo in maiuscolo oltre le label/eyebrow.
- Niente corsivo per enfasi: usa il peso 600.

---

## 4. Spaziatura, raggi, ombre

Scala a 4px. Usa solo questi valori.

```css
--space-1: 4px;   --space-2: 8px;   --space-3: 12px;
--space-4: 16px;  --space-6: 24px;  --space-8: 32px;
--space-12: 48px; --space-16: 64px; --space-24: 96px;
```

- Padding sezione desktop: `96px` verticale. Mobile: `48px`.
- Gap tra card in griglia: `24px`.
- Padding interno card: `24px` (o `32px` per card principale).

```css
--radius-sm: 6px;    /* input, badge, tag */
--radius-md: 10px;   /* bottoni, card */
--radius-lg: 16px;   /* card grandi, modali, hero */
--radius-full: 999px;
```

Ombre: quasi mai. Il brand lavora per linee e superfici piatte, non per elevazione.

```css
--shadow-sm: 0 1px 2px rgba(15, 16, 32, 0.06);
--shadow-md: 0 4px 16px rgba(15, 16, 32, 0.08);
```

Se una card ha bisogno di staccarsi, usa `1px solid var(--mcf-platinum)` prima di usare un'ombra.

---

## 5. Componenti

**Bottone primario.** Fondo `--mcf-primary`, testo bianco, peso 600, radius `--radius-md`, padding `12px 24px`. Hover: luminosità -8%, nessun cambio di dimensione. Nessuna ombra, nessun gradient.

**Bottone secondario.** Fondo trasparente, bordo `1.5px solid var(--mcf-primary)`, testo `--mcf-primary`. Hover: fondo `--mcf-primary` a 8% di opacità.

**Bottone terziario.** Solo testo in `--mcf-accent`, peso 600, underline in hover.

**Link inline.** Colore `--mcf-accent`, underline con `text-underline-offset: 3px`.

**Card.** Fondo bianco, bordo `1px solid var(--mcf-platinum)`, radius `--radius-lg`, padding `24px`. Se è la card in evidenza: bordo `1.5px solid var(--mcf-primary)` e basta. Niente scale al hover, niente lift.

**Tabella.** Header: fondo `--mcf-primary`, testo bianco, peso 600, uppercase 12px. Righe alterne: bianco / `--mcf-platinum`. Divider orizzontali `1px solid var(--mcf-platinum)`, nessun bordo verticale.

**Bullet e frecce.** Colore `--mcf-accent`. Mai emoji, mai icone decorative senza funzione.

**Input.** Bordo `1px solid var(--mcf-platinum)`, radius `--radius-sm`, padding `10px 14px`. Focus: bordo `--mcf-primary`, nessun glow, nessun `box-shadow` colorato.

**Divider.** `1px solid var(--mcf-platinum)`. Il divider viola `2px --mcf-accent` è riservato a header e footer di documento.

**Icone.** Lucide, stroke 1.5, dimensione 20px, colore `--mcf-accent` o `currentColor`. Mai icone piene.

**Numeri e cifre.** Nelle tabelle finanziarie usa `font-variant-numeric: tabular-nums`. Importi allineati a destra, sempre. Formato italiano: 12.500,00 euro.

---

## 6. Layout

- Container max `1200px`, padding laterale `24px`.
- Griglia a 12 colonne, gap `24px`.
- Un'idea per sezione. Se una sezione ha due messaggi, sono due sezioni.
- Whitespace generoso: se sei in dubbio tra più contenuto e più aria, scegli l'aria.

---

## 7. Tono e contenuto

Il linguaggio fa parte del design system. Coerente con `_AI/chi-sono/anti-ai-style.md`.

- Prosa in frasi brevi, diretta, professionale. Niente iperboli, niente markettaro.
- Zero emoji, in qualsiasi contesto.
- Niente "rivoluziona", "sblocca il tuo potenziale", "trasforma il tuo business", "soluzioni innovative".
- Numeri concreti al posto degli aggettivi: non "risparmio significativo" ma "3.400 euro l'anno".
- CTA verbali e specifiche: "Calcola la rata", "Richiedi la simulazione". Mai "Scopri di più", mai "Inizia ora".

---

## 8. Anti-pattern — cose che fanno sembrare il sito generato da un'AI

Vietati esplicitamente:

- Gradient viola-blu di fondo pagina, glassmorphism, blur decorativi.
- Card con hover che si ingrandiscono o si sollevano.
- Hero centrato con sottotitolo grigio e due bottoni affiancati.
- Griglia di tre card identiche con icona colorata dentro un cerchio pastello.
- Emoji come icone di sezione.
- Badge "✨ AI-powered" o simili.
- Font di sistema al posto di Manrope.
- Ombre diffuse e colorate.
- Animazioni al caricamento su ogni elemento.
- Testo grigio chiaro su bianco sotto il rapporto di contrasto 4.5:1.

---

## 9. Footer standard

```
Mediocredito Facile | mediocreditofacile.it | +39 393 995 7840 | mediocreditofacile@gmail.com
Collaboratore del Mediatore Affida — Iscrizione OAM M325
```

Linea viola `--mcf-accent` sopra il footer. Testo in `--mcf-taupe`, 14px.

**Eccezione:** sui materiali Affida (relazioni di presentazione, segnalazioni) non va applicato alcun branding MCF. Il firewall MCF/Affida resta inviolabile.

---

## 10. Loghi

Da `assets/logos/` della skill `brand-mcf`:

| File | Uso |
|---|---|
| `logo_circle_small.png` | Header, 40x40 |
| `logo_circle.png` | Versione grande del tondo |
| `logo_gradient_square.png` | Copertine, hero, slide titolo |
| `logo_white_vertical.png` | Su sfondi scuri |
| `logo_white_horizontal.png` | Footer su fondo scuro |

Il logo non si ricolora, non si ruota, non si mette dentro forme. Area di rispetto minima intorno al logo: pari all'altezza del logo diviso due.

---

## 11. Accessibilità

- Contrasto minimo 4.5:1 sul testo. `--mcf-taupe` su bianco è al limite: usalo solo per testo ≥14px.
- Arancio `#FE6F3A` su bianco non passa per testo piccolo. Va bene per titoli ≥24px e per fondi con testo bianco sopra. Per testo di corpo colorato usa `--mcf-accent`.
- Focus visibile sempre: `outline: 2px solid var(--mcf-accent); outline-offset: 2px`.
