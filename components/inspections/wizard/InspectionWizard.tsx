'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StepIndicator } from '@/components/inspections/wizard/StepIndicator';
import { StepCarInfo } from '@/components/inspections/wizard/StepCarInfo';
import { StepGeneralPhotos } from '@/components/inspections/wizard/StepGeneralPhotos';
import { StepDiagnostics } from '@/components/inspections/wizard/StepDiagnostics';
import { StepEquipment } from '@/components/inspections/wizard/StepEquipment';
import { StepTires } from '@/components/inspections/wizard/StepTires';
import { StepPaintMeasurements } from '@/components/inspections/wizard/StepPaintMeasurements';
import { StepDefects } from '@/components/inspections/wizard/StepDefects';
import { StepSummary } from '@/components/inspections/wizard/StepSummary';
import {
  EQUIPMENT_ITEMS,
  PAINT_PANELS,
  TIRE_BRAND_OTHER,
  TOTAL_WIZARD_STEPS,
  WIZARD_STEP_META,
  getPaintPanelAverage,
  getPaintStatus,
} from '@/lib/inspections/constants';
import { isValidDot } from '@/lib/inspections/tireDot';
import {
  EMPTY_CAR_INFO,
  EMPTY_DEFECT,
  EMPTY_DIAGNOSTICS,
  EMPTY_PAINT_MEASUREMENT,
  EMPTY_TIRE_GENERAL_INFO,
  EMPTY_TIRES,
  type CarInfoState,
  type DefectState,
  type DiagnosticsState,
  type EquipmentItemState,
  type GeneralPhotoState,
  type PaintMeasurementState,
  type TireGeneralInfoState,
  type TiresState,
  type WizardStep,
} from '@/lib/inspections/types';

/** A hosszú (mobil "X / 8 lépés · Cím" szöveghez) és rövid (Vissza/Tovább gomb-felirathoz)
 * lépés-címkék EGYETLEN forrása -- lásd `WIZARD_STEP_META` a `constants.ts`-ben a teljes
 * indoklásért ("Dinamikus Tovább gomb felirat" lépés). */
const STEP_LABELS: Record<WizardStep, string> = Object.fromEntries(
  WIZARD_STEP_META.map(({ step, longLabel }) => [step, longLabel])
) as Record<WizardStep, string>;

const NEXT_STEP_SHORT_LABEL: Record<WizardStep, string> = Object.fromEntries(
  WIZARD_STEP_META.map(({ step, shortLabel }) => [step, shortLabel])
) as Record<WizardStep, string>;

function defaultEquipment(): EquipmentItemState[] {
  return EQUIPMENT_ITEMS.map((name) => ({ name, status: 'na' as const }));
}

