-- Supabase/PostgreSQL schema for IoT energy monitoring
-- Run this in Supabase SQL Editor.

create extension if not exists pgcrypto;

create table if not exists public.sensor_readings (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null,
  outlet_id integer,
  voltage numeric(10,3),
  current numeric(10,3),
  power numeric(10,3),
  energy numeric(12,3),
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_sensor_readings_created_at
  on public.sensor_readings (created_at desc);

create index if not exists idx_sensor_readings_request_id
  on public.sensor_readings (request_id);

create index if not exists idx_sensor_readings_outlet_id
  on public.sensor_readings (outlet_id);

create table if not exists public.user_appliances (
  id uuid primary key default gen_random_uuid(),
  user_id text,
  outlet_id integer,
  appliance_name text not null,
  appliance_type text not null,
  standard_wattage numeric(10,2) not null check (standard_wattage >= 0),
  notes text,
  created_at timestamptz not null default timezone('utc', now()),
  updated_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_user_appliances_user_id
  on public.user_appliances (user_id);

create index if not exists idx_user_appliances_outlet_id
  on public.user_appliances (outlet_id);

create table if not exists public.diagnostic_logs (
  id uuid primary key default gen_random_uuid(),
  outlet_id integer,
  log_level text not null default 'info'
    check (log_level in ('info', 'warning', 'error', 'critical')),
  log_code text,
  message text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_diagnostic_logs_created_at
  on public.diagnostic_logs (created_at desc);

create index if not exists idx_diagnostic_logs_outlet_id
  on public.diagnostic_logs (outlet_id);

create index if not exists idx_diagnostic_logs_log_level
  on public.diagnostic_logs (log_level);

create table if not exists public.appliance_sessions (
  id uuid primary key default gen_random_uuid(),
  outlet_id integer not null,
  appliance_name text not null,
  started_at timestamptz not null default timezone('utc', now()),
  ended_at timestamptz,
  duration_seconds integer not null default 0,
  sample_count integer not null default 0,
  avg_power numeric(10,3) not null default 0,
  peak_power numeric(10,3) not null default 0,
  energy_used numeric(12,3) not null default 0,
  rate_per_kwh numeric(10,3) not null default 12,
  estimated_cost numeric(12,3) not null default 0,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_appliance_sessions_started_at
  on public.appliance_sessions (started_at desc);

create index if not exists idx_appliance_sessions_outlet_id
  on public.appliance_sessions (outlet_id);

create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = timezone('utc', now());
  return new;
end;
$$ language plpgsql;

drop trigger if exists trg_user_appliances_updated_at on public.user_appliances;
create trigger trg_user_appliances_updated_at
before update on public.user_appliances
for each row execute procedure public.set_updated_at();
