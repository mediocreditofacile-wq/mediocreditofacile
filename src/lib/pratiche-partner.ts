// Logica condivisa dei portali partner con caricamento pratiche
// (Expo Energia, Stilo, e i prossimi). Gli endpoint /api/submit-<slug>.ts
// sono involucri sottili che passano qui il partner e le note di lavorazione.
//
// Cosa fa per ogni pratica ricevuta:
//  - assegna un id leggibile (<PREFISSO>-AAAAMMGG-HHMMSS) e salva il record JSON
//    su Vercel Blob (store privato), che alimenta la lista richieste del portale
//  - manda una mail Resend a MCF con dati pratica, checklist e link ai documenti
//  - inoltra a Zapier (se ZAPIER_WEBHOOK_URL valorizzata) per Pipedrive
// I documenti NON passano da qui: il browser li carica direttamente su Blob via
// /api/blob-upload (limite body 4,5 MB delle serverless) e qui arrivano gli URL.

import { put } from '@vercel/blob';
import { pathPrefix, type PortalePartner } from '../data/portali-partner';

export interface DocumentoPratica {
  nome: string;
  pathname: string;
  size: number;
}

export interface PraticaLead {
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
}

export interface OpzioniPratica {
  /** Documenti sempre richiesti oltre alla base (es. preventivo fornitore) */
  documentiExtra?: string[];
  /** Riga di lavorazione interna in fondo alla mail: dove va caricata la pratica */
  notaLavorazione: string;
}

function escapeHtml(value: string): string {
  return value.replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = { '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;' };
    return map[c] || c;
  });
}

// Checklist documenti: base sempre richiesta, reddituali sopra 10.000 €
// differenziati per forma giuridica (stessa logica dell'area Edilizia GIERRE).
export function buildChecklist(formaGiuridica: string, importoNum: number, extra: string[] = []): string[] {
  const base = [
    'Visura camerale (o visura ditta individuale)',
    'Carta d\'identita\' del legale rappresentante / titolare',
    'Tessera sanitaria / codice fiscale',
    'Coordinate IBAN aziendali',
    'Email aziendale',
    'Cellulare del referente',
    ...extra,
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

// Id pratica leggibile: <PREFISSO>-AAAAMMGG-HHMMSS (ora italiana)
function generaId(prefisso: string): string {
  const rome = new Date(new Date().toLocaleString('en-US', { timeZone: 'Europe/Rome' }));
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${prefisso}-${rome.getFullYear()}${pad(rome.getMonth() + 1)}${pad(rome.getDate())}-${pad(rome.getHours())}${pad(rome.getMinutes())}${pad(rome.getSeconds())}`;
}

// Il record su Blob e' quello che alimenta la sezione "Le tue richieste" del portale
async function savePraticaRecord(
  partner: PortalePartner,
  id: string,
  lead: PraticaLead,
  documenti: DocumentoPratica[],
): Promise<{ ok: boolean; err?: string }> {
  const token = import.meta.env.BLOB_READ_WRITE_TOKEN as string | undefined;
  if (!token) return { ok: false, err: 'blob_token_missing' };

  const adesso = new Date().toISOString();
  const record = {
    id,
    partner: partner.slug,
    creato: adesso,
    stato: 'Ricevuta',
    statoAggiornato: adesso,
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
    await put(`${pathPrefix(partner.slug)}${id}/pratica.json`, JSON.stringify(record, null, 2), {
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
  partner: PortalePartner,
  lead: PraticaLead,
  checklist: string[],
  id: string,
  documenti: DocumentoPratica[],
  notaLavorazione: string,
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
    subject: `Nuova pratica ${partner.nome} ${id} — ${lead.ragione_sociale || 'cliente non indicato'} — ${importoFmt}`,
    html: `
      <div style="font-family:system-ui,sans-serif;max-width:640px">
        <p style="font-size:13px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
          Portale Partner ${escapeHtml(partner.nome)} — Pratica ${escapeHtml(id)}
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
          ${escapeHtml(notaLavorazione)}<br>
          Lo stato della pratica si aggiorna dal portale /tools/${partner.slug} entrando con l'account admin: il partner lo vede nella sua lista richieste.<br>
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

/** Gestisce il POST del form pratica di un portale partner. */
export async function gestisciPratica(
  request: Request,
  partner: PortalePartner,
  opzioni: OpzioniPratica,
): Promise<Response> {
  const data = await request.formData();
  const honeypot = (data.get('website') as string | null) ?? '';
  const timestamp = new Date().toISOString();
  const evento = partner.slug.replace(/-/g, '');

  if (honeypot) {
    console.warn(JSON.stringify({ event: 'form_rejected', reason: 'honeypot', fonte: partner.slug, timestamp }));
    return new Response(JSON.stringify({ ok: true }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  }

  const campo = (nome: string) => ((data.get(nome) as string | null) ?? '').trim();
  const lead: PraticaLead = {
    ragione_sociale: campo('ragione_sociale'),
    forma_giuridica: campo('forma_giuridica'),
    piva: campo('piva'),
    referente: campo('referente'),
    telefono: campo('telefono'),
    email: campo('email'),
    tipologia: campo('tipologia'),
    bene_descrizione: campo('bene_descrizione'),
    importo: campo('importo'),
    durata: campo('durata'),
    canone_simulato: campo('canone_simulato'),
    note: campo('note'),
  };

  // Validazione minima: serve almeno ragione sociale + un canale di contatto.
  if (!lead.ragione_sociale || (!lead.telefono && !lead.email)) {
    console.warn(JSON.stringify({
      event: `form_rejected_${evento}`,
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

  // Documenti gia' caricati su Blob dal browser: qui arriva solo l'elenco
  let documenti: DocumentoPratica[] = [];
  try {
    const parsed = JSON.parse((data.get('documenti') as string | null) ?? '[]');
    if (Array.isArray(parsed)) {
      documenti = parsed
        .filter((d) => d && typeof d.pathname === 'string' && d.pathname.startsWith(pathPrefix(partner.slug)))
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

  const importoNum = parseFloat(lead.importo) || 0;
  const checklist = buildChecklist(lead.forma_giuridica, importoNum, opzioni.documentiExtra);
  const id = generaId(partner.prefissoPratica);

  // "nome" compatto cosi' Pipedrive crea il record con un titolo leggibile.
  data.set('nome', `${lead.ragione_sociale} — ${partner.nome} (partner)`);
  data.set('fonte', partner.slug);
  data.set('pratica_id', id);

  const [recordResult, mailResult, zapierResult] = await Promise.all([
    savePraticaRecord(partner, id, lead, documenti),
    sendResendEmail(partner, lead, checklist, id, documenti, opzioni.notaLavorazione),
    sendZapierWebhook(data),
  ]);

  console.log(JSON.stringify({
    event: `form_submitted_${evento}`,
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
      event: `lead_lost_${evento}`,
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
