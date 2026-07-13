import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
export const storageDir = __dirname;
export const storageDataDir = path.join(__dirname, "data");
export const competenciasCacheDir = path.join(__dirname, "competencias");
const storageFile = path.join(__dirname, "competencias.json");
const settingsFile = path.join(__dirname, "settings.json");

export function ensureStorageDirs() {
  fs.mkdirSync(storageDir, { recursive: true });
  fs.mkdirSync(storageDataDir, { recursive: true });
  fs.mkdirSync(competenciasCacheDir, { recursive: true });
}

export function competenciaCacheDir(id) {
  ensureStorageDirs();
  const dir = path.join(competenciasCacheDir, String(id));
  fs.mkdirSync(dir, { recursive: true });
  fs.mkdirSync(path.join(dir, "raw"), { recursive: true });
  return dir;
}

export function writeJsonFile(filePath, data) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, JSON.stringify(data, null, 2));
}

export function readJsonFile(filePath, fallback = null) {
  if (!fs.existsSync(filePath)) return fallback;
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

export function writeCompetenciaRawCache(id, rawData = {}) {
  const rawDir = path.join(competenciaCacheDir(id), "raw");
  Object.entries(rawData).forEach(([type, rows]) => {
    writeJsonFile(path.join(rawDir, `${type}.json`), rows || []);
  });
}

export function writeConsolidatedCache(id, data) {
  const dir = competenciaCacheDir(id);
  writeJsonFile(path.join(dir, "consolidated.json"), data);
  writeJsonFile(path.join(dir, "clients.json"), data?.clientes || []);
  writeJsonFile(path.join(dir, "sellers.json"), data?.vendedores || []);
  writeJsonFile(path.join(dir, "dashboard.json"), data?.dashboard || {});
  writeJsonFile(path.join(dir, "audit.json"), data?.auditoria || {});
}

export function clearConsolidatedCache(id) {
  const dir = competenciaCacheDir(id);
  ["consolidated.json", "clients.json", "sellers.json", "dashboard.json", "audit.json"].forEach((fileName) => {
    const filePath = path.join(dir, fileName);
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  });
}

export function readConsolidatedCache(id, name) {
  return readJsonFile(path.join(competenciaCacheDir(id), `${name}.json`), null);
}

export function hasConsolidatedCache(id) {
  return fs.existsSync(path.join(competenciaCacheDir(id), "consolidated.json"));
}

export function ensureConsolidatedCacheFromCompetencia(competencia) {
  if (!competencia?.id || hasConsolidatedCache(competencia.id) || !competencia.dadosConsolidados) return;
  writeConsolidatedCache(competencia.id, competencia.dadosConsolidados);
}

function seedData() {
  const now = new Date().toISOString();
  return [
    {
      id: "demo-julho-2026",
      nome: "Julho/2026",
      dataInicio: "2026-07-01",
      dataFim: "2026-07-31",
      observacao: "Competencia demonstrativa com dados mockados.",
      criadoEm: now,
      arquivosImportados: [],
      rawData: {
        CLIENTES_ATIVOS: [
          { "Nome Parceiro": "Agil", "Nome Vendedor": "Ana Souza", "Nome Cliente": "Marina Lima", "CPF Cliente": "111.222.333-44", "Inicio Contrato": "01/07/2026", "Intercambio CPF": 0, "Qtd Ativos": 1 },
          { "Nome Parceiro": "Agil", "Nome Vendedor": "Bruno Costa", "Nome Cliente": "Carlos Nunes", "CPF Cliente": "222.333.444-55", "Inicio Contrato": "03/07/2026", "Intercambio CPF": 1, "Qtd Ativos": 1 },
          { "Nome Parceiro": "Agil", "Nome Vendedor": "Ana Souza", "Nome Cliente": "Paula Rocha", "CPF Cliente": "", "Inicio Contrato": "05/07/2026", "Intercambio CPF": 0, "Qtd Ativos": 1 }
        ],
        VENCIMENTOS: [
          { "Nome Vendedor": "Ana Souza", "Nome Cliente": "Marina Lima", "CPF Cliente": "11122233344", "Inicio Contrato": "01/07/2026", "Dt Vencimento": "10/07/2026", "Dias Vencidos": 0 },
          { "Nome Vendedor": "Bruno Costa", "Nome Cliente": "Carlos Nunes", "CPF Cliente": "22233344455", "Inicio Contrato": "03/07/2026", "Dt Vencimento": "12/07/2026", "Dias Vencidos": 18 },
          { "Nome Vendedor": "Ana Souza", "Nome Cliente": "Paula Rocha", "CPF Cliente": "", "Inicio Contrato": "05/07/2026", "Dt Vencimento": "15/07/2026", "Dias Vencidos": 7 }
        ],
        INADIMPLENCIA: [
          { "Nome Vendedor": "Bruno Costa", "Nome Cliente": "Carlos Nunes", "CPF Cliente": "22233344455", "Inicio Contrato": "03/07/2026", "Qt. Nao Pagou 1a Fat.": 1, "Fat. Pendente": 1, "Media dias atraso": 18 }
        ],
        PAGAMENTOS_FATURAS: [
          { "Nome Parceiro": "Agil", "Nome Vendedor": "Ana Souza", "Nome Cliente": "Marina Lima", "Inicio Contrato": "01/07/2026", "Dt. Pagto 1a Fatura": "14/07/2026", "Qt. Pagou 1a Fat.": 1, "Qt. Pagou 2a Fat.": 1 },
          { "Nome Parceiro": "Agil", "Nome Vendedor": "Ana Souza", "Nome Cliente": "Paula Rocha", "Inicio Contrato": "05/07/2026", "Dt. Pagto 1a Fatura": "18/07/2026", "Qt. Pagou 1a Fat.": 1, "Qt. Pagou 2a Fat.": 0 }
        ],
        QUALIDADE: [
          { "Nome Vendedor": "Ana Souza", "Intercambio CPF": 0, "Qtd. Contestacoes": 1, "Qtd. sem Consumo": 0, "Qtd. Full Roaming": 0, "TKM Entrada": 119.9 },
          { "Nome Vendedor": "Bruno Costa", "Intercambio CPF": 1, "Qtd. Contestacoes": 4, "Qtd. sem Consumo": 2, "Qtd. Full Roaming": 1, "TKM Entrada": 99.9 }
        ],
        CHURN_SAFRA: [
          { "Nome Vendedor": "Ana Souza", "Canc. Safra": 0, "Churn Safra": 0.08 },
          { "Nome Vendedor": "Bruno Costa", "Canc. Safra": 2, "Churn Safra": 0.38 }
        ]
      },
      dadosConsolidados: null
    }
  ];
}

export function readCompetencias() {
  ensureStorageDirs();
  if (!fs.existsSync(storageFile)) {
    writeCompetencias(seedData());
  }
  try {
    return JSON.parse(fs.readFileSync(storageFile, "utf8"));
  } catch (error) {
    throw new Error(`Nao foi possivel ler competencias.json. ${error.message}`);
  }
}

export function writeCompetencias(data) {
  ensureStorageDirs();
  fs.writeFileSync(storageFile, JSON.stringify(data, null, 2));
}

export function findCompetencia(id) {
  return readCompetencias().find((item) => item.id === id);
}

export function saveCompetencia(updated) {
  const competencias = readCompetencias();
  const index = competencias.findIndex((item) => item.id === updated.id);
  if (index >= 0) competencias[index] = updated;
  else competencias.push(updated);
  writeCompetencias(competencias);
  return updated;
}

const defaultSettings = {
  planilhasComplementaresStatus: [],
  dadosComplementares: []
};

export function readSettings() {
  ensureStorageDirs();
  if (!fs.existsSync(settingsFile)) {
    writeSettings(defaultSettings);
  }
  try {
    return JSON.parse(fs.readFileSync(settingsFile, "utf8"));
  } catch (error) {
    throw new Error(`Nao foi possivel ler settings.json. ${error.message}`);
  }
}

export function writeSettings(data) {
  ensureStorageDirs();
  fs.writeFileSync(settingsFile, JSON.stringify(data, null, 2));
}
