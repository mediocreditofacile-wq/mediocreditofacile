export const prerender = false;

// Endpoint dedicato al portale partner Expo Energia Srl (/tools/expo-energia).
// Riceve i dati di una pratica di noleggio operativo caricata dal partner e:
//  - assegna un id pratica (EE-data-ora) e salva il record JSON su Vercel Blob
//    (store privato) cosi' il partner vede la lista richieste e lo stato nel portale
//  - manda una mail Resend completa a MCF con dati pratica + checklist + link ai documenti
//  - inoltra a Zapier (se ZAPIER_WEBHOOK_URL valorizzata) cosi' il lead entra in Pipedrive
//  - logga eventi separati (form_submitted_expoenergia / lead_lost_expoenergia) per filtrarli nei log
// I documenti NON passano da qui: il browser li carica direttamente su Blob via
// /api/blob-upload (limite body 4,5 MB delle serverless) e qui arrivano solo gli URL.

import { put } from '@vercel/blob';

interface DocumentoPratica {
  nome: string;
  pathname: string;
  size: number;
}

interface ExpoEnergiaLead {
  partner: string;
  ragione_sociale: string;
  forma_giuridica: string;
  piva: string;
  referente: string;
  telefono: string;
  email: string;
  tipologia: string;
  bene_descrizione: string;
  importo: string;
  durata: string;
  canone_simulato: string;
  note: string;
  fonte: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

// Checklist documenti: base sempre richiesta, reddituali sopra 10.000 €
// differenziati per forma giuridica (stessa logica dell'area Edilizia GIERRE).
function buildChecklist(formaGiuridica: string, importoNum: number): string[] {
  const base = [
    'Visura camerale (o visura ditta individuale)',
    'Carta d\'identita\' del legale rappresentante / titolare',
    'Tessera sanitaria / codice fiscale',
    'Coordinate IBAN aziendali',
    'Email aziendale',
    'Cellulare del referente',
    'Preventivo del fornitore dell\'impianto / del bene',
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

  return [
    ...base,
    'Ultimi 2 bilanci depositati',
    'Bilancio definitivo 2025 (anche pre-deposito)',
  ];
}

// Salva il record pratica su Blob: e' quello che alimenta la sezione
// "Le tue richieste" del portale (lista + stato).
async function savePraticaRecord(
  id: string,
  lead: ExpoEnergiaLead,
  documenti: DocumentoPratica[],
): Promise<{ ok: boolean; err?: string }> {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return { ok: false, err: 'blob_token_missing' };

  const record = {
    id,
    partner: 'expo-energia',
    creato: new Date().toISOString(),
    stato: 'Ricevuta',
    statoAggiornato: new Date().toISOString(),
    cliente: {
      ragione_sociale: lead.ragione_sociale,
      forma_giuridica: lead.forma_giuridica,
      piva: lead.piva,
      referente: lead.referente,
      telefono: lead.telefono,
      email: lead.email,
    },
    bene: {
      tipologia: lead.tipologia,
      descrizione: lead.bene_descrizione,
      importo: lead.importo,
      durata: lead.durata,
      canone_simulato: lead.canone_simulato,
    },
    note: lead.note,
    documenti,
  };

  try {
    await put(`pratiche/expo-energia/${id}/pratica.json`, JSON.stringify(record, null, 2), {
      access: 'private',
      contentType: 'application/json',
      addRandomSuffix: false,
      allowOverwrite: true,
      cacheControlMaxAge: 60, // minimo consentito: le letture CDN restano fresche entro 1 minuto
      token,
    });
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `blob_exception: ${msg}` };
  }
}

async function sendResendEmail(
  lead: ExpoEnergiaLead,
  checklist: string[],
  id: string,
  documenti: DocumentoPratica[],
): Promise<{ ok: boolean; err?: string }> {
  const key = import.meta.env.RESEND_API_KEY as string | undefined;
  if (!key) return { ok: false, err: 'resend_key_missing' };

  const importoFmt = lead.importo
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseFloat(lead.importo) || 0)
    : '-';
  const canoneFmt = lead.canone_simulato
    ? new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(parseFloat(lead.canone_simulato) || 0) + '/mese'
    : '-';

  const checklistRows = checklist
    .map((d) => `<li style="padding:2px 0">${escapeHtml(d)}</li>`)
    .join('');

