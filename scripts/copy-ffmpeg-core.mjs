// scripts/copy-ffmpeg-core.mjs
//
// A kliens-oldali videó-tömörítéshez (lib/inspections/videoCompression.ts, PLAN_video_qr_upload.md
// 3. szakasz) az ffmpeg.wasm "core" (single-threaded, minden böngészőben működik) és "core-mt"
// (multi-threaded, SharedArrayBuffer + COOP/COEP fejléceket igényel, lásd next.config.mjs)
// build-jeit STATIKUS fájlként kell kiszolgálni a /public alól, mert a @ffmpeg/core*
// csomagok node_modules-ból NEM tölthetők be közvetlenül a böngészőben (nincs hozzájuk
// bundler-integráció, és a .wasm fájlokat Next.js nem szolgálja ki node_modules-ból).
//
// Ez a szkript minden `npm install` után lefut (lásd package.json "postinstall") és átmásolja
// mindkét build UMD kimenetét a public/ffmpeg-core* mappákba, amit a videoCompression.ts
// `toBlobURL()`-lel tölt be futásidőben.
import { existsSync, mkdirSync, readdirSync, copyFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');

const targets = [
  { src: join(root, 'node_modules/@ffmpeg/core/dist/umd'), dest: join(root, 'public/ffmpeg-core') },
  { src: join(root, 'node_modules/@ffmpeg/core-mt/dist/umd'), dest: join(root, 'public/ffmpeg-core-mt') },
];

for (const { src, dest } of targets) {
  if (!existsSync(src)) {
    // Fejlesztői környezetben előfordulhat, hogy a csomag még nincs telepítve (pl. részleges
    // `npm install` egy CI cache-lépésben) -- ilyenkor NEM hibázunk, csak figyelmeztetünk,
    // mert a hiányzó fájlokat a videoCompression.ts futásidőben, feltöltéskor veszi észre
    // (lásd annak hibaüzenetét), nem build-időben.
    console.warn(`[copy-ffmpeg-core] Kihagyva -- nem található: ${src}`);
    continue;
  }
  mkdirSync(dest, { recursive: true });
  for (const file of readdirSync(src)) {
    copyFileSync(join(src, file), join(dest, file));
  }
  console.log(`[copy-ffmpeg-core] Másolva: ${src} -> ${dest}`);
}
