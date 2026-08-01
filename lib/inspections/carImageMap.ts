/**
 * Referenciakép-konstansok a rétegvastagság-mérő "Szabadkézi" (Free-form Canvas)
 * moduljához (PROJEKT_INSTRUKCIOK.md, "Rétegvastagság-mérő Szabadkézi (Free-form
 * Canvas) átalakítása" lépés). Korábban ez a fájl egy FIX, előre definiált
 * karosszéria-elem/hotspot-térképet (`CAR_IMAGE_HOTSPOTS`) is tárolt -- ezt a modellt a
 * felhasználó explicit kérésére teljesen leváltotta a szabadon kattintható
 * canvas-logika (lásd `components/inspections/PaintCanvas.tsx`), ezért innen minden
 * előre definiált elem-koordináta törölve lett. A `cars.webp` kép (5 nézet: elölnézet,
 * hátulnézet, felülnézet, két oldalnézet) továbbra is a vizuális háttér, csak már NINCS
 * ráépítve semmilyen fix zóna -- a felhasználó a kép TETSZŐLEGES pontjára kattinthat
 * mérési pont felvételéhez, a kattintás pontos relatív pozíciója (%) kerül mentésre.
 */

export const CAR_IMAGE_SRC = '/cars.webp';
export const CAR_IMAGE_WIDTH = 850;
export const CAR_IMAGE_HEIGHT = 563;
