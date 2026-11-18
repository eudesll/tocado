'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./helpers');

test('getJson deduplica chamadas simultâneas e usa cache', async () => {
  let calls = 0;
  let resolveFetch;
  const fetch = () => {
    calls++;
    return new Promise((resolve) => { resolveFetch = resolve; });
  };
  const { Net } = loadScript('js/http.js', { fetch });
  const url = 'https://api.exemplo.com/dados';

  const first = Net.getJson(url, { timeout: 1000 });
  const second = Net.getJson(url, { timeout: 1000 });
  assert.equal(first, second);
  assert.equal(calls, 1);

  resolveFetch({ ok: true, json: async () => ({ valor: 1 }) });
  assert.deepEqual(await first, { valor: 1 });

  const cached = await Net.getJson(url, { timeout: 1000 });
  assert.deepEqual(cached, { valor: 1 });
  assert.equal(calls, 1);

  Net.clearCache();
  const afterClear = Net.getJson(url, { timeout: 1000 });
  assert.notEqual(afterClear, first);
  assert.equal(calls, 2);
  resolveFetch({ ok: true, json: async () => ({ valor: 2 }) });
  assert.deepEqual(await afterClear, { valor: 2 });
});

test('getJson rejeita respostas HTTP de erro', async () => {
  const fetch = async () => ({ ok: false, status: 404, json: async () => ({}) });
  const { Net } = loadScript('js/http.js', { fetch });
  await assert.rejects(Net.getJson('https://api.exemplo.com/erro'), /HTTP 404/);
});

test('request aborta e rejeita por timeout', async () => {
  const fetch = () => new Promise(() => {});
  const { Net } = loadScript('js/http.js', { fetch });
  await assert.rejects(
    Net.request('https://api.exemplo.com/lento', { timeout: 20 }),
    /Tempo esgotado/
  );
});

test('withTimeout devolve fallback sem rejeitar', async () => {
  const { Net } = loadScript('js/http.js', { fetch: async () => ({ ok: true }) });
  const value = await Net.withTimeout(new Promise(() => {}), 20, 'fallback');
  assert.equal(value, 'fallback');
});

test('withTimeout preserva resolução e rejeição da promessa original', async () => {
  const { Net } = loadScript('js/http.js', { fetch: async () => ({ ok: true }) });
  assert.equal(await Net.withTimeout(Promise.resolve('ok'), 100, 'x'), 'ok');
  await assert.rejects(Net.withTimeout(Promise.reject(new Error('falha')), 100, 'x'), /falha/);
});
