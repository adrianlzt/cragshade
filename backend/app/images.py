from pathlib import Path

from PIL import Image, ImageOps

# Muchos móviles no admiten texturas WebGL de más de 4096 px.
WEB_WIDTH = 4096
THUMB_WIDTH = 480

Image.MAX_IMAGE_PIXELS = 400_000_000


def make_derivatives(src: Path, web: Path, thumb: Path) -> tuple[int, int]:
    """Genera la versión web y la miniatura. Devuelve (ancho, alto) del original.

    Una panorámica descomprimida pesa cientos de MB, así que nunca hay más de una copia completa en memoria:
    sin `copy()`, `convert` solo si hace falta y la miniatura (un recorte) antes de redimensionar.
    """
    with Image.open(src) as img:
        ImageOps.exif_transpose(img, in_place=True)
        if img.mode != "RGB":
            img = img.convert("RGB")
        size = img.size
        # La miniatura es la franja central, que suele ser donde está la pared.
        t = img.crop((img.width // 4, img.height // 4, img.width * 3 // 4, img.height * 3 // 4))
        t.thumbnail((THUMB_WIDTH, THUMB_WIDTH), Image.LANCZOS)
        t.save(thumb, "JPEG", quality=80)
        del t
        w = img
        if w.width > WEB_WIDTH:
            w = w.resize((WEB_WIDTH, round(w.height * WEB_WIDTH / w.width)), Image.LANCZOS)
        w.save(web, "JPEG", quality=85, optimize=True)
    return size
