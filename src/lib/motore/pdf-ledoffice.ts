// I tre PDF del settore "distinta" (Led Office), nel modello delle proposte Led Office.
// Spec mcf_spec-ledoffice-motore_v1, paragrafo 8 e decisioni 3 e 6 del paragrafo 2.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Tre documenti dallo stesso calcolo (CalcoloDistinta), quindi coi numeri dello schermo:
//  - preventivo del canone, per il cliente: intestazione del marchio, beni, rata per
//    durata, condizioni del listino;
//  - proposta di vendita, per il cliente, da firmare: i soli beni della distinta,
//    intestata alla societa' che fattura (Emme 2), coi loghi delle due societa';
//  - proposta per il locatore, solo per MCF: la stessa proposta con in piu' la riga
//    servizi che porta la maggiorazione del canale, e il totale uguale all'imponibile
//    su cui e' calcolata la rata.
//
// I due documenti del cliente si costruiscono da vistaCommerciale() e dalla distinta:
// mai da maggiorazione o imponibile, che servono solo alla proposta per il locatore.
// Nessun nome di locatore, nessun coefficiente, nessun tasso.
//
// Contenuto e disegno sono separati, come in pdf-generico.ts: le funzioni contenuto*()
// sono pure e si testano senza aprire un PDF; disegna*() impaginano con jsPDF.

import { jsPDF } from 'jspdf';
import { formattaIban } from '../iban';
import type { CalcoloDistinta } from './calcolo-distinta';
import type { Carrozzeria } from './carrozzeria';
import type { SocietaFornitrice } from './config-distinta';
import type { DatiVendita } from './dati-vendita';
import { DURATA_EVIDENZA, vistaCommerciale, type RataDurata } from './instradamento';
import { dataItaliana, euro } from './pdf-generico';

// --- testi fissi (spec, paragrafo 8) ----------------------------------------

export const DESCRIZIONE_SERVIZI = 'SERVIZI DI TRASPORTO, CONSEGNA, INSTALLAZIONE, CONFIGURAZIONE E MESSA IN OPERA';
export const NOTA_RATA = 'Rata indicativa, soggetta all\'approvazione della società di noleggio.';
export const NOTA_DA_CONFERMARE = 'Rata indicativa, da confermare.';

// --- contenuto ---------------------------------------------------------------

export interface RigaProposta {
  descrizione: string;
  quantita: number;
  prezzo: number;
  totale: number;
}

export interface ContenutoProposta {
  data: string;
  cliente: { ragioneSociale: string; indirizzo: string; piva: string };
  /**
   * I dati di vendita come si stampano: in maiuscolo dove il modello e' in maiuscolo
   * (nomi, indirizzi), email e PEC come sono scritte, IBAN a gruppi di quattro
   */
  vendita: DatiVendita;
  consegna: string;
  righe: RigaProposta[];
  totale: number;
  piede: string;
  intestazionePiva: string;
  riferimento: string;
  /** Ragione sociale della societa' che vende: si stampa al posto del suo logo, se manca */
  fornitrice: string;
}

export interface ContenutoPreventivo {
  data: string;
  cliente: { ragioneSociale: string; piva: string };
  righe: RigaProposta[];
  totale: number;
  rate: RataDurata[];
  durataEvidenza: number;
  note: string[];
  riferimento: string;
}

/** Spazi ripuliti e trattini lunghi resi normali: nel modello non ce n'e' nessuno */
const pulito = (s: string | null | undefined) => (s ?? '').replace(/[–—]/g, '-').replace(/\s+/g, ' ').trim();
const maiuscolo = (s: string | null | undefined) => pulito(s).toUpperCase();

/** Le righe della distinta come le stampa il modello: descrizione in maiuscolo, prezzo trattato */
const righeBeni = (c: CalcoloDistinta): RigaProposta[] =>
  c.distinta.righe.map((r) => ({
    descrizione: maiuscolo(r.descrizione),
    quantita: r.quantita,
    prezzo: r.prezzo,
    totale: r.totale,
  }));

