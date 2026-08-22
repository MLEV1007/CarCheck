'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { Check, Copy, Eye, MoreHorizontal, Trash2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { iconHitSlopClass } from '@/components/ui/IconButton';

interface InspectionActionsMenuProps {
  inspectionId: string;
  isCopied: boolean;
  onCopyLink: () => void;
  onDelete: () => void;
}

/** `w-56` (14rem), meg kell egyeznie a menü panel Tailwind szélesség-osztályával lent,
 * mert a jobbra igazított pozíciószámításhoz (`rect.right - MENU_WIDTH`) kell ismerni. */
const MENU_WIDTH = 224;

/**
 * Hárompontos (kebab) menü a befejezett vizsgálatok sorában, a "Dashboard táblázat teljes
 * UX/UI újratervezése" lépés fő UX-fixe. Korábban a Műveletek oszlopban 3 önálló gomb
 * (Megtekintés / Riport / Link másolása) állt egymás mellett, ami köztes szélességeknél
 * szétnyomta a táblázat középső oszlopait. Mostantól csak a "Riport" (fő CTA, változatlanul
 * önálló gomb marad a `InspectionsExplorer.tsx`-ben) marad látható, a ritkábban használt
 * (Megtekintés, Link másolása) és a destruktív (Törlés) műveletek ide, egy kattintásra nyíló
 * helyi menübe kerültek.
 *
 * SZÁNDÉKOSAN `position: fixed`-del, JS-ből kiszámolt koordinátákkal (NEM egy egyszerű
 * `absolute right-0 top-full`-lal), a táblázat konténere `overflow-hidden`-t használ a
 * lekerekített sarkokhoz és `overflow-x-auto`-t a vízszintes görgetéshez (lásd
 * `InspectionsExplorer.tsx`), egy `absolute` menü tehát a konténer alján/szélén levágódna.
 * A `fixed` pozíció a viewporthoz igazodik, ezt egyetlen `overflow` ancestor sem vágja le
 * (amíg egyik szülőnek sincs `transform`/`filter`/`will-change: transform`-ja, itt nincs).
 * Görgetésre/ablak-átméretezésre a menü bezáródik, hogy sose maradjon "elszakadva" a
 * gombjától.
 */
export function InspectionActionsMenu({ inspectionId, isCopied, onCopyLink, onDelete }: InspectionActionsMenuProps) {
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);

  function openMenu() {
    const rect = buttonRef.current?.getBoundingClientRect();
    if (rect) {
      setPosition({
        top: rect.bottom + 4,
        left: Math.max(8, rect.right - MENU_WIDTH),
      });
    }
    setOpen(true);
  }

  useEffect(() => {
    if (!open) return;

    function handlePointerDown(event: MouseEvent) {
      const target = event.target as Node;
      const clickedButton = buttonRef.current?.contains(target);
      const clickedMenu = menuRef.current?.contains(target);
      if (!clickedButton && !clickedMenu) setOpen(false);
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === 'Escape') setOpen(false);
    }
    function handleScrollOrResize() {
      setOpen(false);
    }

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    // `capture: true` szükséges, mert a `scroll` esemény nem "bubble"-öl, capturing fázisban
    // viszont eljut a window-ig akkor is, ha a táblázat belső `overflow-x-auto` div-je görgött.
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [open]);

  return (
    <>
      <button
        ref={buttonRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openMenu())}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="További műveletek"
        className={cn(
          'inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-md border border-linear-hairline-strong bg-linear-surface-2 text-linear-ink-subtle transition-colors hover:bg-linear-surface-3 hover:text-linear-ink',
          iconHitSlopClass(32)
        )}
      >
        <MoreHorizontal className="h-4 w-4" />
      </button>

      {open && position && (
        <div
          ref={menuRef}
          role="menu"
          style={{ top: position.top, left: position.left, width: MENU_WIDTH }}
          className="fixed z-30 overflow-hidden rounded-md border border-linear-hairline-strong bg-linear-surface-2 py-1 shadow-lg"
        >
          <Link
            href={`/inspections/${inspectionId}`}
            role="menuitem"
            onClick={() => setOpen(false)}
            className="flex items-center gap-2.5 px-3 py-2 text-[13px] text-linear-ink transition-colors hover:bg-linear-surface-3"
          >
            <Eye className="h-3.5 w-3.5 text-linear-ink-subtle" />
            Megtekintés
          </Link>

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              onCopyLink();
              setOpen(false);
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] text-linear-ink transition-colors hover:bg-linear-surface-3"
          >
            {isCopied ? (
              <>
                <Check className="h-3.5 w-3.5 text-linear-success" />
                Link másolva
              </>
            ) : (
              <>
                <Copy className="h-3.5 w-3.5 text-linear-ink-subtle" />
                Publikus link másolása
              </>
            )}
          </button>

          <div className="my-1 border-t border-linear-hairline" />

          <button
            type="button"
            role="menuitem"
            onClick={() => {
              setOpen(false);
              onDelete();
            }}
            className="flex w-full items-center gap-2.5 px-3 py-2 text-left text-[13px] font-medium text-linear-danger transition-colors hover:bg-linear-danger-soft"
          >
            <Trash2 className="h-3.5 w-3.5" />
            Vizsgálat törlése
          </button>
        </div>
      )}
    </>
  );
}
