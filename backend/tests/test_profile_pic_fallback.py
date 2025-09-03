from fastapi.testclient import TestClient
from app.main import app
from pathlib import Path

client = TestClient(app)

def test_missing_profile_pic_returns_default():
    resp = client.get('/static/profile_pics/nonexistent_image.jpg')
    assert resp.status_code == 200
    assert resp.headers['content-type'] == 'image/jpeg'
    default = Path('backend/app/static/default-avatar.svg').read_bytes()
    assert resp.content == default
