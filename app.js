// app.js – Vokabel-Trainer Hauptlogik

const App = (() => {
  // State
  let currentWeek = null;
  let currentWords = [];
  let currentIndex = 0;
  let direction = 'de-en'; // 'de-en' oder 'en-de'
  let quizResults = [];
  let isFlipped = false;
  let isAnimating = false;
  let quizState = 'input'; // 'input' | 'feedback'

  // DOM Elements
  const views = {
    home: document.getElementById('view-home'),
    mode: document.getElementById('view-mode'),
    flashcard: document.getElementById('view-flashcard'),
    quiz: document.getElementById('view-quiz'),
    results: document.getElementById('view-results')
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

    if (weeks.length === 0) {
      weekList.innerHTML = `
        <div class="empty-state">
          <div class="empty-state-icon">📭</div>
          <p>Noch keine Vokabeln vorhanden.</p>
        </div>`;
      showView('home');
      return;
    }

    const weekIcons = ['🐾', '🎨', '🍎', '🏠', '👨‍👩‍👧‍👦', '🌍', '📚', '⭐', '🎵', '🌈',
                       '🚗', '🍕', '⚽', '🌸', '🎮', '🧩', '🎯', '🎪', '🌊', '🦋'];

    weekList.innerHTML = weeks.map((w, i) => {
      const weekStats = DataService.getWeekStats(w.week);
      const pct = w.wordCount > 0
        ? Math.round((weekStats.practiced / w.wordCount) * 100)
        : 0;
      const icon = weekIcons[i % weekIcons.length];

      return `
        <div class="week-card" onclick="App.selectWeek(${w.week})">
          <div class="week-card-icon">${icon}</div>
          <div class="week-card-content">
            <div class="week-card-title">Woche ${w.week} – ${w.label}</div>
            <div class="week-card-subtitle">${w.wordCount} Vokabeln</div>
            <div class="progress-bar-bg">
              <div class="progress-bar-fill" style="width: ${pct}%"></div>
            </div>
          </div>
          <div class="week-card-progress">
            <div class="week-card-progress-ring">${pct}%</div>
          </div>
        </div>`;
    }).join('');

    showView('home');
  }

  // ---------- Week Selection → Mode ----------
  async function selectWeek(week) {
    currentWeek = week;
    currentWords = await DataService.getWords(week);

    const weeks = await DataService.getWeeks();
    const weekInfo = weeks.find(w => w.week === week);

    document.getElementById('mode-title').textContent =
      `Woche ${week} – ${weekInfo?.label || ''}`;
    document.getElementById('mode-word-count').textContent =
      `${currentWords.length} Vokabeln`;

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
  function startFlashcards() {
    currentIndex = 0;
    isFlipped = false;
    shuffleWords();
    renderFlashcard();
    showView('flashcard');
  }

  function renderFlashcard() {
    if (currentIndex >= currentWords.length) {
      goHome();
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
      setTimeout(updateContent, 500); // warten bis Flip-Animation fertig
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
    DataService.saveWordResult(currentWeek, en, knew);
    currentIndex++;
    renderFlashcard();
  }

  // ---------- Quiz Mode ----------
  function startQuiz() {
    currentIndex = 0;
    quizResults = [];
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

      DataService.saveWordResult(currentWeek, word.en, isCorrect);
      quizResults.push({ word, correct: isCorrect });

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

  // ---------- Results View ----------
  function showResults() {
    const correct = quizResults.filter(r => r.correct).length;
    const wrong = quizResults.length - correct;
    const pct = Math.round((correct / quizResults.length) * 100);

    let emoji, title;
    if (pct === 100) { emoji = '🏆'; title = 'Perfekt!'; }
    else if (pct >= 80) { emoji = '🌟'; title = 'Super gemacht!'; }
    else if (pct >= 60) { emoji = '👍'; title = 'Gut gemacht!'; }
    else if (pct >= 40) { emoji = '💪'; title = 'Weiter üben!'; }
    else { emoji = '📖'; title = 'Übung macht den Meister!'; }

    document.getElementById('results-emoji').textContent = emoji;
    document.getElementById('results-title').textContent = title;
    document.getElementById('results-subtitle').textContent =
      `${correct} von ${quizResults.length} richtig (${pct}%)`;
    document.getElementById('results-correct-count').textContent = correct;
    document.getElementById('results-wrong-count').textContent = wrong;

    // Word list
    const wrongWords = quizResults.filter(r => !r.correct);
    const wordList = document.getElementById('results-word-list');

    if (wrongWords.length > 0) {
      document.getElementById('results-words-section').classList.remove('hidden');
      wordList.innerHTML = wrongWords.map(r => `
        <div class="results-word-item">
          <span class="results-word-icon">❌</span>
          <span>${r.word.de} → ${r.word.en}</span>
        </div>
      `).join('');
    } else {
      document.getElementById('results-words-section').classList.add('hidden');
    }

    showView('results');
  }

  // ---------- Helpers ----------
  function shuffleWords() {
    currentWords = [...currentWords];
    for (let i = currentWords.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [currentWords[i], currentWords[j]] = [currentWords[j], currentWords[i]];
    }
  }

  function goHome() {
    currentWeek = null;
    currentWords = [];
    currentIndex = 0;
    renderHome();
  }

  // ---------- Init ----------
  function init() {
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
    selectWeek,
    setDirection,
    startFlashcards,
    startQuiz,
    flipCard,
    flashcardResult,
    submitQuiz,
    handleQuizKeydown,
    goHome,
    retryQuiz: startQuiz
  };
})();

// Start
document.addEventListener('DOMContentLoaded', App.init);
