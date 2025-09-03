const http = require('http');

let server;

function handler(req, res) {
  res.setHeader('Content-Type', 'application/json');
  if (req.url === '/api/v1/artists/1') {
    res.end(JSON.stringify({ location: 'NYC' }));
  } else if (req.url === '/api/v1/artists/1/availability') {
    res.end(JSON.stringify({ unavailable_dates: [] }));
  } else {
    res.end('{}');
  }
}

exports.startApiStubServer = function startApiStubServer(port = 8000) {
  return new Promise((resolve) => {
    server = http.createServer(handler);
    server.listen(port, resolve);
  });
};

exports.stopApiStubServer = function stopApiStubServer() {
  return server
    ? new Promise((resolve) => server.close(resolve))
    : Promise.resolve();
};
