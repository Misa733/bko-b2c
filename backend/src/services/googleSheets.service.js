import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(__dirname, "../..");
const projectDir = path.resolve(backendDir, "..");
const SCOPES = [
  "https://www.googleapis.com/auth/spreadsheets.readonly",
  "https://www.googleapis.com/auth/drive.metadata.readonly"
];

class GoogleSheetsUserError extends Error {
  constructor(message, status = 400, details = null) {
    super(message);
    this.name = "GoogleSheetsUserError";
    this.status = status;
    this.details = details;
  }
}

export function extractSpreadsheetId(spreadsheetUrlOrId = "") {
  const value = String(spreadsheetUrlOrId).trim();
  if (!value) return "";

  const urlMatch = value.match(/\/spreadsheets\/d\/([a-zA-Z0-9-_]+)/);
  if (urlMatch) return urlMatch[1];

  const idMatch = value.match(/^[a-zA-Z0-9-_]{20,}$/);
  return idMatch ? value : "";
}

function envInfo() {
  const rootEnvPath = path.resolve(projectDir, ".env");
  const backendEnvPath = path.resolve(backendDir, ".env");
  const envFiles = [rootEnvPath, backendEnvPath].map((filePath) => ({
    path: filePath,
    exists: fs.existsSync(filePath)
  }));

  return {
    envLoaded: envFiles.some((item) => item.exists),
    envFiles
  };
}

function safeJsonParse(rawJson, source) {
  try {
    return JSON.parse(rawJson);
  } catch {
    throw new GoogleSheetsUserError(`JSON invalido em ${source}.`, 400);
  }
}

function validateServiceAccountJson(credentials, source) {
  if (!credentials || typeof credentials !== "object") {
    throw new GoogleSheetsUserError(`JSON invalido em ${source}.`, 400);
  }
  if (!credentials.client_email) {
    throw new GoogleSheetsUserError(`client_email ausente em ${source}.`, 400);
  }
  if (!credentials.private_key) {
    throw new GoogleSheetsUserError(`private_key ausente em ${source}.`, 400);
  }
  return credentials;
}

function credentialFileCandidates() {
  const candidates = [];
  const envPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (envPath) {
    candidates.push({
      source: "GOOGLE_APPLICATION_CREDENTIALS",
      path: path.isAbsolute(envPath) ? envPath : path.resolve(backendDir, envPath)
    });
    candidates.push({
      source: "GOOGLE_APPLICATION_CREDENTIALS via process.cwd()",
      path: path.isAbsolute(envPath) ? envPath : path.resolve(process.cwd(), envPath)
    });
  }

  candidates.push({
    source: "backend/credentials/service-account.json",
    path: path.resolve(backendDir, "credentials", "service-account.json")
  });
  candidates.push({
    source: "credentials/service-account.json",
    path: path.resolve(process.cwd(), "credentials", "service-account.json")
  });
  candidates.push({
    source: "project backend/credentials/service-account.json",
    path: path.resolve(projectDir, "backend", "credentials", "service-account.json")
  });

  const unique = new Map();
  candidates.forEach((candidate) => {
    if (!unique.has(candidate.path)) unique.set(candidate.path, candidate);
  });
  return Array.from(unique.values());
}

function loadCredentials() {
  const attempts = [];
  const rawJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON || process.env.GOOGLE_CREDENTIALS_JSON;

  if (rawJson) {
    const source = process.env.GOOGLE_SERVICE_ACCOUNT_JSON ? "GOOGLE_SERVICE_ACCOUNT_JSON" : "GOOGLE_CREDENTIALS_JSON";
    attempts.push({ source, exists: true, message: "Variavel JSON encontrada." });
    const credentials = validateServiceAccountJson(safeJsonParse(rawJson, source), source);
    return {
      mode: "json_env",
      credentials,
      keyFile: "",
      attempts,
      serviceAccountEmail: credentials.client_email
    };
  }

  attempts.push({
    source: "GOOGLE_SERVICE_ACCOUNT_JSON",
    exists: false,
    message: "GOOGLE_SERVICE_ACCOUNT_JSON nao definida."
  });
  if (!process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    attempts.push({
      source: "GOOGLE_APPLICATION_CREDENTIALS",
      exists: false,
      message: "GOOGLE_APPLICATION_CREDENTIALS nao definida."
    });
  }

  for (const candidate of credentialFileCandidates()) {
    const exists = fs.existsSync(candidate.path);
    attempts.push({
      source: candidate.source,
      path: candidate.path,
      exists,
      message: exists ? "Arquivo service-account.json encontrado." : `Arquivo nao encontrado: ${candidate.path}`
    });
    if (!exists) continue;

    const raw = fs.readFileSync(candidate.path, "utf8");
    const credentials = validateServiceAccountJson(safeJsonParse(raw, candidate.path), candidate.path);
    return {
      mode: "key_file",
      credentials,
      keyFile: candidate.path,
      attempts,
      serviceAccountEmail: credentials.client_email
    };
  }

  throw new GoogleSheetsUserError(
    "Credencial da Service Account nao encontrada. Defina GOOGLE_SERVICE_ACCOUNT_JSON, GOOGLE_APPLICATION_CREDENTIALS ou crie backend/credentials/service-account.json.",
    400,
    { attempts }
  );
}

