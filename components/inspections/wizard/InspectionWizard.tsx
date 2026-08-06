'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StepIndicator } from '@/components/inspections/wizard/StepIndicator';
import { StepCarInfo } from '@/components/inspections/wizard/StepCarInfo';
import { StepGeneralPhotos } from '@/components/inspections/wizard/StepGeneralPhotos';
import { StepServiceHistory } from '@/components/inspections/wizard/StepServiceHistory';
import { StepDiagnostics } from '@/components/inspections/wizard/StepDiagnostics';
import { StepEquipment } from '@/components/inspections/wizard/StepEquipment';
import { StepTires } from '@/components/inspections/wizard/StepTires';
import { StepPaintMeasurements } from '@/components/inspections/wizard/StepPaintMeasurements';
import { StepDamageMap } from '@/components/inspections/wizard/StepDamageMap';
import { StepDefects } from '@/components/inspections/wizard/StepDefects';
import { StepFinalAssessment } from '@/components/inspections/wizard/StepFinalAssessment';
import { StepSummary } from '@/components/inspections/wizard/StepSummary';
import {
  DEFAULT_LICENSE_PLATE_COUNTRY,
  EQUIPMENT_ITEMS,
  TIRE_BRAND_OTHER,
  WIZARD_STEP_META,
} from '@/lib/inspections/constants';
import { isValidDot } from '@/lib/inspections/tireDot';
import {
  EMPTY_CAR_INFO,
  EMPTY_CLIENT_INFO,
  EMPTY_DEFECT,
  EMPTY_DIAGNOSTICS,
  EMPTY_FINAL_ASSESSMENT,
  EMPTY_SERVICE_HISTORY,
  EMPTY_TIRE_GENERAL_INFO,
  EMPTY_TIRES,
  type CarInfoState,
  type ClientInfoState,
  type DamagePointState,
  type DefectState,
  type DiagnosticsState,
  type FeatureFormState,
  type FinalAssessmentState,
  type GeneralPhotoState,
  type PaintPointState,
  type ServiceHistoryState,
  type TireGeneralInfoState,
  type TiresState,
  type WizardStep,
} from '@/lib/inspections/types';

/** A "Tovább" gomb-feliratokhoz szükséges rövid lépés-címkék EGYETLEN forrása -- lásd
 * `WIZARD_STEP_META` a `constants.ts`-ben a teljes indoklásért ("Dinamikus Tovább gomb
 * felirat" lépés). A hosszú címke (`longLabel`) mostantól közvetlenül a
 * `StepIndicator.tsx`-ben él, mert az a progress bar felirat EGYETLEN felhasználója
 * (lásd a "Stepper teljes újratervezése" lépést) -- itt már nincs rá szükség. */
const NEXT_STEP_SHORT_LABEL: Record<WizardStep, string> = Object.fromEntries(
  WIZARD_STEP_META.map(({ step, shortLabel }) => [step, shortLabel])
) as Record<WizardStep, string>;

function defaultEquipment(): FeatureFormState[] {
  return EQUIPMENT_ITEMS.map((name) => ({ id: name, status: 'not_present' as const, notes: '', file: null, previewUrl: null }));
}

interface InspectionWizardProps {
  /** Meglévő piszkozat folytatásakor a `/inspections/[id]` route adja át -- ha nincs megadva, új UUID generálódik (új vizsgálat). */
  inspectionId?: string;
  initialCarInfo?: CarInfoState;
  /** ÚJ vizsgálatnál (`/inspections/new`) a bejelentkezett user `user_metadata.
   * default_license_country` értéke (Settings oldalon testre szabható) -- ez tölti elő a
   * Rendszám felségjelzés dropdown kezdeti értékét, ha `initialCarInfo` NINCS megadva.
   * Piszkozat szerkesztésekor irreleváns, mert az `initialCarInfo.licensePlateCountry` már
   * az ADOTT vizsgálathoz korábban mentett kódot tartalmazza -- lásd
   * `app/inspections/new/page.tsx` / `app/inspections/[id]/page.tsx`. */
  defaultLicensePlateCountry?: string;
  initialGeneralPhotos?: GeneralPhotoState[];
  initialServiceHistory?: ServiceHistoryState;
  initialDiagnostics?: DiagnosticsState;
  initialEquipment?: FeatureFormState[];
  initialTires?: TiresState;
  initialTireGeneralInfo?: TireGeneralInfoState;
  initialPaintMeasurements?: PaintPointState[];
  initialDamages?: DamagePointState[];
  initialDefects?: DefectState[];
  initialFinalAssessment?: FinalAssessmentState;
  /** Átvizsgáló és Ügyfél adatok + PDF megjelenítési kapcsolók (2026-08-06) --
   * piszkozat szerkesztésekor a korábban mentett `client_name`/`client_phone`/
   * `client_email`/`show_inspector_on_pdf`/`show_client_on_pdf` mezőkből épül fel
   * (lásd `app/inspections/[id]/page.tsx` `toInitialClientInfo`), ÚJ vizsgálatnál
   * nincs megadva -- ilyenkor `EMPTY_CLIENT_INFO` (a DB oszlopok default értékeivel
   * megegyező alapállapot) a kezdeti érték. */
  initialClientInfo?: ClientInfoState;
}

