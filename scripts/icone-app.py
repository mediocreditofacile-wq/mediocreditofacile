"""Icone dell'app di un portale del motore, dal logo del fornitore.

Prende un logo a colore pieno su fondo bianco (anche un JPEG), ne ricava la
sagoma e la posa in bianco su un quadrato del colore del fornitore. Escono le
quattro icone che chiede l'app installabile: 192 e 512 per Android, 512
"maskable" (Android la ritaglia in tondo, quindi il logo sta nel cerchio
centrale) e 180 per l'iPhone.

Uso (serve Pillow, per esempio il .venv di ~/dev/mcf-prospetti-pv):
    python scripts/icone-app.py <logo> <colore #RRGGBB> public/app/<slug>

Poi si accende il portale in APP_PORTALI (src/lib/motore/app-portale.ts).
"""

import sys
from pathlib import Path

from PIL import Image

# Sotto la prima soglia e' rumore del JPEG, sopra la seconda e' logo pieno
SOGLIA_RUMORE = 0.15
SOGLIA_PIENO = 0.85


def sagoma(percorso: Path) -> Image.Image:
    """Canale alfa del logo: quanto ogni pixel si allontana dal bianco"""
    im = Image.open(percorso).convert('RGB')
    # Il canale piu' scuro del logo fa da riferimento: sul blu Duplex e' il rosso
    canali = im.split()
    riferimento = min(canali, key=lambda c: sorted(c.getdata())[len(c.getdata()) // 50])
    fondo_logo = sorted(riferimento.getdata())[len(riferimento.getdata()) // 50]

    def copertura(v: int) -> int:
        t = (255 - v) / max(1, 255 - fondo_logo)
        t = (t - SOGLIA_RUMORE) / (SOGLIA_PIENO - SOGLIA_RUMORE)
        return max(0, min(255, round(t * 255)))

    alfa = riferimento.point(copertura)
    return alfa.crop(alfa.getbbox())


def icona(alfa: Image.Image, colore: str, lato: int, quota: float) -> Image.Image:
    tile = Image.new('RGBA', (lato, lato), colore)
    larghezza = round(lato * quota)
    altezza = round(alfa.height * larghezza / alfa.width)
    logo = Image.new('RGBA', (larghezza, altezza), '#FFFFFF')
    logo.putalpha(alfa.resize((larghezza, altezza), Image.LANCZOS))
    tile.alpha_composite(logo, ((lato - larghezza) // 2, (lato - altezza) // 2))
    return tile.convert('RGB')


def main() -> None:
    logo, colore, uscita = Path(sys.argv[1]), sys.argv[2], Path(sys.argv[3])
    uscita.mkdir(parents=True, exist_ok=True)
    alfa = sagoma(logo)
    icona(alfa, colore, 192, 0.84).save(uscita / 'icona-192.png', optimize=True)
    icona(alfa, colore, 512, 0.84).save(uscita / 'icona-512.png', optimize=True)
    # Android ritaglia la maschera in un cerchio pari all'80% del lato
    icona(alfa, colore, 512, 0.72).save(uscita / 'icona-512-maschera.png', optimize=True)
    icona(alfa, colore, 180, 0.84).save(uscita / 'icona-180.png', optimize=True)
    print(f'icone in {uscita}')


if __name__ == '__main__':
    main()
