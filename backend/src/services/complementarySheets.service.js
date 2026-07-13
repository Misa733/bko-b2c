import { pick } from "./excelReader.service.js";
import { readSettings, writeSettings } from "../storage/store.js";
import {
  assertGoogleSheetsAuthReady,
  extractSpreadsheetId,
  getSpreadsheetMetadata,
  readSheetValues,
  toUserGoogleSheetsError
} from "./googleSheets.service.js";
import { normalizeCpf, normalizeMatchKey, normalizePhone, normalizeText, normalizeVendorName } from "../utils/normalize.js";
import { cpfLast3 } from "./matchScoring.service.js";

export const COMPLEMENTARY_SHEETS = [
  {
    id: "complementar_1",
    name: "Planilha Complementar 1",
    url: "https://docs.google.com/spreadsheets/d/1q0NmVylMglKj8ZcNcIjomhhUUc_r3ijwjwqPKrwIVbk/edit?usp=sharing",
    sheetName: "Pagina1"
  },
  {
    id: "complementar_2",
    name: "Planilha Complementar 2",
    url: "https://docs.google.com/spreadsheets/d/1U2T9FIjDcYwaDTT27LYSKGeuAd3o86c3TMxw7kjddUk/edit?usp=sharing",
    sheetName: "Pagina1"
  }
];

const FALLBACK_SHEET_NAMES = ["Pagina1", "Página1", "Sheet1", "Base", "Clientes"];

const FIELD_ALIASES = {
  cpf: ["CPF", "CPF Cliente", "Documento", "Documento Cliente", "Cpf/Cnpj", "CPF/CNPJ", "CNPJ"],
  nomeCliente: ["Nome Cliente", "Cliente", "Nome", "Nome Completo", "Assinante"],
  telefone: ["Telefone", "Whatsapp", "WhatsApp", "Celular", "Contato", "Fone", "Número", "Numero", "Telefone Cliente", "Telefone 1", "Telefone 2"],
  whatsapp: ["WhatsApp", "Whatsapp", "Zap", "Celular", "Contato", "Telefone 2"],
  cidade: ["Cidade", "Município", "Municipio", "Localidade"],
  estado: ["Estado", "UF"],
  bairro: ["Bairro"],
  endereco: ["Endereço", "Endereco", "Logradouro", "Rua", "Complemento"],
  cep: ["CEP", "Cep"],
  email: ["Email", "E-mail", "E mail"],
  vendedor: ["Nome Vendedor", "Vendedor", "Consultor", "Responsável", "Responsavel"],
  observacoes: ["Observação", "Observacao", "Observações", "Observacoes", "Obs"]
};

FIELD_ALIASES.cpf.push("CPF ou CNPJ do Cliente", "CPF/CNPJ do Cliente", "CPF do Cliente", "CNPJ se houver");
FIELD_ALIASES.nomeCliente.push("Nome do Cliente", "NOME DO CLIENTE");
FIELD_ALIASES.telefone.push("Telefone do Cliente", "Telefone para contato", "Telefone contato", "Numero da portabilidade se houver");
FIELD_ALIASES.whatsapp.push("Telefone 2 WhatsApp", "Telefone WhatsApp");
FIELD_ALIASES.vendedor.push("Supervisao", "Supervisao do vendedor");
FIELD_ALIASES.endereco.push("Endereco Nome da Rua", "Nome da Rua");

function rowsFromValues(values = []) {
  const headers = values[0] || [];
  return values.slice(1).map((row) =>
    Object.fromEntries(headers.map((header, index) => [header || `Coluna ${index + 1}`, row[index] ?? ""]))
  );
}

function firstPhone(row) {
  for (const alias of FIELD_ALIASES.telefone) {
    const value = normalizePhone(pick(row, [alias]));
    if (value && value.length >= 8) return value;
  }
  return "";
}

