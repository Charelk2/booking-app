const { stopApiStubServer } = require('./api-stub-server');

module.exports = async () => {
  await stopApiStubServer();
};
