/**
 * Gera o ícone da AURA (o que aparece na ABA do navegador) em `public/brand/`.
 *
 * Rode de novo se a identidade mudar:
 *   npx tsx scripts/gen-aura-icons.ts
 *
 * Irmão do `gen-pwa-icons.ts`, mesma mecânica e mesma dependência de `sharp`
 * (que vem junto com o Next; os PNGs são versionados, então build e deploy não
 * precisam dele).
 *
 * São marcas DIFERENTES de propósito, dividindo o mesmo domínio:
 *  - AURA (painel administrativo) → faísca sobre verde, espelha o logo da
 *    sidebar em `src/components/layout/sidebar.tsx`
 *  - Rede Brasil Solar (portal do cliente) → sol sobre teal→laranja, o do PWA
 *
 * Dois tamanhos: 32 para a aba (rasterizado direto, sai nítido) e 192 para
 * atalhos e telas de alta densidade.
 */
import sharp from "sharp";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";

// Mesmo gradiente do logo da sidebar (Tailwind green-600 → emerald-600).
const GREEN = "#16A34A";
const EMERALD = "#059669";

/** Faísca do lucide-react (`Sparkles` v1.8.0), no viewBox 24×24 original. */
const SPARKLES_PATHS = `
    <path d="M11.017 2.814a1 1 0 0 1 1.966 0l1.051 5.558a2 2 0 0 0 1.594 1.594l5.558 1.051a1 1 0 0 1 0 1.966l-5.558 1.051a2 2 0 0 0-1.594 1.594l-1.051 5.558a1 1 0 0 1-1.966 0l-1.051-5.558a2 2 0 0 0-1.594-1.594l-5.558-1.051a1 1 0 0 1 0-1.966l5.558-1.051a2 2 0 0 0 1.594-1.594z" />
    <path d="M20 2v4" />
    <path d="M22 4h-4" />
    <circle cx="4" cy="20" r="2" />`;

function iconSvg(size: number, marcaRatio: number): string {
  const radius = Math.round(size * 0.22);
  const marca = size * marcaRatio;
  const offset = (size - marca) / 2;
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 ${size} ${size}">
  <defs>
    <linearGradient id="g" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0%" stop-color="${GREEN}" />
      <stop offset="100%" stop-color="${EMERALD}" />
    </linearGradient>
  </defs>
  <rect width="${size}" height="${size}" rx="${radius}" ry="${radius}" fill="url(#g)" />
  <g transform="translate(${offset} ${offset}) scale(${marca / 24})"
     fill="none" stroke="#FFFFFF" stroke-width="1.9"
     stroke-linecap="round" stroke-linejoin="round">${SPARKLES_PATHS}
  </g>
</svg>`;
}

const VARIANTES = [
  { arquivo: "aura-icon-32.png", size: 32, marcaRatio: 0.72 },
  { arquivo: "aura-icon-192.png", size: 192, marcaRatio: 0.64 },
];

async function main() {
  const destino = path.join(process.cwd(), "public", "brand");
  await mkdir(destino, { recursive: true });

  for (const { arquivo, size, marcaRatio } of VARIANTES) {
    const svg = iconSvg(size, marcaRatio);
    const png = await sharp(Buffer.from(svg)).png({ compressionLevel: 9 }).toBuffer();
    await writeFile(path.join(destino, arquivo), png);
    console.log(`✓ ${arquivo} (${size}×${size}, ${(png.length / 1024).toFixed(1)} kB)`);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
