-- CargoClear KZ — Phase 4, migration 2/3: Row Level Security.
-- Rule: a signed-in user sees and changes only rows whose user_id = auth.uid().
-- The anonymous role gets no access to any table. (select auth.uid()) is used so Postgres evaluates it once per query.

revoke all on all tables in schema public from anon;
revoke all on all tables in schema public from authenticated;

do $$
declare t text;
begin
  foreach t in array array['shipments', 'carriers', 'comparisons', 'offers', 'documents', 'events'] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('grant select, insert, update, delete on public.%I to authenticated', t);
    execute format('drop policy if exists "%1$s_select_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_insert_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_update_own" on public.%1$I', t);
    execute format('drop policy if exists "%1$s_delete_own" on public.%1$I', t);
    execute format('create policy "%1$s_select_own" on public.%1$I for select to authenticated using (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_insert_own" on public.%1$I for insert to authenticated with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_update_own" on public.%1$I for update to authenticated using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()))', t);
    execute format('create policy "%1$s_delete_own" on public.%1$I for delete to authenticated using (user_id = (select auth.uid()))', t);
  end loop;
end $$;

-- profiles: own row only; the row is created by the handle_new_user() trigger and removed with the auth user.
alter table public.profiles enable row level security;
grant select, insert, update on public.profiles to authenticated;
drop policy if exists "profiles_select_own" on public.profiles;
drop policy if exists "profiles_insert_own" on public.profiles;
drop policy if exists "profiles_update_own" on public.profiles;
create policy "profiles_select_own" on public.profiles for select to authenticated using (id = (select auth.uid()));
create policy "profiles_insert_own" on public.profiles for insert to authenticated with check (id = (select auth.uid()));
create policy "profiles_update_own" on public.profiles for update to authenticated using (id = (select auth.uid())) with check (id = (select auth.uid()));

-- app_migrations is informational and not exposed through the API.
alter table public.app_migrations enable row level security;

insert into public.app_migrations (version, name) values ('20261113000002', 'rls') on conflict do nothing;
