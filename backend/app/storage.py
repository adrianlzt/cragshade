"""Dónde se guardan las fotos: disco local (desarrollo) o un bucket S3 (producción, Cloudflare R2).

Variables de entorno para S3:
  CRAGSHADE_S3_BUCKET      nombre del bucket (si está, se usa S3)
  CRAGSHADE_S3_ENDPOINT    p. ej. https://<account_id>.r2.cloudflarestorage.com
  CRAGSHADE_MEDIA_URL      URL pública del bucket, p. ej. https://cragshade-media.adrianlzt.com
  AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
"""

import os
import shutil
from pathlib import Path
from typing import Protocol

from . import db

# Las claves llevan el id de la foto, así que el contenido de una URL no cambia nunca.
CACHE_CONTROL = "public, max-age=31536000, immutable"


class Storage(Protocol):
    def put(self, key: str, src: Path, content_type: str) -> None: ...
    def delete_prefix(self, prefix: str) -> None: ...
    def url(self, key: str) -> str: ...


class LocalStorage:
    """Ficheros en DATA_DIR/media, servidos por la propia app en /media."""

    def __init__(self, root: Path):
        self.root = root

    def put(self, key: str, src: Path, content_type: str) -> None:
        dest = self.root / key
        dest.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(src, dest)

    def delete_prefix(self, prefix: str) -> None:
        shutil.rmtree(self.root / prefix, ignore_errors=True)

    def url(self, key: str) -> str:
        return f"/media/{key}"


class S3Storage:
    def __init__(self, bucket: str, endpoint: str | None, public_url: str, prefix: str = "media/"):
        import boto3

        self.bucket = bucket
        self.prefix = prefix
        self.public_url = public_url.rstrip("/")
        self.client = boto3.client("s3", endpoint_url=endpoint, region_name="auto")

    def put(self, key: str, src: Path, content_type: str) -> None:
        self.client.upload_file(
            str(src),
            self.bucket,
            self.prefix + key,
            ExtraArgs={"ContentType": content_type, "CacheControl": CACHE_CONTROL},
        )

    def delete_prefix(self, prefix: str) -> None:
        pages = self.client.get_paginator("list_objects_v2").paginate(Bucket=self.bucket, Prefix=self.prefix + prefix)
        keys = [{"Key": o["Key"]} for page in pages for o in page.get("Contents", [])]
        if keys:
            self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": keys})

    def url(self, key: str) -> str:
        return f"{self.public_url}/{self.prefix}{key}"


def from_env() -> Storage:
    bucket = os.environ.get("CRAGSHADE_S3_BUCKET")
    if not bucket:
        return LocalStorage(db.media_dir())
    public_url = os.environ.get("CRAGSHADE_MEDIA_URL")
    if not public_url:
        raise RuntimeError("Con CRAGSHADE_S3_BUCKET hace falta CRAGSHADE_MEDIA_URL")
    return S3Storage(bucket, os.environ.get("CRAGSHADE_S3_ENDPOINT"), public_url)