function normalizeComplementaryRow(row, source) {
  const cpfCompleto = normalizeCpf(pick(row, FIELD_ALIASES.cpf));
  const nomeCompleto = normalizeText(pick(row, FIELD_ALIASES.nomeCliente));
  const nomeVendedor = normalizeVendorName(pick(row, FIELD_ALIASES.vendedor));
  const cidade = normalizeText(pick(row, FIELD_ALIASES.cidade));
  const telefone = firstPhone(row);
  const rawWhatsapp = normalizePhone(pick(row, FIELD_ALIASES.whatsapp));
  const whatsapp = rawWhatsapp && rawWhatsapp.length >= 8 ? rawWhatsapp : telefone;

  return {
    source,
    sourceName: COMPLEMENTARY_SHEETS.find((sheet) => sheet.id === source)?.name || source,
    raw: row,
    cpfCliente: cpfCompleto,
    cpfCompleto,
    nomeCliente: nomeCompleto,
    nomeCompleto,
    nomeVendedor,
    telefone,
    whatsapp,
    cidade,
    estado: normalizeText(pick(row, FIELD_ALIASES.estado)),
    bairro: normalizeText(pick(row, FIELD_ALIASES.bairro)),
    endereco: normalizeText(pick(row, FIELD_ALIASES.endereco)),
    cep: normalizePhone(pick(row, FIELD_ALIASES.cep)),
    email: normalizeText(pick(row, FIELD_ALIASES.email)),
    observacoes: normalizeText(pick(row, FIELD_ALIASES.observacoes)),
    normalized: {
      cpf: cpfCompleto,
      nomeCliente: normalizeMatchKey(nomeCompleto),
      nomeVendedor: normalizeMatchKey(nomeVendedor),
      cidade: normalizeMatchKey(cidade)
    }
  };
}

function defaultStatus() {
  return COMPLEMENTARY_SHEETS.map((sheet) => ({
    id: sheet.id,
    name: sheet.name,
    status: "pendente",
    totalRows: 0,
    lastSync: "",
    errorMessage: ""
  }));
}

export function getComplementarySheetsStatus(settings = readSettings()) {
  const stored = settings.planilhasComplementaresStatus || settings.planilhasComplementares || [];
  return defaultStatus().map((sheet) => {
    const current = stored.find((item) => item.id === sheet.id || item.nome === sheet.name || item.name === sheet.name);
    return {
      ...sheet,
      status: current?.status || (current?.ultimaSincronizacao ? "sincronizada" : sheet.status),
      totalRows: current?.totalRows ?? current?.linhas ?? sheet.totalRows,
      lastSync: current?.lastSync || current?.ultimaSincronizacao || sheet.lastSync,
      errorMessage: current?.errorMessage || ""
    };
  });
}

async function readFixedSheet(sheetConfig) {
  const spreadsheetId = extractSpreadsheetId(sheetConfig.url);
  if (!spreadsheetId) throw new Error("Link invalido.");

  const metadata = await getSpreadsheetMetadata(spreadsheetId);
  const firstSheetName = metadata.sheets?.[0]?.properties?.title || "";
  const candidates = [sheetConfig.sheetName, firstSheetName, ...FALLBACK_SHEET_NAMES]
    .filter(Boolean)
    .filter((name, index, list) => list.indexOf(name) === index);

  let lastError = null;
  for (const candidate of candidates) {
    try {
      const values = await readSheetValues(spreadsheetId, candidate);
      return { spreadsheetId, sheetName: candidate, rows: rowsFromValues(values) };
    } catch (error) {
      lastError = error;
    }
  }

  const mapped = toUserGoogleSheetsError(lastError);
  if (mapped.message.includes("Aba nao encontrada")) throw mapped;
  throw new Error("Aba nao encontrada. Verifique se a planilha tem uma aba valida.");
}

