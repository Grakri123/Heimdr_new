-- Create outlook_tokens table
create table if not exists public.outlook_tokens (
  user_id uuid references auth.users(id) on delete cascade not null primary key,
  access_token text not null,
  refresh_token text,
  expires_at timestamp with time zone,
  created_at timestamp with time zone default timezone('utc'::text, now()) not null,
  updated_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table outlook_tokens enable row level security;

-- Create policy for all operations
create policy "User can manage own outlook tokens"
  on outlook_tokens for all
  to authenticated
  using (auth.uid() = user_id); 