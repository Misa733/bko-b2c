import { pick } from "./excelReader.service.js";
import { SHEET_TYPES } from "./sheetClassifier.service.js";
import { buildComplementaryIndexes, COMPLEMENTARY_SHEETS } from "./complementarySheets.service.js";
import { cpfLast3, scoreComplementaryCandidate } from "./matchScoring.service.js";
import { readCompetencias, readSettings } from "../storage/store.js";
import { clientKey, normalizeCpf, normalizeMatchKey, normalizePhone, normalizeText, normalizeVendorName } from "../utils/normalize.js";

let internalCache = {
  key: "",
  indexes: null,
  diagnosis: null
};

function settingsKey(settings) {
  return `${settings.complementarySyncedAt || settings.atualizadoEm || ""}|${(settings.dadosComplementares || []).length}`;
}

function getInternalIndexes(settings = readSettings()) {
  const key = settingsKey(settings);
  if (!internalCache.indexes || internalCache.key !== key) {
    internalCache = {
      key,
      indexes: buildComplementaryIndexes(settings.dadosComplementares || []),
      diagnosis: null
    };
  }
  return internalCache.indexes;
}

function isValidCpf(cpf = "") {
  const digits = normalizeCpf(cpf);
  return digits.length === 11 && !/^(\d)\1+$/.test(digits);
}

function isValidPhone(phone = "") {
  const digits = normalizePhone(phone);
  return digits.length >= 10 && digits.length <= 13 && !/^(\d)\1+$/.test(digits);
}

function nameLooksInvalid(name = "") {
  const normalized = normalizeMatchKey(name);
  const tokens = normalized.split(" ").filter(Boolean);
  return normalized.length < 5 || tokens.length < 2;
}

function duplicateKey(row) {
  const cpf = normalizeCpf(row.cpfCompleto || row.cpfCliente);
  if (cpf) return `cpf:${cpf}`;
  const name = normalizeMatchKey(row.nomeCompleto || row.nomeCliente);
  const phone = normalizePhone(row.telefone || row.whatsapp);
  if (name && phone) return `nome_phone:${name}|${phone}`;
  return "";
}

function problemList(row, duplicate) {
  const cpf = normalizeCpf(row.cpfCompleto || row.cpfCliente);
  const phone = normalizePhone(row.telefone || row.whatsapp);
  const name = normalizeText(row.nomeCompleto || row.nomeCliente);
  const vendor = normalizeVendorName(row.nomeVendedor);
  const problems = [];

  if (!cpf) problems.push("CPF vazio");
  else if (!isValidCpf(cpf)) problems.push("CPF invalido");
  if (!phone) problems.push("Telefone vazio");
  else if (!isValidPhone(phone)) problems.push("Telefone invalido");
  if (!name) problems.push("Nome cliente vazio");
  else if (nameLooksInvalid(name)) problems.push("Nome incompleto");
  if (!vendor || vendor === "Sem vendedor informado") problems.push("Vendedor vazio");
  if (duplicate) problems.push("Registro duplicado");
  if (!cpf && (!phone || !name || !vendor || vendor === "Sem vendedor informado")) problems.push("Dados insuficientes para cruzamento");

  return problems;
}

export function diagnoseInternalBases(settings = readSettings()) {
  const key = settingsKey(settings);
  if (internalCache.diagnosis && internalCache.key === key) return internalCache.diagnosis;

  const rows = getInternalIndexes(settings).rows;
  const duplicateCounts = new Map();

  rows.forEach((row) => {
    const key = duplicateKey(row);
    if (key) duplicateCounts.set(key, (duplicateCounts.get(key) || 0) + 1);
  });

  const diagnosis = COMPLEMENTARY_SHEETS.map((sheet) => {
    const sheetRows = rows.filter((row) => row.source === sheet.id);
    const columns = Array.from(new Set(sheetRows.flatMap((row) => Object.keys(row.raw || {}))));
    const problems = [];

    sheetRows.forEach((row, index) => {
      const key = duplicateKey(row);
      const rowProblems = problemList(row, key && duplicateCounts.get(key) > 1);
      rowProblems.forEach((problem) => {
        problems.push({
          linha: index + 2,
          nomeCliente: row.nomeCompleto || row.nomeCliente || "",
          cpf: row.cpfCompleto || row.cpfCliente || "",
          telefone: row.telefone || row.whatsapp || "",
          vendedor: row.nomeVendedor || "",
          problema: problem
        });
      });
    });

    return {
      source: sheet.id,
      nome: sheet.name,
      totalLinhas: sheetRows.length,
      colunasEncontradas: columns,
      registrosComCpf: sheetRows.filter((row) => normalizeCpf(row.cpfCompleto || row.cpfCliente)).length,
      registrosComTelefone: sheetRows.filter((row) => normalizePhone(row.telefone || row.whatsapp)).length,
      registrosComNomeCliente: sheetRows.filter((row) => normalizeMatchKey(row.nomeCompleto || row.nomeCliente)).length,
      registrosComVendedor: sheetRows.filter((row) => row.nomeVendedor && row.nomeVendedor !== "Sem vendedor informado").length,
      registrosSemCpf: sheetRows.filter((row) => !normalizeCpf(row.cpfCompleto || row.cpfCliente)).length,
      registrosSemTelefone: sheetRows.filter((row) => !normalizePhone(row.telefone || row.whatsapp)).length,
      registrosDuplicados: sheetRows.filter((row) => {
        const key = duplicateKey(row);
        return key && duplicateCounts.get(key) > 1;
      }).length,
      registrosNomeInvalido: sheetRows.filter((row) => nameLooksInvalid(row.nomeCompleto || row.nomeCliente)).length,
      problemas: problems
    };
  });
  internalCache.diagnosis = diagnosis;
  return diagnosis;
}