interface InspectionWizardProps {
  /** Meglévő piszkozat folytatásakor a `/inspections/[id]` route adja át -- ha nincs megadva, új UUID generálódik (új vizsgálat). */
  inspectionId?: string;
  initialCarInfo?: CarInfoState;
  initialGeneralPhotos?: GeneralPhotoState[];
  initialDiagnostics?: DiagnosticsState;
  initialEquipment?: EquipmentItemState[];
  initialTires?: TiresState;
  initialTireGeneralInfo?: TireGeneralInfoState;
  initialPaintMeasurements?: PaintMeasurementState[];
  initialDefects?: DefectState[];
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
  initialGeneralPhotos,
  initialDiagnostics,
  initialEquipment,
  initialTires,
  initialTireGeneralInfo,
  initialPaintMeasurements,
  initialDefects,
}: InspectionWizardProps = {}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [carInfo, setCarInfo] = useState<CarInfoState>(initialCarInfo ?? EMPTY_CAR_INFO);
  const [generalPhotos, setGeneralPhotos] = useState<GeneralPhotoState[]>(initialGeneralPhotos ?? []);
  const [diagnostics, setDiagnostics] = useState<DiagnosticsState>(initialDiagnostics ?? EMPTY_DIAGNOSTICS);
  const [equipment, setEquipment] = useState<EquipmentItemState[]>(initialEquipment ?? defaultEquipment());
  const [tires, setTires] = useState<TiresState>(initialTires ?? EMPTY_TIRES);
  const [tireGeneralInfo, setTireGeneralInfo] = useState<TireGeneralInfoState>(
    initialTireGeneralInfo ?? EMPTY_TIRE_GENERAL_INFO
  );
  const [paintMeasurements, setPaintMeasurements] = useState<PaintMeasurementState[]>(
    initialPaintMeasurements ?? PAINT_PANELS.map((elementName) => EMPTY_PAINT_MEASUREMENT(elementName))
  );
  const [defects, setDefects] = useState<DefectState[]>(initialDefects ?? [EMPTY_DEFECT()]);
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

      // Felszereltség (B pont): a teljes katalógust mentjük (a `na` állapotú elemeket is),
      // hogy a publikus riport mátrixa mindig ugyanazt a fix listát tudja megjeleníteni.
      const equipmentPayload = equipment.map((item) => ({ name: item.name, status: item.status }));

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

      const tiresPayload = {
        rim_type: tireGeneralInfo.rimType || null,
        brand: resolvedTireBrand,
        fl: { mm: tires.fl.mm.trim() === '' ? null : Number(tires.fl.mm), dot: isValidDot(tires.fl.dot) ? tires.fl.dot : null },
        fr: { mm: tires.fr.mm.trim() === '' ? null : Number(tires.fr.mm), dot: isValidDot(tires.fr.dot) ? tires.fr.dot : null },
        rl: { mm: tires.rl.mm.trim() === '' ? null : Number(tires.rl.mm), dot: isValidDot(tires.rl.dot) ? tires.rl.dot : null },
        rr: { mm: tires.rr.mm.trim() === '' ? null : Number(tires.rr.mm), dot: isValidDot(tires.rr.dot) ? tires.rr.dot : null },
      };

      const { data: inspectionRow, error: inspectionError } = await supabase
        .from('inspections')
        .upsert({
          id: inspectionId,
          user_id: user.id,
          car_brand: carInfo.carBrand || null,
          car_model: carInfo.carModel || null,
          year: carInfo.year ? Number(carInfo.year) : null,
          vin: carInfo.vin || null,
          license_plate: carInfo.licensePlate || null,
          odometer: carInfo.odometer ? Number(carInfo.odometer) : null,
          general_photos: generalPhotoUrls,
          diagnostics: diagnosticsPayload,
          equipment: equipmentPayload,
          tires: tiresPayload,
          status,
        })
        .select('public_token')
        .single();

      if (inspectionError) throw inspectionError;

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

      // Elemenkénti 3 mérési pont & átlag (Rétegvastagság-mérő modul újratervezése, A pont)
      // -- KIZÁRÓLAG a mindhárom ponttal rendelkező elemek kerülnek mentésre, ugyanúgy,
      // ahogy korábban az üresen hagyott (egy-mezős) elemek sem kerültek be. A `micron_value`
      // oszlop az elem ÁTLAGÁT tárolja (a `status` is ebből számolódik), a 3 nyers pont
      // (`point_1`/`point_2`/`point_3`) külön oszlopokban -- így a riport mindkét szintet
      // (átlag + részletes pontok) meg tudja jeleníteni.
      const filledPaint = paintMeasurements
        .map((panel) => ({ panel, average: getPaintPanelAverage(panel) }))
        .filter((entry): entry is { panel: PaintMeasurementState; average: number } => entry.average !== null);

      if (filledPaint.length > 0) {
        const { error: paintError } = await supabase.from('paint_measurements').insert(
          filledPaint.map(({ panel, average }) => ({
            inspection_id: inspectionId,
            user_id: user.id,
            element_name: panel.elementName,
            micron_value: average,
            point_1: Number(panel.p1),
            point_2: Number(panel.p2),
            point_3: Number(panel.p3),
            status: getPaintStatus(average),
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
    <div className="mx-auto flex max-w-3xl flex-col gap-5 px-4 py-8 sm:px-6 sm:py-10">
      <StepIndicator current={step} />
      <p className="-mt-1 text-[13px] font-medium text-linear-ink-subtle sm:hidden">
        {step}. lépés / {TOTAL_WIZARD_STEPS} · {STEP_LABELS[step]}
      </p>

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
          <StepDiagnostics
            value={diagnostics}
            onChange={setDiagnostics}
            onBack={() => setStep(2)}
            onNext={() => setStep(4)}
            nextLabel={NEXT_STEP_SHORT_LABEL[4]}
          />
        )}
        {step === 4 && (
          <StepEquipment
            value={equipment}
            onChange={setEquipment}
            onBack={() => setStep(3)}
            onNext={() => setStep(5)}
            nextLabel={NEXT_STEP_SHORT_LABEL[5]}
          />
        )}
        {step === 5 && (
          <StepTires
            value={tires}
            onChange={setTires}
            generalInfo={tireGeneralInfo}
            onGeneralInfoChange={setTireGeneralInfo}
            onBack={() => setStep(4)}
            onNext={() => setStep(6)}
            nextLabel={NEXT_STEP_SHORT_LABEL[6]}
          />
        )}
        {step === 6 && (
          <StepPaintMeasurements
            value={paintMeasurements}
            onChange={setPaintMeasurements}
            onBack={() => setStep(5)}
            onNext={() => setStep(7)}
            nextLabel={NEXT_STEP_SHORT_LABEL[7]}
          />
        )}
        {step === 7 && (
          <StepDefects
            value={defects}
            onChange={setDefects}
            onBack={() => setStep(6)}
            onNext={() => setStep(8)}
            nextLabel={NEXT_STEP_SHORT_LABEL[8]}
          />
        )}
        {step === 8 && (
          <StepSummary
            carInfo={carInfo}
            generalPhotoCount={generalPhotos.length}
            diagnostics={diagnostics}
            equipment={equipment}
            tires={tires}
            tireGeneralInfo={tireGeneralInfo}
            paintMeasurements={paintMeasurements}
            defects={defects.filter(
              (defect) => defect.category.trim() !== '' || defect.description.trim() !== '' || defect.file
            )}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onBack={() => setStep(7)}
            onSaveDraft={() => handleSubmit('draft')}
            onPublish={() => handleSubmit('completed')}
          />
        )}
      </div>
    </div>
  );
}
