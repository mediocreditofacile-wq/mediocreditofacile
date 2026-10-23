// I preventivi PDF del motore per i fornitori che non fanno fotovoltaico.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Due documenti, con la stessa divisione di Green-Go:
//  - preventivo di noleggio operativo, col nome e i colori del fornitore: e'
//    l'offerta che il fornitore consegna al suo cliente;
//  - prospetto di leasing finanziario, a marchio Mediocredito Facile con
//    l'iscrizione OAM, solo quando il motore ha proposto il leasing: e' un
//    prodotto finanziario e l'intermediario va identificato.
//
// I numeri escono da calcolaProposta(), la stessa funzione dello schermo: qui
// non si ricalcola niente. Nessun nome di societa' di noleggio o di leasing,
// nessun tasso, nessun coefficiente: il documento va al cliente finale.
//
// Contenuto e disegno sono separati: contenutoNoleggio() e contenutoLeasing()
// sono funzioni pure e si testano senza aprire un PDF; disegna() li impagina
// con jsPDF, che gira anche dentro la funzione serverless.

import { jsPDF } from 'jspdf';
import { buildChecklist } from '../checklist-pratica';
import type { CalcoloProposta } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import { MANROPE_BOLD, MANROPE_REGULAR } from './font-manrope';

export const NOTA_DEMO_PDF = 'Documento dimostrativo: catalogo e importi di esempio, non è un\'offerta.';

export const PIEDE_NOLEGGIO =
  'In collaborazione con Mediocredito Facile, intermediario del credito. Canoni indicativi: ogni operazione ' +
  'è soggetta a valutazione e delibera della società di noleggio. www.mediocreditofacile.it';
export const PIEDE_LEASING =
  'Mediocredito Facile · Collaboratore del Mediatore Affida · Iscrizione OAM M325. Documento a scopo ' +
  'illustrativo: non costituisce offerta vincolante né promessa di approvazione. www.mediocreditofacile.it';

// --- contenuto ---------------------------------------------------------------

export type Blocco =
  | { tipo: 'sezione'; titolo: string }
  | { tipo: 'coppie'; righe: [string, string][] }
  | { tipo: 'tabella'; intestazioni: string[]; destra: boolean[]; righe: string[][]; primaColonna?: number }
  | { tipo: 'testo'; testo: string }
  | { tipo: 'elenco'; voci: string[] }
  | { tipo: 'colonne'; colonne: { etichetta: string; titolo: string; cifra: string; testo: string; evidenza?: boolean }[] };

export interface Documento {
  filename: string;
  marchio: 'fornitore' | 'mcf';
  titolo: string;
  sottotitolo: string;
  riferimento: string;
  notaDemo: string | null;
  blocchi: Blocco[];
  piede: string;
}

/** 1234.5 -> "1.234,50": l'italiano di default non separa le migliaia sotto le cinque cifre */
export function euro(n: number, decimali = 2): string {
  return n.toLocaleString('it-IT', {
    minimumFractionDigits: decimali,
    maximumFractionDigits: decimali,
    useGrouping: 'always',
  } as Intl.NumberFormatOptions);
}

export const dataItaliana = (d: Date) =>
  new Intl.DateTimeFormat('it-IT', { timeZone: 'Europe/Rome', day: '2-digit', month: '2-digit', year: 'numeric' }).format(d);

function blocchiCliente(c: CalcoloProposta): Blocco[] {
  const s = c.ricerca!.dati_credito.scheda; // sul settore generico la ricerca c'e' sempre
  const righe: [string, string][] = [
    ['Ragione sociale', s.ragioneSociale || 'Cliente'],
    ['Partita IVA', s.piva],
  ];
  if (s.sede) righe.push(['Sede', s.sede]);
  return [{ tipo: 'sezione', titolo: 'Cliente' }, { tipo: 'coppie', righe }];
}

