import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { percent } from "../utils/format.js";

const filterOptions = [
  { id: "cobranca", label: "Atraso ou inadimplencia" },
  { id: "critico", label: "Atraso critico" },
  { id: "inadimplencia", label: "Inadimplencia" },
  { id: "primeira", label: "Nao pagou 1a parcela" },
  { id: "segunda", label: "2a parcela pendente" },
  { id: "todos", label: "Todos vendedores" }
];

export default function Vendedores({ competenciaId, openVendorClients }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ nome: "", situacao: "cobranca", ordem: "pior" });

  useEffect(() => {
    if (!competenciaId) return;
    setRows(null);
    api.getVendedores(competenciaId).then(setRows).catch(console.error);
  }, [competenciaId]);

  const filtered = useMemo(() => {
    const list = [...(rows || [])].filter((row) => {
      if (filters.nome && !row.nomeVendedor.toLowerCase().includes(filters.nome.toLowerCase())) return false;
      if (filters.situacao === "cobranca") return row.clientesEmAtraso > 0 || row.clientesInadimplentes > 0 || row.clientesNaoPagaramPrimeiraFatura > 0;
      if (filters.situacao === "critico") return row.clientesAtrasoCritico > 0;
      if (filters.situacao === "inadimplencia") return row.clientesInadimplentes > 0;
      if (filters.situacao === "primeira") return row.clientesNaoPagaramPrimeiraFatura > 0;
      if (filters.situacao === "segunda") return row.clientesComSegundaFaturaPendente > 0;
      return true;
    });
    return list.sort((a, b) => {
      const scoreA = a.clientesAtrasoCritico * 5 + a.clientesInadimplentes * 4 + a.clientesNaoPagaramPrimeiraFatura * 3 + a.clientesEmAtraso * 2 + a.clientesComSegundaFaturaPendente;
      const scoreB = b.clientesAtrasoCritico * 5 + b.clientesInadimplentes * 4 + b.clientesNaoPagaramPrimeiraFatura * 3 + b.clientesEmAtraso * 2 + b.clientesComSegundaFaturaPendente;
      if (filters.ordem === "nome") return String(a.nomeVendedor || "").localeCompare(String(b.nomeVendedor || ""));
      if (filters.ordem === "menos") return scoreA - scoreB;
      return scoreB - scoreA;
    });
  }, [rows, filters]);

  if (!rows) return <LoadingState />;

  const resumoCritico = {
    vendedoresComAtraso: rows.filter((row) => row.clientesEmAtraso > 0).length,
    vendedoresComInadimplencia: rows.filter((row) => row.clientesInadimplentes > 0).length,
    vendedoresComSegundaPendente: rows.filter((row) => row.clientesComSegundaFaturaPendente > 0).length,
    clientesEmAtraso: rows.reduce((sum, row) => sum + row.clientesEmAtraso, 0),
    clientesNaoPagaramPrimeira: rows.reduce((sum, row) => sum + row.clientesNaoPagaramPrimeiraFatura, 0),
    clientesAtrasoCritico: rows.reduce((sum, row) => sum + row.clientesAtrasoCritico, 0)
  };

  function vendorRowClass(row) {
    if (row.clientesAtrasoCritico > 0 || row.clientesInadimplentes > 0) return "row-critical";
    if (row.clientesComSegundaFaturaPendente > 0) return "row-warning";
    return "";
  }

  return (
    <section className="stack">
      <div className="attention-grid">
        <div className="attention-card critical">
          <span>Para cobrar agora</span>
          <strong>{filtered.length}</strong>
          <small>vendedores no filtro selecionado</small>
        </div>
        <div className="attention-card warning">
          <span>Clientes em atraso</span>
          <strong>{resumoCritico.clientesEmAtraso}</strong>
          <small>distribuidos em {resumoCritico.vendedoresComAtraso} vendedores</small>
        </div>
        <div className="attention-card orange">
          <span>Atraso critico</span>
          <strong>{resumoCritico.clientesAtrasoCritico}</strong>
          <small>clientes acima do limite de risco</small>
        </div>
      </div>

      <div className="panel compact">
        <div className="panel-header">
          <div>
            <h2>Fila de vendedores para cobranca</h2>
            <p className="muted">A tela ja abre mostrando quem tem cliente com atraso, inadimplencia ou primeira parcela em aberto.</p>
          </div>
          <span className="muted">{filtered.length} de {rows.length} vendedores</span>
        </div>
        <div className="quick-filters">
          {filterOptions.map((option) => (
            <button
              key={option.id}
              className={filters.situacao === option.id ? "active" : ""}
              onClick={() => setFilters({ ...filters, situacao: option.id })}
            >
              {option.label}
            </button>
          ))}
        </div>
        <div className="filters vendor-filter-bar">
          <input placeholder="Buscar vendedor pelo nome" value={filters.nome} onChange={(e) => setFilters({ ...filters, nome: e.target.value })} />
          <select value={filters.ordem} onChange={(e) => setFilters({ ...filters, ordem: e.target.value })}>
            <option value="pior">Mais urgentes primeiro</option>
            <option value="menos">Menos urgentes primeiro</option>
            <option value="nome">Ordem alfabetica</option>
          </select>
          <button className="ghost" onClick={() => setFilters({ nome: "", situacao: "cobranca", ordem: "pior" })}>Limpar filtros</button>
        </div>
      </div>

      <div className="panel">
        <h2>Vendedores com pendencias</h2>
        <DataTable
          rows={filtered}
          empty="Nenhum vendedor encontrado para este filtro."
          rowClassName={vendorRowClass}
          columns={[
            { key: "nomeVendedor", label: "Nome vendedor", render: (row) => (
              <div className="vendor-cell">
                <strong>{row.nomeVendedor}</strong>
                <div className="badges-row">{row.alertas.map((alerta) => <StatusBadge key={alerta} value={alerta} />)}</div>
              </div>
            ) },
            { key: "totalClientes", label: "Total clientes" },
            { key: "clientesEmAtraso", label: "Com atraso", render: (row) => row.clientesEmAtraso > 0 ? <strong className="warning-text">{row.clientesEmAtraso}</strong> : row.clientesEmAtraso },
            { key: "clientesInadimplentes", label: "Clientes inadimplentes", render: (row) => row.clientesInadimplentes > 0 ? <strong className="danger-text">{row.clientesInadimplentes}</strong> : row.clientesInadimplentes },
            { key: "clientesAtrasoCritico", label: "Atraso critico", render: (row) => row.clientesAtrasoCritico > 0 ? <strong className="danger-text">{row.clientesAtrasoCritico}</strong> : row.clientesAtrasoCritico },
            { key: "clientesNaoPagaramPrimeiraFatura", label: "Nao pagou 1a", render: (row) => row.clientesNaoPagaramPrimeiraFatura > 0 ? <strong className="danger-text">{row.clientesNaoPagaramPrimeiraFatura}</strong> : row.clientesNaoPagaramPrimeiraFatura },
            { key: "clientesComSegundaFaturaPendente", label: "2a pendente", render: (row) => row.clientesComSegundaFaturaPendente > 0 ? <strong className="warning-text">{row.clientesComSegundaFaturaPendente}</strong> : row.clientesComSegundaFaturaPendente },
            { key: "churnSafra", label: "Churn", render: (row) => percent(row.churnSafra) },
            { key: "acoes", label: "Acao", render: (row) => <button className="primary" onClick={() => openVendorClients(row.nomeVendedor)}>Ver clientes</button> }
          ]}
        />
      </div>
    </section>
  );
}
