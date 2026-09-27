-- Access control for the Loura platform prototype.
--
-- "Location, access, participation, and authority are separate." These policies
-- enforce *who can read or write a record* at the database, so a hidden button is
-- never the only protection. Lifecycle and authority rules (who may approve,
-- pause, complete) are enforced by the server operations in src/server/.
--
-- Helper functions are SECURITY DEFINER so policies can consult other tables
-- without recursing through their own RLS.

create or replace function loura.my_org() returns uuid
language sql stable security definer set search_path = '' as $$
  select org_id from loura.members where user_id = auth.uid() and status = 'active'
$$;

create or replace function loura.has_flag(flag text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case flag
      when 'admin' then m.is_admin
      when 'creator' then m.is_creator
      when 'supervisor' then m.is_supervisor
      when 'system' then m.is_system
    end
    from loura.members m where m.user_id = auth.uid() and m.status = 'active'
  ), false)
$$;

create or replace function loura.is_system() returns boolean
language sql stable security definer set search_path = '' as $$ select loura.has_flag('system') $$;

create or replace function loura.in_space(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.space_members sm
    join loura.spaces s on s.id = sm.space_id
    where sm.space_id = sid and sm.user_id = auth.uid() and s.org_id = loura.my_org()
  )
$$;

create or replace function loura.in_mission(mid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.missions m
    where m.id = mid and m.org_id = loura.my_org()
      and (m.created_by = auth.uid() or m.responsible_id = auth.uid()
           or exists (select 1 from loura.mission_participants p where p.mission_id = m.id and p.user_id = auth.uid()))
  )
$$;

create or replace function loura.can_see_output(oid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.outputs o
    where o.id = oid and o.org_id = loura.my_org()
      and (o.owner_id = auth.uid()
           or exists (select 1 from loura.output_grants g where g.output_id = o.id and g.user_id = auth.uid())
           or (o.mission_id is not null and not o.private and loura.in_mission(o.mission_id)))
  )
$$;

create or replace function loura.can_edit_output(oid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.outputs o
    where o.id = oid and o.org_id = loura.my_org()
      and (o.owner_id = auth.uid()
           or exists (select 1 from loura.output_grants g
                      where g.output_id = o.id and g.user_id = auth.uid() and g.access = 'edit')
           or (o.mission_id is not null and not o.private and loura.in_mission(o.mission_id)))
  )
$$;

create or replace function loura.can_see_source(sid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.sources s
    where s.id = sid and s.org_id = loura.my_org()
      and (not s.restricted or s.owner_id = auth.uid()
           or exists (select 1 from loura.source_grants g where g.source_id = s.id and g.user_id = auth.uid()))
  )
$$;

create or replace function loura.can_see_conversation(cid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.conversations c
    where c.id = cid and c.org_id = loura.my_org()
      and (c.owner_id = auth.uid() or (c.mission_id is not null and loura.in_mission(c.mission_id)))
  )
$$;

create or replace function loura.can_see_task(tid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.tasks t
    where t.id = tid and t.org_id = loura.my_org()
      and (t.created_by = auth.uid() or t.performer_id = auth.uid() or t.responsible_id = auth.uid()
           or (t.mission_id is not null and loura.in_mission(t.mission_id))
           or (t.mission_id is null and t.space_id is not null and loura.in_space(t.space_id)))
  )
$$;

create or replace function loura.can_see_assignment(aid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.assignments a
    where a.id = aid and a.org_id = loura.my_org()
      and (a.responsible_id = auth.uid() or a.created_by = auth.uid()
           or loura.has_flag('supervisor')
           or (a.mission_id is not null and loura.in_mission(a.mission_id))
           or (a.space_id is not null and loura.in_space(a.space_id))
           or (a.conversation_id is not null and loura.can_see_conversation(a.conversation_id)))
  )
$$;

create or replace function loura.can_see_request(rid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.requests r
    where r.id = rid and r.org_id = loura.my_org()
      and (r.recipient_id = auth.uid() or r.requester_id = auth.uid()
           or (r.mission_id is not null and loura.in_mission(r.mission_id))
           or (r.assignment_id is not null and exists (
                 select 1 from loura.assignments a where a.id = r.assignment_id and a.responsible_id = auth.uid())))
  )
