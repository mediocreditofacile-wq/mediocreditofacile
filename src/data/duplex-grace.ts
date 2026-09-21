// Coefficienti Grenke tabella GRACE PERIOD ++++ (Rete Rent), usati dal portale Duplex.
// A differenza della tabella tradizionale del portale (un coefficiente per durata, canone
// unico nazionale Duplex), qui si tengono le fasce di importo di Grenke: con accessori o
// con la Escalator il coefficiente cambia fascia.
// c = coefficiente mensile in percentuale sull'imponibile (canone = importo x c / 100).
// Fonte: portale ReteRent, simulatore sul fornitore Duplex International S.r.l., tabella
// "GRACE PERIOD" (codice GP4), letta il 21/09/2026 interrogando ogni fascia. Coefficiente
// costante dentro la fascia, salti esattamente sugli scaglioni Grenke. Importi ammessi da
// 500 a 500.000 euro; la tabella quota solo 24, 36, 48 e 60 mesi.
// Attenzione: a 48 e 60 mesi la Grace e' leggermente SOTTO la Sputnik (tabella SPT dello
// stesso fornitore), non sopra. Non dare per scontato che costi di piu'.

export interface FasciaGrace {
  da: number;
  a: number;
  c: number;
}

export const GRACE_FASCE: Record<number, FasciaGrace[]> = {
  24: [
    { da: 500, a: 2500, c: 5.081 },
    { da: 2501, a: 5000, c: 5.078 },
    { da: 5001, a: 12000, c: 5.032 },
    { da: 12001, a: 25000, c: 5.024 },
    { da: 25001, a: 50000, c: 4.945 },
    { da: 50001, a: 500000, c: 4.882 },
  ],
  36: [
    { da: 500, a: 2500, c: 3.652 },
    { da: 2501, a: 5000, c: 3.557 },
    { da: 5001, a: 12000, c: 3.487 },
    { da: 12001, a: 25000, c: 3.462 },
    { da: 25001, a: 50000, c: 3.424 },
    { da: 50001, a: 500000, c: 3.419 },
  ],
  48: [
    { da: 500, a: 2500, c: 3.063 },
    { da: 2501, a: 5000, c: 2.73 },
    { da: 5001, a: 12000, c: 2.7 },
    { da: 12001, a: 25000, c: 2.666 },
    { da: 25001, a: 50000, c: 2.664 },
    { da: 50001, a: 500000, c: 2.662 },
  ],
  60: [
    { da: 500, a: 2500, c: 2.649 },
    { da: 2501, a: 5000, c: 2.287 },
    { da: 5001, a: 12000, c: 2.249 },
    { da: 12001, a: 25000, c: 2.217 },
    { da: 25001, a: 50000, c: 2.182 },
    { da: 50001, a: 500000, c: 2.119 },
  ],
};

/** Coefficiente Grace (percentuale) per importo e durata, null se fuori tabella. */
export function coefficienteGrace(importo: number, durata: number): number | null {
  const fasce = GRACE_FASCE[durata];
  if (!fasce?.length) return null;
  const fascia = fasce.find((f) => importo >= f.da && importo < f.a + 1);
  return fascia ? fascia.c : null;
}

export const graceDisponibile = Object.keys(GRACE_FASCE).length > 0;
