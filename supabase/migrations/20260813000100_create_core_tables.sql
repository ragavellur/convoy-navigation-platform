-- ============================================================
-- Convoy Navigation Platform - Core Tables
-- Sprint 13 TASK-184/185: Mirror PocketBase collections
-- ============================================================

-- ------------------------------------------------------------------
-- profiles: mirrors _pb_users_auth_ custom fields (name, phone, role)
-- linked 1:1 to auth.users via auth trigger (see auth_triggers.sql)
-- ------------------------------------------------------------------
create table public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  name text,
  phone text,
  role text not null default 'member' check (role in ('admin', 'member')),
  status text not null default 'active' check (status in ('active', 'inactive', 'banned')),
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.profiles is 'User profile mirroring PocketBase _pb_users_auth_ custom fields';

-- ------------------------------------------------------------------
-- vehicles: owner-owned vehicles
-- ------------------------------------------------------------------
create table public.vehicles (
  id uuid primary key default gen_random_uuid(),
  owner uuid not null references auth.users (id) on delete cascade,
  name text not null check (char_length(name) between 1 and 50),
  type text not null check (type in ('car', 'truck', 'motorcycle', 'other', 'trekker')),
  color text,
  license_plate text,
  image_url text,
  telemetry_config jsonb,
  status text not null default 'active' check (status in ('active', 'inactive', 'maintenance', 'retired')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_vehicles_owner on public.vehicles (owner);

-- ------------------------------------------------------------------
-- convoys: convoy sessions with source/destination + phase tracking
-- ------------------------------------------------------------------
create table public.convoys (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 100),
  code text not null unique check (char_length(code) = 6),
  description text,
  owner uuid not null references auth.users (id) on delete cascade,
  status text not null default 'active' check (status in ('active', 'paused', 'ended')),
  convoy_type text not null default 'vehicle' check (convoy_type in ('vehicle', 'trekker')),
  max_members integer,
  settings jsonb,
  trip_id text,
  security_token text,
  source_lat double precision,
  source_lng double precision,
  source_name text,
  dest_lat double precision,
  dest_lng double precision,
  dest_name text,
  phase text not null default 'forming' check (phase in ('forming', 'assembling', 'in_transit', 'completed')),
  assembled_members jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_convoys_owner on public.convoys (owner);
create index idx_convoys_status on public.convoys (status);

-- ------------------------------------------------------------------
-- convoy_members: membership of users in convoys
-- ------------------------------------------------------------------
create table public.convoy_members (
  id uuid primary key default gen_random_uuid(),
  convoy uuid not null references public.convoys (id) on delete cascade,
  "user" uuid not null references auth.users (id) on delete cascade,
  role text not null default 'member' check (role in ('owner', 'admin', 'member')),
  vehicle uuid references public.vehicles (id) on delete set null,
  status text not null default 'active' check (status in ('active', 'inactive', 'kicked', 'left', 'removed')),
  joined_at timestamptz default now(),
  join_lat double precision,
  join_lng double precision,
  join_name text,
  route_geometry jsonb,
  assembly_route_geometry jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (convoy, "user")
);

create index idx_convoy_members_convoy on public.convoy_members (convoy);
create index idx_convoy_members_user on public.convoy_members ("user");

-- ------------------------------------------------------------------
-- positions: one current position per (vehicle, convoy)
-- ------------------------------------------------------------------
create table public.positions (
  id uuid primary key default gen_random_uuid(),
  vehicle uuid not null references public.vehicles (id) on delete cascade,
  convoy uuid not null references public.convoys (id) on delete cascade,
  lat double precision not null,
  lng double precision not null,
  speed double precision,
  heading double precision,
  accuracy double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle, convoy)
);

create index idx_positions_convoy on public.positions (convoy);
create index idx_positions_vehicle on public.positions (vehicle);

-- ------------------------------------------------------------------
-- messages: convoy chat (text + system types; voice removed in V2)
-- ------------------------------------------------------------------
create table public.messages (
  id uuid primary key default gen_random_uuid(),
  convoy uuid not null references public.convoys (id) on delete cascade,
  sender uuid not null references auth.users (id) on delete cascade,
  type text not null default 'text' check (type in ('text', 'system')),
  content text not null,
  duration double precision,
  location_lat double precision,
  location_lng double precision,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index idx_messages_convoy on public.messages (convoy);
create index idx_messages_sender on public.messages (sender);

-- ------------------------------------------------------------------
-- cached_routes: OSRM route cache keyed by origin/dest coords
-- ------------------------------------------------------------------
create table public.cached_routes (
  id uuid primary key default gen_random_uuid(),
  origin_lat double precision not null,
  origin_lng double precision not null,
  dest_lat double precision not null,
  dest_lng double precision not null,
  distance double precision not null,
  duration double precision not null,
  geometry text not null,
  alternatives_json text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (origin_lat, origin_lng, dest_lat, dest_lng)
);

-- ------------------------------------------------------------------
-- telemetry_aggregated: hourly per-vehicle movement summaries
-- ------------------------------------------------------------------
create table public.telemetry_aggregated (
  id uuid primary key default gen_random_uuid(),
  vehicle uuid not null references public.vehicles (id) on delete cascade,
  hour_bucket text not null,
  start_lat double precision not null,
  start_lng double precision not null,
  end_lat double precision not null,
  end_lng double precision not null,
  avg_speed double precision,
  max_speed double precision,
  distance_traveled double precision,
  point_count integer,
  route_polyline text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (vehicle, hour_bucket)
);

create index idx_telemetry_hour on public.telemetry_aggregated (hour_bucket);

-- ------------------------------------------------------------------
-- push_subscriptions: Web Push endpoints per user
-- ------------------------------------------------------------------
create table public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  "user" uuid not null references auth.users (id) on delete cascade,
  endpoint text not null check (char_length(endpoint) <= 512),
  p256dh text check (char_length(p256dh) <= 256),
  auth text check (char_length(auth) <= 256),
  user_agent text check (char_length(user_agent) <= 512),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (endpoint)
);

create index idx_push_subscriptions_user on public.push_subscriptions ("user");

-- ------------------------------------------------------------------
-- updated_at auto-maintenance trigger
-- ------------------------------------------------------------------
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql security definer;

do $$
declare
  t text;
begin
  foreach t in array array[
    'profiles', 'vehicles', 'convoys', 'convoy_members',
    'positions', 'messages', 'cached_routes',
    'telemetry_aggregated', 'push_subscriptions'
  ]
  loop
    execute format(
      'create trigger trg_%s_updated_at before update on public.%I
       for each row execute function public.set_updated_at()',
      t, t
    );
  end loop;
end $$;
