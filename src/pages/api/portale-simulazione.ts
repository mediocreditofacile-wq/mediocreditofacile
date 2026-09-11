export const prerender = false;

// Simulazione rapida: solo numeri, niente scheda cliente e niente documenti.
//
// Serve all'agente che ha il fornitore o il cliente al telefono e deve dire un
// canone senza compilare tutto il prospetto. Non salva niente e non manda
// niente: quello che resta e' il prospetto vero, generato dall'altra sezione.
//
// Tre modi:
//  - dal prezzo di vendita alla griglia dei canoni su tutte le durate
//  - dal canone che il cliente regge al prezzo che ci sta dentro
//  - impianto fotovoltaico: il business plan intero, cioe' bilancio energetico,
//    deducibilita' del canone, confronto con il leasing e le due agevolazioni
//    che il leasing apre e il noleggio no (Sabatini Green e iperammortamento)
//
// Il business plan usa lo STESSO motore dei prospetti, non un modello suo: se
// l'agente vede a schermo un numero e il PDF che consegna al cliente ne dice un
// altro, il portale gli fa fare una figuraccia.
//
// Il calcolo gira qui, non nel browser: i coefficienti sono dati commerciali
// riservati e in risposta esce solo il canone finale, mai il coefficiente ne'
// la fascia di importo.

import { agevolazioneAttiva } from '../../data/leasing';
import { richiediSessione } from '../../lib/portale-auth';
import { leggiInput } from '../../lib/preventivi-pv';
import { SOGLIA_LEASING, leasingPercorribile } from '../../lib/prospetti-pv-coefficienti';
import { calcolaPreventivo, type OpzioniProspetto } from '../../lib/prospetti-pv';
import { getTabella } from '../../lib/tabelle-canoni';

function json(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' },
  });
}

const r2 = (v: number) => Math.round(v * 100) / 100;

export async function POST({ request }: { request: Request }) {
  const esito = await richiediSessione(request, { permesso: { preventivo: ['crea'] } });
  if (!esito.ok) return esito.risposta;

  let corpo: Record<string, unknown>;
  try {
    corpo = (await request.json()) as Record<string, unknown>;
  } catch {
    return json({ ok: false, error: 'invalid_json' }, 400);
  }

  const tabella = getTabella(esito.contesto.tabellaCanoni);
  const numero = (v: unknown) => {
    const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(',', '.'));
    return Number.isFinite(n) ? n : 0;
  };

  // === Impianto fotovoltaico: il business plan intero ===
  if (corpo.verso === 'fotovoltaico') {
    // Nessun dato del cliente: il motore vuole un nome, gliene diamo uno finto
    // perche' qui non si genera nessun documento.
    const input = leggiInput({ ...corpo, cliente: 'simulazione' }, tabella);
    if (input.kwp <= 0 || input.importo <= 0) {
      return json({ ok: false, error: 'dati_incompleti' }, 400);
    }
    if (!tabella.quotabile(input.importo)) {
      return json({
        ok: false,
        error: 'importo_fuori_range',
        min: tabella.importoMin,
        max: tabella.importoMax,
      }, 400);
    }

    // Il registro AGEVOLAZIONI_STATO decide quali misure sono aperte: una
    // chiusa non si accende dal client, altrimenti il portale prometterebbe
    // un contributo che non esiste piu'.
    // Sotto la soglia commerciale il leasing non si propone, e con lui spariscono
    // le due agevolazioni, che al noleggio operativo non si applicano comunque.
    const conLeasing = leasingPercorribile(input.importo);
    const sabatiniAperta = conLeasing && agevolazioneAttiva('sabatini');
    const iperAperta = conLeasing && agevolazioneAttiva('iperammortamento');
    const opzioni: OpzioniProspetto = {
      includiSabatini: sabatiniAperta && corpo.includi_sabatini !== false,
      includiIper: iperAperta && corpo.includi_iper !== false,
    };
    const c = calcolaPreventivo(input, tabella, opzioni);

    return json({
      ok: true,
      verso: 'fotovoltaico',
      importo: input.importo,
      // Cosa il portale puo' offrire oggi: la pagina nasconde i toggle chiusi
      agevolazioniAperte: { sabatini: sabatiniAperta, iper: iperAperta },
      // Sotto soglia la pagina non mostra affatto la colonna del leasing
      leasingPercorribile: conLeasing,
      sogliaLeasing: SOGLIA_LEASING,
      // Solo risultati: nessun coefficiente e nessuna fascia.
      durate: c.durate,
      canoni: c.canoni,
      riscatti: c.riscatti,
      durata: c.durata,
      durataConsigliata: c.durataConsigliata,
      durataForzata: c.durataForzata,
      canone: c.canone,
      totCanoni: c.totCanoni,
      riscatto: c.riscatto,
      zona: c.zona,
      produzione: c.produzione,
      autoconsumoQuota: c.autoconsumoQuota,
      autoKwh: c.autoKwh,
      cedKwh: c.cedKwh,
      prezzoKwh: c.prezzoKwh,
      datiRealiConsumo: c.datiRealiConsumo,
      beneficioAnno: c.beneficioAnno,
      beneficioMese: c.beneficioMese,
      coperturaCanone: c.coperturaCanone,
      margineMese: c.margineMese,
      fiscoNol: c.fiscoNol,
      costoNettoNol: c.costoNettoNol,
      rataLeasing: c.rataLeasing,
      riscattoLeasing: c.riscattoLeasing,
      totLeasing: c.totLeasing,
      interessi: c.interessi,
      sabatini: c.sabatini,
      sabatiniNetto: c.sabatiniNetto,
      iresIper: c.iresIper,
      iperNetto: c.iperNetto,
      conSabatini: c.conSabatini,
      conIper: c.conIper,
      costoNettoLeasing: c.costoNettoLeasing,
      detrazionePrivati: c.detrazionePrivati,
    });
  }

  // === Dal canone al prezzo ===
  if (corpo.verso === 'da-canone') {
    const canone = numero(corpo.canone);
    const durata = numero(corpo.durata);
    if (canone <= 0 || !tabella.durate.includes(durata)) {
      return json({ ok: false, error: 'dati_incompleti' }, 400);
    }
    const prezzo = tabella.prezzoDaCanone(canone, durata);
    if (prezzo === null) {
      // Un canone fuori scala non si arrotonda al piu' vicino: si dice che
      // non esiste, altrimenti l'agente porta al cliente un numero inventato.
      return json({
        ok: false,
        error: 'canone_fuori_range',
        min: tabella.importoMin,
        max: tabella.importoMax,
      }, 400);
    }
    return json({ ok: true, verso: 'da-canone', durata, canone, prezzo: r2(prezzo) });
  }

  // === Dal prezzo alla griglia dei canoni ===
  const importo = numero(corpo.importo);
  if (importo <= 0) return json({ ok: false, error: 'dati_incompleti' }, 400);
  if (!tabella.quotabile(importo)) {
    return json({
      ok: false,
      error: 'importo_fuori_range',
      min: tabella.importoMin,
      max: tabella.importoMax,
    }, 400);
  }

  const durate = tabella.durateDisponibili(importo);
  const canoni: Record<number, number> = {};
  const riscatti: Record<number, number> = {};
  for (const m of durate) {
    canoni[m] = r2((importo * tabella.coefficiente(importo, m)!) / 100);
    riscatti[m] = r2((importo * tabella.riscatto[m]) / 100);
  }

  return json({ ok: true, verso: 'da-prezzo', importo, durate, canoni, riscatti });
}
