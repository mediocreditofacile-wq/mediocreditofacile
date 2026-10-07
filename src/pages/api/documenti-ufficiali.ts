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
 *
 * Bearer VALUTAZIONE_KEY come il resto dello strumento: ogni POST puo' spendere.
 * La logica sta in src/lib/docuengine.ts e src/lib/documenti-ufficiali.ts.
 */

import {
  leggiIndice, datiAzienda, ordinaVisura, statoVisura, cercaBilanci, ordinaBilancio,
  statoBilancio, anniInArchivio, percorsoAmmesso, leggiFile,
} from '../../lib/docuengine';
import { VISURA, BILANCIO, nomeFile } from '../../lib/documenti-ufficiali';

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

/** Quello che serve alla pagina per disegnare i due pannelli. */
async function archivio(piva: string) {
  const [indice, az] = await Promise.all([leggiIndice(piva), datiAzienda(piva)]);
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
    },
    visura: indice.visura ?? null,
    bilanci: indice.bilanci ?? {},
    anni: anniInArchivio(indice),
    ricercaQuando: indice.ricerca?.quando ?? null,
  };
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
      const az = await datiAzienda(piva);
      const est = file.split('.').pop() ?? 'pdf';
      const etichetta = file.includes('/visura-') ? 'Visura'
        : `Bilancio ${file.match(/bilancio-(\d{4})/)?.[1] ?? ''}`.trim();
      const nome = nomeFile(az?.ragioneSociale ?? piva, etichetta, est);
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
    return json({ errore: 'azione non riconosciuta' }, 400);
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'errore sconosciuto';
    console.error(JSON.stringify({ evento: 'documenti_ufficiali_errore', piva, azione, msg }));
    return json({ errore: msg }, 502);
  }
}