/** "Via ... - Tel ... - email - P.I. ...": i campi vuoti non lasciano separatori */
function piedeSocieta(s: SocietaFornitrice): string {
  return [s.indirizzo, s.telefono ? `Tel ${s.telefono}` : '', s.email, s.piva ? `P.I. ${s.piva}` : '']
    .map(pulito)
    .filter(Boolean)
    .join(' - ');
}

/**
 * Le due proposte escono quando c'e' una rata, i dati di vendita sono completi e c'e'
 * un indirizzo di consegna. Il preventivo del canone chiede solo la rata.
 */
export function proposteDisponibili(c: CalcoloDistinta): boolean {
  return c.instradamento !== null && c.datiVendita !== null && pulito(c.consegna.indirizzo) !== '';
}

/**
 * La proposta di vendita del cliente: i soli beni della distinta, il totale e' quello
 * dei beni. Senza dati di vendita non si compone (chi chiama controlla prima con
 * proposteDisponibili).
 */
export function contenutoPropostaVendita(
  c: CalcoloDistinta,
  s: SocietaFornitrice,
  id: string,
  oggi: Date = new Date(),
): ContenutoProposta {
  const v = c.datiVendita;
  if (!v) throw new Error('proposta di vendita senza i dati di vendita');
  const scheda = c.ricerca.dati_credito.scheda;
  return {
    data: dataItaliana(oggi),
    cliente: {
      ragioneSociale: maiuscolo(scheda.ragioneSociale || c.ricerca.ragione_sociale),
      indirizzo: maiuscolo(scheda.sede),
      piva: pulito(scheda.piva || c.ricerca.piva),
    },
    vendita: {
      amministratore: {
        nome: maiuscolo(v.amministratore.nome),
        nascita: pulito(v.amministratore.nascita),
        codiceFiscale: maiuscolo(v.amministratore.codiceFiscale),
        residenza: maiuscolo(v.amministratore.residenza),
      },
      telefono: pulito(v.telefono),
      email: pulito(v.email),
      riferimento: { nome: maiuscolo(v.riferimento.nome), telefono: pulito(v.riferimento.telefono) },
      iban: formattaIban(v.iban),
      sdi: maiuscolo(v.sdi),
      pec: pulito(v.pec),
    },
    consegna: maiuscolo(c.consegna.indirizzo),
    righe: righeBeni(c),
    totale: c.distinta.totale,
    piede: piedeSocieta(s),
    intestazionePiva: s.piva ? `P.I. ${pulito(s.piva)}` : '',
    riferimento: `Rif. ${pulito(id)}`,
    fornitrice: pulito(s.ragioneSociale),
  };
}

/**
 * La proposta per il locatore, solo MCF: la proposta di vendita con in coda la riga
 * servizi, che porta la maggiorazione del canale, e il totale uguale all'imponibile.
 * Sui canali senza maggiorazione coincide con la proposta di vendita. Senza
 * instradamento non c'e' un imponibile e non si compone.
 */
export function contenutoPropostaLocatore(
  c: CalcoloDistinta,
  s: SocietaFornitrice,
  id: string,
  oggi: Date = new Date(),
): ContenutoProposta {
  const i = c.instradamento;
  if (!i) throw new Error('proposta per il locatore senza instradamento');
  const base = contenutoPropostaVendita(c, s, id, oggi);
  if (!(i.maggiorazione > 0)) return base;
  return {
    ...base,
    righe: [...base.righe, { descrizione: DESCRIZIONE_SERVIZI, quantita: 1, prezzo: i.maggiorazione, totale: i.maggiorazione }],
    totale: i.imponibile,
  };
}

/**
 * Il preventivo del canone per il cliente: beni e totale della distinta, rate dalla
 * vista del commerciale, condizioni del listino e le note fisse. Nessuna motivazione,
 * nessuna nota interna. Senza instradamento non c'e' rata e non si compone.
 */
