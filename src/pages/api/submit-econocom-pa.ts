export const prerender = false;

/**
 * Endpoint dedicato all'area Econocom PA (/tools/econocom-pa).
 * Riceve i dati di un progetto da valutare con Econocom per la Pubblica
 * Amministrazione (parcheggi fotovoltaici, riqualificazione energetica, ecc.)
 * e:
 *  - manda una mail Resend completa a MCF con tutti i dati progetto + vincoli accettati
 *  - inoltra a Zapier (se ZAPIER_WEBHOOK_URL valorizzata) cosi' il lead entra in Pipedrive
 *  - logga eventi separati (form_submitted_econocompa / lead_lost_econocompa) per filtrarli nei log
 *
 * Le pratiche poi vengono inviate da Alberto a Luca Silvestrin (Econocom) per
 * la valutazione di fattibilita' e la quotazione su misura.
 */

interface EconocomPALead {
  partner: string;
  ente_nome: string;
  ente_tipo: string;
  referente: string;
  ruolo: string;
  telefono: string;
  email: string;
  tipo_intervento: string;
  importo: string;
  descrizione: string;
  vincolo_cessione: string;
  vincolo_appalti: string;
  vincolo_condizioni: string;
  fonte: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = {
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
    };
    return map[c] || c;
  });
}

async function sendResendEmail(lead: EconocomPALead): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const importoFmt = lead.importo
    ? new Intl.NumberFormat('it-IT', {
        style: 'currency', currency: 'EUR', maximumFractionDigits: 0,
      }).format(parseFloat(lead.importo) || 0)
    : '-';

  const flag = (v: string) => (v === 'on' || v === 'true' ? 'Si\' confermato' : 'NON confermato');
  const vincoloCessione = flag(lead.vincolo_cessione);
  const vincoloAppalti = flag(lead.vincolo_appalti);
  const vincoloCondizioni = flag(lead.vincolo_condizioni);

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: ['mediocreditofacile@gmail.com'],
    subject: `Nuovo progetto Econocom PA — ${lead.ente_nome || 'ente non indicato'} — ${importoFmt}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:660px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Area Partner Econocom — Pubblica Amministrazione
        </p>
        <h2 style="color:#1e40af;margin:0 0 16px">Nuovo progetto da valutare con Econocom</h2>

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Ente / Stazione appaltante</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 12px 4px 0;width:170px"><strong>Denominazione</strong></td><td>${escapeHtml(lead.ente_nome || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Tipologia</strong></td><td>${escapeHtml(lead.ente_tipo || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Referente</strong></td><td>${escapeHtml(lead.referente || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Ruolo</strong></td><td>${escapeHtml(lead.ruolo || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Telefono</strong></td><td>${escapeHtml(lead.telefono || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${escapeHtml(lead.email || '-')}</td></tr>
        </table>

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Progetto</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 12px 4px 0;width:170px"><strong>Tipo intervento</strong></td><td>${escapeHtml(lead.tipo_intervento || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Importo previsto</strong></td><td>${escapeHtml(importoFmt)}</td></tr>
        </table>

        ${lead.descrizione ? `
          <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Descrizione</h3>
          <p style="font-size:14px;color:#444451;line-height:1.55;margin:0;white-space:pre-wrap">${escapeHtml(lead.descrizione)}</p>
        ` : ''}

        <h3 style="color:#0F1020;font-size:15px;margin:24px 0 8px">Vincoli operativi — presa visione del partner</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr>
            <td style="padding:4px 12px 4px 0;width:380px">Cessione del contratto da Econocom a societa' di locazione</td>
            <td><strong style="color:${vincoloCessione.startsWith('Si') ? '#047857' : '#b91c1c'}">${vincoloCessione}</strong></td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0">Operazione non soggetta al codice degli appalti</td>
            <td><strong style="color:${vincoloAppalti.startsWith('Si') ? '#047857' : '#b91c1c'}">${vincoloAppalti}</strong></td>
          </tr>
          <tr>
            <td style="padding:4px 12px 4px 0">Accettazione delle condizioni generali della societa' di locazione</td>
            <td><strong style="color:${vincoloCondizioni.startsWith('Si') ? '#047857' : '#b91c1c'}">${vincoloCondizioni}</strong></td>
          </tr>
        </table>

        <p style="font-size:12px;color:#787782;margin-top:28px;border-top:1px solid #E1DEE3;padding-top:12px">
          Da inoltrare a Luca Silvestrin (Econocom) per valutazione di fattibilita' e quotazione su misura.<br>
          Ricevuta: ${new Date().toLocaleString('it-IT', { timeZone: 'Europe/Rome' })}
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

export async function POST({ request }: { request: Request }) {
  const data = await request.formData();
  const honeypot = (data.get('website') as string | null) ?? '';
  const timestamp = new Date().toISOString();

  if (honeypot) {
    console.warn(JSON.stringify({ event: 'form_rejected', reason: 'honeypot', fonte: 'econocom-pa', timestamp }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const lead: EconocomPALead = {
    partner: 'Arca Energia — area Econocom PA',
    ente_nome: ((data.get('ente_nome') as string | null) ?? '').trim(),
    ente_tipo: ((data.get('ente_tipo') as string | null) ?? '').trim(),
    referente: ((data.get('referente') as string | null) ?? '').trim(),
    ruolo: ((data.get('ruolo') as string | null) ?? '').trim(),
    telefono: ((data.get('telefono') as string | null) ?? '').trim(),
    email: ((data.get('email') as string | null) ?? '').trim(),
    tipo_intervento: ((data.get('tipo_intervento') as string | null) ?? '').trim(),
    importo: ((data.get('importo') as string | null) ?? '').trim(),
    descrizione: ((data.get('descrizione') as string | null) ?? '').trim(),
    vincolo_cessione: ((data.get('vincolo_cessione') as string | null) ?? '').trim(),
    vincolo_appalti: ((data.get('vincolo_appalti') as string | null) ?? '').trim(),
    vincolo_condizioni: ((data.get('vincolo_condizioni') as string | null) ?? '').trim(),
    fonte: 'econocom-pa',
  };

  // Validazione minima: serve almeno il nome ente + un canale di contatto.
  if (!lead.ente_nome || (!lead.telefono && !lead.email)) {
    console.warn(JSON.stringify({
      event: 'form_rejected_econocompa',
      reason: 'missing_required',
      timestamp,
      has_ente: Boolean(lead.ente_nome),
      has_telefono: Boolean(lead.telefono),
      has_email: Boolean(lead.email),
    }));
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Mando "nome" a Zapier compatto cosi' Pipedrive crea il record con un titolo leggibile.
  data.set('nome', `${lead.ente_nome} — Econocom PA (Arca Energia)`);
  data.set('fonte', 'econocom-pa');

  const [mailResult, zapierResult] = await Promise.all([
    sendResendEmail(lead),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted_econocompa',
    timestamp,
    ente_nome: lead.ente_nome.slice(0, 80),
    ente_tipo: lead.ente_tipo,
    importo: lead.importo,
    tipo_intervento: lead.tipo_intervento,
    vincoli_ok: [lead.vincolo_cessione, lead.vincolo_appalti, lead.vincolo_condizioni].every((v) => v === 'on' || v === 'true'),
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  if (!mailResult.ok && !zapierResult.ok) {
    console.error(JSON.stringify({
      event: 'lead_lost_econocompa',
      timestamp,
      lead,
      mail_err: mailResult.err,
      zapier_err: zapierResult.err,
    }));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
