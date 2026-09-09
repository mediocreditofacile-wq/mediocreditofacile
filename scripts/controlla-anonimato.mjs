#!/usr/bin/env node
/**
 * Cerca nomi di clienti reali nei testi pubblici del sito.
 *
 *   npm run controlla:anonimato
 *
 * I casi raccontati sul sito vengono da pratiche vere, e la regola è che il
 * cliente non si nomina mai senza il suo consenso scritto. La regola da sola si
 * dimentica: questo confronta i testi pubblicati con i nomi che stanno nelle
 * cartelle clienti e nell'anagrafica, e segnala le corrispondenze.
 *
 * Non camuffare il solo nome del cliente: in una pratica identificano anche il
 * fornitore, il modello del bene con la matricola, il numero di contratto e la
 * società finanziaria. Quelli il confronto automatico non li vede, li vede solo
 * chi scrive.
 *
 * Uscita 1 se trova qualcosa, così si può mettere in una verifica pre-deploy.
 */

import { readFileSync, readdirSync, existsSync, statSync } from 'node:fs';
import { join, extname } from 'node:path';
import { homedir } from 'node:os';

const RADICE = new URL('..', import.meta.url).pathname;
const CARTELLA_CLIENTI = join(homedir(), 'Desktop', 'PROGETTI', 'Clienti');
const ANAGRAFICA = join(homedir(), 'Desktop', '_AI', 'knowledge', 'reference', 'anagrafica-clienti-fornitori.md');

// Nomi troppo corti o troppo comuni darebbero solo falsi allarmi.
const MINIMO_CARATTERI = 5;
const PAROLE_COMUNI = new Set([
  'gruppo', 'group', 'italia', 'service', 'servizi', 'impianti', 'energia',
  'solution', 'solutions', 'sistemi', 'costruzioni', 'immobiliare', 'consulting',
  'srl', 'srls', 'spa', 'snc', 'sas', 'società', 'societa', 'azienda', 'nuova',
  'centro', 'studio', 'tecnologie', 'lavorazione', 'commerciale', 'agricola',
  // Nomi di cartella che coincidono con parole del mestiere, mestieri, citta'
  // o nomi propri: darebbero un allarme a ogni articolo e coprirebbero i veri.
  'tappezzeria', 'caseifici', 'caseificio', 'master', 'perse', 'terzo', 'settore',
  'cremona', 'privati', 'contenzioso', 'fotovoltaico', 'pratica', 'pratiche',
  // I nomi di battesimo senza cognome sono ammessi nei racconti (vedi CLAUDE.md),
  // e come nomi di cartella scatterebbero su meta' degli articoli.
  'massimiliano', 'gianluca', 'giovanni', 'paolo', 'luigi', 'antonio', 'michele',
]);

/** Il nome è utilizzabile come spia solo se ha una parte distintiva. */
function nomeUtile(nome) {
  const pulito = nome.replace(/\b(s\.?r\.?l\.?s?|s\.?p\.?a\.?|s\.?n\.?c\.?|s\.?a\.?s\.?)\b/gi, '').trim();
  if (pulito.length < MINIMO_CARATTERI) return null;
  const distintive = pulito
    .split(/[\s,._-]+/)
    .filter((w) => w.length >= MINIMO_CARATTERI && !PAROLE_COMUNI.has(w.toLowerCase()));
  return distintive.length ? pulito : null;
}

function nomiClienti() {
  const nomi = new Set();
  if (existsSync(CARTELLA_CLIENTI)) {
    for (const voce of readdirSync(CARTELLA_CLIENTI)) {
      if (voce.startsWith('.')) continue;
      if (!statSync(join(CARTELLA_CLIENTI, voce)).isDirectory()) continue;
      // "Cognome - Attività" e "Nome : Referente": la parte prima del separatore è la ragione sociale
      const base = voce.split(/\s+[-:]\s+/)[0];
      const utile = nomeUtile(base);
      if (utile) nomi.add(utile);
    }
  }
  if (existsSync(ANAGRAFICA)) {
    for (const riga of readFileSync(ANAGRAFICA, 'utf-8').split('\n')) {
      if (!riga.startsWith('### ')) continue;
      const base = riga.slice(4).split(/\s+[—–-]\s+|\s*\[|\s*\(/)[0];
      const utile = nomeUtile(base);
      if (utile) nomi.add(utile);
    }
  }
  return [...nomi];
}

/** File pubblici: articoli, pagine, dati che finiscono in pagina. */
function filePubblici(dir, out = []) {
  for (const voce of readdirSync(dir)) {
    const p = join(dir, voce);
    if (statSync(p).isDirectory()) filePubblici(p, out);
    else if (['.md', '.astro', '.ts'].includes(extname(voce))) out.push(p);
  }
  return out;
}

const nomi = nomiClienti();
if (!nomi.length) {
  console.error('Nessun nome cliente trovato: le cartelle di riferimento non sono su questa macchina.');
  process.exit(0);
}

// Solo i testi editoriali. Le pagine dei portali partner e le loro API nominano
// il partner per forza — e' il suo portale — quindi qui farebbero solo rumore e
// coprirebbero i nomi che invece non dovrebbero esserci.
const ESCLUSI = [join('src', 'pages', 'tools'), join('src', 'pages', 'api')];

const file = [
  ...filePubblici(join(RADICE, 'src', 'content', 'blog')),
  ...filePubblici(join(RADICE, 'src', 'pages')),
  join(RADICE, 'src', 'data', 'territori.ts'),
  join(RADICE, 'public', 'llms.txt'),
].filter((f) => existsSync(f) && !ESCLUSI.some((e) => f.includes(e)));

// I partner citati con il loro consenso non sono una violazione: si dichiarano qui.
const AUTORIZZATI = [
  'Arca Energia', // consenso del partner, 09/09/2026
  'Marotta Evolution',
  'Marotta',
  'Affida', // il mediatore di cui MCF e' collaboratore: va nominato
  'Pagarent',
  'Ambico Group',
  'The Campus', // progetto di Alberto, non un cliente
];

const trovati = [];
for (const f of file) {
  const testo = readFileSync(f, 'utf-8');
  for (const nome of nomi) {
    if (AUTORIZZATI.some((a) => a.toLowerCase() === nome.toLowerCase())) continue;
    const re = new RegExp(`(^|[^\\p{L}])${nome.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}([^\\p{L}]|$)`, 'iu');
    if (re.test(testo)) trovati.push({ file: f.replace(RADICE, ''), nome });
  }
}

if (!trovati.length) {
  console.log(`Nessun nome di cliente nei testi pubblici (${nomi.length} nomi controllati su ${file.length} file).`);
  process.exit(0);
}

console.log(`Nomi di clienti trovati nei testi pubblici (${trovati.length}):\n`);
for (const t of trovati) console.log(`  ${t.nome}\n    in ${t.file}`);
console.log('\nVerifica ogni riga: se è un cliente, va camuffato. Se è un partner che ha dato');
console.log("il consenso, aggiungilo alla lista AUTORIZZATI in cima a questo script.");
process.exit(1);
