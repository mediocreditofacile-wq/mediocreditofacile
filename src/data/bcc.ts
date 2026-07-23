// --- BCC Rent&Lease — coefficienti dei tre prodotti ---
//
// Fonte: planner `#_BCCRLplanner_LO+LF+FF_260226.xlsx` (in vigore dal 01/01/2026),
// in ~/Desktop/AREE/Nord_Est_Group/BCC/. I coefficienti NON esistono come tabella
// nel planner: sono stati ottenuti ricalcolando il modello completo (provvista ->
// TIR -> cash flow) su ogni combinazione di prodotto, classe, durata e fascia.
//
// Config di calcolo, la stessa del preventivatore che Alberto usa in operativo:
// canone fisso mensile, anticipo primo canone, provvigione 3%, pagamento fornitore
// 2 giorni, ristorno spese SI. Riscatto 1% su locazione operativa e finanziaria,
// nessun riscatto sul finanziamento finalizzato.
//
// Validazione: 75.000 EUR a 60 mesi classe 3 in locazione operativa danno canone
// con servizi 1.540,06 e canone finanziario netto 1.502,56, identici al
// preventivatore. L'intera griglia di locazione operativa coincide cifra per cifra
// con quella validata a mano in COEFFICIENTI_BCC_LOLF.md.
//
// Il coefficiente e' COSTANTE dentro ogni fascia di importo (verificato su due
// campioni per fascia): le fasce sono scaglioni netti, non punti di riferimento.
//
// Da rigenerare quando cambia il planner (nuovo trimestre o nuova campagna).

export type ClasseRischioBcc = 1 | 2 | 3 | 4 | 5;
export type ProdottoBcc = 'lo' | 'lf' | 'ff';

/** Scaglioni di importo su cui cambia lo spread */
export const BCC_FASCE: { da: number; a: number }[] = [
  { da: 0, a: 5000 },
  { da: 5000.01, a: 15000 },
  { da: 15000.01, a: 25000 },
  { da: 25000.01, a: 50000 },
  { da: 50000.01, a: 100000 },
  { da: 100000.01, a: 2000000 },
];

export const BCC_DURATE = [18, 24, 30, 36, 48, 60];

// Coefficiente = canone mensile / imponibile, in percentuale. Include gia' le
// spese di incasso SDD e, sulla locazione operativa, il ricarico servizi 3%.
// Struttura: classe di rischio -> durata -> un valore per fascia (ordine BCC_FASCE).
type GrigliaBcc = Record<ClasseRischioBcc, Record<number, (number | null)[]>>;

