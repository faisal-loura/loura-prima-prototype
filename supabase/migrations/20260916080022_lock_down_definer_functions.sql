-- Trigger functions are invoked by the trigger, never over PostgREST.
revoke all on function public.handle_new_user() from public, anon, authenticated;
revoke all on function public.guard_profile_role() from public, anon, authenticated;
revoke all on function public.guard_workspace_update() from public, anon, authenticated;

-- The two helpers are referenced from RLS policies, so signed-in users must be
-- able to evaluate them; signed-out users have no business calling them.
revoke all on function public.current_workspace_id() from public, anon;
revoke all on function public.current_app_role() from public, anon;
grant execute on function public.current_workspace_id() to authenticated;
grant execute on function public.current_app_role() to authenticated;;
