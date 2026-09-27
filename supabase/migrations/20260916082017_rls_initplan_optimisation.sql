-- Wrapping auth.uid() in a scalar subquery makes Postgres evaluate it once per
-- statement instead of once per row.
drop policy profiles_insert_self on public.profiles;
drop policy profiles_update_self on public.profiles;

create policy profiles_insert_self on public.profiles
  for insert to authenticated with check (id = (select auth.uid()));

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = (select auth.uid())) with check (id = (select auth.uid()));;
