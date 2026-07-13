import { pick } from "./excelReader.service.js";
import { SHEET_TYPES, expectedSheetStatus } from "./sheetClassifier.service.js";
import { parseExcelDate } from "../utils/date.js";
import { readSettings } from "../storage/store.js";
import { buildComplementaryIndexes } from "./complementarySheets.service.js";
import { cpfLast3, scoreComplementaryCandidate, scoreConfidence } from "./matchScoring.service.js";
import {
  clientKey,
  normalizeCpf,
  normalizeKey,
  normalizeMatchKey,
  normalizePhone,
  normalizeText,
  normalizeVendorName,
  percent,
  toBooleanFromPositive,
  toNumber
} from "../utils/normalize.js";

function emptyClient(row = {}) {
  return {
    cpfCliente: normalizeCpf(row.cpfCliente),
    nomeCliente: normalizeText(row.nomeCliente || "Cliente sem nome"),
    nomeVendedor: normalizeVendorName(row.nomeVendedor),
    nomeParceiro: normalizeText(row.nomeParceiro),
    telefone: normalizeText(row.telefone),
    whatsapp: normalizeText(row.whatsapp),
    cidade: normalizeText(row.cidade),
    estado: "",
    bairro: "",
    endereco: normalizeText(row.endereco),
    cep: "",
    email: "",
    consultor: normalizeText(row.consultor),
    observacoes: normalizeText(row.observacoes),
    origemComplementar: "",
    confidence: "baixa",
    matchedBy: "sem_match",
    dadosComplementares: {},
    complementaryData: null,
    complementaryRawData: {},
    confirmedComplementaryMatch: null,
    possibleComplementaryMatches: [],
    matchCandidates: [],
    rawMatches: [],
    fieldOrigins: {},
    dataSources: {
      brisaVencimentos: false,
      brisaInadimplencia: false,
      brisaPagamentos: false,
      brisaAtivos: false,
      complementar1: false,
      complementar2: false
    },
    matchInfo: {
      hasComplementaryMatch: false,
      complementarySources: [],
      matchedBy: "sem_match",
      confidence: "baixa",
      warnings: []
    },
    matchStatus: "sem_match",
    nomeClienteBrisa: normalizeText(row.nomeCliente || "Cliente sem nome"),
    nomeClienteComplementar: "",
    cpfCompleto: "",
    inicioContrato: parseExcelDate(row.inicioContrato),
    vencimentoPrimeiraFatura: "",
    vencimentoSegundaFatura: "",
    statusPrimeiraFatura: "Sem informacao",
    statusSegundaFatura: "Sem informacao",
    ativo: false,
    qtdAtivos: 0,
    dtVencimento: "",
    diasVencidos: 0,
    statusAtraso: "Sem informacao",
    faturaAindaNaoVenceu: false,
    naoPagouPrimeiraFatura: false,
    fatPendente: 0,
    mediaDiasAtraso: 0,
    qtdPagouPrimeiraFatura: 0,
    qtdPagouSegundaFatura: 0,
    pagouPrimeiraFatura: false,
    pagouSegundaFatura: false,
    dataPagamentoPrimeiraFatura: "",
    dataPagamentoSegundaFatura: "",
    inadimplenteOperacional: false,
    motivoInadimplencia: "",
    alertas: []
  };
}

function atrasoStatus(days) {
  if (!days || days <= 0) return "Em dia";
  if (days <= 5) return "Atencao";
  if (days <= 15) return "Atraso moderado";
  return "Atraso critico";
}