/** Locazione operativa: il canone e' un costo pieno, riscatto finale 1% */
export const BCC_LO: GrigliaBcc = {
  1: {
    18: [6.0479, 5.9914, 5.9773, 5.9305, 5.9422, 5.9422],
    24: [4.6293, 4.5730, 4.5589, 4.5124, 4.5240, 4.5240],
    30: [3.7803, 3.7238, 3.7097, 3.6631, 3.6748, 3.6748],
    36: [3.2160, 3.1592, 3.1451, 3.0983, 3.1100, 3.1100],
    48: [2.5165, 2.4588, 2.4445, 2.3973, 2.4090, 2.4090],
    60: [2.1024, 2.0437, 2.0292, 1.9812, 1.9931, 1.9931],
  },
  2: {
    18: [6.0810, 6.0243, 6.0102, 5.9632, 5.9656, 5.9656],
    24: [4.6624, 4.6058, 4.5917, 4.5449, 4.5473, 4.5473],
    30: [3.8135, 3.7567, 3.7426, 3.6957, 3.6981, 3.6981],
    36: [3.2494, 3.1922, 3.1780, 3.1310, 3.1334, 3.1334],
    48: [2.5505, 2.4924, 2.4780, 2.4303, 2.4327, 2.4327],
    60: [2.1371, 2.0778, 2.0632, 2.0147, 2.0171, 2.0171],
  },
  3: {
    18: [6.1213, 6.0644, 6.0502, 6.0031, 6.0008, 6.0008],
    24: [4.7027, 4.6458, 4.6317, 4.5847, 4.5823, 4.5823],
    30: [3.8540, 3.7969, 3.7827, 3.7355, 3.7332, 3.7332],
    36: [3.2902, 3.2327, 3.2184, 3.1710, 3.1686, 3.1686],
    48: [2.5922, 2.5335, 2.5189, 2.4708, 2.4684, 2.4684],
    60: [2.1798, 2.1197, 2.1049, 2.0559, 2.0534, 2.0534],
  },
  4: {
    18: [6.1427, 6.0857, 6.0715, 6.0243, 6.0243, 6.0243],
    24: [4.7242, 4.6671, 4.6529, 4.6058, 4.6058, 4.6058],
    30: [3.8756, 3.8182, 3.8040, 3.7567, 3.7567, 3.7567],
    36: [3.3120, 3.2542, 3.2398, 3.1922, 3.1922, 3.1922],
    48: [2.6144, 2.5554, 2.5408, 2.4924, 2.4924, 2.4924],
    60: [2.2025, 2.1421, 2.1272, 2.0778, 2.0778, 2.0778],
  },
  5: {
    18: [6.1809, 6.1237, 6.1094, 6.0620, 6.0739, 6.0739],
    24: [4.7624, 4.7051, 4.6908, 4.6435, 4.6553, 4.6553],
    30: [3.9141, 3.8564, 3.8421, 3.7945, 3.8064, 3.8064],
    36: [3.3509, 3.2927, 3.2782, 3.2303, 3.2422, 3.2422],
    48: [2.6542, 2.5946, 2.5799, 2.5310, 2.5432, 2.5432],
    60: [2.2433, 2.1823, 2.1672, 2.1173, 2.1297, 2.1297],
  },
};

/** Locazione finanziaria (leasing): il cliente riscatta il bene all'1% */
export const BCC_LF: GrigliaBcc = {
  1: {
    18: [6.0489, 5.9922, 5.9781, 5.9312, 5.9195, 5.8589],
    24: [4.6298, 4.5733, 4.5592, 4.5125, 4.5009, 4.4407],
    30: [3.7805, 3.7238, 3.7097, 3.6630, 3.6514, 3.5913],
    36: [3.2161, 3.1591, 3.1449, 3.0980, 3.0864, 3.0262],
    48: [2.5166, 2.4587, 2.4444, 2.3969, 2.3851, 2.3244],
    60: [2.1027, 2.0437, 2.0291, 1.9809, 1.9689, 1.9075],
  },
  2: {
    18: [6.0821, 6.0253, 6.0111, 5.9640, 5.9429, 5.8822],
    24: [4.6630, 4.6062, 4.5921, 4.5452, 4.5242, 4.4638],
    30: [3.8138, 3.7568, 3.7427, 3.6957, 3.6747, 3.6143],
    36: [3.2496, 3.1923, 3.1780, 3.1308, 3.1097, 3.0492],
    48: [2.5507, 2.4924, 2.4779, 2.4301, 2.4087, 2.3476],
    60: [2.1376, 2.0780, 2.0632, 2.0145, 1.9928, 1.9310],
  },
  3: {
    18: [6.1225, 6.0655, 6.0513, 6.0040, 5.9781, 5.9172],
    24: [4.7034, 4.6464, 4.6322, 4.5850, 4.5592, 4.4986],
    30: [3.8545, 3.7971, 3.7829, 3.7356, 3.7097, 3.6491],
    36: [3.2906, 3.2328, 3.2185, 3.1709, 3.1449, 3.0841],
    48: [2.5926, 2.5336, 2.5190, 2.4707, 2.4444, 2.3828],
    60: [2.1804, 2.1201, 2.1052, 2.0559, 2.0291, 1.9665],
  },
  4: {
    18: [6.1440, 6.0868, 6.0726, 6.0253, 6.0017, 5.9406],
    24: [4.7249, 4.6677, 4.6535, 4.6062, 4.5827, 4.5218],
    30: [3.8761, 3.8186, 3.8043, 3.7568, 3.7332, 3.6723],
    36: [3.3124, 3.2544, 3.2400, 3.1923, 3.1686, 3.1074],
    48: [2.6149, 2.5556, 2.5410, 2.4924, 2.4683, 2.4063],
    60: [2.2032, 2.1426, 2.1276, 2.0780, 2.0534, 1.9904],
  },
  5: {
    18: [6.1823, 6.1249, 6.1106, 6.0631, 6.0513, 5.9899],
    24: [4.7632, 4.7058, 4.6915, 4.6440, 4.6322, 4.5710],
    30: [3.9147, 3.8569, 3.8425, 3.7948, 3.7829, 3.7215],
    36: [3.3514, 3.2930, 3.2785, 3.2304, 3.2185, 3.1567],
    48: [2.6548, 2.5950, 2.5802, 2.5312, 2.5190, 2.4563],
    60: [2.2442, 2.1829, 2.1677, 2.1176, 2.1052, 2.0412],
  },
};

