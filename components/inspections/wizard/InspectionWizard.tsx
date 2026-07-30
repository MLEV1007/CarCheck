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

/**
 * Több lépésből álló wizard az új vizsgálat rögzítéséhez
 * (PROJEKT_INSTRUKCIOK.md 5.B: Szakértői Dashboard & Űrlap -- Linear Dark Design Style).
 *
 * Az `inspectionId`-t kliens-oldalon generáljuk (crypto.randomUUID()) már a wizard
 * megnyitásakor, hogy a 3. lépés média-feltöltései és a végleges mentés (4. lépés)
 * ugyanarra a sorra hivatkozzanak -- a tényleges INSERT csak a "Mentés piszkozatként"
 * / "Publikálás" gombnál történik meg, a lépések között minden állapot csak a
 * React state-ben él.
 */
export function InspectionWizard() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>(1);
  const [carInfo, setCarInfo] = useState<CarInfoState>(EMPTY_CAR_INFO);
  const [paintMeasurements, setPaintMeasurements] = useState<PaintMeasurementState[]>(
    PAINT_PANELS.map((elementName) => ({ elementName, micronValue: '' }))
  );
  const [defects, setDefects] = useState<DefectState[]>([EMPTY_DEFECT()]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [inspectionId] = useState<string>(() => crypto.randomUUID());

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
      // Best-effort rollback: ha bármelyik lépés elbukik, töröljük a már beszúrt
      // sorokat, hogy a user hibaüzenet után ugyanazzal az adattal, duplikáció
      // nélkül tudja újra megnyomni a mentés gombot.
      await supabase.from('defects').delete().eq('inspection_id', inspectionId);
      await supabase.from('paint_measurements').delete().eq('inspection_id', inspectionId);
      await supabase.from('inspections').delete().eq('id', inspectionId);

      setSubmitError(err instanceof Error ? err.message : 'Váratlan hiba történt a mentés közben. Próbáld újra.');
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