export function contenutoPreventivoCanone(c: CalcoloDistinta, id: string, oggi: Date = new Date()): ContenutoPreventivo {
  if (!c.instradamento) throw new Error('preventivo del canone senza instradamento');
  const vista = vistaCommerciale(c.instradamento);
  const scheda = c.ricerca.dati_credito.scheda;
  const durataEvidenza = vista.rate.some((r) => r.durata === DURATA_EVIDENZA)
    ? DURATA_EVIDENZA
    : vista.rate.at(-1)?.durata ?? DURATA_EVIDENZA;
  const note = [vista.nota ? pulito(vista.nota) : '', NOTA_RATA, vista.daConfermare ? NOTA_DA_CONFERMARE : ''].filter(Boolean);
  return {
    data: dataItaliana(oggi),
    cliente: {
      ragioneSociale: maiuscolo(scheda.ragioneSociale || c.ricerca.ragione_sociale),
      piva: pulito(scheda.piva || c.ricerca.piva),
    },
    righe: righeBeni(c),
    totale: c.distinta.totale,
    rate: vista.rate,
    durataEvidenza,
    note,
    riferimento: `Rif. ${pulito(id)}`,
  };
}

// --- disegno -----------------------------------------------------------------

const A4 = { w: 210, h: 297 };
const M = 14; // margine sinistro, mm
const LARGO = 182; // larghezza delle tabelle: da 14 a 196 mm, come nel modello
const DESTRA = M + LARGO;
const LIMITE = 276; // sotto questa quota si cambia pagina: piede e riferimento stanno sotto
const IN_ALTO = 18; // dove riparte una pagina nuova

const TESTO = '#1D1D1B';
const GRIGIO_PIEDE = '#363435';
const GRIGIO_RIF = '#8A8A8A';

const PT = 0.3528; // mm per punto tipografico
const INTERLINEA = 1.15; // quella di default di jsPDF
const PAD_X = 1.8;
const PAD_Y = 1.4;
const CORPO = 9;

/** Colonne della tabella prodotti: descrizione, quantita', prezzo unitario, totale */
const COL_PRODOTTI = [106, 16, 30, 30];

type Stile = 'normal' | 'bold' | 'italic' | 'bolditalic';

interface Cella {
  testo: string;
  w: number;
  allinea?: 'left' | 'center' | 'right';
  stile?: Stile;
  size?: number;
  fondo?: string;
  bordo?: boolean;
}

function rgb(hex: string): [number, number, number] {
  const h = /^#?([0-9a-f]{6})$/i.exec(hex.trim())?.[1] ?? '1D1D1B';
  return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)];
}

/** Il colore schiarito verso il bianco: quota 0 = bianco, 1 = il colore pieno */
function tinta(hex: string, quota: number): string {
  return '#' + rgb(hex).map((c) => Math.round(255 - (255 - c) * quota).toString(16).padStart(2, '0')).join('');
}

const altezzaRiga = (size: number) => size * PT * INTERLINEA;

function font(doc: jsPDF, stile: Stile, size: number, colore = TESTO) {
  doc.setFont('helvetica', stile);
  doc.setFontSize(size);
  doc.setTextColor(...rgb(colore));
}

/** PNG o JPEG dai primi byte: un logo d'altro formato non si disegna */
function formatoLogo(b64: string): 'PNG' | 'JPEG' | null {
  const testa = Buffer.from(b64.slice(0, 12), 'base64');
  if (testa.length >= 4 && testa[0] === 0x89 && testa[1] === 0x50 && testa[2] === 0x4e && testa[3] === 0x47) return 'PNG';
  if (testa.length >= 3 && testa[0] === 0xff && testa[1] === 0xd8 && testa[2] === 0xff) return 'JPEG';
  return null;
}

/**
 * Disegna un logo largo al massimo `w` e alto al massimo `hMax`, allineato a sinistra o
 * a destra di `x`. Ritorna l'altezza disegnata, oppure null se il logo manca o non si
 * legge: chi chiama stampa il nome al suo posto.
 */