$$;

create or replace function loura.can_see_attempt(atid uuid) returns boolean
language sql stable security definer set search_path = '' as $$
  select loura.is_system() or exists (
    select 1 from loura.action_attempts x
    where x.id = atid and x.org_id = loura.my_org()
      and ((x.assignment_id is not null and loura.can_see_assignment(x.assignment_id))
           or (x.request_id is not null and loura.can_see_request(x.request_id)))
  )
$$;

revoke all on all functions in schema loura from public, anon;
grant execute on all functions in schema loura to authenticated;

grant select, insert, update, delete on all tables in schema loura to authenticated;

-- ---------------------------------------------------------------------------
-- Enable RLS everywhere
-- ---------------------------------------------------------------------------
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'loura' loop
    execute format('alter table loura.%I enable row level security', t.tablename);
  end loop;
end $$;

-- Organization and people ----------------------------------------------------
create policy orgs_read on loura.orgs for select to authenticated using (id = loura.my_org());

create policy members_read on loura.members for select to authenticated using (org_id = loura.my_org());
create policy members_admin_write on loura.members for update to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()))
  with check (org_id = loura.my_org());

-- Spaces ----------------------------------------------------------------------
create policy spaces_read on loura.spaces for select to authenticated
  using (org_id = loura.my_org() and (loura.in_space(id) or created_by = auth.uid() or loura.has_flag('admin')));
create policy spaces_insert on loura.spaces for insert to authenticated
  with check (org_id = loura.my_org() and (created_by = auth.uid() or loura.is_system()));
create policy spaces_update on loura.spaces for update to authenticated
  using (loura.in_space(id)) with check (org_id = loura.my_org());

create policy space_members_read on loura.space_members for select to authenticated
  using (loura.in_space(space_id) or loura.has_flag('admin'));
create policy space_members_write on loura.space_members for insert to authenticated
  with check (loura.in_space(space_id) or exists (
    select 1 from loura.spaces s where s.id = space_id and s.created_by = auth.uid()));
create policy space_members_delete on loura.space_members for delete to authenticated
  using (loura.in_space(space_id));

-- Missions --------------------------------------------------------------------
create policy missions_read on loura.missions for select to authenticated using (loura.in_mission(id));
create policy missions_insert on loura.missions for insert to authenticated
  with check (org_id = loura.my_org() and (created_by = auth.uid() or loura.is_system())
              and (space_id is null or loura.in_space(space_id)));
create policy missions_update on loura.missions for update to authenticated
  using (loura.in_mission(id)) with check (org_id = loura.my_org());

do $$
declare t text;
begin
  foreach t in array array['mission_participants', 'mission_agents', 'mission_sources', 'mission_conditions'] loop
    execute format($f$
      create policy %1$s_rw on loura.%1$I for all to authenticated
        using (loura.in_mission(mission_id)) with check (loura.in_mission(mission_id));
    $f$, t);
  end loop;
end $$;

-- Tasks -----------------------------------------------------------------------
create policy tasks_read on loura.tasks for select to authenticated using (loura.can_see_task(id));
create policy tasks_insert on loura.tasks for insert to authenticated
  with check (org_id = loura.my_org() and (mission_id is null or loura.in_mission(mission_id)));
create policy tasks_update on loura.tasks for update to authenticated
  using (loura.can_see_task(id)) with check (org_id = loura.my_org());

create policy task_dependencies_rw on loura.task_dependencies for all to authenticated
  using (loura.can_see_task(task_id) and loura.can_see_task(depends_on_id))
  with check (loura.can_see_task(task_id) and loura.can_see_task(depends_on_id));

-- Outputs ---------------------------------------------------------------------
create policy outputs_read on loura.outputs for select to authenticated using (loura.can_see_output(id));
create policy outputs_insert on loura.outputs for insert to authenticated
  with check (org_id = loura.my_org() and (owner_id = auth.uid() or loura.is_system())
              and (mission_id is null or loura.in_mission(mission_id)));
create policy outputs_update on loura.outputs for update to authenticated
  using (loura.can_edit_output(id)) with check (org_id = loura.my_org());

