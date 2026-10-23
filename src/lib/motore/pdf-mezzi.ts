// I PDF del settore "mezzi" (Bergamelli): i due documenti che l'agente consegna al cliente.
//
// ATTENZIONE — FILE SERVER-ONLY.
//
// Due documenti dallo stesso calcolo (CalcoloMezzi), quindi coi numeri dello schermo:
//  - preventivo di noleggio operativo, intestato al VENDITORE che firma l'offerta (Manc,
//    Nol System): colori della carrozzeria, piede coi dati del venditore. Esce solo se
//    un canale quota; la rata viene da vistaCommerciale(), mai dal canale;
//  - prospetto di leasing finanziario, a marchio Mediocredito Facile con l'iscrizione
//    OAM: una sola colonna di partner, quella che l'agente ha scelto, accorpata nelle
//    voci (le spese sono una cifra sola) e senza il nome del partner.
//
// Vanno al cliente finale: nessun nome di locatore o di societa' di leasing, nessuno
// spread, tasso, provvigione, coefficiente o canale. Un test serializza i documenti e
// cerca queste parole. Senza la ricerca (simulazione) il cliente non si conosce e i
// documenti non esistono.
//
// Contenuto e disegno sono separati, come in pdf-generico.ts: contenuto*() sono
// funzioni pure e si testano senza aprire un PDF; il disegno e' disegna() di
// pdf-generico, qui non si impagina niente.

import { buildChecklist } from '../checklist-pratica';
import type { BeneMezzo } from './beni-mezzi';
import { chiaveColonna, type CalcoloMezzi } from './calcolo-mezzi';
import type { RicercaSalvata } from './calcolo-proposta';
import type { Carrozzeria } from './carrozzeria';
import type { Venditore } from './config-mezzi';
import { vistaCommerciale } from './instradamento';
import { serveFraseDaConfermare } from './nota-canone';
import { dataItaliana, disegna, euro, NOTA_DEMO_PDF, PIEDE_LEASING, PIEDE_NOLEGGIO, type Blocco, type Documento } from './pdf-generico';

const NERO = '#0F1020';
const VIOLA = '#664CCD';

const NOTA_CANONE_DA_CONFERMARE = 'Canone indicativo, da confermare.';
const NOTA_IVA = 'Importi IVA esclusa.';
const TESTO_LEASING =
  "Il primo mese è l'anticipo. Le spese comprendono istruttoria e incasso delle rate. Importi IVA esclusa. " +
  'La rata è indicativa: quella definitiva sarà assegnata in base al rating di merito creditizio del cliente, ' +
  'una volta esaminata la documentazione.';

// disegna() non manda a capo il testo di una cella di tabella: con una descrizione di
// 100 caratteri scriverebbe sopra la colonna accanto. Le celle lunghe si spezzano qui,
// in righe di tabella aggiuntive. I limiti sono misurati su Manrope a 9 pt: 36 caratteri
// stanno anche in maiuscolo nei 66 mm della colonna descrizione; 18 caratteri di categoria
// (31 mm in maiuscolo) escono di poco dai 24 mm della colonna, ma nello spazio vuoto a
// sinistra della colonna Quantita', i cui numeri sono allineati a destra.
const MAX_DESCRIZIONE_CELLA = 36;
const MAX_CATEGORIA_CELLA = 18;

const r2 = (n: number) => Math.round(n * 100) / 100;

/** Il testo spezzato per parole in righe di al piu' `max` caratteri; una parola piu' lunga si taglia */
function aCapo(testo: string, max: number): string[] {
  const righe: string[] = [];
  let corrente = '';
  for (const parola of testo.split(/\s+/).filter(Boolean)) {
    // Per simboli e non per unita' UTF-16: tagliare a meta' una coppia surrogata rompe il PDF
    let resto = Array.from(parola);
    while (resto.length > max) {
      if (corrente) righe.push(corrente);
      corrente = '';
      righe.push(resto.slice(0, max).join(''));
      resto = resto.slice(max);
    }
    const p = resto.join('');
    if (!p) continue;
    if (!corrente) corrente = p;
    else if (corrente.length + 1 + p.length <= max) corrente += ` ${p}`;
    else {
      righe.push(corrente);
      corrente = p;
    }
  }
  if (corrente) righe.push(corrente);
  return righe.length ? righe : [''];
}

