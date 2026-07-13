import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { dateBr } from "../utils/format.js";

const initialFilters = {
  cliente: "", cpf: "", vendedor: "", parceiro: "", statusAtraso: "",
  atrasados: false, critico: false, naoPagou1: false, pagou1: false, pagou2: false
};

export default function Clientes({ competenciaId }) {
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState(initialFilters);
  const [debouncedFilters, setDebouncedFilters] = useState(initialFilters);
  const [page, setPage] = useState(1);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedFilters(filters);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [filters]);

  useEffect(() => {
    if (!competenciaId) return;
    setData(null);
    api.getClientes(competenciaId, { ...debouncedFilters, page, pageSize: 50 })
      .then(setData)
      .catch(console.error);
  }, [competenciaId, debouncedFilters, page]);

  if (!data) return <LoadingState />;

  return (
    <section className="stack">
      <div className="panel filters">
        <input placeholder="Cliente" value={filters.cliente} onChange={(e) => setFilters({ ...filters, cliente: e.target.value })} />
        <input placeholder="CPF" value={filters.cpf} onChange={(e) => setFilters({ ...filters, cpf: e.target.value })} />
        <input placeholder="Vendedor" value={filters.vendedor} onChange={(e) => setFilters({ ...filters, vendedor: e.target.value })} />
        <input placeholder="Parceiro" value={filters.parceiro} onChange={(e) => setFilters({ ...filters, parceiro: e.target.value })} />
        <select value={filters.statusAtraso} onChange={(e) => setFilters({ ...filters, statusAtraso: e.target.value })}>
          <option value="">Todos os status</option>
          <option value="A vencer">A vencer</option>
          <option value="Em dia">Em dia</option>
          <option value="Atencao">Atencao</option>
          <option value="Atraso moderado">Atraso moderado</option>
          <option value="Atraso critico">Atraso critico</option>
        </select>
        <label><input type="checkbox" checked={filters.atrasados} onChange={(e) => setFilters({ ...filters, atrasados: e.target.checked })} /> Apenas atrasados</label>
        <label><input type="checkbox" checked={filters.critico} onChange={(e) => setFilters({ ...filters, critico: e.target.checked })} /> Atraso critico</label>
        <label><input type="checkbox" checked={filters.naoPagou1} onChange={(e) => setFilters({ ...filters, naoPagou1: e.target.checked })} /> Nao pagaram 1a</label>
        <label><input type="checkbox" checked={filters.pagou1} onChange={(e) => setFilters({ ...filters, pagou1: e.target.checked })} /> Pagaram 1a</label>
        <label><input type="checkbox" checked={filters.pagou2} onChange={(e) => setFilters({ ...filters, pagou2: e.target.checked })} /> Pagaram 2a</label>
      </div>
      <div className="panel">
        <div className="panel-header">
          <h2>Clientes consolidados</h2>
          <span className="muted">Pagina {data.page} de {data.totalPages} - {data.total} clientes</span>
        </div>
        <DataTable rows={data.rows} rowClassName={(row) => row.diasVencidos > 15 || row.naoPagouPrimeiraFatura ? "row-critical" : row.diasVencidos > 0 ? "row-warning" : ""} columns={[
          { key: "nomeCliente", label: "Cliente" },
          { key: "cpfCliente", label: "CPF" },
          { key: "cpfCompleto", label: "CPF compl." },
          { key: "telefone", label: "Telefone", render: (row) => row.telefone || "-" },
          { key: "cidade", label: "Cidade", render: (row) => row.cidade || "-" },
          { key: "nomeVendedor", label: "Vendedor" },
          { key: "nomeParceiro", label: "Parceiro" },
          { key: "inicioContrato", label: "Inicio", render: (row) => dateBr(row.inicioContrato) },
          { key: "ativo", label: "Ativo", render: (row) => <StatusBadge value={row.ativo} /> },
          { key: "dtVencimento", label: "Vencimento", render: (row) => dateBr(row.dtVencimento) },
          { key: "diasVencidos", label: "Dias vencidos" },
          { key: "statusAtraso", label: "Status atraso", render: (row) => <StatusBadge value={row.statusAtraso} /> },
          { key: "pagouPrimeiraFatura", label: "Pagou 1a", render: (row) => <StatusBadge value={row.pagouPrimeiraFatura} /> },
          { key: "pagouSegundaFatura", label: "Pagou 2a", render: (row) => <StatusBadge value={row.pagouSegundaFatura} /> },
          { key: "naoPagouPrimeiraFatura", label: "Nao pagou 1a", render: (row) => <StatusBadge value={row.naoPagouPrimeiraFatura} /> },
          { key: "matchedBy", label: "Match", render: (row) => <StatusBadge value={row.matchedBy || row.matchInfo?.matchedBy || "sem_match"} /> },
          { key: "confidence", label: "Confianca", render: (row) => <StatusBadge value={row.confidence || row.matchInfo?.confidence || "baixa"} /> },
          { key: "fatPendente", label: "Fat. pendente" }
        ]} />
        <div className="actions">
          <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
          <button disabled={page >= data.totalPages} onClick={() => setPage((value) => value + 1)}>Proxima</button>
        </div>
      </div>
    </section>
  );
}