/** Finanziamento finalizzato: il bene e' subito del cliente, nessun riscatto.
 *  Non dipende dalla classe di rischio (verificato: le cinque classi coincidono),
 *  ma la struttura resta uniforme agli altri due prodotti. */
export const BCC_FF: GrigliaBcc = {
  1: {
    18: [6.1372, 6.1136, 6.0901, 6.0901, 5.8783, 5.8783],
    24: [4.7043, 4.6807, 4.6571, 4.6571, 4.4462, 4.4462],
    30: [3.8470, 3.8232, 3.7996, 3.7996, 3.5884, 3.5884],
    36: [3.2775, 3.2536, 3.2297, 3.2297, 3.0177, 3.0177],
    48: [2.5724, 2.5479, 2.5236, 2.5236, 2.3089, 2.3089],
    60: [2.1559, 2.1308, 2.1059, 2.1059, 1.8877, 1.8877],
  },
  2: {
    18: [6.1372, 6.1136, 6.0901, 6.0901, 5.8783, 5.8783],
    24: [4.7043, 4.6807, 4.6571, 4.6571, 4.4462, 4.4462],
    30: [3.8470, 3.8232, 3.7996, 3.7996, 3.5884, 3.5884],
    36: [3.2775, 3.2536, 3.2297, 3.2297, 3.0177, 3.0177],
    48: [2.5724, 2.5479, 2.5236, 2.5236, 2.3089, 2.3089],
    60: [2.1559, 2.1308, 2.1059, 2.1059, 1.8877, 1.8877],
  },
  3: {
    18: [6.1372, 6.1136, 6.0901, 6.0901, 5.8783, 5.8783],
    24: [4.7043, 4.6807, 4.6571, 4.6571, 4.4462, 4.4462],
    30: [3.8470, 3.8232, 3.7996, 3.7996, 3.5884, 3.5884],
    36: [3.2775, 3.2536, 3.2297, 3.2297, 3.0177, 3.0177],
    48: [2.5724, 2.5479, 2.5236, 2.5236, 2.3089, 2.3089],
    60: [2.1559, 2.1308, 2.1059, 2.1059, 1.8877, 1.8877],
  },
  4: {
    18: [6.1372, 6.1136, 6.0901, 6.0901, 5.8783, 5.8783],
    24: [4.7043, 4.6807, 4.6571, 4.6571, 4.4462, 4.4462],
    30: [3.8470, 3.8232, 3.7996, 3.7996, 3.5884, 3.5884],
    36: [3.2775, 3.2536, 3.2297, 3.2297, 3.0177, 3.0177],
    48: [2.5724, 2.5479, 2.5236, 2.5236, 2.3089, 2.3089],
    60: [2.1559, 2.1308, 2.1059, 2.1059, 1.8877, 1.8877],
  },
  5: {
    18: [6.1372, 6.1136, 6.0901, 6.0901, 5.8783, 5.8783],
    24: [4.7043, 4.6807, 4.6571, 4.6571, 4.4462, 4.4462],
    30: [3.8470, 3.8232, 3.7996, 3.7996, 3.5884, 3.5884],
    36: [3.2775, 3.2536, 3.2297, 3.2297, 3.0177, 3.0177],
    48: [2.5724, 2.5479, 2.5236, 2.5236, 2.3089, 2.3089],
    60: [2.1559, 2.1308, 2.1059, 2.1059, 1.8877, 1.8877],
  },
};

