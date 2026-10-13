// Testo dell'invito. Sta in un file suo perche' lo usano due strade: la coda
// (src/lib/inviti.ts), che e' quella normale, e sendInvitationEmail di Better
// Auth, che scatta se qualcuno crea un invito passando dalle API di Better Auth
// invece che dalla coda. Un solo testo, due chiamanti.

import { getPartner } from '../data/portali-partner';
import { allegatiGuide } from './guide';
import { escapeHtml, inviaMail, layoutMail, type EsitoMail } from './mail-portale';
import { percorsoPortale } from './percorso-portale';

export async function mailInvito(opts: {
  a: string;
  invitationId: string;
  organizzazione: string;
  slug: string;
  invitante: string;
  baseUrl: string;
  /** Cambia il testo: al referente non si dice di chiedere al suo referente */
  ruolo?: string;
}): Promise<EsitoMail> {
  const url = `${opts.baseUrl}${percorsoPortale(opts.slug)}?invito=${encodeURIComponent(opts.invitationId)}`;
  const referente = opts.ruolo === 'referente';
  // Due famiglie di portali: quelli dei preventivi fotovoltaico (Green-Go e il
  // motore) e i portali pratiche passati agli accessi personali (STILO), dove
  // si simula il canone e si carica la pratica. Il testo dice cosa fa il portale.
  const pratiche = Boolean(getPartner(opts.slug)?.accessoNominale);
  const org = escapeHtml(opts.organizzazione);

  const apertura = pratiche
    ? `${escapeHtml(opts.invitante)} ti ha aperto un accesso al portale con cui ${org} simula i canoni
       di noleggio operativo e carica le pratiche dei clienti su Mediocredito Facile.`
    : `${escapeHtml(opts.invitante)} ti ha aperto un accesso al portale con cui ${org} prepara i
       preventivi di noleggio operativo sugli impianti fotovoltaici.`;

  const cosaPuoiFare = pratiche
    ? referente
      ? `<p style="font-size:15px;line-height:1.6">
           Da lì vedi tutte le pratiche di ${org} e apri gli accessi dei tuoi collaboratori: ognuno
           riceve un invito come questo, sceglie la propria password e vede solo le pratiche che carica.
         </p>`
      : `<p style="font-size:15px;line-height:1.6">
           Simuli il canone, carichi la pratica con i documenti del cliente e ne segui lo stato
           fino alla delibera, senza passare da noi per ogni richiesta.
         </p>`
    : referente
      ? `<p style="font-size:15px;line-height:1.6">
           Da li' prepari i preventivi e apri gli accessi personali della tua rete: ogni agente riceve
           un invito come questo e sceglie la propria password, senza credenziali da girare a voce.
         </p>`
      : `<p style="font-size:15px;line-height:1.6">
           Inserisci l'impianto e ottieni canone, durata consigliata e i due prospetti in PDF da
           consegnare al cliente, senza passare da noi per ogni richiesta.
         </p>`;

  const chiusura = referente
    ? `Al primo accesso scegli la tua password: e' personale, non va condivisa.
       Il link vale sette giorni; se scade rispondi a questa email e te ne mandiamo un altro.`
    : `Al primo accesso scegli la tua password: e' personale e non va condivisa con altri agenti.
       Il link vale sette giorni; se e' scaduto chiedi al tuo referente di rimandarlo.`;

  // Due guide in allegato: il noleggio operativo e il portale. Se lo store non
  // risponde l'invito parte lo stesso senza: un agente senza guide entra, un
  // agente senza invito no. La guida al portale racconta quello dei preventivi
  // fotovoltaico: a chi carica pratiche va solo quella sul noleggio.
  const allegati = await allegatiGuide(pratiche ? ['noleggio'] : undefined);

  return inviaMail({
    to: opts.a,
    allegati: allegati.map((a) => ({ filename: a.filename, content: a.content })),
    subject: `Il tuo accesso al portale ${opts.organizzazione} — Mediocredito Facile`,
    html: layoutMail('Il tuo accesso al portale', `
      <p style="font-size:15px;line-height:1.6">${apertura}</p>
      ${cosaPuoiFare}
      <p style="margin:26px 0">
        <a href="${url}" style="background:#FE6F3A;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:600;display:inline-block">
          Attiva il tuo accesso
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#787782">${chiusura}</p>
      ${allegati.length
        ? `<p style="font-size:14px;line-height:1.6;color:#787782;border-top:1px solid #E1DEE3;padding-top:14px;margin-top:20px">
             ${!pratiche
               ? `In allegato due guide: come funziona il noleggio operativo e come si usa il portale.
                  Non serve leggerle prima di entrare, ma la prima volta che un cliente ti chiede
                  come si fattura o quali documenti servono, sono lì.`
               : `In allegato la guida al noleggio operativo. Non serve leggerla prima di entrare, ma
                  la prima volta che un cliente ti chiede come si fattura o quali documenti servono, è lì.`}
           </p>`
        : ''}
    `),
  });
}
