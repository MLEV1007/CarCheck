'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { createClient } from '@/lib/supabase/client';
import { StepIndicator } from '@/components/inspections/wizard/StepIndicator';
import { StepCarInfo } from '@/components/inspections/wizard/StepCarInfo';
import { StepPaintMeasurements } from '@/components/inspections/wizard/StepPaintMeasurements';
import { StepDefects } from '@/components/inspections/wizard/StepDefects';
import { StepSummary } from '@/components/inspections/wizard/StepSummary';
import { PAINT_PANELS, getPaintStatus } from '@/lib/inspections/constants';
import {
  EMPTY_CAR_INFO,
  EMPTY_DEFECT,
  type CarInfoState,
  type DefectState,
  type PaintMeasurementState,
  type WizardStep,
} from '@/lib/inspections/types';

const STEP_LABELS: Record<WizardStep, string> = {
  1: 'Autó adatok',
  2: 'Festékvastagság-mérés',
  3: 'Hibák & Média',
  4: 'Összegzés & Publikálás',
};

interface InspectionWizardProps {
  /** Meglévő piszkozat folytatásakor a `/inspections/[id]` route adja át -- ha nincs megadva, új UUID generálódik (új vizsgálat). */
  inspectionId?: string;
  initialCarInfo?: CarInfoState;
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
 * média-feltöltései és a végleges mentés (4. lépés) ugyanarra a sorra hivatkozzanak. Ha meg
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
  initialPaintMeasurements,
  initialDefects,
}: InspectionWizardProps = {}) {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [carInfo, setCarInfo] = useState<CarInfoState>(initialCarInfo ?? EMPTY_CAR_INFO);
  const [paintMeasurements, setPaintMeasurements] = useState<PaintMeasurementState[]>(
    initialPaintMeasurements ?? PAINT_PANELS.map((elementName) => ({ elementName, micronValue: '' }))
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

      const filledPaint = paintMeasurements.filter((panel) => panel.micronValue.trim() !== '');
      if (filledPaint.length > 0) {
        const { error: paintError } = await supabase.from('paint_measurements').insert(
          filledPaint.map((panel) => {
            const micron = Number(panel.micronValue);
            return {
              inspection_id: inspectionId,
              user_id: user.id,
              element_name: panel.elementName,
              micron_value: micron,
              status: getPaintStatus(micron),
            };
          })
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
        {step}. lépés / 4 · {STEP_LABELS[step]}
      </p>

      <div className="rounded-lg border border-linear-hairline bg-linear-surface-1 p-5 sm:p-7">
        {step === 1 && <StepCarInfo value={carInfo} onChange={setCarInfo} onNext={() => setStep(2)} />}
        {step === 2 && (
          <StepPaintMeasurements
            value={paintMeasurements}
            onChange={setPaintMeasurements}
            onBack={() => setStep(1)}
            onNext={() => setStep(3)}
          />
        )}
        {step === 3 && (
          <StepDefects value={defects} onChange={setDefects} onBack={() => setStep(2)} onNext={() => setStep(4)} />
        )}
        {step === 4 && (
          <StepSummary
            carInfo={carInfo}
            paintMeasurements={paintMeasurements}
            defects={defects.filter(
              (defect) => defect.category.trim() !== '' || defect.description.trim() !== '' || defect.file
            )}
            isSubmitting={isSubmitting}
            submitError={submitError}
            onBack={() => setStep(3)}
            onSaveDraft={() => handleSubmit('draft')}
            onPublish={() => handleSubmit('completed')}
          />
        )}
      </div>
    </div>
  );
}
