// familyService.js – Familien, Kinder, Einladungen und Fortschritt (Eltern-Seite)

const FamilyService = (() => {
  const client = Backend.client;

  async function unwrap(promise) {
    const { data, error } = await promise;
    if (error) throw new Error(AuthService.friendlyError(error));
    return data;
  }

  function listFamilies() {
    return unwrap(
      client.from('families')
        .select('id, name, child_code, created_at')
        .order('created_at', { ascending: true })
    );
  }

  function listChildren(familyId) {
    return unwrap(
      client.from('children')
        .select('id, name')
        .eq('family_id', familyId)
        .order('name', { ascending: true })
    );
  }

  async function countParents(familyId) {
    const { count, error } = await client
      .from('family_members')
      .select('user_id', { count: 'exact', head: true })
      .eq('family_id', familyId);
    if (error) throw new Error(AuthService.friendlyError(error));
    return count || 0;
  }

  function createFamily(name) {
    return unwrap(client.rpc('create_family', { p_name: name }));
  }

  function addChild(familyId, name) {
    return unwrap(client.rpc('add_child', { p_family_id: familyId, p_name: name }));
  }

  async function removeChild(childId) {
    await unwrap(client.from('children').delete().eq('id', childId));
  }

  function createInvite(familyId) {
    return unwrap(client.rpc('create_parent_invite', { p_family_id: familyId }));
  }

  function acceptInvite(code) {
    return unwrap(client.rpc('accept_parent_invite', { p_code: code }));
  }

  function getChildProgress(childId) {
    return unwrap(
      client.from('progress')
        .select('week, word_en, correct, wrong, last_practiced')
        .eq('child_id', childId)
    );
  }

  return {
    listFamilies,
    listChildren,
    countParents,
    createFamily,
    addChild,
    removeChild,
    createInvite,
    acceptInvite,
    getChildProgress
  };
})();
