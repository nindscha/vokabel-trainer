// family.js – Oberfläche für Anmeldung, Familien-Gruppen und Elternansicht

const Family = (() => {
  const $ = id => document.getElementById(id);

  const { h } = Dom;

  function setMessage(text, kind = 'error') {
    document.querySelectorAll('.form-message').forEach(box => {
      box.textContent = text || '';
      box.className = `form-message ${kind}${text ? '' : ' hidden'}`;
    });
  }

  function show(viewName, root) {
    App.showView(viewName);
    setMessage('');
    return root;
  }

  // Führt eine Aktion aus und zeigt Fehler als Meldung an
  async function run(button, action) {
    setMessage('');
    if (button) button.disabled = true;
    try {
      await action();
    } catch (err) {
      setMessage(err.message || String(err));
    } finally {
      if (button) button.disabled = false;
    }
  }

  function field(label, input) {
    return h('label', { class: 'field' }, h('span', {}, label), input);
  }

  function textInput(name, props = {}) {
    return h('input', {
      class: 'text-input',
      type: 'text',
      name,
      autocomplete: 'off',
      autocapitalize: 'none',
      spellcheck: 'false',
      required: true,
      ...props
    });
  }

  function card(title, ...content) {
    return h('section', { class: 'card' }, h('h3', {}, title), ...content);
  }

  // [{ week, en, de }] → [{ week, words }] in der Reihenfolge der Wochen
  function groupByWeek(words) {
    const map = new Map();
    words.forEach(word => {
      if (!map.has(word.week)) map.set(word.week, []);
      map.get(word.week).push(word);
    });
    return [...map].map(([week, list]) => ({ week, words: list }));
  }

  // ---------- Konto ----------
  async function open() {
    const root = show('account', $('account-content'));
    root.replaceChildren();

    if (!AuthService.isAvailable()) {
      root.append(h('p', { class: 'muted' }, 'Konto-Funktionen benötigen eine Internetverbindung.'));
      return;
    }

    root.append(h('p', { class: 'muted' }, 'Lade…'));
    const role = await AuthService.getRole();
    root.replaceChildren();

    if (role === 'parent') await renderParent(root);
    else if (role === 'child') await renderChild(root);
    else renderGuest(root);
  }

  function renderGuest(root) {
    const childForm = h('form', { class: 'stack' },
      field('Familiencode', textInput('code', { maxlength: 8, placeholder: 'z. B. K7M2QX9P' })),
      field('Dein Name', textInput('name', { maxlength: 40, autocapitalize: 'words' })),
      h('button', { class: 'btn-primary', type: 'submit' }, 'Beitreten')
    );
    childForm.addEventListener('submit', event => {
      event.preventDefault();
      const button = childForm.querySelector('button');
      run(button, async () => {
        const child = await AuthService.joinAsChild(childForm.code.value, childForm.name.value);
        await DataService.syncChildProgress(child.id);
        App.goHome();
      });
    });

    const email = h('input', {
      class: 'text-input', type: 'email', name: 'email', required: true, autocomplete: 'email'
    });
    const password = h('input', {
      class: 'text-input', type: 'password', name: 'password', required: true,
      minlength: 8, autocomplete: 'current-password'
    });
    const parentForm = h('form', { class: 'stack' },
      field('E-Mail', email),
      field('Passwort (mind. 8 Zeichen)', password),
      h('button', { class: 'btn-primary', type: 'submit' }, 'Anmelden')
    );
    parentForm.addEventListener('submit', event => {
      event.preventDefault();
      run(parentForm.querySelector('button[type=submit]'), async () => {
        await AuthService.signInParent(email.value.trim(), password.value);
        await open();
      });
    });
    root.append(
      card('👧 Ich bin ein Kind',
        h('p', { class: 'muted' }, 'Den Familiencode bekommst du von deinen Eltern.'),
        childForm),
      card('👨‍👩‍👧 Ich bin ein Elternteil', parentForm)
    );
  }

  async function renderChild(root) {
    const child = AuthService.getChild();
    const logout = h('button', { class: 'btn-secondary', type: 'button' }, 'Abmelden');
    logout.addEventListener('click', () => run(logout, async () => {
      // Letzter Abgleich, damit offline Geübtes nicht verloren geht
      await DataService.syncChildProgress(child.id);
      DataService.clearLocalProgress();
      await AuthService.signOut();
      await open();
    }));

    const loading = h('p', { class: 'muted' }, 'Lade Statistik…');
    root.append(card(`Hallo ${child.name}!`,
      h('p', { class: 'muted' }, `Familie ${child.familyName}. Dein Fortschritt wird gespeichert und ist für deine Eltern sichtbar.`),
      logout), loading);

    try {
      const [words, { rounds, complete }] = await Promise.all([
        DataService.getAllWords(),
        DataService.getChildRounds(child.id)
      ]);
      const today = Logic.localDate();
      const dates = rounds.map(r => r.played_on);
      const getStats = word => DataService.getProgress(word.week)[word.en];
      loading.replaceWith(
        Stats.streakCard(dates, today),
        Stats.calendarCard(dates, today, complete),
        Stats.levelCard(groupByWeek(words), getStats),
        Stats.refreshCard(Logic.wordsToRefresh(words, getStats, today), App.startWordSet));
    } catch (err) {
      loading.remove();
      setMessage(err.message || String(err));
    }
  }

  async function renderParent(root) {
    const user = await AuthService.getUser();
    const logout = h('button', { class: 'btn-secondary', type: 'button' }, 'Abmelden');
    logout.addEventListener('click', () => run(logout, async () => {
      await AuthService.signOut();
      await open();
    }));

    const familyList = h('div', { class: 'stack' });

    const createForm = h('form', { class: 'stack' },
      field('Name der Familie', textInput('name', { maxlength: 60, placeholder: 'z. B. Familie Müller' })),
      h('button', { class: 'btn-primary', type: 'submit' }, 'Familie erstellen')
    );
    createForm.addEventListener('submit', event => {
      event.preventDefault();
      run(createForm.querySelector('button'), async () => {
        const family = await FamilyService.createFamily(createForm.name.value);
        await openFamily(family);
      });
    });

    const inviteForm = h('form', { class: 'stack' },
      field('Einladungscode', textInput('code', { maxlength: 10 })),
      h('button', { class: 'btn-secondary', type: 'submit' }, 'Familie beitreten')
    );
    inviteForm.addEventListener('submit', event => {
      event.preventDefault();
      run(inviteForm.querySelector('button'), async () => {
        await FamilyService.acceptInvite(inviteForm.code.value);
        await open();
      });
    });

    // Kinder zuerst; Verwaltung und Konto werden seltener gebraucht
    const kidsList = h('div', { class: 'stack' }, h('p', { class: 'muted' }, 'Lade…'));
    root.append(
      card('Meine Kinder', kidsList),
      card('Familie verwalten', familyList,
        h('h4', {}, 'Neue Familie'), createForm,
        h('h4', {}, 'Einladung annehmen'), inviteForm),
      card('Angemeldet', h('p', { class: 'muted' }, user ? user.email : ''), logout)
    );

    try {
      const families = await FamilyService.listFamilies();
      if (families.length === 0) {
        familyList.append(h('p', { class: 'muted' }, 'Noch keine Familie. Erstelle eine oder tritt per Einladung bei.'));
        kidsList.replaceChildren(h('p', { class: 'muted' },
          'Noch keine Familie. Lege unter „Familie verwalten“ eine an oder nimm eine Einladung an.'));
        return;
      }
      families.forEach(family => {
        const row = h('button', { class: 'list-row', type: 'button' },
          h('span', {}, `🏠 ${family.name}`), h('span', { class: 'muted' }, '›'));
        row.addEventListener('click', () => openFamily(family));
        familyList.append(row);
      });
      await renderKids(kidsList, families);
    } catch (err) {
      setMessage(err.message);
    }
  }

  // Kinderliste mit Kurzinfo; jede Zeile öffnet sofort die Statistik, auch während sie lädt
  async function renderKids(list, families) {
    const childrenByFamily = await Promise.all(families.map(f => FamilyService.listChildren(f.id)));
    const words = DataService.getAllWords();
    const today = Logic.localDate();
    list.replaceChildren();
    families.forEach((family, i) => {
      const kids = childrenByFamily[i];
      if (families.length > 1) list.append(h('h4', {}, family.name));
      if (kids.length === 0) {
        list.append(h('p', { class: 'muted small' }, 'Noch keine Kinder angelegt.'));
      }
      kids.forEach(child => {
        const openStats = () => openProgress(family, child, kids, open);
        const slot = h('button', { class: 'child-summary', type: 'button', onclick: openStats },
          h('span', { class: 'child-summary-head' },
            h('strong', {}, child.name),
            h('span', { class: 'muted small' }, '…'),
            h('span', { class: 'muted chevron' }, '›')));
        list.append(slot);
        loadChildSummary(child, words, today, openStats)
          .then(summary => slot.replaceWith(summary))
          .catch(err => console.warn('Kurzinfo nicht geladen:', err.message || err));
      });
    });
  }

  async function loadChildSummary(child, wordsPromise, today, onOpen) {
    const [rows, rounds, words] = await Promise.all([
      FamilyService.getChildProgress(child.id),
      FamilyService.getChildRounds(child.id),
      wordsPromise
    ]);
    const progress = progressLookup(rows);
    const counts = Logic.levelCounts(words, word => progress.get(`${word.week}|${word.en}`));
    return Stats.childSummary(child.name, rounds.map(r => r.played_on), counts, today, onOpen);
  }

  // ---------- Familie ----------
  async function openFamily(family) {
    const root = show('family', $('family-content'));
    $('family-title').textContent = family.name;
    root.replaceChildren(h('p', { class: 'muted' }, 'Lade…'));

    try {
      const [children, parentCount] = await Promise.all([
        FamilyService.listChildren(family.id),
        FamilyService.countParents(family.id)
      ]);
      root.replaceChildren(
        renderCodeCard(family),
        renderChildrenCard(family, children),
        renderInviteCard(family, parentCount)
      );
    } catch (err) {
      root.replaceChildren();
      setMessage(err.message);
    }
  }

  function renderCodeCard(family) {
    return card('Familiencode für Kinder',
      h('div', { class: 'code-box' }, family.child_code),
      h('p', { class: 'muted' }, 'Kinder geben diesen Code und ihren Namen in der App ein (👤 oben rechts).'));
  }

  function renderChildrenCard(family, children) {
    const list = h('div', { class: 'stack' });
    if (children.length === 0) {
      list.append(h('p', { class: 'muted' }, 'Noch keine Kinder angelegt.'));
    }

    children.forEach(child => {
      const progressBtn = h('button', { class: 'btn-small', type: 'button' }, 'Fortschritt');
      progressBtn.addEventListener('click', () => openProgress(family, child, children));
      const removeBtn = h('button', {
        class: 'btn-small danger', type: 'button', 'aria-label': `${child.name} entfernen`
      }, '🗑');
      removeBtn.addEventListener('click', () => {
        if (!confirm(`${child.name} samt Fortschritt wirklich entfernen?`)) return;
        run(removeBtn, async () => {
          await FamilyService.removeChild(child.id);
          await openFamily(family);
        });
      });
      list.append(h('div', { class: 'child-row' },
        h('span', { class: 'child-name' }, child.name), progressBtn, removeBtn));
    });

    const form = h('form', { class: 'stack' },
      field('Kind hinzufügen', textInput('name', { maxlength: 40, autocapitalize: 'words' })),
      h('button', { class: 'btn-primary', type: 'submit' }, 'Hinzufügen')
    );
    form.addEventListener('submit', event => {
      event.preventDefault();
      run(form.querySelector('button'), async () => {
        await FamilyService.addChild(family.id, form.name.value);
        await openFamily(family);
      });
    });

    return card('Kinder', list, form);
  }

  function renderInviteCard(family, parentCount) {
    const result = h('div', { class: 'stack' });
    const button = h('button', { class: 'btn-secondary', type: 'button' }, 'Einladungscode erstellen');
    button.addEventListener('click', () => run(button, async () => {
      const code = await FamilyService.createInvite(family.id);
      result.replaceChildren(
        h('div', { class: 'code-box' }, code),
        h('p', { class: 'muted' }, '7 Tage gültig, einmal verwendbar.'));
    }));

    return card('Weitere Eltern einladen',
      h('p', { class: 'muted' }, `${parentCount} ${parentCount === 1 ? 'Elternteil' : 'Eltern'} in dieser Familie.`),
      button, result);
  }

  // ---------- Fortschritt eines Kindes ----------
  // Zählt Aufrufe, damit beim schnellen Umschalten keine ältere Antwort die neue überschreibt
  let progressRequest = 0;

  // siblings: Kinder der Familie für den Umschalter; back: Ziel von „← Zurück“
  async function openProgress(family, child, siblings = [child], back = () => openFamily(family)) {
    const request = ++progressRequest;
    const root = show('progress', $('progress-content'));
    $('progress-title').textContent = child.name;
    $('progress-back').onclick = back;
    const switcher = siblings.length > 1 ? childSwitcher(family, child, siblings, back) : null;
    root.replaceChildren(...[switcher, h('p', { class: 'muted' }, 'Lade…')].filter(Boolean));

    try {
      const [rows, words, rounds] = await Promise.all([
        FamilyService.getChildProgress(child.id),
        DataService.getAllWords(),
        FamilyService.getChildRounds(child.id)
      ]);
      if (request !== progressRequest) return;
      root.replaceChildren(...[switcher, ...buildProgress(rows, words, rounds)].filter(Boolean));
    } catch (err) {
      if (request !== progressRequest) return;
      root.replaceChildren(...[switcher].filter(Boolean));
      setMessage(err.message);
    }
  }

  function childSwitcher(family, current, siblings, back) {
    return h('div', { class: 'child-switcher', role: 'group', 'aria-label': 'Kind wählen' },
      siblings.map(child => h('button', {
        class: 'btn-small',
        type: 'button',
        'aria-pressed': String(child.id === current.id),
        onclick: () => {
          if (child.id !== current.id) openProgress(family, child, siblings, back);
        }
      }, child.name)));
  }

  function progressLookup(rows) {
    return new Map(rows.map(r => [`${r.week}|${r.word_en}`,
      { correct: r.correct, wrong: r.wrong, lastPracticed: r.last_practiced }]));
  }

  function formatDate(iso) {
    if (!iso) return '–';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE');
  }

  function percent(correct, wrong) {
    const total = correct + wrong;
    return total === 0 ? 0 : Math.round((correct / total) * 100);
  }

  function buildProgress(rows, words, rounds) {
    if (rows.length === 0 && rounds.length === 0) {
      return [h('p', { class: 'muted' }, 'Noch nichts geübt.')];
    }

    const totalCorrect = rows.reduce((sum, r) => sum + r.correct, 0);
    const totalWrong = rows.reduce((sum, r) => sum + r.wrong, 0);
    const lastDate = rows.map(r => r.last_practiced).filter(Boolean).sort().pop();

    const summary = h('div', { class: 'stat-grid' },
      stat(totalCorrect, 'Richtig', 'correct'),
      stat(totalWrong, 'Falsch', 'wrong'),
      stat(`${percent(totalCorrect, totalWrong)}%`, 'Quote'),
      stat(formatDate(lastDate), 'Zuletzt geübt'));

    const today = Logic.localDate();
    const dates = rounds.map(r => r.played_on);
    const progress = progressLookup(rows);
    const getStats = word => progress.get(`${word.week}|${word.en}`);
    const translations = new Map(words.map(w => [`${w.week}|${w.en}`, w.de]));

    return [
      summary,
      Stats.streakCard(dates, today),
      Stats.calendarCard(dates, today),
      Stats.levelCard(groupByWeek(words), getStats),
      Stats.trendCard(rounds, today),
      Stats.difficultCard(Logic.difficultWords(rows), translations)
    ];
  }

  function stat(value, label, kind = '') {
    return h('div', { class: 'results-stat' },
      h('div', { class: `results-stat-number small ${kind}` }, String(value)),
      h('div', { class: 'results-stat-label' }, label));
  }

  return { open };
})();
