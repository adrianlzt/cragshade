import json
import os
import re
import shutil
import time
import tempfile
import uuid
from datetime import UTC, datetime
from typing import Annotated, Literal

from fastapi import FastAPI, File, Form, HTTPException, Query, Request, UploadFile
from fastapi.staticfiles import StaticFiles
from pathlib import Path
from PIL import UnidentifiedImageError

from . import db
from .images import make_derivatives
from .storage import LocalStorage, from_env

app = FastAPI(title="CragShade")
storage = from_env()
if isinstance(storage, LocalStorage):
    app.mount("/media", StaticFiles(directory=storage.root), name="media")

MAX_UPLOAD_BYTES = 40 * 1024 * 1024
# El borrado no tiene autenticación: solo para desarrollo.
ALLOW_DELETE = os.environ.get("CRAGSHADE_ALLOW_DELETE") == "1"
# El original (5–15 MB) no lo usa la app; solo sirve para regenerar la versión web en el futuro.
KEEP_ORIGINAL = os.environ.get("CRAGSHADE_KEEP_ORIGINAL") == "1"
# Tope de espacio de las fotos, por debajo de los 10 GB gratis de R2 (deja sitio a las copias de Litestream).
QUOTA_BYTES = int(os.environ.get("CRAGSHADE_QUOTA_BYTES", 8 * 1024**3))


# Subida por trozos: Traefik corta con 502 las peticiones que tardan más de 60 s (readTimeout por defecto),
# y 8 MB por una red móvil lenta no caben. Cada trozo es una petición corta y se puede reintentar.
CHUNK_MAX_BYTES = 4 * 1024 * 1024
UPLOAD_TTL_SECONDS = 24 * 3600


def uploads_dir() -> Path:
    d = db.DATA_DIR / "uploads"
    d.mkdir(parents=True, exist_ok=True)
    return d


def used_bytes() -> int:
    with db.connect() as conn:
        return conn.execute("SELECT COALESCE(SUM(size_bytes), 0) FROM photos").fetchone()[0]
FRONTEND_DIST = Path(__file__).resolve().parent.parent.parent / "frontend" / "dist"

LIST_FIELDS = "id, alias, wall_name, lat, lon, heading_true, orientation_method, thumb_file, captured_at"


def to_dict(row) -> dict:
    d = dict(row)
    if d.get("pano_data"):
        d["pano_data"] = json.loads(d["pano_data"])
    for key, url_key in (("file", "file_url"), ("web_file", "web_url"), ("thumb_file", "thumb_url")):
        if key in d:
            k = d.pop(key)
            d[url_key] = storage.url(k) if k else None
    return d


@app.get("/api/health")
def health():
    return {"ok": True, "used_bytes": used_bytes(), "quota_bytes": QUOTA_BYTES}


@app.get("/api/photos")
def list_photos(bbox: Annotated[str | None, Query(description="minLon,minLat,maxLon,maxLat")] = None):
    sql, params = f"SELECT {LIST_FIELDS} FROM photos", []
    if bbox:
        try:
            min_lon, min_lat, max_lon, max_lat = (float(v) for v in bbox.split(","))
        except ValueError:
            raise HTTPException(422, "bbox debe ser minLon,minLat,maxLon,maxLat")
        sql += " WHERE lat BETWEEN ? AND ? AND lon BETWEEN ? AND ?"
        params = [min_lat, max_lat, min_lon, max_lon]
    with db.connect() as conn:
        return [to_dict(r) for r in conn.execute(sql + " ORDER BY created_at DESC LIMIT 2000", params)]


@app.get("/api/photos/{photo_id}")
def get_photo(photo_id: str):
    with db.connect() as conn:
        row = conn.execute("SELECT * FROM photos WHERE id = ?", [photo_id]).fetchone()
    if not row:
        raise HTTPException(404, "Foto no encontrada")
    return to_dict(row)


def upload_path(upload_id: str) -> Path:
    if not re.fullmatch(r"[0-9a-f]{32}", upload_id):
        raise HTTPException(404, "Subida no encontrada")
    return uploads_dir() / f"{upload_id}.part"


@app.post("/api/uploads", status_code=201)
def start_upload():
    now = time.time()
    for old in uploads_dir().glob("*.part"):
        if now - old.stat().st_mtime > UPLOAD_TTL_SECONDS:
            old.unlink(missing_ok=True)
    upload_id = uuid.uuid4().hex
    upload_path(upload_id).touch()
    return {"upload_id": upload_id, "chunk_bytes": CHUNK_MAX_BYTES}


@app.put("/api/uploads/{upload_id}")
async def upload_chunk(upload_id: str, request: Request, offset: Annotated[int, Query(ge=0)]):
    """Añade un trozo en `offset`. Reintentar el mismo trozo es seguro: se trunca al offset antes de escribir."""
    path = upload_path(upload_id)
    if not path.exists():
        raise HTTPException(404, "Subida no encontrada")
    size = path.stat().st_size
    if offset > size:
        raise HTTPException(409, f"Falta un trozo: el servidor tiene {size} bytes")
    written = offset
    with path.open("r+b") as f:
        f.truncate(offset)
        f.seek(offset)
        async for chunk in request.stream():
            written += len(chunk)
            if written - offset > CHUNK_MAX_BYTES or written > MAX_UPLOAD_BYTES:
                f.truncate(offset)
                raise HTTPException(413, "Trozo demasiado grande")
            f.write(chunk)
    return {"size": written}


