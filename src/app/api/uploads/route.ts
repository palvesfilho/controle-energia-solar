import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth-options";
import { prisma } from "@/lib/prisma";
import ExcelJS from "exceljs";
import { isAdminRole } from "@/lib/roles";
import { saveBufferToStorage } from "@/lib/file-storage";

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "Arquivo necessario" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);
  const fileName = `${Date.now()}-${file.name}`;
  const saved = await saveBufferToStorage(buffer, "imports", fileName);

  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.load(buffer as unknown as ArrayBuffer);

  const sheets: Record<string, unknown[][]> = {};
  workbook.eachSheet((worksheet) => {
    const rows: unknown[][] = [];
    worksheet.eachRow((row, rowNumber) => {
      const values = Array.isArray(row.values) ? row.values.slice(1) : [];
      rows.push(values);
    });
    sheets[worksheet.name] = rows;
  });

  // Create upload record
  const upload = await prisma.upload.create({
    data: {
      fileName: file.name,
      fileSize: file.size,
      filePath: saved.relativePath,
      mimeType: file.type || "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      uploadedById: session.user.id,
      rawData: JSON.stringify(sheets),
    },
  });

  return NextResponse.json({
    id: upload.id,
    fileName: upload.fileName,
    sheets,
  });
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session || !isAdminRole(session.user.role)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const uploads = await prisma.upload.findMany({
    orderBy: { createdAt: "desc" },
    include: {
      uploadedBy: { select: { name: true } },
      _count: { select: { reports: true } },
    },
  });

  return NextResponse.json(uploads);
}
