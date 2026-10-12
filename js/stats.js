// stats.js – Statistik-Karten für Kinder- und Elternansicht

const Stats = (() => {
  const { h } = Dom;
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const LEVELS = [
    { key: 'secure', label: 'sicher' },
    { key: 'shaky', label: 'wackelig' },
    { key: 'new', label: 'neu' }
  ];

  function card(title, ...content) {
    return h('section', { class: 'card' }, h('h3', {}, title), ...content);
  }

  // 'YYYY-MM-DD' → 'TT.MM.'
  function shortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${d}.${m}.`;
  }

  function days(n) {
    return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  }

  function streakCard(dates, today) {
    const { current, longest, playedToday } = Logic.streaks(dates, today);
    return card('Serie',
      h('div', { class: 'streak-number' }, `🔥 ${current}`),
      h('p', { class: 'muted' }, `${days(current)} am Stück`),
      h('p', { class: 'muted small' }, `Längste Serie: ${days(longest)}`),
      !playedToday && current > 0
        ? h('p', { class: 'streak-hint' }, 'Heute noch keine Runde, sonst ist die Serie morgen weg.')
        : null);
  }

  function calendarCard(dates, today, complete = true) {
    const cells = Logic.calendarDays(dates, today);
    const grid = h('div', { class: 'calendar', role: 'list', 'aria-label': 'Lernkalender' },
      WEEKDAYS.map(day => h('div', { class: 'calendar-head', 'aria-hidden': 'true' }, day)),
      cells.map((cell, i) => {
        const state = cell.future ? 'noch offen' : cell.played ? 'geübt' : 'nicht geübt';
        const classes = ['calendar-day'];
        if (cell.played) classes.push('played');
        if (cell.future) classes.push('future');
        if (cell.date === today) classes.push('today');
        const label = `${WEEKDAYS[i % 7]}, ${shortDate(cell.date)}: ${state}`;
        return h('div', { class: classes.join(' '), role: 'listitem', 'aria-label': label, title: label });
      }));
    return card('Lernkalender', grid,
      h('p', { class: 'muted small' }, `Die letzten ${cells.length / 7} Wochen, ein Kästchen pro Tag.`),
      complete ? null : h('p', { class: 'muted small' }, 'Ohne Internet ist der Kalender vielleicht unvollständig.'));
  }

  function levelText(counts) {
    return LEVELS.map(level => `${counts[level.key]} ${level.label}`).join(' · ');
  }

  function levelBar(counts) {
    const total = LEVELS.reduce((sum, level) => sum + counts[level.key], 0);
    // Leere Segmente weglassen, sonst entstehen doppelte Lücken
    return h('div', { class: 'level-bar', 'aria-hidden': 'true' },
      LEVELS.filter(level => counts[level.key] > 0).map(level => {
        const segment = h('div', { class: `level-seg ${level.key}` });
        segment.style.flexGrow = String(counts[level.key] / total);
        return segment;
      }));
  }

  function levelLegend() {
    return h('div', { class: 'level-legend muted small' }, LEVELS.map(level =>
      h('span', {}, h('span', { class: `legend-dot ${level.key}` }), level.label)));
  }

  // weeks: [{ week, words }], getStats(word) → { correct, wrong } oder undefined
  function levelCard(weeks, getStats) {
    const total = Logic.levelCounts(weeks.flatMap(w => w.words), getStats);
    const rows = weeks.map(w => {
      const counts = Logic.levelCounts(w.words, getStats);
      return h('div', { class: 'week-progress' },
        h('div', { class: 'week-progress-head' },
          h('strong', {}, `Woche ${w.week}`),
          h('span', { class: 'muted' }, levelText(counts))),
        levelBar(counts));
    });
    return card('Lernstand',
      h('p', {}, levelText(total)),
      levelBar(total),
      levelLegend(),
      h('div', { class: 'stack' }, rows));
  }

  function refreshCard(words, onStart) {
    if (words.length === 0) {
      return card('Auffrischen', h('p', { class: 'muted' }, 'Alles frisch 🎉'));
    }
    const pick = words.slice(0, Logic.REFRESH_MAX_WORDS);
    const button = (label, mode) =>
      h('button', { class: 'btn-small', type: 'button', onclick: () => onStart(pick, mode) }, label);
    return card('Auffrischen',
      h('p', {}, words.length === 1
        ? '1 Wort wartet aufs Auffrischen.'
        : `${words.length} Wörter warten aufs Auffrischen.`),
      h('p', { class: 'muted small' },
        `Lange nicht geübt. Eine Runde nimmt bis zu ${Logic.REFRESH_MAX_WORDS} davon.`),
      h('div', { class: 'button-row' },
        button('✏️ Quiz', 'quiz'),
        button('🃏 Karteikarten', 'flashcard')));
  }

  function trendCard(rounds, today) {
    const weeks = Logic.weeklyAccuracy(rounds, today);
    const columns = weeks.map(week => {
      const pct = week.rate === null ? null : Math.round(week.rate * 100);
      const fill = h('div', { class: 'trend-fill' });
      fill.style.height = `${pct ?? 0}%`;
      const label = `Woche ab ${shortDate(week.weekStart)}: ${pct === null ? 'keine Runde' : `${pct} % richtig`}`;
      const value = pct === null ? '–' : `${pct}%`;
      return h('div', { class: 'trend-col', role: 'listitem', 'aria-label': label, title: label },
        h('div', { class: 'trend-value', 'aria-hidden': 'true' }, value),
        h('div', { class: 'trend-track', 'aria-hidden': 'true' }, fill),
        h('div', { class: 'trend-label', 'aria-hidden': 'true' }, shortDate(week.weekStart)));
    });
    return card('Verlauf',
      h('div', { class: 'trend', role: 'list', 'aria-label': 'Trefferquote pro Woche' }, columns),
      h('p', { class: 'muted small' }, 'Trefferquote pro Woche, ohne Runden „Nur die falschen“.'));
  }

  // translations: Map 'week|en' → deutsche Übersetzung
  function difficultCard(rows, translations) {
    const content = rows.length === 0
      ? h('p', { class: 'muted' }, 'Keine auffälligen Wörter. 🎉')
      : h('div', { class: 'stack' }, rows.map(r =>
          h('div', { class: 'results-word-item' },
            h('span', {}, '❌'),
            h('span', {}, `${r.word_en} → ${translations.get(`${r.week}|${r.word_en}`) || '?'}`),
            h('span', { class: 'muted small push-right' }, `${r.wrong} von ${r.correct + r.wrong} falsch`))));
    return card('Schwierige Wörter', content);
  }

  // Kinderzeile der Eltern: Serie, heute geübt, Lernstand; gleiche Regeln wie die Statistik
  function childSummary(name, dates, counts, today, onOpen) {
    const { current, playedToday } = Logic.streaks(dates, today);
    const label = `${name}: ${days(current)} am Stück, heute ${playedToday ? 'geübt' : 'noch nicht geübt'}, ${levelText(counts)}`;
    return h('button', { class: 'child-summary', type: 'button', 'aria-label': label, onclick: onOpen },
      h('span', { class: 'child-summary-head' },
        h('strong', {}, name),
        h('span', { class: 'muted small' }, `🔥 ${current} · heute ${playedToday ? '✓' : '–'}`),
        h('span', { class: 'muted chevron' }, '›')),
      levelBar(counts));
  }

  return { streakCard, calendarCard, levelCard, refreshCard, trendCard, difficultCard, childSummary };
})();
