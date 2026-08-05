/**
 * Gera os ícones do PWA do Portal do Cliente em `public/pwa/`.
 *
 * Rode de novo se a identidade mudar:
 *   npx tsx scripts/gen-pwa-icons.ts
 *
 * Só o script depende de `sharp` (que vem junto com o Next, não está no
 * package.json). Os PNGs são versionados, então build e deploy não precisam
 * dele — se um dia o Next parar de trazer, instale com `npm i -D sharp`.
 *
 * O desenho espelha o cabeçalho do portal (sol branco sobre o gradiente da
 * marca, ver `src/lib/brand-colors.ts`). São quatro variantes porque cada
 * sistema recorta de um jeito:
 *  - icon-192 / icon-512      → cantos arredondados (Android usa como está)
 *  - icon-maskable-512        → sangria total, sol menor (Android recorta em
 *                               círculo/squircle; só os 80% centrais sobrevivem)
 *  - apple-touch-icon         → quadrado sem transparência (o iOS aplica a
 *                               máscara dele; canto arredondado aqui vira borda feia)
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

const TEAL = "#2E9B87";
const TEAL_MID = "#3BAE99";
const ORANGE = "#EA6E2C";

/** Sol do lucide-react (`Sun`), no viewBox 24×24 original. */
const SUN_PATHS = `
    <circle cx="12" cy="12" r="4" />
    <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41" />`;

function iconSvg(
  size: number,
  { rounded, sunRatio }: { rounded: boolean; sunRatio: number },
): string {
  const radius = rounded ? Math.round(size * 0.22) : 0;
  const sun = size * sunRatio;
  const offset = (size - sun) / 2;
  // stroke-width 2 no viewBox 24 fica fino quando ampliado; 1.9 mantém o traço
  // proporcional ao lucide sem fechar o miolo do sol.
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${TEAL}" />
      <stop offset="45%" stop-color="${TEAL_MID}" />
      <stop offset="100%" stop-color="${ORANGE}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)" />
  <g transform="translate(${offset} ${offset}) scale(${sun / 24})"
     fill="none" stroke="#FFFFFF" stroke-width="1.9"
     stroke-linecap="round" stroke-linejoin="round">${SUN_PATHS}
  </g>
</svg>`;
}

const VARIANTES = [
  { arquivo: "icon-192.png", size: 192, rounded: true, sunRatio: 0.62 },
  { arquivo: "icon-512.png", size: 512, rounded: true, sunRatio: 0.62 },
  { arquivo: "icon-maskable-512.png", size: 512, rounded: false, sunRatio: 0.46 },
  { arquivo: "apple-touch-icon.png", size: 180, rounded: false, sunRatio: 0.62 },
];

async function main() {
  const destino = path.join(process.cwd(), "public", "pwa");
  await mkdir(destino, { recursive: true });

  for (const { arquivo, size, rounded, sunRatio } of VARIANTES) {
    const svg = iconSvg(size, { rounded, sunRatio });
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(destino, arquivo), png);
    console.log(`✓ ${arquivo} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
