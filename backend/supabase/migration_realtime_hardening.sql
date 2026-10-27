-- ============================================================================
-- Migración: endurecimiento realtime + rendimiento (ejecutar UNA vez en SQL Editor).
-- 1) Índices: las lecturas por colección (.in('collection')) hacían scan
--    completo y provocaban statement timeouts en el plan gratuito.
-- 2) Lectura pública del bucket `portal-media` (las subidas firmadas ya las
--    firma el backend con service key; sin esta policy los archivos no se ven).
-- 3) Ticker collection_versions: realtime entre PCs (qué cambió) sin exponer datos.
-- 4) Poda: public_feed y auditoria crecían sin cota (5000+ y 800+ filas);
--    cada escritura descargaba todo eso. Se conservan las 300 del feed y
--    las 500 de auditoría más recientes (la app ya cota auditoría a 500).
-- ============================================================================

-- 1) Índices
create index if not exists documents_collection_idx
  on public.documents (collection);
create index if not exists documents_updated_idx
  on public.documents (updated_at desc);
create index if not exists public_feed_created_idx
  on public.public_feed (created_at desc);
create index if not exists app_sessions_expires_idx
  on public.app_sessions (expires_at);
create index if not exists app_users_username_idx
  on public.app_users (username);

-- Columnas del feed con archivos (idempotente con migration_media.sql)
alter table public.public_feed
  add column if not exists image_url text,
  add column if not exists media_kind text;

-- 2) Lectura pública de archivos del bucket del portal
drop policy if exists "Lectura publica portal-media" on storage.objects;
create policy "Lectura publica portal-media"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'portal-media');

-- 3) Ticker de versiones por colección: realtime entre PCs sin exponer datos.
-- El backend actualiza updated_at en cada guardado; el portal se suscribe
-- y hace pull quirúrgico solo de la colección que cambió.
create table if not exists public.collection_versions (
  collection text primary key,
  updated_at timestamptz not null default now()
);
alter table public.collection_versions enable row level security;
revoke all on table public.collection_versions from anon, authenticated;
grant select on table public.collection_versions to anon, authenticated;
drop policy if exists "Lectura publica versiones" on public.collection_versions;
create policy "Lectura publica versiones"
  on public.collection_versions for select
  to anon, authenticated
  using (true);
do $$
begin
  alter publication supabase_realtime add table public.collection_versions;
exception when duplicate_object then null;
end $$;

-- 4) Poda inicial (una vez; el backend poda solo a partir de aquí)
delete from public.public_feed
where id not in (
  select id from public.public_feed order by created_at desc limit 300
);
delete from public.documents
where collection = 'auditoria'
  and doc_id not in (
    select doc_id from public.documents
    where collection = 'auditoria'
    order by updated_at desc limit 500
  );
