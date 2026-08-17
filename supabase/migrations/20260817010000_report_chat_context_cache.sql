-- =============================================================================
-- Publikus riport AI chat -- Gemini explicit prompt-cache könyvelés (2026-08-17)
-- =============================================================================
-- Kérés (Levi): kapcsoljuk be a prompt cache-elést az ügyfél-oldali riport AI
-- chaten (/api/report-chat) -- a rendszerprompt (a TELJES riport-JSON-t
-- tartalmazza) minden egyes üzenetnél újra el lett küldve, pedig ugyanahhoz a
-- riport-tokenhez tartozó összes beszélgetés (akár TÖBB látogatótól is) ugyanazt
-- a rendszerpromptot használja -- ez a Gemini explicit context caching API-jával
-- (`ai.caches.create`) egyszer gyorsítótárazható, utána `cachedContent`
-- hivatkozással újrahasználható a cache lejártáig (jelenleg 1 óra TTL).
--
-- Ez a tábla KIZÁRÓLAG a Gemini-oldali cache-erőforrás NEVÉT könyveli
-- riport-tokenenként (NEM a riport tartalmát, NEM a beszélgetést) -- a
-- `content_hash` teszi lehetővé, hogy ha a riport adata időközben megváltozik
-- (revalidate-report), a régi cache-t eldobjuk és újat hozzunk létre, a `model`
-- mező pedig azért kell, mert egy Gemini cache egy KONKRÉT modellhez van kötve,
-- nem használható át egy másik (fallback) modellel.
--
-- KIZÁRÓLAG a report-chat route service-role (createAdminClient()) klienséből
-- érhető el -- RLS bekapcsolva, policy NÉLKÜL (ugyanaz a minta, mint a
-- report_chat_usage táblánál, lásd 20260806180000_report_ai_chat.sql), mert a
-- service-role kliens eleve megkerüli az RLS-t, direkt kliens/PostgREST
-- hozzáférés viszont mindig elutasításra kerül.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-
-- követés célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével
-- lett közvetlenül az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva.
-- =============================================================================

create table public.report_chat_context_cache (
  public_token uuid primary key,
  cache_name text not null,
  model text not null,
  content_hash text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

comment on table public.report_chat_context_cache is
  'A publikus riport AI chat (/api/report-chat) Gemini explicit prompt-cache '
  'könyvelése -- riport-tokenenként EGY Gemini CachedContent erőforrás nevét '
  'tárolja (a rendszerprompt SZÖVEGE nem itt él, csak a Google-oldali cache '
  'referencia + egy content-hash az érvénytelenítéshez). KIZÁRÓLAG a report-chat '
  'route service-role klienséből érhető el, RLS policy nélkül.';
comment on column public.report_chat_context_cache.content_hash is
  'A cache-elt rendszerprompt SHA-256 hash-e -- ha a riport adata időközben '
  'megváltozik (pl. revalidate-report), a hash eltér, a route új cache-t hoz '
  'létre a régi felülírásával, sosem szolgál ki elavult riport-adatot a cache-ből.';
comment on column public.report_chat_context_cache.expires_at is
  'A mi könyvelésünk szerinti lejárat (a Gemini-oldali cache TTL-jével '
  'szinkronban létrehozáskor beállítva) -- a route egy biztonsági ráhagyással '
  '(a tényleges lejárat előtt) újra létrehozza a cache-t, hogy sose próbáljon '
  'egy éppen lejáró/lejárt cache-referenciát használni.';

alter table public.report_chat_context_cache enable row level security;
-- Szándékosan egyetlen policy sincs -- lásd a fenti fejléc-kommentet, a tábla
-- kizárólag a service-role admin kliensből érhető el.
