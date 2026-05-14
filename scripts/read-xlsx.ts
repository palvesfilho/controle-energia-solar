import ExcelJS from "exceljs";
import path from "path";

async function readFile(filePath: string) {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(filePath);

  console.log(`\n========================================`);
  console.log(`ARQUIVO: ${path.basename(filePath)}`);
  console.log(`========================================`);

  workbook.eachSheet((sheet) => {
    console.log(`\n--- Aba: "${sheet.name}" ---`);
    console.log(`Linhas: ${sheet.rowCount}, Colunas: ${sheet.columnCount}\n`);

    // Cabeçalhos na linha 4
    const headers: string[] = [];
    const headerRow = sheet.getRow(4);
    headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
      headers[colNumber] = String(cell.value ?? "").trim();
    });

    // Mostra primeiras 3 linhas de dados (linhas 5-7)
    console.log("PRIMEIRAS 3 LINHAS DE DADOS:");
    for (let r = 5; r <= Math.min(7, sheet.rowCount); r++) {
      const row = sheet.getRow(r);
      console.log(`\n--- Linha ${r} ---`);
      for (let c = 1; c <= sheet.columnCount; c++) {
        const cell = row.getCell(c);
        let value: unknown = cell.value;
        if (value && typeof value === "object" && "text" in value) {
          value = (value as { text: string }).text;
        }
        if (value && typeof value === "object" && "result" in value) {
          value = (value as { result: unknown }).result;
        }
        const header = headers[c] || `col${c}`;
        if (value !== null && value !== undefined && value !== "") {
          console.log(`  ${header}: ${JSON.stringify(value)}`);
        }
      }
    }
  });
}

async function main() {
  const files = [
    "C:/Users/thoma/Downloads/usinas_10_04_2026.xlsx",
    "C:/Users/thoma/Downloads/ucs_10_04_2026.xlsx",
    "C:/Users/thoma/Downloads/consumidores_10_04_2026.xlsx",
  ];

  for (const file of files) {
    await readFile(file);
  }
}

main().catch(console.error);