function brisaBaseFromRaw(raw = {}) {
  const map = new Map();
  [
    SHEET_TYPES.CLIENTES_ATIVOS,
    SHEET_TYPES.VENCIMENTOS,
    SHEET_TYPES.INADIMPLENCIA,
    SHEET_TYPES.PAGAMENTOS_FATURAS
  ].forEach((type) => {
    (raw[type] || []).forEach((row) => {
      const base = {
        cpfCliente: pick(row, ["CPF Cliente"]),
        nomeCliente: pick(row, ["Nome Cliente"]),
        nomeVendedor: pick(row, ["Nome Vendedor"]),
        cidade: pick(row, ["Cidade"])
      };
      const key = clientKey(base);
      if (!map.has(key)) {
        map.set(key, {
          cpfCliente: normalizeCpf(base.cpfCliente),
          nomeCliente: normalizeText(base.nomeCliente || "Cliente sem nome"),
          nomeVendedor: normalizeVendorName(base.nomeVendedor),
          cidade: normalizeText(base.cidade),
          normalizedName: normalizeMatchKey(base.nomeCliente || "Cliente sem nome"),
          normalizedVendor: normalizeMatchKey(base.nomeVendedor),
          fontesBrisa: []
        });
      }
      const current = map.get(key);
      current.cpfCliente = current.cpfCliente || normalizeCpf(base.cpfCliente);
      current.nomeCliente = normalizeText(base.nomeCliente || current.nomeCliente);
      current.nomeVendedor = normalizeVendorName(base.nomeVendedor || current.nomeVendedor);
      current.cidade = normalizeText(base.cidade || current.cidade);
      current.normalizedName = normalizeMatchKey(current.nomeCliente);
      current.normalizedVendor = normalizeMatchKey(current.nomeVendedor);
      if (!current.fontesBrisa.includes(type)) current.fontesBrisa.push(type);
    });
  });
  return Array.from(map.values());
}

function scoreName(left = "", right = "") {
  return scoreNormalizedNames(normalizeMatchKey(left), normalizeMatchKey(right));
}

function scoreNormalizedNames(left = "", right = "") {
  const a = left.split(" ").filter((token) => token.length > 2);
  const b = right.split(" ").filter((token) => token.length > 2);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((token) => setB.has(token)).length;
  const containment = left.includes(right) || right.includes(left);
  return Math.min(100, Math.round((hits / Math.max(a.length, b.length)) * 100) + (containment ? 20 : 0));
}

function uniqueRows(rows = []) {
  const map = new Map();
  rows.forEach((row) => {
    const key = `${row.source}|${row.cpfCompleto || row.cpfCliente}|${normalizeMatchKey(row.nomeCompleto || row.nomeCliente)}|${row.telefone || row.whatsapp}`;
    map.set(key, row);
  });
  return Array.from(map.values());
}

function approximateCandidates(client, indexes) {
  const name = client.normalizedName || normalizeMatchKey(client.nomeCliente);
  const tokens = name.split(" ").filter((token) => token.length > 2);
  const candidateMap = new Map();

  tokens.forEach((token) => {
    (indexes.byNameToken?.get(token) || []).forEach((row) => {
      const key = `${row.source}|${row.cpfCompleto || row.cpfCliente}|${normalizeMatchKey(row.nomeCompleto || row.nomeCliente)}|${row.telefone || row.whatsapp}`;
      candidateMap.set(key, row);
    });
  });

  return uniqueRows(Array.from(candidateMap.values()))
    .map((row) => {
      const scoring = scoreComplementaryCandidate(client, row);
      return {
      ...row,
      source: row.source,
      nomeCliente: row.nomeCompleto || row.nomeCliente || "",
      cpf: row.cpfCompleto || row.cpfCliente || "",
      telefone: row.telefone || row.whatsapp || "",
      vendedor: row.nomeVendedor || "",
      score: scoring.score,
      scoreCriteria: scoring.criteria
      };
    })
    .filter((row) => row.score >= 50)
    .sort((a, b) => b.score - a.score)
    .slice(0, 5);
}

