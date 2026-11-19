/* =========================================================================
 * app.js — Controlador da aplicação (SPA)
 * Gerencia estado, renderização das telas e interações do usuário.
 * ========================================================================= */
(function () {
  'use strict';

  var state = Store.load();
  var currentView = 'dashboard';
  var modalSubmitHandler = null;
  var modalToken = 0; // invalida retornos assíncronos de modais já fechados
  var searchTerm = '';
  var songFilters = { singer: '', genre: '', dueOnly: false, sort: 'title', dir: 'asc' };
  var repertoireTab = 'songs';
  var currentSongId = null;
  var currentVideoId = null;
  var lastFocusedElement = null;
  var enrichmentTokens = Object.create(null);

  // Estado transitório do fluxo de prática
  var practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null };
  var practiceSearchTerm = '';

  // Paleta de comandos e modo palco
  var paletteState = { open: false, items: [], index: 0, previousFocus: null };
  var stageState = { open: false, songId: null, auto: false, timer: null, font: 2 };

  // Estado transitório da foto no formulário de cantor
  var photoDraft = null;
  var photoSearchToken = 0;
  var photoLastQuery = '';

  var KEY_NAMES = {
    'C': 'Dó maior', 'C#': 'Dó# maior', 'D': 'Ré maior', 'D#': 'Ré# maior',
    'E': 'Mi maior', 'F': 'Fá maior', 'F#': 'Fá# maior', 'G': 'Sol maior',
    'G#': 'Sol# maior', 'A': 'Lá maior', 'A#': 'Lá# maior', 'B': 'Si maior',
    'Cm': 'Dó menor', 'C#m': 'Dó# menor', 'Dm': 'Ré menor', 'D#m': 'Ré# menor',
    'Em': 'Mi menor', 'Fm': 'Fá menor', 'F#m': 'Fá# menor', 'Gm': 'Sol menor',
    'G#m': 'Sol# menor', 'Am': 'Lá menor', 'A#m': 'Lá# menor', 'Bm': 'Si menor'
  };

  /* --------------------------- Utilitários --------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }

  // Ícones do sprite inline em index.html (sem dependências, herdam currentColor).
  function icon(name, cls) {
    return '<svg class="icon' + (cls ? ' ' + cls : '') + '" aria-hidden="true" focusable="false">' +
      '<use href="#i-' + name + '"></use></svg>';
  }

  function dateLabel() {
    var txt = new Date().toLocaleDateString('pt-BR', {
      weekday: 'long', day: 'numeric', month: 'long'
    });
    return txt.charAt(0).toUpperCase() + txt.slice(1);
  }

  function markLetter(i) {
    return String.fromCharCode(65 + (i % 26));
  }

  // Dica discreta: só aparece no hover/foco do ícone de informação.
  function tip(text) {
    return '<span class="tip" tabindex="0" role="img" aria-label="Dica: ' + escapeHtml(text) + '">' +
      icon('info') + '<span class="tip-body" role="tooltip">' + escapeHtml(text) + '</span></span>';
  }

  var CIRCLE_MAJOR = ['C', 'G', 'D', 'A', 'E', 'B', 'F#', 'C#', 'G#', 'D#', 'A#', 'F'];
  var CIRCLE_MINOR = ['Am', 'Em', 'Bm', 'F#m', 'C#m', 'G#m', 'D#m', 'A#m', 'Fm', 'Cm', 'Gm', 'Dm'];

  // Círculo das quintas gerado em SVG: sem imagem externa e sempre fiel ao tom da música.
  function circleOfFifthsSvg(key) {
    var isMinor = !!key && /m$/.test(key);
    var index = isMinor ? CIRCLE_MINOR.indexOf(key) : CIRCLE_MAJOR.indexOf(key);
    var cx = 100, cy = 100;

    function point(angle, radius) {
      var rad = (angle - 90) * Math.PI / 180;
      return [cx + Math.cos(rad) * radius, cy + Math.sin(rad) * radius];
    }
    function wedge(r1, r2, start, end) {
      var a = point(start, r2), b = point(end, r2), c = point(end, r1), d = point(start, r1);
      return 'M' + a[0].toFixed(2) + ' ' + a[1].toFixed(2) +
        ' A' + r2 + ' ' + r2 + ' 0 0 1 ' + b[0].toFixed(2) + ' ' + b[1].toFixed(2) +
        ' L' + c[0].toFixed(2) + ' ' + c[1].toFixed(2) +
        ' A' + r1 + ' ' + r1 + ' 0 0 0 ' + d[0].toFixed(2) + ' ' + d[1].toFixed(2) + ' Z';
    }

    var svg = '<svg class="cf-svg" viewBox="0 0 200 200" role="img" ' +
      'aria-label="' + (key ? 'Círculo das quintas com o tom ' + escapeHtml(key) + ' destacado' : 'Círculo das quintas') + '">';
    if (key) svg += '<title>Círculo das quintas — tom ' + escapeHtml(key) + '</title>';

    for (var i = 0; i < 12; i++) {
      var start = i * 30 - 15, end = i * 30 + 15;
      [[64, 92, CIRCLE_MAJOR[i], 'cf-major'], [32, 62, CIRCLE_MINOR[i], 'cf-minor']].forEach(function (ring) {
        var active = index === i;
        var lp = point(i * 30, (ring[0] + ring[1]) / 2);
        svg += '<g class="cf-cell' + (active ? ' active' : '') + '">' +
          '<path d="' + wedge(ring[0], ring[1], start, end) + '"></path>' +
          '<text x="' + lp[0].toFixed(2) + '" y="' + lp[1].toFixed(2) + '">' + escapeHtml(ring[2]) + '</text></g>';
      });
    }

    svg += '<circle class="cf-center" cx="100" cy="100" r="30"></circle>' +
      '<text class="cf-center-label" x="100" y="97">' + (key ? escapeHtml(key) : '—') + '</text>' +
      '<text class="cf-center-caption" x="100" y="112">TOM</text></svg>';
    return svg;
  }

  function keyCaption(key) {
    if (!key) return 'Sem tom definido nesta música. Cadastre um tom para destacá-lo no círculo.';
    var isMinor = /m$/.test(key);
    var index = isMinor ? CIRCLE_MINOR.indexOf(key) : CIRCLE_MAJOR.indexOf(key);
    if (index < 0) return 'Tom ' + key + ' — não mapeado no círculo das quintas.';
    var relative = isMinor ? CIRCLE_MAJOR[index] : CIRCLE_MINOR[index];
    return 'Tom ' + key + ' (' + (KEY_NAMES[key] || '') + '). Tonalidade relativa: ' +
      relative + ' (' + (KEY_NAMES[relative] || '') + ').';
  }

  function practiceUnits(song) {
    return song.sections && song.sections.length
      ? song.sections
      : [{ id: 'full', name: 'Música inteira', confidence: 3 }];
  }

  function nextUnratedUnit(units, fromId) {
    var idx = 0;
    for (var i = 0; i < units.length; i++) if (units[i].id === fromId) { idx = i; break; }
    for (var k = 1; k <= units.length; k++) {
      var candidate = units[(idx + k) % units.length];
      if (practice.ratings[candidate.id] == null) return candidate.id;
    }
    return fromId;
  }

  function focusRating(unitId, q) {
    var buttons = document.querySelectorAll('.rating-btn[data-unit][data-q]');
    for (var i = 0; i < buttons.length; i++) {
      if (buttons[i].dataset.unit === unitId && buttons[i].dataset.q === String(q)) {
        try { buttons[i].focus({ preventScroll: true }); } catch (e) { buttons[i].focus(); }
        return;
      }
    }
  }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function safeUrl(v, allowImageData) {
    return Store.safeUrl(v, allowImageData);
  }

  function norm(v) {
    return String(v || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();
  }

  function keyDisplayName(symbol) {
    if (!symbol) return '';
    return KEY_NAMES[String(symbol).trim()] || '';
  }

  // Chave legada preservada para não perder a preferência de tema do usuário.
  var THEME_KEY = 'repertorio_theme';
  var themeMedia = globalMatchMedia();

  function globalMatchMedia() {
    return window.matchMedia ? window.matchMedia('(prefers-color-scheme: dark)') : null;
  }

  function systemTheme() {
    return themeMedia && themeMedia.matches ? 'dark' : 'light';
  }

  function applyTheme(theme, persist) {
    document.documentElement.setAttribute('data-theme', theme);
    var btn = $('#themeToggle');
    if (btn) {
      var iconName = theme === 'dark' ? 'sun' : 'moon';
      btn.innerHTML = icon(iconName);
      btn.title = 'Tema ' + (theme === 'dark' ? 'noturno' : 'claro') + ' — clique para alternar';
      btn.setAttribute('aria-label', 'Ativar tema ' + (theme === 'dark' ? 'claro' : 'escuro'));
      btn.setAttribute('aria-pressed', theme === 'dark' ? 'true' : 'false');
    }
    if (persist !== false) {
      try { localStorage.setItem(THEME_KEY, theme); } catch (e) { /* ignore */ }
    }
  }

  function toast(msg) {
    var t = $('#toast');
    t.textContent = msg;
    t.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.hidden = true; }, 3200);
  }

  function save() {
    if (!Store.save(state)) {
      toast('Não foi possível salvar: armazenamento cheio. Exporte um backup e remova algumas fotos.');
      return false;
    }
    return true;
  }

  /**
   * Sincronização entre abas: recarrega o estado salvo por outra aba.
   * Nunca interrompe um formulário aberto; nesse caso, aplica ao fechar.
   */
  var externalStatePending = false;
  var externalSyncTimer = null;

  function applyExternalState() {
    externalStatePending = false;
    state = Store.load();
    state.songs.forEach(ensureCard);
    if (currentView === 'song' && !getSong(currentSongId)) currentView = 'songs';
    if (practice.songId && !getSong(practice.songId)) {
      practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null };
    }
    render();
    toast('Dados sincronizados a partir de outra aba.');
  }

  window.addEventListener('storage', function (e) {
    if (e.key !== Store.STORAGE_KEY && e.key !== null) return;
    clearTimeout(externalSyncTimer);
    externalSyncTimer = setTimeout(function () {
      if (!$('#modalOverlay').hidden) externalStatePending = true;
      else applyExternalState();
    }, 200);
  });

  function getSinger(id) {
    return state.singers.find(function (x) { return x.id === id; });
  }

  function singerName(id) {
    var s = getSinger(id);
    return s ? s.name : '—';
  }

  function singerHasPhoto(sg) { return !!(sg && (sg.photo || sg.photoUrl)); }

  /** Avatar do cantor (foto armazenada em base64, ou URL remota como fallback). */
  function avatarHtml(singer, size) {
    size = size || 48;
    var src = safeUrl(singer && (singer.photo || singer.photoUrl), true);
    var style = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0';
    if (!src) {
      var initial = singer && singer.name ? singer.name.charAt(0).toUpperCase() : '?';
      return '<span class="avatar avatar-placeholder" style="' + style + '">' + escapeHtml(initial) + '</span>';
    }
    return '<img class="avatar" style="' + style + '" src="' + escapeHtml(src) +
      '" alt="Foto de ' + escapeHtml(singer.name) + '" loading="lazy">';
  }

  function getSong(id) {
    return state.songs.find(function (x) { return x.id === id; });
  }

  function ensureCard(song) {
    if (!song.card) song.card = SRS.newCard(song.id);
    song.card.songId = song.id;
    if (!Array.isArray(song.sections)) song.sections = [];
    return song.card;
  }

  /** Atualiza a tela atual se ela mostra a música informada. */
  function refreshSongView(songId) {
    if (currentView === 'song' && currentSongId === songId) render();
    else if (currentView === 'songs' || currentView === 'dashboard') render();
  }

  /**
   * Enriquecimento em segundo plano: tom/duração e letra.
   * Nunca bloqueia o salvamento e nunca sobrescreve valores preenchidos
   * manualmente nem dados de outra música.
   */
  function enrichSong(song, options) {
    if (!song) return Promise.resolve(null);
    options = options || {};
    var wantKey = options.key !== false && !song.key;
    var wantLyrics = options.lyrics !== false && !song.lyrics;
    if (!wantKey && !wantLyrics) return Promise.resolve(null);

    var songId = song.id;
    var title = song.title;
    var singerId = song.singerId;
    var singer = singerId ? singerName(singerId) : '';
    var token = Store.generateId('enrich');
    enrichmentTokens[songId] = token;

    if (wantKey) song.keyPending = true;
    if (wantLyrics) song.lyricsPending = true;
    save();
    refreshSongView(songId);

    var keyPromise = wantKey ? SongKey.search(singer, title).catch(function () { return null; }) : Promise.resolve(null);
    var lyricsPromise = wantLyrics ? SongLyrics.search(singer, title).catch(function () { return null; }) : Promise.resolve(null);

    return Promise.all([keyPromise, lyricsPromise]).then(function (res) {
      var current = getSong(songId);
      if (!current || enrichmentTokens[songId] !== token) return null;
      current.keyPending = false;
      current.lyricsPending = false;

      if (current.title !== title || current.singerId !== singerId) {
        save();
        refreshSongView(songId);
        return null;
      }

      var changed = false;
      var keyResult = res[0];
      if (wantKey && keyResult) {
        if (keyResult.key && !current.key) {
          current.key = keyResult.key;
          current.keyName = keyResult.keyName || keyDisplayName(keyResult.key);
          current.keySource = keyResult.keySource || 'Estimativa automática';
          changed = true;
        }
        if (keyResult.durationMin && !current.duration) {
          current.duration = keyResult.durationMin;
          changed = true;
        }
      }

      var lyricsResult = res[1];
      if (wantLyrics && lyricsResult && lyricsResult.lyrics && !current.lyrics) {
        current.lyrics = Store.text(lyricsResult.lyrics, Store.LIMITS.lyrics);
        current.lyricsSource = lyricsResult.source || 'Internet';
        changed = true;
      }

      save();
      refreshSongView(songId);
      if (changed) toast('Dados complementares atualizados.');
      return changed ? { key: current.key, lyrics: current.lyrics } : null;
    }).catch(function () {
      var current = getSong(songId);
      if (current && enrichmentTokens[songId] === token) {
        current.keyPending = false;
        current.lyricsPending = false;
        save();
        refreshSongView(songId);
      }
      return null;
    });
  }

  /**
   * Busca foto/gênero/biografia em segundo plano, preservando dados já
   * preenchidos manualmente e descartando respostas de um nome antigo.
   */
  function enrichSinger(singer, expectedName) {
    if (!singer) return Promise.resolve(null);
    var singerId = singer.id;
    var name = expectedName || singer.name;
    var token = Store.generateId('photo');
    enrichmentTokens['singer:' + singerId] = token;
    singer.photoPending = true;
    save();
    if (currentView === 'singers') render();

    return ArtistPhoto.fetchInfo(name).then(function (info) {
      var current = getSinger(singerId);
      if (!current || enrichmentTokens['singer:' + singerId] !== token) return null;
      current.photoPending = false;
      if (current.name !== name) {
        save();
        if (currentView === 'singers') render();
        return null;
      }
      if (info) {
        if (!current.photo && !current.photoUrl) {
          current.photo = info.dataUrl || null;
          current.photoUrl = info.url || null;
          current.photoSource = info.source || null;
        }
        if (!current.genre && info.genre) current.genre = info.genre;
        if (!current.notes && info.bio) current.notes = info.bio;
      }
      current.photoMissing = !(current.photo || current.photoUrl);
      current.photoUpdatedAt = new Date().toISOString();
      save();
      if (currentView === 'singers') render();
      return info;
    }).catch(function () {
      var current = getSinger(singerId);
      if (current && enrichmentTokens['singer:' + singerId] === token) {
        current.photoPending = false;
        current.photoMissing = !(current.photo || current.photoUrl);
        save();
        if (currentView === 'singers') render();
      }
      return null;
    });
  }

  function dueSongs() {
    return state.songs.filter(function (s) { return SRS.isDue(ensureCard(s)); });
  }

  function formatDay(day) {
    if (day == null) return '—';
    var d = new Date(day * SRS.MS_PER_DAY);
    return d.toLocaleDateString('pt-BR', {
      timeZone: 'UTC', day: '2-digit', month: 'short', year: 'numeric'
    });
  }

  function daysUntil(day) {
    return day - SRS.todayIndex();
  }

  function dueLabel(card) {
    var diff = daysUntil(card.due);
    if (diff < 0) return 'Atrasada (' + Math.abs(diff) + 'd)';
    if (diff === 0) return 'Para hoje';
    return 'Em ' + SRS.formatInterval(diff);
  }

  function difficultyStars(n) {
    var s = Number(n) || 1;
    var out = '';
    for (var i = 1; i <= 5; i++) out += '<span style="color:' + (i <= s ? 'var(--warning)' : 'var(--border)') + '">&#9733;</span>';
    return out;
  }

  function computeStreak() {
    if (!state.sessions.length) return 0;
    var days = {};
    state.sessions.forEach(function (s) { if (s.day != null) days[s.day] = true; });
    var day = SRS.todayIndex();
    if (!days[day]) day--; // permite que o streak ainda conte se ainda não praticou hoje
    var count = 0;
    while (days[day]) { count++; day--; }
    return count;
  }

  function avgMastery() {
    if (!state.songs.length) return 0;
    var sum = state.songs.reduce(function (a, s) { return a + SRS.mastery(ensureCard(s)); }, 0);
    return Math.round(sum / state.songs.length);
  }

  function updateBadge() {
    var n = dueSongs().length;
    var b = $('#navDue');
    b.textContent = n;
    b.classList.toggle('cheio', n > 0);
  }

  /* --------------------------- Modal --------------------------- */
  function openModal(opts) {
    modalToken++;
    lastFocusedElement = document.activeElement;
    var submit = $('#modalSubmit');
    submit.disabled = false;   // nunca herda o estado "carregando" do modal anterior
    submit.hidden = false;
    submit.textContent = opts.submitLabel || 'Salvar';
    $('#modalTitle').textContent = opts.title;
    $('#modalBody').innerHTML = opts.bodyHtml || '';
    modalSubmitHandler = opts.onSubmit || null;
    $('#modalOverlay').hidden = false;
    document.body.classList.add('modal-open');
    var first = $('#modalBody input, #modalBody select, #modalBody textarea');
    setTimeout(function () {
      if (first && document.contains(first)) first.focus();
      else {
        var modal = $('.modal');
        if (modal) modal.focus();
      }
    }, 30);
  }

  function closeModal() {
    modalToken++;              // retornos pendentes de modais antigos são ignorados
    photoSearchToken++;
    $('#modalOverlay').hidden = true;
    document.body.classList.remove('modal-open');
    modalSubmitHandler = null;
    var submit = $('#modalSubmit');
    submit.disabled = false;
    if (lastFocusedElement && document.contains(lastFocusedElement) &&
        typeof lastFocusedElement.focus === 'function') {
      lastFocusedElement.focus();
    }
    lastFocusedElement = null;
    if (externalStatePending) applyExternalState();
  }

  function trapModalFocus(e) {
    if (e.key !== 'Tab' || $('#modalOverlay').hidden) return;
    var modal = $('.modal');
    if (!modal) return;
    var focusables = Array.prototype.filter.call(
      modal.querySelectorAll('a[href], button:not([disabled]), input:not([disabled]), ' +
        'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
      function (el) { return el.offsetParent !== null || el === document.activeElement; }
    );
    if (!focusables.length) {
      e.preventDefault();
      modal.focus();
      return;
    }
    var first = focusables[0];
    var last = focusables[focusables.length - 1];
    if (e.shiftKey && (document.activeElement === first || !modal.contains(document.activeElement))) {
      e.preventDefault();
      last.focus();
    } else if (!e.shiftKey && document.activeElement === last) {
      e.preventDefault();
      first.focus();
    }
  }

  $('#modalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (typeof modalSubmitHandler === 'function') modalSubmitHandler(e);
  });

  /* --------------------------- Navegação --------------------------- */
  var viewMeta = {
    dashboard: { title: 'Hoje', sub: 'O que praticar agora' },
    songs: { title: 'Repertório', sub: 'Músicas e cantores do seu repertório' },
    singers: { title: 'Cantores', sub: 'Os intérpretes do seu repertório' },
    stage: { title: 'Palco', sub: 'Letra grande, rolagem e navegação para tocar ao vivo' },
    practice: { title: 'Ensaios', sub: 'Prática espaçada, uma música por vez' },
    song: { title: 'Música', sub: 'Resumo e vídeos da música' },
    method: { title: 'Como funciona', sub: 'O método por trás do sistema de revisões' },
    data: { title: 'Ajustes', sub: 'Backup, armazenamento e dados de teste' }
  };

  function navigate(view) {
    if (!viewMeta[view]) return;
    currentView = view;
    // A ficha da música e a lista de cantores vivem dentro do Repertório.
    var navView = (view === 'song' || view === 'singers') ? 'songs' : (view === 'method' ? 'practice' : view);
    var activeNav = null;
    document.querySelectorAll('.nav-item').forEach(function (b) {
      var active = b.dataset.view === navView;
      b.classList.toggle('active', active);
      if (active) {
        b.setAttribute('aria-current', 'page');
        activeNav = b;
      } else {
        b.removeAttribute('aria-current');
      }
    });
    // Em telas estreitas a navegação rola na horizontal; mantém o item ativo visível.
    if (activeNav && activeNav.scrollIntoView) {
      try { activeNav.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (err) { /* ignore */ }
    }
    $('#viewTitle').textContent = viewMeta[view].title;
    $('#viewSubtitle').textContent = viewMeta[view].sub;
    var eyebrow = $('#viewEyebrow');
    if (eyebrow) {
      if (view === 'dashboard') {
        eyebrow.hidden = false;
        eyebrow.textContent = dateLabel();
      } else {
        eyebrow.hidden = true;
        eyebrow.textContent = '';
      }
    }
    render();
    window.scrollTo(0, 0);
    var heading = currentView === 'song' ? $('#viewContainer h1') : $('#viewTitle');
    if (heading) {
      heading.setAttribute('tabindex', '-1');
      try { heading.focus({ preventScroll: true }); } catch (err) { heading.focus(); }
    }
  }

  function render() {
    var container = $('#viewContainer');
    var actions = $('#topbarActions');
    actions.innerHTML = '';
    var pageHead = $('.page-head');
    if (pageHead) pageHead.hidden = (currentView === 'song'); // resumo tem cabeçalho próprio
    switch (currentView) {
      case 'dashboard': renderDashboard(container, actions); break;
      case 'singers': renderSingers(container, actions); break;
      case 'songs': renderSongs(container, actions); break;
      case 'stage': renderStage(container, actions); break;
      case 'practice': renderPractice(container, actions); break;
      case 'song': renderSongSummary(container, actions); break;
      case 'method': renderMethod(container, actions); break;
      case 'data': renderData(container, actions); break;
    }
    updateBadge();
  }

  /* =========================== RESUMO =========================== */
  // Quantidade de semanas do calendário conforme o espaço disponível.
  function dashboardWeeks() {
    var w = window.innerWidth;
    if (w < 400) return 16;
    if (w < 760) return 20;
    if (w < 1100) return 26;
    return 52;
  }

  // Trechos mais frágeis do repertório, no máximo um por música.
  function weakestUnits(limit) {
    var units = [];
    state.songs.forEach(function (s) {
      var card = ensureCard(s);
      (s.sections || []).forEach(function (u, i) {
        if (!u || !u.name) return;
        var conf = Number(u.confidence);
        if (!isFinite(conf)) conf = 3;
        if (conf > 3) return;
        units.push({
          song: s, card: card, section: u, confidence: conf,
          mastery: SRS.mastery(card), mark: markLetter(i)
        });
      });
    });
    units.sort(function (a, b) {
      return a.confidence - b.confidence || a.mastery - b.mastery;
    });
    var seen = Object.create(null);
    units = units.filter(function (u) {
      if (seen[u.song.id]) return false;
      seen[u.song.id] = true;
      return true;
    });
    if (!units.length) {
      dueSongs().slice(0, limit).forEach(function (song) {
        var card = ensureCard(song);
        units.push({
          song: song, card: card, section: null, confidence: 0,
          mastery: SRS.mastery(card), mark: 'A'
        });
      });
    }
    return units.slice(0, limit);
  }

  function readinessBar(pct) {
    pct = Math.max(4, Math.min(100, Math.round(pct || 0)));
    return '<div class="readiness' + (pct >= 70 ? ' good' : '') + '" role="img" aria-label="Domínio ' +
      pct + '%"><span style="width:' + pct + '%"></span></div>';
  }

  function renderDashboard(container, actions) {
    var due = dueSongs();
    var weak = weakestUnits(3);
    var minutes = Math.max(6, weak.length * 4);

    actions.innerHTML = '<button class="btn" data-action="goto-songs">' + icon('library') + ' Repertório</button>' +
      '<button class="btn btn-primary" data-action="add-song">' + icon('plus') + ' Música</button>';

    var html = '<section class="hero">' +
      '<div class="hero-main">' +
      '<p class="hero-eyebrow">' + (weak.length ? 'Sugestão de hoje' : 'Sem pendências') + '</p>' +
      '<h2>' + (weak.length ? 'Seu ensaio de hoje' : 'Tudo em dia por aqui') + '</h2>' +
      '<p class="hero-sub">' + (weak.length
        ? weak.length + (weak.length === 1 ? ' trecho' : ' trechos') + ' · cerca de ' + minutes +
          ' min · cante sem consultar a letra'
        : 'Nenhum trecho frágil ou revisão pendente. Escolha uma música para manter o ritmo.') + '</p>' +
      '<div class="staff" aria-hidden="true"></div>';

    if (weak.length) {
      html += '<div class="units">' + weak.map(function (u) {
        return '<div class="unit-row">' +
          '<span class="unit-mark" aria-hidden="true">' + u.mark + '</span>' +
          '<div class="unit-body">' +
          '<div class="unit-title">' +
          (u.section ? escapeHtml(u.section.name) + ' · ' + escapeHtml(u.song.title) : escapeHtml(u.song.title)) +
          '</div>' +
          '<div class="unit-meta">' + escapeHtml(singerName(u.song.singerId)) +
          (u.section ? ' · confiança ' + u.confidence + '/5' : ' · ' + dueLabel(u.card)) +
          ' · ' + SRS.mastery(u.card) + '% de domínio</div></div>' +
          '<div class="unit-bars">' + readinessBar(u.mastery) + '</div>' +
          '</div>';
      }).join('') + '</div>' +
      '<div class="hero-cta">' +
      '<button class="btn btn-primary" data-action="practice-song" data-id="' + escapeHtml(weak[0].song.id) + '">' +
      icon('play') + ' Começar ensaio</button>' +
      '<button class="btn" data-action="goto-practice">Ver todos os ensaios</button>' +
      '</div>';
    } else {
      html += '<div class="hero-cta"><button class="btn btn-primary" data-action="goto-songs">' +
        icon('library') + ' Abrir repertório</button></div>';
    }
    html += '</div>';

    html += '<aside class="hero-aside">' +
      '<div class="hero-stat"><span>Músicas</span><strong>' + state.songs.length + '</strong></div>' +
      '<div class="hero-stat"><span>Revisões pendentes</span><strong' +
      (due.length ? ' style="color:var(--accent)"' : '') + '>' + due.length + '</strong></div>' +
      '<div class="hero-stat"><span>Domínio médio</span><strong>' + avgMastery() + '%</strong></div>' +
      '<div class="hero-stat"><span>Sequência</span><strong>' + computeStreak() + 'd</strong></div>' +
      '<button class="btn btn-sm btn-ghost hero-cmd" data-action="open-palette">' +
      icon('search') + ' Buscar ou comandar <kbd>Ctrl K</kbd></button>' +
      '</aside></section>';

    html += '<div class="panel"><h3>Atividade</h3>' +
      activityCalendar(allActivityEvents(), dashboardWeeks()) + '</div>';

    html += '<div class="dashboard-grid"><div class="dashboard-main">';

    html += '<div class="section"><h2 class="section-title">Prontidão por música</h2>';
    if (!state.songs.length) {
      html += '<div class="empty"><span class="empty-mark">' + icon('music') + '</span>' +
        'Seu repertório está vazio. Adicione a primeira música.</div>';
    } else {
      var ranked = state.songs.map(function (song) {
        var card = ensureCard(song);
        return { song: song, card: card, mastery: SRS.mastery(card) };
      }).sort(function (a, b) { return a.mastery - b.mastery; }).slice(0, 6);
      html += '<div class="ready-list">' + ranked.map(function (r) {
        return '<div class="ready-row">' +
          '<div class="ready-main">' +
          '<button type="button" class="song-name-link" data-action="open-song" data-id="' + escapeHtml(r.song.id) + '">' +
          '<span class="song-title-text">' + escapeHtml(r.song.title) + '</span></button>' +
          '<div class="ready-meta">' + escapeHtml(singerName(r.song.singerId)) +
          ' · ' + dueLabel(r.card) + '</div></div>' +
          '<div class="ready-bar">' + readinessBar(r.mastery) + '</div>' +
          '<span class="ready-pct">' + r.mastery + '%</span>' +
          '</div>';
      }).join('') + '</div>';
    }
    html += '</div></div>';

    var sessions = state.sessions.slice().sort(function (a, b) {
      return (Date.parse(b.date) || 0) - (Date.parse(a.date) || 0);
    }).slice(0, 5);

    html += '<aside class="dashboard-side">';
    html += '<div class="section"><h2 class="section-title">Últimos ensaios</h2>';
    if (!sessions.length) {
      html += '<div class="empty"><span class="empty-mark">' + icon('practice') + '</span>' +
        'Nenhuma sessão registrada.</div>';
    } else {
      html += '<div class="session-list">' + sessions.map(function (session) {
        var title = session.songTitle || (getSong(session.songId) || {}).title || 'Música removida';
        return '<div class="session-row"><div class="session-main"><strong>' + escapeHtml(title) + '</strong>' +
          '<div class="session-meta">' + formatDateTime(session.date) +
          ' · Nota média ' + Number(session.avgQuality || 0).toFixed(1) + '/5' +
          ' · Novo intervalo: ' + SRS.formatInterval(session.newInterval) + '</div></div></div>';
      }).join('') + '</div>';
    }
    html += '</div>';

    html += '<div class="section"><h2 class="section-title">Atalhos</h2>' +
      '<div class="panel"><p class="small muted">Palco para tocar ao vivo, Ensaios para revisar e Repertório para organizar.</p>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:10px">' +
      '<button class="btn btn-sm" data-action="goto-stage">' + icon('stage') + ' Palco</button>' +
      '<button class="btn btn-sm" data-action="goto-practice">' + icon('practice') + ' Ensaios</button>' +
      '</div></div></div>';
    html += '</aside></div>';

    container.innerHTML = html;
  }

  function statCard(label, value, tone) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value' + (tone ? ' ' + tone : '') + '">' + value + '</div></div>';
  }

  /* =========================== CANTORES =========================== */
  function singersMarkup() {
    if (!state.singers.length) {
      return '<div class="empty"><span class="empty-mark">' + icon('users') + '</span>' +
        'Nenhum cantor cadastrado. Os cantores aparecem aqui e nos filtros do repertório.</div>';
    }
    var html = '<div class="singer-list">';
    state.singers.forEach(function (sg) {
      var count = state.songs.filter(function (s) { return s.singerId === sg.id; }).length;
      var pending = !!sg.photoPending;
      html += '<div class="singer-row"><button type="button" class="singer-head clickable" ' +
        'title="Ver músicas de ' + escapeHtml(sg.name) + '" data-action="filter-singer" data-id="' + escapeHtml(sg.id) + '">' +
        avatarHtml(sg, 44) +
        '<span class="singer-info"><strong>' + escapeHtml(sg.name) + '</strong>' +
        '<span class="small muted">' + count + (count === 1 ? ' música' : ' músicas') +
        (sg.genre ? ' · ' + escapeHtml(sg.genre) : '') + '</span>' +
        (pending ? '<span class="tag pending">Buscando foto...</span>' :
          (!singerHasPhoto(sg) ? '<span class="tag warning">' + icon('alert', 'icon-sm') + ' ' +
            (sg.photoMissing ? 'Foto não encontrada' : 'Sem foto') + '</span>' : '')) +
        '</span></button>' +
        '<div class="singer-actions">' +
        (!singerHasPhoto(sg) && !pending ? '<button class="btn btn-sm" data-action="retry-photo" data-id="' + escapeHtml(sg.id) + '">Tentar foto</button>' : '') +
        '<button class="btn btn-sm" data-action="edit-singer" data-id="' + escapeHtml(sg.id) + '">' + icon('edit') + ' Editar</button>' +
        '<button class="btn btn-sm btn-danger" data-action="delete-singer" data-id="' + escapeHtml(sg.id) + '">' + icon('trash') + ' Excluir</button>' +
        '</div></div>';
    });
    html += '</div>';
    return html;
  }

  function renderSingers(container, actions) {
    actions.innerHTML = '<button class="btn btn-primary" data-action="add-singer">' + icon('plus') + ' Cantor</button>';
    container.innerHTML = singersMarkup();
  }

  function setPhotoStatus(msg) {
    var el = $('#photoStatus');
    if (el) el.textContent = msg;
  }

  function applyPhotoDraft() {
    var f = $('#modalForm');
    if (!f) return;
    f.elements.photoData.value = (photoDraft && photoDraft.dataUrl) || '';
    f.elements.photoUrl.value = (photoDraft && photoDraft.url) || '';
    f.elements.photoSource.value = (photoDraft && photoDraft.source) || '';
    var preview = $('#photoPreview');
    if (preview) {
      var src = safeUrl(photoDraft && (photoDraft.dataUrl || photoDraft.url), true);
      preview.innerHTML = src
        ? '<img src="' + escapeHtml(src) + '" alt="Prévia da foto">'
        : icon('users');
    }
    var genreEl = $('#autoGenre');
    if (genreEl) genreEl.textContent = (photoDraft && photoDraft.genre) || '—';
    var bioEl = $('#autoBio');
    if (bioEl) bioEl.textContent = (photoDraft && photoDraft.bio) ||
      'Não foi possível obter a biografia automaticamente.';
  }

  /** Busca foto, gênero e biografia do artista. force=true força nova consulta. */
  function searchPhoto(force, nameOverride, fromTyping) {
    var f = $('#modalForm');
    if (!f) return Promise.resolve(null);
    var name = (nameOverride != null ? nameOverride : f.elements.name.value).trim();
    if (!name) { setPhotoStatus('Digite o nome do cantor para buscar os dados.'); return Promise.resolve(null); }

    var hasPhoto = photoDraft && (photoDraft.dataUrl || photoDraft.url);
    if (!force && hasPhoto) return Promise.resolve(null);
    // Ao digitar, evita repetir a busca se o nome não mudou desde a última tentativa.
    if ((!force || fromTyping) && name === photoLastQuery &&
        (hasPhoto || (photoDraft && photoDraft.missing))) return Promise.resolve(null);
    photoLastQuery = name;

    var token = ++photoSearchToken;
    setPhotoStatus('Buscando dados de "' + name + '" na internet...');
    var btn = $('[data-action=search-photo]');
    if (btn) btn.disabled = true;

    return ArtistPhoto.fetchInfo(name).then(function (r) {
      if (token !== photoSearchToken) return null; // nome mudou durante a busca
      if (!r || (!r.url && !r.genre && !r.bio)) {
        photoDraft = { dataUrl: null, url: null, source: null, genre: '', bio: '', missing: true, queryName: name };
        applyPhotoDraft();
        setPhotoStatus('Nenhum dado encontrado para "' + name + '". Um aviso será exibido no cadastro.');
        return null;
      }
      r.missing = !r.url;
      r.queryName = name;
      photoDraft = r;
      applyPhotoDraft();
      setPhotoStatus('Dados obtidos: ' +
        (r.source ? r.source + ', ' : '') +
        (r.genre ? 'gênero "' + r.genre + '"' : 'gênero não disponível') +
        (r.dataUrl ? ' · foto armazenada.' : (r.url ? ' · foto por URL.' : ' · sem foto.')));
      return r;
    }).catch(function (e) {
      if (token === photoSearchToken) {
        photoDraft = { dataUrl: null, url: null, source: null, genre: '', bio: '', missing: true, queryName: name };
        applyPhotoDraft();
        setPhotoStatus('Não foi possível buscar os dados (' + e.message + '). Um aviso será exibido no cadastro.');
      }
      return null;
    }).then(function (r) {
      var b = $('[data-action=search-photo]');
      if (b) b.disabled = false;
      return r;
    });
  }

  function singerModal(existing, autoSearch, onSaved, prefillName) {
    var sg = existing || {};
    if (prefillName && !existing) sg = Object.assign({}, sg, { name: prefillName });
    photoDraft = {
      dataUrl: sg.photo || null,
      url: sg.photoUrl || null,
      source: sg.photoSource || null,
      genre: sg.genre || '',
      bio: sg.notes || '',
      missing: !!sg.photoMissing,
      queryName: sg.name || ''
    };
    photoSearchToken++;
    photoLastQuery = sg.name || '';

    var body =
      '<div class="callout accent"><strong>Preenchimento automático:</strong> informe apenas o nome. ' +
      'Enquanto você digita, buscamos foto, gênero e biografia na Wikipédia e na Apple Music.</div>' +
      '<div class="field"><label for="singerNameInput">Nome do artista *</label>' +
      '<input name="name" id="singerNameInput" required value="' + escapeHtml(sg.name || '') + '" placeholder="Ex.: Maria Bethânia"></div>' +
      '<div class="field"><label>Foto do artista <span class="auto-tag">automático</span></label>' +
      '<div class="photo-editor">' +
      '<div class="photo-preview" id="photoPreview">' + icon('users') + '</div>' +
      '<div class="small muted" id="photoStatus">Os dados serão buscados enquanto você digita.</div>' +
      '</div>' +
      '<input type="hidden" name="photoData"><input type="hidden" name="photoUrl"><input type="hidden" name="photoSource">' +
      '</div>' +
      '<div class="auto-field"><label>Gênero <span class="auto-tag">automático</span></label>' +
      '<div class="auto-value" id="autoGenre">—</div></div>' +
      '<div class="auto-field"><label>Biografia <span class="auto-tag">automático</span></label>' +
      '<div class="auto-value bio" id="autoBio">Não foi possível obter a biografia automaticamente.</div></div>';

    openModal({
      title: existing ? 'Editar cantor' : 'Novo cantor',
      bodyHtml: body,
      onSubmit: function (e) {
        var f = e.target;
        var name = f.elements.name.value.trim();
        if (!name) return;

        // Só reaproveita o rascunho se ele pertence ao nome atual. Caso
        // contrário, evita salvar foto/biografia de outro artista.
        var draftMatches = photoDraft && norm(photoDraft.queryName || '') === norm(name);
        var draft = draftMatches ? photoDraft : null;
        var nameChanged = !!(existing && norm(existing.name) !== norm(name));
        var inherited = existing && !nameChanged ? existing : {};

        var photo = {
          photo: (draft && draft.dataUrl) || inherited.photo || null,
          photoUrl: (draft && draft.url) || inherited.photoUrl || null,
          photoSource: (draft && draft.source) || inherited.photoSource || null,
          photoMissing: !((draft && (draft.dataUrl || draft.url)) ||
            inherited.photo || inherited.photoUrl),
          photoUpdatedAt: new Date().toISOString()
        };
        var common = {
          name: name,
          genre: (draft && draft.genre) || inherited.genre || '',
          notes: (draft && draft.bio) || inherited.notes || ''
        };

        var savedSinger;
        if (existing) {
          Object.assign(existing, common, photo);
          savedSinger = existing;
        } else {
          savedSinger = Object.assign({ id: Store.generateId('singer') }, common, photo);
          state.singers.push(savedSinger);
        }

        var needsEnrichment = (!photo.photo && !photo.photoUrl) || nameChanged ||
          !common.genre || !common.notes;
        save(); closeModal(); render();
        if (typeof onSaved === 'function') onSaved(savedSinger);
        else toast('Cantor salvo' + ((photo.photo || photo.photoUrl) ? ' com foto.' : '. Buscando dados...'));
        if (needsEnrichment) enrichSinger(savedSinger, name);
      }
    });

    applyPhotoDraft();
    var nameInput = $('#modalForm [name=name]');
    var typeTimer = null;
    if (nameInput) {
      // Busca enquanto o usuário digita (debounce de 600 ms após a última tecla).
      nameInput.addEventListener('input', function () {
        clearTimeout(typeTimer);
        var typed = nameInput.value.trim();
        if (typed.length < 3) {
          setPhotoStatus('Digite ao menos 3 letras para buscar os dados.');
          return;
        }
        setPhotoStatus('Aguardando você terminar de digitar...');
        typeTimer = setTimeout(function () {
          searchPhoto(true, typed, true);
        }, 600);
      });
      nameInput.addEventListener('blur', function () {
        clearTimeout(typeTimer);
        if (nameInput.value.trim()) searchPhoto(false);
      });
    }
    if ((autoSearch || prefillName) && sg.name) searchPhoto(true, sg.name);
  }

  /* =========================== MÚSICAS =========================== */
  function videoSearchUrl(song) {
    return song.youtubeSearchUrl || YouTube.songSearchUrl(song.title, singerName(song.singerId));
  }

  function formatDuration(min) {
    var total = Math.round(Number(min) * 60);
    if (!isFinite(total) || total <= 0) return '';
    return Math.floor(total / 60) + ':' + String(total % 60).padStart(2, '0');
  }

  function formatDateTime(iso) {
    if (!iso) return '—';
    var d = new Date(iso);
    if (isNaN(d.getTime())) return '—';
    return d.toLocaleString('pt-BR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
      hour: '2-digit', minute: '2-digit'
    });
  }

  // O YouTube rejeita embeds sem Referer (erro 153). Páginas file:// não enviam origem.
  function canEmbedYoutube() {
    return location.protocol === 'http:' || location.protocol === 'https:';
  }

  function playerPosterHtml(video) {
    var thumb = safeUrl(video && video.thumb);
    var href = safeUrl(video && video.url) || YouTube.watchUrl(video.id);
    return '<div class="player-poster">' +
      (thumb ? '<img src="' + escapeHtml(thumb) + '" alt="" loading="lazy">' : '') +
      '<a class="poster-play" href="' + escapeHtml(href) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="Assistir no YouTube">' + icon('play') + '</a>' +
      '<div class="poster-note">Abra o vídeo em uma nova aba para assistir</div>' +
      '</div>';
  }

  /** Eventos com dia e descrição: práticas e músicas adicionadas. */
  function allActivityEvents() {
    var events = [];
    state.sessions.forEach(function (s) {
      if (s.day != null) {
        events.push({ day: s.day, label: 'Prática: ' + (s.songTitle || 'música') });
      }
    });
    state.songs.forEach(function (s) {
      if (s.createdAt) {
        var d = new Date(s.createdAt);
        if (!isNaN(d.getTime())) events.push({ day: SRS.dayIndex(d), label: 'Adicionada: ' + s.title });
      }
    });
    return events;
  }

  function songActivityEvents(song) {
    var events = [];
    if (song.createdAt) {
      var d = new Date(song.createdAt);
      if (!isNaN(d.getTime())) events.push({ day: SRS.dayIndex(d), label: 'Música adicionada' });
    }
    state.sessions.forEach(function (s) {
      if (s.songId === song.id && s.day != null) {
        events.push({ day: s.day, label: 'Prática de ' + song.title });
      }
    });
    return events;
  }

  /** Grade de atividade estilo GitHub, com meses e detalhes no tooltip. */
  function activityCalendar(events, weeks) {
    weeks = weeks || 16;
    var byDay = {};
    (events || []).forEach(function (e) {
      if (e == null || e.day == null) return;
      (byDay[e.day] = byDay[e.day] || []).push(e.label);
    });

    var today = SRS.todayIndex();
    var start = today - (weeks * 7 - 1);
    start -= (start + 4) % 7; // alinha ao domingo
    var columns = Math.ceil((today - start + 1) / 7);
    var cells = '';
    var months = '';
    var lastMonth = -1;
    var lastMonthLabel = '';

    for (var d = start; d <= today; d++) {
      var labels = byDay[d] || [];
      var c = labels.length;
      var level = c === 0 ? 0 : c === 1 ? 1 : c === 2 ? 2 : c === 3 ? 3 : 4;
      var date = new Date(d * SRS.MS_PER_DAY);
      var newMonth = date.getUTCMonth() !== lastMonth;
      var firstOfMonth = newMonth && date.getUTCDate() <= 7;
      if (newMonth) lastMonth = date.getUTCMonth();
      var tip = date.toLocaleDateString('pt-BR', { timeZone: 'UTC' }) + ' · ' +
        (c ? c + (c === 1 ? ' atividade' : ' atividades') : 'sem atividade') +
        (c ? '&#10;' + labels.map(escapeHtml).join('&#10;') : '');
      cells += '<span class="cal-cell l' + level + (firstOfMonth ? ' cal-month-start' : '') +
        '" title="' + tip + '"></span>';
    }
    var total = today - start + 1;
    while (total % 7 !== 0) { cells += '<span class="cal-cell cal-pad"></span>'; total++; }

    var monthMarks = [];
    for (var i = 0; i < columns; i++) {
      var md = new Date((start + i * 7) * SRS.MS_PER_DAY);
      var m = md.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short' }).replace('.', '');
      if (m !== lastMonthLabel) monthMarks.push({ col: i, label: m });
      lastMonthLabel = m;
    }
    // Evita rótulos colados (ex.: "JunJul") quando um mês tem só uma coluna.
    var shownMonths = [];
    monthMarks.forEach(function (mark) {
      var prev = shownMonths[shownMonths.length - 1];
      if (prev && mark.col - prev.col < 2) shownMonths[shownMonths.length - 1] = mark;
      else shownMonths.push(mark);
    });
    for (var mi = 0; mi < columns; mi++) {
      var label = '';
      for (var si = 0; si < shownMonths.length; si++) {
        if (shownMonths[si].col === mi) { label = shownMonths[si].label; break; }
      }
      months += '<span>' + label + '</span>';
    }

    var cols = 'grid-template-columns:repeat(' + columns + ',var(--cal-cell-size,15px))';
    var totalEvents = (events || []).length;
    var activeDays = Object.keys(byDay).length;
    return '<div class="calendar">' +
      '<p class="sr-only">Calendário de atividade: ' + totalEvents +
      (totalEvents === 1 ? ' atividade registrada em ' : ' atividades registradas em ') +
      activeDays + (activeDays === 1 ? ' dia.' : ' dias.') + '</p>' +
      '<div aria-hidden="true">' +
      '<div class="cal-months" style="' + cols + '">' + months + '</div>' +
      '<div class="cal-body">' +
      '<div class="cal-weekdays"><span></span><span>Seg</span><span></span><span>Qua</span><span></span><span>Sex</span><span></span></div>' +
      '<div class="cal-grid" style="' + cols + '">' + cells + '</div></div>' +
      '<div class="cal-legend">Menos ' +
      '<span class="cal-cell l0"></span><span class="cal-cell l1"></span><span class="cal-cell l2"></span>' +
      '<span class="cal-cell l3"></span><span class="cal-cell l4"></span> Mais</div>' +
      '</div></div>';
  }

  function songSortValue(s, key) {
    switch (key) {
      case 'singer': return singerName(s.singerId);
      case 'genre': return s.genre || '';
      case 'key': return s.key || '';
      case 'duration': return Number(s.duration) || 0;
      case 'created': return Date.parse(s.createdAt) || 0;
      case 'review': return ensureCard(s).due == null ? 0 : ensureCard(s).due;
      default: return s.title || '';
    }
  }

  function sortHeader(label, key) {
    var active = songFilters.sort === key;
    var arrow = active ? (songFilters.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th aria-sort="' + (active ? (songFilters.dir === 'asc' ? 'ascending' : 'descending') : 'none') + '">' +
      '<button type="button" class="th-btn' + (active ? ' active' : '') +
      '" data-action="sort" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  function repertoireTabs() {
    return '<div class="rep-tabs"><div class="segmented" role="tablist" aria-label="Repertório">' +
      '<button type="button" role="tab" aria-selected="' + (repertoireTab === 'songs') + '" ' +
      'data-action="rep-tab" data-tab="songs">' + icon('library') + ' Músicas</button>' +
      '<button type="button" role="tab" aria-selected="' + (repertoireTab === 'singers') + '" ' +
      'data-action="rep-tab" data-tab="singers">' + icon('users') + ' Cantores</button>' +
      '</div><span class="rep-meta">' + state.songs.length + ' músicas · ' +
      state.singers.length + ' cantores</span></div>';
  }

  function renderSongs(container, actions) {
    if (repertoireTab === 'singers') {
      actions.innerHTML = '<button class="btn btn-primary" data-action="add-singer">' + icon('plus') + ' Cantor</button>';
      container.innerHTML = repertoireTabs() + singersMarkup();
      return;
    }

    actions.innerHTML =
      '<button class="btn" data-action="add-singer">' + icon('users') + ' Cantor</button>' +
      '<button class="btn btn-primary" data-action="add-song">' + icon('plus') + ' Música</button>';

    var genres = {};
    state.songs.forEach(function (s) { if (s.genre) genres[s.genre] = 1; });
    var genreKeys = Object.keys(genres).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

    var filterBar = '<div class="filters">' +
      '<input id="searchInput" class="search" aria-label="Buscar música" placeholder="Buscar música..." value="' + escapeHtml(searchTerm) + '">' +
      '<select id="filterSinger" class="search" aria-label="Filtrar por cantor"><option value="">Todos os cantores</option>' +
      state.singers.map(function (sg) {
        return '<option value="' + escapeHtml(sg.id) + '"' + (songFilters.singer === sg.id ? ' selected' : '') + '>' +
          escapeHtml(sg.name) + '</option>';
      }).join('') + '</select>' +
      '<select id="filterGenre" class="search" aria-label="Filtrar por gênero"><option value="">Todos os gêneros</option>' +
      genreKeys.map(function (g) {
        return '<option value="' + escapeHtml(g) + '"' + (songFilters.genre === g ? ' selected' : '') + '>' + escapeHtml(g) + '</option>';
      }).join('') + '</select>' +
      '<label class="check-filter"><input type="checkbox" id="filterDue"' + (songFilters.dueOnly ? ' checked' : '') +
      '> Só revisões pendentes</label>' +
      '<select id="sortSelect" class="search sort-select" aria-label="Ordenar músicas">' +
      [
        ['title', 'asc', 'Título (A–Z)'],
        ['title', 'desc', 'Título (Z–A)'],
        ['singer', 'asc', 'Cantor (A–Z)'],
        ['genre', 'asc', 'Gênero (A–Z)'],
        ['key', 'asc', 'Tom (A–Z)'],
        ['duration', 'asc', 'Duração (menor)'],
        ['review', 'asc', 'Revisão mais próxima'],
        ['created', 'desc', 'Adicionadas recentemente']
      ].map(function (opt) {
        var selected = songFilters.sort === opt[0] && songFilters.dir === opt[1] ? ' selected' : '';
        return '<option value="' + opt[0] + ':' + opt[1] + '"' + selected + '>' + opt[2] + '</option>';
      }).join('') + '</select>' +
      '</div>';

    var list = state.songs.filter(function (s) {
      if (songFilters.singer && s.singerId !== songFilters.singer) return false;
      if (songFilters.genre && s.genre !== songFilters.genre) return false;
      if (songFilters.dueOnly && !SRS.isDue(ensureCard(s))) return false;
      if (!searchTerm) return true;
      var hay = norm(s.title + ' ' + singerName(s.singerId) + ' ' + (s.genre || '') +
        ' ' + (s.key || '') + ' ' + (s.lyrics || ''));
      return hay.indexOf(norm(searchTerm)) !== -1;
    });

    var dir = songFilters.dir === 'asc' ? 1 : -1;
    list.sort(function (a, b) {
      var va = songSortValue(a, songFilters.sort);
      var vb = songSortValue(b, songFilters.sort);
      var cmp = (typeof va === 'number' && typeof vb === 'number')
        ? va - vb
        : String(va).localeCompare(String(vb), 'pt-BR', { sensitivity: 'base' });
      return cmp * dir || String(a.title).localeCompare(String(b.title), 'pt-BR');
    });

    var hasFilters = !!(searchTerm || songFilters.singer || songFilters.genre || songFilters.dueOnly);
    var counter = '<div class="list-count">' + (hasFilters
      ? 'Exibindo <strong>' + list.length + '</strong> de <strong>' + state.songs.length + '</strong> músicas'
      : '<strong>' + state.songs.length + '</strong> ' + (state.songs.length === 1 ? 'música' : 'músicas')) +
      '</div>';

    if (!list.length) {
      container.innerHTML = repertoireTabs() + filterBar + counter +
        '<div class="empty"><span class="empty-mark">' + icon('music') + '</span>' +
        (state.songs.length ? 'Nenhuma música corresponde aos filtros.' : 'Seu repertório está vazio. Adicione sua primeira música.') +
        '</div>';
      return;
    }

    var html = repertoireTabs() + filterBar + counter + '<div class="table-wrap"><table><thead><tr>' +
      sortHeader('Música', 'title') +
      sortHeader('Cantor', 'singer') +
      sortHeader('Gênero', 'genre') +
      sortHeader('Tom', 'key') +
      sortHeader('Duração', 'duration') +
      sortHeader('Revisão', 'review') +
      sortHeader('Adicionada em', 'created') +
      '<th style="text-align:right">Ações</th>' +
      '</tr></thead><tbody>';

    list.forEach(function (s) {
      var card = ensureCard(s);
      var due = SRS.isDue(card);
      html += '<tr>' +
        '<td><button type="button" class="song-name-link" data-action="open-song" data-id="' + escapeHtml(s.id) + '" ' +
        'title="Ver resumo da música">' +
        '<span class="song-title-text">' + escapeHtml(s.title) + '</span>' +
        ((s.youtubeVideos || []).length ? '<span class="icon-video" title="Possui vídeos" aria-hidden="true">' +
          icon('play') + '</span>' : '') +
        '</button></td>' +
        '<td>' + escapeHtml(singerName(s.singerId)) + '</td>' +
        '<td>' + (s.genre ? escapeHtml(s.genre) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (s.key ? '<span class="chip key" title="' + escapeHtml(s.keySource || '') + '">' + escapeHtml(s.key) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="nowrap">' + (s.duration ? formatDuration(s.duration) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (due ? '<span class="dot-review" title="Revisão pendente" aria-hidden="true"></span> Pendente' : '<span class="muted">Em dia</span>') + '</td>' +
        '<td class="nowrap">' + formatDateTime(s.createdAt) + '</td>' +
        '<td class="right nowrap">' +
        '<button class="btn btn-sm" data-action="stage-song" data-id="' + escapeHtml(s.id) + '" ' +
        'title="Abrir no modo palco" aria-label="Abrir ' + escapeHtml(s.title) + ' no modo palco">' +
        icon('stage') + '</button> ' +
        (due ? '<button class="btn btn-sm" data-action="practice-song" data-id="' + escapeHtml(s.id) + '">Revisar</button> ' : '') +
        '<button class="btn btn-sm" data-action="ver-videos" data-id="' + escapeHtml(s.id) + '">Vídeos</button> ' +
        '<button class="btn btn-sm" data-action="edit-song" data-id="' + escapeHtml(s.id) + '">Editar</button> ' +
        '<button class="btn btn-sm btn-danger" data-action="delete-song" data-id="' + escapeHtml(s.id) + '">Excluir</button>' +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  /* =========================== PALCO =========================== */
  function stageSongs() {
    return state.songs.slice().sort(function (a, b) {
      return String(a.title).localeCompare(String(b.title), 'pt-BR', { sensitivity: 'base' });
    });
  }

  function renderStage(container, actions) {
    actions.innerHTML = '<button class="btn" data-action="add-song">' + icon('plus') + ' Música</button>';

    var songs = stageSongs();
    if (!songs.length) {
      container.innerHTML = '<div class="empty"><span class="empty-mark">' + icon('stage') + '</span>' +
        'Adicione músicas ao repertório para abrir o modo palco.</div>';
      return;
    }

    var html = '<div class="stage-intro"><h2>Setlist</h2>' +
      '<p class="muted">Escolha uma música para abrir a letra em tela cheia.</p></div>' +
      '<ul class="stage-setlist">';
    songs.forEach(function (s, i) {
      var card = ensureCard(s);
      var marks = (s.sections || []).filter(function (u) { return u && u.name; }).slice(0, 6);
      html += '<li class="stage-item">' +
        '<span class="stage-num">' + String(i + 1).padStart(2, '0') + '</span>' +
        '<div class="stage-item-main"><strong>' + escapeHtml(s.title) + '</strong>' +
        '<div class="stage-item-meta">' + escapeHtml(singerName(s.singerId)) +
        (s.key ? ' · ' + escapeHtml(s.key) : '') +
        (marks.length ? ' · ' + marks.map(function (u) { return markLetter((s.sections || []).indexOf(u)); }).join(' ') : '') +
        '</div></div>' +
        '<span class="stage-item-mastery">' + SRS.mastery(card) + '%</span>' +
        '<button class="btn btn-sm" data-action="stage-song" data-id="' + escapeHtml(s.id) + '">' +
        icon('play') + ' Abrir</button>' +
        '</li>';
    });
    html += '</ul><p class="small muted">Atalhos: <kbd>←</kbd> <kbd>→</kbd> trocam de música, ' +
      '<kbd>Esc</kbd> sai do palco.</p>';
    container.innerHTML = html;
  }

  function closeStage() {
    stageState.open = false;
    stageState.songId = null;
    var overlay = $('#stageMode');
    if (overlay) { overlay.hidden = true; overlay.innerHTML = ''; }
    document.body.classList.remove('stage-open');
    render();
  }

  function renderStageMode() {
    var overlay = $('#stageMode');
    if (!overlay) return;
    var songs = stageSongs();
    var index = songs.findIndex(function (s) { return s.id === stageState.songId; });
    if (index < 0) { closeStage(); return; }
    var song = songs[index];
    var sections = (song.sections || []).filter(function (u) { return u && u.name; });

    var marks = sections.length ? '<div class="stage-marks">' + sections.map(function (u, i) {
      var conf = Number(u.confidence);
      if (!isFinite(conf)) conf = 3;
      return '<span class="stage-mark"><b>' + markLetter(i) + '</b>' + escapeHtml(u.name) +
        ' · ' + conf + '/5</span>';
    }).join('') + '</div>' : '';

    overlay.innerHTML =
      '<div class="stage-bar">' +
        '<div class="stage-song"><span class="stage-index">' + String(index + 1).padStart(2, '0') + ' / ' +
          String(songs.length).padStart(2, '0') + '</span>' +
          '<div><strong>' + escapeHtml(song.title) + '</strong><span>' +
          escapeHtml(singerName(song.singerId)) + (song.key ? ' · ' + escapeHtml(song.key) : '') +
          (song.duration ? ' · ' + formatDuration(song.duration) : '') + '</span></div></div>' +
        '<div class="stage-bar-actions">' +
          '<button type="button" class="stage-btn" data-action="stage-font" data-delta="-1" aria-label="Diminuir letra">A−</button>' +
          '<button type="button" class="stage-btn" data-action="stage-font" data-delta="1" aria-label="Aumentar letra">A+</button>' +
          '<button type="button" class="stage-btn" data-action="stage-close">' + icon('close') + ' Sair</button>' +
        '</div>' +
      '</div>' + marks +
      '<div class="stage-lyrics" data-size="' + stageState.font + '" tabindex="0">' +
        (song.lyrics ? escapeHtml(song.lyrics) : '<span class="stage-empty">Sem letra cadastrada para esta música.</span>') +
      '</div>' +
      '<div class="stage-foot">' +
        '<button type="button" class="stage-btn" data-action="stage-prev" aria-label="Música anterior">' +
          icon('arrow-left') + '</button>' +
        '<span class="stage-hint"><kbd>←</kbd> <kbd>→</kbd> trocam de música · <kbd>Esc</kbd> sai · ' +
          '<kbd>+</kbd> <kbd>−</kbd> mudam a letra</span>' +
        '<button type="button" class="stage-btn" data-action="stage-scroll" data-delta="1" aria-label="Rolar letra">' +
          icon('arrow-down') + '</button>' +
        '<button type="button" class="stage-btn" data-action="stage-next" aria-label="Próxima música">' +
          icon('arrow-right') + '</button>' +
      '</div>';
    overlay.hidden = false;
    document.body.classList.add('stage-open');
    var lyrics = overlay.querySelector('.stage-lyrics');
    if (lyrics) lyrics.focus({ preventScroll: true });
  }

  function openStage(songId) {
    stageState.open = true;
    stageState.songId = songId;
    stageState.font = 2;
    renderStageMode();
  }

  function stageStep(delta) {
    var songs = stageSongs();
    if (!songs.length) return;
    var index = songs.findIndex(function (s) { return s.id === stageState.songId; });
    if (index < 0) index = 0;
    var next = songs[(index + delta + songs.length) % songs.length];
    stageState.songId = next.id;
    renderStageMode();
  }

  /** Tela de resumo da música, com mini player dos vídeos anexados. */
  function renderSongSummary(container, actions) {
    var song = getSong(currentSongId);
    if (!song) { navigate('songs'); return; }
    var vids = (song.youtubeVideos || []).filter(function (v) {
      return YouTube.parseVideoId(v && v.id);
    });
    if (currentVideoId && !YouTube.parseVideoId(currentVideoId)) currentVideoId = null;
    var stillThere = vids.some(function (v) { return v.id === currentVideoId; });
    if (!stillThere) currentVideoId = vids.length ? vids[0].id : null;
    var card = ensureCard(song);
    var singer = getSinger(song.singerId);

    var hasVideos = vids.length > 0;
    var cover = vids.length && vids[0].thumb ? safeUrl(vids[0].thumb) : null;
    var searching = !!(song.keyPending || song.lyricsPending);
    var needsData = !searching && (!song.key || !song.lyrics);

    // Cabeçalho no mesmo padrão enxuto das outras telas.
    var html = '<div class="song-summary">' +
      '<div class="summary-top">' +
      '<div class="summary-top-main">' +
      (cover
        ? '<img class="summary-cover" src="' + escapeHtml(cover) + '" alt="" loading="lazy">'
        : '<span class="summary-cover summary-cover-placeholder" aria-hidden="true">' + icon('music') + '</span>') +
      '<div><h1 class="summary-title">' + escapeHtml(song.title) + '</h1>' +
      '<p class="view-subtitle">' + escapeHtml(singerName(song.singerId)) +
      ' · Adicionada em ' + formatDateTime(song.createdAt) + '</p></div></div>' +
      '<div class="summary-actions">' +
      '<button class="btn" data-action="goto-songs">&larr; Voltar às músicas</button>' +
      (needsData ? '<button class="btn" data-action="enrich-song" data-id="' + escapeHtml(song.id) + '">Buscar tom/letra</button>' : '') +
      '<button class="btn" data-action="manage-videos">Vídeos</button>' +
      '<button class="btn btn-primary" data-action="edit-song" data-id="' + escapeHtml(song.id) + '">Editar</button>' +
      '</div></div>' +
      '<div class="summary-meta">' +
      (song.genre ? '<span class="chip">' + escapeHtml(song.genre) + '</span>' : '') +
      (song.key ? '<span class="chip key" title="' + escapeHtml(song.keySource || '') + '">' + escapeHtml(song.key) + '</span>' :
        (song.keyPending ? '<span class="chip pending">Tom: buscando...</span>' : '')) +
      (song.duration ? '<span class="chip">' + formatDuration(song.duration) + '</span>' : '') +
      (song.difficulty ? '<span class="chip" title="Dificuldade">' + difficultyStars(song.difficulty) + '</span>' : '') +
      '<span class="chip">' + vids.length + (vids.length === 1 ? ' vídeo' : ' vídeos') + '</span>' +
      '<span class="chip">Domínio ' + SRS.mastery(card) + '%</span>' +
      '<span class="chip' + (SRS.isDue(card) ? ' warning' : '') + '">' +
      (SRS.isDue(card) ? 'Revisão pendente' : 'Revisão em dia') + '</span>' +
      '</div>';

    // 1. Informações
    html += '<div class="panel"><h3>Informações</h3>' +
      '<p class="small muted">Adicionada em ' + formatDateTime(song.createdAt) + '</p>' +
      '<p class="small muted">Gênero: ' + escapeHtml(song.genre || '—') + ' · Tom: ' + escapeHtml(song.key || '—') +
      ' · Duração: ' + (song.duration ? formatDuration(song.duration) : '—') +
      ' · Dificuldade: ' + difficultyStars(song.difficulty) + '</p>' +
      (song.notes ? '<p class="small">' + escapeHtml(song.notes) + '</p>' : '') +
      '<div class="callout small"><strong>Revisão:</strong> ' + escapeHtml(dueLabel(card)) +
      ' · Domínio estimado ' + SRS.mastery(card) + '%</div></div>';

    // 2. Atividade da música (seção expansível)
    html += '<details class="activity-details"><summary>Atividade da música</summary>' +
      '<div class="panel">' + activityCalendar(songActivityEvents(song), 26) + '</div></details>';

    // 3. Letra
    html += '<div class="section lyrics-section"><h2 class="section-title">Letra da música</h2>' +
      (song.lyrics
        ? '<pre class="lyrics-text">' + escapeHtml(song.lyrics) + '</pre>' +
          (song.lyricsSource ? '<p class="small muted">Fonte: ' + escapeHtml(song.lyricsSource) + '</p>' : '')
        : '<div class="empty">' + (song.lyricsPending
            ? 'Buscando a letra na internet...'
            : 'Letra não disponível. Use Editar para colar a letra ou buscar novamente.') + '</div>') +
      '</div>';

    // 4. Vídeos (o player só existe quando há vídeo anexado)
    html += '<div class="section videos-section"><h2 class="section-title">Vídeos (' + vids.length + ')</h2>';
    if (hasVideos) {
      var currentVideo = vids.find(function (v) { return v.id === currentVideoId; }) || vids[0];
      html += '<div class="summary-grid"><div class="summary-player"><div class="mini-player">';
      if (canEmbedYoutube()) {
        html += '<iframe ' +
          'src="https://www.youtube-nocookie.com/embed/' + encodeURIComponent(currentVideoId) +
          '?rel=0&enablejsapi=1" ' +
          'referrerpolicy="strict-origin-when-cross-origin" ' +
          'title="Vídeo de ' + escapeHtml(song.title) + '" frameborder="0" ' +
          'allow="accelerometer; autoplay; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>';
      } else {
        html += playerPosterHtml(currentVideo);
      }
      html += '</div></div><div class="summary-info">' +
        '<div class="video-choices">' + vids.map(function (v) {
          return '<button type="button" class="video-choice' + (v.id === currentVideoId ? ' active' : '') +
            '" data-action="play-video" data-video="' + escapeHtml(v.id) + '">' +
            '<img src="' + escapeHtml(safeUrl(v.thumb)) + '" alt="" loading="lazy">' +
            '<span><strong>' + escapeHtml(v.title) + '</strong>' +
            '<small>' + escapeHtml(v.channel || 'YouTube') + '</small></span></button>';
        }).join('') + '</div>' +
        '<a class="small" target="_blank" rel="noopener noreferrer" href="' +
        escapeHtml(YouTube.watchUrl(currentVideoId)) + '">Abrir no YouTube &rarr;</a>' +
        '</div></div>';
    } else {
      html += '<div class="panel"><p class="muted small">Nenhum vídeo anexado.</p>' +
        '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(safeUrl(videoSearchUrl(song))) + '">Buscar no YouTube</a> ' +
        '<button class="btn" data-action="manage-videos">Adicionar vídeo</button></div>';
    }
    html += '</div></div>';

    container.innerHTML = html;
  }

  function songModal(existing, draft) {
    var s = Object.assign({}, existing || {}, draft || {});
    var selectedSingerId = s.singerId || null;
    var diffOptions = [1, 2, 3, 4, 5].map(function (n) {
      return '<option value="' + n + '"' + ((Number(s.difficulty) || 1) === n ? ' selected' : '') + '>' + n + (n === 1 ? ' (fácil)' : n === 5 ? ' (difícil)' : '') + '</option>';
    }).join('');

    var keyDraft = { key: s.key || '', keyName: s.keyName || '', keySource: s.keySource || '' };
    var keyToken = 0;
    var keyEdited = false;
    var lyricsDraft = { lyrics: s.lyrics || '', source: s.lyricsSource || '' };
    var lyricsToken = 0;
    var lyricsEdited = false;
    var modalAtStart = modalToken;
    var sectionsDraft = Array.isArray(s.sections) ? s.sections.map(function (sec) {
      return {
        id: sec.id || Store.generateId('section'),
        name: sec.name || '',
        confidence: Number(sec.confidence) || 3
      };
    }) : [];

    function applyKeyDraft() {
      var input = $('#modalForm [name=key]');
      if (input && !keyEdited) input.value = keyDraft.key || '';
      var st = $('#keyStatus');
      if (st) st.textContent = keyDraft.keySource
        ? 'Fonte: ' + keyDraft.keySource
        : 'Selecione um cantor para pesquisar o tom e a duração.';
    }

    function applyLyricsDraft() {
      var textarea = $('#modalForm [name=lyrics]');
      if (textarea && !lyricsEdited) textarea.value = lyricsDraft.lyrics || '';
      var el = $('#lyricsStatus');
      if (!el) return;
      el.textContent = lyricsDraft.lyrics
        ? 'Letra carregada (' + (lyricsDraft.source || 'internet') + ') · ' + lyricsDraft.lyrics.length + ' caracteres'
        : 'Letra não encontrada — você pode colar ou editar a letra acima.';
    }

    /** Busca a letra na internet e guarda no rascunho da música. */
    function searchLyrics() {
      var f = $('#modalForm');
      if (!f || lyricsDraft.lyrics || lyricsEdited) return Promise.resolve(null);
      var title = f.elements.title.value.trim();
      var sid = selectedSingerId;
      if (!title || !sid) return Promise.resolve(null);
      var myToken = ++lyricsToken;
      var el = $('#lyricsStatus');
      if (el) el.textContent = 'Carregando letra...';
      return SongLyrics.search(singerName(sid), title).then(function (r) {
        if (myToken !== lyricsToken || modalAtStart !== modalToken) return null;
        if (r && r.lyrics) {
          lyricsDraft = { lyrics: r.lyrics, source: r.source };
          applyLyricsDraft();
        } else if (el) {
          el.textContent = 'Letra não encontrada — você pode colar ou editar a letra acima.';
        }
        return r;
      });
    }

    function applyGenreFromSinger() {
      var f = $('#modalForm');
      if (!f) return;
      var sg = selectedSingerId ? getSinger(selectedSingerId) : null;
      if (sg && sg.genre) f.elements.genre.value = sg.genre;
    }

    /** Reconhece exatamente o nome digitado no autocomplete. */
    var lastResolved = '';
    function resolveSinger() {
      var f = $('#modalForm');
      if (!f) return;
      var typed = (f.elements.singerName.value || '').trim();
      var n = norm(typed);
      // Só associa automaticamente quando o nome é exato. Prefixos exigem
      // escolha explícita na lista, evitando vincular a música ao cantor errado.
      var match = n ? state.singers.find(function (sg) { return norm(sg.name) === n; }) : null;
      var signature = n + '|' + (match ? match.id : '');
      if (signature === lastResolved) return;
      lastResolved = signature;

      selectedSingerId = match ? match.id : null;
      var hint = $('#singerHint');
      if (hint) {
        if (typed && !match) hint.textContent = 'Cantor não cadastrado — escolha uma sugestão ou "+ Cadastrar".';
        else if (typed && match) hint.textContent = '';
        else hint.textContent = '';
      }
      if (match) {
        applyGenreFromSinger();
        searchKey();
        searchLyrics();
      } else {
        var ks = $('#keyStatus');
        if (ks) ks.textContent = 'Selecione um cantor para pesquisar o tom e a duração.';
      }
    }

    /** Pesquisa o tom na internet e preenche o campo automático. */
    function searchKey() {
      var f = $('#modalForm');
      if (!f) return Promise.resolve(null);
      if (keyEdited || keyDraft.key) return Promise.resolve(null);
      var title = f.elements.title.value.trim();
      var sid = selectedSingerId;
      if (!title || !sid) {
        var aviso = $('#keyStatus');
        if (aviso) aviso.textContent = 'Selecione um cantor para pesquisar o tom e a duração.';
        return Promise.resolve(null);
      }
      var myToken = ++keyToken;
      var st = $('#keyStatus');
      if (st) st.textContent = 'Pesquisando o tom de "' + title + '" na internet...';
      return SongKey.search(sid ? singerName(sid) : '', title).then(function (r) {
        if (myToken !== keyToken || modalAtStart !== modalToken) return null;
        if (!r) {
          if ($('#keyStatus')) $('#keyStatus').textContent = 'Não foi possível determinar o tom desta música.';
          return null;
        }
        keyDraft = r;
        if (!keyEdited) {
          var input = f.elements.key;
          if (input && r.key) input.value = r.key;
          applyKeyDraft();
        }
        var dur = f.elements.duration;
        if (dur && !dur.value && r.durationMin) dur.value = r.durationMin;
        var stEl = $('#keyStatus');
        if (stEl) {
          stEl.textContent = r.key
            ? (r.keySource ? 'Fonte: ' + r.keySource : 'Tom estimado')
            : 'Tom não identificado, mas a duração foi preenchida.';
          if (r.durationMin) stEl.textContent += ' · Duração: ' + r.durationMin + ' min';
        }
        return r;
      });
    }

    var body =
      '<div class="field"><label for="songTitleInput">Título *</label><input name="title" id="songTitleInput" required value="' + escapeHtml(s.title || '') + '" placeholder="Ex.: Águas de Março"></div>' +
      (s.createdAt ? '<div class="small muted" style="margin:-6px 0 12px">Adicionada em ' + formatDateTime(s.createdAt) + '</div>' : '') +
      '<div class="field"><label for="songSingerInput">Cantor</label>' +
      '<div class="singer-wrap">' +
      '<input name="singerName" id="songSingerInput" autocomplete="off" role="combobox" aria-autocomplete="list" aria-expanded="false" aria-controls="singerMenu" aria-haspopup="listbox" placeholder="Digite para buscar..." ' +
      'value="' + escapeHtml(s.singerId ? singerName(s.singerId) : (s.singerName || '')) + '">' +
      '<div class="autocomplete-menu" id="singerMenu" role="listbox" aria-label="Sugestões de cantores" hidden></div>' +
      '</div><div class="small muted" id="singerHint"></div></div>' +
      '<div class="field"><label for="songGenreInput">Gênero <span class="auto-tag">do cantor</span></label><input name="genre" id="songGenreInput" value="' + escapeHtml(s.genre || '') + '" placeholder="Preenchido ao escolher o cantor"></div>' +
      '<div class="field"><label for="songKey">Tom da música <span class="auto-tag">automático ou manual</span></label>' +
      '<input name="key" id="songKey" autocomplete="off" value="' + escapeHtml(s.key || '') + '" placeholder="Ex.: Am ou F#m">' +
      '<div class="small muted" id="keyStatus">O tom será pesquisado automaticamente na internet.</div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label for="songDifficulty">Dificuldade</label><select name="difficulty" id="songDifficulty">' + diffOptions + '</select></div>' +
      '<div class="field"><label for="songDuration">Duração (min) <span class="auto-tag">automático</span></label><input name="duration" id="songDuration" type="number" min="0" step="any" value="' + escapeHtml(s.duration || '') + '" placeholder="Preenchido pela busca"></div>' +
      '</div>' +
      '<details class="lyrics-editor"' + (s.lyrics ? ' open' : '') + '><summary>Letra da música <span class="auto-tag">automática ou manual</span></summary>' +
      '<textarea name="lyrics" id="songLyricsInput" aria-label="Letra da música" placeholder="A letra é buscada automaticamente; você também pode colar ou editar aqui.">' + escapeHtml(s.lyrics || '') + '</textarea>' +
      '<div class="small muted" id="lyricsStatus">A letra será pesquisada ao salvar.</div></details>' +
      '<div class="field"><label>Trechos <span class="auto-tag">opcional</span></label>' +
      '<div id="sectionsEditor"></div>' +
      '<div class="section-editor-actions"><button type="button" class="btn btn-sm" id="addSectionBtn">+ Trecho</button></div>' +
      '<div class="small muted">Ex.: Intro, Verso 1, Refrão. Cada trecho recebe uma nota própria na prática.</div></div>';

    openModal({
      title: existing ? 'Editar música' : 'Nova música',
      bodyHtml: body,
      onSubmit: function (e) {
        var f = e.target;
        var title = f.elements.title.value.trim();
        if (!title) return;
        var singerId = selectedSingerId;

        var keyValue = f.elements.key.value.trim();
        var keyName = '';
        var keySource = '';
        if (keyValue) {
          if (keyValue === keyDraft.key) {
            keyName = keyDraft.keyName || keyDisplayName(keyValue);
            keySource = keyDraft.keySource || 'Automático';
          } else {
            keyName = keyDisplayName(keyValue);
            keySource = 'Manual';
          }
        }

        var lyricsValue = f.elements.lyrics.value.replace(/\r\n/g, '\n').trim();
        var lyricsSource = '';
        if (lyricsValue) {
          lyricsSource = lyricsValue === String(lyricsDraft.lyrics || '').trim()
            ? (lyricsDraft.source || 'Automática')
            : 'Manual';
        }

        var sections = sectionsDraft.filter(function (sec) {
          return String(sec.name || '').trim();
        }).map(function (sec) {
          return {
            id: sec.id,
            name: String(sec.name).trim(),
            confidence: Math.max(1, Math.min(5, Number(sec.confidence) || 3))
          };
        });

        var values = {
          title: title,
          singerId: singerId,
          genre: f.elements.genre.value.trim(),
          difficulty: Number(f.elements.difficulty.value) || 1,
          duration: f.elements.duration.value ? Number(f.elements.duration.value) : null,
          sections: sections,
          notes: existing ? (existing.notes || '') : '',
          youtubeVideos: existing ? (existing.youtubeVideos || []) : [],
          youtubeSearchUrl: YouTube.songSearchUrl(title, singerId ? singerName(singerId) : ''),
          key: keyValue,
          keyName: keyName,
          keySource: keySource,
          lyrics: lyricsValue,
          lyricsSource: lyricsSource
        };

        var savedSong;
        if (existing) {
          Object.assign(existing, values);
          savedSong = existing;
        } else {
          savedSong = Object.assign({
            id: Store.generateId('song'),
            createdAt: new Date().toISOString()
          }, values);
          savedSong.card = SRS.newCard(savedSong.id);
          state.songs.push(savedSong);
        }

        save();
        closeModal();
        render();
        toast('Música salva com sucesso.');

        var needKey = !values.key && !keyEdited;
        var needLyrics = !values.lyrics && !lyricsEdited;
        if (needKey || needLyrics) {
          enrichSong(savedSong, { key: needKey, lyrics: needLyrics });
        }
      }
    });

    modalAtStart = modalToken; // openModal() incrementou o token; sincroniza aqui
    applyKeyDraft();
    applyLyricsDraft();

    function renderSectionsEditor() {
      var wrap = $('#sectionsEditor');
      if (!wrap) return;
      if (!sectionsDraft.length) {
        wrap.innerHTML = '<div class="small muted" style="margin-bottom:6px">Nenhum trecho cadastrado.</div>';
        return;
      }
      wrap.innerHTML = sectionsDraft.map(function (sec, index) {
        return '<div class="section-editor-row">' +
          '<input name="sectionName" data-section-id="' + escapeHtml(sec.id) + '" value="' +
          escapeHtml(sec.name) + '" placeholder="Ex.: Refrão ' + (index + 1) + '" ' +
          'aria-label="Nome do trecho ' + (index + 1) + '">' +
          '<button type="button" class="icon-btn" data-remove-section="' + escapeHtml(sec.id) + '" ' +
          'aria-label="Remover trecho ' + (index + 1) + '">&times;</button>' +
          '</div>';
      }).join('');
    }

    function addSection() {
      sectionsDraft.push({ id: Store.generateId('section'), name: '', confidence: 3 });
      renderSectionsEditor();
      var inputs = $('#sectionsEditor') ? $('#sectionsEditor').querySelectorAll('[data-section-id]') : [];
      if (inputs.length) inputs[inputs.length - 1].focus();
    }

    renderSectionsEditor();
    var addSectionBtn = $('#addSectionBtn');
    if (addSectionBtn) addSectionBtn.addEventListener('click', addSection);
    var sectionsEditor = $('#sectionsEditor');
    if (sectionsEditor) {
      sectionsEditor.addEventListener('input', function (e) {
        var input = e.target.closest('[data-section-id]');
        if (!input) return;
        var sec = sectionsDraft.find(function (item) { return item.id === input.dataset.sectionId; });
        if (sec) sec.name = input.value;
      });
      sectionsEditor.addEventListener('click', function (e) {
        var remove = e.target.closest('[data-remove-section]');
        if (!remove) return;
        sectionsDraft = sectionsDraft.filter(function (item) {
          return item.id !== remove.dataset.removeSection;
        });
        renderSectionsEditor();
      });
    }

    var keyInput = $('#modalForm [name=key]');
    if (keyInput) {
      keyInput.addEventListener('input', function () {
        keyEdited = true;
        var st = $('#keyStatus');
        if (st) st.textContent = keyInput.value.trim()
          ? 'Tom informado manualmente.'
          : 'Tom vazio — a busca automática pode ser usada ao salvar.';
      });
    }

    var lyricsInput = $('#modalForm [name=lyrics]');
    if (lyricsInput) {
      lyricsInput.addEventListener('input', function () {
        lyricsEdited = true;
        var el = $('#lyricsStatus');
        if (el) el.textContent = lyricsInput.value.trim()
          ? 'Letra editada manualmente · ' + lyricsInput.value.length + ' caracteres'
          : 'Letra vazia — a busca automática pode ser usada ao salvar.';
      });
    }

    var titleInput = $('#modalForm [name=title]');
    var titleTimer = null;
    if (titleInput) {
      titleInput.addEventListener('input', function () {
        clearTimeout(titleTimer);
        titleTimer = setTimeout(function () {
          if (selectedSingerId && titleInput.value.trim()) { searchKey(); searchLyrics(); }
        }, 700);
      });
    }

    var singerInput = $('#modalForm [name=singerName]');
    var singerMenu = $('#singerMenu');
    var singerTimer = null;

    function showSingerMenu(query) {
      if (!singerMenu || !singerInput) return;
      var q = norm(query);
      var matches = state.singers.filter(function (sg) {
        return !q || norm(sg.name).indexOf(q) !== -1;
      }).slice(0, 8);
      if (matches.length) {
        singerMenu.innerHTML = matches.map(function (sg, i) {
          return '<button type="button" class="autocomplete-item" role="option" aria-selected="false" id="singerOpt' + i + '" data-singer-id="' + escapeHtml(sg.id) + '">' +
            avatarHtml(sg, 26) + '<span>' + escapeHtml(sg.name) + '</span></button>';
        }).join('');
      } else if (query.trim()) {
        singerMenu.innerHTML = '<button type="button" class="autocomplete-item add-new" role="option" aria-selected="false" data-add-singer="1">' +
          '+ Cadastrar "' + escapeHtml(query.trim()) + '"</button>';
      } else {
        singerMenu.innerHTML = '<div class="autocomplete-empty">Digite o nome do cantor.</div>';
      }
      singerMenu.style.width = singerInput.offsetWidth + 'px';
      singerMenu.hidden = false;
      singerInput.setAttribute('aria-expanded', 'true');
    }

    function hideSingerMenu() {
      if (singerMenu) singerMenu.hidden = true;
      if (singerInput) singerInput.setAttribute('aria-expanded', 'false');
    }

    function chooseSinger(id) {
      var sg = getSinger(id);
      if (!sg || !singerInput) return;
      singerInput.value = sg.name;
      hideSingerMenu();
      lastResolved = '';
      resolveSinger();
    }

    /** Cadastra o cantor digitado sem abrir o popup, buscando os dados em segundo plano. */
    function createSingerInline(name) {
      name = String(name || '').trim();
      if (!name) return;
      hideSingerMenu();
      var hintEl = $('#singerHint');
      var sg = {
        id: Store.generateId('singer'),
        name: name,
        genre: '',
        notes: '',
        photo: null,
        photoUrl: null,
        photoSource: null,
        photoMissing: true,
        photoPending: true,
        photoUpdatedAt: new Date().toISOString()
      };
      state.singers.push(sg);
      save();
      if (singerInput) singerInput.value = sg.name;
      lastResolved = '';
      resolveSinger();
      if (hintEl) hintEl.textContent = 'Cantor "' + name + '" cadastrado. Buscando foto e gênero...';
      toast('Cantor cadastrado.');
      enrichSinger(sg, name);
    }

    if (singerInput) {
      singerInput.addEventListener('input', function () {
        clearTimeout(singerTimer);
        showSingerMenu(singerInput.value);
        singerTimer = setTimeout(resolveSinger, 300);
      });
      singerInput.addEventListener('focus', function () { showSingerMenu(singerInput.value); });
      singerInput.addEventListener('blur', function () {
        clearTimeout(singerTimer);
        resolveSinger();
        setTimeout(function () {
          if (singerMenu && singerMenu.contains(document.activeElement)) return;
          hideSingerMenu();
        }, 150);
      });
      singerInput.addEventListener('keydown', function (e) {
        if (!singerMenu || singerMenu.hidden) return;
        var items = Array.prototype.slice.call(singerMenu.querySelectorAll('.autocomplete-item'));
        var idx = items.indexOf(document.activeElement);
        if (e.key === 'ArrowDown') { e.preventDefault(); (items[idx + 1] || items[0]).focus(); }
        else if (e.key === 'ArrowUp') { e.preventDefault(); (items[idx - 1] || items[items.length - 1]).focus(); }
        else if (e.key === 'Enter' && idx >= 0) { e.preventDefault(); chooseSinger(items[idx].dataset.singerId); }
        else if (e.key === 'Escape') {
          e.preventDefault();
          e.stopPropagation();
          hideSingerMenu();
        }
      });
      if (singerMenu) {
        singerMenu.addEventListener('mousedown', function (e) {
          var add = e.target.closest('[data-add-singer]');
          if (add) { e.preventDefault(); createSingerInline(singerInput.value); return; }
          var item = e.target.closest('.autocomplete-item');
          if (!item) return;
          e.preventDefault();
          chooseSinger(item.dataset.singerId);
        });
        singerMenu.addEventListener('keydown', function (e) {
          if (e.key === 'Escape') {
            e.preventDefault();
            e.stopPropagation();
            hideSingerMenu();
            if (singerInput) singerInput.focus();
            return;
          }
          var items = Array.prototype.slice.call(singerMenu.querySelectorAll('.autocomplete-item'));
          var idx = items.indexOf(document.activeElement);
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            (items[idx + 1] || items[0]).focus();
            return;
          }
          if (e.key === 'ArrowUp') {
            e.preventDefault();
            (items[idx - 1] || items[items.length - 1]).focus();
            return;
          }
          var add = e.target.closest('[data-add-singer]');
          if (add && e.key === 'Enter') { e.preventDefault(); createSingerInline(singerInput.value); return; }
          var item = e.target.closest('.autocomplete-item');
          if (!item || e.key !== 'Enter') return;
          e.preventDefault();
          chooseSinger(item.dataset.singerId);
        });
      }
      resolveSinger();
    }

  }

  /** Modal com os vídeos vinculados à música e o link de busca automática. */
  function openVideosModal(songId) {
    var song = getSong(songId);
    if (!song) return;
    var vids = song.youtubeVideos || [];

    var body =
      '<div class="callout"><strong>Busca automática:</strong> ao salvar a música, geramos um link de pesquisa com o título ' +
      'e o cantor. Abra-o para encontrar interpretações e aulas dessa música no YouTube.</div>' +
      '<div style="margin-bottom:18px"><a class="btn btn-primary" href="' + escapeHtml(safeUrl(videoSearchUrl(song))) +
      '" target="_blank" rel="noopener noreferrer">' + icon('search') + ' Buscar no YouTube</a></div>' +
      '<h3 style="font-size:15px;margin:0 0 10px">Vídeos vinculados (' + vids.length + ')</h3>';
    if (vids.length) {
      body += '<div class="video-list">' + vids.map(function (v) {
        var url = safeUrl(v.url) || YouTube.watchUrl(v.id);
        var thumb = safeUrl(v.thumb) || YouTube.thumbUrl(v.id);
        return '<div class="video-card">' +
          '<a href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">' +
          '<img class="video-thumb" src="' + escapeHtml(thumb) + '" alt="" loading="lazy"></a>' +
          '<div class="video-info"><strong>' + escapeHtml(v.title) + '</strong>' +
          '<div class="small muted">' + escapeHtml(v.channel || 'YouTube') + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:6px">' +
          '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(url) + '" target="_blank" rel="noopener noreferrer">Assistir</a>' +
          '<button type="button" class="btn btn-danger btn-sm" data-action="remove-video" data-id="' + escapeHtml(song.id) +
          '" data-video="' + escapeHtml(v.id) + '">Remover</button>' +
          '</div></div></div>';
      }).join('') + '</div>';
    } else {
      body += '<div class="empty">Nenhum vídeo vinculado. Use o campo abaixo ou o botão de busca.</div>';
    }
    body += '<hr class="divider">' +
      '<div class="field"><label for="videoUrlInput">Adicionar vídeo</label>' +
      '<input name="videoUrl" id="videoUrlInput" placeholder="Cole a URL do YouTube ou o ID de 11 caracteres"></div>';

    openModal({
      title: 'Vídeos — ' + song.title,
      bodyHtml: body,
      submitLabel: 'Adicionar vídeo',
      onSubmit: function (e) {
        e.preventDefault();
        var input = $('#modalForm [name=videoUrl]');
        var id = YouTube.parseVideoId(input && input.value);
        if (!id) { toast('Link inválido. Use uma URL do YouTube ou o ID de 11 caracteres.'); return; }
        var submit = $('#modalSubmit');
        var token = modalToken;
        submit.disabled = true;
        submit.textContent = 'Buscando vídeo...';
        YouTube.enrich(id).then(function (v) {
          if (token !== modalToken) return;
          if (!song.youtubeVideos) song.youtubeVideos = [];
          if (!song.youtubeVideos.some(function (x) { return x.id === id; })) song.youtubeVideos.push(v);
          save(); closeModal(); render(); openVideosModal(song.id); toast('Vídeo adicionado.');
        });
      }
    });
  }

  /* =========================== PRÁTICA =========================== */
  function renderPractice(container, actions) {
    if (practice.step === 'rate') return renderRateStep(container, actions);
    if (practice.step === 'result') return renderResultStep(container, actions);
    renderSetupStep(container, actions);
  }

  function renderSetupStep(container, actions) {
    actions.innerHTML = '<button class="btn" data-action="open-method">' + icon('info') + ' Como funciona</button>';

    var due = dueSongs();
    var today = new Date().toDateString();
    var practicedToday = state.sessions.filter(function (session) {
      return new Date(session.date).toDateString() === today;
    }).length;

    var html = '<div class="practice-setup">';
    html += '<section class="practice-summary">' +
      '<div class="practice-summary-top">' +
      '<div><p class="page-eyebrow">Sessão de ensaio</p>' +
      '<h2>' + (due.length ? 'Escolha por onde começar' : 'Nada pendente — pratique à vontade') + '</h2>' +
      '<p class="muted">' + (due.length
        ? 'Comece pelas revisões pendentes ou escolha qualquer música do repertório.'
        : 'Você pode ensaiar qualquer música do repertório para reforçar a memória.') + '</p></div>' +
      (due.length ? '<button class="btn btn-primary" data-action="practice-song" data-id="' + escapeHtml(due[0].id) + '">' +
        icon('play') + ' Praticar próxima</button>' : '') +
      '</div>' +
      '<div class="practice-summary-stats">' +
      statCard('Pendentes', due.length, due.length ? 'warning' : '') +
      statCard('Ensaiadas hoje', practicedToday, practicedToday ? 'success' : '') +
      statCard('Domínio médio', avgMastery() + '%', 'primary') +
      '</div></section>';

    html += '<div class="section"><div class="section-heading-row">' +
      '<h2 class="section-title">Revisões pendentes (' + due.length + ')</h2>' +
      tip('Uma revisão fica pendente quando o intervalo do cartão SM-2 vence. Quanto antes você avaliar, mais confiável fica o agendamento.') +
      '</div>';
    if (!due.length) {
      html += '<div class="empty"><span class="empty-mark">' + icon('check') + '</span>' +
        'Nenhuma revisão pendente. Use a busca abaixo para praticar qualquer música.</div>';
    } else {
      html += '<div class="song-picker">';
      due.forEach(function (s) {
        var card = ensureCard(s);
        var units = (s.sections || []).filter(function (u) { return u && u.name; }).length;
        html += '<div class="pick-row">' + avatarHtml(getSinger(s.singerId), 36) +
          '<div class="pick-info"><strong>' + escapeHtml(s.title) + '</strong>' +
          '<small>' + escapeHtml(singerName(s.singerId)) + ' · ' + dueLabel(card) +
          (s.key ? ' · Tom ' + escapeHtml(s.key) : '') +
          (units ? ' · ' + units + (units === 1 ? ' trecho' : ' trechos') : '') + '</small></div>' +
          '<button class="btn btn-primary btn-sm" data-action="practice-song" data-id="' + escapeHtml(s.id) + '">' +
          icon('play') + ' Praticar</button></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    var query = norm(practiceSearchTerm).trim();
    var others = state.songs.filter(function (s) {
      if (!query) return true;
      return norm(s.title + ' ' + singerName(s.singerId) + ' ' + (s.genre || '')).indexOf(query) !== -1;
    }).sort(function (a, b) {
      return String(a.title).localeCompare(String(b.title), 'pt-BR', { sensitivity: 'base' });
    });

    html += '<div class="section"><div class="section-heading-row">' +
      '<h2 class="section-title">Praticar outra música</h2>' +
      tip('Ensaios extras não substituem as revisões: eles apenas atualizam o cartão da música escolhida.') +
      '</div>' +
      '<div class="filters practice-filters">' +
      '<input id="practiceSearch" class="search" aria-label="Buscar música para praticar" ' +
      'placeholder="Buscar música ou cantor..." value="' + escapeHtml(practiceSearchTerm) + '">' +
      '<span class="list-count">' + others.length + (others.length === 1 ? ' música' : ' músicas') + '</span>' +
      '</div>';

    if (!state.songs.length) {
      html += '<div class="empty"><span class="empty-mark">' + icon('music') + '</span>' +
        'Cadastre uma música primeiro.</div>';
    } else if (!others.length) {
      html += '<div class="empty">Nenhuma música corresponde à busca.</div>';
    } else {
      html += '<div class="song-picker">';
      others.forEach(function (s) {
        var card = ensureCard(s);
        html += '<div class="pick-row">' + avatarHtml(getSinger(s.singerId), 36) +
          '<div class="pick-info"><strong>' + escapeHtml(s.title) + '</strong>' +
          '<small>' + escapeHtml(singerName(s.singerId)) + ' · Domínio ' + SRS.mastery(card) + '% · ' +
          'Próxima: ' + formatDay(card.due) + '</small></div>' +
          '<button class="btn btn-sm" data-action="practice-song" data-id="' + escapeHtml(s.id) + '">' +
          icon('play') + ' Praticar</button></div>';
      });
      html += '</div>';
    }
    html += '</div></div>';

    container.innerHTML = html;
  }

  function renderRateStep(container, actions) {
    var song = getSong(practice.songId);
    if (!song) { practice.step = 'setup'; return renderSetupStep(container, actions); }
    var card = ensureCard(song);
    var units = practiceUnits(song);
    if (!practice.activeUnit || !units.some(function (u) { return u.id === practice.activeUnit; })) {
      practice.activeUnit = units[0].id;
    }
    var rated = units.filter(function (u) { return practice.ratings[u.id] != null; }).length;
    var labels = ['Esqueci', 'Muito difícil', 'Difícil', 'Razoável', 'Bom', 'Perfeito'];

    actions.innerHTML =
      '<button class="btn" data-action="stage-song" data-id="' + escapeHtml(song.id) + '">' +
      icon('stage') + ' Ver letra no palco</button>' +
      '<button class="btn btn-ghost" data-action="practice-cancel">Cancelar</button>';

    var html = '<div class="practice-setup practice-grid">';
    html += '<div class="practice-main">';

    html += '<div class="panel practice-song-head">' +
      '<div class="section-heading-row"><h3>' + escapeHtml(song.title) + '</h3>' + tip(
        'Cante cada trecho sem consultar a letra e dê uma nota de 0 (esqueci) a 5 (perfeito). ' +
        'A nota alimenta diretamente o agendamento SM-2.') + '</div>' +
      '<p class="muted">' + escapeHtml(singerName(song.singerId)) +
      (song.key ? ' · <span class="chip key">' + escapeHtml(song.key) + '</span>' : '') +
      ' · Domínio atual: ' + SRS.mastery(card) + '% · Revisão: ' + dueLabel(card) + '</p>' +
      '<div class="rate-progress">' +
      '<div class="rate-progress-top"><span>Trechos avaliados</span><strong>' + rated + ' / ' + units.length + '</strong></div>' +
      '<div class="readiness' + (rated === units.length ? ' good' : '') + '"><span style="width:' +
      Math.round(rated / units.length * 100) + '%"></span></div>' +
      '</div></div>';

    html += '<div class="section-heading-row rate-heading">' +
      '<h2 class="section-title">Avaliação dos trechos</h2>' +
      tip('Use as teclas 0 a 5 para avaliar o trecho destacado. ' +
        'O foco avança automaticamente para o próximo trecho ainda não avaliado.') + '</div>';

    html += '<div class="field-row rate-all-row">' +
      '<button class="btn btn-sm btn-rate-all" data-action="rate-all" data-q="3">' +
      icon('check') + ' Marcar todos como Razoável (3)</button>' +
      '<span class="small muted">Atalho: pressione 3 com um trecho em foco.</span></div>';

    units.forEach(function (u, i) {
      var sel = practice.ratings[u.id];
      var conf = Number(u.confidence);
      if (!isFinite(conf)) conf = 3;
      html += '<div class="section-review' + (practice.activeUnit === u.id ? ' active' : '') + '" ' +
        'data-unit-wrap="' + escapeHtml(u.id) + '">' +
        '<div class="review-heading"><h4><span class="unit-tag">' + markLetter(i) + '</span> ' +
        escapeHtml(u.name) + '</h4>' +
        tip('Confiança anterior: ' + conf + '/5. Compare com o que você sente agora.') + '</div>' +
        '<div class="rating-group">';
      for (var q = 0; q <= 5; q++) {
        html += '<button type="button" class="rating-btn' + (sel === q ? ' selected' : '') +
          '" data-action="rate" data-unit="' + escapeHtml(u.id) + '" data-q="' + q + '" ' +
          'aria-pressed="' + (sel === q ? 'true' : 'false') + '" title="' + labels[q] + '">' +
          q + ' <span>' + labels[q] + '</span></button>';
      }
      html += '</div></div>';
    });

    html += '<div class="practice-actions">' +
      '<button class="btn btn-primary" data-action="finish-practice">' + icon('check') + ' Concluir prática</button>' +
      '<button class="btn btn-ghost" data-action="practice-cancel">Cancelar</button></div>';
    html += '</div>';

    html += '<aside class="practice-side">' +
      '<div class="panel circle-panel">' +
      '<div class="section-heading-row"><h3>Ciclo das quintas</h3>' +
      tip('A tonalidade relativa divide o mesmo círculo: a borda mostra os tons maiores e o interior, os menores. ' +
        'Use o diagrama para visualsar o tom desta música e seu relativo.') + '</div>' +
      circleOfFifthsSvg(song.key) +
      '<p class="small muted">' + escapeHtml(keyCaption(song.key)) + '</p>' +
      '</div>' +
      '<div class="panel"><h3>Dica de execução</h3>' +
      '<p class="small">Trechos com confiança baixa merecem atenção primeiro. ' +
      'Depois de avaliar, o sistema agenda a próxima revisão e destaca o que ficou fraco no resultado.</p>' +
      '<button class="btn btn-sm" data-action="stage-song" data-id="' + escapeHtml(song.id) + '">' +
      icon('stage') + ' Abrir letra no palco</button></div>' +
      '</aside></div>';

    container.innerHTML = html;
  }

  function renderResultStep(container, actions) {
    var r = practice.result;
    var repeatId = practice.songId;
    var repeatSong = repeatId ? getSong(repeatId) : null;
    actions.innerHTML =
      (repeatSong ? '<button class="btn" data-action="repeat-song" data-id="' + escapeHtml(repeatId) + '">' +
        icon('refresh') + ' Repetir esta música</button>' : '') +
      '<button class="btn btn-primary" data-action="practice-again">' + icon('plus') + ' Praticar outra</button>';
    var resultIcon = r.avg >= 4 ? 'spark' : r.avg >= 3 ? 'check' : 'practice';
    var msg = r.avg >= 4 ? 'Excelente! A memória foi consolidada.' : r.avg >= 3 ? 'Bom trabalho! Continue assim.' : 'Tudo bem — revisões mais cedo aceleram a fixação.';

    var html = '<div class="practice-setup"><div class="panel big-result">' +
      '<div class="result-mark">' + icon(resultIcon) + '</div><h2>' + msg + '</h2>' +
      '<p class="muted">Nota média desta sessão: <strong>' + r.avg.toFixed(1) + ' / 5</strong></p>' +
      '</div>';

    html += '<div class="stats">' +
      statCard('Próxima revisão', formatDay(r.due), '') +
      statCard('Intervalo', SRS.formatInterval(r.interval), 'accent') +
      statCard('Domínio estimado', r.mastery + '%', 'primary') +
      '</div>';

    html += '<div class="callout accent"><strong>Recomendação:</strong> ' + escapeHtml(r.recommendation) + '</div>';

    if (r.weak && r.weak.length) {
      html += '<div class="panel"><h3>Trechos que precisam de atenção</h3><p>' +
        r.weak.map(function (w) { return escapeHtml(w.name) + ' (' + w.quality + '/5)'; }).join(' · ') +
        '</p><p class="small muted">Prática deliberada: direcione seu próximo estudo a esses trechos, trabalhando logo além da sua zona de conforto, com feedback constante.</p></div>';
    }

    html += '<div class="panel"><h3>Evolução do agendamento</h3>' +
      '<p class="muted">Fator de facilidade (ease): <strong>' + r.ease.toFixed(2) + '</strong> · ' +
      'Revisões bem-sucedidas: <strong>' + r.reps + '</strong> · ' +
      'Lapses: <strong>' + r.lapses + '</strong></p>' +
      '<p class="small muted">Intervalo anterior: ' + SRS.formatInterval(r.prevInterval) + ' → novo intervalo: ' + SRS.formatInterval(r.interval) + '</p></div>';

    html += '<div class="practice-actions"><button class="btn btn-ghost" data-action="goto-songs">' +
      icon('library') + ' Voltar ao repertório</button></div></div>';
    container.innerHTML = html;
  }

  /* =========================== COMO FUNCIONA / MÉTODO =========================== */
  function renderMethod(container, actions) {
    actions.innerHTML = '<button class="btn" data-action="goto-practice">&larr; Voltar às revisões</button>';

    var html = '<h2 class="section-title">Como funciona</h2>' +
      '<div class="panel"><p>Escolha uma música, avalie sua execução de <strong>0</strong> (esqueci) a <strong>5</strong> (perfeito) ' +
      'e o sistema aplica o algoritmo SM-2 para agendar a próxima revisão no intervalo ideal. ' +
      'Quanto melhor a nota, mais tempo se passa até a próxima revisão; se você errar, a música volta em 1 dia.</p>' +
      '<p class="small muted">Uma revisão pendente aparece como um ponto ao lado da música no repertório. Use "Revisar" para abrir a sessão.</p></div>';

    html += '<div class="callout"><strong>Síntese:</strong> o sistema combina <em>repetição espaçada</em> (quando praticar) com ' +
      '<em>prática deliberada</em> (o que praticar dentro da sessão). O primeiro cuida da retenção de longo prazo; ' +
      'o segundo, da melhoria da execução.</div>';

    html += '<div class="method-block">' +
      '<div class="panel"><h3>1. Efeito do espaçamento — Ebbinghaus (1885)</h3>' +
      '<p>A "curva do esquecimento" mostra que memórias recém-adquiridas decaem rapidamente se não forem revisadas. ' +
      'Revisões distribuídas no tempo (spaced) geram retenção muito superior a revisões concentradas (massed).</p>' +
      '<p>Implementação: cada música tem um cartão com um <strong>intervalo</strong> que cresce a cada acerto (1 → 6 → 6×ease dias).</p></div>' +

      '<div class="panel"><h3>2. Efeito do teste — Roediger &amp; Karpicke (2006)</h3>' +
      '<p>Recuperar a informação da memória ("testar-se") é mais eficaz que apenas reler. Cada sessão aqui é um teste ativo: ' +
      'você executa/canta sem consultar e atribui uma nota de 0 a 5.</p>' +
      '<p>Implementação: a nota alimenta diretamente o algoritmo de agendamento.</p></div>' +

      '<div class="panel"><h3>3. Algoritmo SM-2 — Wozniak (SuperMemo)</h3>' +
      '<p>O intervalo é ajustado por um <strong>fator de facilidade (ease)</strong>, atualizado pela fórmula:</p>' +
      '<div class="callout">EF\' = EF + [0,1 − (5−q)(0,08 + (5−q)·0,02)]<br><span class="small">onde q é a nota de 0 a 5; EF mínimo = 1,3.</span></div>' +
      '<p>Notas ≥ 3 aumentam o intervalo; notas &lt; 3 reiniciam a sequência (lapse) e agendam revisão para amanhã.</p></div>' +

      '<div class="panel"><h3>4. Prática deliberada — Ericsson</h3>' +
      '<p>Não basta repetir: é preciso focar nos pontos fracos, trabalhar pouco além da zona de conforto e receber feedback. ' +
      'Dividir a música em trechos e notar cada um permite identificar o que precisa de atenção.</p>' +
      '<p>Implementação: campos de "trechos" por música, nota por trecho e lista de trechos fracos ao final da sessão.</p></div>' +
      '</div>';

    html += '<hr class="divider">';
    html += '<h2 class="section-title">Exemplo numérico</h2>' +
      '<div class="panel"><p>Música nova, EF = 2,5, intervalo = 0:</p>' +
      '<p>1ª sessão (nota 4) → intervalo <strong>1 dia</strong>, EF ≈ 2,50<br>' +
      '2ª sessão (nota 5) → intervalo <strong>6 dias</strong>, EF ≈ 2,60<br>' +
      '3ª sessão (nota 4) → intervalo <strong>≈ 16 dias</strong> (6 × 2,60), EF ≈ 2,60<br>' +
      '4ª sessão (nota 2) → <em>lapse</em>: sequência zera, intervalo <strong>1 dia</strong>, EF ≈ 2,36</p>' +
      '<p class="small muted">Esse mecanismo revisa o que está sendo esquecido e afasta o que já está consolidado — otimizando o tempo de estudo.</p></div>';

    html += '<div class="callout accent"><strong>Por que científico e não aleatório?</strong> Cada decisão do sistema (o dia da próxima revisão, o tamanho do intervalo, a penalidade por erro) ' +
      'segue uma regra derivada de modelos empíricos validados em psicologia cognitiva e amplamente usados em software educacional (Anki, SuperMemo).</div>';

    container.innerHTML = html;
  }

  /* =========================== DADOS =========================== */
  function addDebugData() {
    if (state.singers.some(function (s) { return /\(teste\)$/.test(s.name); })) {
      toast('Os dados de teste já foram adicionados.');
      return;
    }
    var now = new Date().toISOString();
    var s1 = { id: Store.generateId('singer'), name: 'Chico Buarque (teste)', genre: 'MPB',
      notes: 'Cantor e compositor brasileiro — biografia de exemplo.', photo: null, photoUrl: null,
      photoSource: null, photoMissing: true, photoUpdatedAt: now };
    var s2 = { id: Store.generateId('singer'), name: 'Maria Bethânia (teste)', genre: 'MPB',
      notes: 'Cantora brasileira — biografia de exemplo.', photo: null, photoUrl: null,
      photoSource: null, photoMissing: true, photoUpdatedAt: now };
    var s3 = { id: Store.generateId('singer'), name: 'Djavan (teste)', genre: 'MPB',
      notes: 'Cantor e compositor brasileiro — biografia de exemplo.', photo: null, photoUrl: null,
      photoSource: null, photoMissing: true, photoUpdatedAt: now };

    var video1 = { id: 'dQw4w9WgXcQ', url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
      thumb: 'https://i.ytimg.com/vi/dQw4w9WgXcQ/hqdefault.jpg', title: 'Vídeo de exemplo 1', channel: 'Canal Teste' };
    var video2 = { id: '9bZkp7q19f0', url: 'https://www.youtube.com/watch?v=9bZkp7q19f0',
      thumb: 'https://i.ytimg.com/vi/9bZkp7q19f0/hqdefault.jpg', title: 'Vídeo de exemplo 2', channel: 'Canal Teste' };

    var songs = [
      { id: Store.generateId('song'), title: 'Construção (teste)', singerId: s1.id, genre: 'MPB',
        key: 'Fm', keyName: 'Fá menor', keySource: 'Estimativa por áudio (teste)', duration: 6.38,
        createdAt: '2026-11-15T14:30:00.000Z',
        lyrics: 'Amou daquela vez como se fosse a última\nBeijou sua mulher como se fosse a última\nE cada filho seu como se fosse o único.',
        lyricsSource: 'LRCLIB (teste)', youtubeVideos: [video1, video2] },
      { id: Store.generateId('song'), title: 'Águas de Março (teste)', singerId: s3.id, genre: 'Bossa Nova',
        key: 'F#m', keyName: 'Fá# menor', duration: 4.55, createdAt: '2026-11-12T10:15:00.000Z',
        lyrics: 'É pau, é pedra, é o fim do caminho\nÉ um resto de toco, é um pouco sozinho.',
        lyricsSource: 'LRCLIB (teste)', youtubeVideos: [] },
      { id: Store.generateId('song'), title: 'O Bêbado e a Equilibrista (teste)', singerId: s2.id, genre: 'MPB',
        key: 'Am', keyName: 'Lá menor', duration: 4.2, createdAt: '2026-11-10T09:00:00.000Z',
        lyrics: '', lyricsSource: '', youtubeVideos: [] },
      { id: Store.generateId('song'), title: 'Cigano (teste)', singerId: s3.id, genre: 'Popular',
        key: 'Cm', keyName: 'Dó menor', duration: 4.43, createdAt: '2026-11-08T18:45:00.000Z',
        lyrics: '', lyricsSource: '', youtubeVideos: [video2] }
    ];
    songs.forEach(function (s) { s.card = SRS.newCard(s.id); });
    // Uma música já em dia para exercitar o filtro de revisões pendentes.
    songs[1].card.due = SRS.todayIndex() + 12;
    songs[1].card.interval = 12;
    songs[1].card.repetitions = 3;
    songs[1].card.history.push({ day: SRS.todayIndex() - 2, quality: 5, interval: 12, ease: 2.6 });

    state.singers.push(s1, s2, s3);
    state.songs.push.apply(state.songs, songs);
    save(); render();
    toast('Dados de teste adicionados: 3 cantores e 4 músicas.');
  }

  function renderData(container, actions) {
    actions.innerHTML = '';
    var bytes = Store.estimateSize(state);
    var localLimit = 5 * 1024 * 1024; // limite típico do localStorage por origem
    var pct = Math.min(100, Math.round(bytes / localLimit * 100));
    var fmtBytes = function (n) {
      if (n < 1024) return n + ' B';
      if (n < 1024 * 1024) return (n / 1024).toFixed(1) + ' KB';
      return (n / (1024 * 1024)).toFixed(2) + ' MB';
    };

    var html = '<div class="panel"><h3>Exportar / Importar</h3>' +
      '<p class="muted">Seus dados ficam armazenados neste navegador (localStorage). Exporte um backup em JSON para não perdê-los ou para migrar de dispositivo.</p>' +
      '<p class="small muted">A importação valida e sanitiza o arquivo antes de substituir os dados atuais. Faça um backup sempre que possível.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-action="export-data">' + icon('download') + ' Exportar JSON</button>' +
      '<button class="btn btn-ghost" data-action="import-data">' + icon('upload') + ' Importar JSON</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '</div></div>';

    html += '<div class="panel"><h3>Resumo do armazenamento</h3>' +
      '<p class="muted">Cantores: <strong>' + state.singers.length + '</strong> · Músicas: <strong>' + state.songs.length +
      '</strong> · Sessões de prática: <strong>' + state.sessions.length + '</strong></p>' +
      '<div class="storage-meter" role="img" aria-label="Armazenamento usado: ' + pct + '% do limite típico"><span style="width:' + pct + '%"></span></div>' +
      '<p class="small muted">' + fmtBytes(bytes) + ' de aproximadamente ' + fmtBytes(localLimit) +
      ' (' + pct + '%) · limite típico do navegador. Fotos armazenadas ocupam mais espaço.</p>' +
      (pct >= 80 ? '<p class="small" style="color:var(--danger)">O armazenamento está quase cheio. Exporte um backup e remova fotos grandes.</p>' : '') +
      '</div>';

    html += '<div class="panel"><h3>Dados de teste (debug)</h3>' +
      '<p class="muted">Adiciona alguns cantores e músicas de exemplo para testar a listagem, filtros, resumo e revisões. Não apaga seus dados atuais.</p>' +
      '<button class="btn" data-action="add-debug-data">Adicionar dados de teste</button></div>';

    html += '<div class="panel"><h3 style="color:var(--danger)">Zona de risco</h3>' +
      '<p class="muted">Apaga todos os cantores, músicas e histórico. Esta ação não pode ser desfeita.</p>' +
      '<button class="btn btn-danger" data-action="reset-data">Redefinir todos os dados</button></div>';

    container.innerHTML = html;

    $('#importFile').addEventListener('change', function (e) {
      var input = e.target;
      var file = input.files && input.files[0];
      if (!file) return;
      input.value = ''; // permite selecionar o mesmo arquivo novamente

      if (file.size > 15 * 1024 * 1024) {
        toast('Arquivo muito grande (limite de 15 MB).');
        return;
      }
      if ((state.songs.length || state.singers.length) &&
          !confirm('Importar este backup substituirá todo o repertório atual (' +
            state.songs.length + (state.songs.length === 1 ? ' música' : ' músicas') + ' e ' +
            state.singers.length + (state.singers.length === 1 ? ' cantor' : ' cantores') +
            '). Deseja continuar?')) {
        return;
      }

      var reader = new FileReader();
      reader.onload = function () {
        var result;
        try {
          result = Store.sanitizeState(JSON.parse(reader.result));
        } catch (err) {
          toast('Arquivo JSON inválido: ' + err.message);
          return;
        }
        if (!result.ok) {
          toast('Erro ao importar: ' + result.error);
          return;
        }
        state = result.state;
        state.songs.forEach(ensureCard);
        currentSongId = null;
        currentVideoId = null;
        if (!save()) return;
        navigate('songs');
        var ignorados = result.warnings.length;
        var nSongs = state.songs.length;
        var nSingers = state.singers.length;
        toast('Backup importado: ' + nSongs + (nSongs === 1 ? ' música' : ' músicas') +
          ' e ' + nSingers + (nSingers === 1 ? ' cantor' : ' cantores') + '.' +
          (ignorados ? ' ' + ignorados + ' item(ns) inválido(s) ignorado(s).' : ''));
        if (ignorados) console.warn('Importação:', result.warnings);
      };
      reader.onerror = function () {
        toast('Não foi possível ler o arquivo.');
      };
      reader.readAsText(file);
    });
  }

  /* =========================== PALETA DE COMANDOS =========================== */
  function paletteCommands() {
    var cmds = [
      { group: 'Ir para', icon: 'home', label: 'Hoje', hint: 'visão geral', run: function () { navigate('dashboard'); } },
      { group: 'Ir para', icon: 'library', label: 'Repertório', hint: 'músicas e cantores', run: function () { navigate('songs'); } },
      { group: 'Ir para', icon: 'stage', label: 'Palco', hint: 'modo apresentação', run: function () { navigate('stage'); } },
      { group: 'Ir para', icon: 'practice', label: 'Ensaios', hint: 'revisões espaçadas', run: function () { navigate('practice'); } },
      { group: 'Ir para', icon: 'settings', label: 'Ajustes', hint: 'backup e dados', run: function () { navigate('data'); } },
      { group: 'Ações', icon: 'plus', label: 'Nova música', hint: 'cadastrar', run: function () { songModal(null); } },
      { group: 'Ações', icon: 'users', label: 'Novo cantor', hint: 'cadastrar', run: function () { singerModal(null); } },
      { group: 'Ações', icon: 'moon', label: 'Alternar tema claro/noturno', hint: 'aparência', run: function () {
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
      } },
      { group: 'Ações', icon: 'refresh', label: 'Exportar backup JSON', hint: 'dados', run: exportData }
    ];
    state.songs.forEach(function (song) {
      cmds.push({
        group: 'Músicas', icon: 'music', label: song.title,
        hint: singerName(song.singerId) + (song.key ? ' · ' + song.key : ''),
        run: function () { currentSongId = song.id; currentVideoId = null; navigate('song'); }
      });
    });
    state.singers.forEach(function (sg) {
      cmds.push({
        group: 'Cantores', icon: 'users', label: sg.name,
        hint: 'ver músicas',
        run: function () {
          songFilters.singer = sg.id; songFilters.genre = ''; songFilters.dueOnly = false;
          searchTerm = ''; repertoireTab = 'songs'; navigate('songs');
        }
      });
    });
    return cmds;
  }

  function paletteResults(query) {
    var all = paletteCommands();
    var q = norm(query || '').trim();
    if (!q) return all.slice(0, 14);
    return all.filter(function (item) {
      return norm(item.label + ' ' + item.hint + ' ' + item.group).indexOf(q) !== -1;
    }).slice(0, 20);
  }

  function renderPalette() {
    var list = $('#paletteList');
    if (!list) return;
    var results = paletteResults($('#paletteInput') ? $('#paletteInput').value : '');
    paletteState.items = results;
    if (paletteState.index >= results.length) paletteState.index = Math.max(0, results.length - 1);
    if (!results.length) {
      list.innerHTML = '<li class="palette-empty">Nada encontrado para essa busca.</li>';
      return;
    }
    var lastGroup = null;
    list.innerHTML = results.map(function (item, i) {
      var group = item.group !== lastGroup ? '<li class="palette-group" role="presentation">' + escapeHtml(item.group) + '</li>' : '';
      lastGroup = item.group;
      return group + '<li class="palette-item" role="option" id="paletteOpt' + i + '" data-index="' + i + '" ' +
        'aria-selected="' + (i === paletteState.index) + '">' +
        icon(item.icon) + '<span class="palette-label">' + escapeHtml(item.label) + '</span>' +
        '<span class="palette-hint">' + escapeHtml(item.hint) + '</span></li>';
    }).join('');
    var input = $('#paletteInput');
    if (input) input.setAttribute('aria-activedescendant', 'paletteOpt' + paletteState.index);
  }

  function openPalette() {
    var overlay = $('#paletteOverlay');
    if (!overlay) return;
    paletteState.open = true;
    paletteState.index = 0;
    paletteState.previousFocus = document.activeElement;
    overlay.hidden = false;
    document.body.classList.add('palette-open');
    var input = $('#paletteInput');
    if (input) { input.value = ''; input.focus(); }
    renderPalette();
  }

  function closePalette() {
    var overlay = $('#paletteOverlay');
    if (!overlay || !paletteState.open) return;
    paletteState.open = false;
    overlay.hidden = true;
    document.body.classList.remove('palette-open');
    if (paletteState.previousFocus && paletteState.previousFocus.focus) {
      try { paletteState.previousFocus.focus(); } catch (e) { /* ignore */ }
    }
  }

  function runPaletteItem(index) {
    var item = paletteState.items[index];
    if (!item) return;
    closePalette();
    item.run();
  }

  function movePalette(delta) {
    if (!paletteState.items.length) return;
    var len = paletteState.items.length;
    paletteState.index = (paletteState.index + delta + len) % len;
    renderPalette();
    var active = $('#paletteOpt' + paletteState.index);
    if (active && active.scrollIntoView) active.scrollIntoView({ block: 'nearest' });
  }

  /* =========================== AÇÕES =========================== */
  document.addEventListener('click', function (e) {
    // Navegação
    var nav = e.target.closest('.nav-item');
    if (nav) { navigate(nav.dataset.view); return; }

    var btn = e.target.closest('[data-action]');
    if (!btn) return;
    var action = btn.dataset.action;
    var id = btn.dataset.id;

    switch (action) {
      case 'sort': {
        var key = btn.dataset.sort;
        if (songFilters.sort === key) songFilters.dir = songFilters.dir === 'asc' ? 'desc' : 'asc';
        else { songFilters.sort = key; songFilters.dir = 'asc'; }
        renderSongs($('#viewContainer'), $('#topbarActions'));
        break;
      }
      case 'toggle-theme':
        applyTheme(document.documentElement.getAttribute('data-theme') === 'dark' ? 'light' : 'dark', true);
        break;
      case 'open-palette': openPalette(); break;
      case 'palette-close': closePalette(); break;
      case 'palette-run': runPaletteItem(Number(btn.dataset.index)); break;
      case 'rep-tab':
        repertoireTab = btn.dataset.tab === 'singers' ? 'singers' : 'songs';
        render();
        break;
      case 'goto-practice': navigate('practice'); break;
      case 'goto-stage': navigate('stage'); break;
      case 'open-settings': navigate('data'); break;
      case 'stage-song': openStage(id); break;
      case 'stage-close': closeStage(); break;
      case 'stage-prev': stageStep(-1); break;
      case 'stage-next': stageStep(1); break;
      case 'stage-font': {
        var delta = Number(btn.dataset.delta) || 0;
        stageState.font = Math.max(1, Math.min(3, stageState.font + delta));
        var lyricsBox = $('#stageMode .stage-lyrics');
        if (lyricsBox) lyricsBox.setAttribute('data-size', String(stageState.font));
        break;
      }
      case 'stage-scroll': {
        var scrollBox = $('#stageMode .stage-lyrics');
        if (scrollBox) scrollBox.scrollBy({ top: Number(btn.dataset.delta || 1) * scrollBox.clientHeight * 0.65, behavior: 'smooth' });
        break;
      }
      case 'open-method': navigate('method'); break;
      case 'open-song':
        currentSongId = id;
        currentVideoId = null;
        navigate('song');
        break;
      case 'play-video':
        currentVideoId = btn.dataset.video;
        render();
        break;
      case 'manage-videos': openVideosModal(currentSongId); break;
      case 'filter-singer':
        songFilters.singer = id;
        songFilters.genre = '';
        songFilters.dueOnly = false;
        searchTerm = '';
        navigate('songs');
        break;
      case 'goto-songs': practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null }; navigate('songs'); break;
      case 'goto-dashboard': practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null }; navigate('dashboard'); break;

      case 'add-singer': singerModal(null); break;
      case 'edit-singer': singerModal(getSinger(id)); break;
      case 'retry-photo': singerModal(getSinger(id), true); break;
      case 'delete-singer': {
        var sg = state.singers.find(function (x) { return x.id === id; });
        if (!sg) break;
        var linked = state.songs.filter(function (s) { return s.singerId === id; }).length;
        if (!confirm('Excluir o cantor "' + sg.name + '"?' + (linked ? '\n\n' + linked + ' música(s) ficarão sem cantor associado.' : ''))) break;
        state.singers = state.singers.filter(function (x) { return x.id !== id; });
        state.songs.forEach(function (s) { if (s.singerId === id) s.singerId = null; });
        save(); render(); toast('Cantor excluído.');
        break;
      }

      case 'add-song': songModal(null); break;
      case 'edit-song': songModal(getSong(id)); break;
      case 'enrich-song': {
        var enrichTarget = getSong(id);
        if (!enrichTarget) break;
        if (!enrichTarget.key && !enrichTarget.lyrics && !enrichTarget.singerId) {
          toast('Associe um cantor à música para melhorar a busca automática.');
        }
        enrichSong(enrichTarget, {});
        toast('Buscando tom e letra em segundo plano...');
        break;
      }
      case 'ver-videos': openVideosModal(id); break;
      case 'remove-video': {
        var songVideo = getSong(id);
        if (!songVideo) break;
        songVideo.youtubeVideos = (songVideo.youtubeVideos || []).filter(function (v) {
          return v.id !== btn.dataset.video;
        });
        save(); render(); openVideosModal(id); toast('Vídeo removido.');
        break;
      }
      case 'delete-song': {
        var s = getSong(id);
        if (!s) break;
        if (!confirm('Excluir a música "' + s.title + '"? Seu histórico também será removido.')) break;
        state.songs = state.songs.filter(function (x) { return x.id !== id; });
        state.sessions = state.sessions.filter(function (x) { return x.songId !== id; });
        save(); render(); toast('Música excluída.');
        break;
      }

      case 'practice-song':
        practice = { step: 'rate', songId: id, ratings: {}, result: null, activeUnit: null };
        navigate('practice');
        break;

      case 'pick-song':
        practice = { step: 'rate', songId: id, ratings: {}, result: null, activeUnit: null };
        render();
        break;

      case 'rate':
        practice.ratings[btn.dataset.unit] = Number(btn.dataset.q);
        practice.activeUnit = btn.dataset.unit;
        render();
        focusRating(btn.dataset.unit, btn.dataset.q);
        break;

      case 'rate-all': {
        var q = Number(btn.dataset.q);
        var songAll = getSong(practice.songId);
        if (!songAll) break;
        var unitsAll = practiceUnits(songAll);
        unitsAll.forEach(function (u) { practice.ratings[u.id] = q; });
        practice.activeUnit = unitsAll[0].id;
        render();
        break;
      }

      case 'repeat-song':
        practice = { step: 'rate', songId: id, ratings: {}, result: null, activeUnit: null };
        render();
        break;

      case 'practice-cancel':
        practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null };
        render();
        break;

      case 'finish-practice': finishPractice(); break;

      case 'practice-again':
        practice = { step: 'setup', songId: null, ratings: {}, result: null, activeUnit: null };
        render();
        break;

      case 'add-debug-data': addDebugData(); break;
      case 'export-data': exportData(); break;
      case 'import-data': $('#importFile') && $('#importFile').click(); break;
      case 'reset-data':
        if (confirm('Tem certeza? Todos os dados serão apagados definitivamente.')) {
          if (confirm('Confirme novamente: REDEFINIR todos os dados?')) {
            Store.clear(); state = Store.defaultState(); render(); toast('Dados redefinidos.');
          }
        }
        break;

      case 'modal-cancel':
      case 'modal-close': closeModal(); break;
    }
  });

  // Filtros da listagem de músicas
  document.addEventListener('change', function (e) {
    if (!e.target || currentView !== 'songs') return;
    if (e.target.id === 'filterSinger') songFilters.singer = e.target.value;
    else if (e.target.id === 'filterGenre') songFilters.genre = e.target.value;
    else if (e.target.id === 'filterDue') songFilters.dueOnly = e.target.checked;
    else if (e.target.id === 'sortSelect') {
      var parts = e.target.value.split(':');
      songFilters.sort = parts[0];
      songFilters.dir = parts[1] === 'desc' ? 'desc' : 'asc';
    } else return;
    renderSongs($('#viewContainer'), $('#topbarActions'));
  });

  // Busca em tempo real
  document.addEventListener('input', function (e) {
    if (e.target && e.target.id === 'searchInput') {
      searchTerm = e.target.value;
      var pos = e.target.selectionStart;
      renderSongs($('#viewContainer'), $('#topbarActions'));
      var input = $('#searchInput');
      if (input) { input.focus(); input.setSelectionRange(pos, pos); }
    }
    if (e.target && e.target.id === 'practiceSearch') {
      practiceSearchTerm = e.target.value;
      var caret = e.target.selectionStart;
      renderPractice($('#viewContainer'), $('#topbarActions'));
      var field = $('#practiceSearch');
      if (field) { field.focus(); field.setSelectionRange(caret, caret); }
    }
  });

  // Fechar modal clicando fora / ESC
  $('#modalOverlay').addEventListener('click', function (e) {
    if (e.target === $('#modalOverlay')) closeModal();
  });

  // Paleta de comandos: clique no fundo, nos itens e digitação
  var paletteOverlay = $('#paletteOverlay');
  if (paletteOverlay) {
    paletteOverlay.addEventListener('click', function (e) {
      if (e.target === paletteOverlay) closePalette();
      var item = e.target.closest('.palette-item');
      if (item) runPaletteItem(Number(item.dataset.index));
    });
  }
  var paletteInput = $('#paletteInput');
  if (paletteInput) {
    paletteInput.addEventListener('input', function () {
      paletteState.index = 0;
      renderPalette();
    });
  }
  // Se o embed falhar (ex.: erro 153), troca o player por um poster com link direto.
  window.addEventListener('message', function (e) {
    if (!currentVideoId || !YouTube.isYoutubeOrigin(e.origin)) return;
    var d = e.data;
    if (typeof d === 'string') { try { d = JSON.parse(d); } catch (err) { return; } }
    if (!d || d.event !== 'onError') return;
    var box = $('.mini-player');
    var song = getSong(currentSongId);
    if (!box || !song) return;
    var video = (song.youtubeVideos || []).find(function (v) { return v.id === currentVideoId; });
    if (video) box.innerHTML = playerPosterHtml(video);
  });

  document.addEventListener('keydown', function (e) {
    if ((e.metaKey || e.ctrlKey) && (e.key === 'k' || e.key === 'K')) {
      e.preventDefault();
      if (paletteState.open) closePalette(); else openPalette();
      return;
    }

    if (paletteState.open) {
      if (e.key === 'Escape') { e.preventDefault(); closePalette(); }
      else if (e.key === 'ArrowDown') { e.preventDefault(); movePalette(1); }
      else if (e.key === 'ArrowUp') { e.preventDefault(); movePalette(-1); }
      else if (e.key === 'Enter') { e.preventDefault(); runPaletteItem(paletteState.index); }
      return;
    }

    if (stageState.open) {
      if (e.key === 'Escape') { e.preventDefault(); closeStage(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); stageStep(-1); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); stageStep(1); }
      else if (e.key === '+' || e.key === '=') {
        e.preventDefault();
        stageState.font = Math.min(3, stageState.font + 1);
        var lb = $('#stageMode .stage-lyrics');
        if (lb) lb.setAttribute('data-size', String(stageState.font));
      } else if (e.key === '-') {
        e.preventDefault();
        stageState.font = Math.max(1, stageState.font - 1);
        var lb2 = $('#stageMode .stage-lyrics');
        if (lb2) lb2.setAttribute('data-size', String(stageState.font));
      }
      return;
    }

    if (currentView === 'practice' && practice.step === 'rate' && /^[0-5]$/.test(e.key) &&
        $('#modalOverlay').hidden && e.target &&
        !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      var rateSong = getSong(practice.songId);
      if (rateSong) {
        e.preventDefault();
        var rateUnits = practiceUnits(rateSong);
        var unitId = practice.activeUnit || rateUnits[0].id;
        practice.ratings[unitId] = Number(e.key);
        practice.activeUnit = nextUnratedUnit(rateUnits, unitId);
        render();
        focusRating(unitId, Number(e.key));
      }
    }

    trapModalFocus(e);
    if (e.key === 'Escape' && !$('#modalOverlay').hidden) {
      e.preventDefault();
      closeModal();
    }
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList &&
        e.target.classList.contains('clickable') && e.target.tagName !== 'BUTTON') {
      e.preventDefault();
      e.target.click();
    }
  });

  function finishPractice() {
    var song = getSong(practice.songId);
    if (!song) return;
    var card = ensureCard(song);
    var units = practiceUnits(song);

    var ratings = [];
    for (var i = 0; i < units.length; i++) {
      var q = practice.ratings[units[i].id];
      if (q == null) { toast('Avalie todos os trechos antes de concluir.'); return; }
      ratings.push({ id: units[i].id, name: units[i].name, quality: q });
    }

    var avg = ratings.reduce(function (a, r) { return a + r.quality; }, 0) / ratings.length;
    var prevInterval = card.interval || 0;

    // Atualiza a confiança de cada trecho (escala 1-5)
    ratings.forEach(function (r) {
      var unit = units.find(function (u) { return u.id === r.id; });
      if (unit && unit.id !== 'full') {
        unit.confidence = Math.max(1, Math.min(5, Math.round(r.quality) || 1));
      }
    });

    // Agenda a próxima revisão com SM-2
    song.card = SRS.schedule(card, avg);

    // Registra a sessão
    state.sessions.push({
      id: Store.generateId('session'),
      songId: song.id,
      songTitle: song.title,
      day: SRS.todayIndex(),
      date: new Date().toISOString(),
      avgQuality: Math.round(avg * 100) / 100,
      ratings: ratings,
      prevInterval: prevInterval,
      newInterval: song.card.interval
    });

    save();

    var weak = ratings.filter(function (r) { return r.quality <= 2; })
      .sort(function (a, b) { return a.quality - b.quality; });

    practice.result = {
      avg: avg,
      due: song.card.due,
      interval: song.card.interval,
      prevInterval: prevInterval,
      mastery: SRS.mastery(song.card),
      ease: song.card.ease,
      reps: song.card.repetitions,
      lapses: song.card.lapses,
      recommendation: SRS.recommendation(song.card),
      weak: weak
    };
    practice.step = 'result';
    render();
  }

  function exportData() {
    var blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = 'tocado-' + new Date().toISOString().slice(0, 10) + '.json';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    toast('Backup exportado.');
  }

  /* --------------------------- Inicialização --------------------------- */
  var savedTheme = null;
  try { savedTheme = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
  applyTheme(savedTheme === 'dark' || savedTheme === 'light' ? savedTheme : systemTheme(), false);
  if (themeMedia && themeMedia.addEventListener) {
    themeMedia.addEventListener('change', function () {
      var chosen = null;
      try { chosen = localStorage.getItem(THEME_KEY); } catch (e) { /* ignore */ }
      if (!chosen) applyTheme(systemTheme(), false);
    });
  }
  state.songs.forEach(ensureCard);
  render();

  // PWA: registra o service worker apenas em servidor HTTP(S). Abrir o
  // index.html diretamente pelo sistema de arquivos continua funcionando.
  if ('serviceWorker' in navigator && /^https?:$/.test(location.protocol)) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function (err) {
        console.warn('Service worker não registrado:', err.message);
      });
    });
  }
})();
