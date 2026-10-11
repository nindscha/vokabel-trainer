// supabaseClient.js – gemeinsamer Supabase-Client

const Backend = (() => {
  const SUPABASE_URL = 'https://fhkojiwbcdhkgpozltqp.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_FiZZwcCmXDF5Vl7sPP_VYA_1HF86lVc';

  const client =
    typeof window !== 'undefined' &&
    window.supabase &&
    typeof window.supabase.createClient === 'function'
      ? window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY)
      : null;

  return { client };
})();