export function contenutoNoleggio(c: CalcoloProposta, k: Carrozzeria, id: string, oggi = new Date()): Documento {
  const { esito, voce } = c;
  const fornitura: [string, string][] = [[k.etichettaBene || 'Bene', voce.nome]];
  if (voce.descrizione) fornitura.push(['Descrizione', voce.descrizione]);
  fornitura.push(['Importo, IVA esclusa', `${euro(c.prezzo)} euro`]);

  const blocchi: Blocco[] = [
    ...blocchiCliente(c),
    { tipo: 'sezione', titolo: 'Fornitura' },
    { tipo: 'coppie', righe: fornitura },
    { tipo: 'sezione', titolo: 'Noleggio operativo: canone per durata' },
  ];
  if (esito.noleggio.length) {
    blocchi.push({
      tipo: 'tabella',
      intestazioni: ['Durata', 'Canone mensile, euro', 'Riscatto finale, euro', 'Totale, euro'],
      destra: [false, true, true, true],
      righe: esito.noleggio.map((n) => [
        `${n.durata} mesi`,
        euro(n.canone),
        `${euro(n.riscatto)} (${euro(n.riscattoPerc, 0)}%)`,
        euro(n.totale),
      ]),
    });
    blocchi.push({
      tipo: 'testo',
      testo:
        'Zero anticipo. Il canone è interamente deducibile e non impegna la Centrale Rischi. Il riscatto è un ' +
        'valore medio indicativo, definito a fine contratto sullo stato del bene; il totale somma canoni e ' +
        `riscatto. ${esito.notaNoleggio ? `${esito.notaNoleggio} ` : ''}Importi IVA esclusa.`,
    });
  } else {
    blocchi.push({ tipo: 'testo', testo: esito.motivoNoNoleggio ?? 'Il noleggio non è disponibile su questo importo.' });
  }

  const forma = c.ricerca!.dati_credito.scheda.formaGiuridica ?? '';
  blocchi.push(
    { tipo: 'sezione', titolo: 'Documenti per aprire la pratica' },
    { tipo: 'elenco', voci: buildChecklist(forma, c.prezzo, k.documentiExtra) },
  );

  return {
    filename: `preventivo-noleggio-${id}.pdf`,
    marchio: 'fornitore',
    titolo: k.nome,
    sottotitolo: 'Preventivo di noleggio operativo',
    riferimento: `N. ${id} · ${dataItaliana(oggi)}`,
    notaDemo: k.demo ? NOTA_DEMO_PDF : null,
    blocchi,
    piede: PIEDE_NOLEGGIO,
  };
}

export function contenutoLeasing(c: CalcoloProposta, k: Carrozzeria, id: string, oggi = new Date()): Documento | null {
  const { esito, voce } = c;
  if (!esito.leasing.length) return null;
  const l0 = esito.leasing[0];
  return {
    filename: `prospetto-leasing-${id}.pdf`,
    marchio: 'mcf',
    titolo: 'Mediocredito Facile',
    sottotitolo: 'Prospetto di leasing finanziario',
    riferimento: `N. ${id} · ${dataItaliana(oggi)}`,
    notaDemo: k.demo ? NOTA_DEMO_PDF : null,
    blocchi: [
      ...blocchiCliente(c),
      { tipo: 'sezione', titolo: 'Bene' },
      {
        tipo: 'coppie',
        righe: [
          [k.etichettaBene || 'Bene', voce.nome],
          ['Fornitore', k.nome],
          ['Importo, IVA esclusa', `${euro(c.prezzo)} euro`],
        ],
      },
      { tipo: 'sezione', titolo: 'Leasing finanziario: rata per durata' },
      {
        tipo: 'tabella',
        intestazioni: ['Durata', 'Anticipo, euro', 'Rate mensili, euro', 'Riscatto, euro', 'Totale, euro'],
        destra: [false, true, true, true, true],
        righe: esito.leasing.map((l) => [
          `${l.durata} mesi`,
          `${euro(l.anticipo)} (${euro(l.anticipoPerc, 0)}%)`,
          `${l.numRate} x ${euro(l.rata)}`,
          `${euro(l.riscatto)} (${euro(l.riscattoPerc, 0)}%)`,
          euro(l.totale),
        ]),
      },
      {
        tipo: 'testo',
        testo:
          `Il primo mese è l'anticipo. Il totale comprende le spese di istruttoria (${euro(l0.speseIstruttoria)} euro) ` +
          `e di incasso delle rate (${euro(l0.speseIncassoRata)} euro a rata). Importi IVA esclusa. ` +
          'La rata è indicativa: quella definitiva sarà assegnata in base al rating di merito creditizio del ' +
          'cliente, una volta esaminata la documentazione.',
      },
    ],
    piede: PIEDE_LEASING,
  };
}

// --- disegno -----------------------------------------------------------------

const A4 = { w: 210, h: 297 };
const M = 18; // margine laterale, mm
const BASSO = 272; // sotto questa quota si cambia pagina: il piede sta sotto

