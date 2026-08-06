'use client';

import { createContext, useContext, type ReactNode } from 'react';

const InspectionIdContext = createContext<string | null>(null);

/**
 * A wizard-munkamenet aktuális `inspectionId`-ját teszi elérhetővé a mélyen beágyazott,
 * AI-hívó komponenseknek (`StepCarInfo`/`StepEquipment`/`StepFinalAssessment`/
 * `StepServiceHistory`/`VoiceInputButton`) prop-drilling NÉLKÜL -- ugyanaz az elv, mint az
 * `InsufficientCreditsProvider.tsx`-nél (lásd annak JSDoc-ját).
 *
 * **Miért Context, nem props:** a `VoiceInputButton` (és ezzel a `/api/ai/fix-grammar`
 * hívás, lásd "1 AI kredit = 1 vizsgálat", `lib/inspectionAiCredit.ts`) a
 * `FormControls.tsx` `TextField`-jén keresztül SZÁMOS wizard-lépésben megjelenik
 * (`StepSummary`/`StepTires`/`StepEquipment`/`StepServiceHistory`/`StepCarInfo`/
 * `StepFinalAssessment`/`StepDefects`/`StepDiagnostics`) -- egy props-alapú megoldás ezt a
 * teljes láncot módosítaná (`FormControls.tsx` + mind a 8 Step-komponens), pusztán azért,
 * hogy egy 5-6 rétegnyire beágyazott levél-komponens elérje a wizard-szintű `inspectionId`-t.
 *
 * A `InspectionWizard.tsx` a teljes render-fáját körbeveszi ezzel a Providerrel, az ott
 * kliens-oldalon generált (`crypto.randomUUID()`) `inspectionId` értékkel.
 */
export function InspectionIdProvider({
  inspectionId,
  children,
}: {
  inspectionId: string;
  children: ReactNode;
}) {
  return <InspectionIdContext.Provider value={inspectionId}>{children}</InspectionIdContext.Provider>;
}

/** Lásd `InspectionIdProvider` JSDoc-ját -- kizárólag azon belül használható (a wizard
 * mindenhol biztosítja ezt a feltételt), különben hibát dob, hogy egy hiányzó Provider
 * SOSE maradjon csendben észrevétlen (ami egy `inspectionId: ''`-t küldő, hibás AI-hívást
 * eredményezne). */
export function useInspectionId(): string {
  const inspectionId = useContext(InspectionIdContext);
  if (!inspectionId) {
    throw new Error('useInspectionId() kizárólag InspectionIdProvider-en belül használható.');
  }
  return inspectionId;
}
