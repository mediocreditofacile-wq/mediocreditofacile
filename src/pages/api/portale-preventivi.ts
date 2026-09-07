export const prerender = false;

// Storico dei preventivi. L'agente vede i propri, il referente tutta la rete,
// l'admin MCF tutto: la differenza sta nella clausola WHERE, non nell'interfaccia.

import { query } from '../../lib/db';
import { richiediSessione, vedeTuttoIlFornitore } from '../../lib/portale-auth';

export async function GET({ request }: { request: Request }) {
  const url = new URL(request.url);
  const esito = await richiediSessione(request, {
    slugRichiesto: url.searchParams.get('partner'),
    permesso: { preventivo: ['leggi-propri'] },
  });
  if (!esito.ok) return esito.risposta;
  const { contesto } = esito;

  const tutto = vedeTuttoIlFornitore(contesto);
  const condizioni: string[] = [];
  const valori: unknown[] = [];

  if (contesto.organizationId) {
    valori.push(contesto.organizationId);
    condizioni.push(`p.organization_id = $${valori.length}`);
  }
  if (!tutto) {
    valori.push(contesto.userId);
    condizioni.push(`p.user_id = $${valori.length}`);
  }
  const where = condizioni.length ? `WHERE ${condizioni.join(' AND ')}` : '';

  const righe = await query(
    `SELECT p.id, p.creato, p.cliente_nome, p.comune, p.provincia, p.forma_giuridica,
            p.rif_preventivo, p.kwp, p.kwh_accumulo, p.importo, p.installazione,
            p.durata, p.durata_consigliata, p.canone, p.numeri, p.documenti, p.pdf_pronti,
            p.user_id, u.name AS agente_nome, u.email AS agente_email
       FROM app.preventivo p
       JOIN "user" u ON u.id = p.user_id
       ${where}
      ORDER BY p.creato DESC
      LIMIT 500`,
    valori,
  );

  return new Response(
    JSON.stringify({
      ok: true,
      ruolo: contesto.ruolo,
      vedeTuttaLaRete: tutto,
      fornitore: contesto.fornitoreSlug,
      fornitoreNome: contesto.fornitoreNome,
      utente: { id: contesto.userId, nome: contesto.nome, email: contesto.email },
      preventivi: righe,
    }),
    { headers: { 'Content-Type': 'application/json', 'Cache-Control': 'private, no-store' } },
  );
}