/** Le righe di tabella di un bene: i numeri sulla prima, le righe di continuazione solo col testo */
function righeTabellaBene(b: BeneMezzo): string[][] {
  const descrizione = aCapo(b.descrizione, MAX_DESCRIZIONE_CELLA);
  const categoria = aCapo(b.categoria, MAX_CATEGORIA_CELLA);
  return Array.from({ length: Math.max(descrizione.length, categoria.length) }, (_, i) => [
    descrizione[i] ?? '',
    categoria[i] ?? '',
    ...(i === 0 ? [String(b.quantita), euro(b.prezzo), euro(b.totale)] : ['', '', '']),
  ]);
}

function blocchiCliente(ricerca: RicercaSalvata): Blocco[] {
  const s = ricerca.dati_credito.scheda;
  const righe: [string, string][] = [
    ['Ragione sociale', s.ragioneSociale || ricerca.ragione_sociale || 'Cliente'],
    ['Partita IVA', s.piva || ricerca.piva],
  ];
  if (s.sede) righe.push(['Sede', s.sede]);
  return [{ tipo: 'sezione', titolo: 'Cliente' }, { tipo: 'coppie', righe }];
}

/** "Manc S.r.l. · P.IVA 0386... · via · telefono · email": i campi vuoti non lasciano separatori */
function lineaVenditore(v: Venditore): string {
  return [v.ragioneSociale, `P.IVA ${v.piva}`, v.indirizzo, v.telefono, v.email]
    .map((x) => x.trim())
    .filter((x) => x !== '')
    .join(' · ');
}

// --- contenuto ---------------------------------------------------------------

/**
 * Il preventivo di noleggio, intestato al venditore. Null se nessun canale quota
 * (mezzo targato, cliente che non regge Econocom...) o se il cliente non e' stato
 * verificato: in simulazione non c'e' niente da consegnare.
 */
export function contenutoNoleggioMezzi(
  c: CalcoloMezzi,
  k: Carrozzeria,
  id: string,
  agente: { nome: string; email: string },
  oggi: Date = new Date(),
): Documento | null {
  if (!c.noleggio || !c.ricerca) return null;
  const vista = vistaCommerciale(c.noleggio);

  // La nota del listino dice gia' "da confermare" sul canale che lo richiede: la frase
  // fissa si aggiunge solo se non c'e' (la stessa regola dello schermo, nota-canone.ts)
  const nota = vista.nota ?? '';
  const condizioni = [
    nota,
    serveFraseDaConfermare(vista.daConfermare, nota) ? NOTA_CANONE_DA_CONFERMARE : '',
    NOTA_IVA,
  ]
    .filter((x) => x !== '')
    .join(' ');

  const referente = [agente.nome, agente.email].map((x) => x.trim()).filter((x) => x !== '').join(', ');
  const forma = c.ricerca.dati_credito.scheda.formaGiuridica ?? '';

  return {
    filename: `preventivo-noleggio-${id}.pdf`,
    marchio: 'fornitore',
    titolo: c.venditore.ragioneSociale,
    sottotitolo: 'Preventivo di noleggio operativo',
    riferimento: `N. ${id} · ${dataItaliana(oggi)}`,
    notaDemo: k.demo ? NOTA_DEMO_PDF : null,
    blocchi: [
      ...blocchiCliente(c.ricerca),
      { tipo: 'sezione', titolo: 'Fornitura' },
      {
        tipo: 'tabella',
        primaColonna: 70,
        intestazioni: ['Descrizione', 'Categoria', 'Quantità', 'Prezzo, euro', 'Totale, euro'],
        destra: [false, false, true, true, true],
        righe: c.beni.flatMap(righeTabellaBene),
      },
      { tipo: 'coppie', righe: [['Totale, IVA esclusa', `${euro(c.totale)} euro`]] },
      { tipo: 'sezione', titolo: 'Noleggio operativo: canone per durata' },
      {
        tipo: 'tabella',
        intestazioni: ['Durata', 'Canone mensile, euro'],
        destra: [false, true],
        righe: vista.rate.map((r) => [`${r.durata} mesi`, euro(r.canone)]),
      },
      { tipo: 'testo', testo: condizioni },
      // Senza nome ne' email la riga vuota non si stampa
      ...(referente ? [{ tipo: 'testo', testo: `Referente commerciale: ${referente}` } as const] : []),
      { tipo: 'sezione', titolo: 'Documenti per aprire la pratica' },
      { tipo: 'elenco', voci: buildChecklist(forma, c.totale, k.documentiExtra) },
    ],
    piede: `${lineaVenditore(c.venditore)}. ${PIEDE_NOLEGGIO}`,
  };
}

