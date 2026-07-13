import express from "express";
import XLSX from "xlsx";
import { ensureConsolidatedCacheFromCompetencia, readCompetencias, readConsolidatedCache, readSettings } from "../storage/store.js";
import { buildReport, reportWorkbook, toCsv } from "../services/report.service.js";
import { asyncHandler } from "../utils/http.js";
import { buildComplementaryIndexes } from "../services/complementarySheets.service.js";
import { cpfLast3, scoreComplementaryCandidate } from "../services/matchScoring.service.js";
import { normalizeCpf, normalizeMatchKey, normalizePhone } from "../utils/normalize.js";

const router = express.Router({ mergeParams: true });

function getCompetencia(req, res) {
  const competencia = readCompetencias().find((item) => item.id === req.params.id);
  if (!competencia) {
    res.status(404).json({ success: false, message: "Competencia nao encontrada.", details: "" });
    return null;
  }
  ensureConsolidatedCacheFromCompetencia(competencia);
  return competencia;
}

function getCached(req, res, name) {
  const competencia = getCompetencia(req, res);
  if (!competencia) return null;
  const data = readConsolidatedCache(competencia.id, name);
  if (!data) {
    res.status(409).json({
      success: false,
      message: "Dados ainda nao consolidados. Clique em Consolidar ou Reconsolidar com dados complementares.",
      details: `Cache ausente: ${name}.json`
    });
    return null;
  }
  return { competencia, data };
}

function paginate(rows, req) {
  const page = Math.max(Number(req.query.page || 1), 1);
  const pageSize = Math.min(Math.max(Number(req.query.pageSize || 50), 1), 200);
  const total = rows.length;
  const start = (page - 1) * pageSize;
  return {
    rows: rows.slice(start, start + pageSize),
    page,
    pageSize,
    total,
    totalPages: Math.ceil(total / pageSize) || 1
  };
}

function filterClients(rows, query = {}) {
  return rows.filter((client) => {
    const text = (key, value) => !value || String(client[key] || "").toLowerCase().includes(String(value).toLowerCase());
    if (!text("nomeCliente", query.cliente || query.search)) return false;
    if (!text("cpfCliente", query.cpf)) return false;
    if (!text("nomeVendedor", query.vendedor)) return false;
    if (!text("nomeParceiro", query.parceiro)) return false;
    if (query.status === "inadimplente" || query.filter === "inadimplentes") return client.inadimplenteOperacional;
    if (query.filter === "critico") return (client.diasVencidos || 0) > 15;
    if (query.filter === "nao-pagaram-primeira") return client.statusPrimeiraFatura === "Em atraso";
    if (query.filter === "aguardando-segunda") return client.statusSegundaFatura === "Aguardando vencimento";
    if (query.filter === "ativos") return client.ativo;
    if (query.atrasados === "true" && (client.diasVencidos || 0) <= 0) return false;
    if (query.critico === "true" && (client.diasVencidos || 0) <= 15) return false;
    if (query.naoPagou1 === "true" && !client.naoPagouPrimeiraFatura) return false;
    if (query.pagou1 === "true" && !client.pagouPrimeiraFatura) return false;
    if (query.pagou2 === "true" && !client.pagouSegundaFatura) return false;
    if (query.statusAtraso && client.statusAtraso !== query.statusAtraso) return false;
    return true;
  });
}

function sortClients(rows, orderBy = "dias") {
  return [...rows].sort((a, b) => {
    if (orderBy === "nome") return String(a.nomeCliente || "").localeCompare(String(b.nomeCliente || ""));
    return (b.diasVencidos || 0) - (a.diasVencidos || 0);
  });
}

function contactSource(client) {
  return client.fieldOrigins?.telefone || client.fieldOrigins?.whatsapp || client.origemComplementar || "";
}

function displayContact(value) {
  return value || "Nao encontrado nas planilhas internas";
}

function bestPossibleMatch(client) {
  return client.confirmedComplementaryMatch || client.possibleComplementaryMatches?.[0] || null;
}

