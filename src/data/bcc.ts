// --- BCC Rent&Lease — coefficienti e condizioni ---
//
// Fonte: planner `#_BCCRLplanner_LO+LF+FF_260226.xlsx` (in vigore dal 01/01/2026),
// estratti ricalcolando il modello TIR/spread su ogni combinazione, non da tabella
// statica. Griglia di riferimento: ~/Desktop/AREE/Nord_Est_Group/BCC/COEFFICIENTI_BCC_LOLF.md
//
// A differenza di Grenke (coefficiente per fascia di importo e durata), BCC quota
// per CLASSE DI RISCHIO del bene, oltre a durata e fascia di importo.
//
// Config della griglia: locazione operativa, canone fisso mensile, VR 1%,
// anticipo primo canone, provvigione 3%, pagamento fornitore 2 giorni,
// spese istruttoria a carico cliente, ristorno spese SI.
// Validata al centesimo: 75.000 € a 60 mesi classe 3 -> canone con servizi 1.540,06.
// Cambiando VR, provvigione, durata o giorni pagamento fornitore va rigenerata.

export type ClasseRischioBcc = 1 | 2 | 3 | 4 | 5;

export const BCC_LO_DURATE = [24, 36, 48, 60];

// Colonne della griglia: importo di riferimento della fascia (in euro)
export const BCC_LO_FASCE = [10000, 25000, 50000, 75000, 100000];

// Coefficiente CON SERVIZI = rata mensile cliente / imponibile, in percentuale.
// Include gia' spese incasso SDD e ricarico servizi 3%.
// Struttura: classe -> durata -> valori nell'ordine di BCC_LO_FASCE.
export const BCC_LO_COEFF: Record<ClasseRischioBcc, Record<number, number[]>> = {
  1: {
    24: [4.5730, 4.5589, 4.5124, 4.5240, 4.5240],
    36: [3.1592, 3.1451, 3.0983, 3.1100, 3.1100],
    48: [2.4588, 2.4445, 2.3973, 2.4090, 2.4090],
    60: [2.0437, 2.0292, 1.9812, 1.9931, 1.9931],
  },
  2: {
    24: [4.6058, 4.5917, 4.5449, 4.5473, 4.5473],
    36: [3.1922, 3.1780, 3.1310, 3.1334, 3.1334],
    48: [2.4924, 2.4780, 2.4303, 2.4327, 2.4327],
    60: [2.0778, 2.0632, 2.0147, 2.0171, 2.0171],
  },
  3: {
    24: [4.6458, 4.6317, 4.5847, 4.5823, 4.5823],
    36: [3.2327, 3.2184, 3.1710, 3.1686, 3.1686],
    48: [2.5335, 2.5189, 2.4708, 2.4684, 2.4684],
    60: [2.1197, 2.1049, 2.0559, 2.0534, 2.0534],
  },
  4: {
    24: [4.6671, 4.6529, 4.6058, 4.6058, 4.6058],
    36: [3.2542, 3.2398, 3.1922, 3.1922, 3.1922],
    48: [2.5554, 2.5408, 2.4924, 2.4924, 2.4924],
    60: [2.1421, 2.1272, 2.0778, 2.0778, 2.0778],
  },
  5: {
    24: [4.7051, 4.6908, 4.6435, 4.6553, 4.6553],
    36: [3.2927, 3.2782, 3.2303, 3.2422, 3.2422],
    48: [2.5946, 2.5799, 2.5310, 2.5432, 2.5432],
    60: [2.1823, 2.1672, 2.1173, 2.1297, 2.1297],
  },
};

// Classe di rischio per comparto merceologico (foglio Input del planner).
// Serve a scegliere la colonna giusta: un centralino telefonico e' classe 3.
export const BCC_CLASSI_BENE: { comparto: string; classe: ClasseRischioBcc; durataMax: number }[] = [
  { comparto: 'Information technology (PC, server, monitor, copy)', classe: 2, durataMax: 60 },
  { comparto: 'Telecomunicazioni', classe: 3, durataMax: 60 },
  { comparto: 'Attrezzature commercio, vending, digital signage', classe: 3, durataMax: 60 },
  { comparto: 'Medicale, dentale, ottica, analisi', classe: 1, durataMax: 72 },
  { comparto: 'Estetica medica', classe: 3, durataMax: 60 },
  { comparto: 'Sollevatori telescopici e gru', classe: 4, durataMax: 60 },
  { comparto: 'Movimento terra, carrelli elevatori, vari edili', classe: 5, durataMax: 60 },
];

// Spese istruttoria una tantum a carico cliente, per fascia di importo
// (listino planner). Non entrano nel canone mensile.
export function bccSpeseIstruttoria(importo: number): number {
  if (importo <= 5000) return 75;
  if (importo <= 25000) return 100;
  if (importo <= 50000) return 150;
  if (importo <= 100000) return 200;
  if (importo <= 200000) return 300;
  return 500;
}

export const BCC_LO_MIN = 3000;
export const BCC_LO_MAX = 200000;
export const BCC_VR_PERC = 0.01; // valore di riscatto 1%

// La colonna si sceglie per vicinanza all'imponibile: le fasce della griglia
// sono importi di riferimento, non scaglioni netti, e tra fasce contigue il
// coefficiente cambia di pochi centesimi di punto.
function indiceFascia(importo: number): number {
  let best = 0;
  let dist = Infinity;
  BCC_LO_FASCE.forEach((f, i) => {
    const d = Math.abs(importo - f);
    if (d < dist) { dist = d; best = i; }
  });
  return best;
}

/** Coefficiente BCC locazione operativa (percentuale mensile sull'imponibile) */
export function getBccLoCoeff(importo: number, durata: number, classe: ClasseRischioBcc): number | null {
  const perDurata = BCC_LO_COEFF[classe]?.[durata];
  if (!perDurata) return null;
  return perDurata[indiceFascia(importo)] ?? null;
}

/** Canone mensile BCC "con servizi": e' quanto paga il cliente ogni mese */
export function bccLoCanone(importo: number, durata: number, classe: ClasseRischioBcc): number | null {
  const c = getBccLoCoeff(importo, durata, classe);
  return c === null ? null : (importo * c) / 100;
}

/**
 * Inverso: dal canone all'imponibile. La fascia dipende dall'imponibile che
 * risulta, quindi si itera finche' la colonna usata resta quella giusta.
 */
export function bccLoPrezzoDaCanone(canone: number, durata: number, classe: ClasseRischioBcc): number | null {
  const perDurata = BCC_LO_COEFF[classe]?.[durata];
  if (!perDurata || canone <= 0) return null;
  let prezzo = (canone / perDurata[2]) * 100; // parto dalla colonna centrale (50k)
  for (let i = 0; i < 6; i++) {
    const c = perDurata[indiceFascia(prezzo)];
    const nuovo = (canone / c) * 100;
    if (Math.abs(nuovo - prezzo) < 0.5) return nuovo;
    prezzo = nuovo;
  }
  return prezzo;
}
