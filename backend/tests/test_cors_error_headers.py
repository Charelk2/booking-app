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


@app.get('/notfound')
async def not_found_route():
    from fastapi import HTTPException
    raise HTTPException(status_code=404, detail='not here')

client = TestClient(app)

def test_error_response_has_cors_header():
    response = client.get('/fail', headers={'Origin': 'http://foo.com'})
    assert response.status_code == 500
    assert response.headers.get('access-control-allow-origin') == 'http://foo.com'


def test_http_exception_passthrough():
    response = client.get('/notfound', headers={'Origin': 'http://foo.com'})
    assert response.status_code == 404
    assert response.json() == {'detail': 'not here'}
    assert response.headers.get('access-control-allow-origin') == 'http://foo.com'
