-- Diagnostic only: restrict the unique disposable prefix supplied by the probe.
-- This is NOT a Storage maintenance gate: signed/service-role uploads bypass RLS.
-- Existing policies, SELECT access, and all other object paths remain unchanged.
begin;
set local lock_timeout = '10s';
create policy PROBE_POLICY_insert on storage.objects as restrictive
  for insert to authenticated
  with check (not (bucket_id = 'question-assets' and starts_with(name, 'PROBE_PREFIX')));
create policy PROBE_POLICY_update on storage.objects as restrictive
  for update to authenticated
  using (not (bucket_id = 'question-assets' and starts_with(name, 'PROBE_PREFIX')))
  with check (not (bucket_id = 'question-assets' and starts_with(name, 'PROBE_PREFIX')));
create policy PROBE_POLICY_delete on storage.objects as restrictive
  for delete to authenticated
  using (not (bucket_id = 'question-assets' and starts_with(name, 'PROBE_PREFIX')));
commit;
