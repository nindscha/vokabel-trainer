// dataService.js – Supabase Anbindung mit lokalem Offline-Fallback

const DataService = (() => {
  const PROGRESS_KEY = 'vokabel_progress';
  const OWNER_KEY = 'vokabel_progress_owner';
  const supabase = Backend.client;

  let cachedWeeks = null;
  const cachedWordsByWeek = {};

  // Lokale JSON-Datei als Fallback laden
  async function loadLocalJson() {
    try {
      const res = await fetch('vokabeln.json?t=' + Date.now(), { cache: 'no-cache' });
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
          .select('week, week_label')
          .order('week', { ascending: true });

        if (!error && data && data.length > 0) {
          const map = {};
          data.forEach(row => {
            if (!map[row.week]) {
              map[row.week] = { week: row.week, label: row.week_label, wordCount: 0 };
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
      label: w.label,
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
    all[key][word].lastPracticed = new Date().toISOString().split('T')[0];
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

    // Fortschritt eines anderen Kindes auf diesem Gerät nicht vermischen
    const owner = localStorage.getItem(OWNER_KEY);
    if (owner && owner !== childId) localStorage.removeItem(PROGRESS_KEY);
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
    getProgress,
    saveWordResult,
    syncChildProgress,
    getWeekStats,
    getAllStats
  };
})();
