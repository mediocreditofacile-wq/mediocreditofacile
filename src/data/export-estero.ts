// Instradamento delle operazioni con controparte estera.
//
// REGOLA UNICA, decisa da Alberto il 31/08/2026: sopra i 200.000 EUR di operazione
// si va su Econocom, che ha la priorita' su tutto. Sotto, decide l'area: in
// Schengen/SEPA resta il noleggio operativo Grenke, fuori si passa dal percorso
// assicurato SACE.
//
// La soglia guarda l'IMPORTO DELL'OPERAZIONE, non la dimensione della controparte.
// E' una scelta che semplifica parecchio: l'importo e' il nostro prezzo, in euro e
// certo, mentre i bilanci esteri arrivano senza che Openapi dichiari in che valuta
// siano. La dimensione della controparte resta nel prospetto come informazione,
// non come regola.
//
// I 200.000 sono il tetto Grenke per operazione, quindi la soglia non e' un numero
// nuovo: e' il punto dove Grenke finisce e Econocom comincia.
//
// La regola sta qui e non nel tool perche' il tool e' un file statico: tenerla
// server-side e' l'unico modo perche' la scheda a schermo e il PDF dicano la
// stessa cosa anche fra sei mesi.

import { calcolaRataEconocomPA, type RisultatoEconocomPA } from './econocom-pa';

/** Sopra questo importo di operazione si va su Econocom, sempre. E' il tetto Grenke. */
export const SOGLIA_ECONOCOM = 200_000;

/**
 * Sopra questi volumi o patrimonio netto la controparte e' di suo un profilo
 * Econocom. NON instrada: serve solo a dirlo nel prospetto, perche' rafforza il
 * discorso quando si manda la pratica a Luca.
 */
export const SOGLIA_CONTROPARTE = 2_000_000;

// Paesi dove il bilancio e' certamente in euro. Openapi NON dichiara la valuta in
// nessun campo della risposta. Da quando la soglia guarda l'importo dell'operazione
// questo non tocca piu' la scelta del canale, ma serve ancora a decidere se ha
// senso commentare i numeri della controparte.
// Bulgaria volutamente esclusa: l'adozione dell'euro va confermata.
const EUROZONA = ['AT','BE','CY','DE','EE','ES','FI','FR','GR','HR','IE','IT','LT','LU','LV','MT','NL','PT','SI','SK'];

export function valutaCerta(paese: string): boolean {
  return EUROZONA.includes((paese ?? '').toUpperCase());
}

// Area Schengen / SEPA, dalla call Alberto-Andrea del 12/06/2026: il noleggio
// operativo si fa dove non c'e' rischio cambio e dove Grenke ha una sede.
// L'Irlanda e' in euro e in SEPA ma non in Schengen: per quello che conta qui va
// dentro. Il Regno Unito resta fuori: sterlina.
const SCHENGEN = ['AT','BE','BG','CH','CY','CZ','DE','DK','EE','ES','FI','FR','GR','HR','HU','IE','IS','IT',
  'LI','LT','LU','LV','MT','NL','NO','PL','PT','RO','SE','SI','SK'];

export function inAreaSchengen(paese: string): boolean {
  return SCHENGEN.includes((paese ?? '').toUpperCase());
}

/** Un'azienda troppo giovane resta fuori perimetro ovunque, in Italia come all'estero */
export function nuovaCostituzione(inizioAttivita: string | null, anniMinimi = 2): boolean | null {
  if (!inizioAttivita) return null;
  const d = new Date(inizioAttivita);
  if (Number.isNaN(d.getTime())) return null;
  const anni = (Date.now() - d.getTime()) / (365.25 * 24 * 3600 * 1000);
  return anni < anniMinimi;
}

export type Canale = 'econocom' | 'grenke' | 'sace' | 'incerto';

export interface EsitoCanale {
  canale: Canale;
  /** Testo breve del perche', gia' pronto per la scheda e per il PDF */
  motivo: string;
  /** Area geografica: conta solo sotto la soglia, perche' sopra decide Econocom */
  area: 'schengen' | 'extra';
  soglia: {
    valore: number;
    /** Se l'importo dell'operazione supera la soglia. `null` quando l'importo non c'e' ancora */
    superata: boolean | null;
  };
  /** Solo sul canale Econocom */
  rataIndicativa: RisultatoEconocomPA | null;
  avvisi: string[];
  /** Cosa serve per portare avanti la pratica sul canale scelto */
  prossimiPassi: string[];
}

const PASSI_ECONOCOM = [
  'Mandare a Econocom (Luca Silvestrin) visura, ultimi due bilanci e descrizione del bene.',
  'Econocom quota caso per caso: la rata qui sopra e\' un ordine di grandezza, non un\'offerta.',
  'Verificare che il bene sia consegnato e installato in un paese dove Econocom opera.',
];

