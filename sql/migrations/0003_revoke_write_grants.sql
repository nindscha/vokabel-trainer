-- Schreibrechte für die Client-Rollen entziehen.
-- RLS schützt nicht vor TRUNCATE, und DELETE wäre ohne Policy zwar blockiert,
-- das Recht selbst sollte aber nicht bestehen. Die App braucht nur:
--   * words:    lesen
--   * progress: lesen, einfügen, aktualisieren (upsert durch Kinder)

revoke all on public.words from anon, authenticated;
grant select on public.words to anon, authenticated;

revoke all on public.progress from anon;
revoke delete, truncate, references, trigger on public.progress from authenticated;
