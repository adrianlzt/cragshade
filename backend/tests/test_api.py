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