function operationalContact(client) {
  const match = bestPossibleMatch(client);
  const fromCandidate = !client.confirmedComplementaryMatch && match;
  return {
    nomeCompleto: client.nomeCompleto || client.nomeClienteComplementar || match?.nomeCompleto || "",
    cpfCompleto: client.cpfCompleto || match?.cpfCompleto || "",
    telefone: client.telefone || match?.telefone || "",
    whatsapp: client.whatsapp || match?.whatsapp || "",
    cidade: client.cidade || match?.cidade || "",
    estado: client.estado || match?.estado || "",
    bairro: client.bairro || match?.bairro || "",
    endereco: client.endereco || match?.endereco || "",
    cep: client.cep || match?.cep || "",
    email: client.email || match?.email || "",
    observacoes: client.observacoes || match?.observacoes || "",
    source: client.origemComplementar || match?.source || "",
    matchedBy: client.matchedBy || client.matchInfo?.matchedBy || match?.matchedBy || "sem_match",
    confidence: client.confidence || client.matchInfo?.confidence || match?.confidence || "baixa",
    needsReview: fromCandidate || match?.needsReview || false,
    warning: fromCandidate ? "Contato por baixa confianca - conferir" : match?.warning || ""
  };
}

function auditWarningText(client) {
  const warnings = [...(client.matchInfo?.warnings || [])];
  if (client.matchInfo?.confidence === "baixa" && client.matchInfo?.hasComplementaryMatch) warnings.push("Conferir dados");
  if (!client.confirmedComplementaryMatch && client.possibleComplementaryMatches?.length) warnings.push("Contato por baixa confianca - conferir");
  return [...new Set(warnings)].join("; ");
}

function confidenceLabel(client) {
  const confidence = client.confidence || client.matchInfo?.confidence || "baixa";
  const matchedBy = client.matchedBy || client.matchInfo?.matchedBy || "sem_match";
  if (matchedBy === "sem_match") return "Sem match";
  if (matchedBy === "ambiguo") return "Ambiguo";
  if (matchedBy === "score") return `${confidence} - Score`;
  if (matchedBy === "cpf") return "Alta - CPF";
  if (matchedBy === "cpf_parcial") return "Media - CPF parcial";
  if (matchedBy === "cpf_ultimos_3") return "Media - CPF ultimos 3";
  if (matchedBy === "nome_vendedor") return "Alta - Nome + Vendedor";
  if (matchedBy === "nome_cidade") return "Media - Nome + Cidade";
  if (matchedBy === "nome") return "Media - Nome";
  if (matchedBy === "nome_aproximado") return "Baixa - Nome aproximado";
  return confidence;
}

function uniqueInternalCandidates(candidates = []) {
  const unique = new Map();
  candidates.filter(Boolean).forEach((candidate) => {
    const key = `${candidate.source || ""}|${candidate.cpfCompleto || candidate.cpfCliente || ""}|${normalizeMatchKey(candidate.nomeCompleto || candidate.nomeCliente)}|${candidate.telefone || candidate.whatsapp || ""}`;
    unique.set(key, candidate);
  });
  return Array.from(unique.values());
}

function approximateInternalCandidates(client, indexes) {
  const name = normalizeMatchKey(client.nomeCliente);
  const tokens = name.split(" ").filter((token) => token.length > 2);
  const found = new Map();
  tokens.forEach((token) => {
    (indexes.byNameToken?.get(token) || []).forEach((row) => {
      const key = `${row.source}|${row.cpfCompleto || row.cpfCliente}|${normalizeMatchKey(row.nomeCompleto || row.nomeCliente)}|${row.telefone || row.whatsapp}`;
      found.set(key, row);
    });
  });
  return Array.from(found.values());
}

