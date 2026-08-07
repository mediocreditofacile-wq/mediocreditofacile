// Puller delle pratiche dai portali partner (Full Service, Stilo, Expo Energia).
// Legge lo store Vercel Blob privato "mcf-pratiche", e per ogni pratica NUOVA:
//  - crea la cartella cliente sotto la destinazione (default PROGETTI/Clienti)
//  - scarica dentro tutti i documenti con i nomi originali
//  - scrive una SCHEDA_PORTALE.md con i dati della pratica
//  - segna la pratica come processata in un file di stato (niente doppioni)
//
// Uso:
//   node scripts/pull-pratiche-portali.mjs [--slug full-service] [--dest <path>] [--json]
// Richiede BLOB_READ_WRITE_TOKEN nell'ambiente (source .env.local).
// Stampa a fine run un riepilogo JSON delle pratiche nuove (per lo scheduler).

import { list } from '@vercel/blob';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const args = process.argv.slice(2);
const getArg = (name, def) => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && args[i + 1] ? args[i + 1] : def;
};
const slugFilter = getArg('slug', null);
const destBase = getArg('dest', join(homedir(), 'Desktop', 'PROGETTI', 'Clienti'));
const jsonOut = args.includes('--json');
const token = process.env.BLOB_READ_WRITE_TOKEN;

if (!token) {
  console.error('BLOB_READ_WRITE_TOKEN mancante. Esegui: set -a; source .env.local; set +a');
  process.exit(1);
}

const statePath = join(destBase, '.pratiche-portali-state.json');
const log = (...m) => { if (!jsonOut) console.log(...m); };

// Nome cartella leggibile dalla ragione sociale: taglia le forme giuridiche
// e mette in Title Case tenendo gli apostrofi (D'AURIA -> D'Auria).
function nomeCartella(ragione) {
  // Taglia le forme giuridiche estese e siglate. Gestisce sia gli accenti
  // (società, responsabilità) sia le varianti con apostrofo (SOCIETA', RESPONSABILITA').
  let s = (ragione || 'Cliente senza nome')
    .replace(/societ[aà]'?\s+a\s+responsabilit[aà]'?\s+limitata(\s+semplificata)?/gi, '')
    .replace(/societ[aà]'?\s+per\s+azioni/gi, '')
    .replace(/\bS\.?R\.?L\.?S\.?\b/gi, '')
    .replace(/\bS\.?R\.?L\.?\b/gi, '')
    .replace(/\bS\.?P\.?A\.?\b/gi, '')
    .replace(/\bS\.?N\.?C\.?\b/gi, '')
    .replace(/\bS\.?A\.?S\.?\b/gi, '')
    .replace(/\s+/g, ' ')
    .trim();
  // Title Case tenendo la maiuscola dopo l'apostrofo (D'AURIA -> D'Auria)
  s = s.replace(/\S+/g, (w) => (w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
    .replace(/'(\p{L})/u, (_, ch) => "'" + ch.toUpperCase()));
  return (s || 'Cliente senza nome').replace(/[\/\\:*?"<>|]/g, '-').replace(/\s+/g, ' ').slice(0, 80).trim();
}

const eur = (v) => {
  const n = parseFloat(v);
  return isNaN(n) ? '-' : n.toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
};

function schedaMd(rec, partnerLabel) {
  const c = rec.cliente || {};
  const beni = Array.isArray(rec.beni) && rec.beni.length ? rec.beni : [{ tipologia: rec.bene?.tipologia, descrizione: rec.bene?.descrizione, importo: rec.bene?.importo }];
  const righe = beni.map((b) => `| ${b.tipologia || '-'} | ${b.descrizione || '-'} | ${eur(b.importo)} |`).join('\n');
  const totale = beni.reduce((s, b) => s + (parseFloat(b.importo) || 0), 0);
  const docs = (rec.documenti || []).map((d) => `- ${d.nome}`).join('\n') || '- (nessuno)';
  return `# Pratica ${rec.id} — ${c.ragione_sociale || '-'}

Fonte: portale partner ${partnerLabel} (${rec.partner})
Ricevuta: ${rec.creato}
Stato attuale: ${rec.stato || 'Ricevuta'}

## Cliente finale
- Ragione sociale: ${c.ragione_sociale || '-'}
- Forma giuridica: ${c.forma_giuridica || '-'}
- P.IVA / CF: ${c.piva || '-'}
- Referente: ${c.referente || '-'}
- Telefono: ${c.telefono || '-'}
- Email: ${c.email || '-'}

## Beni da noleggiare
| Tipologia | Descrizione | Importo |
|---|---|---|
${righe}

Totale imponibile: **${eur(totale)}** — durata ${rec.bene?.durata || '-'} mesi — canone simulato ${rec.bene?.canone_simulato ? eur(rec.bene.canone_simulato) + '/mese' : '-'}

## Note del partner
${rec.note || '-'}

## Documenti allegati (${(rec.documenti || []).length})
${docs}

---
Scheda generata dal puller portali. I documenti sono nella cartella "documenti/".
`;
}

const PARTNER_LABEL = {
  'full-service': 'FULL SERVICE S.R.L.',
  'stilo': 'STILO S.R.L.',
  'expo-energia': 'Expo Energia Srl',
};

async function loadState() {
  if (!existsSync(statePath)) return { processate: {} };
  try { return JSON.parse(await readFile(statePath, 'utf8')); } catch { return { processate: {} }; }
}

async function main() {
  const state = await loadState();
  const { blobs } = await list({ prefix: 'pratiche/', token });
  const byUrl = new Map(blobs.map((b) => [b.pathname, b.downloadUrl ?? b.url]));
  const records = blobs.filter((b) => b.pathname.endsWith('pratica.json'));

  const nuove = [];
  for (const rb of records) {
    const rec = await (await fetch(rb.downloadUrl ?? rb.url, { headers: { Authorization: `Bearer ${token}` } })).json();
    if (slugFilter && rec.partner !== slugFilter) continue;
    if (state.processate[rec.id]) continue; // gia' fatta

    const cartella = join(destBase, nomeCartella(rec.cliente?.ragione_sociale));
    const docsDir = join(cartella, 'documenti');
    await mkdir(docsDir, { recursive: true });

    let scaricati = 0;
    for (const d of rec.documenti || []) {
      const url = byUrl.get(d.pathname);
      if (!url) { log(`  ! documento non trovato nello store: ${d.nome}`); continue; }
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) { log(`  ! download fallito (${res.status}): ${d.nome}`); continue; }
      const buf = Buffer.from(await res.arrayBuffer());
      const safe = d.nome.replace(/[\/\\:*?"<>|]/g, '_');
      await writeFile(join(docsDir, safe), buf);
      scaricati++;
    }

    await writeFile(join(cartella, 'SCHEDA_PORTALE.md'), schedaMd(rec, PARTNER_LABEL[rec.partner] || rec.partner), 'utf8');

    state.processate[rec.id] = { cartella, cliente: rec.cliente?.ragione_sociale, quando: new Date().toISOString() };
    nuove.push({ id: rec.id, partner: rec.partner, cliente: rec.cliente?.ragione_sociale, cartella, documenti: scaricati });
    log(`✓ ${rec.id} — ${rec.cliente?.ragione_sociale} → ${cartella} (${scaricati} documenti)`);
  }

  await writeFile(statePath, JSON.stringify(state, null, 2), 'utf8');

  if (jsonOut) console.log(JSON.stringify({ nuove }, null, 2));
  else if (!nuove.length) log('Nessuna pratica nuova.');
}

main().catch((e) => { console.error('Errore puller:', e); process.exit(1); });