function toUtcDate(value) {
  if (!value) return null;
  const parsed = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function diffDays(from, to) {
  const start = toUtcDate(from);
  const end = toUtcDate(to);
  if (!start || !end) return 0;
  return Math.floor((end.getTime() - start.getTime()) / 86400000);
}

function addDays(value, days) {
  const date = toUtcDate(value);
  if (!date) return "";
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function paymentStatus({ paid, contractStart, dueDate, referenceDate }) {
  if (paid) return "Pago";
  if (!contractStart || !dueDate) return "Sem informacao";
  if (dueDate > referenceDate) return "Aguardando vencimento";
  return "Em atraso";
}

function referenceDateForCompetencia(competencia) {
  const today = new Date().toISOString().slice(0, 10);
  if (competencia.dataFim && competencia.dataFim < today) return competencia.dataFim;
  return today;
}

function addAlert(client, alert) {
  if (alert && !client.alertas.includes(alert)) client.alertas.push(alert);
}

function addWarning(client, warning) {
  if (warning && !client.matchInfo.warnings.includes(warning)) client.matchInfo.warnings.push(warning);
}

function markSource(client, source) {
  if (source === SHEET_TYPES.CLIENTES_ATIVOS) client.dataSources.brisaAtivos = true;
  if (source === SHEET_TYPES.VENCIMENTOS) client.dataSources.brisaVencimentos = true;
  if (source === SHEET_TYPES.INADIMPLENCIA) client.dataSources.brisaInadimplencia = true;
  if (source === SHEET_TYPES.PAGAMENTOS_FATURAS) client.dataSources.brisaPagamentos = true;
}

function getClient(map, raw) {
  const base = {
    cpfCliente: pick(raw, ["CPF Cliente"]),
    nomeCliente: pick(raw, ["Nome Cliente"]),
    nomeVendedor: pick(raw, ["Nome Vendedor"]),
    nomeParceiro: pick(raw, ["Nome Parceiro"]),
    telefone: pick(raw, ["Telefone", "Celular", "WhatsApp"]),
    whatsapp: pick(raw, ["WhatsApp", "Whatsapp"]),
    cidade: pick(raw, ["Cidade"]),
    email: pick(raw, ["Email", "E-mail", "E mail"]),
    endereco: pick(raw, ["Endereco", "Endereço"]),
    consultor: pick(raw, ["Consultor"]),
    observacoes: pick(raw, ["Observacoes", "Observações", "Obs"]),
    inicioContrato: pick(raw, ["Inicio Contrato"])
  };
  let key = clientKey(base);
  const fallbackKey = `nome:${normalizeKey(base.nomeCliente)}|vendedor:${normalizeKey(base.nomeVendedor)}`;
  if (!normalizeCpf(base.cpfCliente)) {
    const existing = Array.from(map.entries()).find(([, client]) =>
      `nome:${normalizeKey(client.nomeCliente)}|vendedor:${normalizeKey(client.nomeVendedor)}` === fallbackKey
    );
    if (existing) key = existing[0];
  }
  if (!map.has(key)) map.set(key, emptyClient(base));
  const client = map.get(key);
  client.cpfCliente = client.cpfCliente || normalizeCpf(base.cpfCliente);
  client.nomeCliente = normalizeText(base.nomeCliente || client.nomeCliente);
  client.nomeVendedor = normalizeVendorName(base.nomeVendedor || client.nomeVendedor);
  client.nomeParceiro = normalizeText(base.nomeParceiro || client.nomeParceiro);
  client.telefone = normalizeText(base.telefone || client.telefone);
  client.whatsapp = normalizeText(base.whatsapp || client.whatsapp);
  client.cidade = normalizeText(base.cidade || client.cidade);
  client.email = normalizeText(base.email || client.email);
  client.endereco = normalizeText(base.endereco || client.endereco);
  client.consultor = normalizeText(base.consultor || client.consultor);
  client.observacoes = normalizeText(base.observacoes || client.observacoes);
  client.inicioContrato = parseExcelDate(base.inicioContrato) || client.inicioContrato;
  return client;
}

function aggregateVendors(clients, rawData) {
  const vendors = new Map();
  const ensureVendor = (name) => {
    const normalized = normalizeVendorName(name);
    const key = normalizeKey(normalized);
    if (!vendors.has(key)) {
      vendors.set(key, {
        nomeVendedor: normalized,
        totalClientes: 0,
        clientesAtivos: 0,
        clientesInadimplentes: 0,
        clientesEmAtraso: 0,
        clientesAtrasoCritico: 0,
        clientesNaoPagaramPrimeiraFatura: 0,
        clientesPagaramPrimeiraFatura: 0,
        clientesPagaramSegundaFatura: 0,
        clientesComSegundaFaturaPendente: 0,
        taxaPagamentoPrimeiraFatura: 0,
        taxaPagamentoSegundaFatura: 0,
        fatPendenteTotal: 0,
        mediaDiasAtraso: 0,
        intercambioCpf: 0,
        qtdContestacoes: 0,
        qtdSemConsumo: 0,
        qtdFullRoaming: 0,
        tkmEntrada: 0,
        cancelamentosSafra: 0,
        churnSafra: 0,
        alertas: []
      });
    }
    return vendors.get(key);
  };

  clients.forEach((client) => {
    const vendor = ensureVendor(client.nomeVendedor);
    vendor.totalClientes += 1;
    vendor.clientesAtivos += client.ativo ? 1 : 0;
    vendor.clientesInadimplentes += client.inadimplenteOperacional ? 1 : 0;
    vendor.clientesEmAtraso += client.inadimplenteOperacional ? 1 : 0;
    vendor.clientesAtrasoCritico += client.diasVencidos > 15 ? 1 : 0;
    vendor.clientesNaoPagaramPrimeiraFatura += client.naoPagouPrimeiraFatura ? 1 : 0;
    vendor.clientesPagaramPrimeiraFatura += client.pagouPrimeiraFatura ? 1 : 0;
    vendor.clientesPagaramSegundaFatura += client.pagouSegundaFatura ? 1 : 0;
    vendor.clientesComSegundaFaturaPendente += client.pagouPrimeiraFatura && !client.pagouSegundaFatura ? 1 : 0;
    vendor.fatPendenteTotal += client.fatPendente;
    vendor.mediaDiasAtraso += client.mediaDiasAtraso;
  });

  (rawData[SHEET_TYPES.QUALIDADE] || []).forEach((row) => {
    const vendor = ensureVendor(pick(row, ["Nome Vendedor"]));
    vendor.intercambioCpf += toNumber(pick(row, ["Intercambio CPF", "Intercambio Cpf"]), 0);
    vendor.qtdContestacoes += toNumber(pick(row, ["Qtd. Contestacoes", "Qtd. Contestações"]), 0);
    vendor.qtdSemConsumo += toNumber(pick(row, ["Qtd. sem Consumo", "Qtd sem Consumo"]), 0);
    vendor.qtdFullRoaming += toNumber(pick(row, ["Qtd. Full Roaming", "Qtd Full Roaming"]), 0);
    vendor.tkmEntrada = toNumber(pick(row, ["TKM Entrada"]), vendor.tkmEntrada);
  });

  (rawData[SHEET_TYPES.CHURN_SAFRA] || []).forEach((row) => {
    const vendor = ensureVendor(pick(row, ["Nome Vendedor"]));
    vendor.cancelamentosSafra += toNumber(pick(row, ["Canc. Safra", "Canc Safra"]), 0);
    vendor.churnSafra = percent(pick(row, ["Churn Safra"]));
  });

  return Array.from(vendors.values()).map((vendor) => {
    vendor.mediaDiasAtraso = vendor.totalClientes ? vendor.mediaDiasAtraso / vendor.totalClientes : 0;
    vendor.taxaPagamentoPrimeiraFatura = vendor.totalClientes ? vendor.clientesPagaramPrimeiraFatura / vendor.totalClientes : 0;
    vendor.taxaPagamentoSegundaFatura = vendor.totalClientes ? vendor.clientesPagaramSegundaFatura / vendor.totalClientes : 0;
    if (vendor.clientesInadimplentes >= 5 || vendor.clientesInadimplentes / Math.max(vendor.totalClientes, 1) >= 0.35) vendor.alertas.push("Alto volume de inadimplencia");
    if (vendor.churnSafra >= 0.25) vendor.alertas.push("Churn elevado");
    if (vendor.qtdContestacoes >= 3) vendor.alertas.push("Atencao em qualidade");
    if (vendor.clientesNaoPagaramPrimeiraFatura >= 3 || vendor.clientesNaoPagaramPrimeiraFatura / Math.max(vendor.totalClientes, 1) >= 0.25) vendor.alertas.push("Risco na primeira fatura");
    if (vendor.clientesComSegundaFaturaPendente >= 3 || vendor.clientesComSegundaFaturaPendente / Math.max(vendor.totalClientes, 1) >= 0.25) vendor.alertas.push("Acompanhar segunda fatura");
    return vendor;
  });
}

function buildDashboard(clients, vendors) {
  const totalClientes = clients.length;
  const totalVendedores = vendors.length;
  const clientesAtivos = clients.filter((item) => item.ativo).length;
  const clientesEmAtraso = clients.filter((item) => item.inadimplenteOperacional).length;
  const clientesAtrasoCritico = clients.filter((item) => item.diasVencidos > 15).length;
  const clientesNaoPagaramPrimeiraFatura = clients.filter((item) => item.naoPagouPrimeiraFatura).length;
  const clientesPagaramPrimeiraFatura = clients.filter((item) => item.pagouPrimeiraFatura).length;
  const clientesPagaramSegundaFatura = clients.filter((item) => item.pagouSegundaFatura).length;
  const cancelamentosSafra = vendors.reduce((sum, item) => sum + item.cancelamentosSafra, 0);
  const churnMedioSafra = vendors.length ? vendors.reduce((sum, item) => sum + item.churnSafra, 0) / vendors.length : 0;

  const atrasoDistribuicao = ["A vencer", "Em dia", "Atencao", "Atraso moderado", "Atraso critico", "Sem informacao"].map((status) => ({
    name: status,
    value: clients.filter((item) => item.statusAtraso === status).length
  }));

  return {
    resumo: {
      totalClientes,
      totalVendedores,
      clientesAtivos,
      clientesEmAtraso,
      clientesAtrasoCritico,
      clientesNaoPagaramPrimeiraFatura,
      clientesPagaramPrimeiraFatura,
      clientesPagaramSegundaFatura,
      taxaPagamentoPrimeiraFatura: totalClientes ? clientesPagaramPrimeiraFatura / totalClientes : 0,
      taxaPagamentoSegundaFatura: totalClientes ? clientesPagaramSegundaFatura / totalClientes : 0,
      cancelamentosSafra,
      churnMedioSafra
    },
    graficos: {
      atrasoPorVendedor: vendors.map((item) => ({ name: item.nomeVendedor, value: item.clientesEmAtraso })),
      rankingInadimplencia: [...vendors].sort((a, b) => b.clientesNaoPagaramPrimeiraFatura - a.clientesNaoPagaramPrimeiraFatura).slice(0, 10),
      rankingChurn: [...vendors].sort((a, b) => b.churnSafra - a.churnSafra).slice(0, 10),
      pagamentoFaturas: [
        { name: "Pagou 1a fatura", value: clientesPagaramPrimeiraFatura },
        { name: "Pagou 2a fatura", value: clientesPagaramSegundaFatura },
        { name: "Nao pagou 1a", value: clientesNaoPagaramPrimeiraFatura }
      ],
      atrasoDistribuicao
    }
  };
}

function compactComplementaryData(row, matchedBy, matchStatus = "matched") {
  if (!row) return null;
  return {
    source: row.source || "",
    matchedBy,
    matchStatus,
    confidence: confidenceFor(matchedBy, matchStatus),
    needsReview: matchStatus !== "matched" || confidenceFor(matchedBy, matchStatus) === "baixa",
    warning: matchStatus !== "matched" || confidenceFor(matchedBy, matchStatus) === "baixa" ? "Conferir dados antes da cobranca" : "",
    score: row.matchScore ?? "",
    scoreCriteria: row.matchCriteria || [],
    raw: row.raw || row.dadosExtras || {},
    telefone: row.telefone || "",
    whatsapp: row.whatsapp || "",
    cpfCompleto: row.cpfCompleto || row.cpfCliente || "",
    nomeCompleto: row.nomeCompleto || row.nomeCliente || "",
    cidade: row.cidade || "",
    estado: row.estado || "",
    bairro: row.bairro || "",
    endereco: row.endereco || "",
    cep: row.cep || "",
    email: row.email || "",
    observacoes: row.observacoes || ""
  };
}

function publicMatchMethod(method, status = "matched") {
  if (status === "ambiguous") return "ambiguo";
  if (!method) return "sem_match";
  if (method === "score") return "score";
  if (method === "cpf") return "cpf";
  if (method === "cpf_parcial") return "cpf_parcial";
  if (method === "cpf_ultimos_3") return "cpf_ultimos_3";
  if (method === "telefone") return "telefone";
  if (method === "email") return "email";
  if (method === "nome_cliente_vendedor") return "nome_vendedor";
  if (method === "nome_cliente_cidade") return "nome_cidade";
  if (method === "nome_cliente") return "nome";
  if (method === "nome_aproximado") return "nome_aproximado";
  return method;
}

function confidenceFor(method, status = "matched") {
  if (status !== "matched") return "baixa";
  if (method === "score") return "alta";
  if (method === "cpf") return "alta";
  if (method === "telefone") return "alta";
  if (method === "cpf_parcial") return "media";
  if (method === "nome_cliente_vendedor") return "alta";
  if (method === "nome_cliente_cidade") return "media";
  if (method === "nome_cliente") return "media";
  return "baixa";
}

function sameName(left, right) {
  if (!left || !right) return true;
  return normalizeMatchKey(left) === normalizeMatchKey(right);
}

function applyComplementaryField(client, field, value, source) {
  if (!value) return;
  if (!client[field]) {
    client[field] = value;
    client.fieldOrigins[field] = source;
  }
}

function uniqueCandidate(candidates = []) {
  const unique = new Map();
  candidates.filter(Boolean).forEach((candidate) => {
    const key = `${candidate.source || ""}|${candidate.cpfCompleto || candidate.cpfCliente || ""}|${normalizeMatchKey(candidate.nomeCompleto || candidate.nomeCliente)}|${candidate.telefone || ""}`;
    unique.set(key, candidate);
  });
  return Array.from(unique.values());
}

function candidateRecord(client, candidate, method, status = "possible") {
  const matchedBy = publicMatchMethod(method, status === "matched" ? "matched" : status);
  const scoring = scoreComplementaryCandidate(client, candidate);
  const score = scoring.score;
  const confidence = scoreConfidence(score);
  return {
    ...compactComplementaryData({ ...candidate, matchScore: score, matchCriteria: scoring.criteria }, matchedBy, status),
    matchedBy,
    confidence,
    score,
    scoreCriteria: scoring.criteria,
    needsReview: confidence === "baixa" || status !== "matched",
    warning: confidence === "baixa" || status !== "matched" ? "Conferir dados antes da cobranca" : ""
  };
}

function topCandidateRecords(client, candidates = []) {
  const records = uniqueCandidate(candidates)
    .map((candidate) => candidateRecord(client, candidate, candidate.matchMethod || "score", "possible"))
    .filter((candidate) => candidate.score >= 50)
    .sort((a, b) => (b.score || 0) - (a.score || 0));
  return records.slice(0, 10);
}

function findApproximateNameMatch(client, indexes) {
  const name = normalizeMatchKey(client.nomeCliente);
  if (!name || name.length < 6) return [];

  const tokens = name.split(" ").filter((token) => token.length > 2);
  if (!tokens.length) return [];

  const tokenHits = new Map();
  tokens.forEach((token) => {
    (indexes.byNameToken?.get(token) || []).forEach((row) => {
      tokenHits.set(row, (tokenHits.get(row) || 0) + 1);
    });
  });

  return Array.from(tokenHits.entries()).filter(([row, hits]) => {
    const candidateName = row.normalized?.nomeCliente || normalizeMatchKey(row.nomeCompleto || row.nomeCliente);
    if (!candidateName) return false;
    if (candidateName === name) return true;
    if (candidateName.includes(name) || name.includes(candidateName)) return true;
    return hits >= Math.min(3, tokens.length);
  }).map(([row]) => row);
}

function findComplementaryMatch(client, indexes) {
  const cpf = normalizeCpf(client.cpfCliente);
  const name = normalizeMatchKey(client.nomeCliente);
  const vendor = normalizeMatchKey(client.nomeVendedor);
  const city = normalizeMatchKey(client.cidade);
  const phone = normalizePhone(client.telefone || client.whatsapp);
  const email = normalizeMatchKey(client.email);
  const attempts = [];

  if (cpf) attempts.push({ method: "cpf", candidates: indexes.byCpf?.get(cpf) || [] });
  if (cpfLast3(cpf)) attempts.push({ method: "cpf_ultimos_3", candidates: indexes.byCpfLast3?.get(cpfLast3(cpf)) || [] });
  if (phone) attempts.push({ method: "telefone", candidates: indexes.byPhone?.get(phone) || [] });
  if (email) attempts.push({ method: "email", candidates: indexes.byEmail?.get(email) || [] });
  if (name && vendor) attempts.push({ method: "nome_cliente_vendedor", candidates: indexes.byNameVendor.get(`${name}|${vendor}`) || [] });
  if (name && city) attempts.push({ method: "nome_cliente_cidade", candidates: indexes.byNameCity?.get(`${name}|${city}`) || [] });
  if (name) attempts.push({ method: "nome_cliente", candidates: indexes.byName.get(name) || [] });
  if (name) attempts.push({ method: "nome_aproximado", candidates: findApproximateNameMatch(client, indexes) });

  const allCandidates = [];

  attempts.forEach((attempt) => {
    const candidates = uniqueCandidate(attempt.candidates).map((candidate) => ({ ...candidate, matchMethod: attempt.method }));
    allCandidates.push(...candidates);
  });

  const ranked = uniqueCandidate(allCandidates)
    .map((candidate) => ({ candidate, scoring: scoreComplementaryCandidate(client, candidate) }))
    .filter((item) => item.scoring.score >= 50)
    .sort((a, b) => b.scoring.score - a.scoring.score);

  if (!ranked.length) return { status: "sem_match", matchedBy: "sem_match", row: null, candidates: [], allCandidates };

  const best = ranked[0];
  const candidates = ranked.map((item) => ({ ...item.candidate, matchMethod: "score" }));
  const strongMatches = ranked.filter((item) => item.scoring.score >= 70);
  if (strongMatches.length > 1 && strongMatches[1].scoring.score >= best.scoring.score - 5) {
    return { status: "ambiguous", matchedBy: "score", row: null, candidates, allCandidates: candidates, scoreDetails: best.scoring };
  }
  if (best.scoring.score >= 70) {
    return { status: "matched", matchedBy: "score", row: best.candidate, candidates, allCandidates: candidates, scoreDetails: best.scoring };
  }
  return { status: "possible", matchedBy: "score", row: null, candidates, allCandidates: candidates, scoreDetails: best.scoring };
}

function buildEnrichmentDiagnostics(clients) {
  const rows = clients.map((client) => ({
    clienteBrisa: client.nomeCliente,
    cpfBrisa: client.cpfCliente,
    vendedorBrisa: client.nomeVendedor,
    matchEncontrado: client.matchInfo?.hasComplementaryMatch ? "Sim" : "Nao",
    clienteComplementar: client.nomeClienteComplementar || client.nomeCompleto || "",
    cpfComplementar: client.cpfCompleto || "",
    melhorCandidato: client.possibleComplementaryMatches?.[0]?.nomeCompleto || "",
    score: client.possibleComplementaryMatches?.[0]?.score || "",
    telefoneEncontrado: client.telefone || client.possibleComplementaryMatches?.[0]?.telefone || client.possibleComplementaryMatches?.[0]?.whatsapp || "",
    cidade: client.cidade || client.possibleComplementaryMatches?.[0]?.cidade || "",
    observacoes: client.observacoes || "",
    fonte: client.origemComplementar || client.matchInfo?.complementarySources?.join(", ") || "",
    metodo: client.matchedBy || client.matchInfo?.matchedBy || "sem_match",
    confianca: client.confidence || client.matchInfo?.confidence || "baixa",
    criteriosScore: (client.confirmedComplementaryMatch?.scoreCriteria || client.possibleComplementaryMatches?.[0]?.scoreCriteria || [])
      .map((criterion) => `${criterion.label} (+${criterion.points})`)
      .join("; "),
    temCandidatos: (client.possibleComplementaryMatches || []).length > 0,
    status: client.matchStatus || "sem_match",
    inadimplente: client.inadimplenteOperacional,
    conflitos: client.matchInfo?.warnings?.join("; ") || "",
    alertas: client.matchInfo?.warnings?.join("; ") || ""
  })).sort((a, b) => {
    const score = (row) => row.status === "matched" ? 0 : row.status === "ambiguous" ? 1 : 2;
    return score(a) - score(b);
  });

  const hasWarning = (client, text) => (client.matchInfo?.warnings || []).some((warning) => warning.includes(text));

  return {
    totalClientesConsolidados: clients.length,
    totalComMatchComplementar: clients.filter((client) => client.matchInfo?.hasComplementaryMatch).length,
    totalEnriquecidosComplementar1: clients.filter((client) => client.dataSources?.complementar1).length,
    totalEnriquecidosComplementar2: clients.filter((client) => client.dataSources?.complementar2).length,
    totalSemMatch: clients.filter((client) => client.matchInfo?.matchedBy === "sem_match").length,
    totalMatchCpf: clients.filter((client) => (client.confirmedComplementaryMatch?.scoreCriteria || []).some((criterion) => criterion.label.includes("CPF"))).length,
    totalMatchScore: clients.filter((client) => client.matchInfo?.matchedBy === "score").length,
    totalMatchNomeVendedor: clients.filter((client) => client.matchInfo?.matchedBy === "nome_vendedor").length,
    totalMatchNomeCidade: clients.filter((client) => client.matchInfo?.matchedBy === "nome_cidade").length,
    totalMatchNome: clients.filter((client) => client.matchInfo?.matchedBy === "nome").length,
    totalMatchNomeAproximado: clients.filter((client) => client.matchInfo?.matchedBy === "nome_aproximado").length,
    totalAmbiguo: clients.filter((client) => client.matchInfo?.matchedBy === "ambiguo").length,
    totalConflitosCpf: clients.filter((client) => hasWarning(client, "CPF divergente")).length,
    totalConflitosNome: clients.filter((client) => hasWarning(client, "Nome divergente")).length,
    totalTelefonesEncontrados: clients.filter((client) => client.telefone || client.whatsapp).length,
    totalTelefonesAusentes: clients.filter((client) => !client.telefone && !client.whatsapp).length,
    totalComCandidatos: clients.filter((client) => (client.possibleComplementaryMatches || []).length > 0).length,
    totalInadimplentesSemContato: clients.filter((client) => client.inadimplenteOperacional && !client.telefone && !client.whatsapp && !(client.possibleComplementaryMatches || []).some((candidate) => candidate.telefone || candidate.whatsapp)).length,
    amostras: rows
  };
}

export function consolidateCompetencia(competencia) {
  const rawData = competencia.rawData || {};
  const clientsMap = new Map();
  const referenceDate = referenceDateForCompetencia(competencia);
  const complementaryRows = readSettings().dadosComplementares || [];
  const complementaryIndexes = buildComplementaryIndexes(complementaryRows);

  (rawData[SHEET_TYPES.CLIENTES_ATIVOS] || []).forEach((row) => {
    const client = getClient(clientsMap, row);
    markSource(client, SHEET_TYPES.CLIENTES_ATIVOS);
    client.qtdAtivos += toNumber(pick(row, ["Qtd Ativos"]), 0);
    client.ativo = client.qtdAtivos > 0;
  });

  (rawData[SHEET_TYPES.VENCIMENTOS] || []).forEach((row) => {
    const client = getClient(clientsMap, row);
    markSource(client, SHEET_TYPES.VENCIMENTOS);
    client.dtVencimento = parseExcelDate(pick(row, ["Dt Vencimento"]));
    const rawDiasVencidos = toNumber(pick(row, ["Dias Vencidos"]), 0);
    if (client.dtVencimento && client.dtVencimento > referenceDate) {
      client.diasVencidos = 0;
      client.statusAtraso = "A vencer";
      client.faturaAindaNaoVenceu = true;
      return;
    }
    client.diasVencidos = rawDiasVencidos > 0 ? rawDiasVencidos : Math.max(0, diffDays(client.dtVencimento, referenceDate));
    client.statusAtraso = atrasoStatus(client.diasVencidos);
  });

  (rawData[SHEET_TYPES.INADIMPLENCIA] || []).forEach((row) => {
    const client = getClient(clientsMap, row);
    markSource(client, SHEET_TYPES.INADIMPLENCIA);
    client.naoPagouPrimeiraFatura = toBooleanFromPositive(pick(row, ["Qt. Nao Pagou 1a Fat.", "Qt. Não Pagou 1ª Fat."]));
    client.fatPendente = toNumber(pick(row, ["Fat. Pendente"]), 0);
    client.mediaDiasAtraso = toNumber(pick(row, ["Media dias atraso", "Média dias atraso"]), 0);
  });

  (rawData[SHEET_TYPES.PAGAMENTOS_FATURAS] || []).forEach((row) => {
    const client = getClient(clientsMap, row);
    markSource(client, SHEET_TYPES.PAGAMENTOS_FATURAS);
    client.qtdPagouPrimeiraFatura += toNumber(pick(row, ["Qt. Pagou 1 Fat.", "Qt. Pagou 1a Fat.", "Qt. Pagou 1ª Fat."]), 0);
    client.qtdPagouSegundaFatura += toNumber(pick(row, ["Qt. Pagou 2 Fat.", "Qt. Pagou 2a Fat.", "Qt. Pagou 2ª Fat."]), 0);
    client.pagouPrimeiraFatura = client.qtdPagouPrimeiraFatura > 0;
    client.pagouSegundaFatura = client.qtdPagouSegundaFatura > 0;
    client.dataPagamentoPrimeiraFatura = parseExcelDate(pick(row, ["Dt. Pagto 1 Fatura", "Dt. Pagto 1a Fatura", "Dt. Pagto 1ª Fatura"]));
    client.dataPagamentoSegundaFatura = parseExcelDate(pick(row, ["Dt. Pagto 2 Fatura", "Dt. Pagto 2a Fatura", "Dt. Pagto 2ª Fatura"]));
  });

  const enrichWithComplementaryData = (client) => {
    const match = findComplementaryMatch(client, complementaryIndexes);
    client.matchStatus = match.status;
    const possibleMatches = topCandidateRecords(client, match.allCandidates?.length ? match.allCandidates : match.candidates);
    client.possibleComplementaryMatches = possibleMatches;
    client.matchCandidates = possibleMatches;
    client.rawMatches = possibleMatches.map((candidate) => ({
      source: candidate.source,
      matchedBy: candidate.matchedBy,
      confidence: candidate.confidence,
      score: candidate.score,
      scoreCriteria: candidate.scoreCriteria,
      raw: candidate.raw
    }));
    possibleMatches.forEach((candidate) => {
      if (!candidate.source) return;
      if (!client.complementaryRawData[candidate.source]) client.complementaryRawData[candidate.source] = [];
      const bucket = client.complementaryRawData[candidate.source];
      if (Array.isArray(bucket)) bucket.push(candidate.raw || {});
      else client.complementaryRawData[candidate.source] = [bucket, candidate.raw || {}];
    });

    if (match.status === "ambiguous" || match.status === "possible") {
      client.matchStatus = match.status;
      client.matchInfo.matchedBy = match.status === "possible" ? publicMatchMethod(match.matchedBy, "matched") : "ambiguo";
      client.matchInfo.confidence = match.status === "possible" ? possibleMatches[0]?.confidence || "baixa" : "baixa";
      client.confidence = client.matchInfo.confidence;
      client.matchedBy = client.matchInfo.matchedBy;
      addWarning(client, match.status === "possible" ? "Conferir dados antes da cobranca" : "Mais de um possivel match complementar encontrado");
      client.complementaryData = { candidates: possibleMatches };
      return client;
    }

    const complementary = match.row;
    if (!complementary) return client;

    client.confirmedComplementaryMatch = candidateRecord(client, complementary, match.matchedBy, "matched");
    client.complementaryData = client.confirmedComplementaryMatch;
    const source = complementary.source || "";
    client.matchStatus = "matched";
    client.matchInfo.hasComplementaryMatch = true;
    client.matchInfo.complementarySources = [source].filter(Boolean);
    client.matchInfo.matchedBy = publicMatchMethod(match.matchedBy, match.status);
    client.matchInfo.confidence = client.confirmedComplementaryMatch.confidence;
    client.confidence = client.matchInfo.confidence;
    client.matchedBy = client.matchInfo.matchedBy;
    client.origemComplementar = source;
    if (match.matchedBy === "nome_aproximado") addWarning(client, "Confira os dados antes da cobranca.");
    if (source === "complementar_1") client.dataSources.complementar1 = true;
    if (source === "complementar_2") client.dataSources.complementar2 = true;
    if (source && !client.complementaryRawData[source]) client.complementaryRawData[source] = complementary.raw || {};
    client.nomeClienteComplementar = complementary.nomeCompleto || complementary.nomeCliente || "";
    client.cpfCompleto = complementary.cpfCompleto || complementary.cpfCliente || "";

    const brisaCpf = normalizeCpf(client.cpfCliente);
    const complementaryCpf = normalizeCpf(client.cpfCompleto);
    if (brisaCpf && brisaCpf.length >= 11 && complementaryCpf && brisaCpf !== complementaryCpf) {
      addWarning(client, "CPF divergente entre Brisa e planilha complementar");
    }
    if (client.nomeClienteBrisa && client.nomeClienteComplementar && !sameName(client.nomeClienteBrisa, client.nomeClienteComplementar)) {
      addWarning(client, "Nome divergente entre Brisa e planilha complementar");
    }

    if (!client.cpfCliente && complementaryCpf) {
      client.cpfCliente = complementaryCpf;
      client.fieldOrigins.cpfCliente = source;
    }
    client.fieldOrigins.cpfCompleto = source;
    client.fieldOrigins.nomeCompleto = source;
    client.nomeCompleto = client.nomeClienteComplementar || client.nomeCliente;
    applyComplementaryField(client, "telefone", complementary.telefone, source);
    applyComplementaryField(client, "whatsapp", complementary.whatsapp, source);
    applyComplementaryField(client, "cidade", complementary.cidade, source);
    applyComplementaryField(client, "estado", complementary.estado, source);
    applyComplementaryField(client, "bairro", complementary.bairro, source);
    applyComplementaryField(client, "endereco", complementary.endereco, source);
    applyComplementaryField(client, "cep", complementary.cep, source);
    applyComplementaryField(client, "email", complementary.email, source);
    applyComplementaryField(client, "observacoes", complementary.observacoes, source);
    client.dadosComplementares = complementary.raw || {};
    return client;
  };

  const clients = Array.from(clientsMap.values()).map((client) => {
    enrichWithComplementaryData(client);
    client.vencimentoPrimeiraFatura = addDays(client.inicioContrato, 30);
    client.vencimentoSegundaFatura = addDays(client.inicioContrato, 60);
    client.statusPrimeiraFatura = paymentStatus({
      paid: client.pagouPrimeiraFatura,
      contractStart: client.inicioContrato,
      dueDate: client.vencimentoPrimeiraFatura,
      referenceDate
    });
    client.statusSegundaFatura = paymentStatus({
      paid: client.pagouSegundaFatura,
      contractStart: client.inicioContrato,
      dueDate: client.vencimentoSegundaFatura,
      referenceDate
    });

    const atrasoPrimeira = client.statusPrimeiraFatura === "Em atraso" ? diffDays(client.vencimentoPrimeiraFatura, referenceDate) : 0;
    const atrasoSegunda = client.statusSegundaFatura === "Em atraso" ? diffDays(client.vencimentoSegundaFatura, referenceDate) : 0;
    client.diasVencidos = Math.max(client.diasVencidos, atrasoPrimeira, atrasoSegunda, client.mediaDiasAtraso || 0);
    client.statusAtraso = client.diasVencidos > 0 ? atrasoStatus(client.diasVencidos) : "Em dia";
    client.faturaAindaNaoVenceu = client.statusPrimeiraFatura === "Aguardando vencimento" || client.statusSegundaFatura === "Aguardando vencimento";

    const primeiraVencida = client.statusPrimeiraFatura === "Em atraso";
    const segundaVencida = client.statusSegundaFatura === "Em atraso";
    const inadimplenciaPorPlanilha = (client.naoPagouPrimeiraFatura && primeiraVencida) || (client.fatPendente > 0 && (primeiraVencida || segundaVencida));
    client.inadimplenteOperacional = primeiraVencida || segundaVencida || inadimplenciaPorPlanilha;

    if (primeiraVencida) addAlert(client, "Primeira fatura em atraso");
    if (segundaVencida) addAlert(client, "Segunda fatura em atraso");
    if (client.diasVencidos > 15) addAlert(client, "Atraso critico");
    if (client.naoPagouPrimeiraFatura && primeiraVencida) addAlert(client, "Nao pagou 1a fatura");
    if (client.fatPendente > 0 && client.inadimplenteOperacional) addAlert(client, "Fatura pendente");
    if (client.inadimplenteOperacional && client.ativo) addAlert(client, "Cliente ativo com risco");
    if (client.statusSegundaFatura === "Aguardando vencimento" && client.pagouPrimeiraFatura && !client.pagouSegundaFatura) addAlert(client, "Aguardando segunda fatura");
    client.motivoInadimplencia = client.alertas.filter((alert) => !["Fatura ainda nao venceu", "Aguardando segunda fatura"].includes(alert)).join("; ");
    return client;
  });

  const vendors = aggregateVendors(clients, rawData);
  const dashboard = buildDashboard(clients, vendors);
  const fontes = expectedSheetStatus(competencia.arquivosImportados || []);
  const enrichmentDiagnostics = buildEnrichmentDiagnostics(clients);
  const auditoria = {
    dataReferenciaAtraso: referenceDate,
    linhasPorFonte: Object.fromEntries(Object.entries(rawData).map(([type, rows]) => [type, rows.length])),
    clientesConsolidados: clients.length,
    vendedoresConsolidados: vendors.length,
    clientesComCpf: clients.filter((item) => item.cpfCliente).length,
    clientesSemCpf: clients.filter((item) => !item.cpfCliente).length,
    clientesComChaveAlternativa: clients.filter((item) => !item.cpfCliente).length,
    clientesComPagamentoPrimeiraFatura: clients.filter((item) => item.pagouPrimeiraFatura).length,
    clientesComPagamentoSegundaFatura: clients.filter((item) => item.pagouSegundaFatura).length,
    clientesComDadosComplementares: clients.filter((item) => item.telefone || item.whatsapp || item.cidade || item.endereco).length,
    enriquecimentoComplementar: enrichmentDiagnostics,
    clientesComFaturaAindaNaoVenceu: clients.filter((item) => item.faturaAindaNaoVenceu).length,
    clientesEmAtrasoReal: clients.filter((item) => item.inadimplenteOperacional).length
  };

  return {
    consolidadoEm: new Date().toISOString(),
    clientes: clients,
    vendedores: vendors,
    dashboard,
    fontes,
    auditoria,
    enrichmentDiagnostics,
    alertas: fontes.filter((item) => item.status === "faltando").map((item) => `${item.label}: faltando`)
  };
}