function bestInternalContactForPdf(client, indexes) {
  const cpf = normalizeCpf(client.cpfCliente);
  const name = normalizeMatchKey(client.nomeCliente);
  const vendor = normalizeMatchKey(client.nomeVendedor);
  const city = normalizeMatchKey(client.cidade);
  const phone = normalizePhone(client.telefone || client.whatsapp);
  const candidates = [];

  if (cpf) candidates.push(...(indexes.byCpf?.get(cpf) || []));
  if (cpfLast3(cpf)) candidates.push(...(indexes.byCpfLast3?.get(cpfLast3(cpf)) || []));
  if (phone) candidates.push(...(indexes.byPhone?.get(phone) || []));
  if (name && vendor) candidates.push(...(indexes.byNameVendor?.get(`${name}|${vendor}`) || []));
  if (name && city) candidates.push(...(indexes.byNameCity?.get(`${name}|${city}`) || []));
  if (name) candidates.push(...(indexes.byName?.get(name) || []));
  candidates.push(...approximateInternalCandidates(client, indexes));

  const ranked = uniqueInternalCandidates(candidates)
    .map((candidate) => ({ candidate, score: scoreComplementaryCandidate(client, candidate) }))
    .sort((a, b) => b.score.score - a.score.score);
  const best = ranked[0];

  if (!best || best.score.score < 50) {
    return {
      nomeCompleto: "",
      cpfCompleto: "",
      telefone: "",
      whatsapp: "",
      cidade: "",
      endereco: "",
      vendedor: client.nomeVendedor || "",
      observacaoConfianca: "Nao encontrado nas bases internas",
      score: 0
    };
  }

  const candidate = best.candidate;
  return {
    nomeCompleto: candidate.nomeCompleto || candidate.nomeCliente || "",
    cpfCompleto: candidate.cpfCompleto || candidate.cpfCliente || "",
    telefone: candidate.telefone || "",
    whatsapp: candidate.whatsapp || candidate.telefone || "",
    cidade: candidate.cidade || "",
    estado: candidate.estado || "",
    bairro: candidate.bairro || "",
    endereco: candidate.endereco || "",
    cep: candidate.cep || "",
    email: candidate.email || "",
    observacoes: candidate.observacoes || "",
    source: candidate.source || "",
    vendedor: client.nomeVendedor || candidate.nomeVendedor || "",
    observacaoConfianca: best.score.score >= 70 ? "Contato encontrado" : "Conferir contato",
    score: best.score.score,
    criterios: best.score.criteria
  };
}

function htmlEscape(value) {
  return String(value ?? "").replace(/[&<>"]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", "\"": "&quot;" }[char]));
}

function firstValue(...values) {
  return values.find((value) => value !== undefined && value !== null && String(value).trim() !== "") || "";
}

function fullIdentificationForPdf(client, indexes) {
  const internal = bestInternalContactForPdf(client, indexes);
  const confirmed = client.confirmedComplementaryMatch || {};
  const bestCandidate = client.possibleComplementaryMatches?.[0] || {};
  const contact = operationalContact(client);
  const score = firstValue(confirmed.score, bestCandidate.score, internal.score);
  const source = firstValue(contact.source, client.origemComplementar, confirmed.source, bestCandidate.source, internal.source);
  const matchedBy = firstValue(client.matchedBy, client.matchInfo?.matchedBy, confirmed.matchedBy, bestCandidate.matchedBy, internal.score ? "score" : "sem_match");
  const confidence = firstValue(client.confidence, client.matchInfo?.confidence, confirmed.confidence, bestCandidate.confidence, internal.score >= 70 ? "media" : "");
  return {
    nomeBrisa: client.nomeCliente || "",
    nomeCompleto: firstValue(contact.nomeCompleto, client.nomeCompleto, client.nomeClienteComplementar, confirmed.nomeCompleto, bestCandidate.nomeCompleto, internal.nomeCompleto),
    cpfBrisa: client.cpfCliente || "",
    cpfCompleto: firstValue(contact.cpfCompleto, client.cpfCompleto, confirmed.cpfCompleto, bestCandidate.cpfCompleto, internal.cpfCompleto, client.cpfCliente),
    telefone: firstValue(contact.telefone, client.telefone, confirmed.telefone, bestCandidate.telefone, internal.telefone),
    whatsapp: firstValue(contact.whatsapp, client.whatsapp, confirmed.whatsapp, bestCandidate.whatsapp, internal.whatsapp),
    email: firstValue(contact.email, client.email, confirmed.email, bestCandidate.email, internal.email),
    cidade: firstValue(contact.cidade, client.cidade, confirmed.cidade, bestCandidate.cidade, internal.cidade),
    estado: firstValue(contact.estado, client.estado, confirmed.estado, bestCandidate.estado, internal.estado),
    bairro: firstValue(contact.bairro, client.bairro, confirmed.bairro, bestCandidate.bairro, internal.bairro),
    endereco: firstValue(contact.endereco, client.endereco, confirmed.endereco, bestCandidate.endereco, internal.endereco),
    cep: firstValue(contact.cep, client.cep, confirmed.cep, bestCandidate.cep, internal.cep),
    observacoes: firstValue(contact.observacoes, client.observacoes, confirmed.observacoes, bestCandidate.observacoes, internal.observacoes),
    vendedor: client.nomeVendedor || internal.vendedor || "",
    fonte: source,
    matchedBy,
    confidence,
    score,
    criterios: (confirmed.scoreCriteria || bestCandidate.scoreCriteria || internal.criterios || [])
      .map((criterion) => `${criterion.label} (+${criterion.points})`)
      .join("; "),
    alertaConferencia: [auditWarningText(client), contact.warning, internal.observacaoConfianca === "Conferir contato" ? "Conferir contato" : ""]
      .filter(Boolean)
      .join("; ")
  };
}

