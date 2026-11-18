/* =========================================================================
 * http.js — Cliente HTTP compartilhado
 * Timeout, cancelamento, deduplicação de requisições e cache em memória.
 * ========================================================================= */
(function (global) {
  'use strict';

  var DEFAULT_TIMEOUT = 12000;
  var DEFAULT_TTL = 10 * 60 * 1000; // 10 minutos
  var cache = Object.create(null);
  var inflight = Object.create(null);

  function now() { return Date.now(); }

  function timeoutError(ms) {
    return new Error('Tempo esgotado após ' + Math.round(ms / 1000) + ' s');
  }

  /** Executa fetch com AbortController e timeout. */
  function request(url, options) {
    options = options || {};
    var timeout = options.timeout == null ? DEFAULT_TIMEOUT : options.timeout;
    var controller = null;
    try {
      if (typeof global.AbortController === 'function') controller = new global.AbortController();
    } catch (e) { controller = null; }

    var init = {
      method: options.method || 'GET',
      headers: options.headers || { Accept: 'application/json' },
      cache: options.cache || 'default'
    };
    if (controller) init.signal = controller.signal;
    if (options.body != null) init.body = options.body;

    var timer = null;
    var fetchPromise = global.fetch(url, init);
    var timed = new Promise(function (resolve, reject) {
      timer = setTimeout(function () {
        if (controller) controller.abort();
        reject(timeoutError(timeout));
      }, timeout);
    });

    return Promise.race([fetchPromise, timed]).then(function (response) {
      clearTimeout(timer);
      if (!response.ok) throw new Error('HTTP ' + response.status);
      return response;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  /** GET JSON com cache e deduplicação de chamadas simultâneas. */
  function getJson(url, options) {
    options = options || {};
    var ttl = options.cacheTtl == null ? DEFAULT_TTL : options.cacheTtl;
    var cached = cache[url];
    if (ttl > 0 && cached && cached.expires > now()) {
      return Promise.resolve(cached.data);
    }
    if (inflight[url]) return inflight[url];

    var promise = request(url, options)
      .then(function (response) { return response.json(); })
      .then(function (data) {
        if (ttl > 0) cache[url] = { data: data, expires: now() + ttl };
        return data;
      });

    inflight[url] = promise;
    var cleanup = function () { delete inflight[url]; };
    promise.then(cleanup, cleanup);
    return promise;
  }

  /** GET binário (áudio, imagem) sem cache em memória. */
  function getArrayBuffer(url, options) {
    options = options || {};
    return request(url, options).then(function (response) {
      return response.arrayBuffer();
    });
  }

  /** Timeout para promessas arbitrárias (não cancela a origem). */
  function withTimeout(promise, ms, fallback) {
    var timer = null;
    var timeout = new Promise(function (resolve) {
      timer = setTimeout(function () { resolve(fallback); }, ms);
    });
    return Promise.race([promise, timeout]).then(function (value) {
      clearTimeout(timer);
      return value;
    }, function (err) {
      clearTimeout(timer);
      throw err;
    });
  }

  function clearCache() { cache = Object.create(null); }

  global.Net = {
    DEFAULT_TIMEOUT: DEFAULT_TIMEOUT,
    DEFAULT_TTL: DEFAULT_TTL,
    request: request,
    getJson: getJson,
    getArrayBuffer: getArrayBuffer,
    withTimeout: withTimeout,
    clearCache: clearCache
  };
})(window);
