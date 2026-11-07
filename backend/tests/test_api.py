import io
import json

import pytest
from fastapi.testclient import TestClient
from PIL import Image


@pytest.fixture
def client():
    from app import db
    from app.main import app

    with db.connect() as conn:
        conn.execute("DELETE FROM photos")
    return TestClient(app)


def jpeg(w, h) -> bytes:
    buf = io.BytesIO()
    Image.new("RGB", (w, h), (120, 160, 220)).save(buf, "JPEG")
    return buf.getvalue()


def upload(client, img: bytes, **extra):
    data = {
        "alias": "ana",
        "wall_name": "Sector Placa",
        "lat": "40.5",
        "lon": "-3.9",
        "heading_true": "370",
        "orientation_method": "sun",
        **extra,
    }
    return client.post("/api/photos", data=data, files={"image": ("p.jpg", img, "image/jpeg")})


def test_upload_get_list_delete(client):
    r = upload(client, jpeg(6000, 3000), captured_at="2026-06-21T10:00:00Z")
    assert r.status_code == 201, r.text
    photo = r.json()
    assert photo["heading_true"] == 10
    assert photo["web_url"].endswith("/web.jpg")
    assert photo["file_url"] is None  # sin CRAGSHADE_KEEP_ORIGINAL

    web = client.get(photo["web_url"])
    assert web.status_code == 200
    assert Image.open(io.BytesIO(web.content)).size == (4096, 2048)

    assert client.get(f"/api/photos/{photo['id']}").json()["wall_name"] == "Sector Placa"
    assert len(client.get("/api/photos", params={"bbox": "-4,40,-3,41"}).json()) == 1
    assert client.get("/api/photos", params={"bbox": "0,0,1,1"}).json() == []

    assert client.delete(f"/api/photos/{photo['id']}").status_code == 204
    assert client.get(f"/api/photos/{photo['id']}").status_code == 404


def test_rejects_non_equirectangular(client):
    assert upload(client, jpeg(1000, 1000)).status_code == 422


def test_accepts_partial_pano_with_pano_data(client):
    pano = {"fullWidth": 4000, "fullHeight": 2000, "croppedWidth": 4000, "croppedHeight": 1000, "croppedX": 0, "croppedY": 500}
    r = upload(client, jpeg(4000, 1000), pano_data=json.dumps(pano))
    assert r.status_code == 201
    assert r.json()["pano_data"] == pano


def test_rejects_garbage(client):
    assert upload(client, b"not an image").status_code == 422


def test_quota(client, monkeypatch):
    from app import main

    assert upload(client, jpeg(2000, 1000)).status_code == 201
    used = client.get("/api/health").json()["used_bytes"]
    assert used > 0
    monkeypatch.setattr(main, "QUOTA_BYTES", used)
    assert upload(client, jpeg(2000, 1000)).status_code == 507


def test_make_derivatives_peak_memory(tmp_path):
    import subprocess
    import sys
    from pathlib import Path

    src, web, thumb = tmp_path / "o.jpg", tmp_path / "w.jpg", tmp_path / "t.jpg"
    Image.new("RGB", (9000, 4500), (90, 120, 200)).save(src, "JPEG")
    code = (
        "import resource,sys\n"
        "from pathlib import Path\n"
        "from app.images import make_derivatives\n"
        "base=resource.getrusage(resource.RUSAGE_SELF).ru_maxrss\n"
        "make_derivatives(*map(Path,sys.argv[1:]))\n"
        "print((resource.getrusage(resource.RUSAGE_SELF).ru_maxrss-base)//1024)\n"
    )
    out = subprocess.run(
        [sys.executable, "-c", code, str(src), str(web), str(thumb)],
        capture_output=True, text=True, check=True, cwd=Path(__file__).parents[1],
    )
    # 9000x4500 RGB = 121 MB por copia: con dos o más copias completas superaría los 230 MB.
    assert int(out.stdout) < 200
    assert web.exists() and thumb.exists()
