// app.js – Vokabel-Trainer Hauptlogik

const App = (() => {
  const { h } = Dom;

  // State
  let currentWeek = null;
  let weekAllWords = []; // Alle Vokabeln der ausgewählten Woche
  let currentWords = []; // Aktuell zu übende Vokabeln (evtl. nur falsche)
  let currentIndex = 0;
  let direction = 'de-en'; // 'de-en' oder 'en-de'
  let currentMode = 'quiz'; // 'quiz' | 'flashcard'
  let sessionResults = []; // [{ word, correct }]
  let isFlipped = false;
  let isAnimating = false;
  let flashcardResetTimer = null;
  let quizState = 'input'; // 'input' | 'feedback'
  let recapOptions = null; // { count, strategy } im Wiederholungs-Modus, sonst null
  let recapStrategy = 'random'; // 'random' | 'wrong' | 'least'
  let recapTotal = 0; // Gesamtzahl aller Vokabeln für den Wiederholungs-Modus

  // DOM Elements
  const views = {
    home: document.getElementById('view-home'),
    mode: document.getElementById('view-mode'),
    flashcard: document.getElementById('view-flashcard'),
    quiz: document.getElementById('view-quiz'),
    results: document.getElementById('view-results'),
    account: document.getElementById('view-account'),
    family: document.getElementById('view-family'),
    progress: document.getElementById('view-progress'),
    recap: document.getElementById('view-recap')
  };

  // ---------- Navigation ----------
  function showView(name) {
    Object.values(views).forEach(v => v.classList.remove('active'));
    views[name].classList.add('active');
    window.scrollTo(0, 0);
  }

  // ---------- Home View ----------
  async function renderHome() {
    const weeks = await DataService.getWeeks();
    const weekList = document.getElementById('week-list');
    const stats = DataService.getAllStats();

    // Header stats
    document.getElementById('total-score').textContent =
      `🔥 ${stats.totalCorrect}`;
    const child = AuthService.getChild();
    document.getElementById('account-btn').textContent = child ? `👤 ${child.name}` : '👤';

    weekList.replaceChildren();
    if (weeks.length === 0) {
      weekList.append(h('div', { class: 'empty-state' },
        h('div', { class: 'empty-state-icon' }, '📭'),
        h('p', {}, 'Noch keine Vokabeln vorhanden.')));
      showView('home');
      return;
    }

    const weekIcons = ['🐾', '🎨', '🍎', '🏠', '👨‍👩‍👧‍👦', '🌍', '📚', '⭐', '🎵', '🌈',
                       '🚗', '🍕', '⚽', '🌸', '🎮', '🧩', '🎯', '🎪', '🌊', '🦋'];

    weeks.forEach((w, i) => {
      const weekStats = DataService.getWeekStats(w.week);
      const pct = w.wordCount > 0
        ? Math.round((weekStats.practiced / w.wordCount) * 100)
        : 0;

      const fill = h('div', { class: 'progress-bar-fill' });
      fill.style.width = `${pct}%`;
      const card = h('button', { class: 'week-card' },
        h('div', { class: 'week-card-icon' }, weekIcons[i % weekIcons.length]),
        h('div', { class: 'week-card-content' },
          h('div', { class: 'week-card-title' }, `Woche ${w.week}`),
          h('div', { class: 'week-card-subtitle' }, `${w.wordCount} Vokabeln`),
          h('div', { class: 'progress-bar-bg' }, fill)),
        h('div', { class: 'week-card-progress' },
          h('div', { class: 'week-card-progress-ring' }, `${pct}%`)));
      card.type = 'button';
      card.addEventListener('click', () => selectWeek(w.week));
      weekList.append(card);
    });

    const recapCard = h('button', { class: 'week-card recap-card' },
      h('div', { class: 'week-card-icon' }, '🔁'),
      h('div', { class: 'week-card-content' },
        h('div', { class: 'week-card-title' }, 'Wiederholung'),
        h('div', { class: 'week-card-subtitle' }, 'Wörter aus allen Wochen')));
    recapCard.type = 'button';
    recapCard.addEventListener('click', openRecap);
    weekList.append(recapCard);

    showView('home');
  }

  // ---------- Week Selection → Mode ----------
  async function selectWeek(week) {
    currentWeek = week;
    recapOptions = null;
    weekAllWords = await DataService.getWords(week);
    currentWords = [...weekAllWords];

    document.getElementById('mode-title').textContent = `Woche ${week}`;
    document.getElementById('mode-word-count').textContent =
      `${weekAllWords.length} Vokabeln`;

    showView('mode');
  }

  // ---------- Direction Toggle ----------
  function setDirection(dir) {
    direction = dir;
    document.querySelectorAll('.direction-toggle button').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.dir === dir);
    });
  }

  // ---------- Flashcard Mode ----------
  function startFlashcards(wordsToUse) {
    clearTimeout(flashcardResetTimer);
    flashcardResetTimer = null;
    document.getElementById('flashcard').classList.remove('flipped');
    currentMode = 'flashcard';
    currentWords = wordsToUse ? [...wordsToUse] : [...weekAllWords];
    currentIndex = 0;
    sessionResults = [];
    isFlipped = false;
    isAnimating = false;
    shuffleWords();
    renderFlashcard();
    showView('flashcard');
  }

  function renderFlashcard() {
    if (currentIndex >= currentWords.length) {
      showResults();
      return;
    }

    const word = currentWords[currentIndex];
    const front = direction === 'de-en' ? word.de : word.en;
    const back = direction === 'de-en' ? word.en : word.de;
    const frontLabel = direction === 'de-en' ? 'Deutsch' : 'English';
    const backLabel = direction === 'de-en' ? 'English' : 'Deutsch';

    document.getElementById('flashcard-counter').textContent =
      `${currentIndex + 1} / ${currentWords.length}`;

    const card = document.getElementById('flashcard');

    // Show/hide buttons immediately
    document.getElementById('fc-btn-flip').classList.remove('hidden');
    document.getElementById('fc-btn-knew').classList.add('hidden');
    document.getElementById('fc-btn-didnt').classList.add('hidden');

    function updateContent() {
      document.getElementById('fc-front-label').textContent = frontLabel;
      document.getElementById('fc-front-word').textContent = front;
      document.getElementById('fc-back-label').textContent = backLabel;
      document.getElementById('fc-back-word').textContent = back;
      isAnimating = false;
    }

    if (isFlipped) {
      // Karte ist aufgedeckt → erst zurückdrehen, dann Inhalt tauschen
      isAnimating = true;
      card.classList.remove('flipped');
      isFlipped = false;
      clearTimeout(flashcardResetTimer);
      flashcardResetTimer = setTimeout(() => {
        flashcardResetTimer = null;
        updateContent();
      }, 500); // warten bis Flip-Animation fertig
    } else {
      updateContent();
    }
  }

  function flipCard() {
    if (isAnimating) return;
    const card = document.getElementById('flashcard');
    if (!isFlipped) {
      card.classList.add('flipped');
      isFlipped = true;
      // Show rating buttons
      document.getElementById('fc-btn-flip').classList.add('hidden');
      document.getElementById('fc-btn-knew').classList.remove('hidden');
      document.getElementById('fc-btn-didnt').classList.remove('hidden');
    }
  }

  function flashcardResult(knew) {
    const word = currentWords[currentIndex];
    const en = word.en;
    DataService.saveWordResult(word.week ?? currentWeek, en, knew);
    sessionResults.push({ word, correct: knew });
    currentIndex++;
    renderFlashcard();
  }

  // ---------- Quiz Mode ----------
  function startQuiz(wordsToUse) {
    currentMode = 'quiz';
    currentWords = wordsToUse ? [...wordsToUse] : [...weekAllWords];
    currentIndex = 0;
    sessionResults = [];
    shuffleWords();
    renderQuiz();
    showView('quiz');
  }

  function renderQuiz() {
    if (currentIndex >= currentWords.length) {
      showResults();
      return;
    }

    quizState = 'input';
    const word = currentWords[currentIndex];
    const prompt = direction === 'de-en' ? word.de : word.en;
    const promptLabel = direction === 'de-en'
      ? 'Übersetze ins Englische:'
      : 'Übersetze ins Deutsche:';

    document.getElementById('quiz-counter').textContent =
      `${currentIndex + 1} / ${currentWords.length}`;

    const pct = ((currentIndex) / currentWords.length) * 100;
    document.getElementById('quiz-progress-fill').style.width = `${pct}%`;

    document.getElementById('quiz-prompt-label').textContent = promptLabel;
    document.getElementById('quiz-prompt-word').textContent = prompt;

    const input = document.getElementById('quiz-answer');
    input.value = '';
    input.className = 'quiz-input';
    input.disabled = false;
    input.focus();

    document.getElementById('quiz-feedback').classList.add('hidden');
    document.getElementById('quiz-submit').textContent = 'Prüfen';
  }

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

  function submitQuiz() {
    const word = currentWords[currentIndex];
    const input = document.getElementById('quiz-answer');
    const feedback = document.getElementById('quiz-feedback');
    const btn = document.getElementById('quiz-submit');

    if (quizState === 'input') {
      const rawTarget = direction === 'de-en' ? word.en : word.de;
      const isCorrect = checkAnswer(input.value, rawTarget);

      input.classList.add(isCorrect ? 'correct' : 'wrong');
      input.disabled = true;

      feedback.classList.remove('hidden', 'correct', 'wrong');
      feedback.classList.add(isCorrect ? 'correct' : 'wrong');
      feedback.textContent = isCorrect
        ? `✅ Richtig! (${rawTarget})`
        : `❌ Richtig wäre: ${rawTarget}`;

      DataService.saveWordResult(word.week ?? currentWeek, word.en, isCorrect);
      sessionResults.push({ word, correct: isCorrect });

      btn.textContent = currentIndex < currentWords.length - 1 ? 'Weiter' : 'Ergebnis';
      quizState = 'feedback';
    } else {
      // Next question
      currentIndex++;
      renderQuiz();
    }
  }

  function handleQuizKeydown(e) {
    if (e.key === 'Enter') {
      submitQuiz();
    }
  }

  // ---------- Recap (Wiederholung über alle Wochen) ----------
  async function openRecap() {
    const words = await DataService.getAllWords();
    recapTotal = words.length;
    recapOptions = null;
    currentWeek = null;

    const weekCount = new Set(words.map(w => w.week)).size;
    document.getElementById('recap-total').textContent =
      `${recapTotal} Vokabeln aus ${weekCount} ${weekCount === 1 ? 'Woche' : 'Wochen'}`;
    document.getElementById('recap-count').value = Math.min(10, recapTotal);
    setRecapStrategy('random');
    clearRecapError();
    showView('recap');
  }

  function setRecapStrategy(strategy) {
    recapStrategy = strategy;
    document.querySelectorAll('.recap-strategy button').forEach(btn => {
      const active = btn.dataset.strategy === strategy;
      btn.classList.toggle('active', active);
      btn.setAttribute('aria-pressed', String(active));
    });
  }

  function showRecapError(message) {
    const box = document.getElementById('recap-error');
    box.textContent = message;
    box.classList.remove('hidden');
  }

  function clearRecapError() {
    const box = document.getElementById('recap-error');
    box.textContent = '';
    box.classList.add('hidden');
  }

  async function startRecap(mode) {
    clearRecapError();
    if (recapTotal === 0) {
      showRecapError('Noch keine Vokabeln vorhanden.');
      return;
    }
    const input = document.getElementById('recap-count');
    const requested = Number(input.value);
    if (!Number.isInteger(requested) || requested < 1) {
      showRecapError('Bitte eine ganze Zahl ab 1 eingeben.');
      return;
    }
    const count = Math.min(requested, recapTotal);
    input.value = count;
    recapOptions = { count, strategy: recapStrategy };
    await launchRecap(mode);
  }

  async function launchRecap(mode) {
    const words = await buildRecapSelection(recapOptions.count, recapOptions.strategy);
    if (mode === 'flashcard') {
      startFlashcards(words);
    } else {
      startQuiz(words);
    }
  }

  async function buildRecapSelection(count, strategy) {
    const pool = shuffleArray(await DataService.getAllWords());
    if (strategy === 'random') return pool.slice(0, count);

    // Zufällige Reihenfolge vor dem Sortieren verteilt Gleichstände fair
    const keyed = pool.map(word => ({ word, key: recapKey(word, strategy) }));
    keyed.sort((a, b) => strategy === 'wrong' ? b.key - a.key : a.key - b.key);
    return keyed.slice(0, count).map(item => item.word);
  }

  // 'wrong': Anteil falscher Antworten, ungeübt = 1. 'least': Anzahl Übungen, ungeübt = 0.
  function recapKey(word, strategy) {
    const { correct = 0, wrong = 0 } = DataService.getProgress(word.week)[word.en] || {};
    const attempts = correct + wrong;
    if (strategy === 'wrong') return attempts === 0 ? 1 : wrong / attempts;
    return attempts;
  }

  // ---------- Results View ----------
  function showResults() {
    const correct = sessionResults.filter(r => r.correct).length;
    const wrong = sessionResults.length - correct;
    const pct = sessionResults.length > 0
      ? Math.round((correct / sessionResults.length) * 100)
      : 0;

    const fullSetSize = recapOptions ? recapOptions.count : weekAllWords.length;
    const isRetryRound = currentWords.length < fullSetSize;
    let emoji, title;

    if (pct === 100) {
      emoji = '🏆';
      title = isRetryRound ? 'Alle Fehler gemeistert!' : 'Perfekt!';
    } else if (pct >= 80) {
      emoji = '🌟';
      title = 'Super gemacht!';
    } else if (pct >= 60) {
      emoji = '👍';
      title = 'Gut gemacht!';
    } else if (pct >= 40) {
      emoji = '💪';
      title = 'Weiter üben!';
    } else {
      emoji = '📖';
      title = 'Übung macht den Meister!';
    }

    const baseModeName = currentMode === 'flashcard' ? 'Karteikarten' : 'Quiz';
    const modeName = recapOptions ? `Wiederholung • ${baseModeName}` : baseModeName;
    document.getElementById('results-emoji').textContent = emoji;
    document.getElementById('results-title').textContent = title;
    document.getElementById('results-subtitle').textContent =
      `${correct} von ${sessionResults.length} richtig (${pct}%) • ${modeName}`;
    document.getElementById('results-correct-count').textContent = correct;
    document.getElementById('results-wrong-count').textContent = wrong;

    // Word list
    const wrongWords = sessionResults.filter(r => !r.correct).map(r => r.word);
    const wordList = document.getElementById('results-word-list');
    const btnRetryWrong = document.getElementById('btn-retry-wrong');
    const btnRetryAll = document.getElementById('btn-retry-all');

    if (wrongWords.length > 0) {
      document.getElementById('results-words-section').classList.remove('hidden');
      wordList.replaceChildren(...wrongWords.map(w =>
        h('div', { class: 'results-word-item' },
          h('span', { class: 'results-word-icon' }, '❌'),
          h('span', {}, `${w.de} → ${w.en}`))));

      if (btnRetryWrong) {
        btnRetryWrong.classList.remove('hidden');
        btnRetryWrong.textContent = `🎯 Nur die falschen wiederholen (${wrongWords.length} ${wrongWords.length === 1 ? 'Wort' : 'Wörter'})`;
      }
      if (btnRetryAll) {
        btnRetryAll.textContent = '🔄 Alle Wörter wiederholen';
      }
    } else {
      document.getElementById('results-words-section').classList.add('hidden');
      if (btnRetryWrong) {
        btnRetryWrong.classList.add('hidden');
      }
      if (btnRetryAll) {
        btnRetryAll.textContent = '🔄 Alle Wörter nochmal üben';
      }
    }

    showView('results');
  }

  function retryWrongWords() {
    const wrongWords = sessionResults.filter(r => !r.correct).map(r => r.word);
    if (wrongWords.length === 0) return;

    if (currentMode === 'flashcard') {
      startFlashcards(wrongWords);
    } else {
      startQuiz(wrongWords);
    }
  }

  function retryAllWords() {
    if (recapOptions) {
      launchRecap(currentMode);
      return;
    }
    if (currentMode === 'flashcard') {
      startFlashcards(weekAllWords);
    } else {
      startQuiz(weekAllWords);
    }
  }

  // ---------- Helpers ----------
  function shuffleArray(list) {
    const result = [...list];
    for (let i = result.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
  }

  function shuffleWords() {
    currentWords = shuffleArray(currentWords);
  }

  function goHome() {
    currentWeek = null;
    weekAllWords = [];
    currentWords = [];
    currentIndex = 0;
    sessionResults = [];
    recapOptions = null;
    renderHome();
  }

  // ---------- Init ----------
  function init() {
    document.addEventListener('keydown', event => {
      const target = event.target;
      if ((event.key === 'Enter' || event.key === ' ') &&
          target.getAttribute && target.getAttribute('role') === 'button') {
        event.preventDefault();
        target.click();
      }
    });
    const child = AuthService.getChild();
    if (child) {
      DataService.syncChildProgress(child.id).then(renderHome);
    }
    renderHome();

    // Register Service Worker with auto-update
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('sw.js').then(reg => {
        reg.update();
      }).catch(() => {});

      let refreshing = false;
      navigator.serviceWorker.addEventListener('controllerchange', () => {
        if (!refreshing) {
          refreshing = true;
          window.location.reload();
        }
      });
    }
  }

  // Public API
  return {
    init,
    showView,
    selectWeek,
    openRecap,
    setRecapStrategy,
    startRecap,
    setDirection,
    startFlashcards,
    startQuiz,
    flipCard,
    flashcardResult,
    submitQuiz,
    handleQuizKeydown,
    goHome,
    retryWrongWords,
    retryAllWords
  };
})();

// Start
document.addEventListener('DOMContentLoaded', App.init);
