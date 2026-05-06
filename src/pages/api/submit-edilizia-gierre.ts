export const prerender = false;

// Endpoint dedicato all'area pratiche di Edilizia GIERRE SRL (/tools/edilizia-gierre).
// Riceve i dati di una pratica di noleggio operativo caricata dal partner e:
//  - manda una mail Resend completa a MCF con tutti i dati pratica + checklist documenti
//  - inoltra a Zapier (se ZAPIER_WEBHOOK_URL valorizzata) cosi' il lead entra in Pipedrive
//  - logga eventi separati (form_submitted_edilizia / lead_lost_edilizia) per filtrarli nei log

interface EdiliziaLead {
  partner: string;
  ragione_sociale: string;
  forma_giuridica: string;
  piva: string;
  referente: string;
  telefono: string;
  email: string;
  bene_descrizione: string;
  fornitore: string;
  importo: string;
  durata: string;
  note: string;
  fonte: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

// Calcola la checklist documenti che il referente deve recuperare dal cliente finale.
// Logica: base sempre richiesta, reddituali sopra 10.000 € e differenziati per forma giuridica.
function buildChecklist(formaGiuridica: string, importoNum: number): string[] {
  const base = [
    'Visura camerale (o visura ditta individuale)',
    'Carta d\'identita\' del legale rappresentante / titolare',
    'Tessera sanitaria / codice fiscale',
    'Coordinate IBAN aziendali',
    'Email aziendale',
    'Cellulare del referente',
  ];

  if (importoNum <= 10000) return base;

  const fg = formaGiuridica.toLowerCase();
  if (fg.includes('individuale') || fg.includes('autonomo') || fg === 'di') {
    return [
      ...base,
      'Ultime 2 dichiarazioni dei redditi (Modello Unico)',
      'Situazione contabile aggiornata 2025',
    ];
  }

  // SRL / SPA / SAPA / SNC / SAS / cooperative: documenti societari
  return [
    ...base,
    'Ultimi 2 bilanci depositati',
    'Bilancio definitivo 2025 (anche pre-deposito)',
  ];
}

async function sendResendEmail(lead: EdiliziaLead, checklist: string[]): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const importoFmt = lead.importo
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseFloat(lead.importo) || 0)
    : '-';

  const checklistRows = checklist
    .map((d) => `<li style="padding:2px 0">${escapeHtml(d)}</li>`)
    .join('');

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: ['mediocreditofacile@gmail.com'],
    subject: `Nuova pratica Edilizia GIERRE — ${lead.ragione_sociale || 'cliente non indicato'} — ${importoFmt}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Area Partner Edilizia GIERRE SRL
        </p>
        <h2 style="color:#664CCD;margin:0 0 16px">Nuova pratica caricata dal partner</h2>

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Dati cliente finale</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 12px 4px 0;width:170px"><strong>Ragione sociale</strong></td><td>${escapeHtml(lead.ragione_sociale || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Forma giuridica</strong></td><td>${escapeHtml(lead.forma_giuridica || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>P.IVA / CF</strong></td><td>${escapeHtml(lead.piva || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Referente</strong></td><td>${escapeHtml(lead.referente || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Telefono</strong></td><td>${escapeHtml(lead.telefono || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Email</strong></td><td>${escapeHtml(lead.email || '-')}</td></tr>
        </table>

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Bene da noleggiare</h3>
        <table style="font-size:14px;border-collapse:collapse;width:100%">
          <tr><td style="padding:4px 12px 4px 0;width:170px"><strong>Descrizione</strong></td><td>${escapeHtml(lead.bene_descrizione || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Fornitore</strong></td><td>${escapeHtml(lead.fornitore || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Importo bene</strong></td><td>${escapeHtml(importoFmt)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Durata noleggio</strong></td><td>${escapeHtml(lead.durata || '-')} mesi</td></tr>
        </table>

        ${lead.note ? `
          <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Note del partner</h3>
          <p style="font-size:14px;color:#444451;line-height:1.5;margin:0;white-space:pre-wrap">${escapeHtml(lead.note)}</p>
        ` : ''}

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Documenti da raccogliere</h3>
        <ul style="font-size:14px;color:#444451;line-height:1.5;padding-left:20px;margin:0">
          ${checklistRows}
        </ul>

        <p style="font-size:12px;color:#787782;margin-top:28px;border-top:1px solid #E1DEE3;padding-top:12px">
          Inoltrare a Alba Leasing (Master Rent Edilizia GIERRE — Cerved 4) oppure ruotare su ReteRent / PagaRent in base al merito.<br>
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
    console.warn(JSON.stringify({ event: 'form_rejected', reason: 'honeypot', fonte: 'edilizia-gierre', timestamp }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const lead: EdiliziaLead = {
    partner: 'Edilizia GIERRE SRL',
    ragione_sociale: ((data.get('ragione_sociale') as string | null) ?? '').trim(),
    forma_giuridica: ((data.get('forma_giuridica') as string | null) ?? '').trim(),
    piva: ((data.get('piva') as string | null) ?? '').trim(),
    referente: ((data.get('referente') as string | null) ?? '').trim(),
    telefono: ((data.get('telefono') as string | null) ?? '').trim(),
    email: ((data.get('email') as string | null) ?? '').trim(),
    bene_descrizione: ((data.get('bene_descrizione') as string | null) ?? '').trim(),
    fornitore: ((data.get('fornitore') as string | null) ?? '').trim(),
    importo: ((data.get('importo') as string | null) ?? '').trim(),
    durata: ((data.get('durata') as string | null) ?? '').trim(),
    note: ((data.get('note') as string | null) ?? '').trim(),
    fonte: 'edilizia-gierre',
  };

  // Validazione minima: serve almeno ragione sociale + un canale di contatto.
  if (!lead.ragione_sociale || (!lead.telefono && !lead.email)) {
    console.warn(JSON.stringify({
      event: 'form_rejected_edilizia',
      reason: 'missing_required',
      timestamp,
      has_ragione_sociale: Boolean(lead.ragione_sociale),
      has_telefono: Boolean(lead.telefono),
      has_email: Boolean(lead.email),
    }));
    return new Response(JSON.stringify({ ok: false, error: 'invalid' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  // Calcolo checklist documenti dinamica
  const importoNum = parseFloat(lead.importo) || 0;
  const checklist = buildChecklist(lead.forma_giuridica, importoNum);

  // Mando "nome" a Zapier compatto cosi' Pipedrive crea il record con un titolo leggibile.
  data.set('nome', `${lead.ragione_sociale} — Edilizia GIERRE (partner)`);
  data.set('fonte', 'edilizia-gierre');

  const [mailResult, zapierResult] = await Promise.all([
    sendResendEmail(lead, checklist),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted_edilizia',
    timestamp,
    ragione_sociale: lead.ragione_sociale.slice(0, 60),
    forma_giuridica: lead.forma_giuridica,
    importo: lead.importo,
    durata: lead.durata,
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  if (!mailResult.ok && !zapierResult.ok) {
    console.error(JSON.stringify({
      event: 'lead_lost_edilizia',
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
