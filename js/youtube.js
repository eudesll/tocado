/* =========================================================================
 * youtube.js — Utilitários para vídeos do YouTube
 *
 * A API oficial do YouTube Data exige chave, e não há endpoint público de
 * busca com CORS confiável. Por isso este módulo:
 *   - gera automaticamente um link de busca no YouTube para a música;
 *   - normaliza links/IDs colados pelo usuário;
 *   - usa o serviço público noembed.com (CORS permitido) para obter título
 *     e canal de cada vídeo, e o CDN i.ytimg.com para a miniatura.
 * ========================================================================= */
(function (global) {
  'use strict';

  var ORIGINS = [
    'https://www.youtube.com',
    'https://youtube.com',
    'https://www.youtube-nocookie.com',
    'https://youtube-nocookie.com'
  ];

  function parseVideoId(input) {
    var s = String(input || '').trim();
    if (!s) return null;
    if (/^[a-zA-Z0-9_-]{11}$/.test(s)) return s;
    var m = s.match(/(?:youtube\.com\/(?:watch\?(?:[^&\s]*&)*v=|embed\/|shorts\/|live\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/i);
    return m ? m[1] : null;
  }

  function watchUrl(id) { return 'https://www.youtube.com/watch?v=' + id; }
  function thumbUrl(id) { return 'https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'; }
  function searchUrl(query) {
    return 'https://www.youtube.com/results?search_query=' + encodeURIComponent(query);
  }
  function songSearchUrl(title, artist) {
    return searchUrl((artist ? artist + ' ' : '') + title);
  }

  function isYoutubeOrigin(origin) {
    return ORIGINS.indexOf(String(origin || '').toLowerCase()) !== -1;
  }

  /** Busca metadados públicos do vídeo. Nunca falha: retorna um objeto mínimo. */
  function enrich(id) {
    var base = { id: id, url: watchUrl(id), thumb: thumbUrl(id), title: 'Vídeo do YouTube', channel: '' };
    return Net.getJson('https://noembed.com/embed?url=' + encodeURIComponent(watchUrl(id)), {
      timeout: 8000,
      cacheTtl: 60 * 60 * 1000
    }).then(function (d) {
      return {
        id: id,
        url: watchUrl(id),
        thumb: (d.thumbnail_url && d.thumbnail_url.replace(/\d+(\.\w+)$/, 'hqdefault$1')) || thumbUrl(id),
        title: d.title || base.title,
        channel: d.author_name || ''
      };
    }).catch(function () { return base; });
  }

  function enrichMany(ids) {
    return Promise.all(ids.map(enrich));
  }

  global.YouTube = {
    parseVideoId: parseVideoId,
    watchUrl: watchUrl,
    thumbUrl: thumbUrl,
    searchUrl: searchUrl,
    songSearchUrl: songSearchUrl,
    isYoutubeOrigin: isYoutubeOrigin,
    enrich: enrich,
    enrichMany: enrichMany
  };
})(window);