function disegnaLogo(
  doc: jsPDF,
  b64: string | null,
  box: { x: number; y: number; w: number; hMax: number; allinea: 'left' | 'right' },
): number | null {
  if (!b64) return null;
  const formato = formatoLogo(b64);
  if (!formato) return null;
  try {
    const dati = `data:image/${formato === 'PNG' ? 'png' : 'jpeg'};base64,${b64}`;
    const { width, height } = doc.getImageProperties(dati);
    if (!width || !height) return null;
    let w = box.w;
    let h = (w * height) / width;
    if (h > box.hMax) {
      h = box.hMax;
      w = (h * width) / height;
    }
    doc.addImage(dati, formato, box.allinea === 'left' ? box.x : box.x - w, box.y, w, h);
    return h;
  } catch {
    return null;
  }
}

/**
 * Il testo spezzato sulla larghezza della cella. Come splitTextToSize, con una
 * differenza: negli indirizzi del Registro ("VIA ... SNC - 03043 CASSINO (FR)") il
 * trattino resta attaccato alla parola prima, cosi' una riga non comincia mai con "-".
 * Una parola piu' larga della cella (un indirizzo email lungo) si spezza come fa jsPDF.
 */
function aCapo(doc: jsPDF, testo: string, largo: number): string[] {
  const linee: string[] = [];
  for (const paragrafo of testo.split('\n')) {
    const parole = paragrafo.split(' ').filter(Boolean).reduce<string[]>((acc, p) => {
      if (p === '-' && acc.length) acc[acc.length - 1] += ' -';
      else acc.push(p);
      return acc;
    }, []);
    let corrente = '';
    for (const p of parole) {
      const prova = corrente ? `${corrente} ${p}` : p;
      if (doc.getTextWidth(prova) <= largo) {
        corrente = prova;
        continue;
      }
      if (corrente) linee.push(corrente);
      const pezzi = doc.splitTextToSize(p, largo) as string[];
      corrente = pezzi.pop() ?? '';
      linee.push(...pezzi);
    }
    if (corrente) linee.push(corrente);
  }
  return linee;
}

/** Le righe di testo di ogni cella e l'altezza della riga di tabella, almeno `minH` */
function misura(doc: jsPDF, celle: Cella[], minH: number): { linee: string[][]; h: number } {
  const linee = celle.map((c) => {
    font(doc, c.stile ?? 'normal', c.size ?? CORPO);
    return c.testo ? aCapo(doc, c.testo, c.w - 2 * PAD_X) : [];
  });
  const h = Math.max(
    minH,
    ...celle.map((c, i) => linee[i].length * altezzaRiga(c.size ?? CORPO) + 2 * PAD_Y),
  );
  return { linee, h };
}

/** Una riga di tabella a partire da (x, y): bordi neri sottili, testo in alto. Ritorna l'altezza */
function riga(doc: jsPDF, x: number, y: number, celle: Cella[], minH: number, misurata = misura(doc, celle, minH)): number {
  const { linee, h } = misurata;
  let cx = x;
  celle.forEach((c, i) => {
    if (c.fondo) {
      doc.setFillColor(...rgb(c.fondo));
      doc.rect(cx, y, c.w, h, 'F');
    }
    if (c.bordo !== false) {
      doc.setDrawColor(...rgb(TESTO));
      doc.setLineWidth(0.2);
      doc.rect(cx, y, c.w, h, 'S');
    }
    if (linee[i].length) {
      font(doc, c.stile ?? 'normal', c.size ?? CORPO);
      const allinea = c.allinea ?? 'left';
      const tx = allinea === 'left' ? cx + PAD_X : allinea === 'right' ? cx + c.w - PAD_X : cx + c.w / 2;
      doc.text(linee[i], tx, y + PAD_Y, { align: allinea, baseline: 'top' });
    }
    cx += c.w;
  });
  return h;
}

