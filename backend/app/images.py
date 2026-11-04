from pathlib import Path

from PIL import Image, ImageOps

# Muchos móviles no admiten texturas WebGL de más de 4096 px.
WEB_WIDTH = 4096
THUMB_WIDTH = 480

Image.MAX_IMAGE_PIXELS = 400_000_000


def make_derivatives(src: Path, web: Path, thumb: Path) -> tuple[int, int]:
    """Genera la versión web y la miniatura. Devuelve (ancho, alto) del original."""
    with Image.open(src) as img:
        img = ImageOps.exif_transpose(img).convert("RGB")
        size = img.size
        w = img.copy()
        if w.width > WEB_WIDTH:
            w = w.resize((WEB_WIDTH, round(w.height * WEB_WIDTH / w.width)), Image.LANCZOS)
        w.save(web, "JPEG", quality=85, optimize=True)
        # La miniatura es la franja central, que suele ser donde está la pared.
        t = img.crop((img.width // 4, img.height // 4, img.width * 3 // 4, img.height * 3 // 4))
        t.thumbnail((THUMB_WIDTH, THUMB_WIDTH), Image.LANCZOS)
        t.save(thumb, "JPEG", quality=80)
    return size