function vendorFilteredClients(req, res) {
  const cached = getCached(req, res, "clients");
  if (!cached) return null;
  const nome = decodeURIComponent(req.params.nome).toLowerCase();
  const rows = sortClients(
    filterClients(cached.data, req.query).filter((item) => String(item.nomeVendedor || "").toLowerCase() === nome),
    req.query.orderBy
  );
  return { ...cached, rows };
}

router.get("/dashboard", asyncHandler((req, res) => {
  console.time("load dashboard");
  const cached = getCached(req, res, "dashboard");
  if (!cached) return;
  console.timeEnd("load dashboard");
  res.json(cached.data);
}));

router.get("/vendedores", asyncHandler((req, res) => {
  console.time("load vendedores");
  const cached = getCached(req, res, "sellers");
  if (!cached) return;
  console.timeEnd("load vendedores");
  res.json(cached.data);
}));

router.get("/vendedores/:nome", asyncHandler((req, res) => {
  console.time("load vendedor resumo");
  const sellers = getCached(req, res, "sellers");
  if (!sellers) return;
  const nome = decodeURIComponent(req.params.nome).toLowerCase();
  const vendedor = sellers.data.find((item) => String(item.nomeVendedor || "").toLowerCase() === nome);
  if (!vendedor) return res.status(404).json({ success: false, message: "Vendedor nao encontrado.", details: "" });
  console.timeEnd("load vendedor resumo");
  res.json({ vendedor });
}));

router.get("/vendedores/:nome/clientes", asyncHandler((req, res) => {
  console.time("load vendedor clientes");
  const cached = getCached(req, res, "clients");
  if (!cached) return;
  const nome = decodeURIComponent(req.params.nome).toLowerCase();
  const rows = sortClients(
    filterClients(cached.data, req.query).filter((item) => String(item.nomeVendedor || "").toLowerCase() === nome),
    req.query.orderBy
  );
  const result = paginate(rows, req);
  console.timeEnd("load vendedor clientes");
  res.json(result);
}));

router.get("/clientes", asyncHandler((req, res) => {
  console.time("load clientes");
  const cached = getCached(req, res, "clients");
  if (!cached) return;
  const rows = sortClients(filterClients(cached.data, req.query), req.query.orderBy);
  const result = paginate(rows, req);
  console.timeEnd("load clientes");
  res.json(result);
}));

router.get("/audit", asyncHandler((req, res) => {
  console.time("load audit");
  const cached = getCached(req, res, "audit");
  if (!cached) return;
  console.timeEnd("load audit");
  res.json(cached.data);
}));

