// Testo dell'invito. Sta in un file suo perche' lo usano due strade: la coda
// (src/lib/inviti.ts), che e' quella normale, e sendInvitationEmail di Better
// Auth, che scatta se qualcuno crea un invito passando dalle API di Better Auth
// invece che dalla coda. Un solo testo, due chiamanti.
//
// Il testo dice cosa fa il portale, e i portali sono di tre famiglie:
//  - pratiche: i portali pratiche passati agli accessi personali (STILO), dove
//    si simula il canone e si carica la pratica;
//  - preventivi fotovoltaico: Green-Go e le carrozzerie del motore sul settore
//    fotovoltaico, dove si preparano i prospetti dell'impianto;
//  - motore: le carrozzerie del motore sugli altri settori (Fas Italia sul
//    generico, Duplex sulle macchine). Li' si verifica il cliente, si scarica il
//    preventivo e si carica la pratica; di impianti non si parla, e il leasing
//    si nomina solo se la carrozzeria ce l'ha acceso.
// La famiglia la decide famigliaInvito() dal registro e dal database; il testo
// lo scrive testoInvito(), che e' pura e si prova senza mandare niente.

import { getPartner } from '../data/portali-partner';
import { allegatiGuide, type Guida } from './guide';
import { escapeHtml, inviaMail, layoutMail, type EsitoMail } from './mail-portale';
import { carrozzeriaDaSlug, type Settore } from './motore/carrozzeria';
import { percorsoPortale } from './percorso-portale';

export type FamigliaInvito =
  | { tipo: 'pratiche' }
  | { tipo: 'preventivi-fotovoltaico' }
  | { tipo: 'motore'; settore: Exclude<Settore, 'fotovoltaico'>; leasing: boolean };

export interface DatiInvito {
  invitationId: string;
  organizzazione: string;
  slug: string;
  invitante: string;
  baseUrl: string;
  /** Cambia il testo: al referente non si dice di chiedere al suo referente */
  ruolo?: string;
}

export async function famigliaInvito(slug: string): Promise<FamigliaInvito> {
  if (getPartner(slug)?.accessoNominale) return { tipo: 'pratiche' };
  // Green-Go non ha riga in app.carrozzeria: e' nato prima del motore.
  const c = await carrozzeriaDaSlug(slug);
  if (!c || c.settore === 'fotovoltaico') return { tipo: 'preventivi-fotovoltaico' };
  // Il flag leasing arriva con lo SQL 009 (Duplex). Una carrozzeria che non lo
  // porta ha il leasing acceso, come tutte prima di Duplex.
  const leasing = (c as { leasing?: boolean }).leasing !== false;
  return { tipo: 'motore', settore: c.settore, leasing };
}

/** La guida al portale racconta quello dei preventivi fotovoltaico: a tutti gli
 *  altri va solo quella sul noleggio. */
export function guideInvito(famiglia: FamigliaInvito): Guida['tipo'][] {
  return famiglia.tipo === 'preventivi-fotovoltaico' ? ['noleggio', 'portale-preventivi'] : ['noleggio'];
}

const NOTA_GUIDA_NOLEGGIO = `In allegato la guida al noleggio operativo. Non serve leggerla prima di entrare, ma
       la prima volta che un cliente ti chiede come si fattura o quali documenti servono, è lì.`;

