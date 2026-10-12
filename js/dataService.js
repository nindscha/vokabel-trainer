// dataService.js – Supabase Anbindung mit lokalem Offline-Fallback

const DataService = (() => {
  const PROGRESS_KEY = 'vokabel_progress';
  const OWNER_KEY = 'vokabel_progress_owner';
  const ROUNDS_KEY = 'vokabel_rounds_pending';
  const ROUND_COLUMNS =
    'id, child_id, played_on, finished_at, mode, direction, week, is_retry, word_count, correct, wrong';
  const supabase = Backend.client;

  let cachedWeeks = null;
  const cachedWordsByWeek = {};

  // Lokale JSON-Datei als Fallback laden
  async function loadLocalJson() {
    try {
      const res = await fetch('data/vokabeln.json?t=' + Date.now(), { cache: 'no-cache' });
      return await res.json();
    } catch (e) {
      return { weeks: [] };
    }
  }

  // Alle Wochen laden (Supabase zuerst, Fallback auf JSON)
  async function getWeeks() {
    if (cachedWeeks) return cachedWeeks;

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('words')
          .select('week')
          .order('week', { ascending: true });

        if (!error && data && data.length > 0) {
          const map = {};
          data.forEach(row => {
            if (!map[row.week]) {
              map[row.week] = { week: row.week, wordCount: 0 };
            }
            map[row.week].wordCount++;
          });
          cachedWeeks = Object.values(map);
          return cachedWeeks;
        }
      } catch (err) {
        console.warn('Supabase getWeeks error, using local fallback:', err);
      }
    }

    // Fallback: vokabeln.json
    const localData = await loadLocalJson();
    cachedWeeks = localData.weeks.map(w => ({
      week: w.week,
      wordCount: w.words.length
    }));
    return cachedWeeks;
  }

  // Vokabeln einer bestimmten Woche laden
  async function getWords(week) {
    if (cachedWordsByWeek[week]) return cachedWordsByWeek[week];

    if (supabase) {
      try {
        const { data, error } = await supabase
          .from('words')
          .select('en, de')
          .eq('week', week)
          .order('id', { ascending: true });

        if (!error && data && data.length > 0) {
          cachedWordsByWeek[week] = data;
          return data;
        }
      } catch (err) {
        console.warn('Supabase getWords error, using local fallback:', err);
      }
    }

    // Fallback: vokabeln.json
    const localData = await loadLocalJson();
    const found = localData.weeks.find(w => w.week === week);
    const words = found ? found.words : [];
    cachedWordsByWeek[week] = words;
    return words;
  }

  // Alle Vokabeln aller Wochen laden, jeweils mit Wochenangabe
  async function getAllWords() {
    const weeks = await getWeeks();
    const lists = await Promise.all(weeks.map(w => getWords(w.week)));
    return lists.flatMap((words, i) =>
      words.map(w => ({ week: weeks[i].week, en: w.en, de: w.de })));
  }

  // Fortschritt einer Woche laden
  function getProgress(week) {
    const all = JSON.parse(localStorage.getItem('vokabel_progress') || '{}');
    return all[`week_${week}`] || {};
  }

  // Fortschritt für ein einzelnes Wort speichern (lokal + Supabase Cloud-Sync)
  async function saveWordResult(week, word, correct) {
    // 1. Sofort lokal speichern (für schnelle UI)
    const all = JSON.parse(localStorage.getItem('vokabel_progress') || '{}');
    const key = `week_${week}`;
    if (!all[key]) all[key] = {};
    if (!all[key][word]) all[key][word] = { correct: 0, wrong: 0, lastPracticed: null };

    if (correct) {
      all[key][word].correct++;
    } else {
      all[key][word].wrong++;
    }
    all[key][word].lastPracticed = Logic.localDate();
    localStorage.setItem('vokabel_progress', JSON.stringify(all));

    // 2. Im Hintergrund in Supabase synchronisieren (nur mit Kind-Anmeldung)
    const child = AuthService.getChild();
    if (supabase && child) {
      try {
        const { error } = await supabase.from('progress').upsert(
          toCloudRow(child.id, week, word, all[key][word]),
          { onConflict: 'child_id,week,word_en' }
        );
        if (error) console.warn('Cloud sync to Supabase failed:', error.message);
      } catch (err) {
        console.warn('Cloud sync to Supabase failed:', err);
      }
    }
  }

  function toCloudRow(childId, week, word, entry) {
    return {
      child_id: childId,
      week,
      word_en: word,
      correct: entry.correct,
      wrong: entry.wrong,
      last_practiced: entry.lastPracticed
    };
  }

  // Lokalen und Cloud-Fortschritt eines Kindes zusammenführen
  async function syncChildProgress(childId) {
    if (!supabase || !childId) return;

    // Nur eigenen Fortschritt übernehmen; Gast- oder fremder Fortschritt wird verworfen
    if (localStorage.getItem(OWNER_KEY) !== childId) {
      localStorage.removeItem(PROGRESS_KEY);
      localStorage.removeItem(ROUNDS_KEY);
    }
    localStorage.setItem(OWNER_KEY, childId);

    try {
      const { data, error } = await supabase
        .from('progress')
        .select('week, word_en, correct, wrong, last_practiced')
        .eq('child_id', childId);
      if (error) throw error;

      const all = JSON.parse(localStorage.getItem(PROGRESS_KEY) || '{}');
      (data || []).forEach(row => {
        const key = `week_${row.week}`;
        const local = all[key] && all[key][row.word_en];
        if (!local || row.correct + row.wrong >= local.correct + local.wrong) {
          if (!all[key]) all[key] = {};
          all[key][row.word_en] = {
            correct: row.correct,
            wrong: row.wrong,
            lastPracticed: row.last_practiced
          };
        }
      });
      localStorage.setItem(PROGRESS_KEY, JSON.stringify(all));

      const rows = [];
      for (const [key, words] of Object.entries(all)) {
        const week = Number(key.replace('week_', ''));
        for (const [word, entry] of Object.entries(words)) {
          rows.push(toCloudRow(childId, week, word, entry));
        }
      }
      if (rows.length > 0) {
        const { error: upsertError } = await supabase
          .from('progress')
          .upsert(rows, { onConflict: 'child_id,week,word_en' });
        if (upsertError) throw upsertError;
      }
    } catch (err) {
      console.warn('Progress sync failed:', err.message || err);
    }

    await flushPendingRounds(childId);
  }

  // Lokalen Fortschritt, wartende Runden und Besitzer löschen (beim Abmelden eines Kindes)
  function clearLocalProgress() {
    localStorage.removeItem(PROGRESS_KEY);
    localStorage.removeItem(ROUNDS_KEY);
    localStorage.removeItem(OWNER_KEY);
  }

  // PostgREST liefert höchstens 1000 Zeilen pro Anfrage, daher seitenweise laden.
  // buildQuery muss eine stabile Sortierung enthalten.
  async function fetchAllPages(buildQuery, pageSize = 1000) {
    const rows = [];
    for (let from = 0; ; from += pageSize) {
      const { data, error } = await buildQuery().range(from, from + pageSize - 1);
      if (error) throw error;
      rows.push(...data);
      if (data.length < pageSize) return rows;
    }
  }

  function readPendingRounds() {
    try {
      return JSON.parse(localStorage.getItem(ROUNDS_KEY)) || [];
    } catch (e) {
      return [];
    }
  }

  // Abgeschlossene Runde merken und hochladen (nur mit Kind-Anmeldung)
  async function recordRound({ mode, direction, week, isRetry, wordCount, correct, wrong }) {
    const child = AuthService.getChild();
    if (!child || wordCount === 0) return;

    const now = new Date();
    const pending = readPendingRounds();
    pending.push({
      id: crypto.randomUUID(),
      child_id: child.id,
      played_on: Logic.localDate(now),
      finished_at: now.toISOString(),
      mode,
      direction,
      week: week ?? null,
      is_retry: isRetry,
      word_count: wordCount,
      correct,
      wrong
    });
    localStorage.setItem(ROUNDS_KEY, JSON.stringify(pending));
    await flushPendingRounds(child.id);
  }

  // Wartende Runden hochladen; bereits vorhandene ids werden ignoriert
  async function flushPendingRounds(childId) {
    const pending = readPendingRounds().filter(r => r.child_id === childId);
    if (!supabase || pending.length === 0) return;
    try {
      const { error } = await supabase
        .from('rounds')
        .upsert(pending, { onConflict: 'id', ignoreDuplicates: true });
      if (error) throw error;
      const sent = new Set(pending.map(r => r.id));
      localStorage.setItem(ROUNDS_KEY,
        JSON.stringify(readPendingRounds().filter(r => !sent.has(r.id))));
    } catch (err) {
      console.warn('Round sync failed:', err.message || err);
    }
  }

  // Runden eines Kindes aus der Cloud plus noch wartende; complete=false ohne Cloud
  async function getChildRounds(childId) {
    const pending = readPendingRounds().filter(r => r.child_id === childId);
    if (!supabase) return { rounds: pending, complete: false };
    try {
      const data = await fetchAllPages(() => supabase
        .from('rounds')
        .select(ROUND_COLUMNS)
        .eq('child_id', childId)
        .order('id'));
      const ids = new Set(data.map(r => r.id));
      return { rounds: data.concat(pending.filter(r => !ids.has(r.id))), complete: true };
    } catch (err) {
      console.warn('Loading rounds failed:', err.message || err);
      return { rounds: pending, complete: false };
    }
  }

  // Statistik für eine Woche
  function getWeekStats(week) {
    return { practiced: Object.keys(getProgress(week)).length };
  }

  // Gesamtstatistik
  function getAllStats() {
    const all = JSON.parse(localStorage.getItem('vokabel_progress') || '{}');
    let totalCorrect = 0;
    let totalWrong = 0;
    for (const week of Object.values(all)) {
      for (const word of Object.values(week)) {
        totalCorrect += word.correct;
        totalWrong += word.wrong;
      }
    }
    return { totalCorrect, totalWrong };
  }

  return {
    getWeeks,
    getWords,
    getAllWords,
    getProgress,
    saveWordResult,
    syncChildProgress,
    clearLocalProgress,
    recordRound,
    getChildRounds,
    fetchAllPages,
    getWeekStats,
    getAllStats
  };
})();
