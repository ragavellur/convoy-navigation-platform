-- ============================================================
-- Convoy lifecycle: 'not_started' initial state + position gating
-- Sprint 15 TASK-215/216: the owner starts a convoy explicitly and
-- positions are only written while the convoy is active. The
-- simulation service (service role) bypasses RLS, so a future
-- simulation rewrite is unaffected.
-- ============================================================

alter table public.convoys drop constraint convoys_status_check;
alter table public.convoys alter column status set default 'not_started';
alter table public.convoys add constraint convoys_status_check
  check (status in ('not_started', 'active', 'paused', 'ended'));

drop policy positions_insert_all on public.positions;
drop policy positions_update_all on public.positions;

create policy positions_insert_active_convoy on public.positions for insert
  with check (
    exists (
      select 1 from public.convoys c
      where c.id = convoy and c.status = 'active'
    )
  );

create policy positions_update_active_convoy on public.positions for update
  using (
    exists (
      select 1 from public.convoys c
      where c.id = convoy and c.status = 'active'
    )
  )
  with check (
    exists (
      select 1 from public.convoys c
      where c.id = convoy and c.status = 'active'
    )
  );
