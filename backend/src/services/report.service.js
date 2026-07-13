import XLSX from "xlsx";

export function buildReport(competencia) {
  const data = competencia.dadosConsolidados;
  return {
    competencia: {
      nome: competencia.nome,
      dataInicio: competencia.dataInicio,
      dataFim: competencia.dataFim,
      emitidoEm: new Date().toISOString()
    },
    resumo: data?.dashboard?.resumo || {},
    rankingVendedores: data?.vendedores || [],
    clientesEmAtraso: (data?.clientes || []).filter((item) => item.diasVencidos > 0),
    clientesNaoPagaramPrimeiraFatura: (data?.clientes || []).filter((item) => item.naoPagouPrimeiraFatura),
    clientesAtrasoCritico: (data?.clientes || []).filter((item) => item.diasVencidos > 15)
  };
}

export function toCsv(rows = []) {
  if (!rows.length) return "";
  const columns = Object.keys(rows[0]);
  const escape = (value) => `"${String(value ?? "").replace(/"/g, '""')}"`;
  return [columns.join(";"), ...rows.map((row) => columns.map((column) => escape(row[column])).join(";"))].join("\n");
}

function warningText(client) {
  return [...new Set([...(client.matchInfo?.warnings || []), ...(client.alertas || [])])].join("; ");
}

function clientReportRow(client) {
  return {
    "Cliente Brisa": client.nomeCliente || "",
    "Nome Complementar": client.nomeCompleto || client.nomeClienteComplementar || "",
    "CPF Brisa": client.cpfCliente || "",
    "CPF Complementar": client.cpfCompleto || "",
    Telefone: client.telefone || "",
    WhatsApp: client.whatsapp || "",
    Cidade: client.cidade || "",
    Estado: client.estado || "",
    Bairro: client.bairro || "",
    Endereco: client.endereco || "",
    CEP: client.cep || "",
    Email: client.email || "",
    Observacoes: client.observacoes || "",
    Vendedor: client.nomeVendedor || "",
    "Status 1a fatura": client.statusPrimeiraFatura || "",
    "Status 2a fatura": client.statusSegundaFatura || "",
    "Dias vencidos": client.diasVencidos || 0,
    "Motivo inadimplencia": client.motivoInadimplencia || "",
    "Fonte complementar": client.origemComplementar || "",
    "Match encontrado": client.matchInfo?.hasComplementaryMatch ? "Sim" : "Nao",
    "Metodo match": client.matchedBy || client.matchInfo?.matchedBy || "sem_match",
    Confianca: client.confidence || client.matchInfo?.confidence || "baixa",
    Alertas: warningText(client),
    "Origem telefone": client.fieldOrigins?.telefone || "",
    "Origem whatsapp": client.fieldOrigins?.whatsapp || "",
    "Origem CPF completo": client.fieldOrigins?.cpfCompleto || "",
    "Origem cidade": client.fieldOrigins?.cidade || "",
    "Origem nome completo": client.fieldOrigins?.nomeCompleto || ""
  };
}

export function reportWorkbook(competencia) {
  const report = buildReport(competencia);
  const clients = competencia.dadosConsolidados?.clientes || [];
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet([report.resumo]), "Resumo");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.rankingVendedores), "Vendedores");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clients.map(clientReportRow)), "Clientes");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(report.clientesEmAtraso.map(clientReportRow)), "Atrasados");
  XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(clients.map((client) => ({
    clienteBrisa: client.nomeCliente || "",
    vendedorBrisa: client.nomeVendedor || "",
    origemComplementar: client.origemComplementar || "",
    complementaryRawData: JSON.stringify(client.complementaryRawData || {})
  }))), "Raw complementar");
  return workbook;
}
