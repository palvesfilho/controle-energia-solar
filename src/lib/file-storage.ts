import { writeFile, mkdir, unlink, readFile, stat, readdir } from "fs/promises";
import { join, resolve, sep } from "path";
import {
  saveBufferToR2,
  saveUploadedFileToR2,
  readFromR2,
  deleteFromR2,
  relativePathToKey,
  listExistingR2Keys,
} from "./r2-storage";

const UPLOAD_ROOT = "uploads";

type Backend = "disk" | "r2";

function backend(): Backend {
  const v = (process.env.STORAGE_BACKEND ?? "disk").toLowerCase();
  return v === "r2" ? "r2" : "disk";
}

/**
 * Salva um arquivo enviado e retorna o path relativo (ex: "uploads/billing/xxx.pdf").
 * Em modo R2, escreve no bucket; em modo disco, escreve em <cwd>/uploads/<subdir>.
 * absolutePath é o caminho local em modo disco; string vazia em modo R2.
 */
export async function saveUploadedFile(
  file: File,
  subdir: string,
): Promise<{ relativePath: string; absolutePath: string; fileName: string; size: number }> {
  if (!file || file.size === 0) {
    throw new Error("Arquivo vazio ou ausente");
  }

  if (backend() === "r2") {
    const r = await saveUploadedFileToR2(file, subdir);
    return {
      relativePath: r.relativePath,
      absolutePath: "",
      fileName: r.fileName,
      size: r.size,
    };
  }

  const dir = join(process.cwd(), UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });

  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const fileName = `${Date.now()}-${safeName}`;
  const absolutePath = join(dir, fileName);

  const bytes = await file.arrayBuffer();
  await writeFile(absolutePath, Buffer.from(bytes));

  const relativePath = `${UPLOAD_ROOT}/${subdir}/${fileName}`;

  return { relativePath, absolutePath, fileName, size: file.size };
}

/**
 * Salva um Buffer com nome determinístico (sem prefixo de timestamp). Usado para
 * persistir PDFs externos (Infosimples) onde re-sincronizações sobrescrevem.
 */
export async function saveBufferToStorage(
  buffer: Buffer,
  subdir: string,
  fileName: string,
): Promise<{ relativePath: string; absolutePath: string }> {
  if (backend() === "r2") {
    const r = await saveBufferToR2(buffer, subdir, fileName);
    return { relativePath: r.relativePath, absolutePath: "" };
  }

  const dir = join(process.cwd(), UPLOAD_ROOT, subdir);
  await mkdir(dir, { recursive: true });
  const safeName = fileName.replace(/[^a-zA-Z0-9._-]/g, "_");
  const absolutePath = join(dir, safeName);
  await writeFile(absolutePath, buffer);
  const relativePath = `${UPLOAD_ROOT}/${subdir}/${safeName}`;
  return { relativePath, absolutePath };
}

/**
 * Remove um arquivo a partir do path relativo. Silencioso em caso de erro.
 */
export async function deleteUploadedFile(relativePath: string | null | undefined): Promise<void> {
  if (!relativePath) return;

  if (backend() === "r2") {
    await deleteFromR2(relativePath);
    return;
  }

  try {
    const absolutePath = join(process.cwd(), relativePath);
    await unlink(absolutePath);
  } catch {
    // arquivo já removido ou inexistente — ignora
  }
}

/**
 * Lê um arquivo do storage atual. Aceita key/relative-path em qualquer das
 * convenções usadas pelo projeto ("uploads/...", "/api/files/...", ou key crua).
 * Retorna null se não existir.
 */
export async function readFromStorage(
  relativeOrKey: string,
): Promise<{ data: Buffer; size: number } | null> {
  if (backend() === "r2") {
    const data = await readFromR2(relativeOrKey);
    if (!data) return null;
    return { data, size: data.length };
  }

  const uploadRoot = resolve(process.cwd(), UPLOAD_ROOT);
  const key = relativePathToKey(relativeOrKey);
  const requested = resolve(uploadRoot, key);

  if (!requested.startsWith(uploadRoot)) return null;

  try {
    const stats = await stat(requested);
    if (!stats.isFile()) return null;
    const data = await readFile(requested);
    return { data, size: stats.size };
  } catch {
    return null;
  }
}

/**
 * Lista todas as keys com conteúdo (>0 bytes) sob um prefixo. Use para checar
 * existência em lote sem N round-trips. Keys retornadas são canônicas
 * (sem prefixo "uploads/" ou "api/files/").
 */
export async function listExistingKeys(prefix?: string): Promise<Set<string>> {
  if (backend() === "r2") {
    return listExistingR2Keys(prefix);
  }

  const uploadRoot = resolve(process.cwd(), UPLOAD_ROOT);
  const start = prefix ? resolve(uploadRoot, prefix) : uploadRoot;
  const set = new Set<string>();

  async function walk(dir: string): Promise<void> {
    let entries;
    try {
      entries = await readdir(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const e of entries) {
      const full = join(dir, e.name);
      if (e.isDirectory()) {
        await walk(full);
      } else if (e.isFile()) {
        try {
          const st = await stat(full);
          if (st.size > 0) {
            const rel = full.slice(uploadRoot.length + 1).split(sep).join("/");
            set.add(rel);
          }
        } catch {
          // ignora
        }
      }
    }
  }

  await walk(start);
  return set;
}
