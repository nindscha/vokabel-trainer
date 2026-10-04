// dataService.js – Phase 1: JSON + LocalStorage
// Dieses Modul ist bewusst austauschbar für Phase 2 (Supabase)

const DataService = (() => {
  let cachedData = null;

  async function loadData() {
    if (cachedData) return cachedData;
    const res = await fetch('vokabeln.json');
    cachedData = await res.json();
    return cachedData;
  }

  // Alle Wochen laden (für die Übersicht)
  async function getWeeks() {
    const data = await loadData();
    return data.weeks.map(w => ({
      week: w.week,
      label: w.label,
      wordCount: w.words.length
    }));
  }

  // Vokabeln einer bestimmten Woche laden
  async function getWords(week) {
    const data = await loadData();
    const found = data.weeks.find(w => w.week === week);
    return found ? found.words : [];
  }

  // Fortschritt einer Woche laden
  function getProgress(week) {
    const all = JSON.parse(localStorage.getItem('vokabel_progress') || '{}');
    return all[`week_${week}`] || {};
  }

  // Fortschritt für ein einzelnes Wort speichern
  function saveWordResult(week, word, correct) {
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
  }

  // Statistik für eine Woche berechnen
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
