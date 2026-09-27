-- An approved action is claimed atomically before its checks and dispatch, so two
-- worker passes (or two server processes) can never dispatch or judge it twice.
alter table loura.action_attempts add column claimed_at timestamptz;
