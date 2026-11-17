// stats.js – Statistik-Karten für Kinder- und Elternansicht

const Stats = (() => {
  const { h } = Dom;
  const WEEKDAYS = ['Mo', 'Di', 'Mi', 'Do', 'Fr', 'Sa', 'So'];
  const LEVELS = [
    { key: 'secure', label: 'sicher' },
    { key: 'refresh', label: 'auffrischen' },
    { key: 'shaky', label: 'wackelig' },
    { key: 'new', label: 'neu' }
  ];
  const MODES = [
    { key: 'quiz', label: 'Quiz' },
    { key: 'flashcard', label: 'Karteikarten' }
  ];

  function card(title, ...content) {
    return h('section', { class: 'card' }, h('h3', {}, title), ...content);
  }

  // 'YYYY-MM-DD' → 'TT.MM.'
  function shortDate(iso) {
    const [, m, d] = iso.split('-');
    return `${d}.${m}.`;
  }

  function longDate(iso) {
    return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE');
  }

  function days(n) {
    return `${n} ${n === 1 ? 'Tag' : 'Tage'}`;
  }

  function plural(n, one, many) {
    return `${n} ${n === 1 ? one : many}`;
  }

  function pct(rate) {
    return rate === null ? '–' : `${Math.round(rate * 100)} %`;
  }

  // Knöpfe "Quiz" und "Karteikarten" für eine Wortauswahl
  function startButtons(words, onStart) {
    const button = (label, mode) =>
      h('button', { class: 'btn-small', type: 'button', onclick: () => onStart(words, mode) }, label);
    return h('div', { class: 'button-row' },
      button('✏️ Quiz', 'quiz'),
      button('🃏 Karteikarten', 'flashcard'));
  }

  function goalText({ done, goal }) {
    return done >= goal
      ? `Wochenziel geschafft 🎉 (${done} von ${goal} Tagen)`
      : `${done} von ${goal} Tagen diese Woche`;
  }

  function streakCard(dates, today) {
    const { current, longest, playedToday } = Logic.streaks(dates, today);
    const goal = Logic.weekGoal(dates, today);
    const goalDots = h('div', { class: 'goal-days', role: 'list', 'aria-label': 'Übungstage diese Woche' },
      goal.days.map((day, i) => {
        const state = day.future ? 'noch offen' : day.played ? 'geübt' : 'nicht geübt';
        const classes = ['goal-day'];
        if (day.played) classes.push('played');
        if (day.date === today) classes.push('today');
        return h('div', { class: classes.join(' '), role: 'listitem', 'aria-label': `${WEEKDAYS[i]}: ${state}` },
          h('span', { class: 'goal-dot', 'aria-hidden': 'true' }),
          h('span', { class: 'goal-label', 'aria-hidden': 'true' }, WEEKDAYS[i]));
      }));
    return card('Serie',
      h('div', { class: 'streak-number' }, `🔥 ${current}`),
      h('p', { class: 'muted' }, `${days(current)} am Stück`),
      h('p', { class: 'muted small' }, `Längste Serie: ${days(longest)}`),
      !playedToday && current > 0
        ? h('p', { class: 'streak-hint' }, 'Heute noch keine Runde, sonst ist die Serie morgen weg.')
        : null,
      goalDots,
      h('p', { class: `small ${goal.done >= goal.goal ? 'goal-done' : 'muted'}` }, goalText(goal)));
  }

  function calendarLevel(rounds) {
    if (rounds >= 4) return 3;
    if (rounds >= 2) return 2;
    return 1;
  }

  function calendarCard(rounds, today, complete = true) {
    const cells = Logic.calendarDays(rounds, today);
    const grid = h('div', { class: 'calendar', role: 'list', 'aria-label': 'Lernkalender' },
      WEEKDAYS.map(day => h('div', { class: 'calendar-head', 'aria-hidden': 'true' }, day)),
      cells.map((cell, i) => {
        const state = cell.future ? 'noch offen'
          : cell.played ? `${plural(cell.rounds, 'Runde', 'Runden')}, ${plural(cell.words, 'Wort', 'Wörter')}`
          : 'nicht geübt';
        const classes = ['calendar-day'];
        if (cell.played) classes.push('played', `played-${calendarLevel(cell.rounds)}`);
        if (cell.future) classes.push('future');
        if (cell.date === today) classes.push('today');
        const label = `${WEEKDAYS[i % 7]}, ${shortDate(cell.date)}: ${state}`;
        return h('div', { class: classes.join(' '), role: 'listitem', 'aria-label': label, title: label });
      }));
    const legend = h('div', { class: 'level-legend muted small', 'aria-hidden': 'true' },
      h('span', {}, 'weniger'),
      [0, 1, 2, 3].map(level => h('span', { class: `calendar-key ${level ? `played-${level}` : ''}` })),
      h('span', {}, 'mehr Runden'));
    return card('Lernkalender', grid, legend,
      h('p', { class: 'muted small' }, `Die letzten ${cells.length / 7} Wochen, ein Kästchen pro Tag.`),
      complete ? null : h('p', { class: 'muted small' }, 'Ohne Internet ist der Kalender vielleicht unvollständig.'));
  }

  function levelText(counts) {
    return LEVELS.filter(level => level.key !== 'refresh' || counts.refresh > 0)
      .map(level => `${counts[level.key]} ${level.label}`).join(' · ');
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

  // weeks: [{ week, words }], getStats(word) → { correct, wrong, lastPracticed } oder undefined
  function levelCard(weeks, getStats, today) {
    const total = Logic.levelCounts(weeks.flatMap(w => w.words), getStats, today);
    // Neueste Woche zuerst
    const rows = [...weeks].sort((a, b) => b.week - a.week).map(w => {
      const counts = Logic.levelCounts(w.words, getStats, today);
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
      h('p', { class: 'muted small' }, 'Sichere Wörter, die 14 Tage nicht geübt wurden, sollten aufgefrischt werden.'),
      rows.length > 1
        ? h('details', { class: 'week-details' },
            h('summary', {}, 'Nach Wochen'),
            h('div', { class: 'stack' }, rows))
        : h('div', { class: 'stack' }, rows));
  }

  function refreshCard(words, onStart) {
    if (words.length === 0) {
      return card('Auffrischen', h('p', { class: 'muted' }, 'Alles frisch 🎉'));
    }
    return card('Auffrischen',
      h('p', {}, words.length === 1
        ? '1 Wort wartet aufs Auffrischen.'
        : `${words.length} Wörter warten aufs Auffrischen.`),
      h('p', { class: 'muted small' },
        `Lange nicht geübt. Eine Runde nimmt bis zu ${Logic.REFRESH_MAX_WORDS} davon.`),
      startButtons(words.slice(0, Logic.REFRESH_MAX_WORDS), onStart));
  }

  function weekStat(value, label) {
    return h('div', { class: 'results-stat' },
      h('div', { class: 'results-stat-number small' }, String(value)),
      h('div', { class: 'results-stat-label' }, label));
  }

  function rateChange(now, before) {
    if (now === null || before === null) return null;
    const diff = Math.round((now - before) * 100);
    if (diff === 0) return h('span', { class: 'muted' }, '= gleich');
    return diff > 0
      ? h('span', { class: 'trend-up' }, `▲ ${diff} Punkte`)
      : h('span', { class: 'trend-down' }, `▼ ${-diff} Punkte`);
  }

  // lastDate: letzter Übungstag (YYYY-MM-DD) oder null
  function weekCard(rounds, today, lastDate) {
    const { thisWeek, lastWeek } = Logic.weekSummary(rounds, today);
    const change = rateChange(thisWeek.rate, lastWeek.rate);
    return card('Diese Woche',
      h('div', { class: 'week-stats' },
        weekStat(thisWeek.rounds, thisWeek.rounds === 1 ? 'Runde' : 'Runden'),
        weekStat(thisWeek.words, 'Wörter'),
        weekStat(pct(thisWeek.rate), 'richtig')),
      h('p', { class: 'muted small' },
        `Vorwoche: ${plural(lastWeek.rounds, 'Runde', 'Runden')} · ${plural(lastWeek.words, 'Wort', 'Wörter')} · ${pct(lastWeek.rate)} richtig`),
      change ? h('p', { class: 'small' }, 'Trefferquote zur Vorwoche: ', change) : null,
      h('p', { class: 'muted small' }, `Zuletzt geübt: ${lastDate ? longDate(lastDate) : '–'}`));
  }

  function trendCard(rounds, today) {
    const series = MODES.map(mode => ({ ...mode, weeks: Logic.weeklyAccuracy(rounds, today, mode.key) }));
    const columns = series[0].weeks.map((week, i) => {
      const values = series.map(s => {
        const rate = s.weeks[i].rate;
        return { key: s.key, label: s.label, pct: rate === null ? null : Math.round(rate * 100) };
      });
      const label = `Woche ab ${shortDate(week.weekStart)}: ` + values
        .map(v => `${v.label} ${v.pct === null ? 'keine Runde' : `${v.pct} % richtig`}`).join(', ');
      return h('div', { class: 'trend-col', role: 'listitem', 'aria-label': label, title: label },
        h('div', { class: 'trend-values', 'aria-hidden': 'true' }, values.map(v =>
          h('span', { class: `trend-value mode-${v.key}` }, v.pct === null ? '–' : `${v.pct}`))),
        h('div', { class: 'trend-track', 'aria-hidden': 'true' }, values.map(v => {
          const fill = h('div', { class: `trend-fill mode-${v.key}` });
          fill.style.height = `${v.pct ?? 0}%`;
          return fill;
        })),
        h('div', { class: 'trend-label', 'aria-hidden': 'true' }, shortDate(week.weekStart)));
    });
    return card('Verlauf',
      h('div', { class: 'trend', role: 'list', 'aria-label': 'Trefferquote pro Woche' }, columns),
      h('div', { class: 'level-legend muted small' }, MODES.map(mode =>
        h('span', {}, h('span', { class: `legend-dot trend-${mode.key}` }), mode.label))),
      h('p', { class: 'muted small' },
        'Prozent richtig pro Woche, ohne Runden „Nur die falschen“. Bei Karteikarten schätzt man sich selbst ein.'));
  }

  // wordsByKey: Map 'week|en' → Wort { week, en, de }; onStart optional für Übungsknöpfe
  function difficultCard(rows, wordsByKey, onStart) {
    if (rows.length === 0) {
      return card('Schwierige Wörter', h('p', { class: 'muted' }, 'Keine auffälligen Wörter. 🎉'));
    }
    const list = h('div', { class: 'stack' }, rows.map(r => {
      const word = wordsByKey.get(`${r.week}|${r.word_en}`);
      return h('div', { class: 'results-word-item' },
        h('span', {}, '❌'),
        h('span', {}, `${r.word_en} → ${word ? word.de : '?'}`),
        h('span', { class: 'muted small push-right' }, `${r.wrong} von ${r.correct + r.wrong} falsch`));
    }));
    const words = rows.map(r => wordsByKey.get(`${r.week}|${r.word_en}`)).filter(Boolean);
    return card('Schwierige Wörter', list,
      onStart && words.length > 0 ? startButtons(words, onStart) : null);
  }

  // Kinderzeile der Eltern: Serie, heute geübt, Wochenziel, Lernstand; gleiche Regeln wie die Statistik
  function childSummary(name, dates, counts, today, onOpen) {
    const { current, playedToday } = Logic.streaks(dates, today);
    const { done, goal } = Logic.weekGoal(dates, today);
    const label = `${name}: ${days(current)} am Stück, heute ${playedToday ? 'geübt' : 'noch nicht geübt'}, ` +
      `${done} von ${goal} Tagen diese Woche, ${levelText(counts)}`;
    return h('button', { class: 'child-summary', type: 'button', 'aria-label': label, onclick: onOpen },
      h('span', { class: 'child-summary-head' },
        h('strong', {}, name),
        h('span', { class: 'muted small' }, `🔥 ${current} · heute ${playedToday ? '✓' : '–'} · Woche ${done}/${goal}`),
        h('span', { class: 'muted chevron' }, '›')),
      levelBar(counts));
  }

  return { streakCard, calendarCard, levelCard, refreshCard, weekCard, trendCard, difficultCard, childSummary, levelBar };
})();
