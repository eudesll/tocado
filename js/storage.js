/* =========================================================================
 * storage.js — Camada de persistência (localStorage)
 * Responsável por carregar/salvar o estado, migrar versões, gerar
 * identificadores e validar/sanitizar dados importados.
 * ========================================================================= */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'repertorio_musical_v1';
  var SCHEMA_VERSION = 2;

  var LIMITS = {
    singers: 5000,
    songs: 20000,
    sessions: 50000,
    setlists: 1000,
    text: 20000,
    lyrics: 200000,
    photo: 600000,
    videos: 50,
    sections: 100,
    history: 2000
  };

  function nowIso() { return new Date().toISOString(); }

  function defaultState() {
    return {
      version: SCHEMA_VERSION,
      singers: [],
      songs: [],
      sessions: [],
      setlists: [],
      createdAt: nowIso()
    };
  }

  /** Texto curto, sem caracteres de controle e com limite de tamanho. */
  function text(value, max) {
    if (value == null) return '';
    var s = String(value).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '');
    var limit = max || LIMITS.text;
    return s.length > limit ? s.slice(0, limit) : s;
  }

  function bool(value) { return !!value; }

  function integer(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    n = Math.round(n);
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function decimal(value, min, max, fallback) {
    var n = Number(value);
    if (!isFinite(n)) return fallback;
    if (n < min) n = min;
    if (n > max) n = max;
    return n;
  }

  function isoDate(value) {
    if (!value) return null;
    var d = new Date(value);
    return isNaN(d.getTime()) ? null : d.toISOString();
  }

  function generateId(prefix) {
    return (prefix || 'id') + '_' + Date.now().toString(36) + '_' +
      Math.random().toString(36).slice(2, 8);
  }

  function validId(value) {
    return /^[A-Za-z0-9_-]{1,100}$/.test(String(value || ''));
  }

  function uniqueId(value, prefix, used) {
    var id = validId(value) ? String(value) : generateId(prefix);
    if (used[id]) id = generateId(prefix);
    used[id] = true;
    return id;
  }

  /** Apenas URLs http(s); data URLs de imagem são aceitas quando permitido. */
  function safeUrl(value, allowImageData) {
    var s = text(value, LIMITS.photo);
    if (!s) return '';
    if (allowImageData && /^data:image\/(png|jpe?g|webp|gif);base64,[A-Za-z0-9+/=\s]+$/i.test(s)) {
      return s.slice(0, LIMITS.photo);
    }
    if (/^https?:\/\//i.test(s)) return s.slice(0, 4096);
    return '';
  }

  function sanitizeSections(list) {
    if (!Array.isArray(list)) return [];
    var used = Object.create(null);
    var out = [];
    list.slice(0, LIMITS.sections).forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var name = text(raw.name, 200).trim();
      if (!name) return;
      out.push({
        id: uniqueId(raw.id, 'section', used),
        name: name,
        confidence: integer(raw.confidence, 1, 5, 3)
      });
    });
    return out;
  }

  function sanitizeVideos(list) {
    if (!Array.isArray(list)) return [];
    var used = Object.create(null);
    var out = [];
    list.slice(0, LIMITS.videos).forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      var id = text(raw.id, 11);
      if (!/^[A-Za-z0-9_-]{11}$/.test(id) || used[id]) return;
      used[id] = true;
      out.push({
        id: id,
        url: safeUrl(raw.url) || ('https://www.youtube.com/watch?v=' + id),
        thumb: safeUrl(raw.thumb) || ('https://i.ytimg.com/vi/' + id + '/hqdefault.jpg'),
        title: text(raw.title, 300) || 'Vídeo do YouTube',
        channel: text(raw.channel, 200)
      });
    });
    return out;
  }

  function sanitizeHistory(list) {
    if (!Array.isArray(list)) return [];
    var out = [];
    list.slice(-LIMITS.history).forEach(function (raw) {
      if (!raw || typeof raw !== 'object') return;
      out.push({
        day: integer(raw.day, 0, 1000000, 0),
        quality: integer(raw.quality, 0, 5, 0),
        interval: integer(raw.interval, 0, 100000, 0),
        ease: decimal(raw.ease, 1.3, 10, 2.5)
      });
    });
    return out;
  }

  function sanitizeCard(raw) {
    if (!raw || typeof raw !== 'object') return null;
    return {
      songId: text(raw.songId, 100) || null,
      ease: decimal(raw.ease, 1.3, 10, 2.5),
      interval: integer(raw.interval, 0, 100000, 0),
      repetitions: integer(raw.repetitions, 0, 100000, 0),
      due: integer(raw.due, 0, 1000000, 0),
      lastReview: raw.lastReview == null ? null : integer(raw.lastReview, 0, 1000000, 0),
      lapses: integer(raw.lapses, 0, 100000, 0),
      history: sanitizeHistory(raw.history)
    };
  }

  function sanitizeSinger(raw, usedIds) {
    if (!raw || typeof raw !== 'object') return null;
    var name = text(raw.name, 200).trim();
    if (!name) return null;
    return {
      id: uniqueId(raw.id, 'singer', usedIds),
      name: name,
      genre: text(raw.genre, 120),
      notes: text(raw.notes, LIMITS.text),
      photo: safeUrl(raw.photo, true) || null,
      photoUrl: safeUrl(raw.photoUrl) || null,
      photoSource: text(raw.photoSource, 200) || null,
      photoMissing: bool(raw.photoMissing),
      photoPending: bool(raw.photoPending),
      photoUpdatedAt: isoDate(raw.photoUpdatedAt)
    };
  }

  function sanitizeSong(raw, usedIds, singerIds) {
    if (!raw || typeof raw !== 'object') return null;
    var title = text(raw.title, 300).trim();
    if (!title) return null;
    var singerId = text(raw.singerId, 100);
    var youtubeVideos = sanitizeVideos(raw.youtubeVideos);
    return {
      id: uniqueId(raw.id, 'song', usedIds),
      title: title,
      singerId: singerIds[singerId] ? singerId : null,
      genre: text(raw.genre, 120),
      difficulty: integer(raw.difficulty, 1, 5, 1),
      duration: raw.duration == null || raw.duration === '' ? null :
        decimal(raw.duration, 0, 600, null),
      key: text(raw.key, 20),
      keyName: text(raw.keyName, 80),
      keySource: text(raw.keySource, 200),
      lyrics: text(raw.lyrics, LIMITS.lyrics),
      lyricsSource: text(raw.lyricsSource, 200),
      notes: text(raw.notes, LIMITS.text),
      sections: sanitizeSections(raw.sections),
      youtubeVideos: youtubeVideos,
      youtubeSearchUrl: safeUrl(raw.youtubeSearchUrl),
      createdAt: isoDate(raw.createdAt) || nowIso(),
      card: sanitizeCard(raw.card),
      keyPending: bool(raw.keyPending),
      lyricsPending: bool(raw.lyricsPending)
    };
  }

  function sanitizeSession(raw) {
    if (!raw || typeof raw !== 'object') return null;
    var ratings = [];
    if (Array.isArray(raw.ratings)) {
      raw.ratings.slice(0, LIMITS.sections).forEach(function (r) {
        if (!r || typeof r !== 'object') return;
        ratings.push({
          id: text(r.id, 100),
          name: text(r.name, 200),
          quality: integer(r.quality, 0, 5, 0)
        });
      });
    }
    return {
      id: validId(raw.id) ? String(raw.id) : generateId('session'),
      songId: text(raw.songId, 100) || null,
      songTitle: text(raw.songTitle, 300),
      day: integer(raw.day, 0, 1000000, 0),
      date: isoDate(raw.date) || nowIso(),
      avgQuality: decimal(raw.avgQuality, 0, 5, 0),
      ratings: ratings,
      prevInterval: integer(raw.prevInterval, 0, 100000, 0),
      newInterval: integer(raw.newInterval, 0, 100000, 0)
    };
  }

  function sanitizeSetlist(raw, usedIds, songIds) {
    if (!raw || typeof raw !== 'object') return null;
    var name = text(raw.name, 200).trim();
    if (!name) return null;
    var songs = [];
    if (Array.isArray(raw.songIds)) {
      raw.songIds.slice(0, LIMITS.songs).forEach(function (id) {
        var sid = text(id, 100);
        if (songIds[sid]) songs.push(sid);
      });
    }
    return {
      id: uniqueId(raw.id, 'setlist', usedIds),
      name: name,
      songIds: songs,
      createdAt: isoDate(raw.createdAt) || nowIso()
    };
  }

  /**
   * Valida e normaliza um estado vindo de backup/importação.
   * Retorna { ok, state, warnings } ou { ok:false, error }.
   */
  function sanitizeState(data) {
    if (!data || typeof data !== 'object') {
      return { ok: false, error: 'O arquivo não contém um objeto JSON válido.' };
    }
    if (!Array.isArray(data.singers) || !Array.isArray(data.songs)) {
      return { ok: false, error: 'Formato inválido: "singers" e "songs" precisam ser listas.' };
    }

    var warnings = [];
    var singerIds = Object.create(null);
    var singers = [];
    data.singers.slice(0, LIMITS.singers).forEach(function (raw) {
      var singer = sanitizeSinger(raw, singerIds);
      if (singer) singers.push(singer);
      else warnings.push('Cantor ignorado por não ter nome válido.');
    });
    if (data.singers.length > LIMITS.singers) {
      warnings.push('Alguns cantores foram ignorados por exceder o limite de ' + LIMITS.singers + '.');
    }

    var songIds = Object.create(null);
    var songs = [];
    data.songs.slice(0, LIMITS.songs).forEach(function (raw) {
      var song = sanitizeSong(raw, songIds, singerIds);
      if (song) songs.push(song);
      else warnings.push('Música ignorada por não ter título válido.');
    });
    if (data.songs.length > LIMITS.songs) {
      warnings.push('Algumas músicas foram ignoradas por exceder o limite de ' + LIMITS.songs + '.');
    }

    var sessions = [];
    if (Array.isArray(data.sessions)) {
      data.sessions.slice(-LIMITS.sessions).forEach(function (raw) {
        var session = sanitizeSession(raw);
        if (session) sessions.push(session);
      });
    }

    var setlistIds = Object.create(null);
    var setlists = [];
    if (Array.isArray(data.setlists)) {
      data.setlists.slice(0, LIMITS.setlists).forEach(function (raw) {
        var setlist = sanitizeSetlist(raw, setlistIds, songIds);
        if (setlist) setlists.push(setlist);
      });
    }

    return {
      ok: true,
      warnings: warnings,
      state: {
        version: SCHEMA_VERSION,
        singers: singers,
        songs: songs,
        sessions: sessions,
        setlists: setlists,
        createdAt: isoDate(data.createdAt) || nowIso()
      }
    };
  }

  function migrate(parsed) {
    var version = Number(parsed.version) || 1;
    if (version < 2) {
      if (!Array.isArray(parsed.setlists)) parsed.setlists = [];
      parsed.version = 2;
    }
    return parsed;
  }

  /** Carrega o estado. Retorna um estado válido mesmo se nada estiver salvo. */
  function load() {
    try {
      var raw = global.localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      var parsed = migrate(JSON.parse(raw));
      // Garante a forma mínima esperada (migração defensiva) e aplica a
      // mesma sanitização da importação. Isso protege dados antigos salvos
      // antes da validação de URLs/limites existir.
      var shape = {
        version: parsed.version || SCHEMA_VERSION,
        singers: Array.isArray(parsed.singers) ? parsed.singers : [],
        songs: Array.isArray(parsed.songs) ? parsed.songs : [],
        sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
        setlists: Array.isArray(parsed.setlists) ? parsed.setlists : [],
        createdAt: parsed.createdAt || nowIso()
      };
      var clean = sanitizeState(shape);
      if (clean.ok) return clean.state;
      console.warn('Dados locais inválidos; iniciando um estado vazio.', clean.error);
      return defaultState();
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

  function estimateSize(state) {
    try {
      return new Blob([JSON.stringify(state)]).size;
    } catch (e) {
      return JSON.stringify(state).length;
    }
  }

  global.Store = {
    STORAGE_KEY: STORAGE_KEY,
    SCHEMA_VERSION: SCHEMA_VERSION,
    LIMITS: LIMITS,
    defaultState: defaultState,
    load: load,
    save: save,
    replaceAll: replaceAll,
    clear: clear,
    generateId: generateId,
    safeUrl: safeUrl,
    text: text,
    sanitizeState: sanitizeState,
    estimateSize: estimateSize
  };
})(window);
