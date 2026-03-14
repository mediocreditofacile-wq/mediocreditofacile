export const prerender = false;

/**
 * Layer AI per credit policy — analisi borderline via Claude.
 * POST /api/credit-ai
 * Body: { ragioneSociale, fatturato, ateco, regione, macchina, prezzoMacchina, percCanone, criteriGiallo }
 * Restituisce: { memo: "testo analisi" }
 */

const ALLOWED_ORIGIN = 'https://mcf-marotta.netlify.app';

const SYSTEM_PROMPT = `Sei un analista creditizio specializzato in noleggio operativo per PMI italiane del settore lattiero-caseario. Valuti il profilo di rischio di caseifici che richiedono noleggio operativo per macchinari burrata (valore €140.000–€425.000, partner finanziario: Grenke Italia).

Devi essere conservativo ma non eccessivamente restrittivo. Il noleggio operativo ha già una struttura di garanzia intrinseca (il bene torna al locatore in caso di insolvenza). Valuta il profilo e suggerisci in massimo 4 righe:
1. Livello di rischio: BASSO / MEDIO / ALTO
2. Motivazione (1-2 frasi)
3. Condizione suggerita: standard / anticipo X% / markup +Y% / entrambi
4. Confidence: ALTA (dati chiari) / MEDIA (dati incompleti) / BASSA (caso atipico)

Rispondi SOLO in italiano, tono professionale e diretto. Niente fronzoli.`;

function corsHeaders() {
  return {
    'Access-Control-Allow-Origin': ALLOWED_ORIGIN,
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Content-Type': 'application/json',
  };
}

export async function OPTIONS() {
  return new Response(null, { status: 204, headers: corsHeaders() });
}

export async function POST({ request }: { request: Request }) {
  const apiKey = import.meta.env.ANTHROPIC_API_KEY as string;
  if (!apiKey) {
    return new Response(
      JSON.stringify({ memo: null, error: 'API key non configurata' }),
      { status: 500, headers: corsHeaders() },
    );
  }

  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return new Response(
      JSON.stringify({ memo: null, error: 'JSON non valido' }),
      { status: 400, headers: corsHeaders() },
    );
  }

  const userPrompt = `Profilo caseificio:
- Ragione sociale: ${body.ragioneSociale || 'n.d.'}
- Fatturato annuo: €${Number(body.fatturato || 0).toLocaleString('it-IT')}
- Settore ATECO: ${body.ateco || 'non disponibile'}
- Regione sede: ${body.regione || 'non disponibile'}
- Macchina richiesta: ${body.macchina || 'n.d.'} (€${Number(body.prezzoMacchina || 0).toLocaleString('it-IT')})
- Rapporto canone/fatturato: ${body.percCanone || 'n.d.'}% del fatturato annuo

Il semaforo automatico ha restituito: GIALLO
Criteri che hanno triggerato il giallo: ${Array.isArray(body.criteriGiallo) ? body.criteriGiallo.join(', ') : 'n.d.'}

Fornisci la tua valutazione.`;

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 300,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userPrompt }],
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic API error:', res.status, err);
      return new Response(
        JSON.stringify({ memo: null, error: `Claude API: ${res.status}` }),
        { status: 502, headers: corsHeaders() },
      );
    }

    const data = await res.json();
    const memo = data?.content?.[0]?.text ?? null;

    return new Response(
      JSON.stringify({ memo }),
      { status: 200, headers: corsHeaders() },
    );
  } catch (err) {
    const msg = err instanceof Error ? err.message : 'Errore sconosciuto';
    return new Response(
      JSON.stringify({ memo: null, error: msg }),
      { status: 502, headers: corsHeaders() },
    );
  }
}
