-- Drop existing policy if it exists
drop policy if exists "Service role can manage emails" on emails;

-- Create policy for service role
create policy "Service role can manage emails"
  on emails for all
  using (true)
  with check (true); 