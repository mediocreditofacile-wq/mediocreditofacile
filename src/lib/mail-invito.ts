// Testo dell'invito. Sta in un file suo perche' lo usano due strade: la coda
// (src/lib/inviti.ts), che e' quella normale, e sendInvitationEmail di Better
// Auth, che scatta se qualcuno crea un invito passando dalle API di Better Auth
// invece che dalla coda. Un solo testo, due chiamanti.

import { escapeHtml, inviaMail, layoutMail, type EsitoMail } from './mail-portale';

export function mailInvito(opts: {
  a: string;
  invitationId: string;
  organizzazione: string;
  slug: string;
  invitante: string;
  baseUrl: string;
}): Promise<EsitoMail> {
  const url = `${opts.baseUrl}/tools/${opts.slug}?invito=${encodeURIComponent(opts.invitationId)}`;
  return inviaMail({
    to: opts.a,
    subject: `Il tuo accesso al portale ${opts.organizzazione} — Mediocredito Facile`,
    html: layoutMail('Il tuo accesso al portale', `
      <p style="font-size:15px;line-height:1.6">
        ${escapeHtml(opts.invitante)} ti ha aperto un accesso al portale con cui
        ${escapeHtml(opts.organizzazione)} prepara i preventivi di noleggio operativo
        sugli impianti fotovoltaici.
      </p>
      <p style="font-size:15px;line-height:1.6">
        Inserisci l'impianto e ottieni canone, durata consigliata e i due prospetti in PDF
        da consegnare al cliente, senza passare da noi per ogni richiesta.
      </p>
      <p style="margin:26px 0">
        <a href="${url}" style="background:#FE6F3A;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:600;display:inline-block">
          Attiva il tuo accesso
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#787782">
        Al primo accesso scegli la tua password: e' personale e non va condivisa con altri agenti.
        Il link vale sette giorni; se e' scaduto chiedi al tuo referente di rimandarlo.
      </p>
    `),
  });
}
