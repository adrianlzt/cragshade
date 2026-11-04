import os
import sqlite3
from pathlib import Path

DATA_DIR = Path(os.environ.get("CRAGSHADE_DATA", Path(__file__).resolve().parent.parent / "data"))

SCHEMA = """
CREATE TABLE IF NOT EXISTS photos (
    id TEXT PRIMARY KEY,
    alias TEXT NOT NULL,
    wall_name TEXT NOT NULL,
    lat REAL NOT NULL,
    lon REAL NOT NULL,
    alt REAL,
    captured_at TEXT,
    tz TEXT,
    heading_true REAL NOT NULL,
    orientation_method TEXT NOT NULL,
    orientation_residual_deg REAL,
    compass_accuracy_deg REAL,
    pano_data TEXT,
    size_bytes INTEGER NOT NULL DEFAULT 0,
    file TEXT NOT NULL,
    web_file TEXT NOT NULL,
    thumb_file TEXT NOT NULL,
    created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS photos_latlon ON photos (lat, lon);
"""


def media_dir() -> Path:
    d = DATA_DIR / "media"
    d.mkdir(parents=True, exist_ok=True)
    return d


def connect() -> sqlite3.Connection:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DATA_DIR / "cragshade.db")
    conn.row_factory = sqlite3.Row
    # WAL: lo necesita Litestream (copia continua al bucket) y no bloquea lecturas al escribir.
    conn.execute("PRAGMA journal_mode=WAL")
    conn.execute("PRAGMA busy_timeout=5000")
    conn.executescript(SCHEMA)
    cols = {r[1] for r in conn.execute("PRAGMA table_info(photos)")}
    if "size_bytes" not in cols:
        conn.execute("ALTER TABLE photos ADD COLUMN size_bytes INTEGER NOT NULL DEFAULT 0")
    return conn
