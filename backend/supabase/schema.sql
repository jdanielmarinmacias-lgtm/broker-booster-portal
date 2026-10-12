-- ============================================================================
-- Schema Supabase del portal (Paso 3). Ejecutar en SQL Editor (una vez).
-- Modelo: documentos genéricos + tablas propias de auth. RLS bloqueado para
-- anon/autenticated en todo lo privado; solo public_feed es legible/broadcast.
-- ============================================================================

-- 1) Documentos genéricos (todas las colecciones tipo pepes_v3_db menos users)
create table if not exists public.documents (
  collection text not null,
  doc_id text not null,
  data jsonb not null default '{}'::jsonb,
  updated_at timestamptz not null default now(),
  primary key (collection, doc_id)
);

-- 2) Usuarios del sistema propio (el hash NUNCA sale: solo service_role lo lee)
create table if not exists public.app_users (
  id text primary key,
  username text not null unique,
  role text not null,
  profile jsonb not null default '{}'::jsonb,
  password_hash text,
  must_change boolean not null default true
);

-- 3) Sesiones opacas (token = cookie HttpOnly)
create table if not exists public.app_sessions (
  token text primary key,
  user_id text not null references public.app_users(id) on delete cascade,
  expires_at timestamptz not null
);
create index if not exists app_sessions_user_idx on public.app_sessions (user_id);

-- 4) Feed público (portada en vivo: inmuebles, autos, posts, avisos)
create table if not exists public.public_feed (
  id bigint generated always as identity primary key,
  kind text not null default 'aviso',
  title text not null default '',
  body text not null default '',
  created_at timestamptz not null default now()
);

-- 5) RLS: todo privado bloqueado, feed público solo-lectura
alter table public.documents enable row level security;
alter table public.app_users enable row level security;
alter table public.app_sessions enable row level security;
alter table public.public_feed enable row level security;

revoke all on table public.documents from anon, authenticated;
revoke all on table public.app_users from anon, authenticated;
revoke all on table public.app_sessions from anon, authenticated;
revoke all on table public.public_feed from anon, authenticated;

grant select on table public.public_feed to anon, authenticated;

drop policy if exists "Public can read feed" on public.public_feed;
create policy "Public can read feed"
  on public.public_feed for select
  to anon, authenticated
  using (true);

-- 6) Realtime para el feed (el backend inserta con service_role; el
-- navegador recibe vía postgres_changes con la ANON key)
alter publication supabase_realtime add table public.public_feed;
