-- The demo account: one identity a presenter stays signed in as for a whole
-- walkthrough, instead of signing out and in as each person in the story.
--
-- It is a READ capability plus an explicit acting-for affordance in the
-- application layer. It never widens who may write directly: update and delete
-- policies are untouched, and every response it records still names the demo
-- account as the responder, not the person it stood in for.

alter table loura.members add column if not exists is_demo boolean not null default false;

comment on column loura.members.is_demo is
  'Prototype demo identity: reads every record in the organization so one account can present a whole walkthrough. Not a customer role.';

create or replace function loura.has_flag(flag text) returns boolean
language sql stable security definer set search_path = '' as $$
  select coalesce((
    select case flag
      when 'admin' then m.is_admin
      when 'creator' then m.is_creator
      when 'supervisor' then m.is_supervisor
      when 'system' then m.is_system
      when 'demo' then m.is_demo
    end
    from loura.members m where m.user_id = auth.uid() and m.status = 'active'
  ), false)
$$;

create or replace function loura.is_demo() returns boolean
language sql stable security definer set search_path = '' as $$ select loura.has_flag('demo') $$;

revoke all on function loura.is_demo() from public, anon, authenticated;
grant execute on function loura.is_demo() to authenticated;

-- Read policies: the demo account sees everything in its own organization. ----

drop policy tasks_read on loura.tasks;
create policy tasks_read on loura.tasks for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or created_by = auth.uid() or performer_id = auth.uid() or responsible_id = auth.uid()))
         or loura.can_see_task(id));

drop policy conversations_read on loura.conversations;
create policy conversations_read on loura.conversations for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or owner_id = auth.uid()))
         or loura.can_see_conversation(id));

drop policy outputs_read on loura.outputs;
create policy outputs_read on loura.outputs for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or owner_id = auth.uid()))
         or loura.can_see_output(id));

drop policy sources_read on loura.sources;
create policy sources_read on loura.sources for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or owner_id = auth.uid()))
         or loura.can_see_source(id));

drop policy requests_read on loura.requests;
create policy requests_read on loura.requests for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or requester_id = auth.uid() or recipient_id = auth.uid()))
         or loura.can_see_request(id));

drop policy assignments_read on loura.assignments;
create policy assignments_read on loura.assignments for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or created_by = auth.uid() or responsible_id = auth.uid()))
         or loura.can_see_assignment(id));

drop policy missions_read on loura.missions;
create policy missions_read on loura.missions for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or created_by = auth.uid() or responsible_id = auth.uid()))
         or loura.in_mission(id));

drop policy spaces_read on loura.spaces;
create policy spaces_read on loura.spaces for select to authenticated
  using (loura.is_system()
         or (org_id = loura.my_org() and (loura.is_demo() or created_by = auth.uid() or loura.has_flag('admin')))
         or loura.in_space(id));

-- Child records follow their parent through the can_see_* helpers, so they need
-- the demo clause only where the policy reads a parent the account may not own.

drop policy messages_read on loura.messages;
create policy messages_read on loura.messages for select to authenticated
  using (loura.is_demo() or loura.can_see_conversation(conversation_id));

drop policy output_versions_read on loura.output_versions;
create policy output_versions_read on loura.output_versions for select to authenticated
  using (loura.is_demo() or loura.can_see_output(output_id));

drop policy output_comments_read on loura.output_comments;
create policy output_comments_read on loura.output_comments for select to authenticated
  using (loura.is_demo() or loura.can_see_output(output_id));

drop policy output_grants_read on loura.output_grants;
create policy output_grants_read on loura.output_grants for select to authenticated
  using (loura.is_demo() or loura.can_see_output(output_id));

drop policy output_proposals_read on loura.output_proposals;
create policy output_proposals_read on loura.output_proposals for select to authenticated
  using (loura.is_demo() or loura.can_see_output(output_id));

drop policy review_submissions_read on loura.review_submissions;
create policy review_submissions_read on loura.review_submissions for select to authenticated
  using (loura.is_demo() or loura.can_see_output(output_id));

drop policy source_grants_read on loura.source_grants;
create policy source_grants_read on loura.source_grants for select to authenticated
  using (loura.is_demo() or loura.can_see_source(source_id));

drop policy runs_read on loura.runs;
create policy runs_read on loura.runs for select to authenticated
  using (loura.is_demo() or loura.can_see_assignment(assignment_id));

drop policy action_attempts_read on loura.action_attempts;
create policy action_attempts_read on loura.action_attempts for select to authenticated
  using (loura.is_demo() or loura.can_see_attempt(id));

drop policy action_evidence_read on loura.action_evidence;
create policy action_evidence_read on loura.action_evidence for select to authenticated
  using (loura.is_demo() or loura.can_see_attempt(attempt_id));

drop policy case_steps_read on loura.case_steps;
create policy case_steps_read on loura.case_steps for select to authenticated
  using (loura.is_demo() or loura.can_see_task(task_id));

drop policy space_members_read on loura.space_members;
create policy space_members_read on loura.space_members for select to authenticated
  using (loura.is_demo() or loura.in_space(space_id) or loura.has_flag('admin'));

drop policy activity_read on loura.activity;
create policy activity_read on loura.activity for select to authenticated
  using (org_id = loura.my_org() and (
    loura.is_system()
    or loura.is_demo()
    or actor_id = auth.uid()
    or (control and loura.has_flag('admin'))
    or (mission_id is not null and loura.in_mission(mission_id))
    or (assignment_id is not null and loura.can_see_assignment(assignment_id))
    or (subject_kind = 'output' and loura.can_see_output(subject_id))
    or (subject_kind = 'task' and loura.can_see_task(subject_id))
    or (subject_kind = 'request' and loura.can_see_request(subject_id))
    or (subject_kind = 'space' and loura.in_space(subject_id))
  ));

-- The prototype's presenting identity.
update loura.members set is_demo = true where email = 'faisal@loura.test';
