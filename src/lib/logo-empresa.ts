/**
 * A MARCA DA EMPRESA — o único lugar que sabe onde o logotipo mora.
 *
 * 🔑 Companheiro de `identidade-remetente.ts`: lá está como a empresa se
 * ESCREVE (nome, email, descrição), aqui está como ela se DESENHA. A separação
 * existe porque o logotipo é um arquivo, e arquivo se lê de jeitos diferentes
 * conforme o destino:
 *
 *   • **Página e email** → URL pública (`/brand/...`), servida pelo Next.
 *   • **PDF** → o `@react-pdf/renderer` roda no servidor, sem navegador e sem
 *     origem HTTP para resolver caminho relativo. Lá o arquivo entra como data
 *     URI lido do disco.
 *
 * ⚠️ **O PDF não pode quebrar por causa do logotipo.** Se o arquivo sumir do
 * `public/` num deploy, `logoDataUri()` devolve `null` e o cabeçalho cai no
 * nome em texto — que é o que existia antes de 06/09/2026. Um demonstrativo
 * sem marca ainda cobra; um demonstrativo que não renderiza, não.
 */
import { readFileSync } from "node:fs";
import path from "node:path";

/** Caminho servido pelo Next — vale na página e no `<img>` do email. */
export const LOGO_EMPRESA_PATH = "/brand/brasil-solar-logo.png";

/** Proporção do arquivo (480 × 365). Quem posiciona só escolhe a largura. */
export const LOGO_EMPRESA_RATIO = 480 / 365;

/** URL absoluta do logotipo — email não resolve caminho relativo. */
export function logoEmpresaUrl(): string | null {
  const base = (process.env.APP_BASE_URL || "").replace(/\/+$/, "");
  return base ? `${base}${LOGO_EMPRESA_PATH}` : null;
}

let cache: string | null | undefined;

/**
 * O logotipo como data URI, para o `<Image>` do react-pdf.
 *
 * Lê uma vez por processo: o arquivo tem 30 KB e o demonstrativo é gerado em
 * lote (uma cobrança por UC), então reler a cada PDF seria I/O à toa.
 */
export function logoEmpresaDataUri(): string | null {
  if (cache !== undefined) return cache;
  try {
    const arquivo = path.join(process.cwd(), "public", "brand", "brasil-solar-logo.png");
    cache = `data:image/png;base64,${readFileSync(arquivo).toString("base64")}`;
  } catch {
    cache = null;
  }
  return cache;
}
