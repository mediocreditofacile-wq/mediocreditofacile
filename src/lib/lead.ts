// Ricezione dei lead dai form del sito: mail Resend e webhook Zapier in parallelo.
// Estratto da src/pages/api/submit.ts il 23/09/2026 perche' lo usa anche
// /api/fiera-lead: la stessa consegna, non una copia.
//
// SERVER-ONLY: legge le chiavi Resend e Zapier.

interface Lead {
  nome: string;
  email: string;
  telefono: string;
  fonte: string;
  variante: string;
  /** Campi aggiuntivi dei form che raccolgono piu' dei quattro base (es. /fiera) */
  extra: [string, string][];
}

// Campi gia' stampati nella mail o che non vanno mostrati
const CAMPI_NOTI = new Set(['nome', 'email', 'telefono', 'fonte', 'variante', 'website']);

export function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

async function sendResendEmail(lead: Lead): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: ['mediocreditofacile@gmail.com'],
    subject: `Nuovo lead dal sito — ${lead.fonte || 'pagina generica'}`,
    html: `
      <h2 style="font-family:system-ui,sans-serif;color:#664CCD">Nuovo lead dal sito</h2>
      <table style="font-family:system-ui,sans-serif;font-size:15px;border-collapse:collapse">
        <tr><td style="padding:4px 12px 4px 0"><strong>Nome</strong></td><td>${escapeHtml(lead.nome)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${escapeHtml(lead.email)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Telefono</strong></td><td>${escapeHtml(lead.telefono)}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Fonte</strong></td><td>${escapeHtml(lead.fonte || '-')}</td></tr>
        <tr><td style="padding:4px 12px 4px 0"><strong>Form</strong></td><td>${escapeHtml(lead.variante || 'primary')}</td></tr>
        ${lead.extra.map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0"><strong>${escapeHtml(k)}</strong></td><td>${escapeHtml(v)}</td></tr>`).join('')}
        <tr><td style="padding:4px 12px 4px 0"><strong>Ora</strong></td><td>${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}</td></tr>
      </table>
      <p style="font-family:system-ui,sans-serif;font-size:13px;color:#787782;margin-top:24px">Notifica diretta via Resend, indipendente da Zapier.</p>
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
  const url = import.meta.env.ZAPIER_WEBHOOK_URL as string | undefined;
  if (!url) return { ok: false, err: 'zapier_url_missing' };

  try {
    const res = await fetch(url, { method: 'POST', body: form });
    if (!res.ok) return { ok: false, err: `zapier_${res.status}` };
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `zapier_exception: ${msg}` };
  }
}

/**
 * Riceve un lead da un form: honeypot, validazione minima, mail Resend e Zapier
 * in parallelo, log. Restituisce la risposta da dare al browser e se la mail e'
 * partita, cosi' chi la chiama puo' decidere cosa fare dopo (es. /fiera, che a
 * lead consegnato estende l'uso dello strumento).
 */
export async function riceviLead(data: FormData): Promise<{ response: Response; consegnato: boolean }> {
  const nome = (data.get('nome') as string | null)?.trim() ?? '';
  const email = (data.get('email') as string | null)?.trim() ?? '';
  const telefono = (data.get('telefono') as string | null)?.trim() ?? '';
  const honeypot = (data.get('website') as string | null) ?? '';
  const fonte = (data.get('fonte') as string | null) ?? '';
  const variante = (data.get('variante') as string | null) ?? 'primary';
  const timestamp = new Date().toISOString();

  // Honeypot compilato: probabile bot. Rispondiamo 200 per non dare segnale, ma logghiamo.
  if (honeypot) {
    console.warn(JSON.stringify({ event: 'form_rejected', reason: 'honeypot', fonte, timestamp }));
    return {
      consegnato: false,
      response: new Response(JSON.stringify({ ok: true }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  // Campi minimi mancanti: rigetto vero. Logghiamo per capire se un form invia dati con nome diverso.
  if (!nome) {
    console.warn(JSON.stringify({
      event: 'form_rejected',
      reason: 'missing_nome',
      fonte,
      timestamp,
      has_email: Boolean(email),
      has_telefono: Boolean(telefono),
    }));
    return {
      consegnato: false,
      response: new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      }),
    };
  }

  // Tutto cio' che il form manda oltre ai campi base finisce nella mail: con
  // Zapier fuori dallo stack, la mail e' l'unico posto dove il lead arriva intero.
  const extra: [string, string][] = [];
  for (const [k, v] of data.entries()) {
    if (CAMPI_NOTI.has(k) || typeof v !== 'string' || !v.trim()) continue;
    extra.push([k.slice(0, 40), v.trim().slice(0, 1000)]);
  }

  const lead: Lead = { nome, email, telefono, fonte, variante, extra };

  // Tento entrambi i canali in parallelo. Nessuno blocca l'altro.
  const [mailResult, zapierResult] = await Promise.all([
    sendResendEmail(lead),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted',
    timestamp,
    fonte,
    variante,
    nome: nome.slice(0, 60),
    email: email.slice(0, 80),
    telefono_present: Boolean(telefono),
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  // Se entrambi falliscono, logghiamo il lead completo per recupero manuale.
  if (!mailResult.ok && !zapierResult.ok) {
    console.error(JSON.stringify({
      event: 'lead_lost',
      timestamp,
      lead,
      mail_err: mailResult.err,
      zapier_err: zapierResult.err,
    }));
  }

  // Sempre 200 al browser: la UX non deve cambiare anche se un canale di delivery fallisce.
  // `consegnato` dice se la mail e' partita: i form che hanno un ripiego (es. /fiera
  // propone WhatsApp) lo leggono, gli altri lo ignorano. Guarda solo Resend perche'
  // Zapier non fa piu' parte dello stack: un webhook ancora vivo risponderebbe 200
  // senza che il lead arrivi a nessuno.
  const consegnato = mailResult.ok;
  return {
    consegnato,
    response: new Response(JSON.stringify({ ok: true, consegnato }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    }),
  };
}
