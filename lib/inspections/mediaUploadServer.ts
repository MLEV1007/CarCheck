import type { SupabaseClient } from '@supabase/supabase-js';
import { createAdminClient } from '@/lib/supabase/admin';

/**
 * Megosztott szerver-oldali segédfüggvények a jelölt (signed) Storage feltöltési URL/token
 * kiadásához -- lásd PLAN_video_qr_upload.md 4. szakaszát. EZT a modult használja MIND a
 * `/api/inspections/media-upload-url` (asztali, hitelesített), MIND a
 * `/api/qr-upload/[token]/media-upload-url` (telefonos, anonim, tokennel/claim_secret-tel
 * hitelesített) route -- a videó-csomag-jogosultság ellenőrzése és a Storage-útvonal
 * felépítése EGYETLEN helyen él, nem duplikálva a két route között.
 *
 * **Miért `createSignedUploadUrl`, nem közvetlen `.upload()`:** a QR-kódos telefonos kliens
 * SOSE kap Supabase munkamenetet (nincs bejelentkezés), tehát a `storage.objects` RLS
 * (`(storage.foldername(name))[1] = auth.uid()::text`) alapból elutasítaná a feltöltését --
 * a jelölt URL/token az ADMIN (service-role) kliensen keresztül, az RLS-t MEGKERÜLVE kerül
 * kiadásra, DE csak azután, hogy ez a modul ellenőrizte a jogosultságot (lásd
 * `assertVideoUploadAllowed`) és felépítette a KANONIKUS Storage-útvonalat -- ez a "sosem
 * bízz kizárólag a kliensben" elv szerver-oldali kikényszerítése (lásd PLAN_video_qr_upload.md
 * 6. szakaszát, ugyanaz az elv, mint a `/api/ai/scan-defect` DEFECT_CATEGORIES
 * újraellenőrzésénél).
 */

/** A jelölt feltöltés Supabase TUS ("resumable") chunk-mérete -- a Supabase dokumentációja
 * szerint JELENLEG kötelezően 6 MiB, NE változtasd. Ugyanezt az értéket használjuk a
 * kliens-oldali plain-vs-TUS döntési küszöbként is (lásd `mediaUpload.ts`
 * `TUS_SIZE_THRESHOLD_BYTES`), hogy egy ennél kisebb fájlnál felesleges legyen a resumable
 * protokoll overhead-je (egyetlen PUT is elég). */
export const TUS_CHUNK_SIZE_BYTES = 6 * 1024 * 1024;

export type MediaCategory = 'general' | 'defect';

const ALLOWED_CATEGORIES: readonly MediaCategory[] = ['general', 'defect'];

export function isMediaCategory(value: unknown): value is MediaCategory {
  return typeof value === 'string' && (ALLOWED_CATEGORIES as readonly string[]).includes(value);
}

/** Dobva, ha egy szervezet (`user_credits.plan_tier` NEM `pro`/`business`) videót próbál
 * feltölteni -- lásd `assertVideoUploadAllowed`. A hívó route-ok ezt `403`-ra képezik le,
 * `code: 'VIDEO_NOT_ALLOWED'`-dal, hogy a kliens (`VideoUpsellProvider`) megkülönböztethesse
 * egy általános szerverhibától. */
export class VideoNotAllowedError extends Error {
  readonly code = 'VIDEO_NOT_ALLOWED' as const;

  constructor() {
    super('A videó-csatolás kizárólag Profi és Autóház csomaggal érhető el.');
    this.name = 'VideoNotAllowedError';
  }
}

