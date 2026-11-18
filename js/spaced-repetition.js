/* =========================================================================
 * spaced-repetition.js — Motor de prática espaçada (algoritmo SM-2)
 *
 * JUSTIFICATIVA CIENTÍFICA
 * ------------------------
 * este módulo implementa uma variante do algoritmo SM-2 (SuperMemo 2,
 * Piotr Wozniak), o mesmo princípio usado por Anki. Ele é ancorado em dois
 * efeitos bem documentados na psychology da aprendizagem:
 *
 *  1. Efeito do espaçamento (Ebbinghaus, 1885 / Curva do Esquecimento):
 *     revisões distribuídas ao longo do tempo produzem retenção muito
 *     superior a revisões em bloco (massed practice). O intervalo entre
 *     revisões cresce conforme a memória se consolida.
 *
 *  2. Efeito do teste / retrieval practice (Roediger & Karpicke, 2006):
 *     "recordar" ativamente o material é mais eficaz que apenas relê-lo.
 *     Cada sessão de prática é, portanto, um teste de recuperação, e a
 *     nota (qualidade 0-5) alimenta o agendamento.
 *
 *  O fator de facilidade (ease factor) ajusta a velocidade de crescimento
 *  do intervalo conforme a dificuldade percebida de cada música.
 * ========================================================================= */
(function (global) {
  'use strict';

  var MS_PER_DAY = 86400000;

  /**
   * Índice inteiro do dia do calendário LOCAL, ancorado à meia-noite UTC.
   * Evita o deslocamento de um dia em fusos extremos: toda a aplicação usa
   * o mesmo índice e o formata novamente em UTC (ver formatDay no app).
   */
  function dayIndex(date) {
    var d = date ? new Date(date) : new Date();
    if (isNaN(d.getTime())) return todayIndex();
    return Math.floor(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()) / MS_PER_DAY);
  }

  function todayIndex() {
    return dayIndex(new Date());
  }

  function addDays(dayIdx, n) {
    return dayIdx + n;
  }

  /** Cria o cartão de agendamento inicial de uma música. */
  function newCard(songId) {
    return {
      songId: songId || null,
      ease: 2.5,          // fator de facilidade (mínimo 1.3)
      interval: 0,        // intervalo atual em dias
      repetitions: 0,     // nº de revisões bem-sucedidas consecutivas
      due: todayIndex(),  // dia (índice) da próxima revisão
      lastReview: null,   // índice do dia da última revisão
      lapses: 0,          // nº de vezes em que a nota foi < 3
      history: []         // [{ day, quality, interval, ease }]
    };
  }

  /**
   * Aplica o algoritmo SM-2 e retorna um NOVO cartão atualizado.
   * @param {object} card   cartão atual
   * @param {number} quality nota de 0 a 5 (0=esqueci, 5=perfeito)
   */
  function schedule(card, quality, reviewDay) {
    var q = Math.max(0, Math.min(5, Math.round(Number(quality) || 0)));
    var next = Object.assign({}, card, {
      history: Array.isArray(card.history) ? card.history.slice() : []
    });
    var day = typeof reviewDay === 'number' ? reviewDay : todayIndex();

    // Atualiza o fator de facilidade (fórmula padrão SM-2).
    var ef = Number(next.ease) || 2.5;
    ef = ef + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02));
    if (ef < 1.3) ef = 1.3;
    next.ease = Math.round(ef * 1000) / 1000;

    if (q >= 3) {
      // Resposta correta: consolida e aumenta o intervalo.
      if (next.repetitions === 0) {
        next.interval = 1;
      } else if (next.repetitions === 1) {
        next.interval = 6;
      } else {
        next.interval = Math.max(1, Math.round(next.interval * next.ease));
      }
      next.repetitions = (next.repetitions || 0) + 1;
    } else {
      // Resposta incorreta: reinicia a sequência (lapse) e revisa em 1 dia.
      next.repetitions = 0;
      next.interval = 1;
      next.lapses = (next.lapses || 0) + 1;
    }

    next.lastReview = day;
    next.due = addDays(day, next.interval);
    next.history.push({
      day: day,
      quality: q,
      interval: next.interval,
      ease: next.ease
    });
    return next;
  }

  /** Músicas cuja revisão está pendente (due <= hoje). */
  function isDue(card, day) {
    if (!card) return false;
    return (card.due == null ? 0 : card.due) <= (typeof day === 'number' ? day : todayIndex());
  }

  /** Rótulo legível para o intervalo (ex.: "3 dias", "1 mês"). */
  function formatInterval(days) {
    if (days <= 0) return 'hoje';
    if (days === 1) return '1 dia';
    if (days < 30) return days + ' dias';
    if (days < 365) {
      var meses = Math.round(days / 30);
      return meses + (meses === 1 ? ' mês' : ' meses');
    }
    var anos = Math.round(days / 365 * 10) / 10;
    return anos + (anos === 1 ? ' ano' : ' anos');
  }

  /**
   * Grau de domínio (0-100) derivado do histórico.
   * Combina: consistência recente, intervalo atingido e estabilidade (ease).
   */
  function mastery(card) {
    if (!card) return 0;
    var h = card.history || [];
    if (h.length === 0) return 0;
    var recent = h.slice(-5);
    var avgQ = recent.reduce(function (s, r) { return s + r.quality; }, 0) / recent.length; // 0-5
    var qualityScore = avgQ / 5; // 0-1
    var intervalScore = Math.min(1, (card.interval || 0) / 60); // 60 dias => 1
    var stabilityScore = Math.min(1, Math.max(0, ((card.ease || 1.3) - 1.3) / 1.7)); // 1.3..3.0
    var raw = 0.50 * qualityScore + 0.35 * intervalScore + 0.15 * stabilityScore;
    // Penalidade leve por lapses recentes.
    raw -= Math.min(0.15, (card.lapses || 0) * 0.03);
    return Math.round(Math.max(0, Math.min(1, raw)) * 100);
  }

  /** Sugestão de próxima ação (usada na interface). */
  function recommendation(card) {
    var m = mastery(card);
    if (!card || !card.history || card.history.length === 0) return 'Começar a praticar';
    if (m < 40) return 'Reforçar trechos difíceis';
    if (m < 70) return 'Praticar com atenção';
    if (isDue(card)) return 'Revisão de manutenção';
    return 'Manter (revisão agendada)';
  }

  global.SRS = {
    MS_PER_DAY: MS_PER_DAY,
    dayIndex: dayIndex,
    todayIndex: todayIndex,
    addDays: addDays,
    newCard: newCard,
    schedule: schedule,
    isDue: isDue,
    formatInterval: formatInterval,
    mastery: mastery,
    recommendation: recommendation
  };
})(window);