  // Link di download: passano dal proxy /api/pratica-doc con la chiave admin
  // (lo store Blob e' privato, i file non hanno URL pubblici)
  const adminKey = import.meta.env.EXPO_PORTAL_ADMIN_KEY as string | undefined;
  const sizeFmt = (n: number) => (n > 1024 * 1024 ? `${(n / 1024 / 1024).toFixed(1)} MB` : `${Math.round(n / 1024)} KB`);
  const documentiHtml = documenti.length
    ? `
      <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Documenti allegati dal partner (${documenti.length})</h3>
      <ul style="font-size:14px;color:#444451;line-height:1.7;padding-left:20px;margin:0">
        ${documenti.map((d) => {
          const href = `https://www.mediocreditofacile.it/api/pratica-doc?path=${encodeURIComponent(d.pathname)}${adminKey ? `&k=${encodeURIComponent(adminKey)}` : ''}`;
          return `<li><a href="${href}" style="color:#664CCD">${escapeHtml(d.nome)}</a> (${sizeFmt(d.size)})</li>`;
        }).join('')}
      </ul>`
    : `
      <p style="font-size:14px;color:#b45309;background:#fffbeb;border:1px solid #fde68a;border-radius:8px;padding:10px 14px;margin:20px 0 0">
        Nessun documento allegato: da raccogliere con la checklist qui sotto.
      </p>`;

  const body = {
    from: 'Mediocredito Facile <onboarding@resend.dev>',
    to: ['mediocreditofacile@gmail.com'],
    subject: `Nuova pratica Expo Energia ${id} — ${lead.ragione_sociale || 'cliente non indicato'} — ${importoFmt}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Portale Partner Expo Energia Srl — Pratica ${escapeHtml(id)}
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
          <tr><td style="padding:4px 12px 4px 0;width:170px"><strong>Tipologia</strong></td><td>${escapeHtml(lead.tipologia || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Descrizione</strong></td><td>${escapeHtml(lead.bene_descrizione || '-')}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Importo bene</strong></td><td>${escapeHtml(importoFmt)}</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Durata noleggio</strong></td><td>${escapeHtml(lead.durata || '-')} mesi</td></tr>
          <tr><td style="padding:4px 12px 4px 0"><strong>Canone simulato</strong></td><td>${escapeHtml(canoneFmt)}</td></tr>
        </table>

        ${documentiHtml}

        ${lead.note ? `
          <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Note del partner</h3>
          <p style="font-size:14px;color:#444451;line-height:1.5;margin:0;white-space:pre-wrap">${escapeHtml(lead.note)}</p>
        ` : ''}

        <h3 style="color:#0F1020;font-size:15px;margin:20px 0 8px">Documenti da raccogliere</h3>
        <ul style="font-size:14px;color:#444451;line-height:1.5;padding-left:20px;margin:0">
          ${checklistRows}
        </ul>

        <p style="font-size:12px;color:#787782;margin-top:28px;border-top:1px solid #E1DEE3;padding-top:12px">
          Partner: Expo Energia Srl (Massimo Palermo). Caricare su ReteRent (ESG fotovoltaico / Pioneer hardware) o PagaRent in base al merito.<br>
          Lo stato della pratica si aggiorna dal portale /tools/expo-energia entrando con l'account admin: il partner lo vede nella sua lista richieste.<br>
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
    console.warn(JSON.stringify({ event: 'form_rejected', reason: 'honeypot', fonte: 'expo-energia', timestamp }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const lead: ExpoEnergiaLead = {
    partner: 'Expo Energia Srl',
    ragione_sociale: ((data.get('ragione_sociale') as string | null) ?? '').trim(),
    forma_giuridica: ((data.get('forma_giuridica') as string | null) ?? '').trim(),
    piva: ((data.get('piva') as string | null) ?? '').trim(),
    referente: ((data.get('referente') as string | null) ?? '').trim(),
    telefono: ((data.get('telefono') as string | null) ?? '').trim(),
    email: ((data.get('email') as string | null) ?? '').trim(),
    tipologia: ((data.get('tipologia') as string | null) ?? '').trim(),
    bene_descrizione: ((data.get('bene_descrizione') as string | null) ?? '').trim(),
    importo: ((data.get('importo') as string | null) ?? '').trim(),
    durata: ((data.get('durata') as string | null) ?? '').trim(),
    canone_simulato: ((data.get('canone_simulato') as string | null) ?? '').trim(),
    note: ((data.get('note') as string | null) ?? '').trim(),
    fonte: 'expo-energia',
  };

  // Validazione minima: serve almeno ragione sociale + un canale di contatto.
  if (!lead.ragione_sociale || (!lead.telefono && !lead.email)) {
    console.warn(JSON.stringify({
      event: 'form_rejected_expoenergia',
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

  const importoNum = parseFloat(lead.importo) || 0;
  const checklist = buildChecklist(lead.forma_giuridica, importoNum);

  // Documenti gia' caricati su Blob dal browser: qui arriva solo l'elenco
  let documenti: DocumentoPratica[] = [];
  try {
    const raw = (data.get('documenti') as string | null) ?? '[]';
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      documenti = parsed
        .filter((d) => d && typeof d.pathname === 'string' && d.pathname.startsWith('pratiche/expo-energia/'))
        .map((d) => ({
          nome: String(d.nome ?? d.pathname.split('/').pop()),
          pathname: String(d.pathname),
          size: Number(d.size) || 0,
        }))
        .slice(0, 20);
    }
  } catch {
    documenti = [];
  }

  // Id pratica leggibile: EE-AAAAMMGG-HHMMSS (ora italiana)
  const now = new Date();
  const rome = new Date(now.toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  const id = `EE-${rome.getFullYear()}${pad(rome.getMonth() + 1)}${pad(rome.getDate())}-${pad(rome.getHours())}${pad(rome.getMinutes())}${pad(rome.getSeconds())}`;

  // "nome" compatto cosi' Pipedrive crea il record con un titolo leggibile.
  data.set('nome', `${lead.ragione_sociale} — Expo Energia (partner)`);
  data.set('fonte', 'expo-energia');
  data.set('pratica_id', id);

  const [recordResult, mailResult, zapierResult] = await Promise.all([
    savePraticaRecord(id, lead, documenti),
    sendResendEmail(lead, checklist, id, documenti),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: 'form_submitted_expoenergia',
    timestamp,
    pratica_id: id,
    ragione_sociale: lead.ragione_sociale.slice(0, 60),
    forma_giuridica: lead.forma_giuridica,
    tipologia: lead.tipologia,
    importo: lead.importo,
    durata: lead.durata,
    documenti: documenti.length,
    record_ok: recordResult.ok,
    mail_ok: mailResult.ok,
    zapier_ok: zapierResult.ok,
    record_err: recordResult.err,
    mail_err: mailResult.err,
    zapier_err: zapierResult.err,
  }));

  if (!mailResult.ok && !zapierResult.ok) {
    console.error(JSON.stringify({
      event: 'lead_lost_expoenergia',
      timestamp,
      lead,
      mail_err: mailResult.err,
      zapier_err: zapierResult.err,
    }));
  }

  return new Response(JSON.stringify({ ok: true, id }), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}
