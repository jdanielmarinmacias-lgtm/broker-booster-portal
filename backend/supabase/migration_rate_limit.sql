-- ============================================================================
-- Migración: contadores atómicos de estado (Fase 0)
--
-- Por qué: la cuota diaria de IA y el rate-limit por minuto se guardan en
-- `documents` (colecciones `iaUso` / `loginAttempts`). Hacer GET + PUT desde
-- dos instancias serverless permite perder incrementos: dos peticiones leen
-- el mismo valor y ambas escriben el mismo +1. Esta función hace el
-- incremento dentro de un solo UPSERT, por lo que Postgres serializa la fila.
--
-- Uso: SQL Editor -> pegar -> Run. Es idempotente.
-- Si no se ejecuta, el backend usa el fallback GET+PUT (funciona, pero no es
-- atómico bajo concurrencia).
-- ============================================================================

create or replace function public.bump_document_number(
  p_collection text,
  p_doc_id text,
  p_field text,
  p_delta integer
) returns jsonb
language sql
as $$
  insert into public.documents (collection, doc_id, data, updated_at)
  values (
    p_collection,
    p_doc_id,
    jsonb_build_object(p_field, greatest(0, coalesce(p_delta, 0))),
    now()
  )
  on conflict (collection, doc_id) do update
  set data = jsonb_set(
      public.documents.data,
      array[p_field],
      to_jsonb(greatest(
        0,
        coalesce((public.documents.data->>p_field)::integer, 0) + coalesce(p_delta, 0)
      )),
      true
    ),
    updated_at = now()
  returning public.documents.data;
$$;

-- Solo el backend (service_role) puede incrementar contadores internos.
-- anon/authenticated no deben poder inflar la cuota ni el rate-limit.
revoke all on function public.bump_document_number(text, text, text, integer)
  from public, anon, authenticated;
grant execute on function public.bump_document_number(text, text, text, integer)
  to service_role;

comment on function public.bump_document_number(text, text, text, integer)
  is 'Incremento atómico de un campo numérico en documents (cuota IA / rate-limit).';
