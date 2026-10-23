# Rate di riferimento del leasing a confronto (spec Bergamelli, sezione 5, e A-Leasing
# sull'usato dal 23/10/2026), calcolate a parte dal codice del sito: servono ai test di
# leasing-confronto.test.ts e preventivo-mezzi.test.ts, che le confrontano con
# calcolaRataLeasingPartner.
#
# Stessa formula di src/data/leasing.ts riscritta da zero: rata francese su durata - 1
# rate al tasso spread + Euribor 3M, riscatto 1% attualizzato, anticipo 10%. Sella,
# Credem e A-Leasing caricano la provvigione nel capitale, Alba no; A-Leasing paga il
# riscatto un mese dopo e arrotonda il canone all'euro in su. Prima di stampare si
# controlla da solo: con l'Euribor 2,66 deve ridare le dodici rate della spec, e con il
# 2,70 dei preventivi A-Leasing i loro 1.790 e 1.473 euro; altrimenti si ferma.
#
#   python3 scripts/rate-riferimento-leasing.py 2.71

import math
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


def rata_aleasing(importo: float, durata: int, euribor: float) -> float:
    """A-Leasing: Euribor + 4,00 sul capitale piu' la provvigione del 3%, riscatto un mese
    dopo l'ultimo canone, canone arrotondato all'euro in su (preventivi del 23/09/2026)."""
    n = durata - 1
    r = (euribor + 4.0) / 100 / 12
    capitale = importo * 0.9 + importo * 0.03
    riscatto_oggi = importo * 0.01 / (1 + r) ** (n + 1)
    return float(math.ceil(al_centesimo((capitale - riscatto_oggi) * r * (1 + r) ** n / ((1 + r) ** n - 1))))


def tabella(euribor: float) -> dict:
    return {chiave: [rata(p, chiave[0], chiave[1], euribor) for p in ORDINE] for chiave in SPEC_266}


if tabella(2.66) != SPEC_266:
    sys.exit('la formula non ridà le rate della spec con Euribor 2,66: non fidarti dei numeri')
# A-Leasing: con il tasso di riferimento dei suoi preventivi (2,70) deve ridare 1.790 e 1.473
if [rata_aleasing(80000, 48, 2.70), rata_aleasing(80000, 60, 2.70)] != [1790.0, 1473.0]:
    sys.exit('la formula A-Leasing non ridà i preventivi del 23/09/2026: non fidarti dei numeri')

euribor = float(sys.argv[1]) if len(sys.argv) > 1 else 2.66
print(f'Euribor 3M {euribor}: sella, credem, alba')
for (importo, durata), rate in tabella(euribor).items():
    print(f'  {importo:>6} euro a {durata} mesi: {rate}')
print('A-Leasing (solo 48 e 60 mesi):')
for importo in (50000, 80000):
    print(f'  {importo:>6} euro: 48 mesi {rata_aleasing(importo, 48, euribor)}, 60 mesi {rata_aleasing(importo, 60, euribor)}')