async function getGoogleApis() {
  const { google } = await import("googleapis");
  return google;
}

function buildGoogleAuth(google, resolved) {
  if (process.env.GOOGLE_AUTH_MODE && process.env.GOOGLE_AUTH_MODE !== "service_account") {
    throw new GoogleSheetsUserError("GOOGLE_AUTH_MODE deve ser service_account.", 400);
  }

  if (resolved.mode === "json_env") {
    return new google.auth.GoogleAuth({ credentials: resolved.credentials, scopes: SCOPES });
  }

  return new google.auth.GoogleAuth({ keyFile: resolved.keyFile, scopes: SCOPES });
}

async function getAuth(google) {
  const resolved = loadCredentials();
  return buildGoogleAuth(google, resolved);
}

function buildRange(sheetName) {
  const safeName = String(sheetName || "").trim().replace(/'/g, "''");
  if (!safeName) {
    throw new GoogleSheetsUserError("Informe o nome da aba da planilha.", 400);
  }
  return `'${safeName}'!A:Z`;
}

function mapGoogleSheetsError(error) {
  if (error instanceof GoogleSheetsUserError) return error;

  const status = error?.response?.status || error?.code;
  const reason = error?.response?.data?.error?.errors?.[0]?.reason;
  const message = error?.response?.data?.error?.message || error?.message || "";

  if (/Link invalido|ID ou link/i.test(message)) {
    return new GoogleSheetsUserError("Link invalido.", 400);
  }

  if (/Aba nao encontrada/i.test(message)) {
    return new GoogleSheetsUserError(message, 400);
  }

  if (status === 403 && ["accessNotConfigured", "serviceDisabled"].includes(reason)) {
    return new GoogleSheetsUserError("Google Sheets API ou Google Drive API nao ativada no projeto da Service Account.", 403);
  }

  if (status === 403) {
    return new GoogleSheetsUserError(
      "Sem permissao para acessar a planilha. Compartilhe a planilha privada com o email da Service Account.",
      403
    );
  }

  if (status === 404) {
    return new GoogleSheetsUserError("Planilha nao encontrada. Verifique se o ID ou link esta correto.", 404);
  }

  if (status === 400 && /Unable to parse range|not found|Cannot find/i.test(message)) {
    return new GoogleSheetsUserError("Aba nao encontrada. Verifique o nome informado exatamente como aparece na planilha.", 400);
  }

  if (status === 400) {
    return new GoogleSheetsUserError("ID ou link da planilha invalido.", 400);
  }

  return new GoogleSheetsUserError("Nao foi possivel conectar ao Google Sheets. Verifique credenciais, permissao e APIs ativas.", 500);
}

export function toUserGoogleSheetsError(error) {
  return mapGoogleSheetsError(error);
}

export async function diagnoseGoogleSheetsAuth({ checkApis = false, spreadsheetId = "" } = {}) {
  const info = envInfo();
  const diagnostics = {
    envLoaded: info.envLoaded,
    envFiles: info.envFiles,
    googleApplicationCredentialsDefined: Boolean(process.env.GOOGLE_APPLICATION_CREDENTIALS),
    credentialsFileExists: false,
    credentialsPath: "",
    googleAuthConfigured: false,
    serviceAccountEmail: "",
    driveApiEnabled: false,
    sheetsApiEnabled: false,
    attempts: [],
    error: ""
  };

  try {
    const resolved = loadCredentials();
    diagnostics.attempts = resolved.attempts;
    diagnostics.credentialsFileExists = resolved.mode === "json_env" ? true : fs.existsSync(resolved.keyFile);
    diagnostics.credentialsPath = resolved.mode === "json_env" ? "GOOGLE_SERVICE_ACCOUNT_JSON" : resolved.keyFile;
    diagnostics.serviceAccountEmail = resolved.serviceAccountEmail;

    const google = await getGoogleApis();
    const auth = buildGoogleAuth(google, resolved);
    await auth.getClient();
    diagnostics.googleAuthConfigured = true;

    if (checkApis && spreadsheetId) {
      const sheets = google.sheets({ version: "v4", auth });
      const drive = google.drive({ version: "v3", auth });

      try {
        await sheets.spreadsheets.get({ spreadsheetId, fields: "spreadsheetId" });
        diagnostics.sheetsApiEnabled = true;
      } catch (error) {
        const mapped = mapGoogleSheetsError(error);
        diagnostics.sheetsApiEnabled = false;
        diagnostics.sheetsApiError = mapped.message;
      }

      try {
        await drive.files.get({ fileId: spreadsheetId, fields: "id", supportsAllDrives: true });
        diagnostics.driveApiEnabled = true;
      } catch (error) {
        const mapped = mapGoogleSheetsError(error);
        diagnostics.driveApiEnabled = false;
        diagnostics.driveApiError = mapped.message;
      }
    } else {
      diagnostics.driveApiEnabled = diagnostics.googleAuthConfigured;
      diagnostics.sheetsApiEnabled = diagnostics.googleAuthConfigured;
    }
  } catch (error) {
    const mapped = mapGoogleSheetsError(error);
    diagnostics.error = mapped.message;
    diagnostics.attempts = mapped.details?.attempts || diagnostics.attempts;
  }

  return diagnostics;
}

export async function assertGoogleSheetsAuthReady() {
  const diagnostics = await diagnoseGoogleSheetsAuth();
  if (!diagnostics.googleAuthConfigured) {
    throw new GoogleSheetsUserError(diagnostics.error || "GoogleAuth nao configurado.", 400, diagnostics);
  }
  return diagnostics;
}

export async function logGoogleSheetsDiagnostics() {
  const diagnostics = await diagnoseGoogleSheetsAuth();
  console.log("[Google Sheets]");
  console.log(diagnostics.envLoaded ? ".env carregado" : ".env nao encontrado");
  diagnostics.envFiles.forEach((file) => {
    console.log(`${file.exists ? "OK" : "FALHA"} ${file.path}`);
  });
  diagnostics.attempts.forEach((attempt) => {
    console.log(`${attempt.exists ? "OK" : "FALHA"} ${attempt.message}`);
  });

  if (diagnostics.googleAuthConfigured) {
    console.log("Credenciais encontradas");
    console.log(`Service Account: ${diagnostics.serviceAccountEmail}`);
    console.log("GoogleAuth criado com sucesso");
  } else {
    console.log(`Falha: ${diagnostics.error}`);
  }
}

export async function createSheetsClient() {
  const google = await getGoogleApis();
  const auth = await getAuth(google);
  return google.sheets({ version: "v4", auth });
}

export async function getSpreadsheetMetadata(spreadsheetId) {
  try {
    const sheets = await createSheetsClient();
    const response = await sheets.spreadsheets.get({
      spreadsheetId,
      fields: "sheets.properties.title"
    });
    return response.data;
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

export async function readSheetValues(spreadsheetId, sheetName) {
  try {
    const sheets = await createSheetsClient();
    const response = await sheets.spreadsheets.values.get({
      spreadsheetId,
      range: buildRange(sheetName)
    });
    return response.data.values || [];
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

export async function testGoogleSheetsConnection({ spreadsheetUrl, spreadsheetId, sheetName }) {
  const resolvedSpreadsheetId = extractSpreadsheetId(spreadsheetId || spreadsheetUrl);
  if (!resolvedSpreadsheetId) {
    throw new GoogleSheetsUserError("ID ou link da planilha invalido.", 400);
  }

  try {
    const values = await readSheetValues(resolvedSpreadsheetId, sheetName);
    const headers = values[0] || [];

    return {
      success: true,
      spreadsheetId: resolvedSpreadsheetId,
      sheetName,
      totalRows: values.length,
      headers,
      preview: values.slice(1, 6)
    };
  } catch (error) {
    throw mapGoogleSheetsError(error);
  }
}

export { GoogleSheetsUserError };