export const BCC_GRIGLIE: Record<ProdottoBcc, GrigliaBcc> = { lo: BCC_LO, lf: BCC_LF, ff: BCC_FF };

/**
 * L'assicurazione all risk sul bene e' GIA' DENTRO il canone BCC: nel planner
 * (foglio Servizi) e' una quota mensile sull'imponibile, 0,05% sulla locazione
 * operativa e 0,03468% sulla finanziaria. Verificato: la differenza tra canone
 * "con servizi" e canone finanziario netto del planner (1.540,06 contro 1.502,56
 * su 75.000 a 60 mesi) e' esattamente lo 0,05% mensile.
 * E' il vantaggio da giocarsi contro Grenke, dove l'assicurazione e' esclusa dai
 * coefficienti e si aggiunge a parte.
 */
export const BCC_ASSICURAZIONE_MENSILE = { lo: 0.0005, lf: 0.0003468, ff: 0 };

/** Quota di assicurazione compresa nella rata, in euro al mese */
export function bccQuotaAssicurazione(prodotto: ProdottoBcc, importo: number): number {
  return importo * (BCC_ASSICURAZIONE_MENSILE[prodotto] ?? 0);
}

export const BCC_MIN = 3000;
export const BCC_MAX = 200000;
export const BCC_VR_PERC = 0.01; // riscatto su locazione operativa e finanziaria

// Classe di rischio per comparto merceologico (foglio Input del planner).
// Un centralino telefonico e' classe 3.
export const BCC_CLASSI_BENE: { comparto: string; classe: ClasseRischioBcc; durataMax: number }[] = [
  { comparto: 'Information technology (PC, server, monitor, copy)', classe: 2, durataMax: 60 },
  { comparto: 'Telecomunicazioni', classe: 3, durataMax: 60 },
  { comparto: 'Attrezzature commercio, vending, digital signage', classe: 3, durataMax: 60 },
  { comparto: 'Medicale, dentale, ottica, analisi', classe: 1, durataMax: 72 },
  { comparto: 'Estetica medica', classe: 3, durataMax: 60 },
  { comparto: 'Sollevatori telescopici e gru', classe: 4, durataMax: 60 },
  { comparto: 'Movimento terra, carrelli elevatori, vari edili', classe: 5, durataMax: 60 },
];

/**
 * Campagna BCC "tasso zero" (file `# BCCRL_NEWCAMPAIGN'260430.xlsx`, in vigore dal
 * 01/04/2026). Finanziamento finalizzato con TAN azzerato per il cliente: la rata
 * e' semplicemente importo / numero di rate. Il costo lo sostiene il FORNITORE, che
 * riconosce a BCC un contributo sull'imponibile piu' le spese di istruttoria.
 *
 * Il planner della campagna e' impostato su 10 mesi: e' l'unica durata coperta.
 * Per altre durate il contributo cambia e BCC non lo ha ancora comunicato.
 * Verificato col planner: il contributo resta il 5,30% su qualsiasi importo.
 */
export const BCC_TASSO_ZERO = {
  attiva: true,
  durata: 10,
  contributoFornitore: 0.053,   // 5,30% dell'imponibile: e' l'unico costo del fornitore
  speseIstruttoria: 75,         // una tantum, a carico del CLIENTE
  bollo: 16,                    // imposta di registro, durata sotto i 18 mesi
  speseIncassoRata: 4,          // RID, per ogni rata, a carico del cliente
  inVigoreDal: '2026-04-01',
};

/** Rata del tasso zero: nessun interesse, l'importo diviso per il numero di rate */
export function bccTassoZeroRata(importo: number): number {
  return importo / BCC_TASSO_ZERO.durata;
}

