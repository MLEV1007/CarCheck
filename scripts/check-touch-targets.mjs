#!/usr/bin/env node
/**
 * Regressziós védőháló a touch target (érintési célterület) javításhoz -- lásd
 * docs/ux-touch-targets-plan-2026-08-14.md, 4.3 fejezet. Célja: megakadályozni, hogy egy
 * jövőbeli új ikon-gomb (`<button>`/`<a>`/`<Link>` kis, 24-32px-es vizuális mérettel)
 * ugyanazzal a hibával kerüljön be a kódba, mint amit ez a terv javított.
 *
 * MŰKÖDÉS (heurisztikus, NEM teljes AST-elemzés): a `components/**\/*.tsx` és
 * `app/**\/*.tsx` fájlokban megkeresi az interaktív elemeket (`<button`, `<a `, `<Link`),
 * kigyűjti a `className` értéküket (literál string, template literal, `cn(...)` hívás,
 * vagy egy a fájlban máshol definiált `const xClass = '...'` változóra való hivatkozás --
 * ez utóbbi a `DamageCanvas.tsx`/`PaintCanvas.tsx` mintázata), és ha talál benne `h-6`/
 * `h-7`/`h-8`/`h-9`/`w-6`/`w-7`/`w-8`/`w-9` méret-osztályt, ELVÁRJA, hogy ugyanott
 * szerepeljen valamelyik elfogadott "biztonsági jelző" is:
 *   - `iconHitSlopClass(` / `before:-inset` / `before:[inset:` -- hit-slop pszeudo-elem
 *   - `min-w-11` / `h-11` / `w-11`                              -- tényleges 44px doboz
 *
 * KORLÁT: ez egy pragmatikus regex-alapú ellenőrzés, nem helyettesíti a kézi/vizuális QA-t
 * (lásd a terv 6. fejezetét, "Tesztelési / verifikációs terv"). `<IconButton>`/`<BackLink>`/
 * `<RemovablePhotoThumbnail>` NEM literál `<button>`/`<a>`/`<Link>` tag, ezért ezeket a
 * script nem is vizsgálja -- a bennük lévő hit-slop garantáltan jelen van a komponens
 * definíciója miatt (lásd components/ui/IconButton.tsx).
 *
 * Futtatás: `node scripts/check-touch-targets.mjs` (be van kötve az `npm run lint`-be).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

const ROOT = process.cwd();
const SCAN_DIRS = ['components', 'app'];
// Csak a NÉGYZETES, ikon-only gombokat célozzuk (h-N ÉS w-N EGYÜTT, N = 6-9) -- egy sima
// szöveges gomb, ami csak `h-9`-et használ (a szélessége a tartalomtól/`flex-1`-től függ,
// bőven 44px felett van), NEM ugyanaz a hibaosztály, amit a terv javított, és false
// positive-ot adna.
const H_TOKEN_RE = /\bh-[6789]\b/;
const W_TOKEN_RE = /\bw-[6789]\b/;
const SAFE_MARKER_RE = /iconHitSlopClass\(|before:-inset|before:\[inset:|min-w-11|(?:^|[\s"'`])h-11(?:$|[\s"'`])|(?:^|[\s"'`])w-11(?:$|[\s"'`])/;
const TAG_START_RE = /<(button|a|Link)[\s/>]/g;

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (entry === 'node_modules' || entry.startsWith('.')) continue;
      walk(full, out);
    } else if (entry.endsWith('.tsx')) {
      out.push(full);
    }
  }
  return out;
}

/** A `<tagName ...>` nyitó tag teljes szövegét adja vissza (a `<`-tól a lezáró `>`-ig),
 * naiv, de a projekt konzisztens JSX-formázásához elég karakterláncot-számolós kereséssel. */
function extractTag(source, startIdx) {
  let depth = 0;
  let inString = null;
  for (let i = startIdx; i < source.length && i < startIdx + 4000; i++) {
    const ch = source[i];
    if (inString) {
      if (ch === inString && source[i - 1] !== '\\') inString = null;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      inString = ch;
      continue;
    }
    if (ch === '{') depth++;
    if (ch === '}') depth--;
    if (ch === '>' && depth <= 0) return source.slice(startIdx, i + 1);
  }
  return null;
}

/** `className={xyz}` -- ha `xyz` egy sima azonosító (nem `cn(...)`/string literál), megkeresi
 * a fájlban a `const xyz =` definíciót, és a hozzárendelt kifejezés szövegét adja vissza. */
function resolveVariableClass(source, varName) {
  const defRe = new RegExp(`const\\s+${varName}\\s*=([\\s\\S]{0,600}?);\\n`);
  const match = defRe.exec(source);
  return match ? match[1] : '';
}

function lineNumberAt(source, idx) {
  return source.slice(0, idx).split('\n').length;
}

function checkFile(filePath) {
  const source = readFileSync(filePath, 'utf8');
  const findings = [];
  let m;
  TAG_START_RE.lastIndex = 0;
  while ((m = TAG_START_RE.exec(source))) {
    const tagText = extractTag(source, m.index);
    if (!tagText) continue;

    const classNameMatch = /className=(\{[^]*?\}|"[^"]*"|'[^']*')/.exec(tagText);
    if (!classNameMatch) continue;
    let classExpr = classNameMatch[1];

    // Sima azonosító-hivatkozás (pl. `className={closeButtonClass}`) feloldása.
    const bareIdentMatch = /^\{\s*([A-Za-z_$][\w$]*)\s*\}$/.exec(classExpr);
    if (bareIdentMatch) {
      classExpr += ' ' + resolveVariableClass(source, bareIdentMatch[1]);
    }

    if (H_TOKEN_RE.test(classExpr) && W_TOKEN_RE.test(classExpr) && !SAFE_MARKER_RE.test(classExpr)) {
      findings.push({
        line: lineNumberAt(source, m.index),
        tag: m[1],
        snippet: classExpr.replace(/\s+/g, ' ').slice(0, 160),
      });
    }
  }
  return findings;
}

const files = SCAN_DIRS.flatMap((dir) => walk(join(ROOT, dir)));
let totalFindings = 0;

for (const file of files) {
  const findings = checkFile(file);
  if (findings.length === 0) continue;
  totalFindings += findings.length;
  const rel = relative(ROOT, file);
  for (const f of findings) {
    console.error(`${rel}:${f.line} -- <${f.tag}> ${f.snippet}`);
  }
}

if (totalFindings > 0) {
  console.error(
    `\n${totalFindings} lehetséges érintési célterület (touch target) probléma -- egy ` +
      `<button>/<a>/<Link> elem 24-32px-es (h-6/h-7/h-8/h-9, w-6/w-7/w-8/w-9) méretosztályt ` +
      `használ hit-slop (iconHitSlopClass/before:-inset) vagy tényleges 44px doboz (h-11/w-11/` +
      `min-w-11) nélkül. Lásd docs/ux-touch-targets-plan-2026-08-14.md -- vagy alkalmazd a ` +
      `meglévő IconButton/BackLink/RemovablePhotoThumbnail primitívák valamelyikét, vagy ` +
      `rakj hit-slopot közvetlenül az elemre.`
  );
  process.exit(1);
} else {
  console.log(`Touch target check: OK (${files.length} .tsx fájl ellenőrizve).`);
}
