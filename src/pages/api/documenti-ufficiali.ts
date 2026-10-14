export const prerender = false;

/**
 * Documenti ufficiali della Camera di Commercio per /tools/valutazione.
 *
 *   GET  /api/documenti-ufficiali?piva=...                         -> archivio: visura, bilanci, anni, prezzi
 *   GET  /api/documenti-ufficiali?piva=...&stato=visura            -> avanza l'attesa della visura
 *   GET  /api/documenti-ufficiali?piva=...&stato=bilancio&id=...   -> avanza l'attesa di un bilancio
 *   GET  /api/documenti-ufficiali?piva=...&file=<percorso>         -> il file archiviato
 *   POST /api/documenti-ufficiali {azione:'visura', piva}          -> ordina (o riusa) la visura
 *   POST /api/documenti-ufficiali {azione:'cerca-bilanci', piva}   -> elenco degli esercizi (0,10)
 *   POST /api/documenti-ufficiali {azione:'bilancio', piva, id}    -> ordina (o riusa) un esercizio
 *   GET  /api/documenti-ufficiali?piva=...&stato=protesti          -> avanza l'attesa della visura protesti
 *   GET  /api/documenti-ufficiali?piva=...&stato=protesti-persona&cf=...
 *   POST /api/documenti-ufficiali {azione:'protesti', piva}        -> visura protesti dell'azienda (0,90)
 *   POST /api/documenti-ufficiali {azione:'protesti-persona', piva, cf} -> visura protesti di un socio o amministratore (0,90)
 *
 * L'archivio porta anche il dettaglio della verifica eventi negativi gia' pagata
 * (azienda, soci e amministratori), letto dal registro: nessuna chiamata Openapi.
 *
 * Bearer VALUTAZIONE_KEY come il resto dello strumento: ogni POST puo' spendere.
 * La logica sta in src/lib/docuengine.ts e src/lib/documenti-ufficiali.ts.
 */

import {
  leggiIndice, datiAzienda, ordinaVisura, statoVisura, cercaBilanci, ordinaBilancio,
  statoBilancio, anniInArchivio, percorsoAmmesso, leggiFile,
  ordinaProtesti, statoProtesti, ordinaProtestiPersona, statoProtestiPersona, datiVisuraProtesti,
} from '../../lib/docuengine';
import { VISURA, BILANCIO, PROTESTI, nomeFile } from '../../lib/documenti-ufficiali';
import { esitiVerifiche } from '../../lib/openapi';

function autorizzato(request: Request): boolean {
  const atteso = import.meta.env.VALUTAZIONE_KEY as string;
  if (!atteso) return false;
  return (request.headers.get('authorization') ?? '') === `Bearer ${atteso}`;
}

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

const normPiva = (v: unknown) => String(v ?? '').replace(/\D/g, '');
const pivaValida = (p: string) => /^\d{11}$/.test(p);
const normCf = (v: unknown) => String(v ?? '').trim().toUpperCase();
const cfValido = (cf: string) => /^[A-Z0-9]{16}$/.test(cf);

/** Quello che serve alla pagina per disegnare i pannelli. */
async function archivio(piva: string) {
  const [indice, az] = await Promise.all([leggiIndice(piva), datiAzienda(piva)]);
  const persone = az?.persone ?? [];
  // esiti gia' pagati della verifica eventi negativi e contenuto delle visure protesti
  // gia' scaricate: solo blob, mai Openapi
  const [reg, visuraAzienda, ...visurePersone] = await Promise.all([
    esitiVerifiche([piva, ...persone.map((p) => p.cf)]).catch(() => ({} as Record<string, any>)),
    datiVisuraProtesti(indice.protesti).catch(() => null),
    ...persone.map((p) => datiVisuraProtesti(indice.protestiPersone?.[p.cf]).catch(() => null)),
  ]);
  return {
    piva,
    azienda: az && {
      ragioneSociale: az.ragioneSociale,
      tipoVisura: az.tipoVisura,
      forma: az.formaDescrizione,
      visuraPossibile: !!(az.rea && az.cciaa),
    },
    prezzi: {
      visura: az ? VISURA[az.tipoVisura].prezzo : null,
      ricercaBilanci: BILANCIO.ricerca,
      bilancio: BILANCIO.documento,
      protesti: PROTESTI.azienda.prezzo,
      protestiPersona: PROTESTI.persona.prezzo,
    },
    visura: indice.visura ?? null,
    bilanci: indice.bilanci ?? {},
    anni: anniInArchivio(indice),
    ricercaQuando: indice.ricerca?.quando ?? null,
    protesti: {
      ordine: indice.protesti ?? null,
      visura: visuraAzienda,
      negativita: reg[piva]?.negativita ?? null,
      persone: persone.map((p, i) => ({
        ...p,
        negativita: reg[p.cf]?.negativita ?? null,
        ordine: indice.protestiPersone?.[p.cf] ?? null,
        visura: visurePersone[i],
      })),
    },
  };
}

