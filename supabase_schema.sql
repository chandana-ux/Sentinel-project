-- Basic Supabase/Postgres schema suggestion for this project.

create table if not exists users (
  id uuid primary key default gen_random_uuid(),
  role text not null check (role in ('child', 'parent', 'other')),
  display_name text not null,
  created_at timestamptz not null default now()
);

create table if not exists messages (
  id bigserial primary key,
  sender_id uuid references users(id),
  receiver_id uuid references users(id),
  text text not null,
  risk text not null check (risk in ('SAFE', 'MEDIUM', 'HIGH')),
  reason text not null,
  created_at timestamptz not null default now()
);

create table if not exists alerts (
  id bigserial primary key,
  message_id bigint references messages(id) on delete cascade,
  risk text not null check (risk in ('MEDIUM', 'HIGH')),
  created_at timestamptz not null default now()
);

-- Helpful index for recent activity on parent dashboard
create index if not exists idx_alerts_created_at on alerts (created_at desc);

