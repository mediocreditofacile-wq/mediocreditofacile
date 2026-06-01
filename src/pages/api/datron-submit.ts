export const prerender = false;

interface DatronLead {
  ragione_sociale: string;
  partita_iva: string;
  settore: string;
  nome_referente: string;
  email: string;
  telefono: string;
  regione: string;
  note: string;
  configurazione: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

function row(label: string, value: string): string {
  return `<tr><td style="padding:6px 14px 6px 0;color:#444;vertical-align:top"><strong>${escapeHtml(label)}</strong></td><td style="padding:6px 0;color:#1A1A1A">${escapeHtml(value || '-')}</td></tr>`;
}

async function sendResendEmail(lead: DatronLead): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const html = `
    <div style="font-family:system-ui,sans-serif;max-width:640px">
      <h2 style="color:#0E3A5F;margin:0 0 4px 0">Nuova richiesta Datron</h2>
      <p style="color:#787782;margin:0 0 18px 0;font-size:14px">Lead arrivato dalla landing riservata /tools/datron.</p>

      <h3 style="color:#0E3A5F;margin:18px 0 6px 0;font-size:16px">Cliente</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${row('Ragione sociale', lead.ragione_sociale)}
        ${row('Partita IVA', lead.partita_iva)}
        ${row('Settore', lead.settore)}
        ${row('Regione', lead.regione)}
      </table>

      <h3 style="color:#0E3A5F;margin:18px 0 6px 0;font-size:16px">Referente</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${row('Nome', lead.nome_referente)}
        ${row('Email', lead.email)}
        ${row('Telefono', lead.telefono)}
      </table>

      <h3 style="color:#0E3A5F;margin:18px 0 6px 0;font-size:16px">Contesto</h3>
      <table style="font-size:14px;border-collapse:collapse;width:100%">
        ${row('Configurazione simulata', lead.configurazione)}
        ${row('Note', lead.note)}
        ${row('Ora', new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' }))}
      </table>

      <p style="font-size:12px;color:#787782;margin-top:22px">Notifica diretta via Resend, indipendente da Zapier.</p>
    </div>
  `;

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${key}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'Mediocredito Facile <onboarding@resend.dev>',
        to: ['mediocreditofacile@gmail.com'],
        subject: `Nuova richiesta Datron - ${lead.ragione_sociale || 'lead anonimo'}`,
        html,
      }),
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
  const url = (import.meta.env.ZAPIER_DATRON_WEBHOOK_URL as string | undefined)
    ?? (import.meta.env.ZAPIER_DUPLEX_WEBHOOK_URL as string | undefined);
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

export async function POST({ request }: { request: Request }) {
  const data = await request.formData();
  const honeypot = (data.get('website') as string | null) ?? '';
  const timestamp = new Date().toISOString();

  if (honeypot) {
    console.warn(JSON.stringify({ event: 'form_rejected_datron', reason: 'honeypot', timestamp }));
    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  const lead: DatronLead = {
    ragione_sociale: ((data.get('ragione_sociale') as string | null) ?? '').trim(),
    partita_iva: ((data.get('partita_iva') as string | null) ?? '').trim(),
    settore: ((data.get('settore') as string | null) ?? '').trim(),
    nome_referente: ((data.get('nome_referente') as string | null) ?? '').trim(),
    email: ((data.get('email') as string | null) ?? '').trim(),
    telefono: ((data.get('telefono') as string | null) ?? '').trim(),
    regione: ((data.get('regione') as string | null) ?? '').trim(),
    note: ((data.get('note') as string | null) ?? '').trim(),
    configurazione: ((data.get('configurazione') as string | null) ?? '').trim(),
  };

  if (!lead.ragione_sociale || !lead.email || !lead.telefono) {
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  if (!data.get('fonte')) data.append('fonte', 'datron');
  if (!data.get('nome')) data.append('nome', `${lead.ragione_sociale} - Datron (landing)`);

  const [mailResult, zapierResult] = await Promise.all([
    sendResendEmail(lead),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted_datron',
    timestamp,
    ragione: lead.ragione_sociale.slice(0, 60),
    email: lead.email.slice(0, 80),
    telefono_present: Boolean(lead.telefono),
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