const NERO = '#0F1020';
const CHARCOAL = '#444451';
const TAUPE = '#787782';
const PLATINUM = '#E1DEE3';
const GHOST = '#F8F7FA';
const VIOLA = '#664CCD';
const ARANCIO = '#FE6F3A';

function rgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '0F1020';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

export function disegna(d: Documento, colore: string, accento: string): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });
  doc.addFileToVFS('Manrope-Regular.ttf', MANROPE_REGULAR);
  doc.addFont('Manrope-Regular.ttf', 'Manrope', 'normal');
  doc.addFileToVFS('Manrope-Bold.ttf', MANROPE_BOLD);
  doc.addFont('Manrope-Bold.ttf', 'Manrope', 'bold');

  const font = (peso: 'normal' | 'bold', size: number, col: string) => {
    doc.setFont('Manrope', peso);
    doc.setFontSize(size);
    doc.setTextColor(...rgb(col));
  };
  const largo = A4.w - 2 * M;
  let y = 0;

  // Testata: banda col colore del fornitore, oppure marchio MCF su bianco
  if (d.marchio === 'fornitore') {
    doc.setFillColor(...rgb(colore));
    doc.rect(0, 0, A4.w, 30, 'F');
    font('bold', 18, '#FFFFFF');
    doc.text(d.titolo, M, 14);
    font('normal', 10.5, '#FFFFFF');
    doc.text(d.sottotitolo, M, 22);
    font('normal', 8, '#FFFFFF');
    doc.text(d.riferimento, A4.w - M, 22, { align: 'right' });
    y = 38;
  } else {
    // Il marchio tipografico: Medio viola, credito charcoal, Facile arancio
    let x = M;
    font('bold', 15, VIOLA);
    doc.text('Medio', x, 16);
    x += doc.getTextWidth('Medio');
    font('normal', 15, CHARCOAL);
    doc.text('credito ', x, 16);
    x += doc.getTextWidth('credito ');
    font('bold', 15, ARANCIO);
    doc.text('Facile', x, 16);
    font('normal', 10.5, NERO);
    doc.text(d.sottotitolo, M, 23);
    font('normal', 8, TAUPE);
    doc.text(d.riferimento, A4.w - M, 23, { align: 'right' });
    doc.setDrawColor(...rgb(VIOLA));
    doc.setLineWidth(0.6);
    doc.line(M, 27, A4.w - M, 27);
    y = 35;
  }

  const notaDemo = () => {
    if (!d.notaDemo) return;
    font('bold', 8.5, accento);
    doc.text(d.notaDemo, M, y);
    y += 7;
  };
  notaDemo();

  const spazio = (h: number) => {
    if (y + h <= BASSO) return;
    doc.addPage();
    y = 18;
    notaDemo();
  };

  for (const b of d.blocchi) {
    if (b.tipo === 'sezione') {
      spazio(16);
      y += 3;
      font('bold', 11, accento);
      doc.text(b.titolo, M, y);
      y += 6;
    } else if (b.tipo === 'coppie') {
      for (const [et, val] of b.righe) {
        const righe = doc.splitTextToSize(val, largo - 45) as string[];
        spazio(5 * righe.length + 1);
        font('normal', 8.5, TAUPE);
        doc.text(et, M, y);
        font('normal', 9.5, NERO);
        doc.text(righe, M + 45, y);
        y += 5 * righe.length + 0.5;
      }
    } else if (b.tipo === 'tabella') {
      const n = b.intestazioni.length;
      const primaCol = b.primaColonna ?? 26;
      const altre = (largo - primaCol) / (n - 1);
      const xCol = (i: number) => (i === 0 ? M : M + primaCol + altre * (i - 1));
      const xTesto = (i: number) => (b.destra[i] ? xCol(i) + (i === 0 ? primaCol : altre) - 2 : xCol(i) + 2);
      spazio(9 + 7 * Math.min(b.righe.length, 3));
      doc.setFillColor(...rgb(d.marchio === 'mcf' ? VIOLA : colore));
      doc.rect(M, y - 4.5, largo, 7, 'F');
      font('bold', 7.5, '#FFFFFF');
      b.intestazioni.forEach((t, i) => doc.text(t.toUpperCase(), xTesto(i), y, { align: b.destra[i] ? 'right' : 'left' }));
      y += 7;
      b.righe.forEach((r, ri) => {
        spazio(7);
        if (ri % 2 === 1) {
          doc.setFillColor(...rgb(GHOST));
          doc.rect(M, y - 4.5, largo, 7, 'F');
        }
        font('normal', 9, NERO);
        r.forEach((t, i) => doc.text(t, xTesto(i), y, { align: b.destra[i] ? 'right' : 'left' }));
        y += 7;
      });
      doc.setDrawColor(...rgb(PLATINUM));
      doc.setLineWidth(0.2);
      doc.line(M, y - 4.5, A4.w - M, y - 4.5);
      y += 2;
    } else if (b.tipo === 'testo') {
      font('normal', 8.5, CHARCOAL);
      const righe = doc.splitTextToSize(b.testo, largo) as string[];
      spazio(4.2 * righe.length + 2);
      doc.text(righe, M, y);
      y += 4.2 * righe.length + 2;
    } else if (b.tipo === 'elenco') {
      for (const v of b.voci) {
        const righe = doc.splitTextToSize(v, largo - 6) as string[];
        spazio(4.6 * righe.length);
        font('bold', 9, accento);
        doc.text('·', M + 1, y);
        font('normal', 9, NERO);
        doc.text(righe, M + 6, y);
        y += 4.6 * righe.length + 0.6;
      }
    } else if (b.tipo === 'colonne') {
      // Riquadri affiancati: etichetta, titolo, cifra grande, testo. Quello in
      // evidenza ha il bordo del colore dei titoli e il fondo chiaro.
      const n = b.colonne.length;
      const gap = 6;
      const w = (largo - gap * (n - 1)) / n;
      font('normal', 8.5, CHARCOAL);
      const testi = b.colonne.map((c) => doc.splitTextToSize(c.testo, w - 8) as string[]);
      const h = 24 + 4.2 * Math.max(...testi.map((t) => t.length));
      spazio(h + 4);
      b.colonne.forEach((c, i) => {
        const x = M + i * (w + gap);
        doc.setDrawColor(...rgb(c.evidenza ? accento : PLATINUM));
        doc.setLineWidth(c.evidenza ? 0.5 : 0.3);
        if (c.evidenza) {
          doc.setFillColor(...rgb(GHOST));
          doc.roundedRect(x, y - 4, w, h, 2, 2, 'FD');
        } else {
          doc.roundedRect(x, y - 4, w, h, 2, 2, 'S');
        }
        font('bold', 7, accento);
        doc.text(c.etichetta.toUpperCase(), x + 4, y + 1);
        font('bold', 10.5, NERO);
        doc.text(c.titolo, x + 4, y + 7);
        font('bold', 16, colore);
        doc.text(c.cifra, x + 4, y + 15);
        font('normal', 8.5, CHARCOAL);
        doc.text(testi[i], x + 4, y + 21);
      });
      y += h + 2;
    }
  }

  // Piede su ogni pagina, con il numero di pagina
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    doc.setDrawColor(...rgb(d.marchio === 'mcf' ? VIOLA : PLATINUM));
    doc.setLineWidth(0.4);
    doc.line(M, 279, A4.w - M, 279);
    font('normal', 7, TAUPE);
    doc.text(doc.splitTextToSize(d.piede, largo - 20) as string[], M, 283);
    doc.text(`${p} / ${pagine}`, A4.w - M, 283, { align: 'right' });
  }

  return Buffer.from(doc.output('arraybuffer')).toString('base64');
}

/**
 * I PDF di un preventivo fuori dal fotovoltaico, pronti per salvaPdf():
 * il preventivo di noleggio sempre, il prospetto di leasing se c'e' il leasing.
 */
export function documentiGenerici(
  c: CalcoloProposta,
  k: Carrozzeria,
  id: string,
  oggi = new Date(),
): { filename: string; contenuto: string }[] {
  const colore = k.brand.colore || NERO;
  const accento = k.brand.accento || k.brand.colore || VIOLA;
  const docs = [contenutoNoleggio(c, k, id, oggi), contenutoLeasing(c, k, id, oggi)].filter(
    (d): d is Documento => d !== null,
  );
  return docs.map((d) => ({
    filename: d.filename,
    // Il prospetto di leasing porta i colori MCF, non quelli del fornitore
    contenuto: d.marchio === 'mcf' ? disegna(d, VIOLA, VIOLA) : disegna(d, colore, accento),
  }));
}
