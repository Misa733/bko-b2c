const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333/api";

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(`${API_URL}${path}`, options);
  } catch (error) {
    const offline = new Error("Backend offline ou reiniciando. Aguarde alguns segundos e tente novamente.");
    offline.details = error.message;
    throw offline;
  }

  if (!response.ok) {
    const error = await response.json().catch(() => ({ message: "Erro na requisicao." }));
    const requestError = new Error(error.message || "Erro na requisicao.");
    requestError.details = error.details || "";
    requestError.status = response.status;
    throw requestError;
  }
  if (response.status === 204) return null;
  return response.json();
}

function query(params = {}) {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (value !== undefined && value !== null && value !== "") search.set(key, value);
  });
  const text = search.toString();
  return text ? `?${text}` : "";
}

export const api = {
  getCompetencias: () => request("/competencias"),
  getCompetencia: (id) => request(`/competencias/${id}`),
  createCompetencia: (data) =>
    request("/competencias", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data)
    }),
  deleteCompetencia: (id) => request(`/competencias/${id}`, { method: "DELETE" }),
  upload: (id, files) => {
    const formData = new FormData();
    Array.from(files).forEach((file) => formData.append("files", file));
    return request(`/competencias/${id}/upload`, { method: "POST", body: formData });
  },
  getImportacoes: (id) => request(`/competencias/${id}/importacoes`),
  consolidar: (id) => request(`/competencias/${id}/consolidar`, { method: "POST" }),
  getDashboard: (id) => request(`/competencias/${id}/dashboard`),
  getAudit: (id) => request(`/competencias/${id}/audit`),
  getVendedores: (id) => request(`/competencias/${id}/vendedores`),
  getVendedor: (id, nome) => request(`/competencias/${id}/vendedores/${encodeURIComponent(nome)}`),
  getVendedorClientes: (id, nome, params) => request(`/competencias/${id}/vendedores/${encodeURIComponent(nome)}/clientes${query(params)}`),
  vendedorPdfUrl: (id, nome, params) => `${API_URL}/competencias/${id}/vendedores/${encodeURIComponent(nome)}/pdf${query(params)}`,
  vendedorExcelUrl: (id, nome, params) => `${API_URL}/competencias/${id}/vendedores/${encodeURIComponent(nome)}/export/excel${query(params)}`,
  getClientes: (id, params) => request(`/competencias/${id}/clientes${query(params)}`),
  getRelatorio: (id) => request(`/competencias/${id}/relatorio`),
  getConfiguracoes: () => request("/configuracoes"),
  getComplementarySheetsStatus: () => request("/complementary-sheets/status"),
  syncComplementarySheets: () => request("/complementary-sheets/sync", { method: "POST" }),
  getDiagnosticoBasesInternas: () => request("/diagnostics/internal-bases"),
  getTesteCruzamento: (id) => request(`/diagnostics/cross-test/${id}`),
  savePlanilhasComplementares: (planilhasComplementares) =>
    request("/configuracoes/planilhas-complementares", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ planilhasComplementares })
    }),
  sincronizarPlanilhasComplementares: () =>
    request("/configuracoes/planilhas-complementares/sincronizar", { method: "POST" }),
  testGoogleSheets: ({ spreadsheetUrl, sheetName }) =>
    request("/google-sheets/test", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ spreadsheetUrl, sheetName })
    }),
  exportUrl: (id, type) => `${API_URL}/competencias/${id}/export/${type}`
};
