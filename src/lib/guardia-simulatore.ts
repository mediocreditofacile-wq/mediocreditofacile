// Protezioni della verifica del cliente sul simulatore di noleggio operativo.
//
// SERVER-ONLY: legge e scrive il database.
//
// L'endpoint e' pubblico e ogni invio consuma tre risorse con un tetto: euro su
// Openapi, operazioni sullo store Blob (tetto mensile del piano Vercel, gia'
// vicino al limite) e mail Resend (100 al giorno, le stesse di inviti e reset).
// Per questo si PRENOTA prima di spendere: una riga in app.simulatore_verifica
// scritta all'inizio dell'invio, sotto un lock, con le ricerche che l'invio puo'
// fare. Due richieste in parallelo non leggono mai lo stesso conteggio.
//
// Tetti, tutti contati sulle prenotazioni:
//   frequenza   10 invii al minuto per indirizzo (impronta con segreto)
//   invii       SIMULATORE_TETTO_INVII al giorno (30): oltre, niente ricerca e
//               niente mail, la lead resta nel log e la pagina offre WhatsApp
//   ricerche    SIMULATORE_TETTO_GIORNO ricerche a pagamento al giorno (20)
//   euro        OPENAPI_TETTO_SIMULATORE al mese (20), prudente: ogni ricerca a
//               0,10 e ogni scheda a 0,81, dal database e non dal registro su
//               Blob (che costerebbe operazioni avanzate a ogni invio)
// Se il database non risponde: nessuna ricerca, la mail parte lo stesso.

import { env, getPool, query } from './db';

export { impronta, ipDellaRichiesta } from './fiera-guardia';

export const PER_MINUTO = 10;
export const COSTO_RICERCA = 0.1;
export const COSTO_SCHEDA = 0.81;
const LOCK = 24_10_2026; // un numero qualunque, uguale per tutte le istanze

function numero(chiave: string, difetto: number): number {
  const v = Number(env(chiave));
  return Number.isFinite(v) && v > 0 ? v : difetto;
}

export interface Conteggi {
  ultimoMinutoIp: number;
  inviiOggi: number;
  ricercheOggi: number;
  ricercheMese: number;
  schedeMese: number;
}

export interface Permessi {
  frequenza: boolean;
  /** Si manda la mail (tetto degli invii del giorno) */
  invio: boolean;
  /** Ricerche a pagamento concesse a questo invio */
  ricerche: number;
  /** Si puo' ordinare la scheda completa, se il colore e' verde */
  scheda: boolean;
  motivo?: 'frequenza' | 'tetto_invii' | 'tetto_giorno' | 'tetto_spesa';
}

/** La decisione, pura: la provano i test senza database */
export function decidi(c: Conteggi, volute: number): Permessi {
  if (c.ultimoMinutoIp >= PER_MINUTO) return { frequenza: true, invio: false, ricerche: 0, scheda: false, motivo: 'frequenza' };
  if (c.inviiOggi >= numero('SIMULATORE_TETTO_INVII', 30)) return { frequenza: false, invio: false, ricerche: 0, scheda: false, motivo: 'tetto_invii' };
  const tettoEuro = numero('OPENAPI_TETTO_SIMULATORE', 20);
  const spesa = c.ricercheMese * COSTO_RICERCA + c.schedeMese * COSTO_SCHEDA;
  const restoGiorno = numero('SIMULATORE_TETTO_GIORNO', 20) - c.ricercheOggi;
  const restoEuro = Math.floor((tettoEuro - spesa) / COSTO_RICERCA + 1e-9);
  const ricerche = Math.max(0, Math.min(volute, restoGiorno, restoEuro));
  const motivo = ricerche < volute ? (restoGiorno < volute ? 'tetto_giorno' : 'tetto_spesa') : undefined;
  const scheda = ricerche > 0 && spesa + ricerche * COSTO_RICERCA + COSTO_SCHEDA <= tettoEuro;
  return { frequenza: false, invio: true, ricerche, scheda, ...(motivo ? { motivo } : {}) };
}

export interface Prenotazione extends Permessi {
  /** Id della riga, null se il database non ha risposto */
  id: number | null;
}

/**
 * Prenota l'invio. La riga nasce con le ricerche concesse e con una scheda
 * prenotata se il verde e' possibile: chiudi() la riporta a quello che e'
 * stato speso davvero.
 */
export async function prenota(ipHash: string, volute: number): Promise<Prenotazione> {
  let client;
  try {
    client = await getPool().connect();
  } catch (err) {
    console.error(JSON.stringify({ evento: 'simulatore_db_errore', dove: 'connessione', msg: String(err) }));
    return { id: null, frequenza: false, invio: true, ricerche: 0, scheda: false };
  }
  try {
    await client.query('BEGIN');
    await client.query('SELECT pg_advisory_xact_lock($1)', [LOCK]);
    const { rows } = await client.query(
      `SELECT
         count(*) FILTER (WHERE ip_hash = $1 AND quando > now() - interval '1 minute')      AS minuto,
         count(*) FILTER (WHERE quando >= oggi.inizio AND esito <> 'frequenza')              AS invii,
         coalesce(sum(ricerche) FILTER (WHERE quando >= oggi.inizio), 0)                     AS ricerche_oggi,
         coalesce(sum(ricerche) FILTER (WHERE quando >= mese.inizio), 0)                     AS ricerche_mese,
         coalesce(sum(schede) FILTER (WHERE quando >= mese.inizio), 0)                       AS schede_mese
       FROM app.simulatore_verifica,
            (SELECT date_trunc('day', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS inizio) oggi,
            (SELECT date_trunc('month', now() AT TIME ZONE 'Europe/Rome') AT TIME ZONE 'Europe/Rome' AS inizio) mese
       WHERE quando >= mese.inizio OR quando > now() - interval '1 minute'`,
      [ipHash],
    );
    const r = rows[0] ?? {};
    const permessi = decidi({
      ultimoMinutoIp: Number(r.minuto ?? 0),
      inviiOggi: Number(r.invii ?? 0),
      ricercheOggi: Number(r.ricerche_oggi ?? 0),
      ricercheMese: Number(r.ricerche_mese ?? 0),
      schedeMese: Number(r.schede_mese ?? 0),
    }, volute);
    const ins = await client.query(
      `INSERT INTO app.simulatore_verifica (ip_hash, esito, ricerche, schede) VALUES ($1, $2, $3, $4) RETURNING id`,
      [ipHash, permessi.frequenza ? 'frequenza' : 'in_corso', permessi.ricerche, permessi.scheda ? 1 : 0],
    );
    await client.query('COMMIT');
    return { id: Number(ins.rows[0].id), ...permessi };
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    console.error(JSON.stringify({ evento: 'simulatore_db_errore', dove: 'prenota', msg: String(err) }));
    return { id: null, frequenza: false, invio: true, ricerche: 0, scheda: false };
  } finally {
    client.release();
  }
}

/** Riporta la riga a quello che l'invio ha speso davvero */
export async function chiudi(id: number | null, riga: { esito: string; ricerche: number; schede: number }) {
  if (id == null) return;
  try {
    await query(
      `UPDATE app.simulatore_verifica SET esito = $2, ricerche = $3, schede = $4 WHERE id = $1`,
      [id, riga.esito, riga.ricerche, riga.schede],
    );
  } catch (err) {
    console.error(JSON.stringify({ evento: 'simulatore_db_errore', dove: 'chiudi', msg: String(err) }));
  }
}
