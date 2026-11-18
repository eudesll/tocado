/* =========================================================================
 * song-key.js — Descoberta do tom (key) de uma música
 *
 * Não existe base pública de tons com API aberta e sem chave. Então:
 *   1. busca-se a música na iTunes Search API (CORS liberado);
 *   2. obtém-se o preview oficial de ~30 s;
 *   3. o áudio é decodificado com Web Audio API e analisado por um
 *      cromagrama (Goertzel) correlacionado com os perfis de
 *      Krumhansl-Schmuckler — método clássico de estimação de tom.
 *
 * O resultado é uma ESTIMATIVA, identificada como tal na interface.
 * ========================================================================= */
(function (global) {
  'use strict';

  var NAMES = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
  var NAMES_PT = ['Dó', 'Dó#', 'Ré', 'Ré#', 'Mi', 'Fá', 'Fá#', 'Sol', 'Sol#', 'Lá', 'Lá#', 'Si'];

  // Perfis de Krumhansl-Schmuckler (13ª classe ignorada).
  var MAJOR = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
  var MINOR = [6.33, 2.68, 3.52, 5.38, 2.60, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

  function normalize(s) {
    return String(s || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9 ]/g, '').trim();
  }

  /**
   * Encontra a música e devolve a URL do preview. A iTunes Search API aceita
   * requisições diretas do navegador; a API da Deezer não envia cabeçalhos
   * CORS, por isso deixou de ser usada.
   */
  function findPreview(artist, title) {
    var query = (artist ? artist + ' ' : '') + title;
    var u = 'https://itunes.apple.com/search?term=' + encodeURIComponent(query) + '&entity=song&limit=5&country=BR';
    return Net.getJson(u, { timeout: 8000, cacheTtl: 60 * 60 * 1000 })
      .then(function (d) {
        var tracks = d.results || [];
        if (!tracks.length) return null;
        var want = normalize(title);
        var best = tracks.find(function (t) {
          var got = normalize(t.trackName);
          return got && (got.indexOf(want) !== -1 || want.indexOf(got) !== -1);
        }) || tracks[0];
        return {
          url: best.previewUrl || null,
          durationSec: best.trackTimeMillis ? Math.round(best.trackTimeMillis / 1000) : null,
          track: best.trackName,
          artist: best.artistName,
          source: 'Apple Music'
        };
      }).catch(function () { return null; });
  }

  /** Potência de uma frequência via algoritmo de Goertzel. */
  function goertzel(samples, sampleRate, freq) {
    var n = samples.length;
    var k = Math.round(freq * n / sampleRate);
    var w = 2 * Math.PI * k / n;
    var coeff = 2 * Math.cos(w);
    var s1 = 0, s2 = 0;
    for (var i = 0; i < n; i++) {
      var s = samples[i] + coeff * s1 - s2;
      s2 = s1;
      s1 = s;
    }
    return s1 * s1 + s2 * s2 - coeff * s1 * s2;
  }

  /** Cromagrama: soma de energia das 12 classes de altura. */
  function chroma(samples, sampleRate) {
    var bins = new Array(12).fill(0);
    var frame = 1024;
    var freqs = [];
    for (var pc = 0; pc < 12; pc++) {
      freqs[pc] = [];
      for (var oct = 3; oct <= 5; oct++) {
        var midi = 12 * (oct + 1) + pc; // C4 = 60
        freqs[pc].push(440 * Math.pow(2, (midi - 69) / 12));
      }
    }
    var frames = 0;
    for (var start = 0; start + frame <= samples.length; start += frame * 2) {
      var slice = samples.subarray(start, start + frame);
      for (var p = 0; p < 12; p++) {
        for (var o = 0; o < freqs[p].length; o++) {
          bins[p] += goertzel(slice, sampleRate, freqs[p][o]);
        }
      }
      frames++;
    }
    if (!frames) return bins;
    var max = Math.max.apply(null, bins) || 1;
    return bins.map(function (v) { return v / max; });
  }

  /** Correlação com os perfis de Krumhansl-Schmuckler (24 tons). */
  function estimateKey(c) {
    var best = { score: -Infinity, pc: 0, mode: 'major' };
    for (var tonic = 0; tonic < 12; tonic++) {
      for (var mode in { major: 1, minor: 1 }) {
        var profile = mode === 'major' ? MAJOR : MINOR;
        var score = 0;
        for (var i = 0; i < 12; i++) score += c[(tonic + i) % 12] * profile[i];
        if (score > best.score) best = { score: score, pc: tonic, mode: mode };
      }
    }
    var symbol = NAMES[best.pc] + (best.mode === 'minor' ? 'm' : '');
    var name = NAMES_PT[best.pc] + (best.mode === 'minor' ? ' menor' : ' maior');
    return { key: symbol, keyName: name };
  }

  function analyze(arrayBuffer) {
    var Ctx = global.AudioContext || global.webkitAudioContext;
    if (!Ctx) return Promise.reject(new Error('Web Audio não disponível'));
    var ctx = new Ctx();
    return ctx.decodeAudioData(arrayBuffer).then(function (audio) {
      var data = audio.getChannelData(0);
      var limit = Math.min(data.length, audio.sampleRate * 30);
      var c = chroma(data.subarray(0, limit), audio.sampleRate);
      ctx.close();
      return estimateKey(c);
    }).catch(function (e) {
      try { ctx.close(); } catch (ignore) {}
      throw e;
    });
  }

  /**
   * Busca na internet e estima o tom. Retorna duração mesmo quando o áudio
   * não pode ser analisado (CORS, formato etc.).
   */
  function search(artist, title) {
    if (!title) return Promise.resolve(null);
    return findPreview(artist, title).then(function (found) {
      if (!found) return null;
      var durationMin = found.durationSec
        ? Math.round(found.durationSec / 60 * 100) / 100
        : null;
      var base = {
        durationSec: found.durationSec,
        durationMin: durationMin,
        track: found.track,
        trackArtist: found.artist,
        previewSource: found.source
      };
      if (!found.url) return base;
      return Net.getArrayBuffer(found.url, { timeout: 15000, cache: 'no-store' })
        .then(analyze)
        .then(function (est) {
          return Object.assign(base, {
            key: est.key,
            keyName: est.keyName,
            keySource: 'Estimativa por áudio (' + found.source + ')'
          });
        })
        .catch(function () { return base; });
    }).catch(function () { return null; });
  }

  global.SongKey = { search: search, estimateKey: estimateKey, chroma: chroma };
})(window);