const PASSI_GRENKE = [
  'Entro i 200.000 l\'operazione resta sul noleggio operativo Grenke, come le pratiche italiane.',
  'Verificare che Grenke sia presente con propria sede nel paese della controparte.',
  'Raccogliere i documenti di istruttoria della controparte come per una pratica italiana.',
];

const PASSI_SACE = [
  'Percorso export con garanzia SACE: la controparte estera compra, il rischio di credito lo copre SACE.',
  'Serve una societa\' di locazione nel paese della controparte: senza quella l\'operazione non si struttura.',
  'Verificare prima la copertura SACE sul paese: su Brasile COFACE non copriva e la strada e\' rimasta solo questa.',
  'Raccogliere contratto di fornitura, condizioni di pagamento e paese di destinazione del bene.',
];

/**
 * Decide il canale per una controparte estera.
 *
 * @param dati fatturato e patrimonio netto della controparte, solo per il commento
 * @param paese codice ISO a due lettere
 * @param importoOperazione valore del bene da finanziare, in euro: e' quello che decide
 */
export function valutaCanaleEstero(
  dati: { fatturato: number | null; patrimonioNetto: number | null },
  paese: string,
  importoOperazione: number | null,
): EsitoCanale {
  const avvisi: string[] = [];
  const area: 'schengen' | 'extra' = inAreaSchengen(paese) ? 'schengen' : 'extra';
  const importo = importoOperazione != null && importoOperazione > 0 ? importoOperazione : null;

  // La dimensione della controparte non instrada, ma quando e' di rilievo si dice:
  // e' un argomento in piu' quando la pratica arriva sul tavolo di Econocom.
  const massimo = Math.max(dati.fatturato ?? 0, dati.patrimonioNetto ?? 0);
  if (massimo >= SOGLIA_CONTROPARTE && valutaCerta(paese)) {
    avvisi.push(`Controparte oltre i ${euro(SOGLIA_CONTROPARTE)} fra volumi e patrimonio netto: profilo di suo in target Econocom.`);
  }
  if (dati.fatturato == null && dati.patrimonioNetto == null) {
    avvisi.push('Nessun dato di bilancio pubblicato per questa controparte: il merito va valutato sui documenti che manda il cliente.');
  } else if (!valutaCerta(paese)) {
    avvisi.push('Openapi non dichiara la valuta del bilancio e questo paese non e\' in area euro: leggere i numeri della controparte con cautela. La scelta del canale non ne dipende, perche\' guarda l\'importo dell\'operazione.');
  }

  if (importo == null) {
    return {
      canale: 'incerto',
      motivo: `Serve l'importo dell'operazione per scegliere il canale: sopra ${euro(SOGLIA_ECONOCOM)} si va su Econocom, sotto decide l'area.`,
      area,
      soglia: { valore: SOGLIA_ECONOCOM, superata: null },
      rataIndicativa: null,
      avvisi,
      prossimiPassi: ['Configurare la macchina e il prezzo: il canale si decide sul totale dell\'offerta.'],
    };
  }

  // Sopra soglia Econocom vince su tutto: area e dimensione della controparte non contano.
  if (importo > SOGLIA_ECONOCOM) {
    if (area === 'extra') {
      avvisi.push('Controparte fuori area Schengen: il canale resta Econocom, ma va verificato che operi in quel paese.');
    }
    const rata = calcolaRataEconocomPA(importo);
    if (rata) {
      avvisi.push('La rata usa i coefficienti Econocom a 60 mesi nati per la Pubblica Amministrazione: e\' l\'unica tabella che abbiamo, quindi vale come ordine di grandezza e non come quotazione.');
    }
    return {
      canale: 'econocom',
      motivo: `Operazione da ${euro(importo)}, sopra i ${euro(SOGLIA_ECONOCOM)}: si va su Econocom, che ha la priorita' su tutto.`,
      area,
      soglia: { valore: SOGLIA_ECONOCOM, superata: true },
      rataIndicativa: rata,
      avvisi,
      prossimiPassi: PASSI_ECONOCOM,
    };
  }

  // Sotto soglia decide l'area, come da regola gia' nel tool
  if (area === 'schengen') {
    return {
      canale: 'grenke',
      motivo: `Operazione da ${euro(importo)}, entro i ${euro(SOGLIA_ECONOCOM)}: in area Schengen resta il noleggio operativo Grenke.`,
      area,
      soglia: { valore: SOGLIA_ECONOCOM, superata: false },
      rataIndicativa: null,
      avvisi,
      prossimiPassi: PASSI_GRENKE,
    };
  }

  return {
    canale: 'sace',
    motivo: `Operazione da ${euro(importo)}, entro i ${euro(SOGLIA_ECONOCOM)}, con controparte fuori area Schengen: si passa dal percorso assicurato SACE.`,
    area,
    soglia: { valore: SOGLIA_ECONOCOM, superata: false },
    rataIndicativa: null,
    avvisi,
    prossimiPassi: PASSI_SACE,
  };
}

function euro(n: number): string {
  return new Intl.NumberFormat('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }).format(n);
}
