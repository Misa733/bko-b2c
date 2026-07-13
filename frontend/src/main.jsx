import React, { useEffect, useMemo, useState } from "react";
import { createRoot } from "react-dom/client";
import "./styles.css";
import Layout from "./components/Layout.jsx";
import Competencias from "./pages/Competencias.jsx";
import Importacao from "./pages/Importacao.jsx";
import Dashboard from "./pages/Dashboard.jsx";
import Vendedores from "./pages/Vendedores.jsx";
import Clientes from "./pages/Clientes.jsx";
import Relatorios from "./pages/Relatorios.jsx";
import ClientesVendedor from "./pages/ClientesVendedor.jsx";
import Configuracoes from "./pages/Configuracoes.jsx";
import AuditoriaEnriquecimento from "./pages/AuditoriaEnriquecimento.jsx";
import DiagnosticoBasesInternas from "./pages/DiagnosticoBasesInternas.jsx";
import TesteCruzamento from "./pages/TesteCruzamento.jsx";
import { api } from "./services/api.js";

function App() {
  const [page, setPage] = useState("vendedores");
  const [selectedVendorName, setSelectedVendorName] = useState("");
  const [competencias, setCompetencias] = useState([]);
  const [competenciaId, setCompetenciaId] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  async function loadCompetencias() {
    const data = await api.getCompetencias();
    setCompetencias(data);
    if (!competenciaId && data[0]) setCompetenciaId(data[0].id);
  }

  useEffect(() => {
    loadCompetencias().catch(console.error);
  }, [refreshKey]);

  const competencia = useMemo(
    () => competencias.find((item) => item.id === competenciaId),
    [competencias, competenciaId]
  );

  const context = {
    competencias,
    competencia,
    competenciaId,
    setCompetenciaId,
    selectedVendorName,
    openVendorClients: (nome) => {
      setSelectedVendorName(nome);
      setPage("clientes-vendedor");
    },
    goToVendedores: () => {
      setSelectedVendorName("");
      setPage("vendedores");
    },
    reload: () => setRefreshKey((value) => value + 1)
  };

  const pages = {
    competencias: <Competencias {...context} />,
    importacao: <Importacao {...context} />,
    dashboard: <Dashboard {...context} />,
    vendedores: <Vendedores {...context} />,
    "clientes-vendedor": <ClientesVendedor {...context} />,
    clientes: <Clientes {...context} />,
    "auditoria-enriquecimento": <AuditoriaEnriquecimento {...context} />,
    "diagnostico-bases": <DiagnosticoBasesInternas {...context} />,
    "teste-cruzamento": <TesteCruzamento {...context} />,
    relatorios: <Relatorios {...context} />,
    configuracoes: <Configuracoes {...context} />
  };

  return (
    <Layout page={page} setPage={setPage} {...context}>
      {pages[page]}
    </Layout>
  );
}

createRoot(document.getElementById("root")).render(<App />);
