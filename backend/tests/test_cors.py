import os
from importlib import reload

os.environ['CORS_ALLOW_ALL'] = 'true'

import app.core.config as config
reload(config)
from app import main as main_module
reload(main_module)
app = main_module.app

from fastapi.testclient import TestClient

client = TestClient(app)

def test_cors_allow_all():
    response = client.options('/', headers={
        'Origin': 'http://foo.com',
        'Access-Control-Request-Method': 'GET'
    })
    assert response.status_code == 200
    assert response.headers.get('access-control-allow-origin') == 'http://foo.com'