/**
 * Több lépésből álló wizard az új vizsgálat rögzítéséhez ÉS egy meglévő piszkozat
 * folytatásához/szerkesztéséhez (PROJEKT_INSTRUKCIOK.md 5.B: Szakértői Dashboard &
 * Űrlap -- Linear Dark Design Style; a folytatás/szerkesztés a `/inspections/[id]`
 * route-on keresztül éri el ezt a komponenst).
 *
 * Ha az `inspectionId` prop nincs megadva (új vizsgálat, `/inspections/new`), kliens-oldalon
 * generálunk egy UUID-t (crypto.randomUUID()) már a wizard megnyitásakor, hogy a 3. lépés
 * média-feltöltései és a végleges mentés (5. lépés) ugyanarra a sorra hivatkozzanak. Ha meg
 * van adva (piszkozat folytatása), azt a sort frissítjük tovább -- a `handleSubmit` mindkét
 * esetben ugyanazt az utat futja be: az `inspections` sor UPSERT-je (id-ütközésnél UPDATE),
 * a `paint_measurements`/`defects` gyerek-sorok pedig előbb törlődnek `inspection_id` alapján,
 * majd újra beszúródnak a jelenlegi state-ből -- ez új vizsgálatnál no-op törlés (nincs mit
 * törölni), szerkesztésnél pedig biztonságosan felülírja a korábbi mérés-/hiba-listát
 * duplikáció nélkül.
 */
