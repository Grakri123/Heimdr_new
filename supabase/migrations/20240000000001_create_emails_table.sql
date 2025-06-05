-- Create emails table
create table if not exists public.emails (
  id text primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  from_address text not null,
  subject text,
  date timestamp with time zone not null,
  body text,
  ai_risk_level text check (ai_risk_level in ('Lav', 'Medium', 'Høy')),
  ai_reason text,
  analyzed_at timestamp with time zone default timezone('utc'::text, now()),
  created_at timestamp with time zone default timezone('utc'::text, now()) not null
);

-- Enable RLS
alter table emails enable row level security;

-- Create policy for all operations
create policy "User can manage own emails"
  on emails for all
  to authenticated
  using (auth.uid() = user_id); 