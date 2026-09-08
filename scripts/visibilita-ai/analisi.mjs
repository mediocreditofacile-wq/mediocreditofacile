// Classificazione della risposta di un motore: la regex direbbe solo se il nome compare,
// non se siamo consigliati, citati di sfuggita o descritti male. Serve un giudizio.

const SCHEMA = {
  name: 'esito_visibilita',
  description: 'Esito della presenza del marchio nella risposta di un assistente AI',
  input_schema: {
    type: 'object',
    properties: {
      citato: { type: 'boolean', description: 'Il marchio compare nella risposta' },
      posizione: {
        type: 'integer',
        description: 'Posizione del marchio tra i soggetti nominati, 1 = primo. 0 se assente',
      },
      raccomandato: {
        type: 'boolean',
        description: 'Il marchio è indicato come opzione da contattare, non solo nominato di passaggio',
      },
      descrizione_corretta: {
        type: 'boolean',
        description: 'Se citato, è descritto correttamente come broker indipendente per PMI',
      },
      errori: {
        type: 'string',
        description: "Solo confusioni vere sul marchio: descritto in modo errato, oppure scambiato per un altro soggetto (Facile.it, Mediocredito Italiano, Mediocredito Centrale). Stringa VUOTA se il marchio e' semplicemente assente dalla risposta: l'assenza non e' un errore e va lasciata fuori da questo campo",
      },
      concorrenti: {
        type: 'array',
        items: { type: 'string' },
        description: 'Nomi di aziende, banche o portali indicati nella risposta, in ordine di apparizione',
      },
      sintesi: { type: 'string', description: 'Una frase su cosa dice la risposta' },
    },
    required: ['citato', 'posizione', 'raccomandato', 'descrizione_corretta', 'errori', 'concorrenti', 'sintesi'],
  },
};

export async function classifica({ marchio, dominio, domanda, risposta }) {
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model: process.env.CLASSIFIER_MODEL || 'claude-haiku-4-5-20251001',
      max_tokens: 1000,
      tools: [SCHEMA],
      tool_choice: { type: 'tool', name: 'esito_visibilita' },
      messages: [
        {
          role: 'user',
          content: `Marchio da cercare: "${marchio}" (dominio ${dominio}).\n\nDomanda posta all'assistente:\n${domanda}\n\nRisposta ricevuta:\n${risposta}\n\nCompila l'esito. Attenzione: "Facile.it", "Mediocredito Italiano" e gli istituti Mediocredito regionali sono soggetti DIVERSI dal marchio cercato; se compaiono al suo posto vanno messi tra i concorrenti e segnalati come errore solo quando la risposta li confonde con il marchio.`,
        },
      ],
    }),
  });
  if (!res.ok) throw new Error(`Classificatore HTTP ${res.status}: ${(await res.text()).slice(0, 300)}`);
  const data = await res.json();
  const uso = data.content.find((b) => b.type === 'tool_use');
  if (!uso) throw new Error('Il classificatore non ha restituito un esito strutturato');
  return uso.input;
}