/** Titoletto di sezione in grassetto corsivo, come CLIENTE e PRODOTTI nel modello */
function titoletto(doc: jsPDF, testo: string, y: number) {
  font(doc, 'bolditalic', CORPO);
  doc.text(testo, M + 1, y);
}

const intestazioneProdotti = (): Cella[] =>
  ['DESCRIZIONE', "Q.TA'", 'PREZZO\nUNITARIO', 'TOTALE\n(IVA ESCL.)'].map((testo, i) => ({
    testo,
    w: COL_PRODOTTI[i],
    allinea: 'center',
    stile: 'italic',
  }));

const cellaProdotto = (r: RigaProposta): Cella[] => [
  { testo: r.descrizione, w: COL_PRODOTTI[0] },
  { testo: String(r.quantita), w: COL_PRODOTTI[1], allinea: 'center' },
  { testo: euro(r.prezzo), w: COL_PRODOTTI[2], allinea: 'right' },
  { testo: euro(r.totale), w: COL_PRODOTTI[3], allinea: 'right' },
];

/**
 * La tabella dei prodotti col suo titoletto, da quota y. Se una riga non ci sta, pagina
 * nuova con l'intestazione ripetuta: una distinta lunga va avanti, non si taglia.
 * Ritorna la y sotto la tabella.
 */
function tabellaProdotti(
  doc: jsPDF,
  y: number,
  titolo: string,
  righe: RigaProposta[],
  nuovaPagina: () => number,
): number {
  const testa = intestazioneProdotti();
  const hTesta = misura(doc, testa, 8).h;
  // Titoletto e intestazione non restano soli in fondo alla pagina: almeno una riga con loro
  const prima = righe.length ? misura(doc, cellaProdotto(righe[0]), 6.5).h : 0;
  if (y + 5 + hTesta + prima > LIMITE) y = nuovaPagina() + 4;
  titoletto(doc, titolo, y);
  y += 5;
  y += riga(doc, M, y, testa, 8);
  for (const r of righe) {
    const celle = cellaProdotto(r);
    const m = misura(doc, celle, 6.5);
    if (y + m.h > LIMITE) {
      y = nuovaPagina();
      y += riga(doc, M, y, testa, 8);
    }
    y += riga(doc, M, y, celle, 6.5, m);
  }
  return y;
}

/** Piede e riferimento su ogni pagina; il numero di pagina solo se le pagine sono piu' d'una */
function chiudiPagine(doc: jsPDF, piede: string, riferimento: string) {
  const pagine = doc.getNumberOfPages();
  for (let p = 1; p <= pagine; p++) {
    doc.setPage(p);
    if (piede) {
      font(doc, 'normal', 8, GRIGIO_PIEDE);
      doc.text(doc.splitTextToSize(piede, LARGO) as string[], A4.w / 2, 286, { align: 'center' });
    }
    font(doc, 'normal', 6.5, GRIGIO_RIF);
    doc.text(riferimento, M, 292);
    if (pagine > 1) doc.text(`${p} / ${pagine}`, DESTRA, 292, { align: 'right' });
  }
}

const base64 = (doc: jsPDF) => Buffer.from(doc.output('arraybuffer')).toString('base64');

/**
 * La proposta (di vendita o per il locatore), nell'impaginazione del modello Led
 * Office: logo della societa' che vende a sinistra con la partita IVA sotto, logo del
 * marchio a destra, titolo, riquadro DATA, tabella CLIENTE, tabella PRODOTTI, TOTALE
 * VENDITA e riquadro per timbro e firma. `nomeMarchio` si stampa se manca il logo.
 */
