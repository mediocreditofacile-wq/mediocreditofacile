// Il preventivo PDF del settore "macchine" (oggi Duplex): lo stesso contenuto del
// preventivo di /tools/duplex, generato sul server e salvato nello storico.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Va al cliente finale: nessun nome della societa' di locazione, nessun
// coefficiente, nessun semaforo. I numeri escono da calcolaMacchine(), gli stessi
// dello schermo. Il disegno e' quello di pdf-generico.ts.

import { ASSICURAZIONE_MINIMA, ASSICURAZIONE_PERC } from '../../data/duplex-costi';
import { buildChecklist } from '../checklist-pratica';
import { dataEstesa } from '../duplex-calendario';
import type { CalcoloProposta } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import { dataItaliana, disegna, euro, NOTA_DEMO_PDF, type Blocco, type Documento } from './pdf-generico';
import type { Pagamento } from './proposte-macchine';

const PIEDE_MACCHINE =
  'Locazione operativa a cura di Mediocredito Facile · +39 393 995 7840 · mediocreditofacile@gmail.com · ' +
  'www.mediocreditofacile.it. Preventivo indicativo: canone e condizioni definitive sono quelli del contratto ' +
  'di locazione, soggetto a delibera della società di locazione.';

/** "2027-01-01" -> "1° gennaio 2027" */
const giorno = (iso: string) => {
  const [a, m, g] = iso.split('-').map(Number);
  return dataEstesa(new Date(a, m - 1, g));
};

function colonna(p: Pagamento, grazia: boolean) {
  return {
    etichetta: grazia ? 'Paga dopo' : 'Paga da subito',
    titolo: grazia ? 'Con trimestre di grazia' : 'Canone standard',
    cifra: `${euro(p.canone)} euro al mese`,
    testo: grazia
      ? `Fattura trimestrale anticipata di ${euro(p.trimestre)} euro. Pro rata e primo trimestre vanno in coda al contratto: la prima fattura arriva il ${giorno(p.primaFattura)}.`
      : `Fattura trimestrale anticipata di ${euro(p.trimestre)} euro. Il pro rata si fattura alla consegna e la prima fattura trimestrale arriva il ${giorno(p.primaFattura)}.`,
    evidenza: grazia,
  };
}

