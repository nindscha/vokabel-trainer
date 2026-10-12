// logic.js – reine Logik ohne DOM und ohne Speicherzugriff

const Logic = (() => {
  function normalizeText(text) {
    if (!text) return '';
    return text
      .toLowerCase()
      .trim()
      .replace(/ß/g, 'ss')
      .replace(/[.,/#!$%^&*;:{}=\-_`~()?"'„“”]/g, '')
      .replace(/\s+/g, ' ');
  }

  function getAcceptedVariants(target) {
    const parts = target.split(/[,;/]/).map(s => s.trim()).filter(Boolean);
    const variants = new Set();

    const full = normalizeText(target);
    if (full) variants.add(full);

    parts.forEach(part => {
      const normPart = normalizeText(part);
      if (normPart) variants.add(normPart);

      const withParens = normalizeText(part.replace(/\((.*?)\)/g, '$1'));
      const withoutParens = normalizeText(part.replace(/\(.*?\)/g, ''));
      if (withParens) variants.add(withParens);
      if (withoutParens) variants.add(withoutParens);
    });

    return Array.from(variants).filter(v => v.length > 0);
  }

  function checkAnswer(userAnswer, target) {
    const normUser = normalizeText(userAnswer);
    if (!normUser) return false;
    const variants = getAcceptedVariants(target);
    return variants.includes(normUser);
  }

  function shuffleArray(list, random = Math.random) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  // 'wrong': Anteil falscher Antworten, ungeübt = 1. 'least': Anzahl Übungen, ungeübt = 0.
  function recapKey(stats, strategy) {
    const { correct = 0, wrong = 0 } = stats || {};
    const attempts = correct + wrong;
    if (strategy === 'wrong') return attempts === 0 ? 1 : wrong / attempts;
    return attempts;
  }

  // getStats liefert die Fortschrittswerte eines Wortes ({ correct, wrong, … }) oder undefined
  function selectRecapWords(words, count, strategy, getStats) {
    const pool = shuffleArray(words);
    if (strategy === 'random') return pool.slice(0, count);

    // Zufällige Reihenfolge vor dem Sortieren verteilt Gleichstände fair
    const keyed = pool.map(word => ({ word, key: recapKey(getStats(word), strategy) }));
    keyed.sort((a, b) => strategy === 'wrong' ? b.key - a.key : a.key - b.key);
    return keyed.slice(0, count).map(item => item.word);
  }

  // ---------- Statistik ----------
  const SECURE_MIN_CORRECT = 3;
  const SECURE_MIN_RATE = 0.7;
  const REFRESH_AFTER_DAYS = 14;
  const REFRESH_MAX_WORDS = 10;
  const CALENDAR_WEEKS = 8;
  const TREND_WEEKS = 8;
  const DIFFICULT_MIN_ATTEMPTS = 2;
  const DIFFICULT_MAX_WORDS = 10;
  const DAY_MS = 86400000;

  // Datum als YYYY-MM-DD in lokaler Zeit (toISOString wäre UTC)
  function localDate(date = new Date()) {
    const pad = n => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  // Tage als ganze Zahlen über UTC, damit die Sommerzeit nichts verschiebt
  function toDayNumber(iso) {
    const [y, m, d] = iso.split('-').map(Number);
    return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
  }

  function fromDayNumber(n) {
    return new Date(n * DAY_MS).toISOString().slice(0, 10);
  }

  function addDays(iso, days) {
    return fromDayNumber(toDayNumber(iso) + days);
  }

  // Montag der Woche
  function weekStart(iso) {
    const n = toDayNumber(iso);
    const weekday = (new Date(n * DAY_MS).getUTCDay() + 6) % 7;
    return fromDayNumber(n - weekday);
  }

  function wordLevel(stats) {
    const { correct = 0, wrong = 0 } = stats || {};
    const attempts = correct + wrong;
    if (attempts === 0) return 'new';
    if (correct >= SECURE_MIN_CORRECT && correct / attempts >= SECURE_MIN_RATE) return 'secure';
    return 'shaky';
  }

  function levelCounts(words, getStats) {
    const counts = { new: 0, shaky: 0, secure: 0 };
    words.forEach(word => { counts[wordLevel(getStats(word))]++; });
    return counts;
  }

  // Geübte Wörter, deren letzte Übung mindestens REFRESH_AFTER_DAYS zurückliegt
  function wordsToRefresh(words, getStats, today) {
    const limit = toDayNumber(today) - REFRESH_AFTER_DAYS;
    return words
      .map(word => ({ word, stats: getStats(word) }))
      .filter(({ stats }) => wordLevel(stats) !== 'new' && stats.lastPracticed &&
        toDayNumber(stats.lastPracticed) <= limit)
      .sort((a, b) => a.stats.lastPracticed.localeCompare(b.stats.lastPracticed))
      .map(item => item.word);
  }

  // Heute noch nicht gespielt: die Serie bis gestern zählt weiter
  function streaks(dates, today) {
    const days = [...new Set(dates)].map(toDayNumber).sort((a, b) => a - b);
    const played = new Set(days);
    let longest = 0;
    let run = 0;
    days.forEach((day, i) => {
      run = i > 0 && day === days[i - 1] + 1 ? run + 1 : 1;
      longest = Math.max(longest, run);
    });
    const t = toDayNumber(today);
    const playedToday = played.has(t);
    let current = 0;
    for (let day = playedToday ? t : t - 1; played.has(day); day--) current++;
    return { current, longest, playedToday };
  }

  function firstCalendarDay(today, weeks) {
    return addDays(weekStart(today), -7 * (weeks - 1));
  }

  function calendarDays(dates, today) {
    const played = new Set(dates);
    const first = firstCalendarDay(today, CALENDAR_WEEKS);
    const t = toDayNumber(today);
    return Array.from({ length: CALENDAR_WEEKS * 7 }, (_, i) => {
      const date = addDays(first, i);
      return { date, played: played.has(date), future: toDayNumber(date) > t };
    });
  }

  // Runden "Nur die falschen" verzerren die Quote und zählen nicht
  function weeklyAccuracy(rounds, today) {
    const first = firstCalendarDay(today, TREND_WEEKS);
    const weeks = Array.from({ length: TREND_WEEKS }, (_, i) =>
      ({ weekStart: addDays(first, 7 * i), correct: 0, total: 0 }));
    const byStart = new Map(weeks.map(w => [w.weekStart, w]));
    rounds.forEach(round => {
      if (round.is_retry) return;
      const week = byStart.get(weekStart(round.played_on));
      if (!week) return;
      week.correct += round.correct;
      week.total += round.word_count;
    });
    return weeks.map(w => ({ weekStart: w.weekStart, rate: w.total > 0 ? w.correct / w.total : null }));
  }

  function difficultWords(rows) {
    return rows
      .filter(r => r.wrong > 0 && r.correct + r.wrong >= DIFFICULT_MIN_ATTEMPTS)
      .map(row => ({ row, rate: row.wrong / (row.correct + row.wrong) }))
      .sort((a, b) => b.rate - a.rate || b.row.wrong - a.row.wrong)
      .slice(0, DIFFICULT_MAX_WORDS)
      .map(item => item.row);
  }

  return {
    normalizeText,
    getAcceptedVariants,
    checkAnswer,
    shuffleArray,
    recapKey,
    selectRecapWords,
    REFRESH_MAX_WORDS,
    localDate,
    addDays,
    weekStart,
    wordLevel,
    levelCounts,
    wordsToRefresh,
    streaks,
    calendarDays,
    weeklyAccuracy,
    difficultWords
  };
})();