export async function syncComplementarySheets(settings = readSettings()) {
  await assertGoogleSheetsAuthReady();

  const allRows = [];
  const statuses = [];
  let successfulSheets = 0;

  for (const sheet of COMPLEMENTARY_SHEETS) {
    try {
      const result = await readFixedSheet(sheet);
      const rows = result.rows.map((row) => normalizeComplementaryRow(row, sheet.id));
      allRows.push(...rows);
      successfulSheets += 1;
      statuses.push({
        id: sheet.id,
        name: sheet.name,
        status: "sincronizada",
        totalRows: rows.length,
        lastSync: new Date().toISOString(),
        errorMessage: "",
        sheetName: result.sheetName,
        spreadsheetId: result.spreadsheetId
      });
    } catch (error) {
      const mapped = toUserGoogleSheetsError(error);
      statuses.push({
        id: sheet.id,
        name: sheet.name,
        status: "erro",
        totalRows: 0,
        lastSync: "",
        errorMessage: mapped.message || "Erro ao sincronizar planilha complementar."
      });
    }
  }

  const nextSettings = {
    ...settings,
    planilhasComplementares: COMPLEMENTARY_SHEETS.map((sheet) => ({ id: sheet.id, nome: sheet.name, url: sheet.url })),
    planilhasComplementaresStatus: statuses,
    dadosComplementares: successfulSheets > 0 ? allRows : settings.dadosComplementares || [],
    atualizadoEm: new Date().toISOString(),
    complementarySyncedAt: new Date().toISOString()
  };
  writeSettings(nextSettings);
  return nextSettings;
}

function addToMultiIndex(index, key, row) {
  if (!key) return;
  if (!index.has(key)) index.set(key, []);
  index.get(key).push(row);
}

function hydrateStoredComplementaryRow(row) {
  const source = row.source || "complementar";
  const reparsed = row.raw ? normalizeComplementaryRow(row.raw, source) : normalizeComplementaryRow(row, source);
  const hydrated = { ...row };
  [
    "cpfCliente",
    "cpfCompleto",
    "nomeCliente",
    "nomeCompleto",
    "nomeVendedor",
    "telefone",
    "whatsapp",
    "cidade",
    "estado",
    "bairro",
    "endereco",
    "cep",
    "email",
    "observacoes"
  ].forEach((field) => {
    hydrated[field] = hydrated[field] || reparsed[field] || "";
  });
  hydrated.normalized = {
    ...(row.normalized || {}),
    cpf: row.normalized?.cpf || reparsed.normalized.cpf,
    nomeCliente: row.normalized?.nomeCliente || reparsed.normalized.nomeCliente,
    nomeVendedor: row.normalized?.nomeVendedor || reparsed.normalized.nomeVendedor,
    cidade: row.normalized?.cidade || reparsed.normalized.cidade
  };
  return hydrated;
}

export function buildComplementaryIndexes(rows = []) {
  const byCpf = new Map();
  const byNameVendor = new Map();
  const byNameCity = new Map();
  const byName = new Map();
  const byNameToken = new Map();
  const byCpfLast3 = new Map();
  const byPhone = new Map();
  const byEmail = new Map();
  const hydratedRows = rows.map(hydrateStoredComplementaryRow);

  hydratedRows.forEach((row) => {
    const normalized = row.normalized || {};
    const cpf = normalized.cpf || normalizeCpf(row.cpfCompleto || row.cpfCliente);
    const name = normalized.nomeCliente || normalizeMatchKey(row.nomeCompleto || row.nomeCliente);
    const vendor = normalized.nomeVendedor || normalizeMatchKey(row.nomeVendedor);
    const city = normalized.cidade || normalizeMatchKey(row.cidade);
    const phone = normalizePhone(row.telefone || row.whatsapp);
    const email = normalizeMatchKey(row.email);

    addToMultiIndex(byCpf, cpf, row);
    addToMultiIndex(byCpfLast3, cpfLast3(cpf), row);
    addToMultiIndex(byPhone, phone, row);
    addToMultiIndex(byEmail, email, row);
    addToMultiIndex(byNameVendor, name && vendor ? `${name}|${vendor}` : "", row);
    addToMultiIndex(byNameCity, name && city ? `${name}|${city}` : "", row);
    addToMultiIndex(byName, name, row);
    name.split(" ").filter((token) => token.length > 2).forEach((token) => addToMultiIndex(byNameToken, token, row));
  });

  return { byCpf, byCpfLast3, byPhone, byEmail, byNameVendor, byNameCity, byName, byNameToken, rows: hydratedRows };
}
