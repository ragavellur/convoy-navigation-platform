-- ============================================================
-- Realtime: mirror PB realtime API (positions, convoys, messages,
-- convoy_members + core lookups). WAL-level via supabase_realtime.
-- ============================================================

alter publication supabase_realtime add table public.convoys;
alter publication supabase_realtime add table public.convoy_members;
alter publication supabase_realtime add table public.positions;
alter publication supabase_realtime add table public.messages;
alter publication supabase_realtime add table public.vehicles;
alter publication supabase_realtime add table public.profiles;