/**
 * Il conto per il fornitore: l'unico costo e' il contributo che azzera il tasso
 * al cliente. BCC lo trattiene sul bonifico dell'imponibile.
 */
export function bccTassoZeroContoFornitore(importo: number) {
  const contributo = importo * BCC_TASSO_ZERO.contributoFornitore;
  return {
    imponibile: importo,
    contributo,
    totaleCosto: contributo,
    nettoIncassato: importo - contributo,
  };
}

/**
 * Il conto per il cliente: rate senza interessi, piu' gli oneri a suo carico
 * (istruttoria, bollo e spese di incasso RID su ogni rata).
 */
export function bccTassoZeroContoCliente(importo: number) {
  const rata = importo / BCC_TASSO_ZERO.durata;
  const incassoTotale = BCC_TASSO_ZERO.speseIncassoRata * BCC_TASSO_ZERO.durata;
  const unaTantum = BCC_TASSO_ZERO.speseIstruttoria + BCC_TASSO_ZERO.bollo;
  return {
    rata,
    rataConIncasso: rata + BCC_TASSO_ZERO.speseIncassoRata,
    istruttoria: BCC_TASSO_ZERO.speseIstruttoria,
    bollo: BCC_TASSO_ZERO.bollo,
    incassoPerRata: BCC_TASSO_ZERO.speseIncassoRata,
    unaTantum,
    totalePagato: importo + incassoTotale + unaTantum,
  };
}

/** Spese di istruttoria una tantum a carico cliente, per fascia (listino planner) */
export function bccSpeseIstruttoria(importo: number): number {
  if (importo <= 5000) return 75;
  if (importo <= 25000) return 100;
  if (importo <= 50000) return 150;
  if (importo <= 100000) return 200;
  if (importo <= 200000) return 300;
  return 500;
}

/** Imposta sostitutiva sul finanziamento finalizzato: 2,5 per mille oltre i 18
 *  mesi, imposta di registro fissa 16 EUR sotto i 18 mesi (foglio informativo). */
export function bccImpostaFinanziamento(importo: number, durata: number): number {
  return durata > 18 ? importo * 0.0025 : 16;
}

function indiceFascia(importo: number): number {
  const i = BCC_FASCE.findIndex((f) => importo >= f.da && importo <= f.a);
  return i >= 0 ? i : BCC_FASCE.length - 1;
}

/** Coefficiente BCC (percentuale mensile sull'imponibile) */
export function getBccCoeff(
  prodotto: ProdottoBcc, importo: number, durata: number, classe: ClasseRischioBcc,
): number | null {
  const perDurata = BCC_GRIGLIE[prodotto]?.[classe]?.[durata];
  if (!perDurata) return null;
  return perDurata[indiceFascia(importo)] ?? null;
}

/** Rata mensile: e' quanto paga il cliente ogni mese, imponibile IVA */
export function bccRata(
  prodotto: ProdottoBcc, importo: number, durata: number, classe: ClasseRischioBcc,
): number | null {
  const c = getBccCoeff(prodotto, importo, durata, classe);
  return c === null ? null : (importo * c) / 100;
}

/**
 * Inverso: dalla rata all'imponibile. La fascia dipende dall'imponibile che
 * risulta, quindi si prova ogni fascia e si tiene quella in cui il prezzo ricade.
 */
export function bccPrezzoDaRata(
  prodotto: ProdottoBcc, rata: number, durata: number, classe: ClasseRischioBcc,
): number | null {
  const perDurata = BCC_GRIGLIE[prodotto]?.[classe]?.[durata];
  if (!perDurata || rata <= 0) return null;
  for (let i = 0; i < BCC_FASCE.length; i++) {
    const c = perDurata[i];
    if (!c) continue;
    const prezzo = (rata / c) * 100;
    if (prezzo >= BCC_FASCE[i].da && prezzo <= BCC_FASCE[i].a) return prezzo;
  }
  return null;
}
