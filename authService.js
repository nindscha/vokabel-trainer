// authService.js – Anmeldung für Eltern (E-Mail) und Kinder (Familiencode + Name)

const AuthService = (() => {
  const CHILD_KEY = 'vokabel_child';
  const client = Backend.client;

  function isAvailable() {
    return client !== null;
  }

  function friendlyError(error) {
    const msg = (error && error.message) || 'Unbekannter Fehler';
    if (/invalid login credentials/i.test(msg)) return 'E-Mail oder Passwort ist falsch.';
    if (/email not confirmed/i.test(msg)) return 'Bitte bestätige zuerst deine E-Mail-Adresse.';
    if (/failed to fetch|network/i.test(msg)) return 'Keine Internetverbindung.';
    return msg;
  }

  function getChild() {
    try {
      return JSON.parse(localStorage.getItem(CHILD_KEY));
    } catch (e) {
      return null;
    }
  }

  async function getSession() {
    if (!client) return null;
    const { data } = await client.auth.getSession();
    return data.session;
  }

  // 'guest' | 'child' | 'parent'
  async function getRole() {
    const session = await getSession();
    if (!session) return 'guest';
    if (!session.user.is_anonymous) return 'parent';
    return getChild() ? 'child' : 'guest';
  }

  async function getUser() {
    const session = await getSession();
    return session ? session.user : null;
  }

  async function signOut() {
    localStorage.removeItem(CHILD_KEY);
    if (client) await client.auth.signOut();
  }

  async function signInParent(email, password) {
    localStorage.removeItem(CHILD_KEY);
    const { error } = await client.auth.signInWithPassword({ email, password });
    if (error) throw new Error(friendlyError(error));
  }

  async function joinAsChild(code, name) {
    await signOut();

    const { error: authError } = await client.auth.signInAnonymously();
    if (authError) throw new Error(friendlyError(authError));

    const { data, error } = await client.rpc('join_as_child', {
      p_code: code,
      p_name: name
    });
    const row = Array.isArray(data) ? data[0] : data;
    if (error || !row) {
      await client.auth.signOut();
      throw new Error(friendlyError(error || { message: 'Beitritt fehlgeschlagen.' }));
    }

    const child = { id: row.child_id, name: row.child_name, familyName: row.family_name };
    localStorage.setItem(CHILD_KEY, JSON.stringify(child));
    return child;
  }

  return {
    isAvailable,
    friendlyError,
    getChild,
    getRole,
    getUser,
    signOut,
    signInParent,
    joinAsChild
  };
})();
