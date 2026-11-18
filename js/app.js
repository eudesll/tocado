/* =========================================================================
 * app.js — Controlador da aplicação (SPA)
 * Gerencia estado, renderização das telas e interações do usuário.
 * ========================================================================= */
(function () {
  'use strict';

  var state = Store.load();
  var currentView = 'songs';
  var modalSubmitHandler = null;
  var modalToken = 0; // invalida retornos assíncronos de modais já fechados
  var searchTerm = '';
  var songFilters = { singer: '', genre: '', dueOnly: false, sort: 'title', dir: 'asc' };
  var currentSongId = null;
  var currentVideoId = null;

  // Estado transitório do fluxo de prática
  var practice = { step: 'setup', songId: null, ratings: {}, result: null };

  // Estado transitório da foto no formulário de cantor
  var photoDraft = null;
  var photoSearchToken = 0;
  var photoLastQuery = '';

  /* --------------------------- Utilitários --------------------------- */
  function $(sel, root) { return (root || document).querySelector(sel); }

  function escapeHtml(v) {
    return String(v == null ? '' : v).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  function norm(v) {
    return String(v || '').toLowerCase().normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '').trim();
  }

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
      btn.textContent = theme === 'dark' ? '\u2600\uFE0F' : '\uD83C\uDF19';
      btn.title = 'Tema ' + (theme === 'dark' ? 'noturno' : 'claro') + ' — clique para alternar';
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
    var src = singer && (singer.photo || singer.photoUrl);
    var style = 'width:' + size + 'px;height:' + size + 'px;flex-shrink:0';
    if (!src) {
      var initial = singer && singer.name ? singer.name.charAt(0).toUpperCase() : '?';
      return '<span class="avatar avatar-placeholder" style="' + style + '">' + escapeHtml(initial) + '</span>';
    }
    return '<img class="avatar" style="' + style + '" src="' + escapeHtml(src) +
      '" alt="Foto de ' + escapeHtml(singer.name) + '">';
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

  function masteryBar(song) {
    var m = SRS.mastery(ensureCard(song));
    return '<div class="mastery-row"><div class="progress"><span style="width:' + m + '%"></span></div>' +
      '<span class="mastery-num">' + m + '%</span></div>';
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
    var submit = $('#modalSubmit');
    submit.disabled = false;   // nunca herda o estado "carregando" do modal anterior
    submit.hidden = false;
    submit.textContent = opts.submitLabel || 'Salvar';
    $('#modalTitle').textContent = opts.title;
    $('#modalBody').innerHTML = opts.bodyHtml || '';
    modalSubmitHandler = opts.onSubmit || null;
    $('#modalOverlay').hidden = false;
    var first = $('#modalBody input, #modalBody select, #modalBody textarea');
    if (first) setTimeout(function () { first.focus(); }, 30);
  }

  function closeModal() {
    modalToken++;              // retornos pendentes de modais antigos são ignorados
    photoSearchToken++;
    $('#modalOverlay').hidden = true;
    modalSubmitHandler = null;
    var submit = $('#modalSubmit');
    submit.disabled = false;
  }

  $('#modalForm').addEventListener('submit', function (e) {
    e.preventDefault();
    if (typeof modalSubmitHandler === 'function') modalSubmitHandler(e);
  });

  /* --------------------------- Navegação --------------------------- */
  var viewMeta = {
    songs: { title: 'Músicas', sub: 'Todas as músicas do seu repertório' },
    singers: { title: 'Cantores', sub: 'Os intérpretes do seu repertório' },
    dashboard: { title: 'Resumo', sub: 'Um panorama simples do seu repertório' },
    practice: { title: 'Revisões', sub: 'Prática espaçada — uma funcionalidade opcional' },
    song: { title: 'Música', sub: 'Resumo e vídeos da música' },
    method: { title: 'Como funciona', sub: 'O método por trás do sistema de revisões' },
    data: { title: 'Dados', sub: 'Exporte, importe ou reinicie seu repertório' }
  };

  function navigate(view) {
    if (!viewMeta[view]) return;
    currentView = view;
    document.querySelectorAll('.nav-item').forEach(function (b) {
      b.classList.toggle('active', b.dataset.view === view);
    });
    $('#viewTitle').textContent = viewMeta[view].title;
    $('#viewSubtitle').textContent = viewMeta[view].sub;
    render();
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
      case 'practice': renderPractice(container, actions); break;
      case 'song': renderSongSummary(container, actions); break;
      case 'method': renderMethod(container, actions); break;
      case 'data': renderData(container, actions); break;
    }
    updateBadge();
  }

  /* =========================== RESUMO =========================== */
  function renderDashboard(container, actions) {
    var due = dueSongs();
    var generos = {};
    state.songs.forEach(function (s) { if (s.genre) generos[s.genre] = 1; });

    actions.innerHTML = '<button class="btn" data-action="goto-songs">Ir para o repertório</button>';

    var html = '<div class="stats">' +
      statCard('Músicas', state.songs.length) +
      statCard('Cantores', state.singers.length) +
      statCard('Gêneros', Object.keys(generos).length) +
      '</div>';

    html += '<div class="panel"><h3>Atividade</h3>' + activityCalendar(allActivityEvents(), 16) + '</div>';

    html += '<div class="section"><h2 class="section-title">Últimas músicas adicionadas</h2>';
    if (!state.songs.length) {
      html += '<div class="empty">Seu repertório está vazio.</div>';
    } else {
      var recentes = state.songs.slice().sort(function (a, b) {
        return (Date.parse(b.createdAt) || 0) - (Date.parse(a.createdAt) || 0);
      }).slice(0, 5);
      html += '<div class="song-list">' + recentes.map(function (s) {
        return '<div class="song-row"><div class="song-main">' +
          '<div class="song-title">' + escapeHtml(s.title) + '</div>' +
          '<div class="song-artist">' + escapeHtml(singerName(s.singerId)) +
          ' · Adicionada em ' + formatDateTime(s.createdAt) + '</div></div>' +
          '<div class="song-meta">' +
          (s.key ? '<span class="chip key">' + escapeHtml(s.key) + '</span>' : '') +
          (s.genre ? '<span class="chip">' + escapeHtml(s.genre) + '</span>' : '') +
          '</div></div>';
      }).join('') + '</div>';
    }
    html += '</div>';

    html += '<div class="section"><h2 class="section-title">Revisões <span class="small muted">· opcional</span></h2>' +
      '<div class="panel"><p>' + due.length + (due.length === 1 ? ' música com revisão pendente.' : ' músicas com revisão pendente.') + '</p>' +
      '<button class="btn btn-sm" data-action="goto-practice">Abrir revisões</button></div></div>';

    container.innerHTML = html;
  }

  function statCard(label, value) {
    return '<div class="stat"><div class="stat-label">' + label + '</div>' +
      '<div class="stat-value">' + value + '</div></div>';
  }

  /* =========================== CANTORES =========================== */
  function renderSingers(container, actions) {
    actions.innerHTML = '<button class="btn btn-primary" data-action="add-singer">+ Cantor</button>';
    var html = '';
    if (!state.singers.length) {
      html = '<div class="empty"><span class="emoji">&#128100;</span>Nenhum cantor cadastrado.</div>';
    } else {
      html = '<div class="singer-list">';
      state.singers.forEach(function (sg) {
        var count = state.songs.filter(function (s) { return s.singerId === sg.id; }).length;
        html += '<div class="singer-row"><div class="singer-head clickable" role="button" tabindex="0" ' +
          'title="Ver músicas de ' + escapeHtml(sg.name) + '" data-action="filter-singer" data-id="' + sg.id + '">' + avatarHtml(sg, 44) +
          '<div class="singer-info"><strong>' + escapeHtml(sg.name) + '</strong>' +
          '<div class="small muted">' + count + (count === 1 ? ' música' : ' músicas') +
          (sg.genre ? ' · ' + escapeHtml(sg.genre) : '') + '</div>' +
          (!singerHasPhoto(sg) ? '<div class="tag warning">&#9888; ' +
            (sg.photoMissing ? 'Foto não encontrada' : 'Sem foto') + '</div>' : '') +
          '</div></div>' +
          '<div class="singer-actions">' +
          (!singerHasPhoto(sg) ? '<button class="btn btn-sm" data-action="retry-photo" data-id="' + sg.id + '">Tentar foto</button>' : '') +
          '<button class="btn btn-sm" data-action="edit-singer" data-id="' + sg.id + '">Editar</button>' +
          '<button class="btn btn-sm btn-danger" data-action="delete-singer" data-id="' + sg.id + '">Excluir</button>' +
          '</div></div>';
      });
      html += '</div>';
    }
    container.innerHTML = html;
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
      var src = photoDraft && (photoDraft.dataUrl || photoDraft.url);
      preview.innerHTML = src
        ? '<img src="' + escapeHtml(src) + '" alt="Prévia da foto">'
        : '<span>&#128100;</span>';
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
        photoDraft = { dataUrl: null, url: null, source: null, genre: '', bio: '', missing: true };
        applyPhotoDraft();
        setPhotoStatus('Nenhum dado encontrado para "' + name + '". Um aviso será exibido no cadastro.');
        return null;
      }
      r.missing = !r.url;
      photoDraft = r;
      applyPhotoDraft();
      setPhotoStatus('Dados obtidos: ' +
        (r.source ? r.source + ', ' : '') +
        (r.genre ? 'gênero "' + r.genre + '"' : 'gênero não disponível') +
        (r.dataUrl ? ' · foto armazenada.' : (r.url ? ' · foto por URL.' : ' · sem foto.')));
      return r;
    }).catch(function (e) {
      if (token === photoSearchToken) {
        photoDraft = { dataUrl: null, url: null, source: null, genre: '', bio: '', missing: true };
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
      missing: !!sg.photoMissing
    };
    photoSearchToken++;
    photoLastQuery = sg.name || '';

    var body =
      '<div class="callout accent"><strong>Preenchimento automático:</strong> informe apenas o nome. ' +
      'Enquanto você digita, buscamos foto, gênero e biografia na Wikipédia e na Apple Music.</div>' +
      '<div class="field"><label>Nome do artista *</label>' +
      '<input name="name" required value="' + escapeHtml(sg.name || '') + '" placeholder="Ex.: Maria Bethânia"></div>' +
      '<div class="field"><label>Foto do artista <span class="auto-tag">automático</span></label>' +
      '<div class="photo-editor">' +
      '<div class="photo-preview" id="photoPreview"><span>&#128100;</span></div>' +
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
        var submit = $('#modalSubmit');
        var token = modalToken;
        submit.disabled = true;
        submit.textContent = 'Buscando dados...';

        function finish() {
          if (token !== modalToken) return; // modal foi fechado/trocado
          submit.disabled = false;
          submit.textContent = 'Salvar';
          var photo = {
            photo: (photoDraft && photoDraft.dataUrl) || null,
            photoUrl: (photoDraft && photoDraft.url) || null,
            photoSource: (photoDraft && photoDraft.source) || null,
            photoMissing: !!(photoDraft && photoDraft.missing) ||
              !(photoDraft && (photoDraft.dataUrl || photoDraft.url)),
            photoUpdatedAt: new Date().toISOString()
          };
          var common = {
            name: name,
            genre: (photoDraft && photoDraft.genre) || '',
            notes: (photoDraft && photoDraft.bio) || ''
          };
          if (existing) {
            Object.assign(existing, common, photo);
          } else {
            state.singers.push(Object.assign({ id: Store.generateId('singer') }, common, photo));
          }
          var savedSinger = existing || state.singers[state.singers.length - 1];
          save(); closeModal(); render();
          if (typeof onSaved === 'function') {
            onSaved(savedSinger);
          } else {
            toast('Cantor salvo' + ((photo.photo || photo.photoUrl) ? ' com foto.' : ' (sem foto).'));
          }
        }

        var hasPhoto = photoDraft && (photoDraft.dataUrl || photoDraft.url);
        if (hasPhoto) finish();
        else searchPhoto(false).then(finish);
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
    return '<div class="player-poster">' +
      '<img src="' + escapeHtml(video.thumb) + '" alt="">' +
      '<a class="poster-play" href="' + escapeHtml(video.url) + '" target="_blank" rel="noopener noreferrer" ' +
      'title="Assistir no YouTube">&#9654;</a>' +
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

    for (var i = 0; i < columns; i++) {
      var md = new Date((start + i * 7) * SRS.MS_PER_DAY);
      var m = md.toLocaleDateString('pt-BR', { timeZone: 'UTC', month: 'short' }).replace('.', '');
      var show = m !== lastMonthLabel;
      lastMonthLabel = m;
      months += '<span>' + (show ? m : '') + '</span>';
    }

    var cols = 'grid-template-columns:repeat(' + columns + ',minmax(0,1fr))';
    return '<div class="calendar">' +
      '<div class="cal-months" style="' + cols + '">' + months + '</div>' +
      '<div class="cal-body">' +
      '<div class="cal-weekdays"><span></span><span>Seg</span><span></span><span>Qua</span><span></span><span>Sex</span><span></span></div>' +
      '<div class="cal-grid" style="' + cols + '">' + cells + '</div></div>' +
      '<div class="cal-legend">Menos ' +
      '<span class="cal-cell l0"></span><span class="cal-cell l1"></span><span class="cal-cell l2"></span>' +
      '<span class="cal-cell l3"></span><span class="cal-cell l4"></span> Mais</div>' +
      '</div>';
  }

  function songSortValue(s, key) {
    switch (key) {
      case 'singer': return singerName(s.singerId);
      case 'genre': return s.genre || '';
      case 'key': return s.key || '';
      case 'duration': return Number(s.duration) || 0;
      case 'created': return Date.parse(s.createdAt) || 0;
      case 'review': return SRS.isDue(ensureCard(s)) ? 1 : 0;
      default: return s.title || '';
    }
  }

  function sortHeader(label, key) {
    var arrow = songFilters.sort === key ? (songFilters.dir === 'asc' ? ' ▲' : ' ▼') : '';
    return '<th><button type="button" class="th-btn' + (songFilters.sort === key ? ' active' : '') +
      '" data-action="sort" data-sort="' + key + '">' + label + arrow + '</button></th>';
  }

  function renderSongs(container, actions) {
    actions.innerHTML =
      '<button class="btn" data-action="add-singer">+ Cantor</button>' +
      '<button class="btn btn-primary" data-action="add-song">+ Música</button>';

    var genres = {};
    state.songs.forEach(function (s) { if (s.genre) genres[s.genre] = 1; });
    var genreKeys = Object.keys(genres).sort(function (a, b) { return a.localeCompare(b, 'pt-BR'); });

    var filterBar = '<div class="filters">' +
      '<input id="searchInput" class="search" placeholder="Buscar música..." value="' + escapeHtml(searchTerm) + '">' +
      '<select id="filterSinger" class="search"><option value="">Todos os cantores</option>' +
      state.singers.map(function (sg) {
        return '<option value="' + escapeHtml(sg.id) + '"' + (songFilters.singer === sg.id ? ' selected' : '') + '>' +
          escapeHtml(sg.name) + '</option>';
      }).join('') + '</select>' +
      '<select id="filterGenre" class="search"><option value="">Todos os gêneros</option>' +
      genreKeys.map(function (g) {
        return '<option value="' + escapeHtml(g) + '"' + (songFilters.genre === g ? ' selected' : '') + '>' + escapeHtml(g) + '</option>';
      }).join('') + '</select>' +
      '<label class="check-filter"><input type="checkbox" id="filterDue"' + (songFilters.dueOnly ? ' checked' : '') +
      '> Só revisões pendentes</label>' +
      '</div>';

    var list = state.songs.filter(function (s) {
      if (songFilters.singer && s.singerId !== songFilters.singer) return false;
      if (songFilters.genre && s.genre !== songFilters.genre) return false;
      if (songFilters.dueOnly && !SRS.isDue(ensureCard(s))) return false;
      if (!searchTerm) return true;
      var hay = norm(s.title + ' ' + singerName(s.singerId) + ' ' + (s.genre || '') + ' ' + (s.key || ''));
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
      container.innerHTML = filterBar + counter + '<div class="empty"><span class="emoji">&#9835;</span>' +
        (state.songs.length ? 'Nenhuma música corresponde aos filtros.' : 'Seu repertório está vazio. Adicione sua primeira música.') +
        '</div>';
      return;
    }

    var html = filterBar + counter + '<div class="table-wrap"><table><thead><tr>' +
      sortHeader('Música', 'title') +
      sortHeader('Cantor', 'singer') +
      sortHeader('Gênero', 'genre') +
      sortHeader('Tom', 'key') +
      sortHeader('Duração', 'duration') +
      sortHeader('Revisão', 'review') +
      '<th style="text-align:right">Ações</th>' +
      '</tr></thead><tbody>';

    list.forEach(function (s) {
      var card = ensureCard(s);
      var due = SRS.isDue(card);
      html += '<tr>' +
        '<td><strong class="song-name-link" data-action="open-song" data-id="' + escapeHtml(s.id) + '" ' +
        'title="Ver resumo da música">' +
        '<span class="song-title-text">' + escapeHtml(s.title) + '</span>' +
        ((s.youtubeVideos || []).length ? '<span class="icon-video" title="Possui vídeos">&#9654;</span>' : '') +
        '</strong></td>' +
        '<td>' + escapeHtml(singerName(s.singerId)) + '</td>' +
        '<td>' + (s.genre ? escapeHtml(s.genre) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (s.key ? '<span class="chip key" title="' + escapeHtml(s.keySource || '') + '">' + escapeHtml(s.key) + '</span>' : '<span class="muted">—</span>') + '</td>' +
        '<td class="nowrap">' + (s.duration ? formatDuration(s.duration) : '<span class="muted">—</span>') + '</td>' +
        '<td>' + (due ? '<span class="dot-review" title="Revisão pendente"></span> Pendente' : '<span class="muted">Em dia</span>') + '</td>' +
        '<td class="right nowrap">' +
        (due ? '<button class="btn btn-sm" data-action="practice-song" data-id="' + s.id + '">Revisar</button> ' : '') +
        '<button class="btn btn-sm" data-action="ver-videos" data-id="' + s.id + '">Vídeos</button> ' +
        '<button class="btn btn-sm" data-action="edit-song" data-id="' + s.id + '">Editar</button> ' +
        '<button class="btn btn-sm btn-danger" data-action="delete-song" data-id="' + s.id + '">Excluir</button>' +
        '</td></tr>';
    });
    html += '</tbody></table></div>';
    container.innerHTML = html;
  }

  /** Tela de resumo da música, com mini player dos vídeos anexados. */
  function renderSongSummary(container, actions) {
    var song = getSong(currentSongId);
    if (!song) { navigate('songs'); return; }
    var vids = song.youtubeVideos || [];
    var stillThere = vids.some(function (v) { return v.id === currentVideoId; });
    if (!stillThere) currentVideoId = vids.length ? vids[0].id : null;
    var card = ensureCard(song);
    var singer = getSinger(song.singerId);

    var hasVideos = vids.length > 0;
    var cover = vids.length && vids[0].thumb ? vids[0].thumb : null;

    // Cabeçalho no mesmo padrão enxuto das outras telas.
    var html = '<div class="song-summary">' +
      '<div class="summary-top">' +
      '<div class="summary-top-main">' +
      (cover ? '<img class="summary-cover" src="' + escapeHtml(cover) + '" alt="">' : '') +
      '<div><h1 class="summary-title">' + escapeHtml(song.title) + '</h1>' +
      '<p class="view-subtitle">' + escapeHtml(singerName(song.singerId)) +
      ' · Adicionada em ' + formatDateTime(song.createdAt) + '</p></div></div>' +
      '<div class="summary-actions">' +
      '<button class="btn" data-action="goto-songs">&larr; Voltar às músicas</button>' +
      '<button class="btn" data-action="manage-videos">Vídeos</button>' +
      '<button class="btn btn-primary" data-action="edit-song" data-id="' + escapeHtml(song.id) + '">Editar</button>' +
      '</div></div>' +
      '<div class="summary-meta">' +
      (song.genre ? '<span class="chip">' + escapeHtml(song.genre) + '</span>' : '') +
      (song.key ? '<span class="chip key" title="' + escapeHtml(song.keySource || '') + '">' + escapeHtml(song.key) + '</span>' : '') +
      (song.duration ? '<span class="chip">' + formatDuration(song.duration) + '</span>' : '') +
      '<span class="chip">' + vids.length + (vids.length === 1 ? ' vídeo' : ' vídeos') + '</span>' +
      '<span class="chip">Domínio ' + SRS.mastery(card) + '%</span>' +
      '<span class="chip' + (SRS.isDue(card) ? ' warning' : '') + '">' +
      (SRS.isDue(card) ? 'Revisão pendente' : 'Revisão em dia') + '</span>' +
      '</div>';

    // 1. Informações
    html += '<div class="panel"><h3>Informações</h3>' +
      '<p class="small muted">Adicionada em ' + formatDateTime(song.createdAt) + '</p>' +
      '<p class="small muted">Gênero: ' + escapeHtml(song.genre || '—') + ' · Tom: ' + escapeHtml(song.key || '—') +
      ' · Duração: ' + (song.duration ? formatDuration(song.duration) : '—') + '</p>' +
      (song.notes ? '<p class="small">' + escapeHtml(song.notes) + '</p>' : '') +
      '<div class="callout small"><strong>Revisão:</strong> ' + escapeHtml(dueLabel(card)) +
      ' · Domínio estimado ' + SRS.mastery(card) + '%</div></div>';

    // 2. Atividade da música (seção expansível)
    html += '<details class="activity-details"><summary>Atividade da música</summary>' +
      '<div class="panel">' + activityCalendar(songActivityEvents(song), 16) + '</div></details>';

    // 3. Letra
    html += '<div class="section lyrics-section"><h2 class="section-title">Letra da música</h2>' +
      (song.lyrics
        ? '<pre class="lyrics-text">' + escapeHtml(song.lyrics) + '</pre>' +
          (song.lyricsSource ? '<p class="small muted">Fonte: ' + escapeHtml(song.lyricsSource) + '</p>' : '')
        : '<div class="empty">Letra não disponível. Ela é carregada automaticamente quando a música é cadastrada com internet.</div>') +
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
            '<img src="' + escapeHtml(v.thumb) + '" alt="">' +
            '<span><strong>' + escapeHtml(v.title) + '</strong>' +
            '<small>' + escapeHtml(v.channel || 'YouTube') + '</small></span></button>';
        }).join('') + '</div>' +
        '<a class="small" target="_blank" rel="noopener noreferrer" href="' +
        escapeHtml(YouTube.watchUrl(currentVideoId)) + '">Abrir no YouTube &rarr;</a>' +
        '</div></div>';
    } else {
      html += '<div class="panel"><p class="muted small">Nenhum vídeo anexado.</p>' +
        '<a class="btn" target="_blank" rel="noopener noreferrer" href="' + escapeHtml(videoSearchUrl(song)) + '">Buscar no YouTube</a> ' +
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
    var lyricsDraft = { lyrics: s.lyrics || '', source: s.lyricsSource || '' };
    var lyricsToken = 0;
    var modalAtStart = modalToken;

    function applyKeyDraft() {
      var el = $('#autoKey');
      if (el) el.textContent = keyDraft.key
        ? keyDraft.key + (keyDraft.keyName ? ' · ' + keyDraft.keyName : '')
        : 'Não encontrado';
      var st = $('#keyStatus');
      if (st) st.textContent = keyDraft.keySource
        ? 'Fonte: ' + keyDraft.keySource
        : 'Selecione um cantor para pesquisar o tom e a duração.';
    }

    function applyLyricsDraft() {
      var el = $('#lyricsStatus');
      if (!el) return;
      el.textContent = lyricsDraft.lyrics
        ? 'Letra carregada (' + (lyricsDraft.source || 'internet') + ') · ' + lyricsDraft.lyrics.length + ' caracteres'
        : 'Letra não encontrada — você pode adicionar depois.';
    }

    /** Busca a letra na internet e guarda no rascunho da música. */
    function searchLyrics() {
      var f = $('#modalForm');
      if (!f || lyricsDraft.lyrics) return Promise.resolve(null);
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
          el.textContent = 'Letra não encontrada — você pode adicionar depois.';
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

    /** Reconhece o nome digitado no autocomplete e dispara a busca. */
    var lastResolved = '';
    function resolveSinger() {
      var f = $('#modalForm');
      if (!f) return;
      var typed = (f.elements.singerName.value || '').trim();
      var n = norm(typed);
      var match = n ? (state.singers.find(function (sg) { return norm(sg.name) === n; }) ||
        state.singers.find(function (sg) { return norm(sg.name).indexOf(n) === 0; })) : null;
      var signature = n + '|' + (match ? match.id : '');
      if (signature === lastResolved) return;
      lastResolved = signature;

      selectedSingerId = match ? match.id : null;
      var hint = $('#singerHint');
      if (hint) hint.textContent = typed && !match
        ? 'Cantor não cadastrado — escolha "+ Cadastrar" na sugestão.'
        : '';
      if (match) {
        applyGenreFromSinger();
        searchKey();
        searchLyrics();
      } else if ($('#keyStatus')) {
        $('#keyStatus').textContent = 'Selecione um cantor para pesquisar o tom e a duração.';
      }
    }

    /** Pesquisa o tom na internet e preenche o campo automático. */
    function searchKey() {
      var f = $('#modalForm');
      if (!f) return Promise.resolve(null);
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
        applyKeyDraft();
        var dur = f.elements.duration;
        if (dur && !dur.value && r.durationMin) dur.value = r.durationMin;
        var stEl = $('#keyStatus');
        if (stEl && r.durationMin) stEl.textContent += ' · Duração: ' + r.durationMin + ' min';
        return r;
      });
    }

    var body =
      '<div class="field"><label>Título *</label><input name="title" required value="' + escapeHtml(s.title || '') + '" placeholder="Ex.: Águas de Março"></div>' +
      (s.createdAt ? '<div class="small muted" style="margin:-6px 0 12px">Adicionada em ' + formatDateTime(s.createdAt) + '</div>' : '') +
      '<div class="field"><label>Cantor</label>' +
      '<div class="singer-wrap">' +
      '<input name="singerName" autocomplete="off" role="combobox" aria-expanded="false" placeholder="Digite para buscar..." ' +
      'value="' + escapeHtml(s.singerId ? singerName(s.singerId) : (s.singerName || '')) + '">' +
      '<div class="autocomplete-menu" id="singerMenu" hidden></div>' +
      '</div><div class="small muted" id="singerHint"></div></div>' +
      '<div class="field"><label>Gênero <span class="auto-tag">do cantor</span></label><input name="genre" value="' + escapeHtml(s.genre || '') + '" placeholder="Preenchido ao escolher o cantor"></div>' +
      '<div class="auto-field"><label>Tom da música <span class="auto-tag">automático</span></label>' +
      '<div class="auto-value" id="autoKey">Não encontrado</div>' +
      '<div class="small muted" id="keyStatus">O tom será pesquisado automaticamente na internet.</div></div>' +
      '<div class="auto-field"><label>Letra <span class="auto-tag">automático</span></label>' +
      '<div class="auto-value small" id="lyricsStatus">Será carregada ao salvar.</div></div>' +
      '<div class="field-row">' +
      '<div class="field"><label>Dificuldade</label><select name="difficulty">' + diffOptions + '</select></div>' +
      '<div class="field"><label>Duração (min) <span class="auto-tag">automático</span></label><input name="duration" type="number" min="0" step="any" value="' + escapeHtml(s.duration || '') + '" placeholder="Preenchido pela busca"></div>' +
      '</div>';

    openModal({
      title: existing ? 'Editar música' : 'Nova música',
      bodyHtml: body,
      onSubmit: function (e) {
        var f = e.target;
        var title = f.elements.title.value.trim();
        if (!title) return;
        var singerId = selectedSingerId;
        var values = {
          title: title,
          singerId: singerId,
          genre: f.elements.genre.value.trim(),
          difficulty: Number(f.elements.difficulty.value) || 1,
          duration: f.elements.duration.value ? Number(f.elements.duration.value) : null,
          // Campos removidos do formulário são preservados em músicas já existentes.
          sections: existing ? (existing.sections || []) : [],
          notes: existing ? (existing.notes || '') : '',
          youtubeVideos: existing ? (existing.youtubeVideos || []) : [],
          youtubeSearchUrl: YouTube.songSearchUrl(title, singerId ? singerName(singerId) : ''),
          key: keyDraft.key,
          keyName: keyDraft.keyName,
          keySource: keyDraft.keySource
        };

        var submit = $('#modalSubmit');
        var token = modalToken;
        submit.disabled = true;
        submit.textContent = keyDraft.key ? 'Salvando...' : 'Pesquisando tom...';

        function finish() {
          if (token !== modalToken) return; // modal foi fechado/trocado
          submit.disabled = false;
          submit.textContent = 'Salvar';
          values.key = keyDraft.key;
          values.keyName = keyDraft.keyName;
          values.keySource = keyDraft.keySource;
          values.lyrics = lyricsDraft.lyrics;
          values.lyricsSource = lyricsDraft.source;
          values.duration = f.elements.duration.value ? Number(f.elements.duration.value) : null;
          if (existing) {
            Object.assign(existing, values);
          } else {
            var song = Object.assign({ id: Store.generateId('song'), createdAt: new Date().toISOString() }, values);
            song.card = SRS.newCard(song.id);
            state.songs.push(song);
          }
          save(); closeModal(); render();
          toast('Música salva com sucesso.');
        }

        var pending = [];
        if (!keyDraft.key) pending.push(searchKey());
        if (!lyricsDraft.lyrics) pending.push(searchLyrics());
        if (pending.length) Promise.all(pending).then(finish);
        else finish();
      }
    });

    modalAtStart = modalToken; // openModal() incrementou o token; sincroniza aqui
    applyKeyDraft();
    applyLyricsDraft();
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
        singerMenu.innerHTML = matches.map(function (sg) {
          return '<button type="button" class="autocomplete-item" data-singer-id="' + escapeHtml(sg.id) + '">' +
            avatarHtml(sg, 26) + '<span>' + escapeHtml(sg.name) + '</span></button>';
        }).join('');
      } else if (query.trim()) {
        singerMenu.innerHTML = '<button type="button" class="autocomplete-item add-new" data-add-singer="1">' +
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
      var finalize = function (info) {
        var sg = {
          id: Store.generateId('singer'),
          name: name,
          genre: (info && info.genre) || '',
          notes: (info && info.bio) || '',
          photo: (info && info.dataUrl) || null,
          photoUrl: (info && info.url) || null,
          photoSource: (info && info.source) || null,
          photoMissing: !info || (!info.dataUrl && !info.url),
          photoUpdatedAt: new Date().toISOString()
        };
        state.singers.push(sg);
        save();
        if (singerInput) singerInput.value = sg.name;
        lastResolved = '';
        resolveSinger();
        if (hintEl) hintEl.textContent = 'Cantor "' + name + '" cadastrado' +
          ((info && info.source) ? ' com dados do ' + info.source : '') + '.';
        toast('Cantor cadastrado.');
      };
      if (hintEl) hintEl.textContent = 'Cadastrando "' + name + '" e buscando dados...';
      ArtistPhoto.fetchInfo(name).then(finalize).catch(function () { finalize(null); });
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
        else if (e.key === 'Escape') { hideSingerMenu(); }
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
      '<div style="margin-bottom:18px"><a class="btn btn-primary" href="' + escapeHtml(videoSearchUrl(song)) +
      '" target="_blank" rel="noopener noreferrer">&#128269; Buscar no YouTube</a></div>' +
      '<h3 style="font-size:15px;margin:0 0 10px">Vídeos vinculados (' + vids.length + ')</h3>';
    if (vids.length) {
      body += '<div class="video-list">' + vids.map(function (v) {
        return '<div class="video-card">' +
          '<a href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener noreferrer">' +
          '<img class="video-thumb" src="' + escapeHtml(v.thumb) + '" alt=""></a>' +
          '<div class="video-info"><strong>' + escapeHtml(v.title) + '</strong>' +
          '<div class="small muted">' + escapeHtml(v.channel || 'YouTube') + '</div>' +
          '<div style="margin-top:8px;display:flex;gap:6px">' +
          '<a class="btn btn-ghost btn-sm" href="' + escapeHtml(v.url) + '" target="_blank" rel="noopener noreferrer">Assistir</a>' +
          '<button type="button" class="btn btn-danger btn-sm" data-action="remove-video" data-id="' + escapeHtml(song.id) +
          '" data-video="' + escapeHtml(v.id) + '">Remover</button>' +
          '</div></div></div>';
      }).join('') + '</div>';
    } else {
      body += '<div class="empty">Nenhum vídeo vinculado. Use o campo abaixo ou o botão de busca.</div>';
    }
    body += '<hr class="divider">' +
      '<div class="field"><label>Adicionar vídeo</label>' +
      '<input name="videoUrl" placeholder="Cole a URL do YouTube ou o ID de 11 caracteres"></div>';

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
    actions.innerHTML = '<button class="btn" data-action="open-method">Como funciona</button>';
    var due = dueSongs();
    var html = '<div class="practice-setup">';

    html += '<div class="section"><h2 class="section-title">Revisões pendentes (' + due.length + ')</h2>';
    if (!due.length) {
      html += '<div class="empty">Nenhuma revisão pendente. Você ainda pode praticar qualquer música abaixo.</div>';
    } else {
      html += '<div class="song-picker">';
      due.forEach(function (s) {
        var card = ensureCard(s);
        html += '<div class="pick-row">' + avatarHtml(getSinger(s.singerId), 36) + '<div class="pick-info"><strong>' + escapeHtml(s.title) + '</strong>' +
          '<small>' + escapeHtml(singerName(s.singerId)) + ' · Domínio ' + SRS.mastery(card) + '% · ' + dueLabel(card) + '</small></div>' +
          '<button class="btn btn-primary btn-sm" data-action="pick-song" data-id="' + s.id + '">Praticar</button></div>';
      });
      html += '</div>';
    }
    html += '</div>';

    html += '<div class="section"><h2 class="section-title">Praticar outra música</h2>';
    if (!state.songs.length) {
      html += '<div class="empty">Cadastre uma música primeiro.</div>';
    } else {
      html += '<div class="song-picker">';
      state.songs.forEach(function (s) {
        var card = ensureCard(s);
        html += '<div class="pick-row">' + avatarHtml(getSinger(s.singerId), 36) + '<div class="pick-info"><strong>' + escapeHtml(s.title) + '</strong>' +
          '<small>' + escapeHtml(singerName(s.singerId)) + ' · Próxima revisão: ' + formatDay(card.due) + '</small></div>' +
          '<button class="btn btn-ghost btn-sm" data-action="pick-song" data-id="' + s.id + '">Praticar</button></div>';
      });
      html += '</div></div>';
    }
    html += '</div>';
    container.innerHTML = html;
  }

  function renderRateStep(container, actions) {
    var song = getSong(practice.songId);
    if (!song) { practice.step = 'setup'; return renderSetupStep(container, actions); }
    var card = ensureCard(song);
    actions.innerHTML = '<button class="btn btn-ghost" data-action="practice-cancel">Cancelar</button>';

    var units = song.sections && song.sections.length ? song.sections : [{ id: 'full', name: 'Música inteira', confidence: 3 }];
    var labels = ['Esqueci', 'Muito difícil', 'Difícil', 'Razoável', 'Bom', 'Perfeito'];

    var html = '<div class="practice-setup">';
    html += '<div class="panel"><h3>' + escapeHtml(song.title) + '</h3>' +
      '<p class="muted">' + escapeHtml(singerName(song.singerId)) +
      (song.key ? ' · Tom: <strong>' + escapeHtml(song.key) + '</strong>' : '') +
      ' · Domínio atual: ' + SRS.mastery(card) + '% · ' +
      'Revisão: ' + dueLabel(card) + '</p></div>';
    html += '<p class="muted">Avalie o quanto você conseguiu executar/cantar cada trecho <strong>agora</strong>, sem consultar. ' +
      'Seja honesto — a qualidade da avaliação define a qualidade do agendamento.</p>';

    html += '<div class="field-row" style="margin:14px 0"><button class="btn btn-ghost btn-sm" data-action="rate-all" data-q="3">Marcar todos como Razoável (3)</button></div>';

    units.forEach(function (u) {
      var sel = practice.ratings[u.id];
      html += '<div class="section-review"><h4>' + escapeHtml(u.name) + '</h4>' +
        '<div class="hint">Confiança anterior: ' + u.confidence + '/5</div>' +
        '<div class="rating-group">';
      for (var q = 0; q <= 5; q++) {
        html += '<button class="rating-btn' + (sel === q ? ' selected' : '') + '" data-action="rate" data-unit="' + escapeHtml(u.id) + '" data-q="' + q + '" title="' + labels[q] + '">' + q + ' ' + labels[q] + '</button>';
      }
      html += '</div></div>';
    });

    html += '<div style="margin-top:20px;display:flex;gap:10px">' +
      '<button class="btn btn-primary" data-action="finish-practice">Concluir prática</button>' +
      '<button class="btn btn-ghost" data-action="practice-cancel">Cancelar</button></div>';
    html += '</div>';
    container.innerHTML = html;
  }

  function renderResultStep(container, actions) {
    var r = practice.result;
    actions.innerHTML = '<button class="btn btn-primary" data-action="practice-again">Praticar outra</button>';
    var emoji = r.avg >= 4 ? '&#127881;' : r.avg >= 3 ? '&#128170;' : '&#128161;';
    var msg = r.avg >= 4 ? 'Excelente! A memória foi consolidada.' : r.avg >= 3 ? 'Bom trabalho! Continue assim.' : 'Tudo bem — revisões mais cedo aceleram a fixação.';

    var html = '<div class="practice-setup"><div class="panel big-result">' +
      '<div class="emoji">' + emoji + '</div><h2>' + msg + '</h2>' +
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

    html += '<div style="display:flex;gap:10px"><button class="btn btn-ghost" data-action="goto-songs">Voltar ao repertório</button></div></div>';
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
    var bytes = 0;
    try { bytes = new Blob([JSON.stringify(state)]).size; } catch (e) { bytes = JSON.stringify(state).length; }

    var html = '<div class="panel"><h3>Exportar / Importar</h3>' +
      '<p class="muted">Seus dados ficam armazenados neste navegador (localStorage). Exporte um backup em JSON para não perdê-los ou para migrar de dispositivo.</p>' +
      '<div style="display:flex;gap:10px;flex-wrap:wrap">' +
      '<button class="btn btn-primary" data-action="export-data">&#8681; Exportar JSON</button>' +
      '<button class="btn btn-ghost" data-action="import-data">&#8679; Importar JSON</button>' +
      '<input type="file" id="importFile" accept="application/json,.json" hidden>' +
      '</div></div>';

    html += '<div class="panel"><h3>Resumo do armazenamento</h3>' +
      '<p class="muted">Cantores: <strong>' + state.singers.length + '</strong> · Músicas: <strong>' + state.songs.length +
      '</strong> · Sessões de prática: <strong>' + state.sessions.length + '</strong></p>' +
      '<p class="small muted">Tamanho aproximado: ' + bytes + ' bytes</p></div>';

    html += '<div class="panel"><h3>Dados de teste (debug)</h3>' +
      '<p class="muted">Adiciona alguns cantores e músicas de exemplo para testar a listagem, filtros, resumo e revisões. Não apaga seus dados atuais.</p>' +
      '<button class="btn" data-action="add-debug-data">Adicionar dados de teste</button></div>';

    html += '<div class="panel"><h3 style="color:var(--danger)">Zona de risco</h3>' +
      '<p class="muted">Apaga todos os cantores, músicas e histórico. Esta ação não pode ser desfeita.</p>' +
      '<button class="btn btn-danger" data-action="reset-data">Redefinir todos os dados</button></div>';

    container.innerHTML = html;

    $('#importFile').addEventListener('change', function (e) {
      var file = e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var data = JSON.parse(reader.result);
          if (!Array.isArray(data.singers) || !Array.isArray(data.songs)) throw new Error('Formato inválido');
          state = {
            version: data.version || 1,
            singers: data.singers,
            songs: data.songs,
            sessions: Array.isArray(data.sessions) ? data.sessions : [],
            createdAt: data.createdAt || new Date().toISOString()
          };
          state.songs.forEach(ensureCard);
          save(); render(); toast('Dados importados com sucesso.');
        } catch (err) {
          toast('Erro ao importar: ' + err.message);
        }
      };
      reader.readAsText(file);
    });
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
      case 'goto-practice': navigate('practice'); break;
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
      case 'goto-songs': practice = { step: 'setup', songId: null, ratings: {}, result: null }; navigate('songs'); break;
      case 'goto-dashboard': practice = { step: 'setup', songId: null, ratings: {}, result: null }; navigate('dashboard'); break;

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
        practice = { step: 'rate', songId: id, ratings: {}, result: null };
        navigate('practice');
        break;

      case 'pick-song':
        practice = { step: 'rate', songId: id, ratings: {}, result: null };
        render();
        break;

      case 'rate':
        practice.ratings[btn.dataset.unit] = Number(btn.dataset.q);
        render();
        break;

      case 'rate-all': {
        var q = Number(btn.dataset.q);
        var songAll = getSong(practice.songId);
        if (!songAll) break;
        var unitsAll = songAll.sections && songAll.sections.length ? songAll.sections : [{ id: 'full' }];
        unitsAll.forEach(function (u) { practice.ratings[u.id] = q; });
        render();
        break;
      }

      case 'practice-cancel':
        practice = { step: 'setup', songId: null, ratings: {}, result: null };
        render();
        break;

      case 'finish-practice': finishPractice(); break;

      case 'practice-again':
        practice = { step: 'setup', songId: null, ratings: {}, result: null };
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
    else return;
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
  });

  // Fechar modal clicando fora / ESC
  $('#modalOverlay').addEventListener('click', function (e) {
    if (e.target === $('#modalOverlay')) closeModal();
  });
  // Se o embed falhar (ex.: erro 153), troca o player por um poster com link direto.
  window.addEventListener('message', function (e) {
    if (!currentVideoId || e.origin.indexOf('youtube') === -1) return;
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
    if (e.key === 'Escape' && !$('#modalOverlay').hidden) closeModal();
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList &&
        e.target.classList.contains('clickable')) {
      e.preventDefault();
      e.target.click();
    }
  });

  function finishPractice() {
    var song = getSong(practice.songId);
    if (!song) return;
    var card = ensureCard(song);
    var units = song.sections && song.sections.length ? song.sections : [{ id: 'full', name: 'Música inteira', confidence: 3 }];

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
    a.download = 'repertorio-' + new Date().toISOString().slice(0, 10) + '.json';
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
  save();
  render();
})();
