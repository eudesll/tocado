'use strict';

const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const ROOT = path.resolve(__dirname, '..');

/** Carrega um script do projeto em um contexto isolado com window/localStorage. */
function loadScript(relativePath, extras) {
  const file = path.join(ROOT, relativePath);
  const sandbox = Object.assign({
    console,
    setTimeout,
    clearTimeout,
    Blob,
    TextEncoder,
    TextDecoder,
    AbortController,
    URL,
    URLSearchParams,
    Promise
  }, extras || {});
  sandbox.window = sandbox;
  sandbox.globalThis = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(fs.readFileSync(file, 'utf8'), sandbox, { filename: file });
  return sandbox;
}

function memoryStorage(initial) {
  const data = new Map(Object.entries(initial || {}));
  return {
    getItem(key) { return data.has(key) ? data.get(key) : null; },
    setItem(key, value) { data.set(key, String(value)); },
    removeItem(key) { data.delete(key); },
    clear() { data.clear(); },
    key(index) { return Array.from(data.keys())[index] || null; },
    get length() { return data.size; },
    _data: data
  };
}

function loadStore(initial) {
  const localStorage = memoryStorage(initial);
  const sandbox = loadScript('js/storage.js', { localStorage });
  return { Store: sandbox.Store, localStorage };
}

module.exports = { ROOT, loadScript, memoryStorage, loadStore };
