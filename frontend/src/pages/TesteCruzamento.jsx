import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

function metric(label, value) {
  return <span>{label}<strong>{value}</strong></span>;
}

function candidatesText(candidates = []) {
  if (!candidates.length) return "-";
  return candidates.map((candidate) => `${candidate.nomeCliente || "-"} (${candidate.score || 0})`).join("; ");
}

export default function TesteCruzamento({ competencias, competenciaId, setCompetenciaId }) {
  const [data, setData] = useState(null);
  const [tab, setTab] = useState("bons");

  useEffect(() => {
    if (!competenciaId) return;
    setData(null);
    api.getTesteCruzamento(competenciaId).then(setData).catch(console.error);
  }, [competenciaId]);

  const rows = useMemo(() => {
    if (!data) return [];
    if (tab === "sem-match") return data.exemplosSemMatch || [];
    if (tab === "candidatos") return data.exemplosComCandidatos || [];
    if (tab === "ambiguos") return data.exemplosAmbiguos || [];
    return data.exemplosBons || [];
  }, [data, tab]);

  if (!competenciaId) return <div className="state">Selecione uma competencia.</div>;
  if (!data) return <LoadingState />;

  const resumo = data.resumo || {};

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Teste de Cruzamento</h2>
            <p className="muted">Simulacao do match entre clientes Brisa e bases internas, separando problema de dado e de algoritmo.</p>
          </div>
          <select value={competenciaId} onChange={(event) => setCompetenciaId(event.target.value)}>
            {competencias.map((competencia) => <option key={competencia.id} value={competencia.id}>{competencia.nome}</option>)}
          </select>
        </div>
        <div className="audit-grid">
          {metric("Total clientes Brisa", resumo.totalClientesBrisa)}
          {metric("Encontrados nas bases internas", resumo.totalClientesEncontrados)}
          {metric("Sem correspondencia", resumo.totalSemCorrespondencia)}
          {metric("Por CPF", resumo.totalPorCpf)}
          {metric("Nome + vendedor", resumo.totalPorNomeVendedor)}
          {metric("Por nome", resumo.totalPorNome)}
          {metric("Nome aproximado", resumo.totalPorNomeAproximado)}
          {metric("Ambiguo", resumo.totalAmbiguo)}
        </div>
      </div>

      <div className="panel">
        <div className="quick-filters">
          {[
            ["bons", "Clientes que bateram bem"],
            ["sem-match", "Clientes sem match"],
            ["candidatos", "Com possiveis candidatos"],
            ["ambiguos", "Ambiguos"]
          ].map(([id, label]) => (
            <button key={id} className={tab === id ? "active" : ""} onClick={() => setTab(id)}>{label}</button>
          ))}
        </div>
      </div>

      <div className="panel">
        <DataTable
          rows={rows}
          columns={[
            { key: "nomeBrisa", label: "Nome na Brisa" },
            { key: "vendedorBrisa", label: "Vendedor na Brisa" },
            { key: "cpfBrisa", label: "CPF na Brisa", render: (row) => row.cpfBrisa || "-" },
            { key: "metodo", label: "Metodo", render: (row) => <StatusBadge value={row.metodo || "sem_match"} /> },
            { key: "candidato", label: "Melhor candidato", render: (row) => row.candidato || "-" },
            { key: "score", label: "Score", render: (row) => row.score || "-" },
            { key: "criteriosScore", label: "Criterios", render: (row) => row.criteriosScore || "-" },
            { key: "possiveisNomesParecidos", label: "Possiveis nomes parecidos", render: (row) => candidatesText(row.possiveisNomesParecidos) },
            { key: "source", label: "Fonte", render: (row) => row.source || "-" }
          ]}
        />
      </div>
    </section>
  );
}