/** "Visura - X.pdf", "Bilancio 2024 - X.pdf", "Visura protesti Mario Rossi - X.pdf" */
async function etichettaFile(piva: string, file: string): Promise<{ etichetta: string; ragioneSociale: string }> {
  const az = await datiAzienda(piva);
  const ragioneSociale = az?.ragioneSociale ?? piva;
  if (file.includes('/visura-')) return { etichetta: 'Visura', ragioneSociale };
  if (file.includes('/protesti-')) {
    const cf = file.match(/\/protesti-([A-Z0-9]{16})-/)?.[1];
    const p = cf ? az?.persone.find((x) => x.cf === cf) : null;
    const chi = p ? ` ${p.nome} ${p.cognome}`.toLowerCase().replace(/(^|[\s'’-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase()) : cf ? ` ${cf}` : '';
    return { etichetta: `Visura protesti${chi}`, ragioneSociale };
  }
  return { etichetta: `Bilancio ${file.match(/bilancio-(\d{4})/)?.[1] ?? ''}`.trim(), ragioneSociale };
}

export async function GET({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);
  const url = new URL(request.url);
  const piva = normPiva(url.searchParams.get('piva'));
  if (!pivaValida(piva)) return json({ errore: 'partita IVA non valida' }, 400);

  try {
    const file = url.searchParams.get('file');
    if (file) {
      if (!percorsoAmmesso(piva, file)) return json({ errore: 'documento non disponibile' }, 403);
      const b = await leggiFile(file);
      if (!b?.stream) return json({ errore: 'documento non trovato' }, 404);
      // Nome leggibile per la cartella pratica: "Visura - RAGIONE SOCIALE.pdf"
      const est = file.split('.').pop() ?? 'pdf';
      const { etichetta, ragioneSociale } = await etichettaFile(piva, file);
      const nome = nomeFile(ragioneSociale, etichetta, est);
      return new Response(b.stream, {
        headers: {
          'Content-Type': b.blob?.contentType ?? 'application/pdf',
          'Content-Disposition': `attachment; filename="${nome.replace(/"/g, '')}"`,
          'Cache-Control': 'private, no-store',
        },
      });
    }

    const stato = url.searchParams.get('stato');
    if (stato === 'visura') return json({ ordine: await statoVisura(piva) });
    if (stato === 'bilancio') {
      const id = String(url.searchParams.get('id') ?? '');
      if (!id) return json({ errore: 'esercizio mancante' }, 400);
      return json({ ordine: await statoBilancio(piva, id) });
    }
    if (stato === 'protesti') return json({ ordine: await statoProtesti(piva) });
    if (stato === 'protesti-persona') {
      const cf = normCf(url.searchParams.get('cf'));
      if (!cfValido(cf)) return json({ errore: 'codice fiscale non valido' }, 400);
      return json({ ordine: await statoProtestiPersona(piva, cf) });
    }
    return json(await archivio(piva));
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'documenti_ufficiali_errore', piva, msg }));
    return json({ errore: msg }, 502);
  }
}

export async function POST({ request }: { request: Request }) {
  if (!autorizzato(request)) return json({ errore: 'non autorizzato' }, 401);
  const body = await request.json().catch(() => null);
  const piva = normPiva(body?.piva);
  if (!pivaValida(piva)) return json({ errore: 'partita IVA non valida' }, 400);
  const azione = body?.azione;

  try {
    if (azione === 'visura') return json(await ordinaVisura(piva));
    if (azione === 'cerca-bilanci') return json({ anni: await cercaBilanci(piva) });
    if (azione === 'bilancio') {
      const id = String(body?.id ?? '');
      if (!/^\d+$/.test(id)) return json({ errore: 'esercizio non valido' }, 400);
      return json(await ordinaBilancio(piva, id));
    }
    if (azione === 'protesti') return json(await ordinaProtesti(piva));
    if (azione === 'protesti-persona') {
      const cf = normCf(body?.cf);
      if (!cfValido(cf)) return json({ errore: 'codice fiscale non valido' }, 400);
      return json(await ordinaProtestiPersona(piva, cf));
    }
    return json({ errore: 'azione non riconosciuta' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'documenti_ufficiali_errore', piva, azione, msg }));
    return json({ errore: msg }, 502);
  }
}
