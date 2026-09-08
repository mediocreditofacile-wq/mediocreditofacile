// Report HTML del giro di monitoraggio. Stile da DESIGN-MCF.md, variante arancio.

const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const perc = (n, d) => (d === 0 ? 0 : Math.round((n / d) * 100));

function esitoBreve(e) {
  if (!e) return { testo: 'errore', classe: 'ko' };
  if (!e.citato) return { testo: 'assente', classe: 'ko' };
  if (e.raccomandato) return { testo: `consigliato${e.posizione ? ` (${e.posizione}°)` : ''}`, classe: 'ok' };
  return { testo: 'citato', classe: 'mezzo' };
}

export function generaReport({ marchio, dominio, data, motori, righe }) {
  // Punteggio per motore: percentuale di domande in cui il marchio compare e in cui è consigliato.
  const punteggi = motori.map((m) => {
    const esiti = righe.map((r) => r.esiti[m.id]).filter(Boolean);
    const citati = esiti.filter((e) => e.citato).length;
    const consigliati = esiti.filter((e) => e.raccomandato).length;
    return { ...m, totale: esiti.length, citati, consigliati, visibilita: perc(citati, esiti.length) };
  });

  // I concorrenti che occupano il posto della risposta, contati su tutti i motori.
  const conteggio = new Map();
  for (const r of righe)
    for (const m of motori)
      for (const c of r.esiti[m.id]?.concorrenti || []) {
        const k = c.trim();
        if (k) conteggio.set(k, (conteggio.get(k) || 0) + 1);
      }
  const concorrenti = [...conteggio.entries()].sort((a, b) => b[1] - a[1]).slice(0, 15);

  const errori = righe.flatMap((r) =>
    motori
      .filter((m) => r.esiti[m.id]?.errori && r.esiti[m.id]?.citato)
      .map((m) => ({ motore: m.nome, domanda: r.testo, errore: r.esiti[m.id].errori }))
  );

  const categorie = [...new Set(righe.map((r) => r.categoria))];

  return `<!doctype html>
<html lang="it"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Visibilità AI — ${esc(marchio)} — ${esc(data)}</title>
<link href="https://fonts.googleapis.com/css2?family=Manrope:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<style>
:root{--mcf-primary:#FE6F3A;--mcf-accent:#664CCD;--mcf-platinum:#E1DEE3;--mcf-black:#0F1020;--mcf-charcoal:#444451;--mcf-taupe:#787782}
*{box-sizing:border-box}
body{margin:0;background:#fff;font-family:'Manrope',system-ui,sans-serif;color:var(--mcf-charcoal);font-size:16px;line-height:1.6}
.wrap{max-width:1200px;margin:0 auto;padding:48px 24px 96px}
.eyebrow{font-size:.75rem;font-weight:600;letter-spacing:.08em;text-transform:uppercase;color:var(--mcf-accent);margin:0 0 8px}
h1{font-size:2rem;font-weight:800;line-height:1.15;letter-spacing:-.02em;color:var(--mcf-primary);margin:0 0 12px}
h2{font-size:1.5rem;font-weight:700;line-height:1.25;letter-spacing:-.01em;color:var(--mcf-primary);margin:48px 0 16px}
h3{font-size:1.25rem;font-weight:600;color:var(--mcf-black);margin:32px 0 8px}
p{max-width:68ch}
.lead{font-size:1.125rem;font-weight:500}
.nota{font-size:.875rem;color:var(--mcf-taupe)}
.griglia{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:24px;margin:24px 0}
.card{background:#fff;border:1px solid var(--mcf-platinum);border-radius:16px;padding:24px}
.card .cifra{font-size:3rem;font-weight:800;line-height:1.1;color:var(--mcf-primary);font-variant-numeric:tabular-nums}
.card .sotto{font-size:.875rem;color:var(--mcf-taupe)}
table{width:100%;border-collapse:collapse;margin:16px 0;font-size:.9375rem}
th{background:var(--mcf-primary);color:#fff;font-weight:600;font-size:.75rem;letter-spacing:.05em;text-transform:uppercase;text-align:left;padding:10px 12px}
td{padding:10px 12px;border-bottom:1px solid var(--mcf-platinum);vertical-align:top}
tbody tr:nth-child(even){background:#faf9fb}
td.num{text-align:right;font-variant-numeric:tabular-nums}
.ok{color:#1f6b3a;font-weight:600}
.mezzo{color:#8a5a12;font-weight:600}
.ko{color:var(--mcf-taupe)}
.hero{background:linear-gradient(135deg,#FE6F3A,#664CCD);color:#fff;border-radius:16px;padding:32px;margin-bottom:48px}
.hero h1,.hero .eyebrow{color:#fff}
.hero p{margin-bottom:0;opacity:.95}
footer{border-top:2px solid var(--mcf-accent);margin-top:96px;padding-top:16px;font-size:.875rem;color:var(--mcf-taupe)}
</style></head><body><div class="wrap">

<div class="hero">
<p class="eyebrow">Monitoraggio visibilità sugli assistenti AI</p>
<h1>${esc(marchio)}</h1>
<p>${righe.length} domande di intento d'acquisto, ${motori.length} ${motori.length === 1 ? 'motore interrogato' : 'motori interrogati'} con ricerca web attiva. Giro del ${esc(data)}.</p>
</div>

<h2>Il punteggio</h2>
<p>Visibilità è la quota di domande in cui il marchio compare nella risposta. Consigliato è il sottoinsieme in cui viene indicato come opzione da contattare, non solo nominato di passaggio.</p>
<div class="griglia">
${punteggi
  .map(
    (p) => `<div class="card">
<p class="eyebrow">${esc(p.nome)}</p>
<div class="cifra">${p.visibilita}%</div>
<p class="sotto">citato in ${p.citati} domande su ${p.totale}, consigliato in ${p.consigliati}</p>
</div>`
  )
  .join('\n')}
</div>

<h2>Domanda per domanda</h2>
${categorie
  .map(
    (cat) => `<h3>${esc(cat)}</h3>
<table><thead><tr><th style="width:44%">Domanda</th>${motori.map((m) => `<th>${esc(m.nome)}</th>`).join('')}<th>Cosa risponde</th></tr></thead><tbody>
${righe
  .filter((r) => r.categoria === cat)
  .map((r) => {
    const primo = motori.map((m) => r.esiti[m.id]).find((e) => e && e.sintesi);
    return `<tr><td>${esc(r.testo)}</td>${motori
      .map((m) => {
        const e = esitoBreve(r.esiti[m.id]);
        return `<td class="${e.classe}">${esc(e.testo)}</td>`;
      })
      .join('')}<td class="nota">${esc(primo?.sintesi || '')}</td></tr>`;
  })
  .join('\n')}
</tbody></table>`
  )
  .join('\n')}

<h2>Chi occupa il tuo posto</h2>
<p>I soggetti nominati dagli assistenti nelle risposte alle stesse domande, per numero di apparizioni.</p>
<table><thead><tr><th>Soggetto</th><th style="width:120px">Apparizioni</th></tr></thead><tbody>
${concorrenti.map(([nome, n]) => `<tr><td>${esc(nome)}</td><td class="num">${n}</td></tr>`).join('\n')}
</tbody></table>

${
  errori.length
    ? `<h2>Confusioni sul marchio</h2>
<p>Risposte in cui il marchio è stato descritto male o scambiato per un altro soggetto.</p>
<table><thead><tr><th style="width:110px">Motore</th><th style="width:38%">Domanda</th><th>Errore</th></tr></thead><tbody>
${errori.map((e) => `<tr><td>${esc(e.motore)}</td><td>${esc(e.domanda)}</td><td>${esc(e.errore)}</td></tr>`).join('\n')}
</tbody></table>`
    : ''
}

<footer>
Mediocredito Facile | mediocreditofacile.it | +39 393 995 7840 | mediocreditofacile@gmail.com<br>
Collaboratore del Mediatore Affida — Iscrizione OAM M325<br>
Dominio monitorato: ${esc(dominio)}. Report generato da scripts/visibilita-ai.
</footer>
</div></body></html>`;
}
