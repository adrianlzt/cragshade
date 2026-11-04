from pathlib import Path

import boto3
from moto import mock_aws

from app.storage import CACHE_CONTROL, S3Storage


@mock_aws
def test_s3_put_url_delete(tmp_path: Path, monkeypatch):
    monkeypatch.setenv("AWS_ACCESS_KEY_ID", "test")
    monkeypatch.setenv("AWS_SECRET_ACCESS_KEY", "test")
    s3 = boto3.client("s3", region_name="us-east-1")
    s3.create_bucket(Bucket="fotos")
    store = S3Storage("fotos", None, "https://media.example.com/")
    store.client = s3

    src = tmp_path / "web.jpg"
    src.write_bytes(b"jpeg")
    store.put("abc/web.jpg", src, "image/jpeg")
    store.put("abc/thumb.jpg", src, "image/jpeg")
    store.put("abd/web.jpg", src, "image/jpeg")

    obj = s3.head_object(Bucket="fotos", Key="media/abc/web.jpg")
    assert obj["ContentType"] == "image/jpeg"
    assert obj["CacheControl"] == CACHE_CONTROL
    assert store.url("abc/web.jpg") == "https://media.example.com/media/abc/web.jpg"

    store.delete_prefix("abc/")
    left = [o["Key"] for o in s3.list_objects_v2(Bucket="fotos")["Contents"]]
    assert left == ["media/abd/web.jpg"]
