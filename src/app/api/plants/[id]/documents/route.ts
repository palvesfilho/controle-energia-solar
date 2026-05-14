import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { isAdminRole } from "@/lib/roles";
import { prisma } from "@/lib/prisma";
import { saveUploadedFile, deleteUploadedFile } from "@/lib/file-storage";

const VALID_TYPES = ["CNH_RG", "PROCURACAO", "CONTRATO_SOCIAL", "CARTAO_CNPJ"] as const;
type DocType = (typeof VALID_TYPES)[number];

function isValidType(v: string): v is DocType {
  return (VALID_TYPES as readonly string[]).includes(v);
}

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;
  const docs = await prisma.plantDocument.findMany({
    where: { plantId },
    orderBy: { createdAt: "desc" },
  });
  return NextResponse.json(docs);
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const session = await getServerSession(authOptions);
  if (!session?.user || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Não autorizado" }, { status: 401 });
  }

  const { id: plantId } = await params;

  const plant = await prisma.plant.findUnique({
    where: { id: plantId },
    select: { id: true },
  });
  if (!plant) {
    return NextResponse.json({ error: "Usina não encontrada" }, { status: 404 });
  }

  const form = await req.formData();
  const file = form.get("file");
  const type = form.get("type");

  if (!(file instanceof File) || file.size === 0) {
    return NextResponse.json({ error: "Arquivo é obrigatório" }, { status: 400 });
  }
  if (typeof type !== "string" || !isValidType(type)) {
    return NextResponse.json(
      { error: `Tipo inválido. Use um destes: ${VALID_TYPES.join(", ")}` },
      { status: 400 },
    );
  }

  const existing = await prisma.plantDocument.findUnique({
    where: { plantId_type: { plantId, type } },
  });

  const saved = await saveUploadedFile(file, `documents/plants/${plantId}`);

  if (existing) {
    await deleteUploadedFile(existing.url);
    const updated = await prisma.plantDocument.update({
      where: { id: existing.id },
      data: {
        url: saved.relativePath,
        fileName: file.name,
        size: saved.size,
        uploadedById: session.user.id,
      },
    });
    return NextResponse.json(updated);
  }

  const created = await prisma.plantDocument.create({
    data: {
      plantId,
      type,
      url: saved.relativePath,
      fileName: file.name,
      size: saved.size,
      uploadedById: session.user.id,
    },
  });
  return NextResponse.json(created, { status: 201 });
}