/**
 * A szervezet videó-feltöltési jogosultságát a `public.organization_allows_video_upload(uuid)`
 * SECURITY DEFINER RPC-n keresztül dönti el (lásd `supabase/migrations/20260821_video_qr_upload.sql`)
 * -- ez KÖZVETLENÜL a `user_credits.plan_tier IN ('pro', 'business')` feltételt vizsgálja az
 * adatbázisban, tehát MINDEN hívó (hitelesített asztali kliens ÉS anonim QR-token-alapú
 * kliens, service-role klienssel hívva) UGYANAZT az egyetlen, kanonikus forrást használja --
 * nincs kockázata annak, hogy a TypeScript-oldali `getOrganizationQuotaBalance` leképezése
 * (`lib/quotas.ts`) és egy szerver-oldali újraimplementált ellenőrzés szétcsúszna egymástól.
 * A `supabase` paraméter LEHET a hívó saját, request-hatókörű (RLS-t tiszteletben tartó)
 * klliense (asztali route) VAGY az admin kliens (QR route, nincs munkamenet) -- a függvény
 * MINDKETTŐNEK grant-olva van (`anon, authenticated, service_role`).
 */
export async function assertVideoUploadAllowed(
  supabase: SupabaseClient,
  organizationId: string
): Promise<void> {
  const { data, error } = await supabase.rpc('organization_allows_video_upload', {
    p_organization_id: organizationId,
  });

  if (error) {
    throw new Error(`Nem sikerült ellenőrizni a videó-feltöltési jogosultságot: ${error.message}`);
  }

  if (!data) {
    throw new VideoNotAllowedError();
  }
}

function sanitizeFilename(name: string): string {
  const trimmed = name.trim();
  const safe = trimmed.replace(/[^a-zA-Z0-9._-]/g, '_');
  return safe.length > 0 ? safe : 'media';
}

/**
 * A Storage-útvonal felépítése -- 1:1 ugyanaz a minta, mint az `InspectionWizard.tsx`
 * `handleSubmit`-jének 6 (jelenleg még közvetlenül `.upload()`-ot hívó) feltöltő blokkja
 * (`${userId}/${inspectionId}/${category}/${crypto.randomUUID()}-${safeName}`) -- FONTOS,
 * hogy ez a minta ne csússzon szét a régi kóddal, mert az útvonal ELSŐ szegmense
 * (`userId`) a `storage.objects` RLS tulajdonlási feltételének (`(storage.foldername(name))[1]
 * = auth.uid()::text`) is megfelel, tehát a FÁJL TULAJDONOSA szempontjából később
 * (törlés/csere) is konzisztens marad, akár egy sima asztali feltöltésről, akár egy admin
 * kliensen keresztül kiadott jelölt URL-ről (QR) van szó -- utóbbinál a `userId` a session-t
 * létrehozó (hitelesített) asztali felhasználó `auth.uid()`-ja, SOSEM az anonim telefoné
 * (aminek nincs is `auth.uid()`-ja).
 */
export function buildInspectionMediaPath(params: {
  userId: string;
  inspectionId: string;
  category: MediaCategory;
  originalFilename: string;
}): string {
  const safeName = sanitizeFilename(params.originalFilename);
  return `${params.userId}/${params.inspectionId}/${params.category}/${crypto.randomUUID()}-${safeName}`;
}

function extractProjectId(supabaseUrl: string): string {
  // https://<project-id>.supabase.co -> <project-id> -- a TUS resumable upload endpoint
  // ("https://{projectId}.storage.supabase.co/storage/v1/upload/resumable") ezt igényli,
  // lásd a Supabase "Resumable Uploads" dokumentációját.
  const match = supabaseUrl.match(/^https?:\/\/([^./]+)\.supabase\.co/);
  if (!match) {
    throw new Error(
      'Nem sikerült kinyerni a Supabase projekt-azonosítót a NEXT_PUBLIC_SUPABASE_URL környezeti változóból.'
    );
  }
  return match[1];
}

export interface MediaUploadTicket {
  /** A `inspection-media` bucketen belüli, kanonikus, végleges útvonal. */
  path: string;
  /** A `createSignedUploadUrl` egyszer felhasználható tokene -- a kliens ezt adja tovább akár
   * a `uploadToSignedUrl` (kis fájl, egyetlen PUT) SDK hívásnak, akár a TUS
   * `x-signature` fejlécnek (nagy/videó fájl, resumable), lásd `mediaUpload.ts`-t. */
  token: string;
  /** A Supabase projekt-azonosító a TUS resumable endpoint URL összeállításához. */
  projectId: string;
}

