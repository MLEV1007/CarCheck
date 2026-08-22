import { NextResponse } from 'next/server';
import { Client as NotionClient } from '@notionhq/client';
import { createClient } from '@/lib/supabase/server';
import { FEEDBACK_CATEGORIES, FEEDBACK_CATEGORY_LABELS, type FeedbackCategory } from '@/types/feedback';

/**
 * Saját, pillekönnyű in-app visszajelző widget backendje (NEM Formbricks -- lásd a
 * korábbi, 2026-08-20-án teljesen eltávolított kísérletet) -- a `FeedbackModal.tsx`
 * ('use client', lásd JSDoc-ját) küldi ide a beérkezett hibát/ötletet, ez a végpont pedig
 * a Notion API-n (`@notionhq/client`) keresztül létrehoz belőle egy lapot a saját Notion
 * Kanban adatbázisunkban ("Status" oszloppal csoportosítva -- új beküldés mindig 'Új'
 * státusszal érkezik).
 *
 * A pontos Notion adatbázis-séma (property nevek/típusok), a Notion Integration Token
 * beszerzése és az adatbázis megosztása az integrációval a
 * `docs/notion-feedback-widget-setup-2026-08-22.md` fájlban van dokumentálva -- ez a
 * projekt egyetlen olyan lépése, amit KIZÁRÓLAG a felhasználó tud elvégezni (a Notion
 * Integration Token/Database ID az ő saját Notion workspace-éhez tartozik).
 *
 * **Autentikáció:** ugyanaz a minta, mint a `/api/credits/summary`-nál -- `lib/supabase/
 * server.ts` cookie-alapú kliens, `401` bejelentkezés nélkül (a gomb amúgy is csak
 * bejelentkezve érhető el, `DashboardHeader.tsx`/Beállítások, de a végpont saját magát is
 * védi). A `userId`-t a Notion lapra SOSEM a kliens által küldött body-ból, hanem a
 * hitelesített session-ből olvassuk -- ne bízzunk azonosításra kliens-oldali payloadban,
 * még akkor sem, ha a `FeedbackModal.tsx` "jóhiszeműen" elküldi. A `userEmail`-t viszont a
 * body-ból fogadjuk el elsődlegesen (session `user.email` a fallback), mert ez kizárólag a
 * Notion lap egy megjelenítő mezője, nem azonosítás.
 */

interface FeedbackRequestBody {
  category?: unknown;
  description?: unknown;
  imageUrl?: unknown;
  userEmail?: unknown;
}

interface FeedbackSuccessResponse {
  success: true;
}

interface FeedbackErrorResponse {
  success: false;
  error: string;
  code?: string;
}

// A Notion `rich_text`/`title` property egyetlen text-objektuma legfeljebb 2000
// karaktert fogad el (Notion API korlát) -- ennél hosszabb leírást levágunk, hogy a
// `pages.create` hívás ne bukjon el egy validációs hibán.
const MAX_DESCRIPTION_LENGTH = 2000;
const TITLE_SUMMARY_LENGTH = 60;

function toErrorDetails(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

function buildTitle(category: FeedbackCategory, description: string): string {
  const label = FEEDBACK_CATEGORY_LABELS[category];
  const summary = description.length > TITLE_SUMMARY_LENGTH ? `${description.slice(0, TITLE_SUMMARY_LENGTH)}…` : description;
  return `${label}: ${summary}`;
}

export async function POST(request: Request): Promise<NextResponse<FeedbackSuccessResponse | FeedbackErrorResponse>> {
  const supabase = await createClient();
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { success: false, error: 'A visszajelzés küldéséhez bejelentkezés szükséges.', code: 'UNAUTHORIZED' },
      { status: 401 }
    );
  }

  const body = (await request.json().catch(() => null)) as FeedbackRequestBody | null;
  const rawCategory = body?.category;
  const rawDescription = body?.description;

  if (
    !body ||
    typeof rawCategory !== 'string' ||
    !FEEDBACK_CATEGORIES.includes(rawCategory as FeedbackCategory) ||
    typeof rawDescription !== 'string' ||
    !rawDescription.trim()
  ) {
    return NextResponse.json(
      { success: false, error: 'Hiányzó vagy érvénytelen mezők (kategória és leírás kötelező).', code: 'INVALID_BODY' },
      { status: 400 }
    );
  }

  const category = rawCategory as FeedbackCategory;
  const description = rawDescription.trim().slice(0, MAX_DESCRIPTION_LENGTH);
  const imageUrl = typeof body.imageUrl === 'string' && body.imageUrl.trim() ? body.imageUrl.trim() : null;
  const userEmail = typeof body.userEmail === 'string' && body.userEmail.trim() ? body.userEmail.trim() : user.email ?? null;

  const notionApiKey = process.env.NOTION_API_KEY?.trim();
  const notionDatabaseId = process.env.NOTION_DATABASE_ID?.trim();

  if (!notionApiKey || !notionDatabaseId) {
    console.error(
      '[feedback] Hiányzó NOTION_API_KEY vagy NOTION_DATABASE_ID környezeti változó -- lásd .env.local.example ' +
        'és docs/notion-feedback-widget-setup-2026-08-22.md.'
    );
    return NextResponse.json(
      {
        success: false,
        error: 'A visszajelző rendszer jelenleg nincs beállítva. Kérjük, próbáld később.',
        code: 'NOTION_NOT_CONFIGURED',
      },
      { status: 500 }
    );
  }

  const notion = new NotionClient({ auth: notionApiKey });

  try {
    // FONTOS: a property NEVEK ("Name"/"Status"/"Category"/"Description"/"User Email"/
    // "Image URL") és TÍPUSOK (title/select/select/rich_text/rich_text/url) PONTOSAN
    // egyezniük kell a Notion adatbázisban ténylegesen beállított oszlopokkal, különben a
    // Notion API 400-at ad vissza -- lásd a séma-táblázatot
    // `docs/notion-feedback-widget-setup-2026-08-22.md`-ben.
    //
    // **"Status" -- SELECT, nem a Notion beépített "status" property-típusa** (2026-08-22,
    // MCP-vel élesben felderítve): a Notion API ma nem enged a `status` típusú property-hez
    // egyetlen meglévő adatbázis-élre sem ÚJ opciót DDL-lel felvenni ("If a new status
    // option is needed, the data source must be updated to add it" -- de a rendelkezésre
    // álló update-data-source eszköz a STATUS típushoz NEM fogad el opció-listát,
    // kizárólag a SELECT/MULTI_SELECT szintaxis teszi ezt lehetővé). Emiatt a "Status"
    // oszlop a Notion adatbázisban SZÁNDÉKOSAN sima Select (nem a speciális Status
    // property-típus) -- Új/Folyamatban/Kész/Elutasítva opciókkal.
    await notion.pages.create({
      parent: { database_id: notionDatabaseId },
      properties: {
        Name: { title: [{ text: { content: buildTitle(category, description) } }] },
        Status: { select: { name: 'Új' } },
        Category: { select: { name: FEEDBACK_CATEGORY_LABELS[category] } },
        Description: { rich_text: [{ text: { content: description } }] },
        'User Email': { rich_text: [{ text: { content: userEmail ?? 'ismeretlen' } }] },
        ...(imageUrl ? { 'Image URL': { url: imageUrl } } : {}),
      },
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[feedback] Nem sikerült a Notion lapot létrehozni (userId:', user.id, '):', toErrorDetails(error));
    return NextResponse.json(
      { success: false, error: 'Nem sikerült elküldeni a visszajelzést. Próbáld újra.', code: 'NOTION_ERROR' },
      { status: 502 }
    );
  }
}