router.get("/relatorio", asyncHandler((req, res) => {
  const competencia = getCompetencia(req, res);
  if (!competencia) return;
  const consolidated = readConsolidatedCache(competencia.id, "consolidated");
  if (!consolidated) return res.status(409).json({ success: false, message: "Dados ainda nao consolidados.", details: "" });
  res.json(buildReport({ ...competencia, dadosConsolidados: consolidated }));
}));

router.get("/export/csv", asyncHandler((req, res) => {
  const cached = getCached(req, res, "clients");
  if (!cached) return;
  const csv = toCsv(cached.data);
  res.setHeader("Content-Type", "text/csv; charset=utf-8");
  res.setHeader("Content-Disposition", `attachment; filename="${cached.competencia.nome}-clientes.csv"`);
  res.send(`\uFEFF${csv}`);
}));

router.get("/export/excel", asyncHandler((req, res) => {
  const competencia = getCompetencia(req, res);
  if (!competencia) return;
  const consolidated = readConsolidatedCache(competencia.id, "consolidated");
  if (!consolidated) return res.status(409).json({ success: false, message: "Dados ainda nao consolidados.", details: "" });
  const workbook = reportWorkbook({ ...competencia, dadosConsolidados: consolidated });
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${competencia.nome}-relatorio.xlsx"`);
  res.send(buffer);
}));

