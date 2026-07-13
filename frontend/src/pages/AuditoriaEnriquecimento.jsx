import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

const filters = [
  ["todos", "Todos"],
  ["sem-match", "Sem match"],
  ["com-candidatos", "Com candidatos"],
  ["baixa-confianca", "Baixa confianca"],
  ["sem-telefone", "Sem telefone"],
  ["inadimplentes-sem-contato", "Inadimplentes sem contato"]
];

export default function AuditoriaEnriquecimento({ competenciaId }) {
  const [audit, setAudit] = useState(null);
  const [filter, setFilter] = useState("todos");
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!competenciaId) return;
    setAudit(null);
    api.getAudit(competenciaId).then(setAudit).catch(console.error);
  }, [competenciaId]);

  const rows = useMemo(() => {
    const baseRows = audit?.enriquecimentoComplementar?.amostras || [];
    return baseRows.filter((row) => {
      const text = `${row.clienteBrisa || ""} ${row.vendedorBrisa || ""} ${row.melhorCandidato || ""} ${row.cpfBrisa || ""}`.toLowerCase();
      if (search && !text.includes(search.toLowerCase())) return false;
      if (filter === "sem-match") return row.metodo === "sem_match";
      if (filter === "com-candidatos") return row.temCandidatos;
      if (filter === "baixa-confianca") return row.confianca === "baixa" || row.metodo === "nome_aproximado" || row.status === "ambiguous";
      if (filter === "sem-telefone") return !row.telefoneEncontrado;
      if (filter === "inadimplentes-sem-contato") return row.inadimplente && !row.telefoneEncontrado;
      return true;
    });
  }, [audit, filter, search]);

  if (!audit) return <LoadingState />;

  const enrichment = audit.enriquecimentoComplementar || {};

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Auditoria de Enriquecimento</h2>
            <p className="muted">Valide contatos confirmados e candidatos antes da cobranca.</p>
          </div>
          <span className="muted">{rows.length} registros filtrados</span>
        </div>
        <div className="audit-grid">
          <span>Total clientes <strong>{enrichment.totalClientesConsolidados || 0}</strong></span>
          <span>Com match confirmado <strong>{enrichment.totalComMatchComplementar || 0}</strong></span>
          <span>Com candidatos <strong>{enrichment.totalComCandidatos || 0}</strong></span>
          <span>Sem match <strong>{enrichment.totalSemMatch || 0}</strong></span>
          <span>Telefones encontrados <strong>{enrichment.totalTelefonesEncontrados || 0}</strong></span>
          <span>Inadimplentes sem contato <strong>{enrichment.totalInadimplentesSemContato || 0}</strong></span>
        </div>
      </div>

      <div className="panel filters">
        <input placeholder="Buscar cliente, vendedor, candidato ou CPF" value={search} onChange={(event) => setSearch(event.target.value)} />
        <select value={filter} onChange={(event) => setFilter(event.target.value)}>
          {filters.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
        </select>
      </div>

      <div className="panel">
        <DataTable
          rows={rows}
          rowClassName={(row) => row.inadimplente && !row.telefoneEncontrado ? "row-critical" : row.temCandidatos ? "row-warning" : ""}
          columns={[
            { key: "clienteBrisa", label: "Cliente Brisa" },
            { key: "vendedorBrisa", label: "Vendedor Brisa" },
            { key: "matchEncontrado", label: "Match confirmado?", render: (row) => <StatusBadge value={row.matchEncontrado === "Sim"} /> },
            { key: "melhorCandidato", label: "Melhor candidato", render: (row) => row.melhorCandidato || "-" },
            { key: "score", label: "Score", render: (row) => row.score || "-" },
            { key: "criteriosScore", label: "Criterios", render: (row) => row.criteriosScore || "-" },
            { key: "fonte", label: "Fonte", render: (row) => row.fonte || "-" },
            { key: "telefoneEncontrado", label: "Telefone", render: (row) => row.telefoneEncontrado || "-" },
            { key: "cpfComplementar", label: "CPF", render: (row) => row.cpfComplementar || row.cpfBrisa || "-" },
            { key: "cidade", label: "Cidade", render: (row) => row.cidade || "-" },
            { key: "metodo", label: "Metodo", render: (row) => <StatusBadge value={row.metodo || "sem_match"} /> },
            { key: "confianca", label: "Confianca", render: (row) => <StatusBadge value={row.confianca || "baixa"} /> }
          ]}
        />
      </div>
    </section>
  );
}
