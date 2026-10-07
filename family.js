// family.js – Oberfläche für Anmeldung, Familien-Gruppen und Elternansicht

const Family = (() => {
  const $ = id => document.getElementById(id);

  // Baut DOM-Knoten; Texte werden immer als Text eingefügt (kein HTML)
  function h(tag, props = {}, ...children) {
    const node = document.createElement(tag);
    Object.entries(props).forEach(([key, value]) => {
      if (value === false || value == null) return;
      if (key === 'class') node.className = value;
      else if (key.startsWith('on')) node.addEventListener(key.slice(2), value);
      else node.setAttribute(key, value === true ? '' : value);
    });
    children.flat().forEach(child => {
      if (child != null && child !== false) node.append(child);
    });
    return node;
  }

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
    else if (role === 'child') renderChild(root);
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

  function renderChild(root) {
    const child = AuthService.getChild();
    const logout = h('button', { class: 'btn-secondary', type: 'button' }, 'Abmelden');
    logout.addEventListener('click', () => run(logout, async () => {
      await AuthService.signOut();
      await open();
    }));

    root.append(card(`Hallo ${child.name}!`,
      h('p', { class: 'muted' }, `Familie ${child.familyName}. Dein Fortschritt wird gespeichert und ist für deine Eltern sichtbar.`),
      logout));
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

    root.append(
      card('Angemeldet', h('p', { class: 'muted' }, user ? user.email : ''), logout),
      card('Meine Familien', familyList),
      card('Neue Familie', createForm),
      card('Einladung annehmen', inviteForm)
    );

    try {
      const families = await FamilyService.listFamilies();
      if (families.length === 0) {
        familyList.append(h('p', { class: 'muted' }, 'Noch keine Familie. Erstelle eine oder tritt per Einladung bei.'));
      }
      families.forEach(family => {
        const row = h('button', { class: 'list-row', type: 'button' },
          h('span', {}, `🏠 ${family.name}`), h('span', { class: 'muted' }, '›'));
        row.addEventListener('click', () => openFamily(family));
        familyList.append(row);
      });
    } catch (err) {
      setMessage(err.message);
    }
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
      progressBtn.addEventListener('click', () => openProgress(family, child));
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
  async function openProgress(family, child) {
    const root = show('progress', $('progress-content'));
    $('progress-title').textContent = child.name;
    $('progress-back').onclick = () => openFamily(family);
    root.replaceChildren(h('p', { class: 'muted' }, 'Lade…'));

    try {
      const [rows, weeks] = await Promise.all([
        FamilyService.getChildProgress(child.id),
        DataService.getWeeks()
      ]);
      root.replaceChildren(...await buildProgress(rows, weeks));
    } catch (err) {
      root.replaceChildren();
      setMessage(err.message);
    }
  }

  function formatDate(iso) {
    if (!iso) return '–';
    return new Date(`${iso}T00:00:00`).toLocaleDateString('de-DE');
  }

  function percent(correct, wrong) {
    const total = correct + wrong;
    return total === 0 ? 0 : Math.round((correct / total) * 100);
  }

  async function buildProgress(rows, weeks) {
    if (rows.length === 0) {
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

    const weekRows = weeks.map(week => {
      const weekRowsData = rows.filter(r => r.week === week.week);
      const correct = weekRowsData.reduce((sum, r) => sum + r.correct, 0);
      const wrong = weekRowsData.reduce((sum, r) => sum + r.wrong, 0);
      const coverage = week.wordCount > 0
        ? Math.round((weekRowsData.length / week.wordCount) * 100)
        : 0;
      return h('div', { class: 'week-progress' },
        h('div', { class: 'week-progress-head' },
          h('strong', {}, `Woche ${week.week} – ${week.label}`),
          h('span', { class: 'muted' }, `${percent(correct, wrong)}% richtig`)),
        h('div', { class: 'progress-bar-bg' },
          h('div', { class: 'progress-bar-fill', style: `width: ${coverage}%` })),
        h('div', { class: 'muted small' },
          `${weekRowsData.length} von ${week.wordCount} Vokabeln geübt`));
    });

    const difficult = rows
      .filter(r => r.wrong > r.correct)
      .sort((a, b) => (b.wrong - b.correct) - (a.wrong - a.correct))
      .slice(0, 10);

    const translations = {};
    for (const weekNumber of new Set(difficult.map(r => r.week))) {
      const words = await DataService.getWords(weekNumber);
      words.forEach(w => { translations[`${weekNumber}|${w.en}`] = w.de; });
    }

    const difficultList = difficult.length === 0
      ? h('p', { class: 'muted' }, 'Keine auffälligen Wörter. 🎉')
      : h('div', { class: 'stack' }, difficult.map(r =>
          h('div', { class: 'results-word-item' },
            h('span', {}, '❌'),
            h('span', {}, `${r.word_en} → ${translations[`${r.week}|${r.word_en}`] || '?'}`),
            h('span', { class: 'muted small push-right' }, `${r.wrong}× falsch`))));

    return [
      summary,
      card('Pro Woche', h('div', { class: 'stack' }, weekRows)),
      card('Schwierige Wörter', difficultList)
    ];
  }

  function stat(value, label, kind = '') {
    return h('div', { class: 'results-stat' },
      h('div', { class: `results-stat-number small ${kind}` }, String(value)),
      h('div', { class: 'results-stat-label' }, label));
  }

  return { open };
})();
