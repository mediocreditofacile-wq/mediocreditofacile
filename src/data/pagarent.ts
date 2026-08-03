// Coefficienti PagaRent — noleggio operativo, prodotto "Generale",
// cliente Azienda, addebito Mensile.
//
// PROVENIENZA: rilevati il 03/08/2026 dal calcolatore rapido ufficiale
// (dashboard.pagarent.com/dashboard/calcolatore/, profilo Ambassador di Alberto)
// interrogandolo importo per importo su tutte e quattro le durate. Il calcolatore
// e' la fonte di verita': PagaRent non pubblica una tabella coefficienti.
//
// COME QUOTA PAGARENT: canone = importo x coefficiente della fascia. Dentro una
// fascia il coefficiente e' costante (verificato: tra 14.000 e 22.000 a 60 mesi il
// rapporto canone/importo resta 2,34572% su sei campioni, con intercetta zero:
// non c'e' nessuna quota fissa spalmata sul canone). Le fasce NON coincidono tra
// le durate: a 48 mesi la terza fascia arriva a 10.000, a 60 mesi a 10.500.
//
// GLI SCAGLIONI QUI SOTTO sono i punti effettivamente misurati. Dove il salto di
// fascia cade tra due campioni si applica il coefficiente del campione inferiore,
// cioe' il piu' alto: il canone mostrato non e' mai piu' basso di quello vero.
// Scarto rispetto al calcolatore: al massimo un centesimo sui campioni misurati.
//
// COSA NON E' NEL CANONE: istruttoria 100 EUR una tantum e assicurazione all risk
// facoltativa (fino al 3,47%). Su questo PagaRent lavora come Grenke e al contrario
// di BCC Rent&Lease, dove l'assicurazione e' gia' dentro la rata.
//
// PER AGGIORNARLI: rifare il giro sul calcolatore quando PagaRent cambia listino.

export const PAGARENT_DURATE = [24, 36, 48, 60] as const;

/** Importi entro cui il calcolatore e' stato verificato */
export const PAGARENT_MIN = 1000;
export const PAGARENT_MAX = 200000;

/** Istruttoria una tantum a carico del cliente, fuori dal canone */
export const PAGARENT_ISTRUTTORIA = 100;

/** Assicurazione all risk facoltativa: percentuale massima applicata sul canone */
export const PAGARENT_ASSICURAZIONE_MAX_PERC = 3.47;

interface FasciaPagarent {
  /** Importo da cui parte la fascia (inclusivo) */
  da: number;
  /** Coefficiente in percentuale: canone = importo x c / 100 */
  c: number;
}

// Fasce per durata, ordinate per importo crescente.
const PAGARENT_FASCE: Record<number, FasciaPagarent[]> = {
  24: [
    { da: 1000, c: 5.385 },
    { da: 2500, c: 5.382 },
    { da: 4500, c: 5.34252 },
    { da: 9000, c: 5.30658 },
    { da: 14000, c: 5.24181 },
    { da: 22000, c: 5.23045 },
    { da: 22100, c: 5.19735 },
    { da: 45000, c: 5.18702 },
    { da: 100000, c: 5.18065 },
  ],
  36: [
    { da: 1000, c: 3.76689 },
    { da: 2500, c: 3.76045 },
    { da: 4500, c: 3.74485 },
    { da: 9000, c: 3.71253 },
    { da: 14000, c: 3.63545 },
    { da: 22100, c: 3.60272 },
    { da: 45000, c: 3.57841 },
    { da: 100000, c: 3.57432 },
  ],
  48: [
    { da: 1000, c: 2.94889 },
    { da: 2500, c: 2.906 },
    { da: 4500, c: 2.86362 },
    { da: 11000, c: 2.85508 },
    { da: 14000, c: 2.81278 },
    { da: 22100, c: 2.75297 },
    { da: 45000, c: 2.73675 },
  ],
  60: [
    { da: 1000, c: 2.489 },
    { da: 2500, c: 2.442 },
    { da: 4500, c: 2.39294 },
    { da: 11000, c: 2.38392 },
    { da: 13500, c: 2.34572 },
    { da: 22100, c: 2.27025 },
    { da: 45000, c: 2.26309 },
  ],
};

/** Coefficiente della fascia che contiene l'importo, null se fuori range */
export function getPagarentCoeff(importo: number, durata: number): number | null {
  const fasce = PAGARENT_FASCE[durata];
  if (!fasce || importo < PAGARENT_MIN || importo > PAGARENT_MAX) return null;
  let scelta: FasciaPagarent | null = null;
  for (const f of fasce) {
    if (importo >= f.da) scelta = f;
    else break;
  }
  return scelta ? scelta.c : null;
}

/** Canone mensile PagaRent, imponibile IVA */
export function pagarentRata(importo: number, durata: number): number | null {
  const c = getPagarentCoeff(importo, durata);
  return c === null ? null : (importo * c) / 100;
}

/** Inverso: dal canone al prezzo di vendita, provando ogni fascia */
export function pagarentPrezzoDaRata(rata: number, durata: number): number | null {
  const fasce = PAGARENT_FASCE[durata];
  if (!fasce || rata <= 0) return null;
  for (let i = 0; i < fasce.length; i++) {
    const prezzo = (rata / fasce[i].c) * 100;
    const a = i + 1 < fasce.length ? fasce[i + 1].da : PAGARENT_MAX;
    if (prezzo >= fasce[i].da && prezzo < a) return prezzo;
  }
  return null;
}