export function disegnaProposta(
  p: ContenutoProposta,
  loghi: { fornitrice: string | null; marchio: string | null },
  nomeMarchio = '',
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  // Testata: i due loghi, o i nomi al loro posto
  const hFornitrice = disegnaLogo(doc, loghi.fornitrice, { x: M, y: 10, w: 60, hMax: 20, allinea: 'left' });
  if (hFornitrice === null) {
    font(doc, 'bold', 13);
    doc.text(p.fornitrice, M, 20);
  }
  if (p.intestazionePiva) {
    font(doc, 'normal', 9, GRIGIO_PIEDE);
    doc.text(p.intestazionePiva, M + 1, hFornitrice === null ? 25 : 10 + hFornitrice + 4);
  }
  if (disegnaLogo(doc, loghi.marchio, { x: DESTRA, y: 10, w: 55, hMax: 20, allinea: 'right' }) === null && nomeMarchio) {
    font(doc, 'bold', 16);
    doc.text(nomeMarchio.toUpperCase(), DESTRA, 20, { align: 'right' });
  }

  font(doc, 'bold', 11);
  doc.text('PROPOSTA DI VENDITA', M + 1, 46);
  riga(doc, DESTRA - 48, 51, [{ testo: 'DATA', w: 20 }, { testo: p.data, w: 28 }], 6);

  // Tabella CLIENTE: etichette a sinistra, valori su una griglia di quattro colonne
  const ET = 44;
  const [C1, C2, C3, C4] = [30, 28, 40, 40];
  const etichetta = (testo: string): Cella => ({ testo, w: ET });
  const sottotitoli = (testi: [string, number][]): Cella[] => [
    { testo: '', w: ET },
    ...testi.map(([testo, w]): Cella => ({ testo, w, allinea: 'center', stile: 'italic' })),
  ];
  const v = p.vendita;
  const righeCliente: [Cella[], number][] = [
    [[etichetta('RAGIONE SOCIALE'), { testo: p.cliente.ragioneSociale, w: C1 + C2 + C3 + C4 }], 7.5],
    [[etichetta('INDIRIZZO / P.IVA/C.F:'), { testo: p.cliente.indirizzo, w: C1 + C2 }, { testo: p.cliente.piva, w: C3 + C4 }], 7.5],
    [sottotitoli([['Nome', C1], ['Data di nascita', C2], ['Codice fiscale', C3], ['Indirizzo di residenza', C4]]), 5],
    [
      [
        etichetta('AMM.RE / DATI'),
        { testo: v.amministratore.nome, w: C1 },
        { testo: v.amministratore.nascita, w: C2 },
        { testo: v.amministratore.codiceFiscale, w: C3 },
        { testo: v.amministratore.residenza, w: C4 },
      ],
      7.5,
    ],
    [[etichetta('TEL./MAIL'), { testo: v.telefono, w: C1 + C2 }, { testo: v.email, w: C3 + C4 }], 7.5],
    [[etichetta('INDIRIZZO CONSEGNA'), { testo: p.consegna, w: C1 + C2 + C3 + C4 }], 7.5],
    [[etichetta('PERSONA DI RIFERIMENTO/ TEL.'), { testo: v.riferimento.nome, w: C1 + C2 }, { testo: v.riferimento.telefono, w: C3 + C4 }], 7.5],
    [sottotitoli([['Iban', C1 + C2], ['Codice SDI', 30], ['PEC', C3 + C4 - 30]]), 5],
    [[etichetta('IBAN / CODICE SDI / PEC'), { testo: v.iban, w: C1 + C2 }, { testo: v.sdi, w: 30 }, { testo: v.pec, w: C3 + C4 - 30 }], 7.5],
  ];

  titoletto(doc, 'CLIENTE', 70);
  let y = 74;
  for (const [celle, minH] of righeCliente) y += riga(doc, M, y, celle, minH);

  const nuovaPagina = () => {
    doc.addPage();
    return IN_ALTO;
  };

  y = tabellaProdotti(doc, y + 10, 'PRODOTTI', p.righe, nuovaPagina);

  // TOTALE VENDITA e riquadro della firma restano insieme sulla stessa pagina
  const W_TOT = [44, 38];
  const xTot = DESTRA - W_TOT[0] - W_TOT[1];
  const H_FIRMA = 28;
  if (y + 12 + 8 + 6 + H_FIRMA > LIMITE) y = nuovaPagina();
  else y += 12;
  y += riga(doc, xTot, y, [
    { testo: 'TOTALE VENDITA', w: W_TOT[0] },
    { testo: euro(p.totale), w: W_TOT[1], allinea: 'center', stile: 'bold', size: 10 },
  ], 8);
  y += 6;
  doc.setDrawColor(...rgb(TESTO));
  doc.setLineWidth(0.2);
  doc.rect(xTot, y, W_TOT[0] + W_TOT[1], H_FIRMA, 'S');
  font(doc, 'italic', 8);
  doc.text('Timbro e firma del cliente per accettazione', xTot + PAD_X, y + PAD_Y, { baseline: 'top' });

  chiudiPagine(doc, p.piede, p.riferimento);
  return base64(doc);
}

