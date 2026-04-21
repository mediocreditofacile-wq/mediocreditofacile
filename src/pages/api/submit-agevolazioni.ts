export const prerender = false;

// Endpoint dedicato alla campagna Agevolazioni in partnership con Ambico Group.
// Flusso:
//  - notifica Resend in copia a MCF e a mkt@ambicogroup.it (controllo diretto sui lead)
//  - chiamata opzionale a Zapier per la pipeline Pipedrive dedicata ("Agevolazioni IMC")
//    (attivabile valorizzando ZAPIER_WEBHOOK_URL_AGEVOLAZIONI; finche' vuota, si salta)
//  - log separati (form_submitted_agevolazioni / lead_lost_agevolazioni) per tenere i
//    dati di questa campagna isolabili dal resto di MCF.

interface AgevolazioniLead {
  nome: string;
  email: string;
  telefono: string;
  fonte: string;
  tool: string;
  landing: string;
  extras: Record<string, string>;
}

// Campi sempre presenti: li estraiamo a parte per la mail e il log.
const CORE_FIELDS = new Set(['nome', 'email', 'telefono', 'fonte', 'tool', 'landing', 'website']);

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

function formatLabel(key: string): string {
  return key.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

async function sendResendEmail(lead: AgevolazioniLead): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const extraRows = Object.entries(lead.extras)
    .map(
      ([k, v]) => `
        <tr>
          <td style="padding:4px 12px 4px 0"><strong>${escapeHtml(formatLabel(k))}</strong></td>
          <td>${escapeHtml(v)}</td>
        </tr>`,
    )
    .join('');

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: ['mediocreditofacile@gmail.com', 'mkt@ambicogroup.it'],
    subject: `Nuovo lead Agevolazioni — ${lead.fonte || 'non specificata'}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:600px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Partnership MCF + Ambico Group — Campagna Agevolazioni
        </p>
        <h2 style="color:#664CCD;margin:0 0 16px">Nuovo lead dal sito</h2>
        <table style="font-size:15px;border-collapse:collapse;margin-bottom:20px">
          <tr><td style="padding:4px 12px 4px 0"><strong>Nome</strong></td><td>${escapeHtml(lead.nome)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${escapeHtml(lead.email)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Telefono</strong></td><td>${escapeHtml(lead.telefono)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Fonte</strong></td><td>${escapeHtml(lead.fonte || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Landing</strong></td><td>${escapeHtml(lead.landing || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Tool</strong></td><td>${escapeHtml(lead.tool || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Ora</strong></td><td>${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</td></tr>
        </table>
        ${
          extraRows
            ? `<p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">Dati calcolo</p>
               <table style="font-size:15px;border-collapse:collapse">${extraRows}</table>`
            : ''
        }
        <p style="font-size:12px;color:#787782;margin-top:28px">
          Notifica diretta via Resend. Endpoint: /api/submit-agevolazioni.
        </p>
      </div>
    `,
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const text = await res.text();
      return { ok: false, err: `resend_${res.status}: ${text.slice(0, 200)}` };
    }
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `resend_exception: ${msg}` };
  }
}

async function sendZapierWebhook(form: FormData): Promise<{ ok: boolean; err?: string }> {
  // Webhook dedicato alla pipeline Pipedrive "Agevolazioni IMC".
  // Se la env var non e' valorizzata, saltiamo: lo Zap non e' ancora stato creato e
  // non vogliamo generare errori spuri nei log.
  const url = import.meta.env.ZAPIER_WEBHOOK_URL_AGEVOLAZIONI as string | undefined;
  if (!url) return { ok: false, err: 'zapier_agevolazioni_url_missing' };

  try {
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) return { ok: false, err: `zapier_${res.status}` };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `zapier_exception: ${msg}` };
  }
}

export async function POST({ request }: { request: Request }) {
  const data = await request.formData();
  const nome = (data.get('nome') as string | null)?.trim() ?? '';
  const email = (data.get('email') as string | null)?.trim() ?? '';
  const telefono = (data.get('telefono') as string | null)?.trim() ?? '';
  const honeypot = (data.get('website') as string | null) ?? '';
  const fonte = (data.get('fonte') as string | null) ?? '';
  const tool = (data.get('tool') as string | null) ?? '';
  const landing = (data.get('landing') as string | null) ?? '';
  const timestamp = new Date().toISOString();

  if (honeypot) {
    console.warn(JSON.stringify({ event: 'form_rejected_agevolazioni', reason: 'honeypot', fonte, timestamp }));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!nome) {
    console.warn(JSON.stringify({
      event: 'form_rejected_agevolazioni',
      reason: 'missing_nome',
      fonte,
      timestamp,
      has_email: Boolean(email),
      has_telefono: Boolean(telefono),
    }));
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Raccolgo tutti i campi "extra" inviati dai calcolatori (importo_investimento, tipo_bene,
  // contributo_stimato, ecc.) per metterli nella mail senza accoppiare l'endpoint a uno
  // schema fisso: ogni calcolatore puo' aggiungere campi senza toccare il backend.
  const extras: Record<string, string> = {};
  for (const [key, value] of data.entries()) {
    if (CORE_FIELDS.has(key)) continue;
    if (typeof value !== 'string') continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    extras[key] = trimmed;
  }

  const lead: AgevolazioniLead = { nome, email, telefono, fonte, tool, landing, extras };

  const [mailResult, zapierResult] = await Promise.all([
    sendResendEmail(lead),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted_agevolazioni',
    timestamp,
    fonte,
    tool,
    landing,
    nome: nome.slice(0, 60),
    email: email.slice(0, 80),
    telefono_present: Boolean(telefono),
    extras_keys: Object.keys(extras),
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  // Il canale Zapier oggi puo' essere volutamente off (env var vuota): in quel caso
  // il fallimento "lead_lost" va considerato solo se anche Resend fallisce.
  if (!mailResult.ok && !zapierResult.ok && zapierResult.err !== 'zapier_agevolazioni_url_missing') {
    console.error(JSON.stringify({
      event: 'lead_lost_agevolazioni',
      timestamp,
      lead,
      mail_err: mailResult.err,
      zapier_err: zapierResult.err,
    }));
  } else if (!mailResult.ok && zapierResult.err === 'zapier_agevolazioni_url_missing') {
    // Resend fallita e Zapier non configurato: il lead arriva solo nei log. Lo segnaliamo.
    console.error(JSON.stringify({
      event: 'lead_lost_agevolazioni',
      timestamp,
      lead,
      mail_err: mailResult.err,
      zapier_err: 'zapier_not_configured',
    }));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
