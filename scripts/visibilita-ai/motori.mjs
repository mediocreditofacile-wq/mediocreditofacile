// Interrogazione dei motori conversazionali con ricerca web attiva.
// Ogni motore risponde come farebbe a un utente reale: senza web search il test
// misurerebbe solo la memoria del modello, non quello che il cliente vede davvero.

const TIMEOUT_MS = 120000;

async function post(url, { headers, body }) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const testo = await res.text();
    if (!res.ok) throw new Error(`HTTP ${res.status}: ${testo.slice(0, 300)}`);
    return JSON.parse(testo);
  } finally {
    clearTimeout(timer);
  }
}

// Claude — Messages API con il tool di ricerca web nativo.
async function chiediClaude(domanda) {
  const data = await post('https://api.anthropic.com/v1/messages', {
    headers: {
      'x-api-key': process.env.ANTHROPIC_API_KEY,
      'anthropic-version': '2023-06-01',
    },
    body: {
      model: process.env.CLAUDE_MODEL || 'claude-sonnet-5',
      max_tokens: 1500,
      tools: [{ type: 'web_search_20250305', name: 'web_search', max_uses: 4 }],
      messages: [{ role: 'user', content: domanda }],
    },
  });
  const testo = data.content
    .filter((b) => b.type === 'text')
    .map((b) => b.text)
    .join('\n');
  // Le citazioni dicono da quali fonti ha attinto: serve a capire se ci ha letti.
  const fonti = [];
  for (const blocco of data.content) {
    for (const c of blocco.citations || []) if (c.url) fonti.push(c.url);
  }
  return { testo, fonti: [...new Set(fonti)] };
}

// ChatGPT — Responses API con lo strumento di ricerca web.
async function chiediChatGPT(domanda) {
  const data = await post('https://api.openai.com/v1/responses', {
    headers: { authorization: `Bearer ${process.env.OPENAI_API_KEY}` },
    body: {
      model: process.env.OPENAI_MODEL || 'gpt-4.1',
      tools: [{ type: 'web_search' }],
      input: domanda,
    },
  });
  const blocchi = (data.output || []).flatMap((o) => o.content || []);
  const testo = blocchi.map((c) => c.text || '').join('\n').trim();
  const fonti = blocchi.flatMap((c) => (c.annotations || []).map((a) => a.url)).filter(Boolean);
  return { testo, fonti: [...new Set(fonti)] };
}

// Gemini — generateContent con il grounding sulla ricerca Google.
async function chiediGemini(domanda) {
  const modello = process.env.GEMINI_MODEL || 'gemini-2.5-flash';
  const data = await post(
    `https://generativelanguage.googleapis.com/v1beta/models/${modello}:generateContent?key=${process.env.GEMINI_API_KEY}`,
    {
      headers: {},
      body: {
        contents: [{ role: 'user', parts: [{ text: domanda }] }],
        tools: [{ google_search: {} }],
      },
    }
  );
  const candidato = data.candidates?.[0];
  const testo = (candidato?.content?.parts || []).map((p) => p.text || '').join('\n').trim();
  const fonti = (candidato?.groundingMetadata?.groundingChunks || [])
    .map((c) => c.web?.uri)
    .filter(Boolean);
  return { testo, fonti: [...new Set(fonti)] };
}

// Un motore è disponibile solo se ha la sua chiave: gli altri si saltano senza rompere il giro.
export const MOTORI = [
  { id: 'claude', nome: 'Claude', chiave: 'ANTHROPIC_API_KEY', chiedi: chiediClaude },
  { id: 'chatgpt', nome: 'ChatGPT', chiave: 'OPENAI_API_KEY', chiedi: chiediChatGPT },
  { id: 'gemini', nome: 'Gemini', chiave: 'GEMINI_API_KEY', chiedi: chiediGemini },
];

export function motoriDisponibili() {
  return MOTORI.filter((m) => process.env[m.chiave]);
}
