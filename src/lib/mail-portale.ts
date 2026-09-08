// Invio email dei portali con utenti nominali (oggi Green-Go).
//
// ATTENZIONE — FILE SERVER-ONLY: legge la chiave Resend.
//
// Mittente su dominio verificato: Resend rifiuta gli indirizzi gmail.com.
// Il reply-to va sulla casella di Alberto, cosi' se un agente risponde a un
// invito la risposta arriva a qualcuno invece di perdersi in un no-reply.
//
// Il piano Resend gratuito ha un tetto di 100 email al giorno e 3.000 al mese:
// per questo l'esito distingue "fallito" da "ritentabile", e la coda degli
// inviti (src/lib/inviti.ts) rimette in fila i secondi invece di bruciarli.

import { env } from './db';

export const MITTENTE = 'Mediocredito Facile <no-reply@mediocreditofacile.it>';
export const REPLY_TO = 'mediocreditofacile@gmail.com';
/** Casella che riceve le notifiche interne */
export const DESTINATARIO_MCF = 'mediocreditofacile@gmail.com';

export interface EsitoMail {
  ok: boolean;
  id?: string;
  err?: string;
  /** true quando ha senso riprovare piu' tardi: tetto giornaliero o rete */
  ritentabile?: boolean;
}

export interface Allegato {
  filename: string;
  /** contenuto in base64 */
  content: string;
}

export async function inviaMail(opts: {
  to: string | string[];
  subject: string;
  html: string;
  allegati?: Allegato[];
  replyTo?: string;
}): Promise<EsitoMail> {
  const key = env('RESEND_API_KEY');
  if (!key) return { ok: false, err: 'resend_key_missing', ritentabile: true };

  const body = {
    from: MITTENTE,
    to: Array.isArray(opts.to) ? opts.to : [opts.to],
    reply_to: opts.replyTo ?? REPLY_TO,
    subject: opts.subject,
    html: opts.html,
    ...(opts.allegati?.length ? { attachments: opts.allegati } : {}),
  };

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    const testo = await res.text();
    if (!res.ok) {
      // 429 e' il rate limit, 5xx e' un guaio loro: in entrambi i casi si riprova.
      const ritentabile = res.status === 429 || res.status >= 500;
      return { ok: false, err: `resend_${res.status}: ${testo.slice(0, 200)}`, ritentabile };
    }
    let id: string | undefined;
    try {
      id = JSON.parse(testo)?.id;
    } catch {
      /* la mail e' partita comunque: l'id serve solo per i log */
    }
    return { ok: true, id };
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'unknown';
    return { ok: false, err: `resend_exception: ${msg}`, ritentabile: true };
  }
}

/** Difesa minima contro l'HTML iniettato nei nomi che arrivano dal form */
export function escapeHtml(value: unknown): string {
  return String(value ?? '').replace(/[<>&"']/g, (c) => {
    const map: Record<string, string> = {
      '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&#39;',
    };
    return map[c] || c;
  });
}

/**
 * Involucro grafico comune. Volutamente sobrio: e' una mail transazionale,
 * non una comunicazione commerciale.
 */
export function layoutMail(titolo: string, corpo: string): string {
  return `
    <div style="font-family:system-ui,-apple-system,'Segoe UI',sans-serif;max-width:560px;margin:0 auto;color:#444451">
      <p style="font-size:12px;color:#787782;text-transform:uppercase;letter-spacing:0.1em;margin:0 0 8px">
        Mediocredito Facile
      </p>
      <h1 style="color:#664CCD;font-size:20px;margin:0 0 20px;font-weight:700">${escapeHtml(titolo)}</h1>
      ${corpo}
      <p style="font-size:12px;color:#787782;margin-top:32px;border-top:1px solid #E1DEE3;padding-top:12px">
        Mediocredito Facile di Alberto Amà, intermediario del credito.<br>
        Se non aspettavi questo messaggio, rispondi a questa email e ce ne occupiamo.
      </p>
    </div>
  `;
}