create policy output_versions_read on loura.output_versions for select to authenticated
  using (loura.can_see_output(output_id));
create policy output_versions_insert on loura.output_versions for insert to authenticated
  with check (loura.can_edit_output(output_id));
create policy output_versions_update on loura.output_versions for update to authenticated
  using (loura.can_edit_output(output_id)) with check (loura.can_edit_output(output_id));

create policy output_proposals_read on loura.output_proposals for select to authenticated
  using (loura.can_see_output(output_id));
create policy output_proposals_write on loura.output_proposals for insert to authenticated
  with check (loura.can_edit_output(output_id));
create policy output_proposals_update on loura.output_proposals for update to authenticated
  using (loura.can_edit_output(output_id)) with check (loura.can_edit_output(output_id));

create policy output_grants_read on loura.output_grants for select to authenticated
  using (loura.can_see_output(output_id));
create policy output_grants_insert on loura.output_grants for insert to authenticated
  with check (loura.can_edit_output(output_id)
              and exists (select 1 from loura.members m
                          where m.user_id = output_grants.user_id and m.org_id = loura.my_org() and m.status = 'active'));
create policy output_grants_update on loura.output_grants for update to authenticated
  using (loura.can_edit_output(output_id)) with check (loura.can_edit_output(output_id));
create policy output_grants_delete on loura.output_grants for delete to authenticated
  using (loura.can_edit_output(output_id));

create policy output_comments_read on loura.output_comments for select to authenticated
  using (loura.can_see_output(output_id));
create policy output_comments_insert on loura.output_comments for insert to authenticated
  with check (loura.can_see_output(output_id) and author_id = auth.uid());

create policy review_submissions_read on loura.review_submissions for select to authenticated
  using (loura.can_see_output(output_id));
create policy review_submissions_insert on loura.review_submissions for insert to authenticated
  with check (loura.can_edit_output(output_id));
create policy review_submissions_update on loura.review_submissions for update to authenticated
  using (loura.can_see_output(output_id)) with check (loura.can_see_output(output_id));

-- Conversations ---------------------------------------------------------------
create policy conversations_read on loura.conversations for select to authenticated
  using (loura.can_see_conversation(id));
create policy conversations_insert on loura.conversations for insert to authenticated
  with check (org_id = loura.my_org() and (owner_id = auth.uid() or loura.is_system())
              and (mission_id is null or loura.in_mission(mission_id)));
create policy conversations_update on loura.conversations for update to authenticated
  using (loura.can_see_conversation(id)) with check (org_id = loura.my_org());

create policy conversation_sources_rw on loura.conversation_sources for all to authenticated
  using (loura.can_see_conversation(conversation_id))
  with check (loura.can_see_conversation(conversation_id) and loura.can_see_source(source_id));

create policy messages_read on loura.messages for select to authenticated
  using (loura.can_see_conversation(conversation_id));
create policy messages_insert on loura.messages for insert to authenticated
  with check (loura.can_see_conversation(conversation_id)
              and ((author_kind = 'person' and author_id = auth.uid()) or loura.is_system()));

-- Sources ---------------------------------------------------------------------
create policy sources_read on loura.sources for select to authenticated using (loura.can_see_source(id));
create policy sources_insert on loura.sources for insert to authenticated
  with check (org_id = loura.my_org() and (owner_id = auth.uid() or loura.is_system()));
create policy sources_update on loura.sources for update to authenticated
  using (loura.is_system() or (org_id = loura.my_org() and (owner_id = auth.uid() or loura.has_flag('admin'))))
  with check (org_id = loura.my_org());

create policy source_grants_read on loura.source_grants for select to authenticated
  using (loura.can_see_source(source_id));
create policy source_grants_write on loura.source_grants for insert to authenticated
  with check (loura.is_system() or exists (
    select 1 from loura.sources s where s.id = source_id and (s.owner_id = auth.uid() or loura.has_flag('admin'))));
create policy source_grants_delete on loura.source_grants for delete to authenticated
  using (loura.is_system() or exists (
    select 1 from loura.sources s where s.id = source_id and (s.owner_id = auth.uid() or loura.has_flag('admin'))));

-- Studio ----------------------------------------------------------------------
create policy agents_read on loura.agents for select to authenticated using (org_id = loura.my_org());
create policy agents_write on loura.agents for insert to authenticated
  with check (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()));