export function testoInvito(
  dati: DatiInvito,
  famiglia: FamigliaInvito,
  /** false quando lo store non ha restituito le guide: allora non si promettono */
  conGuide: boolean,
): { subject: string; html: string } {
  const url = `${dati.baseUrl}${percorsoPortale(dati.slug)}?invito=${encodeURIComponent(dati.invitationId)}`;
  const referente = dati.ruolo === 'referente';
  const org = escapeHtml(dati.organizzazione);
  const invitante = escapeHtml(dati.invitante);

  let apertura: string;
  let cosaPuoiFare: string;
  let notaGuide: string;

  if (famiglia.tipo === 'pratiche') {
    apertura = `${invitante} ti ha aperto un accesso al portale con cui ${org} simula i canoni
       di noleggio operativo e carica le pratiche dei clienti su Mediocredito Facile.`;
    cosaPuoiFare = referente
      ? `Da lì vedi tutte le pratiche di ${org} e apri gli accessi dei tuoi collaboratori: ognuno
         riceve un invito come questo, sceglie la propria password e vede solo le pratiche che carica.`
      : `Simuli il canone, carichi la pratica con i documenti del cliente e ne segui lo stato
         fino alla delibera, senza passare da noi per ogni richiesta.`;
    notaGuide = NOTA_GUIDA_NOLEGGIO;
  } else if (famiglia.tipo === 'preventivi-fotovoltaico') {
    apertura = `${invitante} ti ha aperto un accesso al portale con cui ${org} prepara i
       preventivi di noleggio operativo sugli impianti fotovoltaici.`;
    cosaPuoiFare = referente
      ? `Da lì prepari i preventivi e apri gli accessi personali della tua rete: ogni agente riceve
         un invito come questo e sceglie la propria password, senza credenziali da girare a voce.`
      : `Inserisci l'impianto e ottieni canone, durata consigliata e i due prospetti in PDF da
         consegnare al cliente, senza passare da noi per ogni richiesta.`;
    notaGuide = `In allegato due guide: come funziona il noleggio operativo e come si usa il portale.
       Non serve leggerle prima di entrare, ma la prima volta che un cliente ti chiede
       come si fattura o quali documenti servono, sono lì.`;
  } else {
    const prodotto = famiglia.leasing ? 'noleggio operativo e leasing' : 'noleggio operativo';
    const macchine = famiglia.settore === 'macchine';
    apertura = `${invitante} ti ha aperto un accesso al portale con cui ${org} prepara i
       preventivi di ${prodotto} ${macchine ? 'sulle sue macchine' : 'sulle sue forniture'}.`;
    cosaPuoiFare = referente
      ? `Da lì prepari preventivi e pratiche, vedi quelli di tutta la tua rete e apri gli accessi
         personali dei tuoi agenti: ognuno riceve un invito come questo e sceglie la propria password,
         senza credenziali da girare a voce.`
      : macchine
        // Duplex si apre sulle proposte: la verifica viene quando la trattativa si fa seria
        ? `Scegli la macchina e la durata e scarichi il preventivo in PDF da consegnare, anche prima di
           verificare il cliente. Quando la trattativa si fa seria verifichi la partita IVA del cliente,
           e quando accetta carichi la pratica con i suoi documenti, senza passare da noi per ogni richiesta.`
        : `Dalla partita IVA verifichi il cliente, scegli la fornitura e la durata e scarichi il
           preventivo in PDF da consegnare. Quando il cliente accetta, carichi la pratica con i suoi
           documenti, senza passare da noi per ogni richiesta.`;
    notaGuide = NOTA_GUIDA_NOLEGGIO;
  }

  const chiusura = referente
    ? `Al primo accesso scegli la tua password: è personale, non va condivisa.
       Il link vale sette giorni; se scade rispondi a questa email e te ne mandiamo un altro.`
    : `Al primo accesso scegli la tua password: è personale e non va condivisa con altri agenti.
       Il link vale sette giorni; se è scaduto chiedi al tuo referente di rimandarlo.`;

  return {
    subject: `Il tuo accesso al portale ${dati.organizzazione} — Mediocredito Facile`,
    html: layoutMail('Il tuo accesso al portale', `
      <p style="font-size:15px;line-height:1.6">${apertura}</p>
      <p style="font-size:15px;line-height:1.6">${cosaPuoiFare}</p>
      <p style="margin:26px 0">
        <a href="${url}" style="background:#FE6F3A;color:#fff;text-decoration:none;padding:13px 24px;border-radius:8px;font-weight:600;display:inline-block">
          Attiva il tuo accesso
        </a>
      </p>
      <p style="font-size:14px;line-height:1.6;color:#787782">${chiusura}</p>
      ${conGuide
        ? `<p style="font-size:14px;line-height:1.6;color:#787782;border-top:1px solid #E1DEE3;padding-top:14px;margin-top:20px">
             ${notaGuide}
           </p>`
        : ''}
    `),
  };
}

export async function mailInvito(opts: DatiInvito & { a: string }): Promise<EsitoMail> {
  let famiglia: FamigliaInvito;
  try {
    famiglia = await famigliaInvito(opts.slug);
  } catch (e) {
    // Senza sapere che portale e', un testo sbagliato e' peggio di un invito
    // in ritardo: la coda lo rimette in fila.
    return { ok: false, err: `famiglia_invito: ${String(e).slice(0, 200)}`, ritentabile: true };
  }

  // Se lo store non risponde l'invito parte lo stesso senza guide: un agente
  // senza guide entra, un agente senza invito no.
  const allegati = await allegatiGuide(guideInvito(famiglia));
  const { subject, html } = testoInvito(opts, famiglia, allegati.length > 0);

  return inviaMail({
    to: opts.a,
    allegati: allegati.map((a) => ({ filename: a.filename, content: a.content })),
    subject,
    html,
  });
}
