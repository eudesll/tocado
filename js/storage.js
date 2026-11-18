/* =========================================================================
 * storage.js — Camada de persistência (localStorage)
 * Responsável apenas por carregar/salvar o estado e gerar identificadores.
 * ========================================================================= */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'repertorio_musical_v1';

  function defaultState() {
    return {
      version: 1,
      singers: [],
      songs: [],
      sessions: [],
      createdAt: new Date().toISOString()
    };
  }

  /** Carrega o estado. Retorna um estado válido mesmo se nada estiver salvo. */
  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = JSON.parse(raw);
      // Garante a forma mínima esperada (migração defensiva).
      var base = defaultState();
      return {
        version: parsed.version || base.version,
        singers: Array.isArray(parsed.singers) ? parsed.singers : [],
        songs: Array.isArray(parsed.songs) ? parsed.songs : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        createdAt: parsed.createdAt || base.createdAt
      };
    } catch (err) {
      console.error('Falha ao carregar dados:', err);
      return defaultState();
    }
  }

  function save(state) {
    try {
      global.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
      return true;
    } catch (err) {
      console.error('Falha ao salvar dados:', err);
      return false;
    }
  }

  function replaceAll(state) {
    return save(state);
  }

  function clear() {
    try {
      global.localStorage.removeItem(STORAGE_KEY);
      return true;
    } catch (err) {
      console.error('Falha ao limpar dados:', err);
      return false;
    }
  }

  function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    defaultState: defaultState,
    load: load,
    save: save,
    replaceAll: replaceAll,
    clear: clear,
    generateId: generateId
  };
})(window);
