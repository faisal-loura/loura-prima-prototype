-- Administrators (and the system identity, for demo scenarios and reset) can rename the organization.
create policy orgs_update on loura.orgs for update to authenticated
  using (id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()))
  with check (id = loura.my_org());
