/* =========================================================================
 * song-lyrics.js — Busca da letra de uma música na internet
 * Fontes públicas, sem chave e com CORS: LRCLIB → lyrics.ovh.
 * ========================================================================= */
(function (global) {
  'use strict';

  function withTimeout(promise, ms, fallback) {
    return Promise.race([
      promise,
      new Promise(function (resolve) { setTimeout(function () { resolve(fallback); }, ms); })
    ]);
  }

  function lrclib(artist, title) {
    var url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(title) +
      '&artist_name=' + encodeURIComponent(artist);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (data) {
      var hit = (data || []).find(function (x) { return x.plainLyrics; });
      return hit ? { lyrics: hit.plainLyrics, source: 'LRCLIB', track: hit.trackName, artist: hit.artistName } : null;
    }).catch(function () { return null; });
  }

  function lyricsOvh(artist, title) {
    var url = 'https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
    return fetch(url).then(function (r) {
      if (!r.ok) throw new Error('HTTP ' + r.status);
      return r.json();
    }).then(function (d) {
      return d && d.lyrics ? { lyrics: d.lyrics, source: 'lyrics.ovh' } : null;
    }).catch(function () { return null; });
  }

  function search(artist, title) {
    if (!title) return Promise.resolve(null);
    return withTimeout(
      lrclib(artist, title).then(function (r) { return r || lyricsOvh(artist, title); }),
      12000,
      null
    ).catch(function () { return null; });
  }

  global.SongLyrics = { search: search };
})(window);