/**
 * Kiadja a jelölt feltöltési tokent (`createSignedUploadUrl`, service-role/admin kliensen
 * keresztül, tehát MEGKERÜLI a `storage.objects` RLS-t) a kanonikus útvonalra. A HÍVÓ
 * FELELŐSSÉGE, hogy videó tartalomnál ELŐZETESEN meghívja az `assertVideoUploadAllowed`-et
 * -- ez a függvény szándékosan NEM végzi el saját maga a jogosultság-ellenőrzést, mert a két
 * hívó route (asztali vs. QR) eltérő módon jut el az `organizationId`-hoz (munkamenetből,
 * illetve a `qr_upload_sessions` sorból), és a hívási sorrend (gate ELŐBB, path/token
 * UTÁNA) explicit, olvasható marad, ha a route maga fésüli össze a két lépést.
 */
export async function issueMediaUploadTicket(params: {
  userId: string;
  inspectionId: string;
  category: MediaCategory;
  originalFilename: string;
}): Promise<MediaUploadTicket> {
  const path = buildInspectionMediaPath(params);
  const admin = createAdminClient();

  const { data, error } = await admin.storage
    .from('inspection-media')
    .createSignedUploadUrl(path, { upsert: true });

  if (error || !data) {
    throw new Error(`Nem sikerült aláírt feltöltési URL-t létrehozni: ${error?.message ?? 'ismeretlen hiba'}`);
  }

  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) {
    throw new Error('Hiányzó NEXT_PUBLIC_SUPABASE_URL környezeti változó.');
  }

  return { path: data.path, token: data.token, projectId: extractProjectId(supabaseUrl) };
}

/** A `resolve_qr_upload_session` RPC visszatérési sora -- lásd
 * `supabase/migrations/20260821_video_qr_upload.sql` "Claim logika" kommentjét. Explicit
 * TypeScript-oldali alak, mert a projekt Supabase klienseit NEM generált `Database` típussal
 * példányosítjuk (lásd `lib/supabase/*.ts`), tehát a `.rpc()` hívás önmagában `{}`-ként
 * típusozná a választ. */
export interface QrUploadSessionResolution {
  inspection_id: string;
  organization_id: string;
  target: string;
  video_allowed: boolean;
  claim_secret: string | null;
  expires_at: string;
}

/**
 * Vékony, típusos burok a `resolve_qr_upload_session` RPC köré -- MINDHÁROM QR-kódos
 * végpont (`app/api/qr-upload/[token]/route.ts`, `.../media-upload-url/route.ts`,
 * `.../confirm/route.ts`) EZT hívja, hogy a "claim" ellenőrzés/hibakezelés egyetlen helyen
 * éljen, ne duplikálódjon háromszor. `null`-t ad vissza, ha a token lejárt/nem létezik/már
 * MÁS eszköz claim-elte (lásd a migráció RPC-kommentjét) -- a hívó route ezt `404`/`403`-ra
 * képezi le a saját kontextusának megfelelően.
 */
export async function resolveQrUploadSession(
  admin: SupabaseClient,
  token: string,
  claimSecret: string | null
): Promise<QrUploadSessionResolution | null> {
  const { data, error } = await admin
    .rpc('resolve_qr_upload_session', { p_token: token, p_claim_secret: claimSecret })
    .maybeSingle();

  if (error) {
    throw new Error(`Nem sikerült feloldani a QR-feltöltési session-t: ${error.message}`);
  }

  return (data as QrUploadSessionResolution | null) ?? null;
}

/** A publikus Storage URL felépítése egy MÁR feltöltött útvonalhoz -- ugyanaz a minta, mint
 * az `InspectionWizard.tsx` `getPublicUrl(path).data.publicUrl` hívásai, csak admin
 * kliensről (a `getPublicUrl` nem igényel hitelesítést, tisztán URL-összeállítás, de az
 * admin kliens itt már úgyis a kezünkben van a hívó route-okban). */
export function getInspectionMediaPublicUrl(path: string): string {
  const admin = createAdminClient();
  return admin.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
}