create policy agents_update on loura.agents for update to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()))
  with check (org_id = loura.my_org());

create policy agent_revisions_read on loura.agent_revisions for select to authenticated
  using (exists (select 1 from loura.agents a where a.id = agent_id and a.org_id = loura.my_org()));
create policy agent_revisions_insert on loura.agent_revisions for insert to authenticated
  with check (loura.has_flag('creator') or loura.is_system());

create policy procedures_read on loura.procedures for select to authenticated using (org_id = loura.my_org());
create policy procedures_write on loura.procedures for insert to authenticated
  with check (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()));
create policy procedures_update on loura.procedures for update to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()))
  with check (org_id = loura.my_org());

create policy procedure_revisions_read on loura.procedure_revisions for select to authenticated
  using (exists (select 1 from loura.procedures p where p.id = procedure_id and p.org_id = loura.my_org()));
create policy procedure_revisions_insert on loura.procedure_revisions for insert to authenticated
  with check (loura.has_flag('creator') or loura.is_system());

create policy definition_tests_read on loura.definition_tests for select to authenticated
  using (org_id = loura.my_org());
create policy definition_tests_insert on loura.definition_tests for insert to authenticated
  with check (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()));
create policy definition_tests_update on loura.definition_tests for update to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('creator') or loura.is_system()))
  with check (org_id = loura.my_org());

-- Connections and the sandbox --------------------------------------------------
create policy connections_read on loura.connections for select to authenticated using (org_id = loura.my_org());
create policy connections_update on loura.connections for update to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()))
  with check (org_id = loura.my_org());

create policy connections_insert on loura.connections for insert to authenticated
  with check (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()));

create policy sandbox_records_insert on loura.sandbox_records for insert to authenticated
  with check (loura.has_flag('admin') or loura.is_system());

create policy sandbox_records_read on loura.sandbox_records for select to authenticated
  using (exists (select 1 from loura.connections c where c.id = connection_id and c.org_id = loura.my_org()));
create policy sandbox_records_update on loura.sandbox_records for update to authenticated
  using (loura.has_flag('admin') or loura.is_system())
  with check (loura.has_flag('admin') or loura.is_system());

create policy source_events_read on loura.source_events for select to authenticated using (org_id = loura.my_org());
create policy source_events_insert on loura.source_events for insert to authenticated
  with check (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()));
create policy source_events_update on loura.source_events for update to authenticated
  using (loura.is_system()) with check (loura.is_system());

create policy action_rules_read on loura.action_rules for select to authenticated using (org_id = loura.my_org());
create policy action_rules_write on loura.action_rules for all to authenticated
  using (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()))
  with check (org_id = loura.my_org() and (loura.has_flag('admin') or loura.is_system()));

-- Assignments, runs, actions ----------------------------------------------------
create policy assignments_read on loura.assignments for select to authenticated
  using (loura.can_see_assignment(id));
create policy assignments_insert on loura.assignments for insert to authenticated
  with check (org_id = loura.my_org() and (created_by = auth.uid() or loura.is_system()));
create policy assignments_update on loura.assignments for update to authenticated
  using (loura.can_see_assignment(id)) with check (org_id = loura.my_org());

create policy assignment_sources_rw on loura.assignment_sources for all to authenticated
  using (loura.can_see_assignment(assignment_id))
  with check (loura.can_see_assignment(assignment_id) and loura.can_see_source(source_id));

create policy runs_read on loura.runs for select to authenticated using (loura.can_see_assignment(assignment_id));
create policy runs_insert on loura.runs for insert to authenticated
  with check (org_id = loura.my_org() and loura.can_see_assignment(assignment_id));
create policy runs_update on loura.runs for update to authenticated
  using (loura.can_see_assignment(assignment_id)) with check (org_id = loura.my_org());

create policy action_attempts_read on loura.action_attempts for select to authenticated
  using (loura.can_see_attempt(id));
create policy action_attempts_insert on loura.action_attempts for insert to authenticated
  with check (loura.is_system());
create policy action_attempts_update on loura.action_attempts for update to authenticated
  using (loura.can_see_attempt(id)) with check (org_id = loura.my_org());

