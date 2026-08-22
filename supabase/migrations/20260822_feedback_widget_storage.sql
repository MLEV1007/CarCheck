-- Saját, pillekönnyű in-app visszajelző widget (NEM Formbricks -- lásd a korábbi,
-- 2026-08-20-án teljesen eltávolított kísérletet) -- Storage bucket a csatolt képeknek.
--
-- Maga a visszajelzés (kategória/leírás/beküldő) NEM egy Supabase táblába kerül, hanem a
-- Notion API-n keresztül közvetlenül egy Notion Kanban adatbázis lapjaként jön létre --
-- lásd app/api/feedback/route.ts + docs/notion-feedback-widget-setup-2026-08-22.md. Ez a
-- migráció KIZÁRÓLAG a csatolt kép publikus tárolásához szükséges bucket-et + RLS
-- policy-kat hozza létre.
--
-- Megjegyzés: ez a fájl a `supabase/migrations/` mappában a dokumentáció/verzió-követés
-- célját szolgálja -- a séma a Supabase MCP `apply_migration` eszközével lett közvetlenül
-- az éles projektre (`nsejmkcwvksbwxscvrvb`) alkalmazva, ugyanaz a minta, mint pl. a
-- `20260821_video_qr_upload.sql`-nél.

-- -----------------------------------------------------------------------------
-- 1) feedback-attachments bucket -- publikus (a Notion lap "Image URL" mezője
--    közvetlenül a nyilvános URL-re mutat, nincs jelölt/lejáró link-kezelés).
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'feedback-attachments',
  'feedback-attachments',
  true,
  5242880, -- 5 MB, ugyanaz a kliens-oldali korlát, mint FeedbackModal.tsx MAX_IMAGE_SIZE_BYTES
  array['image/png', 'image/jpeg', 'image/webp', 'image/gif']
)
on conflict (id) do update set
  public = true,
  file_size_limit = 5242880,
  allowed_mime_types = array['image/png', 'image/jpeg', 'image/webp', 'image/gif'];

-- -----------------------------------------------------------------------------
-- 2) storage.objects RLS -- ugyanaz a "saját mappa" minta, mint az inspection-media
--    bucket-nél ((storage.foldername(name))[1] = auth.uid()): bejelentkezett felhasználó
--    kizárólag a SAJÁT mappájába tölthet fel/olvashat, adatszivárgás a bérlők között
--    (más felhasználó feedback-mellékletének elérése) így kizárva.
-- -----------------------------------------------------------------------------
drop policy if exists feedback_attachments_authenticated_upload on storage.objects;

create policy feedback_attachments_authenticated_upload
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'feedback-attachments'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists feedback_attachments_authenticated_read on storage.objects;

create policy feedback_attachments_authenticated_read
  on storage.objects for select
  to authenticated
  using (bucket_id = 'feedback-attachments');

-- Nincs UPDATE/DELETE policy -- egyszeri feltöltés, a felhasználó a beküldés után nem
-- módosítja/törli a saját csatolt képét (ha erre igény lenne, ugyanazzal a path-tulajdonlási
-- feltétellel bővíthető, lásd az inspection-media bucket policy-inak mintáját).
