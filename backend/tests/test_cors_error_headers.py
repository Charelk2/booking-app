import os
from importlib import reload
from fastapi.testclient import TestClient

os.environ['CORS_ALLOW_ALL'] = 'true'

import app.core.config as config
reload(config)
from app import main as main_module
reload(main_module)
app = main_module.app

@app.get('/fail')
async def fail_route():
    raise RuntimeError('boom')

client = TestClient(app)

def test_error_response_has_cors_header():
    response = client.get('/fail', headers={'Origin': 'http://foo.com'})
    assert response.status_code == 500
    assert response.headers.get('access-control-allow-origin') == 'http://foo.com'
