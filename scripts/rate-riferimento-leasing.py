# Rate di riferimento del leasing a confronto (spec Bergamelli, sezione 5), calcolate a
# parte dal codice del sito: servono ai test di leasing-confronto.test.ts e
# preventivo-mezzi.test.ts, che le confrontano con calcolaRataLeasingPartner.
#
# Stessa formula di src/data/leasing.ts riscritta da zero: rata francese su durata - 1
# rate al tasso spread + Euribor 3M, riscatto 1% attualizzato, anticipo 10%. Sella e
# Credem caricano la provvigione nel capitale, Alba no. Prima di stampare si controlla da
# solo: con l'Euribor 2,66 deve ridare le dodici rate della spec, altrimenti si ferma.
#
#   python3 scripts/rate-riferimento-leasing.py 2.71

import sys
from decimal import Decimal, ROUND_HALF_UP

# partner: spread fino a 48 mesi, spread da 60 mesi, provvigione % caricata nel capitale
PARTNER = {
    'sella': (2.25, 2.25, 1.0),
    'credem': (2.90, 2.90, 1.5),
    'alba': (3.10, 2.50, 0.0),
}
ORDINE = ('sella', 'credem', 'alba')

# Le rate della spec, con l'Euribor 2,66 del 22/09/2026
SPEC_266 = {
    (50000, 36): [1384.64, 1405.82, 1386.66],
    (50000, 60): [862.07, 880.63, 857.72],
    (100000, 36): [2769.29, 2811.64, 2773.32],
    (100000, 60): [1724.14, 1761.26, 1715.43],
}


def al_centesimo(v: float) -> float:
    return float(Decimal(repr(v)).quantize(Decimal('0.01'), rounding=ROUND_HALF_UP))


def rata(partner: str, importo: float, durata: int, euribor: float) -> float:
    fino48, da60, provvigione = PARTNER[partner]
    spread = fino48 if durata <= 48 else da60
    n = durata - 1
    r = (spread + euribor) / 100 / 12
    capitale = importo * 0.9 + importo * provvigione / 100
    riscatto_oggi = importo * 0.01 / (1 + r) ** n
    return al_centesimo((capitale - riscatto_oggi) * r * (1 + r) ** n / ((1 + r) ** n - 1))


def tabella(euribor: float) -> dict:
    return {chiave: [rata(p, chiave[0], chiave[1], euribor) for p in ORDINE] for chiave in SPEC_266}


if tabella(2.66) != SPEC_266:
    sys.exit('la formula non ridà le rate della spec con Euribor 2,66: non fidarti dei numeri')

euribor = float(sys.argv[1]) if len(sys.argv) > 1 else 2.66
print(f'Euribor 3M {euribor}: sella, credem, alba')
for (importo, durata), rate in tabella(euribor).items():
    print(f'  {importo:>6} euro a {durata} mesi: {rate}')
