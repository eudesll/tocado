'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadStore, loadScript } = require('./helpers');

const baseState = () => ({
  version: 1,
  singers: [],
  songs: [],
  sessions: [],
  createdAt: '2026-01-01T00:00:00.000Z'
});

test('safeUrl aceita http(s), data de imagem e rejeita esquemas perigosos', () => {
  const { Store } = loadStore();
  assert.equal(Store.safeUrl('https://exemplo.com/foto.jpg'), 'https://exemplo.com/foto.jpg');
  assert.equal(Store.safeUrl('http://exemplo.com'), 'http://exemplo.com');
  assert.equal(Store.safeUrl('javascript:alert(1)'), '');
  assert.equal(Store.safeUrl('data:image/png;base64,AAAA'), '');
  assert.match(Store.safeUrl('data:image/png;base64,AAAA', true), /^data:image\/png/);
  assert.equal(Store.safeUrl('data:image/svg+xml;base64,AAAA', true), '');
});

test('sanitizeState rejeita formatos inválidos', () => {
  const { Store } = loadStore();
  assert.equal(Store.sanitizeState(null).ok, false);
  assert.equal(Store.sanitizeState({ songs: [] }).ok, false);
  assert.equal(Store.sanitizeState({ singers: [], songs: [] }).ok, true);
});

test('sanitizeState remove URLs perigosas e normaliza campos', () => {
  const { Store } = loadStore();
  const result = Store.sanitizeState({
    version: 1,
    singers: [{
      id: 'singer_1',
      name: '  Artista Teste  ',
      photo: 'javascript:alert(1)',
      photoUrl: 'data:text/html,<script>alert(1)</script>',
      photoPending: 'sim'
    }],
    songs: [{
      id: 'song_1',
      title: '  Música Teste  ',
      singerId: 'singer_1',
      difficulty: 99,
      duration: 'abc',
      key: 'Am',
      sections: [{ id: 'sec_1', name: 'Refrão', confidence: 9 }],
      youtubeVideos: [{
        id: 'dQw4w9WgXcQ',
        url: 'javascript:alert(1)',
        thumb: 'javascript:alert(1)',
        title: '<b>Vídeo</b>'
      }]
    }],
    sessions: [{ day: 1, quality: 4, date: 'data-invalida' }],
    setlists: [{ name: 'Show', songIds: ['song_1', 'song_inexistente'] }]
  });

  assert.equal(result.ok, true);
  const singer = result.state.singers[0];
  assert.equal(singer.name, 'Artista Teste');
  assert.equal(singer.photo, null);
  assert.equal(singer.photoUrl, null);
  assert.equal(singer.photoPending, true);

  const song = result.state.songs[0];
  assert.equal(song.title, 'Música Teste');
  assert.equal(song.difficulty, 5);
  assert.equal(song.duration, null);
  assert.equal(song.sections[0].confidence, 5);
  assert.match(song.youtubeVideos[0].url, /^https:\/\/www\.youtube\.com\/watch\?v=dQw4w9WgXcQ$/);
  assert.match(song.youtubeVideos[0].thumb, /^https:\/\/i\.ytimg\.com\//);
  assert.equal(result.state.sessions[0].date.length > 0, true);
  assert.deepEqual(Array.from(result.state.setlists[0].songIds), ['song_1']);
});

test('sanitizeState ignora itens sem campos obrigatórios e respeita limites', () => {
  const { Store } = loadStore();
  const result = Store.sanitizeState({
    singers: [{ name: '' }, { name: 'Válido' }],
    songs: [{ title: '' }, { title: 'X'.repeat(500) }]
  });
  assert.equal(result.ok, true);
  assert.equal(result.state.singers.length, 1);
  assert.equal(result.state.songs.length, 1);
  assert.equal(result.state.songs[0].title.length, 300);
  assert.equal(result.warnings.length, 2);
});

test('load migra dados v1, cria setlists e aplica sanitização', () => {
  const { Store } = loadStore();
  const legacy = {
    version: 1,
    singers: [{ id: 's1', name: 'Cantor', photo: 'javascript:alert(1)' }],
    songs: [{
      id: 'm1',
      title: 'Música',
      singerId: 's1',
      createdAt: '2026-02-01T10:00:00.000Z',
      lyrics: 'linha 1\nlinha 2'
    }],
    sessions: [],
    createdAt: '2026-02-01T10:00:00.000Z'
  };
  const { Store: LoadedStore } = loadStore({ [Store.STORAGE_KEY]: JSON.stringify(legacy) });
  const state = LoadedStore.load();
  assert.equal(state.version, 2);
  assert.deepEqual(Array.from(state.setlists), []);
  assert.equal(state.singers[0].photo, null);
  assert.equal(state.songs[0].title, 'Música');
});

test('load retorna estado padrão para JSON inválido', () => {
  const { Store } = loadStore({ repertorio_musical_v1: '{invalido' });
  const state = Store.load();
  assert.deepEqual(Array.from(state.songs), []);
  assert.deepEqual(Array.from(state.singers), []);
  assert.equal(state.version, 2);
});

test('save e load fazem roundtrip do estado', () => {
  const { Store, localStorage } = loadStore();
  const state = Store.defaultState();
  state.singers.push({ id: 's1', name: 'Cantor', genre: 'MPB' });
  state.songs.push({ id: 'm1', title: 'Música', singerId: 's1', card: null });
  assert.equal(Store.save(state), true);
  assert.ok(localStorage.getItem(Store.STORAGE_KEY));
  const loaded = Store.load();
  assert.equal(loaded.singers.length, 1);
  assert.equal(loaded.songs.length, 1);
  assert.equal(loaded.songs[0].singerId, 's1');
});

test('generateId e uniqueId mantêm IDs seguros e únicos', () => {
  const { Store } = loadStore();
  const id = Store.generateId('song');
  assert.match(id, /^song_[a-z0-9]+_[a-z0-9]+$/);
  const result = Store.sanitizeState({
    singers: [
      { id: 'a b', name: 'Um' },
      { id: 'a b', name: 'Dois' }
    ],
    songs: []
  });
  assert.notEqual(result.state.singers[0].id, undefined);
  assert.notEqual(result.state.singers[0].id, result.state.singers[1].id);
});

test('estimateSize retorna tamanho positivo', () => {
  const { Store } = loadStore();
  assert.ok(Store.estimateSize({ a: 'b'.repeat(1000) }) > 1000);
});

test('YouTube normaliza links e só aceita origens oficiais', () => {
  const { YouTube } = loadScript('js/youtube.js');
  assert.equal(YouTube.parseVideoId('https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=10'), 'dQw4w9WgXcQ');
  assert.equal(YouTube.parseVideoId('https://youtu.be/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(YouTube.parseVideoId('https://www.youtube.com/shorts/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(YouTube.parseVideoId('https://www.youtube.com/embed/dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(YouTube.parseVideoId('dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(YouTube.parseVideoId('https://exemplo.com/watch?v=dQw4w9WgXcQ'), null);
  assert.equal(YouTube.parseVideoId('curto'), null);
  assert.equal(YouTube.isYoutubeOrigin('https://www.youtube.com'), true);
  assert.equal(YouTube.isYoutubeOrigin('https://www.youtube-nocookie.com'), true);
  assert.equal(YouTube.isYoutubeOrigin('https://evil-youtube.com'), false);
  assert.match(YouTube.songSearchUrl('Águas de Março', 'Tom Jobim'), /search_query=Tom%20Jobim%20%C3%81guas%20de%20Mar%C3%A7o/);
});
