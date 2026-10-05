// dataService.js – Phase 2: Supabase Anbindung mit lokalem Offline-Fallback

const DataService = (() => {
  const SUPABASE_URL = 'https://fhkojiwbcdhkgpozltqp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FiZZwcCmXDF5Vl7sPP_VYA_1HF86lVc';

  let supabase = null;
  if (typeof window !== 'undefined' && window.supabase && typeof window.supabase.createClient === 'function') {
    supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
  }

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

    // 2. Im Hintergrund in Supabase synchronisieren
    if (supabase) {
      try {
        const currentEntry = all[key][word];
        await supabase.from('progress').upsert({
          child_name: 'Kind',
          week: week,
          word_en: word,
          correct: currentEntry.correct,
          wrong: currentEntry.wrong,
          last_practiced: currentEntry.lastPracticed
        }, { onConflict: 'child_name,week,word_en' });
      } catch (err) {
        console.warn('Cloud sync to Supabase failed:', err);
      }
    }
  }

  // Statistik für eine Woche
  function getWeekStats(week) {
    const progress = getProgress(week);
    const entries = Object.values(progress);
    if (entries.length === 0) return { practiced: 0, totalCorrect: 0, totalWrong: 0 };

    return {
      practiced: entries.length,
      totalCorrect: entries.reduce((sum, e) => sum + e.correct, 0),
      totalWrong: entries.reduce((sum, e) => sum + e.wrong, 0)
    };
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
    getWeekStats,
    getAllStats
  };
})();