/**
 * Il preventivo del canone: intestazione del marchio (logo o nome) con la riga
 * dell'accento, cliente, beni con il totale, rata per durata con la durata in evidenza,
 * note. `colori.colore` per i testi forti, `colori.accento` per la riga e l'evidenza.
 */
export function disegnaPreventivo(
  p: ContenutoPreventivo,
  logo: string | null,
  colori: { colore: string; accento: string },
  nomeMarchio = '',
): string {
  const doc = new jsPDF({ unit: 'mm', format: 'a4' });

  if (disegnaLogo(doc, logo, { x: M, y: 12, w: 55, hMax: 18, allinea: 'left' }) === null && nomeMarchio) {
    font(doc, 'bold', 18, colori.colore);
    doc.text(nomeMarchio.toUpperCase(), M, 24);
  }
  font(doc, 'bold', 12, colori.colore);
  doc.text('PREVENTIVO DEL CANONE', DESTRA, 18, { align: 'right' });
  font(doc, 'normal', 9);
  doc.text('Noleggio operativo', DESTRA, 23.5, { align: 'right' });
  doc.text(`Data ${p.data}`, DESTRA, 28.5, { align: 'right' });
  doc.setDrawColor(...rgb(colori.accento));
  doc.setLineWidth(0.8);
  doc.line(M, 34, DESTRA, 34);

  const nuovaPagina = () => {
    doc.addPage();
    return IN_ALTO;
  };

  titoletto(doc, 'CLIENTE', 45);
  let y = 49;
  y += riga(doc, M, y, [{ testo: 'RAGIONE SOCIALE', w: 44 }, { testo: p.cliente.ragioneSociale, w: LARGO - 44 }], 7.5);
  y += riga(doc, M, y, [{ testo: 'P.IVA', w: 44 }, { testo: p.cliente.piva, w: LARGO - 44 }], 7.5);

  y = tabellaProdotti(doc, y + 10, 'BENI', p.righe, nuovaPagina);
  const totale: Cella[] = [
    { testo: 'TOTALE BENI', w: COL_PRODOTTI[0] + COL_PRODOTTI[1] + COL_PRODOTTI[2], allinea: 'right', stile: 'bold' },
    { testo: euro(p.totale), w: COL_PRODOTTI[3], allinea: 'right', stile: 'bold' },
  ];
  if (y + 7 > LIMITE) y = nuovaPagina();
  y += riga(doc, M, y, totale, 7);

  // Rata per durata: la tabella resta intera, con la durata in evidenza
  const W_RATE = [40, 70];
  const hRate = 8 + p.rate.length * 7.5;
  y += 10;
  if (y + 5 + hRate > LIMITE) y = nuovaPagina() + 4;
  titoletto(doc, 'CANONE MENSILE PER DURATA', y);
  y += 5;
  y += riga(doc, M, y, [
    { testo: 'DURATA', w: W_RATE[0], allinea: 'center', stile: 'italic' },
    { testo: 'CANONE MENSILE (IVA ESCL.)', w: W_RATE[1], allinea: 'center', stile: 'italic' },
  ], 8);
  for (const r of p.rate) {
    const evidenza = r.durata === p.durataEvidenza;
    const fondo = evidenza ? tinta(colori.accento, 0.16) : undefined;
    const stile: Stile = evidenza ? 'bold' : 'normal';
    y += riga(doc, M, y, [
      { testo: `${r.durata} mesi`, w: W_RATE[0], allinea: 'center', stile, fondo },
      { testo: `${euro(r.canone)} euro`, w: W_RATE[1], allinea: 'right', stile, fondo },
    ], 7.5);
  }

  // Note: condizioni del listino e note fisse
  y += 8;
  font(doc, 'normal', 8.5);
  const linee = p.note.map((n) => doc.splitTextToSize(n, LARGO - 4) as string[]);
  const hNote = 5 + linee.reduce((s, l) => s + l.length * altezzaRiga(8.5) + 1.2, 0);
  if (y + hNote > LIMITE) y = nuovaPagina() + 4;
  titoletto(doc, 'NOTE', y);
  y += 3;
  for (const l of linee) {
    font(doc, 'normal', 8.5);
    doc.text(l, M + 1, y, { baseline: 'top' });
    y += l.length * altezzaRiga(8.5) + 1.2;
  }

  chiudiPagine(doc, '', p.riferimento);
  return base64(doc);
}

