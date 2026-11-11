import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { once } from 'node:events';
import { createApp } from '../server.js';

async function startServer(dataDir, env = process.env) {
  const server = createApp({ dataDir, env }).listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  return {
    server,
    request: (route, { cookie, ...options } = {}) => fetch(`http://127.0.0.1:${address.port}${route}`, {
      ...options,
      headers: { ...(cookie ? { cookie } : {}), ...options.headers },
    }),
  };
}

async function closeServer(server) {
  await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function login(client, userId, password) {
  const response = await client.request('/api/login', {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId, password }),
  });
  assert.equal(response.status, 200);
  return response.headers.getSetCookie().map((cookie) => cookie.split(';', 1)[0]).join('; ');
}

test('spoofed identity headers are rejected and authenticated sharing persists', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ajaia-test-'));
  let current = await startServer(dataDir);
  try {
    const spoofed = await current.request('/api/documents', { headers: { 'x-user-id': 'alice' } });
    assert.equal(spoofed.status, 401);
    const invalidLogin = await current.request('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'alice', password: 'wrong-password' }),
    });
    assert.equal(invalidLogin.status, 401);

    const aliceCookie = await login(current, 'alice', 'alice-demo');
    const tamperedCookie = aliceCookie.replace(/ajaia\.sid=([^;]+)/, (_match, value) => `ajaia.sid=${value}tampered`);
    const forgedSession = await current.request('/api/documents', { headers: { cookie: tamperedCookie } });
    assert.equal(forgedSession.status, 401);
    const created = await current.request('/api/documents', { cookie: aliceCookie,
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ title: 'Release notes' }),
    });
    assert.equal(created.status, 201);
    const document = (await created.json()).document;

    const marcoCookie = await login(current, 'marco', 'marco-demo');
    const privateRead = await current.request(`/api/documents/${document.id}`, { cookie: marcoCookie });
    assert.equal(privateRead.status, 404);

    const shared = await current.request(`/api/documents/${document.id}/shares`, { cookie: aliceCookie,
      method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ userId: 'marco', role: 'viewer' }),
    });
    assert.equal(shared.status, 200);

    const sharedRead = await current.request(`/api/documents/${document.id}`, { cookie: marcoCookie });
    assert.equal(sharedRead.status, 200);
    assert.equal((await sharedRead.json()).document.access, 'viewer');

    const deniedWrite = await current.request(`/api/documents/${document.id}`, { cookie: marcoCookie,
      method: 'PUT', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Changed', content: { type: 'doc', content: [{ type: 'paragraph' }] } }),
    });
    assert.equal(deniedWrite.status, 403);

    await closeServer(current.server);
    current = await startServer(dataDir);
    const restartedAliceCookie = await login(current, 'alice', 'alice-demo');
    const reopened = await current.request(`/api/documents/${document.id}`, { cookie: restartedAliceCookie });
    assert.equal(reopened.status, 200);
    assert.equal((await reopened.json()).document.title, 'Release notes');
  } finally {
    await closeServer(current.server);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('Markdown import keeps headings and list structure', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ajaia-import-test-'));
  const current = await startServer(dataDir);
  try {
    const form = new FormData();
    form.append('file', new Blob(['# Sprint plan\n\n- Review drafts\n- Share decisions'], { type: 'text/markdown' }), 'sprint.md');
    const aliceCookie = await login(current, 'alice', 'alice-demo');
    const response = await current.request('/api/documents/import', { cookie: aliceCookie, method: 'POST', body: form });
    assert.equal(response.status, 201);
    const document = (await response.json()).document;
    assert.equal(document.title, 'sprint');
    assert.equal(document.content.content[0].type, 'heading');
    assert.equal(document.content.content[1].type, 'bulletList');
    assert.equal(document.content.content[1].content.length, 2);
  } finally {
    await closeServer(current.server);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('production refuses to start without explicit session and account secrets', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ajaia-production-test-'));
  try {
    assert.throws(() => createApp({ dataDir, env: { NODE_ENV: 'production' } }), /SESSION_SECRET/);
  } finally {
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});

test('configured production uses secure cookies and security headers', async () => {
  const dataDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ajaia-production-auth-test-'));
  const productionEnv = {
    NODE_ENV: 'production',
    SESSION_SECRET: 'session-signing-secret-for-test-only-1234567890',
    DEMO_ALICE_PASSWORD: 'alice-production-demo-password',
    DEMO_MARCO_PASSWORD: 'marco-production-demo-password',
  };
  const current = await startServer(dataDir, productionEnv);
  try {
    const response = await current.request('/api/login', {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-forwarded-proto': 'https' },
      body: JSON.stringify({ userId: 'alice', password: productionEnv.DEMO_ALICE_PASSWORD }),
    });
    assert.equal(response.status, 200);
    assert.match(response.headers.get('set-cookie'), /HttpOnly/i);
    assert.match(response.headers.get('set-cookie'), /Secure/i);
    assert.match(response.headers.get('content-security-policy'), /default-src 'self'/);
    assert.equal(response.headers.get('cache-control'), 'no-store');
  } finally {
    await closeServer(current.server);
    await fs.rm(dataDir, { recursive: true, force: true });
  }
});
