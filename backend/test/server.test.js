const test = require('node:test');
const assert = require('node:assert/strict');
const { server } = require('../server');

test.after(() => {
  server.close();
});

test('health endpoint reports backend status without exposing secrets', async () => {
  await new Promise(resolve => server.listen(0, resolve));
  const { port } = server.address();

  const res = await fetch(`http://127.0.0.1:${port}/health`);
  assert.equal(res.status, 200);

  const body = await res.json();
  assert.equal(body.ok, true);
  assert.equal(typeof body.model, 'string');
  assert.equal(typeof body.voice, 'string');
  assert.equal(typeof body.hasGroqKey, 'boolean');
  assert.equal(Object.prototype.hasOwnProperty.call(body, 'groqApiKey'), false);
});
