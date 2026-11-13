-- CargoClear KZ — Phase 4, migration 3/3: private storage bucket for shipment documents.
-- Object path convention: "<auth.uid()>/<document_id>/<file name>". The first folder must equal the caller's user id.

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'documents', 'documents', false, 3145728,
  array[
    'application/pdf', 'image/png', 'image/jpeg',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/plain'
  ]
)
on conflict (id) do update
  set public = false,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;

drop policy if exists "documents_objects_select_own" on storage.objects;
drop policy if exists "documents_objects_insert_own" on storage.objects;
drop policy if exists "documents_objects_update_own" on storage.objects;
drop policy if exists "documents_objects_delete_own" on storage.objects;

create policy "documents_objects_select_own" on storage.objects for select to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_insert_own" on storage.objects for insert to authenticated
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_update_own" on storage.objects for update to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text)
  with check (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);
create policy "documents_objects_delete_own" on storage.objects for delete to authenticated
  using (bucket_id = 'documents' and (storage.foldername(name))[1] = (select auth.uid())::text);

insert into public.app_migrations (version, name) values ('20261113000003', 'storage') on conflict do nothing;
