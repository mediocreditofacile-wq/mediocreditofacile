#!/usr/bin/env node
// Misura la visibilità del marchio sugli assistenti AI.
//
//   ANTHROPIC_API_KEY=... node scripts/visibilita-ai/monitor.mjs
//   node scripts/visibilita-ai/monitor.mjs --categoria Fotovoltaico   (solo una categoria)
//   node scripts/visibilita-ai/monitor.mjs --limite 5                 (prova rapida)
//   node scripts/visibilita-ai/monitor.mjs --report risultati/2026-09-08.json
//                                          (rigenera solo l'HTML da un giro gia' fatto)
//
// Chiavi lette dall'ambiente: ANTHROPIC_API_KEY (obbligatoria, serve anche al
// classificatore), OPENAI_API_KEY e GEMINI_API_KEY facoltative. Ogni motore
// senza chiave viene saltato.

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';
import { MOTORI, motoriDisponibili } from './motori.mjs';
import { classifica } from './analisi.mjs';
import { generaReport } from './report.mjs';

const QUI = dirname(fileURLToPath(import.meta.url));
const CARTELLA_REPORT = join(homedir(), 'Desktop', '_AI', 'output', 'report');
const PARALLELE = 3; // le API hanno limiti di frequenza: meglio poche richieste per volta

function argomento(nome) {
  const i = process.argv.indexOf(`--${nome}`);
  return i === -1 ? null : process.argv[i + 1];
}

// Esegue i lavori a gruppi invece che tutti insieme.
async function aPool(elementi, n, lavoro) {
  const esiti = [];
  for (let i = 0; i < elementi.length; i += n) {
    esiti.push(...(await Promise.all(elementi.slice(i, i + n).map(lavoro))));
  }
  return esiti;
}

// Rigenerazione dell'HTML da dati gia' raccolti: cambiare il report non deve costare un altro giro.
function soloReport(percorso) {
  const config = JSON.parse(readFileSync(join(QUI, 'domande.json'), 'utf-8'));
  const giro = JSON.parse(readFileSync(percorso, 'utf-8'));
  const motori = MOTORI.filter((m) => giro.motori.includes(m.id));
  mkdirSync(CARTELLA_REPORT, { recursive: true });
  const html = join(CARTELLA_REPORT, `visibilita-ai-${giro.data}.html`);
  writeFileSync(html, generaReport({ marchio: config.marchio, dominio: config.dominio, data: giro.data, motori, righe: giro.righe }));
  console.log(`Report: ${html}`);
}

async function main() {
  const rigenera = argomento('report');
  if (rigenera) return soloReport(rigenera);

  if (!process.env.ANTHROPIC_API_KEY) {
    console.error('Manca ANTHROPIC_API_KEY: serve sia per interrogare Claude sia per classificare le risposte.');
    process.exit(1);
  }

  const config = JSON.parse(readFileSync(join(QUI, 'domande.json'), 'utf-8'));
  const motori = motoriDisponibili();
  if (!motori.length) {
    console.error('Nessun motore disponibile.');
    process.exit(1);
  }

  let domande = config.domande;
  const cat = argomento('categoria');
  if (cat) domande = domande.filter((d) => d.categoria.toLowerCase() === cat.toLowerCase());
  const limite = argomento('limite');
  if (limite) domande = domande.slice(0, Number(limite));

  console.log(`Motori: ${motori.map((m) => m.nome).join(', ')}`);
  console.log(`Domande: ${domande.length}\n`);

  const righe = await aPool(domande, PARALLELE, async (d) => {
    const esiti = {};
    for (const motore of motori) {
      try {
        const { testo, fonti } = await motore.chiedi(d.testo);
        const esito = await classifica({
          marchio: config.marchio,
          dominio: config.dominio,
          domanda: d.testo,
          risposta: testo,
        });
        // Se il motore ha letto il nostro sito lo sappiamo dalle fonti, non dal testo.
        esito.fonti_nostre = fonti.filter((u) => u.includes(config.dominio));
        esito.risposta = testo;
        esiti[motore.id] = esito;
        const segno = esito.raccomandato ? 'consigliato' : esito.citato ? 'citato' : 'assente';
        console.log(`  ${d.id} ${motore.nome.padEnd(8)} ${segno}`);
      } catch (err) {
        console.log(`  ${d.id} ${motore.nome.padEnd(8)} ERRORE ${err.message.slice(0, 120)}`);
        esiti[motore.id] = null;
      }
    }
    return { ...d, esiti };
  });

  const data = new Date().toISOString().slice(0, 10);

  mkdirSync(join(QUI, 'risultati'), { recursive: true });
  const grezzo = join(QUI, 'risultati', `${data}.json`);
  writeFileSync(grezzo, JSON.stringify({ data, marchio: config.marchio, motori: motori.map((m) => m.id), righe }, null, 2));

  mkdirSync(CARTELLA_REPORT, { recursive: true });
  const html = join(CARTELLA_REPORT, `visibilita-ai-${data}.html`);
  writeFileSync(html, generaReport({ marchio: config.marchio, dominio: config.dominio, data, motori, righe }));

  const citate = righe.filter((r) => motori.some((m) => r.esiti[m.id]?.citato)).length;
  console.log(`\nCitato in ${citate} domande su ${righe.length} da almeno un motore.`);
  console.log(`Dati grezzi: ${grezzo}`);
  console.log(`Report: ${html}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