function classifyCrossMatch(client, indexes) {
  const cpf = normalizeCpf(client.cpfCliente);
  const name = client.normalizedName || normalizeMatchKey(client.nomeCliente);
  const vendor = client.normalizedVendor || normalizeMatchKey(client.nomeVendedor);
  const phone = normalizePhone(client.telefone || client.whatsapp);
  const email = normalizeMatchKey(client.email);

  const attempts = [];
  if (cpfLast3(cpf)) attempts.push(indexes.byCpfLast3?.get(cpfLast3(cpf)) || []);
  if (phone) attempts.push(indexes.byPhone?.get(phone) || []);
  if (email) attempts.push(indexes.byEmail?.get(email) || []);
  if (name && vendor) attempts.push(indexes.byNameVendor.get(`${name}|${vendor}`) || []);
  if (name) attempts.push(indexes.byName.get(name) || []);
  attempts.push(approximateCandidates(client, indexes));

  const candidates = uniqueRows(attempts.flat()).map((row) => {
    const scoring = scoreComplementaryCandidate(client, row);
    return { ...row, score: scoring.score, scoreCriteria: scoring.criteria };
  }).filter((row) => row.score >= 50).sort((a, b) => b.score - a.score);

  if (!candidates.length) return { status: "sem_match", method: "sem_match", candidates: [] };
  if (candidates[0].score >= 70) {
    if (candidates[1]?.score >= candidates[0].score - 5 && candidates[1]?.score >= 70) return { status: "ambiguous", method: "score", candidates };
    return { status: "matched", method: "score", candidates };
  }
  return { status: "possible", method: "score", candidates };
}

function sampleClient(client, result) {
  const best = result.candidates?.[0] || {};
  return {
    nomeBrisa: client.nomeCliente,
    vendedorBrisa: client.nomeVendedor,
    cpfBrisa: client.cpfCliente,
    metodo: result.method,
    status: result.status,
    candidato: best.nomeCompleto || best.nomeCliente || "",
    telefone: best.telefone || best.whatsapp || "",
    cpfCandidato: best.cpfCompleto || best.cpfCliente || best.cpf || "",
    source: best.source || "",
    score: best.score || (best.nomeCompleto || best.nomeCliente ? scoreName(client.nomeCliente, best.nomeCompleto || best.nomeCliente) : ""),
    criteriosScore: (best.scoreCriteria || []).map((criterion) => `${criterion.label} (+${criterion.points})`).join("; ")
  };
}

export function buildCrossTest(competenciaId, settings = readSettings()) {
  const competencia = readCompetencias().find((item) => item.id === competenciaId);
  if (!competencia) {
    const error = new Error("Competencia nao encontrada.");
    error.status = 404;
    throw error;
  }

  const indexes = getInternalIndexes(settings);
  const clients = brisaBaseFromRaw(competencia.rawData || {});
  const results = clients.map((client) => ({ client, result: classifyCrossMatch(client, indexes) }));
  const matched = results.filter((item) => item.result.status === "matched");
  const possible = results.filter((item) => item.result.status === "possible");
  const semMatch = results.filter((item) => item.result.status === "sem_match");
  const ambiguous = results.filter((item) => item.result.status === "ambiguous");

  return {
    competencia: { id: competencia.id, nome: competencia.nome },
    resumo: {
      totalClientesBrisa: clients.length,
      totalClientesEncontrados: matched.length,
      totalSemCorrespondencia: semMatch.length,
      totalPorCpf: matched.filter((item) => (item.result.candidates?.[0]?.scoreCriteria || []).some((criterion) => criterion.label.includes("CPF"))).length,
      totalPorNomeVendedor: matched.filter((item) => (item.result.candidates?.[0]?.scoreCriteria || []).some((criterion) => criterion.label === "Mesmo vendedor")).length,
      totalPorNome: matched.filter((item) => (item.result.candidates?.[0]?.scoreCriteria || []).some((criterion) => criterion.label.includes("Nome"))).length,
      totalPorNomeAproximado: possible.length,
      totalAmbiguo: ambiguous.length
    },
    exemplosBons: matched.slice(0, 20).map((item) => sampleClient(item.client, item.result)),
    exemplosSemMatch: semMatch.slice(0, 50).map((item) => ({
      ...sampleClient(item.client, item.result),
      possiveisNomesParecidos: item.result.candidates || []
    })),
    exemplosComCandidatos: possible.slice(0, 50).map((item) => ({
      ...sampleClient(item.client, item.result),
      possiveisNomesParecidos: item.result.candidates
    })),
    exemplosAmbiguos: ambiguous.slice(0, 20).map((item) => ({
      ...sampleClient(item.client, item.result),
      possiveisNomesParecidos: item.result.candidates.slice(0, 5).map((row) => ({
        source: row.source,
        nomeCliente: row.nomeCompleto || row.nomeCliente || "",
        cpf: row.cpfCompleto || row.cpfCliente || "",
        telefone: row.telefone || row.whatsapp || "",
        vendedor: row.nomeVendedor || "",
        score: scoreName(item.client.nomeCliente, row.nomeCompleto || row.nomeCliente)
      }))
    }))
  };
}
