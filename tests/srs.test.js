'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { loadScript } = require('./helpers');

const srs = () => loadScript('js/spaced-repetition.js').SRS;

test('dayIndex usa o dia do calendário local, ancorado em UTC', () => {
  const SRS = srs();
  const early = new Date(2026, 0, 15, 0, 5);
  const late = new Date(2026, 0, 15, 23, 55);
  const expected = Math.floor(Date.UTC(2026, 0, 15) / SRS.MS_PER_DAY);
  assert.equal(SRS.dayIndex(early), expected);
  assert.equal(SRS.dayIndex(late), expected);
  assert.equal(SRS.dayIndex(new Date(2026, 0, 16, 0, 5)), expected + 1);
});

test('newCard cria cartão inicial vencendo hoje', () => {
  const SRS = srs();
  const card = SRS.newCard('song_1');
  assert.equal(card.songId, 'song_1');
  assert.equal(card.ease, 2.5);
  assert.equal(card.interval, 0);
  assert.equal(card.repetitions, 0);
  assert.equal(card.due, SRS.todayIndex());
  assert.equal(card.lastReview, null);
  assert.equal(card.history.length, 0);
});

test('schedule aplica SM-2 em acertos consecutivos', () => {
  const SRS = srs();
  let card = SRS.newCard('song_1');
  const day = 20000;

  card = SRS.schedule(card, 4, day);
  assert.equal(card.interval, 1);
  assert.equal(card.repetitions, 1);
  assert.equal(card.due, day + 1);
  assert.equal(card.history.length, 1);

  card = SRS.schedule(card, 5, day + 1);
  assert.equal(card.interval, 6);
  assert.equal(card.repetitions, 2);
  assert.equal(card.due, day + 7);

  const before = card.interval;
  card = SRS.schedule(card, 4, day + 7);
  assert.ok(card.interval > before);
  assert.equal(card.repetitions, 3);
  assert.equal(card.history.length, 3);
  assert.ok(card.ease >= 1.3);
});

test('schedule trata erro como lapse e reagenda para amanhã', () => {
  const SRS = srs();
  let card = SRS.schedule(SRS.newCard('song_1'), 5, 20000);
  card = SRS.schedule(card, 1, 20001);
  assert.equal(card.interval, 1);
  assert.equal(card.repetitions, 0);
  assert.equal(card.lapses, 1);
  assert.equal(card.due, 20002);
  assert.ok(card.ease < 2.5);
  assert.ok(card.ease >= 1.3);
});

test('schedule limita notas ao intervalo 0..5 e não muta o cartão original', () => {
  const SRS = srs();
  const original = SRS.newCard('song_1');
  const high = SRS.schedule(original, 99, 20000);
  const low = SRS.schedule(original, -5, 20000);
  assert.equal(high.history[0].quality, 5);
  assert.equal(low.history[0].quality, 0);
  assert.equal(original.history.length, 0);
});

test('isDue compara com o dia informado', () => {
  const SRS = srs();
  const card = { due: 100 };
  assert.equal(SRS.isDue(card, 99), false);
  assert.equal(SRS.isDue(card, 100), true);
  assert.equal(SRS.isDue(card, 101), true);
  assert.equal(SRS.isDue(null, 100), false);
});

test('formatInterval produz rótulos legíveis', () => {
  const SRS = srs();
  assert.equal(SRS.formatInterval(0), 'hoje');
  assert.equal(SRS.formatInterval(1), '1 dia');
  assert.equal(SRS.formatInterval(2), '2 dias');
  assert.equal(SRS.formatInterval(30), '1 mês');
  assert.equal(SRS.formatInterval(365), '1 ano');
});

test('mastery cresce com histórico consistente e recomendação reflete o estado', () => {
  const SRS = srs();
  let card = SRS.newCard('song_1');
  assert.equal(SRS.mastery(card), 0);
  assert.equal(SRS.recommendation(card), 'Começar a praticar');

  for (let i = 0; i < 4; i++) card = SRS.schedule(card, 5, 20000 + i * 10);
  assert.ok(SRS.mastery(card) > 50);
  assert.equal(typeof SRS.recommendation(card), 'string');
});