router.get("/vendedores/:nome/pdf", asyncHandler((req, res) => {
  console.time("load pdf clientes");
  const cached = vendorFilteredClients(req, res);
  if (!cached) return;
  const nome = decodeURIComponent(req.params.nome).toLowerCase();
  const internalIndexes = buildComplementaryIndexes(readSettings().dadosComplementares || []);
  const contacts = cached.rows.map((client) => ({ client, contact: fullIdentificationForPdf(client, internalIndexes) }));
  const hasLowConfidence = contacts.some(({ contact }) => contact.alertaConferencia || contact.confidence === "baixa");
  const cell = (value) => htmlEscape(value || "Nao informado");
  const htmlRows = contacts.map(({ client, contact }) => {
    return `<tr>
      <td>${cell(contact.nomeBrisa)}</td>
      <td>${cell(contact.nomeCompleto)}</td>
      <td>${cell(contact.cpfBrisa)}</td>
      <td>${cell(contact.cpfCompleto)}</td>
      <td>${cell(contact.telefone)}</td>
      <td>${cell(contact.whatsapp)}</td>
      <td>${cell(contact.email)}</td>
      <td>${cell(contact.cidade)}</td>
      <td>${cell(contact.estado)}</td>
      <td>${cell(contact.bairro)}</td>
      <td>${cell(contact.endereco)}</td>
      <td>${cell(contact.cep)}</td>
      <td>${cell(contact.vendedor)}</td>
      <td>${cell(client.statusPrimeiraFatura)}</td>
      <td>${cell(client.statusSegundaFatura)}</td>
      <td>${cell(client.diasVencidos)}</td>
      <td>${cell(client.motivoInadimplencia || client.alertas?.join("; "))}</td>
      <td>${cell(contact.fonte)}</td>
      <td>${cell(contact.matchedBy)}</td>
      <td>${cell(contact.confidence)}</td>
      <td>${cell(contact.score)}</td>
      <td>${cell(contact.criterios)}</td>
      <td>${cell(contact.observacoes)}</td>
      <td>${cell(contact.alertaConferencia)}</td>
    </tr>`;
  }).join("");
  console.timeEnd("load pdf clientes");
  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.send(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8" /><title>Clientes ${htmlEscape(nome)}</title><style>body{font-family:Arial,sans-serif;margin:18px;color:#111827}h1{margin:0 0 6px;font-size:18px}p{margin:4px 0 10px}table{width:100%;border-collapse:collapse;margin-top:12px;font-size:7.5px}th,td{border:1px solid #d1d5db;padding:4px;text-align:left;vertical-align:top;word-break:break-word}th{background:#f3f4f6}.warning{margin-top:12px;padding:10px;background:#fff7ed;border:1px solid #fed7aa;color:#9a3412}@page{size:landscape;margin:8mm}</style></head><body><h1>${htmlEscape(cached.competencia.nome)} - ${htmlEscape(nome)}</h1><p>Clientes filtrados no vendedor: ${contacts.length}. PDF com identificacoes consolidadas das planilhas internas e complementares.</p><table><thead><tr><th>Nome Brisa</th><th>Nome encontrado</th><th>CPF Brisa</th><th>CPF encontrado</th><th>Telefone</th><th>WhatsApp</th><th>Email</th><th>Cidade</th><th>UF</th><th>Bairro</th><th>Endereco</th><th>CEP</th><th>Vendedor</th><th>1a fat.</th><th>2a fat.</th><th>Dias</th><th>Motivo</th><th>Fonte</th><th>Match</th><th>Confianca</th><th>Score</th><th>Criterios</th><th>Obs.</th><th>Conferencia</th></tr></thead><tbody>${htmlRows}</tbody></table>${hasLowConfidence ? "<p class=\"warning\">Ha contatos sem match confirmado, baixa confianca ou candidatos que precisam de conferencia antes da cobranca.</p>" : ""}<script>window.onload=()=>window.print();</script></body></html>`);
}));

router.get("/vendedores/:nome/export/excel", asyncHandler((req, res) => {
  console.time("load vendedor excel");
  const cached = vendorFilteredClients(req, res);
  if (!cached) return;
  const rows = cached.rows.map((client) => ({
    ...(() => {
      const contact = operationalContact(client);
      return {
    "Cliente Brisa": client.nomeCliente,
    "Nome Complementar": contact.nomeCompleto || "",
    "CPF Brisa": client.cpfCliente,
    "CPF Complementar": contact.cpfCompleto || "",
    Telefone: displayContact(contact.telefone),
    WhatsApp: displayContact(contact.whatsapp),
    Cidade: contact.cidade || "",
    Estado: contact.estado || "",
    Bairro: contact.bairro || "",
    Endereco: contact.endereco || "",
    CEP: contact.cep || "",
    Email: contact.email || "",
    Observacoes: contact.observacoes || "",
    Vendedor: client.nomeVendedor,
    "Status 1a fatura": client.statusPrimeiraFatura,
    "Status 2a fatura": client.statusSegundaFatura,
    "Dias vencidos": client.diasVencidos,
    "Motivo inadimplencia": client.motivoInadimplencia,
    "Fonte contato": contactSource(client) || contact.source,
    "Match encontrado": client.matchInfo?.hasComplementaryMatch ? "Sim" : "Nao",
    "Metodo match": client.matchedBy || client.matchInfo?.matchedBy || "sem_match",
    Confianca: contact.needsReview ? "Baixa - conferir candidato" : confidenceLabel(client),
    Alertas: [auditWarningText(client), contact.warning].filter(Boolean).join("; "),
    "Origem telefone": client.fieldOrigins?.telefone || "",
    "Origem whatsapp": client.fieldOrigins?.whatsapp || "",
    "Origem CPF completo": client.fieldOrigins?.cpfCompleto || "",
    "Origem cidade": client.fieldOrigins?.cidade || "",
    "Origem nome completo": client.fieldOrigins?.nomeCompleto || ""
      };
    })()
  }));
  const rawRows = cached.rows.map((client) => ({
    clienteBrisa: client.nomeCliente,
    vendedorBrisa: client.nomeVendedor,
    complementaryRawData: JSON.stringify(client.complementaryRawData || {}),
    possibleComplementaryMatches: JSON.stringify(client.possibleComplementaryMatches || []),
    rawMatches: JSON.stringify(client.rawMatches || [])
  }));
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), "Inadimplentes");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rawRows), "Raw complementar");
  const buffer = XLSX.write(workbook, { type: "buffer", bookType: "xlsx" });
  console.timeEnd("load vendedor excel");
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", `attachment; filename="${cached.competencia.nome}-${decodeURIComponent(req.params.nome)}-inadimplentes.xlsx"`);
  res.send(buffer);
}));

export default router;