export function contenutoMacchine(
  c: CalcoloProposta,
  k: Carrozzeria,
  id: string,
  agente: { nome: string; email: string },
  oggi: Date = new Date(),
): Documento {
  const m = c.macchine!;
  const s = c.ricerca.dati_credito.scheda;
  const t = m.tradizionale;
  const g = m.alternativa;

  const cliente: [string, string][] = [['Ragione sociale', s.ragioneSociale || 'Cliente'], ['Partita IVA', s.piva]];
  if (s.sede) cliente.push(['Sede', s.sede]);
  // Chi ha preparato il preventivo: e' il riferimento del cliente, sta in testa
  cliente.push(['Preparato da', agente.nome ? `${agente.nome}, ${agente.email}` : agente.email]);

  const blocchi: Blocco[] = [
    { tipo: 'sezione', titolo: 'Preventivo per' },
    { tipo: 'coppie', righe: cliente },
    { tipo: 'sezione', titolo: 'Fornitura' },
    {
      tipo: 'coppie',
      righe: [
        [k.etichettaBene || 'Macchina', m.macchina.nome],
        ['Accessori', m.accessori.length ? m.accessori.map((a) => `${a.quantita}x ${a.nome}`).join(', ') : 'nessuno'],
        ['Importo', `${euro(m.prezzo)} euro IVA esclusa, ${euro(m.prezzo * 1.22)} euro IVA inclusa`],
        ['Durata', `${m.durata} mesi`],
        ['Consegna prevista', giorno(m.consegna)],
      ],
    },
  ];

  const pag = [t, g].filter((p): p is Pagamento => p !== null);
  if (pag.length) {
    blocchi.push(
      { tipo: 'sezione', titolo: pag.length === 2 ? 'Due modi di partire' : 'Il canone' },
      {
        tipo: 'colonne',
        colonne: [t ? colonna(t, false) : null, g ? colonna(g, true) : null]
          .filter((x): x is ReturnType<typeof colonna> => x !== null),
      },
    );
    const valori = (f: (p: Pagamento) => string) => pag.map(f);
    const stessa = (v: string) => pag.map(() => v);
    blocchi.push(
      { tipo: 'sezione', titolo: 'Tutte le voci, niente escluso' },
      {
        tipo: 'tabella',
        primaColonna: 82,
        intestazioni: ['Voce', ...(t ? ['Canone standard'] : []), ...(g ? ['Con trimestre di grazia'] : [])],
        destra: [false, ...pag.map(() => true)],
        righe: [
          ['Anticipo', ...stessa('0')],
          ['Pro rata alla consegna', ...valori((p) => `${euro(p.costoGiornaliero)} euro al giorno`)],
          ['Spese di istruttoria', ...stessa(`${euro(m.istruttoria)} euro`)],
          [`Canoni, ${m.durata} mesi`, ...valori((p) => `${euro(p.canone * m.durata)} euro`)],
          ['Polizza all risk', ...stessa(`${euro(m.polizzaAnnua)} euro all'anno`)],
          ['Riscatto a fine contratto', ...stessa(`${euro(m.riscatto)} euro`)],
          [`Totale in ${m.durata} mesi`, ...valori((p) => `${euro(p.totale)} euro`)],
        ],
      },
      {
        tipo: 'testo',
        testo:
          'Il totale somma canoni, istruttoria e riscatto; la polizza resta fuori perché si paga a parte ogni anno. ' +
          "Pro rata: dalla consegna all'inizio del trimestre solare si paga il canone diviso 30 per ogni giorno di utilizzo" +
          (g ? '; con il trimestre di grazia si paga in coda al contratto.' : '.'),
      },
    );
  } else {
    blocchi.push(
      { tipo: 'sezione', titolo: 'Il canone' },
      { tipo: 'testo', testo: m.motivoFuoriListino ?? 'Il noleggio non si quota su questo importo.' },
    );
  }

  const minimo = m.polizzaAnnua === ASSICURAZIONE_MINIMA
    ? `, qui ${euro((m.prezzo * ASSICURAZIONE_PERC) / 100)} euro, ma la quota minima fatturabile è ${euro(ASSICURAZIONE_MINIMA, 0)} euro l'anno: si paga quella`
    : '';
  blocchi.push(
    {
      tipo: 'testo',
      testo:
        'Polizza all risk obbligatoria sul bene: incendio, furto, atti vandalici, danni accidentali ed elettrici. ' +
        `La prima fattura arriva alla decorrenza del contratto, poi una a ogni inizio anno. Costa il ${euro(ASSICURAZIONE_PERC)}% del valore${minimo}. ` +
        "In caso di danno c'è una franchigia: minimo 150 euro più IVA, fino al 15% dell'indennizzo per furto, rapina e caduta, fino al 25% per fenomeno elettrico.",
    },
    {
      tipo: 'testo',
      testo:
        'Il riscatto è facoltativo: in alternativa si restituisce la macchina o si prosegue il noleggio a canone ridotto. ' +
        "Nessun anticipo; il canone è interamente deducibile e l'IVA si detrae sulla singola fattura. Importi IVA esclusa, salvo dove indicato.",
    },
    // In una riga, come nel preventivo di /tools/duplex: il documento sta in una pagina
    {
      tipo: 'testo',
      testo: `Per partire servono: ${buildChecklist(s.formaGiuridica ?? '', m.prezzo, k.documentiExtra).join('; ')}.`,
    },
  );

  return {
    filename: `preventivo-noleggio-${id}.pdf`,
    marchio: 'fornitore',
    titolo: k.nome,
    sottotitolo: 'Preventivo di noleggio operativo',
    riferimento: `N. ${id} · ${dataItaliana(oggi)}`,
    notaDemo: k.demo ? NOTA_DEMO_PDF : null,
    blocchi,
    piede: PIEDE_MACCHINE,
  };
}

/** Il preventivo pronto per salvaPdf(): un documento solo, col marchio del fornitore */
export function documentiMacchine(
  c: CalcoloProposta,
  k: Carrozzeria,
  id: string,
  agente: { nome: string; email: string },
  oggi: Date = new Date(),
): { filename: string; contenuto: string }[] {
  const d = contenutoMacchine(c, k, id, agente, oggi);
  const colore = k.brand.colore || '#0F1020';
  const accento = k.brand.accento || k.brand.colore || '#664CCD';
  return [{ filename: d.filename, contenuto: disegna(d, colore, accento) }];
}
