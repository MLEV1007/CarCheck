/**
 * Márka -> típus katalógus a wizard "Autó adatok" lépéséhez (PROJEKT_INSTRUKCIOK.md 5.B.1,
 * "Márka/Típus dropdown selection" lépés). A magyar piacon leggyakoribb márkák és az adott
 * márkán belül leggyakoribb típusok, NEM teljes körű, ezért mindkét szinten (márka és
 * típus) elérhető az `OTHER_OPTION` ("Egyéb / Más") érték, ami a StepCarInfo.tsx-ben egy
 * szabad szöveges mezőt nyit meg a ritkább márkáknak/modelleknek.
 */

export const OTHER_OPTION = 'Egyéb / Más';

export const CAR_CATALOG: Record<string, string[]> = {
  Audi: ['A1', 'A3', 'A4', 'A5', 'A6', 'Q2', 'Q3', 'Q5', 'Q7', 'TT'],
  BMW: ['1-es sorozat', '2-es sorozat', '3-as sorozat', '4-es sorozat', '5-ös sorozat', 'X1', 'X3', 'X5', 'X6'],
  Citroën: ['C1', 'C3', 'C4', 'C5 Aircross', 'Berlingo'],
  Dacia: ['Sandero', 'Logan', 'Duster', 'Jogger'],
  Fiat: ['500', 'Panda', 'Tipo', '500X'],
  Ford: ['Fiesta', 'Focus', 'Mondeo', 'Kuga', 'Puma', 'EcoSport', 'Transit'],
  Honda: ['Civic', 'CR-V', 'Jazz', 'HR-V'],
  Hyundai: ['i10', 'i20', 'i30', 'Tucson', 'Kona', 'Santa Fe'],
  Kia: ['Picanto', 'Rio', 'Ceed', 'Sportage', 'Niro', 'Stonic'],
  Mazda: ['Mazda2', 'Mazda3', 'Mazda6', 'CX-3', 'CX-5'],
  'Mercedes-Benz': ['A-osztály', 'B-osztály', 'C-osztály', 'E-osztály', 'GLA', 'GLC', 'CLA'],
  Nissan: ['Micra', 'Qashqai', 'Juke', 'X-Trail'],
  Opel: ['Corsa', 'Astra', 'Insignia', 'Mokka', 'Crossland', 'Grandland'],
  Peugeot: ['108', '208', '308', '2008', '3008', '5008'],
  Renault: ['Clio', 'Megane', 'Captur', 'Kadjar', 'Talisman'],
  Škoda: ['Fabia', 'Octavia', 'Superb', 'Kamiq', 'Karoq', 'Kodiaq'],
  Suzuki: ['Swift', 'Vitara', 'S-Cross'],
  Toyota: ['Aygo', 'Yaris', 'Corolla', 'C-HR', 'RAV4', 'Camry'],
  Volkswagen: ['Polo', 'Golf', 'Passat', 'Tiguan', 'T-Roc', 'T-Cross', 'Touran'],
  Volvo: ['V40', 'V60', 'V90', 'XC40', 'XC60', 'XC90'],
};

export const CAR_BRANDS: string[] = [...Object.keys(CAR_CATALOG).sort((a, b) => a.localeCompare(b, 'hu')), OTHER_OPTION];

/** A kiválasztott márkához tartozó típuslista, "Egyéb / Más"-szal kiegészítve a végén. */
export function getModelsForBrand(brand: string): string[] {
  const models = CAR_CATALOG[brand];
  return models ? [...models, OTHER_OPTION] : [OTHER_OPTION];
}
