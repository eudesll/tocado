/* =========================================================================
 * song-lyrics.js — Busca da letra de uma música na internet
 * Fontes públicas, sem chave e com CORS: LRCLIB → lyrics.ovh.
 * ========================================================================= */
(function (global) {
  'use strict';

  function lrclib(artist, title) {
    var url = 'https://lrclib.net/api/search?track_name=' + encodeURIComponent(title) +
      '&artist_name=' + encodeURIComponent(artist);
    return Net.getJson(url, { timeout: 8000, cacheTtl: 24 * 60 * 60 * 1000 }).then(function (data) {
      var hit = (data || []).find(function (x) { return x.plainLyrics; });
      return hit ? { lyrics: hit.plainLyrics, source: 'LRCLIB', track: hit.trackName, artist: hit.artistName } : null;
    }).catch(function () { return null; });
  }

  function lyricsOvh(artist, title) {
    var url = 'https://api.lyrics.ovh/v1/' + encodeURIComponent(artist) + '/' + encodeURIComponent(title);
    return Net.getJson(url, { timeout: 8000, cacheTtl: 24 * 60 * 60 * 1000 }).then(function (d) {
      return d && d.lyrics ? { lyrics: d.lyrics, source: 'lyrics.ovh' } : null;
    }).catch(function () { return null; });
  }

  function search(artist, title) {
    if (!title) return Promise.resolve(null);
    return Net.withTimeout(
      lrclib(artist, title).then(function (r) {
        if (r) return r;
        // A lyrics.ovh exige um artista na URL e responde 404 sem ele.
        return artist ? lyricsOvh(artist, title) : null;
      }),
      12000,
      null
    ).catch(function () { return null; });
  }

  global.SongLyrics = { search: search };
})(window);