// --- i tre documenti ---------------------------------------------------------

/** Nero e rosso del punto del marchio Led Office, se la carrozzeria non ne ha */
const COLORE_PREDEFINITO = '#1D1D1B';
const ACCENTO_PREDEFINITO = '#D03948';

/** Senza societa' fornitrice firma il fornitore stesso (Carrozzeria.societaFornitrice null) */
const societaDi = (k: Carrozzeria): SocietaFornitrice =>
  k.societaFornitrice ?? {
    ragioneSociale: k.nome,
    piva: '',
    rea: '',
    indirizzo: k.citta ?? '',
    telefono: '',
    email: '',
    pec: '',
    logo: k.brand.logo,
  };

/**
 * I PDF della proposta di distinta, pronti per salvaPdf(). `cliente` va al commerciale:
 * preventivo del canone e, se ci sono dati di vendita e indirizzo di consegna, proposta
 * di vendita. `locatore` e' solo per MCF: si salva fuori dalla cartella dei documenti
 * della proposta e non va mai nella risposta al commerciale.
 *
 * Senza instradamento (cliente bloccato, rosso, nessun canale) non esce niente:
 * { cliente: [], locatore: null }. Il chiamante rifiuta prima di arrivare qui.
 *
 * `loghi` in base64 (logoDaBlob): `fornitrice` e' quello della societa' che vende,
 * `marchio` quello della carrozzeria. Un logo che manca lascia il posto al nome.
 */
export function documentiLedOffice(
  c: CalcoloDistinta,
  k: Carrozzeria,
  id: string,
  loghi: { fornitrice: string | null; marchio: string | null },
  oggi: Date = new Date(),
): { cliente: { filename: string; contenuto: string }[]; locatore: { filename: string; contenuto: string } | null } {
  if (!c.instradamento) return { cliente: [], locatore: null };

  const colori = {
    colore: k.brand.colore || COLORE_PREDEFINITO,
    accento: k.brand.accento || ACCENTO_PREDEFINITO,
  };
  const cliente = [
    {
      filename: `preventivo-canone-${id}.pdf`,
      contenuto: disegnaPreventivo(contenutoPreventivoCanone(c, id, oggi), loghi.marchio, colori, k.nome),
    },
  ];
  if (!proposteDisponibili(c)) return { cliente, locatore: null };

  const s = societaDi(k);
  cliente.push({
    filename: `proposta-vendita-${id}.pdf`,
    contenuto: disegnaProposta(contenutoPropostaVendita(c, s, id, oggi), loghi, k.nome),
  });
  return {
    cliente,
    locatore: {
      filename: `proposta-locatore-${id}.pdf`,
      contenuto: disegnaProposta(contenutoPropostaLocatore(c, s, id, oggi), loghi, k.nome),
    },
  };
}