export function InspectionWizard({
  inspectionId: initialInspectionId,
  initialCarInfo,
  defaultLicensePlateCountry,
  initialGeneralPhotos,
  initialServiceHistory,
  initialDiagnostics,
  initialEquipment,
  initialTires,
  initialTireGeneralInfo,
  initialPaintMeasurements,
  initialDamages,
  initialDefects,
  initialFinalAssessment,
  initialClientInfo,
}: InspectionWizardProps = {}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [carInfo, setCarInfo] = useState<CarInfoState>(
    initialCarInfo ??
      (defaultLicensePlateCountry ? { ...EMPTY_CAR_INFO, licensePlateCountry: defaultLicensePlateCountry } : EMPTY_CAR_INFO)
  );
  const [generalPhotos, setGeneralPhotos] = useState<GeneralPhotoState[]>(initialGeneralPhotos ?? []);
  const [serviceHistory, setServiceHistory] = useState<ServiceHistoryState>(initialServiceHistory ?? EMPTY_SERVICE_HISTORY);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(initialDiagnostics ?? EMPTY_DIAGNOSTICS);
  const [equipment, setEquipment] = useState<FeatureFormState[]>(initialEquipment ?? defaultEquipment());
  const [tires, setTires] = useState<TiresState>(initialTires ?? EMPTY_TIRES);
  const [tireGeneralInfo, setTireGeneralInfo] = useState<TireGeneralInfoState>(
    initialTireGeneralInfo ?? EMPTY_TIRE_GENERAL_INFO
  );
  const [paintMeasurements, setPaintMeasurements] = useState<PaintPointState[]>(initialPaintMeasurements ?? []);
  const [damages, setDamages] = useState<DamagePointState[]>(initialDamages ?? []);
  const [defects, setDefects] = useState<DefectState[]>(initialDefects ?? [EMPTY_DEFECT()]);
  const [finalAssessment, setFinalAssessment] = useState<FinalAssessmentState>(
    initialFinalAssessment ?? EMPTY_FINAL_ASSESSMENT
  );
  const [clientInfo, setClientInfo] = useState<ClientInfoState>(initialClientInfo ?? EMPTY_CLIENT_INFO);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inspectionId] = useState<string>(() => initialInspectionId ?? crypto.randomUUID());
  // Ha `initialInspectionId`-t kaptunk propként, ez egy MEGLÉVŐ piszkozat szerkesztése
  // (`/inspections/[id]`) -- ez a különbségtétel a hibakezelésnél kritikus, lásd lent.
  const isEditMode = Boolean(initialInspectionId);

  async function handleSubmit(status: 'draft' | 'completed') {
    setIsSubmitting(true);
    setSubmitError(null);

    const supabase = createClient();
    const relevantDefects = defects.filter(
      (defect) => defect.category.trim() !== '' || defect.description.trim() !== '' || defect.file
    );

    try {
      const {
        data: { user },
      } = await supabase.auth.getUser();

      if (!user) {
        throw new Error('A munkamenet lejárt. Jelentkezz be újra, és próbáld meg ismét.');
      }

      // Szervezeti RBAC (PROJEKT_INSTRUKCIOK.md "Szervezeti szerepkezelés" lépés): minden
      // vizsgálat az `organization_id`-jához kötve él (multi-tenant riport-láthatóság,
      // lásd `supabase/migrations/20260803_organizations_rbac.sql` `inspections_select_org`
      // RLS policy-ját) -- ezt a user `profiles` sorából olvassuk ki, a `created_by` pedig
      // mindig a TÉNYLEGESEN mentő user (a `user_id` oszloppal jelenleg megegyezik, de a
      // jövőbeli csapaton-belüli szerkesztéshez a kettő szándékosan külön mező).
      const { data: profileRow, error: profileError } = await supabase
        .from('profiles')
        .select('organization_id')
        .eq('id', user.id)
        .single();

      if (profileError || !profileRow?.organization_id) {
        throw new Error('Nem sikerült meghatározni a szervezetedet. Jelentkezz be újra, és próbáld meg ismét.');
      }

      const organizationId = profileRow.organization_id;

      // Általános autó fotók feltöltése (PROJEKT_INSTRUKCIOK.md, "Általános autó fotók modul"
      // lépés) -- ugyanaz a minta, mint a hiba-médiánál: a most kiválasztott (`file` !== null)
      // képek most töltődnek fel, a piszkozat szerkesztésekor már meglévő, még mindig a listában
      // lévő URL-eket (`previewUrl`, nem `blob:`) nem töltjük fel újra, csak megtartjuk. A
      // `general_photos` egyetlen oszlop az `inspections` sorban, ezért nincs szükség külön
      // törlés+beszúrás ciklusra, mint a `paint_measurements`/`defects` gyerek-tábláknál -- az
      // UPSERT egyszerűen felülírja a teljes tömböt a jelenlegi state-nek megfelelően.
      const generalPhotoUrls = await Promise.all(
        generalPhotos.map(async (photo) => {
          if (photo.file) {
            const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/${inspectionId}/general/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from('inspection-media')
              .upload(path, photo.file, { upsert: true });
            if (uploadError) throw uploadError;
            return supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
          }
          return photo.previewUrl;
        })
      );

      // Szervizmúlt & Dokumentumok modul -- fotók feltöltése: PONTOSAN ugyanaz a minta, mint
      // az általános autó fotóknál fentebb (külön Storage almappa, `service/`, hogy ne
      // keveredjen a `general/` képekkel), csak most a `service_history.photos` state-ből.
      const serviceHistoryPhotoUrls = await Promise.all(
        serviceHistory.photos.map(async (photo) => {
          if (photo.file) {
            const safeName = photo.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/${inspectionId}/service/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from('inspection-media')
              .upload(path, photo.file, { upsert: true });
            if (uploadError) throw uploadError;
            return supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
          }
          return photo.previewUrl;
        })
      );

      // CarVertical (vagy hasonló autó-előéleti szolgáltatás) PDF riport -- EGYETLEN fájl,
      // ezért nincs Promise.all/tömb, mint a fotóknál. Ugyanaz a "blob vs. már feltöltött
      // Storage URL" logika: ha `file` van, most töltjük fel; ha nincs, de `url` már megvan
      // (piszkozat szerkesztése), azt tartjuk meg; ha egyik sincs, `null` kerül a payloadba.
      let carVerticalPdfUrl: string | null = serviceHistory.carVerticalPdf.url;
      if (serviceHistory.carVerticalPdf.file) {
        const pdfFile = serviceHistory.carVerticalPdf.file;
        const safeName = pdfFile.name.replace(/[^a-zA-Z0-9._-]/g, '_');
        const path = `${user.id}/${inspectionId}/service/carvertical-${crypto.randomUUID()}-${safeName}`;
        const { error: pdfUploadError } = await supabase.storage
          .from('inspection-media')
          .upload(path, pdfFile, { upsert: true });
        if (pdfUploadError) throw pdfUploadError;
        carVerticalPdfUrl = supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
      }

      // Csak a ténylegesen kitöltött (legalább dátum/km óra állás/típus valamelyike megadott)
      // idővonal-bejegyzések kerülnek mentésre -- egy üresen otthagyott "+ Új bejegyzés"
      // kártya nem hoz létre üres sort a JSONB tömbben.
      const serviceHistoryPayload = {
        status: serviceHistory.status,
        photos: serviceHistoryPhotoUrls,
        carvertical_pdf_url: carVerticalPdfUrl,
        carvertical_pdf_name: carVerticalPdfUrl ? serviceHistory.carVerticalPdf.fileName : null,
        entries: serviceHistory.entries
          .filter(
            (entry) =>
              entry.date.trim() !== '' || entry.mileage.trim() !== '' || entry.type.trim() !== '' || entry.notes.trim() !== ''
          )
          .map((entry) => ({
            id: entry.id,
            date: entry.date,
            // A megadott ServiceHistory TS típus szerint `mileage: number` (nem opcionális) --
            // ha a user üresen hagyta, 0-val mentjük, hogy a mező mindig szám maradjon.
            mileage: entry.mileage.trim() === '' ? 0 : Number(entry.mileage),
            type: entry.type,
            notes: entry.notes || undefined,
          })),
      };

      // Diagnosztika (3 új szakértői modul, A pont): ha "OBD Tiszta" be van pipálva, a
      // `codes` mentéskor MINDIG üresen kerül be, függetlenül attól, hogy a checkbox
      // kikapcsolása előtt volt-e már beírt (majd elrejtett) hibakód-sor a UI-ban.
      const diagnosticsPayload = diagnostics.noDtc
        ? { no_dtc: true, codes: [] }
        : {
            no_dtc: false,
            codes: diagnostics.codes
              .filter((entry) => entry.code.trim() !== '')
              .map((entry) => ({ code: entry.code, description: entry.description })),
          };

      // Felszereltség -- UX teljes újratervezés (2026-08-02): a teljes katalógust mentjük
      // (a `not_present` állapotú elemeket is), hogy a publikus riport mátrixa mindig
      // ugyanazt a fix listát tudja megjeleníteni. A hibafotó feltöltése PONTOSAN ugyanazt
      // a "blob vs. már feltöltött Storage URL" mintát követi, mint a hiba-/sérülés-média
      // -- csak a most kiválasztott (`file !== null`) fotók töltődnek fel most, piszkozat
      // szerkesztésekor a már meglévő URL-eket (`previewUrl`, NEM `blob:`) csak megtartjuk.
      // `notes`/`photo_url` KIZÁRÓLAG `status === 'defective'` esetén kerül be a mentett
      // objektumba -- ha a user egy korábban hibásra jelölt, majd visszaállított
      // (működő/nincs benne) elemhez írt megjegyzést/fotót, az a mentéskor eldobódik,
      // mert a `FeatureState` DB-alak szerint ezek csak defektnél értelmezettek.
      const equipmentPayload = await Promise.all(
        equipment.map(async (item) => {
          const base: { id: string; status: typeof item.status; notes?: string; photo_url?: string } = {
            id: item.id,
            status: item.status,
          };
          if (item.status !== 'defective') return base;

          if (item.notes.trim() !== '') base.notes = item.notes;

          if (item.file) {
            const safeName = item.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/${inspectionId}/equipment/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from('inspection-media')
              .upload(path, item.file, { upsert: true });
            if (uploadError) throw uploadError;
            base.photo_url = supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
          } else if (item.previewUrl && !item.previewUrl.startsWith('blob:')) {
            base.photo_url = item.previewUrl;
          }

          return base;
        })
      );

      // Gumiabroncsok (C pont): mind a 4 pozíciót mentjük, üres/hiányos mezőknél `null`-lal --
      // a `mm` numerikus, a `dot` KIZÁRÓLAG akkor kerül be, ha a 4 számjegyű kód formailag ÉS
      // tartalmilag is érvényes (`isValidDot` -- hét 01-53, év a jelenlegi évig) -- lásd
      // "DOT szám szigorú validációja" lépés: a `StepTires.tsx` már blokkolja a "Tovább"
      // gombot érvénytelen DOT-nál, ez itt egy második, szerver felé induló védelmi vonal,
      // hogy szerkesztés közbeni bármilyen state-anomália se juttathasson érvénytelen DOT-ot
      // a DB-be.
      // Felni típusa & Gumiabroncs márkája (Gumiabroncs & Felni modul bővítése, A pont) --
      // ÁLTALÁNOS mezők, a `fl`/`fr`/`rl`/`rr` kulcsok TESTVÉREKÉNT kerülnek be ugyanabba
      // a `tires` JSONB oszlopba (nincs szükség séma-migrációra, a JSONB rugalmas). A
      // `brand` mindig a VÉGLEGES, megjelenítendő márkanevet tárolja (preset VAGY a
      // szabad szöveges "Egyéb" érték) -- betöltéskor (app/inspections/[id]/page.tsx
      // `toInitialTireGeneralInfo`) ismét szétválik `brand`/`customBrand`-re.
      const resolvedTireBrand =
        tireGeneralInfo.brand === TIRE_BRAND_OTHER
          ? tireGeneralInfo.customBrand.trim() || null
          : tireGeneralInfo.brand.trim() || null;

      // Sérülés- és Hibatérkép modul -- fotó feltöltés pontonként: PONTOSAN ugyanaz a
      // "blob vs. már feltöltött Storage URL" minta, mint a hiba-médiánál lentebb -- csak a
      // most kiválasztott (`file !== null`) fotók töltődnek fel most, piszkozat
      // szerkesztésekor a már meglévő Storage URL-eket (`previewUrl`, NEM `blob:`) csak
      // megtartjuk. A `damages` egyetlen JSONB oszlop az `inspections` sorban (nincs
      // gyerek-tábla, ugyanaz az elv, mint a `general_photos`/`diagnostics`/`equipment`/
      // `tires`-nél), ezért nincs szükség külön törlés+beszúrás ciklusra -- az UPSERT
      // egyszerűen felülírja a teljes tömböt a jelenlegi state-nek megfelelően.
      const damagesPayload = await Promise.all(
        damages.map(async (damage) => {
          let photoUrl: string | null = null;
          if (damage.file) {
            const safeName = damage.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
            const path = `${user.id}/${inspectionId}/damages/${crypto.randomUUID()}-${safeName}`;
            const { error: uploadError } = await supabase.storage
              .from('inspection-media')
              .upload(path, damage.file, { upsert: true });
            if (uploadError) throw uploadError;
            photoUrl = supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
          } else if (damage.previewUrl && !damage.previewUrl.startsWith('blob:')) {
            photoUrl = damage.previewUrl;
          }
          return {
            id: damage.id,
            x: damage.x,
            y: damage.y,
            type: damage.type,
            title: damage.title,
            description: damage.description,
            photo_url: photoUrl,
          };
        })
      );

      const tiresPayload = {
        rim_type: tireGeneralInfo.rimType || null,
        brand: resolvedTireBrand,
        fl: { mm: tires.fl.mm.trim() === '' ? null : Number(tires.fl.mm), dot: isValidDot(tires.fl.dot) ? tires.fl.dot : null },
        fr: { mm: tires.fr.mm.trim() === '' ? null : Number(tires.fr.mm), dot: isValidDot(tires.fr.dot) ? tires.fr.dot : null },
        rl: { mm: tires.rl.mm.trim() === '' ? null : Number(tires.rl.mm), dot: isValidDot(tires.rl.dot) ? tires.rl.dot : null },
        rr: { mm: tires.rr.mm.trim() === '' ? null : Number(tires.rr.mm), dot: isValidDot(tires.rr.dot) ? tires.rr.dot : null },
      };

      // Végső Szakvélemény & Várható Költségek modul -- TELJESEN OPCIONÁLIS, minden mező
      // `null`/üres marad, ha a vizsgáló nem töltötte ki. A két költség-mező üres stringnél
      // `null`-lá alakul (NEM 0-vá, mert a 0 Ft egy valós, félrevezető érték lenne egy
      // "nincs megadva" állapotra) -- ellentétben pl. a Szervizmúlt idővonal `mileage`
      // mezőjével, aminél a megadott TS típus `number` (nem opcionális). Nincs szükség
      // külön törlés+beszúrás ciklusra, mint a `paint_measurements`/`defects` gyerek-
      // tábláknál -- ez is egyetlen JSONB oszlop, az UPSERT egyszerűen felülírja.
      const finalAssessmentPayload = {
        recommendation: finalAssessment.recommendation,
        estimated_cost_min: finalAssessment.estimatedCostMin.trim() === '' ? null : Number(finalAssessment.estimatedCostMin),
        estimated_cost_max: finalAssessment.estimatedCostMax.trim() === '' ? null : Number(finalAssessment.estimatedCostMax),
        cost_notes: finalAssessment.costNotes.trim() === '' ? null : finalAssessment.costNotes,
        summary_text: finalAssessment.summaryText.trim() === '' ? null : finalAssessment.summaryText,
      };

      const { data: inspectionRow, error: inspectionError } = await supabase
        .from('inspections')
        .upsert({
          id: inspectionId,
          user_id: user.id,
          organization_id: organizationId,
          created_by: user.id,
          // Átvizsgáló és Ügyfél adatok (2026-08-06) -- az `inspector_id` MINDIG a
          // mentést ténylegesen végrehajtó bejelentkezett userre áll, automatikusan
          // (nincs hozzá szerkeszthető UI-mező). Az `inspector_name` ezzel szemben
          // OPCIONÁLIS, kézzel szerkeszthető felülírás (lásd `ClientInfoState` JSDoc-ját
          // a `lib/inspections/types.ts`-ben) -- üresen `null`-lá alakul, ilyenkor a
          // `get_public_report` RPC automatikusan levezetett névre esik vissza. A
          // `client_*` mezők üresen szintén `null`-lá alakulnak (ugyanaz a "üres
          // string -> null" minta, mint pl. a `finalAssessmentPayload`-nál), a 2
          // kapcsoló (`show_*_on_pdf`) közvetlenül a `clientInfo` state-ből kerül be.
          inspector_id: user.id,
          inspector_name: clientInfo.inspectorName.trim() || null,
          client_name: clientInfo.clientName.trim() || null,
          client_phone: clientInfo.clientPhone.trim() || null,
          client_email: clientInfo.clientEmail.trim() || null,
          show_inspector_on_pdf: clientInfo.showInspectorOnPdf,
          show_client_on_pdf: clientInfo.showClientOnPdf,
          car_brand: carInfo.carBrand || null,
          car_model: carInfo.carModel || null,
          year: carInfo.year ? Number(carInfo.year) : null,
          vin: carInfo.vin || null,
          license_plate: carInfo.licensePlate || null,
          license_plate_country: carInfo.licensePlateCountry || DEFAULT_LICENSE_PLATE_COUNTRY,
          odometer: carInfo.odometer ? Number(carInfo.odometer) : null,
          general_photos: generalPhotoUrls,
          service_history: serviceHistoryPayload,
          diagnostics: diagnosticsPayload,
          equipment: equipmentPayload,
          tires: tiresPayload,
          damages: damagesPayload,
          final_assessment: finalAssessmentPayload,
          status,
        })
        .select('public_token')
        .single();

      if (inspectionError) throw inspectionError;

      // VIZSGÁLATI KVÓTA LEVONÁS (PROJEKT_INSTRUKCIOK.md "Keret-ellenőrző és fogyasztó
      // logika" lépés, 2026-08-04) -- KIZÁRÓLAG egy VADONATÚJ vizsgálat ELSŐ sikeres
      // mentésekor (`!isEditMode`, lásd a komponens tetején lévő `isEditMode` definíciót),
      // hogy egy piszkozat TÖBBSZÖRI újramentése (Vissza/Tovább közben, majd végül
      // Publikálás) ne fogyasszon el több keretet egyetlen vizsgálatért. A tényleges
      // "van-e egyáltalán keret" ELLENŐRZÉS/BLOKKOLÁS korábban, az `/inspections/new`
      // oldal betöltésekor már megtörtént (lásd `app/inspections/new/page.tsx`
      // `checkInspectionQuota`-hívását) -- ez itt a MÁR ellenőrzött keret tényleges,
      // szerver-oldali levonása (`/api/inspections/consume-quota`, mert ez a komponens
      // kliens-oldalon fut, a `lib/quotas.ts` szerver-only). Szándékosan best-effort: ha a
      // levonás hibázna (pl. egy szűk race-condition-ablakban két böngészőfül egyszerre
      // menti az utolsó szabad keretet), a hibát logoljuk, DE a MÁR sikeresen elmentett
      // vizsgálatot nem dobjuk el emiatt -- ugyanaz az elv, mint a `deductCredits`/
      // `lib/credits.ts` "kredit levonás a sikeres AI-hívás UTÁN, hiba esetén csak logolva"
      // mintájánál.
      if (!isEditMode) {
        try {
          const quotaResponse = await fetch('/api/inspections/consume-quota', { method: 'POST' });
          if (!quotaResponse.ok) {
            console.error('[InspectionWizard] Vizsgálati kvóta levonása sikertelen:', await quotaResponse.text());
          }
        } catch (quotaError) {
          console.error('[InspectionWizard] Vizsgálati kvóta levonása sikertelen:', quotaError);
        }
      }

      // Piszkozat szerkesztésekor a korábbi mérés-/hiba-sorok a jelenlegi state-tel NEM
      // egyeznek meg 1:1 (a wizard nem tartja nyilván az egyes DB row id-kat, csak a
      // kliens-oldali `clientId`-t) -- ezért a legegyszerűbb és legbiztonságosabb út a
      // teljes gyerek-sor-halmaz törlése, majd újbóli beszúrása. Új vizsgálatnál ez a
      // törlés no-op (még nincs semmi az `inspectionId`-hez), szerkesztésnél pedig
      // garantáltan nem hoz létre duplikátumokat.
      const { error: paintDeleteError } = await supabase
        .from('paint_measurements')
        .delete()
        .eq('inspection_id', inspectionId);
      if (paintDeleteError) throw paintDeleteError;

      // Szabadkézi (free-form) mérési pontok (Rétegvastagság-mérő "Szabadkézi (Free-form
      // Canvas)" átalakítása) -- minden felvett pont egy önálló sor `id`/`x`/`y`/`value`
      // mezőkkel, nincs többé fix karosszéria-elem/3-pontos átlagolás. Az `id`-t a
      // kliens generálja (`crypto.randomUUID()`, lásd `PaintCanvas.tsx`), és a beszúráskor
      // is ugyanaz az érték kerül a sorba, hogy a UI és a DB sor 1:1 megfeleljen.
      if (paintMeasurements.length > 0) {
        const { error: paintError } = await supabase.from('paint_measurements').insert(
          paintMeasurements.map((point) => ({
            id: point.id,
            inspection_id: inspectionId,
            user_id: user.id,
            x: point.x,
            y: point.y,
            value: point.value,
          }))
        );
        if (paintError) throw paintError;
      }

      const { error: defectsDeleteError } = await supabase
        .from('defects')
        .delete()
        .eq('inspection_id', inspectionId);
      if (defectsDeleteError) throw defectsDeleteError;

      if (relevantDefects.length > 0) {
        const defectRows = await Promise.all(
          relevantDefects.map(async (defect) => {
            let mediaUrl: string | null = null;
            if (defect.file) {
              const safeName = defect.file.name.replace(/[^a-zA-Z0-9._-]/g, '_');
              const path = `${user.id}/${inspectionId}/${crypto.randomUUID()}-${safeName}`;
              const { error: uploadError } = await supabase.storage
                .from('inspection-media')
                .upload(path, defect.file, { upsert: true });
              if (uploadError) throw uploadError;
              mediaUrl = supabase.storage.from('inspection-media').getPublicUrl(path).data.publicUrl;
            } else if (defect.previewUrl && !defect.previewUrl.startsWith('blob:')) {
              // Piszkozat szerkesztésekor a korábban már feltöltött médiát (a `previewUrl`
              // ilyenkor a Storage publikus URL-je, NEM egy kliens-oldali `blob:` object URL)
              // nem töltjük fel újra -- csak az URL-t hivatkozzuk az újra beszúrt sorban.
              mediaUrl = defect.previewUrl;
            }
            return {
              inspection_id: inspectionId,
              user_id: user.id,
              category: defect.category || 'Egyéb',
              description: defect.description,
              media_url: mediaUrl,
            };
          })
        );

        const { error: defectsError } = await supabase.from('defects').insert(defectRows);
        if (defectsError) throw defectsError;
      }

      if (status === 'draft') {
        router.push('/dashboard');
      } else {
        router.push(`/dashboard?published=${inspectionRow?.public_token ?? ''}`);
      }
    } catch (err) {
      // Best-effort rollback -- KIZÁRÓLAG új vizsgálatnál (nem szerkesztésnél)! Ha a wizard
      // egy MEGLÉVŐ piszkozatot szerkeszt (`isEditMode`), a sorok már a mentési kísérlet
      // előtt is léteztek -- ilyenkor a törlés nem "vissza", hanem VÉGLEGESEN elveszítené a
      // korábban elmentett vizsgálatot egyetlen sikertelen mentési próbálkozás miatt. Új
      // vizsgálatnál viszont biztonságos: az `inspectionId` ebben a munkamenetben született,
      // szóval a törlés csak a most félbemaradt beszúrásokat takarítja el, hogy a user hibaüzenet
      // után ugyanazzal az adattal, duplikáció nélkül tudja újra megnyomni a mentés gombot.
      if (!isEditMode) {
        await supabase.from('defects').delete().eq('inspection_id', inspectionId);
        await supabase.from('paint_measurements').delete().eq('inspection_id', inspectionId);
        await supabase.from('inspections').delete().eq('id', inspectionId);
      }

      setSubmitError(
        isEditMode
          ? (err instanceof Error ? err.message : 'Váratlan hiba történt a mentés közben.') +
              ' A korábban elmentett adatok megmaradtak -- próbáld újra menteni.'
          : err instanceof Error
            ? err.message
            : 'Váratlan hiba történt a mentés közben. Próbáld újra.'
      );
      setIsSubmitting(false);
    }
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 pb-28 sm:px-6 sm:py-10 sm:pb-32">
      <StepIndicator current={step} />

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 sm:p-7">
        {step === 1 && (
          <StepCarInfo
            value={carInfo}
            onChange={setCarInfo}
            onNext={() => setStep(2)}
            nextLabel={NEXT_STEP_SHORT_LABEL[2]}
          />
        )}
        {step === 2 && (
          <StepGeneralPhotos
            value={generalPhotos}
            onChange={setGeneralPhotos}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
            nextLabel={NEXT_STEP_SHORT_LABEL[3]}
          />
        )}
        {step === 3 && (
          <StepServiceHistory
            value={serviceHistory}
            onChange={setServiceHistory}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel={NEXT_STEP_SHORT_LABEL[4]}
          />
        )}
        {step === 4 && (
          <StepDiagnostics
            value={diagnostics}
            onChange={setDiagnostics}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            nextLabel={NEXT_STEP_SHORT_LABEL[5]}
          />
        )}
        {step === 5 && (
          <StepEquipment
            value={equipment}
            onChange={setEquipment}
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
            nextLabel={NEXT_STEP_SHORT_LABEL[6]}
          />
        )}
        {step === 6 && (
          <StepTires
            value={tires}
            onChange={setTires}
            generalInfo={tireGeneralInfo}
            onGeneralInfoChange={setTireGeneralInfo}
            onBack={() => setStep(5)}
            onNext={() => setStep(7)}
            nextLabel={NEXT_STEP_SHORT_LABEL[7]}
          />
        )}
        {step === 7 && (
          <StepPaintMeasurements
            value={paintMeasurements}
            onChange={setPaintMeasurements}
            onBack={() => setStep(6)}
            onNext={() => setStep(8)}
            nextLabel={NEXT_STEP_SHORT_LABEL[8]}
          />
        )}
        {step === 8 && (
          <StepDamageMap
            value={damages}
            onChange={setDamages}
            onBack={() => setStep(7)}
            onNext={() => setStep(9)}
            nextLabel={NEXT_STEP_SHORT_LABEL[9]}
          />
        )}
        {step === 9 && (
          <StepDefects
            value={defects}
            onChange={setDefects}
            onBack={() => setStep(8)}
            onNext={() => setStep(10)}
            nextLabel={NEXT_STEP_SHORT_LABEL[10]}
          />
        )}
        {step === 10 && (
          <StepFinalAssessment
            value={finalAssessment}
            onChange={setFinalAssessment}
            onBack={() => setStep(9)}
            onNext={() => setStep(11)}
            nextLabel={NEXT_STEP_SHORT_LABEL[11]}
            aiSummaryContext={{
              carInfo,
              diagnostics,
              equipment,
              tires,
              tireGeneralInfo,
              paintMeasurements,
              damages,
              defects: defects.filter(
                (defect) => defect.category.trim() !== '' || defect.description.trim() !== '' || defect.file
              ),
            }}
          />
        )}
        {step === 11 && (
          <StepSummary
            carInfo={carInfo}
            generalPhotoCount={generalPhotos.length}
            serviceHistory={serviceHistory}
            diagnostics={diagnostics}
            equipment={equipment}
            tires={tires}
            tireGeneralInfo={tireGeneralInfo}
            paintMeasurements={paintMeasurements}
            damages={damages}
            defects={defects.filter(
              (defect) => defect.category.trim() !== '' || defect.description.trim() !== '' || defect.file
            )}
            finalAssessment={finalAssessment}
            clientInfo={clientInfo}
            onClientInfoChange={setClientInfo}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onBack={() => setStep(10)}
            onSaveDraft={() => handleSubmit('draft')}
            onPublish={() => handleSubmit('completed')}
          />
        )}
      </div>

      {/* Rögzített alsó navigációs sáv (Vissza/Tovább, ill. az utolsó lépésnél
          Vissza/Piszkozat/Publikálás) -- a cél-elem MINDIG jelen van a DOM-ban, a
          tényleges gombokat az aktív `Step*.tsx` portál-lal rajzolja bele, lásd
          `WizardBottomBar.tsx` JSDoc-ját. */}
      <div
        id="wizard-bottom-bar"
        className="fixed bottom-0 left-0 z-50 w-full border-t border-linear-hairline bg-linear-surface-1/95 py-3 backdrop-blur supports-[backdrop-filter]:bg-linear-surface-1/80"
        style={{ paddingBottom: 'max(0.75rem, env(safe-area-inset-bottom))' }}
      />
    </div>
  );
}
