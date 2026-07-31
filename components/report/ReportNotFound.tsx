/**
 * Letisztult 404 állapot, ha a `get_public_report` RPC `null`-t ad vissza
 * (érvénytelen `public_token`, vagy törölt/nem létező vizsgálat) --
 * PROJEKT_INSTRUKCIOK.md 5.C: "Ha a visszakapott data null, jeleníts meg egy
 * letisztult 404/Nem található oldalt". BMW design: fehér canvas, 0px lekerekítés.
 */
export function ReportNotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-bmw-canvas px-4 text-center">
      <p className="text-[13px] font-bold uppercase tracking-[1.5px] text-bmw-muted">404</p>
      <h1 className="mt-4 max-w-xl text-[32px] font-bold leading-tight text-bmw-ink sm:text-[40px]">
        Érvénytelen vagy lejárt riport link
      </h1>
      <p className="mt-4 max-w-md text-[15px] font-light leading-relaxed text-bmw-body">
        A megadott link nem tartozik létező vizsgálati riporthoz. Kérjük, ellenőrizd a linket,
        vagy vedd fel a kapcsolatot az autóvizsgálóval, aki a riportot küldte.
      </p>
    </div>
  );
}
