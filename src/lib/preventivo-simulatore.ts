// Preventivo PDF della verifica del simulatore di noleggio operativo.
//
// SERVER-ONLY (jsPDF con Manrope incorporato, tramite pdf-generico.ts).
//
// Deciso da Alberto il 24/10/2026: chi lascia i dati scarica subito il
// preventivo, con qualunque esito; lo stesso PDF va in allegato alla mail ad
// Alberto. I canoni escono dalle stesse funzioni del simulatore (grenke.ts),
// cosi' il PDF dice quello che la pagina ha appena mostrato. Marchio MCF,
// nessun nome di societa' di noleggio, nessun coefficiente.

import { DURATE_BASE, DURATE_FOTOVOLTAICO, RISCATTI, getAdjustedCoeff, getPioneerCoeff } from '../data/grenke';
import { disegna, euro as cifra, dataItaliana, type Documento } from './motore/pdf-generico';

/** 1234.5 -> "1.234,50 €" */
const euro = (n: number) => `${cifra(n)} €`;

export const TIPOLOGIA_DEFAULT = 'Altri Beni Strumentali';
const SOFTWARE = 'Software Gestionali / CAD';

export const PIEDE_SIMULATORE =
  'Mediocredito Facile · www.mediocreditofacile.it · +39 393 995 7840. Canoni indicativi alla data del ' +
  'preventivo: ogni operazione è soggetta a valutazione e delibera della società di noleggio.';

export interface RigaCanone {
  durata: number;
  /** Canone mensile, pagamento trimestrale anticipato */
  canone: number;
  trimestre: number;
  riscattoPerc: number;
  riscatto: number;
}

/** Tipologia letta dal modulo: solo quelle del simulatore, altrimenti la generica */
export function tipologiaValida(t: string): string {
  return Object.prototype.hasOwnProperty.call(RISCATTI, t) ? t : TIPOLOGIA_DEFAULT;
}

/** Il canone su tutte le durate che il simulatore offre per quella tipologia e quell'importo */
export function righeCanoni(tipologia: string, importo: number): RigaCanone[] {
  const t = tipologiaValida(tipologia);
  const durate = t === 'Fotovoltaico' ? DURATE_FOTOVOLTAICO : DURATE_BASE;
  const software = t === SOFTWARE;
  const righe: RigaCanone[] = [];
  for (const durata of durate) {
    const riscattoPerc = RISCATTI[t]?.[durata];
    if (riscattoPerc == null) continue;
    if (importo < 500 || importo > (software ? 100_000 : 500_000)) continue;
    const coeff = software ? getPioneerCoeff(importo, durata) : getAdjustedCoeff(importo, durata);
    if (!coeff) continue;
    const canone = Math.round(importo * coeff) / 100;
    righe.push({
      durata,
      canone,
      trimestre: Math.round(canone * 300) / 100,
      riscattoPerc,
      riscatto: Math.round(importo * riscattoPerc) / 100,
    });
  }
  return righe;
}

export interface DatiPreventivo {
  intestatario: string | null;
  piva: string;
  tipologia: string;
  importo: number;
  durataScelta: number | null;
  documenti: string[];
  oggi?: Date;
}

export function contenutoPreventivo(d: DatiPreventivo): Documento {
  const oggi = d.oggi ?? new Date();
  const t = tipologiaValida(d.tipologia);
  const righe = righeCanoni(t, d.importo);
  const rif = `SIM-${oggi.toISOString().slice(0, 10).replace(/-/g, '')}-${d.piva.slice(-4)}`;
  const nome = d.intestatario ?? `Partita IVA ${d.piva}`;

  const blocchi: Documento['blocchi'] = [
    {
      tipo: 'coppie',
      righe: [
        ['Intestato a', nome],
        ['Partita IVA', d.piva],
        ['Bene', t],
        ['Importo, IVA esclusa', euro(d.importo)],
        ['Data', dataItaliana(oggi)],
      ],
    },
    { tipo: 'sezione', titolo: 'Canone per durata' },
  ];

  if (righe.length) {
    blocchi.push({
      tipo: 'tabella',
      intestazioni: ['Durata', 'Canone mensile', 'Ogni trimestre', 'Riscatto finale'],
      destra: [false, true, true, true],
      righe: righe.map((r) => [
        `${r.durata} mesi${r.durata === d.durataScelta ? ' (scelta)' : ''}`,
        euro(r.canone),
        euro(r.trimestre),
        t === SOFTWARE ? 'non previsto' : `${euro(r.riscatto)} (${r.riscattoPerc}%)`,
      ]),
    });
  } else {
    blocchi.push({ tipo: 'testo', testo: 'Per questo importo e questo bene il canone si calcola sul caso specifico: lo trovi nella telefonata.' });
  }

  const condizioni = [
    'Pagamento trimestrale anticipato. Pagamento mensile su richiesta, con maggiorazione del 5%.',
    'Assicurazione obbligatoria e spese di istruttoria non comprese nel canone.',
    'Il canone è un costo d\'esercizio interamente deducibile per la durata del contratto: conferma il tuo caso con il commercialista.',
  ];
  if (righe.some((r) => r.durata >= 72)) condizioni.push('A 72 e 84 mesi il canone segue la tabella dedicata al fotovoltaico.');
  blocchi.push({ tipo: 'sezione', titolo: 'Condizioni' }, { tipo: 'elenco', voci: condizioni });

  blocchi.push(
    { tipo: 'sezione', titolo: 'Per andare avanti' },
    { tipo: 'elenco', voci: d.documenti },
    {
      tipo: 'testo',
      testo: 'Entro 24 ore lavorative ti richiamo per i dettagli legati al tuo caso e al bene oggetto dell\'operazione, e per i controlli di congruità.',
    },
  );

  return {
    filename: `preventivo-noleggio-${d.piva}.pdf`,
    marchio: 'mcf',
    titolo: 'Preventivo di noleggio operativo',
    sottotitolo: `Preventivo di noleggio operativo per ${nome}`,
    riferimento: rif,
    notaDemo: null,
    blocchi,
    piede: PIEDE_SIMULATORE,
  };
}

/** Il PDF in base64 */
export function pdfPreventivo(d: DatiPreventivo): { filename: string; base64: string } {
  const doc = contenutoPreventivo(d);
  return { filename: doc.filename, base64: disegna(doc, '#664CCD', '#FE6F3A') };
}