create policy action_evidence_read on loura.action_evidence for select to authenticated
  using (loura.can_see_attempt(attempt_id));
create policy action_evidence_insert on loura.action_evidence for insert to authenticated
  with check (loura.can_see_attempt(attempt_id));

-- Requests and updates -----------------------------------------------------------
create policy requests_read on loura.requests for select to authenticated using (loura.can_see_request(id));
create policy requests_insert on loura.requests for insert to authenticated
  with check (org_id = loura.my_org() and (requester_id = auth.uid() or loura.is_system()));
create policy requests_update on loura.requests for update to authenticated
  using (loura.can_see_request(id)) with check (org_id = loura.my_org());

create policy updates_read on loura.updates for select to authenticated
  using (user_id = auth.uid() and org_id = loura.my_org());
create policy updates_insert on loura.updates for insert to authenticated
  with check (org_id = loura.my_org());
create policy updates_update on loura.updates for update to authenticated
  using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Activity: readable only where its subject is. Control changes go to admins.
create policy activity_read on loura.activity for select to authenticated
  using (org_id = loura.my_org() and (
    loura.is_system()
    or actor_id = auth.uid()
    or (control and loura.has_flag('admin'))
    or (mission_id is not null and loura.in_mission(mission_id))
    or (assignment_id is not null and loura.can_see_assignment(assignment_id))
    or (subject_kind = 'output' and loura.can_see_output(subject_id))
    or (subject_kind = 'task' and loura.can_see_task(subject_id))
    or (subject_kind = 'request' and loura.can_see_request(subject_id))
    or (subject_kind = 'space' and loura.in_space(subject_id))
  ));
create policy activity_insert on loura.activity for insert to authenticated
  with check (org_id = loura.my_org());

-- Removed identities: the reset helper below is the only way to wipe fixtures.
-- It runs as definer but refuses unless the caller is an admin or the system.
create or replace function loura.wipe_fixture_data() returns void
language plpgsql security definer set search_path = '' as $$
begin
  if not (loura.has_flag('admin') or loura.has_flag('system')) then
    raise exception 'only an administrator can reset the prototype fixtures';
  end if;
  delete from loura.activity where true;
  delete from loura.updates where true;
  delete from loura.action_evidence where true;
  update loura.requests set action_attempt_id = null, superseded_by = null where true;
  delete from loura.action_attempts where true;
  delete from loura.requests where true;
  delete from loura.source_events where true;
  delete from loura.runs where true;
  update loura.tasks set assignment_id = null, review_submission_id = null, output_id = null where true;
  delete from loura.assignment_sources where true;
  delete from loura.assignments where true;
  delete from loura.messages where true;
  delete from loura.conversation_sources where true;
  delete from loura.conversations where true;
  delete from loura.mission_conditions where true;
  delete from loura.task_dependencies where true;
  delete from loura.tasks where true;
  delete from loura.review_submissions where true;
  delete from loura.output_comments where true;
  delete from loura.output_grants where true;
  delete from loura.output_proposals where true;
  delete from loura.output_versions where true;
  delete from loura.outputs where true;
  delete from loura.mission_sources where true;
  delete from loura.mission_agents where true;
  delete from loura.mission_participants where true;
  delete from loura.missions where true;
  delete from loura.source_grants where true;
  delete from loura.sources where true;
  delete from loura.sandbox_records where true;
  delete from loura.connections where true;
  delete from loura.action_rules where true;
  delete from loura.definition_tests where true;
  update loura.agents set published_revision_id = null where true;
  update loura.procedures set published_revision_id = null where true;
  delete from loura.agent_revisions where true;
  delete from loura.procedure_revisions where true;
  delete from loura.agents where true;
  delete from loura.procedures where true;
  delete from loura.space_members where true;
  delete from loura.spaces where true;
  update loura.members set status = 'active' where not is_system;
end;
$$;

revoke all on function loura.wipe_fixture_data() from public, anon;
grant execute on function loura.wipe_fixture_data() to authenticated;

-- Expose the schema through the Data API alongside the existing ones.
alter role authenticator set pgrst.db_schemas = 'public, graphql_public, loura';
notify pgrst, 'reload config';
