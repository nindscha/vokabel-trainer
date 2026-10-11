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

  return {
    normalizeText,
    getAcceptedVariants,
    checkAnswer,
    shuffleArray,
    recapKey,
    selectRecapWords
  };
})();