@app.post("/api/photos", status_code=201)
def create_photo(
    alias: Annotated[str, Form(min_length=1, max_length=40)],
    wall_name: Annotated[str, Form(min_length=1, max_length=80)],
    lat: Annotated[float, Form(ge=-90, le=90)],
    lon: Annotated[float, Form(ge=-180, le=180)],
    heading_true: Annotated[float, Form()],
    orientation_method: Annotated[Literal["sun", "compass", "exif", "manual"], Form()],
    alt: Annotated[float | None, Form()] = None,
    captured_at: Annotated[str | None, Form()] = None,
    tz: Annotated[str | None, Form()] = None,
    orientation_residual_deg: Annotated[float | None, Form()] = None,
    compass_accuracy_deg: Annotated[float | None, Form()] = None,
    pano_data: Annotated[str | None, Form()] = None,
    image: Annotated[UploadFile | None, File()] = None,
    upload_id: Annotated[str | None, Form()] = None,
):
    if image is None and not upload_id:
        raise HTTPException(422, "Falta la imagen (image o upload_id)")
    if pano_data:
        try:
            json.loads(pano_data)
        except ValueError:
            raise HTTPException(422, "pano_data no es JSON válido")

    if used_bytes() >= QUOTA_BYTES:
        raise HTTPException(507, "Se ha llenado el espacio de fotos; no se admiten más subidas por ahora")

    photo_id = uuid.uuid4().hex
    keys = {
        "file": f"{photo_id}/original.jpg" if KEEP_ORIGINAL else "",
        "web_file": f"{photo_id}/web.jpg",
        "thumb_file": f"{photo_id}/thumb.jpg",
    }
    with tempfile.TemporaryDirectory(prefix="cragshade-") as tmp:
        orig, web, thumb = Path(tmp, "original.jpg"), Path(tmp, "web.jpg"), Path(tmp, "thumb.jpg")
        if upload_id:
            part = upload_path(upload_id)
            if not part.exists():
                raise HTTPException(404, "Subida no encontrada")
            shutil.move(part, orig)
        else:
            size = 0
            with orig.open("wb") as f:
                while chunk := image.file.read(1024 * 1024):
                    size += len(chunk)
                    if size > MAX_UPLOAD_BYTES:
                        raise HTTPException(413, f"La foto supera {MAX_UPLOAD_BYTES // 1024 // 1024} MB")
                    f.write(chunk)
        try:
            width, height = make_derivatives(orig, web, thumb)
        except (UnidentifiedImageError, OSError):
            raise HTTPException(422, "El fichero no es una imagen válida")
        if not pano_data and abs(width / height - 2) > 0.05:
            raise HTTPException(422, "La imagen no parece una panorámica equirectangular (2:1)")
        stored = web.stat().st_size + thumb.stat().st_size + (orig.stat().st_size if KEEP_ORIGINAL else 0)
        storage.put(keys["web_file"], web, "image/jpeg")
        storage.put(keys["thumb_file"], thumb, "image/jpeg")
        if KEEP_ORIGINAL:
            storage.put(keys["file"], orig, "image/jpeg")

    row = {
        "id": photo_id,
        "alias": alias.strip(),
        "wall_name": wall_name.strip(),
        "lat": lat,
        "lon": lon,
        "alt": alt,
        "captured_at": captured_at,
        "tz": tz,
        "heading_true": heading_true % 360,
        "orientation_method": orientation_method,
        "orientation_residual_deg": orientation_residual_deg,
        "compass_accuracy_deg": compass_accuracy_deg,
        "pano_data": pano_data,
        **keys,
        "size_bytes": stored,
        "created_at": datetime.now(UTC).isoformat(),
    }
    with db.connect() as conn:
        conn.execute(
            f"INSERT INTO photos ({', '.join(row)}) VALUES ({', '.join('?' * len(row))})",
            list(row.values()),
        )
    return get_photo(photo_id)


@app.delete("/api/photos/{photo_id}", status_code=204)
def delete_photo(photo_id: str):
    if not ALLOW_DELETE:
        raise HTTPException(403, "Borrado desactivado")
    with db.connect() as conn:
        cur = conn.execute("DELETE FROM photos WHERE id = ?", [photo_id])
    if not cur.rowcount:
        raise HTTPException(404, "Foto no encontrada")
    storage.delete_prefix(f"{photo_id}/")


# Frontend compilado (make build). Va al final para no tapar /api ni /media.
if FRONTEND_DIST.is_dir():
    app.mount("/", StaticFiles(directory=FRONTEND_DIST, html=True), name="frontend")
