-- ============================================================
-- Storage buckets mirroring PB file fields (vehicles.image,
-- users.avatar). Public read mirrors PB "" listRule.
-- ============================================================

insert into storage.buckets (id, name, public)
values ('avatars', 'avatars', true)
on conflict (id) do nothing;

insert into storage.buckets (id, name, public)
values ('vehicles', 'vehicles', true)
on conflict (id) do nothing;

-- avatars: any authenticated user may upload/read; owner manages own folder
create policy avatars_read_all on storage.objects for select
  using (bucket_id = 'avatars');
create policy avatars_insert_authenticated on storage.objects for insert
  with check (bucket_id = 'avatars' and auth.role() = 'authenticated');
create policy avatars_update_owner on storage.objects for update
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);
create policy avatars_delete_owner on storage.objects for delete
  using (bucket_id = 'avatars' and auth.uid()::text = (storage.foldername(name))[1]);

-- vehicles: any authenticated user may upload/read; owner manages own folder
create policy vehicles_read_all on storage.objects for select
  using (bucket_id = 'vehicles');
create policy vehicles_insert_authenticated on storage.objects for insert
  with check (bucket_id = 'vehicles' and auth.role() = 'authenticated');
create policy vehicles_update_owner on storage.objects for update
  using (bucket_id = 'vehicles' and auth.uid()::text = (storage.foldername(name))[1]);
create policy vehicles_delete_owner on storage.objects for delete
  using (bucket_id = 'vehicles' and auth.uid()::text = (storage.foldername(name))[1]);
