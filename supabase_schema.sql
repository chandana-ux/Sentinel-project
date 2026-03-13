create table if not exists messages (
  id bigserial primary key,
  sender_id text not null,
  receiver_id text not null,
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

create index if not exists idx_alerts_created_at on alerts (created_at desc);
