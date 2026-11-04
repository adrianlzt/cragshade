"""Panorámica equirectangular sintética para probar CragShade.

Pinta cielo, suelo, una "pared" al sur, un poste rojo exactamente al norte y el sol en su posición
real para la hora y el lugar de la foto, con la imagen girada `HEADING` grados (el centro de la
foto mira a HEADING). Incluye EXIF con GPS y fecha, como una foto de móvil.

Con el método del sol, la app debería deducir heading ≈ HEADING y dibujar la N sobre el poste rojo.
"""

import datetime as dt
import math
import sys
from pathlib import Path

from astral import Observer
from astral.sun import azimuth, elevation
from PIL import Image, ImageDraw

LAT, LON = 40.4168, -3.7038  # Madrid
LOCAL = dt.datetime(2026, 6, 21, 10, 0, 0)  # hora local (CEST, UTC+2)
OFFSET = "+02:00"
HEADING = 200.0
W, H = 4096, 2048


def to_px(az: float, alt: float) -> tuple[float, float]:
    yaw = (az - HEADING + 180) % 360 - 180
    return (yaw / 360 + 0.5) * W, (0.5 - alt / 180) * H


def main(out: Path):
    utc = (LOCAL - dt.timedelta(hours=2)).replace(tzinfo=dt.UTC)
    obs = Observer(LAT, LON)
    sun_az, sun_alt = azimuth(obs, utc), elevation(obs, utc)

    img = Image.new("RGB", (W, H))
    d = ImageDraw.Draw(img)
    for y in range(H // 2):
        t = y / (H / 2)
        d.line([(0, y), (W, y)], fill=(int(70 + 110 * t), int(130 + 80 * t), int(210 + 35 * t)))
    d.rectangle([0, H // 2, W, H], fill=(120, 100, 70))

    # Pared al sur (azimut 150–210), de 0 a 35° de altura.
    x0, _ = to_px(150, 0)
    x1, _ = to_px(210, 0)
    _, ytop = to_px(180, 35)
    d.rectangle([x0, ytop, x1, H // 2], fill=(150, 140, 125))

    # Poste rojo al norte.
    xn, yn = to_px(0, 15)
    d.rectangle([xn - 8, yn, xn + 8, H // 2], fill=(200, 30, 30))

    sx, sy = to_px(sun_az, sun_alt)
    r = 28
    d.ellipse([sx - 3 * r, sy - 3 * r, sx + 3 * r, sy + 3 * r], fill=(255, 245, 200))
    d.ellipse([sx - r, sy - r, sx + r, sy + r], fill=(255, 255, 240))

    exif = Image.Exif()
    exif[0x0110] = "CragShade sample"
    ifd = exif.get_ifd(0x8769)
    ifd[0x9003] = LOCAL.strftime("%Y:%m:%d %H:%M:%S")  # DateTimeOriginal
    ifd[0x9011] = OFFSET  # OffsetTimeOriginal

    def dms(v: float):
        v = abs(v)
        deg, rem = int(v), (abs(v) - int(v)) * 60
        return (deg, int(rem), round((rem - int(rem)) * 60, 4))

    gps = exif.get_ifd(0x8825)
    gps[1], gps[2] = ("N" if LAT >= 0 else "S"), dms(LAT)
    gps[3], gps[4] = ("E" if LON >= 0 else "W"), dms(LON)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "JPEG", quality=88, exif=exif)
    print(f"{out}: sol az={sun_az:.2f} alt={sun_alt:.2f}, heading real={HEADING}")


if __name__ == "__main__":
    main(Path(sys.argv[1] if len(sys.argv) > 1 else "sample.jpg"))
