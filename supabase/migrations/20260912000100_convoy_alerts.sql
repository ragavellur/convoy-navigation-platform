-- ============================================================
-- convoy_alerts: in-convoy incident alerts (e.g. panic button).
-- Inserted server-side by the push-notifications edge function.
-- Realtime streamed to all convoy members for in-app alerts.
-- ============================================================

create table if not exists public.convoy_alerts (
  id uuid primary key default gen_random_uuid(),
  convoy uuid not null references public.convoys (id) on delete cascade,
  "user" uuid not null references auth.users (id) on delete cascade,
  type text not null default 'panic' check (type in ('panic')),
  message text not null,
  read boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_convoy_alerts_convoy on public.convoy_alerts (convoy);
create index if not exists idx_convoy_alerts_created on public.convoy_alerts (created_at desc);

alter table public.convoy_alerts enable row level security;

-- RLS: any authenticated user can read alerts; inserts are performed
-- server-side by the edge function (service role), mirror convoy_members reads.
create policy convoy_alerts_read_all on public.convoy_alerts for select
  using (true);
create policy convoy_alerts_insert_authenticated on public.convoy_alerts for insert
  with check (auth.uid() is not null);

alter publication supabase_realtime add table public.convoy_alerts;