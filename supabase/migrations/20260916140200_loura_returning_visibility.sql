-- INSERT ... RETURNING evaluates the SELECT policy against the new row, but a
-- STABLE helper that re-queries the same table can't see that row yet. Check the
-- row's own ownership columns first, then fall back to the helper.

drop policy conversations_read on loura.conversations;
create policy conversations_read on loura.conversations for select to authenticated
  using (loura.is_system() or (org_id = loura.my_org() and owner_id = auth.uid()) or loura.can_see_conversation(id));

drop policy missions_read on loura.missions;
create policy missions_read on loura.missions for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (created_by = auth.uid() or responsible_id = auth.uid()))
         or loura.in_mission(id));

drop policy outputs_read on loura.outputs;
create policy outputs_read on loura.outputs for select to authenticated
  using (loura.is_system() or (org_id = loura.my_org() and owner_id = auth.uid()) or loura.can_see_output(id));

drop policy tasks_read on loura.tasks;
create policy tasks_read on loura.tasks for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (created_by = auth.uid() or performer_id = auth.uid() or responsible_id = auth.uid()))
         or loura.can_see_task(id));

drop policy assignments_read on loura.assignments;
create policy assignments_read on loura.assignments for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (created_by = auth.uid() or responsible_id = auth.uid()))
         or loura.can_see_assignment(id));

drop policy requests_read on loura.requests;
create policy requests_read on loura.requests for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (requester_id = auth.uid() or recipient_id = auth.uid()))
         or loura.can_see_request(id));

drop policy sources_read on loura.sources;
create policy sources_read on loura.sources for select to authenticated
  using (loura.is_system() or (org_id = loura.my_org() and owner_id = auth.uid()) or loura.can_see_source(id));

drop policy spaces_read on loura.spaces;
create policy spaces_read on loura.spaces for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (created_by = auth.uid() or loura.has_flag('admin')))
         or loura.in_space(id));