/**
 * Il prospetto di leasing del partner chiesto, a marchio MCF. `chiave` e' la lettera
 * della colonna (A, B, C nell'ordine della configurazione): una chiave che non c'e', o
 * una colonna senza righe (importo fuori dai limiti del partner), non da' il documento.
 * Senza ricerca (simulazione) non c'e' un cliente a cui intestarlo.
 */
export function contenutoLeasingMezzi(
  c: CalcoloMezzi,
  k: Carrozzeria,
  id: string,
  chiave: string,
  oggi: Date = new Date(),
): Documento | null {
  const colonna = c.leasing.find((_, i) => chiaveColonna(i) === chiave);
  if (!colonna || colonna.righe.length === 0 || !c.ricerca) return null;

  // Le righe del bene: una per bene, numerate se sono piu' d'una. Il fornitore e' il
  // venditore dell'offerta, la societa' che vende il mezzo al cliente
  const etichetta = k.etichettaBene || 'Bene';
  const beni: [string, string][] = c.beni.map((b, i) => [
    c.beni.length > 1 ? `${etichetta} ${i + 1}` : etichetta,
    `${b.descrizione} (${b.categoria}), ${b.quantita} x ${euro(b.prezzo)} euro`,
  ]);

  return {
    filename: `prospetto-leasing-${id}.pdf`,
    marchio: 'mcf',
    titolo: 'Mediocredito Facile',
    sottotitolo: 'Prospetto di leasing finanziario',
    riferimento: `N. ${id} · ${dataItaliana(oggi)}`,
    notaDemo: k.demo ? NOTA_DEMO_PDF : null,
    blocchi: [
      ...blocchiCliente(c.ricerca),
      { tipo: 'sezione', titolo: 'Bene' },
      {
        tipo: 'coppie',
        righe: [...beni, ['Fornitore', c.venditore.ragioneSociale], ['Importo, IVA esclusa', `${euro(c.totale)} euro`]],
      },
      { tipo: 'sezione', titolo: 'Leasing finanziario: rata per durata, importi in euro' },
      {
        tipo: 'tabella',
        primaColonna: 22,
        intestazioni: ['Durata', 'Anticipo', 'Rate mensili', 'Riscatto', 'Spese', 'Totale'],
        destra: [false, true, true, true, true, true],
        righe: colonna.righe.map((l) => [
          `${l.durata} mesi`,
          `${euro(l.anticipo)} (${euro(l.anticipoPerc, 0)}%)`,
          `${l.numRate} x ${euro(l.rata)}`,
          `${euro(l.riscatto)} (${euro(l.riscattoPerc, 0)}%)`,
          // Istruttoria e incasso di tutte le rate in una voce sola: separate direbbero chi c'e' dietro
          euro(r2(l.speseIstruttoria + l.speseIncassoRata * l.numRate)),
          euro(l.totale),
        ]),
      },
      { tipo: 'testo', testo: TESTO_LEASING },
    ],
    piede: PIEDE_LEASING,
  };
}

// --- disegno -----------------------------------------------------------------

/**
 * I PDF di un preventivo, pronti per salvaPdf(): il noleggio se un canale quota, il
 * leasing se l'agente ha scelto un partner (`chiaveLeasing`, la lettera della colonna).
 * Senza noleggio e senza partner la lista e' vuota.
 */
export function documentiMezzi(
  c: CalcoloMezzi,
  k: Carrozzeria,
  id: string,
  chiaveLeasing: string | null,
  agente: { nome: string; email: string },
  oggi: Date = new Date(),
): { filename: string; contenuto: string }[] {
  const colore = k.brand.colore || NERO;
  const accento = k.brand.accento || k.brand.colore || VIOLA;
  const docs = [
    contenutoNoleggioMezzi(c, k, id, agente, oggi),
    chiaveLeasing === null ? null : contenutoLeasingMezzi(c, k, id, chiaveLeasing, oggi),
  ].filter((d): d is Documento => d !== null);
  return docs.map((d) => ({
    filename: d.filename,
    // Il prospetto di leasing porta i colori MCF, non quelli della carrozzeria
    contenuto: d.marchio === 'mcf' ? disegna(d, VIOLA, VIOLA) : disegna(d, colore, accento),
  }));
}
