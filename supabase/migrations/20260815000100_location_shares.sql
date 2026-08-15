-- ============================================================
-- Location Shares ("Share my location")
-- A revocable, unguessable link that resolves to a convoy's
-- live map for authenticated viewers. The token is the secret:
-- the shares list stays private to the owner (RLS) while any
-- signed-in viewer holding the token resolves it via RPC.
-- ============================================================

create table public.location_shares (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null default auth.uid() references auth.users (id) on delete cascade,
  convoy uuid not null references public.convoys (id) on delete cascade,
  token text not null unique check (char_length(token) >= 20),
  display_name text,
  status text not null default 'active' check (status in ('active', 'revoked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_location_shares_owner on public.location_shares (owner);
create index idx_location_shares_convoy on public.location_shares (convoy);

-- ------------------------------------------------------------------
-- RLS: owner-only management; viewers resolve via the RPC below.
-- ------------------------------------------------------------------
alter table public.location_shares enable row level security;

create policy location_shares_select_owner on public.location_shares for select
  using (auth.uid() = owner);

create policy location_shares_insert_owner on public.location_shares for insert
  with check (auth.uid() = owner);

create policy location_shares_update_owner on public.location_shares for update
  using (auth.uid() = owner) with check (auth.uid() = owner);

create policy location_shares_delete_owner on public.location_shares for delete
  using (auth.uid() = owner);

-- ------------------------------------------------------------------
-- updated_at auto-maintenance (same trigger fn as other tables)
-- ------------------------------------------------------------------
create trigger trg_location_shares_updated_at before update on public.location_shares
  for each row execute function public.set_updated_at();

-- ------------------------------------------------------------------
-- resolve_share_token(token): security definer lookup for viewers.
-- Returns the resolved convoy (plus display metadata) ONLY when the
-- token exists and the share is still active. Revoked or unknown
-- tokens return zero rows. Runs as definer so anon/authenticated
-- callers never read the shares table directly.
-- ------------------------------------------------------------------
create or replace function public.resolve_share_token(token text)
returns table (
  convoy uuid,
  convoy_name text,
  owner_name text,
  phase text,
  display_name text,
  status text
)
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  select
    c.id,
    c.name,
    p.name,
    c.phase,
    s.display_name,
    s.status
  from public.location_shares s
  join public.convoys c on c.id = s.convoy
  left join public.profiles p on p.id = s.owner
  where s.token = resolve_share_token.token
    and s.status = 'active';
end;
$$;

grant execute on function public.resolve_share_token(text) to authenticated;
