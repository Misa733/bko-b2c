import XLSX from "xlsx";
import { normalizeColumnName } from "../utils/normalize.js";

export function readWorkbook(filePath) {
  try {
    const workbook = XLSX.readFile(filePath, { cellDates: true });
    const firstSheetName = workbook.SheetNames[0];
    if (!firstSheetName) {
      throw new Error("A planilha nao possui abas.");
    }
    const sheet = workbook.Sheets[firstSheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: "", raw: true });
    const columns = rows.length ? Object.keys(rows[0]) : [];
    if (!rows.length || !columns.length) {
      throw new Error(`A primeira aba (${firstSheetName}) esta vazia.`);
    }
    return { rows, columns, sheetName: firstSheetName };
  } catch (error) {
    throw new Error(error.message || "Arquivo .xlsx invalido ou corrompido.");
  }
}

export function pick(row, aliases) {
  const entries = Object.entries(row);
  for (const alias of aliases) {
    const target = normalizeColumnName(alias);
    const entry = entries.find(([key]) => normalizeColumnName(key) === target);
    if (entry) return entry[1];
  }
  return "";
}
