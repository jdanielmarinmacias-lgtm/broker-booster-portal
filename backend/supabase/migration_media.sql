-- ============================================================================
-- Migración Paso 4 (archivos compartidos). Ejecutar UNA vez en SQL Editor.
-- Agrega imagen/video/documento a los eventos del feed en vivo.
-- (El bucket `portal-media` lo crea solo el backend al arrancar.)
-- ============================================================================
alter table public.public_feed
  add column if not exists image_url text,
  add column if not exists media_kind text;
