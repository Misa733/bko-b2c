import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { percent } from "../utils/format.js";

export default function Vendedores({ competenciaId, openVendorClients }) {
  const [rows, setRows] = useState(null);
  const [filters, setFilters] = useState({ nome: "", atraso: false, churn: false, inadimplencia: false, ordem: "pior" });

  useEffect(() => {
    if (!competenciaId) return;
    setRows(null);
    api.getVendedores(competenciaId).then(setRows).catch(console.error);
  }, [competenciaId]);

  const filtered = useMemo(() => {
    const list = [...(rows || [])].filter((row) => {
      if (filters.nome && !row.nomeVendedor.toLowerCase().includes(filters.nome.toLowerCase())) return false;
      if (filters.atraso && row.clientesInadimplentes === 0) return false;
      if (filters.churn && row.churnSafra < 0.25) return false;
      if (filters.inadimplencia && row.clientesInadimplentes === 0) return false;
      return true;
    });
    return list.sort((a, b) => {
      const scoreA = a.clientesInadimplentes + a.clientesAtrasoCritico + a.churnSafra * 10;
      const scoreB = b.clientesInadimplentes + b.clientesAtrasoCritico + b.churnSafra * 10;
      return filters.ordem === "pior" ? scoreB - scoreA : scoreA - scoreB;
    });
  }, [rows, filters]);

  if (!rows) return <LoadingState />;

  const resumoCritico = {
    vendedoresComAtraso: rows.filter((row) => row.clientesEmAtraso > 0).length,
    vendedoresComInadimplencia: rows.filter((row) => row.clientesInadimplentes > 0).length,
    vendedoresComSegundaPendente: rows.filter((row) => row.clientesComSegundaFaturaPendente > 0).length,
    clientesEmAtraso: rows.reduce((sum, row) => sum + row.clientesEmAtraso, 0),
    clientesNaoPagaramPrimeira: rows.reduce((sum, row) => sum + row.clientesNaoPagaramPrimeiraFatura, 0)
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
          <span>Acao imediata</span>
          <strong>{resumoCritico.vendedoresComInadimplencia}</strong>
          <small>vendedores com clientes inadimplentes</small>
        </div>
        <div className="attention-card warning">
          <span>Clientes em atraso</span>
          <strong>{resumoCritico.clientesEmAtraso}</strong>
          <small>distribuidos em {resumoCritico.vendedoresComAtraso} vendedores</small>
        </div>
        <div className="attention-card orange">
          <span>Acompanhar 2a fatura</span>
          <strong>{resumoCritico.vendedoresComSegundaPendente}</strong>
          <small>vendedores com clientes aguardando 2a fatura</small>
        </div>
      </div>

      <div className="panel filters">
        <input placeholder="Nome vendedor" value={filters.nome} onChange={(e) => setFilters({ ...filters, nome: e.target.value })} />
        <label><input type="checkbox" checked={filters.atraso} onChange={(e) => setFilters({ ...filters, atraso: e.target.checked })} /> Apenas com atraso</label>
        <label><input type="checkbox" checked={filters.churn} onChange={(e) => setFilters({ ...filters, churn: e.target.checked })} /> Apenas churn alto</label>
        <label><input type="checkbox" checked={filters.inadimplencia} onChange={(e) => setFilters({ ...filters, inadimplencia: e.target.checked })} /> Apenas inadimplencia</label>
        <select value={filters.ordem} onChange={(e) => setFilters({ ...filters, ordem: e.target.value })}>
          <option value="pior">Pior desempenho</option>
          <option value="melhor">Melhor desempenho</option>
        </select>
      </div>

      <div className="panel">
        <h2>Vendedores</h2>
        <DataTable
          rows={filtered}
          rowClassName={vendorRowClass}
          columns={[
            { key: "nomeVendedor", label: "Nome vendedor", render: (row) => (
              <div className="vendor-cell">
                <strong>{row.nomeVendedor}</strong>
                <div className="badges-row">{row.alertas.map((alerta) => <StatusBadge key={alerta} value={alerta} />)}</div>
              </div>
            ) },
            { key: "totalClientes", label: "Total clientes" },
            { key: "clientesInadimplentes", label: "Clientes inadimplentes", render: (row) => row.clientesInadimplentes > 0 ? <strong className="danger-text">{row.clientesInadimplentes}</strong> : row.clientesInadimplentes },
            { key: "clientesAtrasoCritico", label: "Atraso critico", render: (row) => row.clientesAtrasoCritico > 0 ? <strong className="danger-text">{row.clientesAtrasoCritico}</strong> : row.clientesAtrasoCritico },
            { key: "churnSafra", label: "Churn", render: (row) => percent(row.churnSafra) },
            { key: "cancelamentosSafra", label: "Cancelamentos" },
            { key: "acoes", label: "Acao", render: (row) => <button className="primary" onClick={() => openVendorClients(row.nomeVendedor)}>Abrir Clientes</button> }
          ]}
        />
      </div>
    </section>
  );
}
