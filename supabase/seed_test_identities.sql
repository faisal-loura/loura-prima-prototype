-- Test identities for the Loura platform prototype (prototype brief §3, fixture F-F).
--
-- Four participants, a demo account holding every role, an account deliberately
-- outside the shared audience, and the
-- Loura system identity the server-side worker uses to carry assignments forward
-- while no browser is open. Safe to re-run.
--
-- The system identity's password is not in this file: set it with
--   select set_config('loura.system_password', '<LOURA_SYSTEM_PASSWORD from .env>', false);
-- in the same session before running.

do $$
declare
  spec record;
  uid uuid;
  org uuid;
  pw text;
begin
  select id into org from loura.orgs where name = 'Loura prototype organization';
  if org is null then
    insert into loura.orgs (name) values ('Loura prototype organization') returning id into org;
  end if;

  for spec in
    select * from (values
      ('sam@loura.test',    'Sam Haddad',      'Operations lead',        false, false, false, false),
      ('noura@loura.test',  'Noura Saleh',     'Service coordinator',    false, false, false, false),
      ('lina@loura.test',   'Lina Farouk',     'Finance reviewer',       false, false, false, false),
      ('maya@loura.test',   'Maya Idris',      'Platform administrator', true,  true,  true,  false),
      ('omar@loura.test',   'Omar Nasser',     'Procurement analyst',    false, false, false, false),
      -- Demo account: every role at once, so one person can show a whole case
      -- without signing in and out. Every case gate is addressed to him.
      ('faisal@loura.test', 'Faisal Almalki',  'All roles (demo)',       true,  true,  true,  false),
      ('system@loura.test', 'Loura system',    'Worker identity',        false, false, false, true)
    ) as t(email, full_name, title, is_admin, is_creator, is_supervisor, is_system)
  loop
    select id into uid from auth.users where email = spec.email;

    if uid is null then
      pw := case when spec.is_system then current_setting('loura.system_password') else 'loura-prototype-2026' end;
      uid := gen_random_uuid();
      insert into auth.users (
        instance_id, id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at,
        confirmation_token, recovery_token, email_change_token_new,
        email_change_token_current, email_change, phone_change,
        phone_change_token, reauthentication_token
      ) values (
        '00000000-0000-0000-0000-000000000000', uid, 'authenticated', 'authenticated',
        spec.email, extensions.crypt(pw, extensions.gen_salt('bf')), now(),
        jsonb_build_object('provider', 'email', 'providers', jsonb_build_array('email')),
        -- Keeps the earlier prototype's public.handle_new_user trigger quiet.
        jsonb_build_object('full_name', spec.full_name),
        now(), now(), '', '', '', '', '', '', '', ''
      );
      insert into auth.identities (id, provider_id, user_id, identity_data, provider, last_sign_in_at, created_at, updated_at)
      values (gen_random_uuid(), uid::text, uid,
        jsonb_build_object('sub', uid::text, 'email', spec.email, 'email_verified', true, 'phone_verified', false),
        'email', now(), now(), now());
    end if;

    insert into loura.members (user_id, org_id, full_name, email, title, is_admin, is_creator, is_supervisor, is_system)
    values (uid, org, spec.full_name, spec.email, spec.title, spec.is_admin, spec.is_creator, spec.is_supervisor, spec.is_system)
    on conflict (user_id) do update set
      full_name = excluded.full_name, title = excluded.title, is_admin = excluded.is_admin,
      is_creator = excluded.is_creator, is_supervisor = excluded.is_supervisor, is_system = excluded.is_system,
      status = 'active';
  end loop;
end $$;
