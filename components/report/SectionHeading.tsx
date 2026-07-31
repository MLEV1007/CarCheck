interface SectionHeadingProps {
  eyebrow: string;
  title: string;
}

/**
 * BMW design system (bmw.md) `label-uppercase` eyebrow (13px/700/1.5px tracking, kék)
 * + `display-sm`/`display-md` cím (700-as súly) -- a riport szekcióinak fejléce.
 */
export function SectionHeading({ eyebrow, title }: SectionHeadingProps) {
  return (
    <div>
      <p className="text-[13px] font-bold uppercase tracking-[1.5px] text-bmw-primary">{eyebrow}</p>
      <h2 className="mt-2 text-[28px] font-bold leading-tight text-bmw-ink sm:text-[32px]">{title}</h2>
    </div>
  );
}
