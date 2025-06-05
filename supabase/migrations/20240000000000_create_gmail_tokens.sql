-- Create the gmail_tokens table
create table if not exists public.gmail_tokens (
    id uuid default gen_random_uuid() primary key,
    user_id uuid references auth.users(id) on delete cascade not null,
    access_token text not null,
    refresh_token text,
    created_at timestamp with time zone default timezone('utc'::text, now()) not null,
    updated_at timestamp with time zone default timezone('utc'::text, now()) not null,
    unique(user_id)
);

-- Enable RLS
alter table public.gmail_tokens enable row level security;

-- Create policies
create policy "Users can read their own tokens"
    on public.gmail_tokens for select
    using (auth.uid() = user_id);

create policy "Users can insert their own tokens"
    on public.gmail_tokens for insert
    with check (auth.uid() = user_id);

create policy "Users can update their own tokens"
    on public.gmail_tokens for update
    using (auth.uid() = user_id);

create policy "Users can delete their own tokens"
    on public.gmail_tokens for delete
    using (auth.uid() = user_id); 