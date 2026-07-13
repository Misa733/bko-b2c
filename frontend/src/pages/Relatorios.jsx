import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import CardIndicador from "../components/CardIndicador.jsx";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { dateBr, number, percent } from "../utils/format.js";

export default function Relatorios({ competenciaId }) {
  const [report, setReport] = useState(null);

  useEffect(() => {
    if (!competenciaId) return;
    setReport(null);
    api.getRelatorio(competenciaId).then(setReport).catch(console.error);
  }, [competenciaId]);

  if (!report) return <LoadingState />;

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Relatorio da competencia</h2>
            <p className="muted">
              {report.competencia.nome} • {dateBr(report.competencia.dataInicio)} a {dateBr(report.competencia.dataFim)} • Emitido em {dateBr(report.competencia.emitidoEm)}
            </p>
          </div>
          <div className="actions">
            <a className="button" href={api.exportUrl(competenciaId, "csv")}>Exportar CSV</a>
            <a className="button primary" href={api.exportUrl(competenciaId, "excel")}>Exportar Excel</a>
          </div>
        </div>
      </div>
      <div className="metrics-grid">
        <CardIndicador label="Clientes analisados" value={number(report.resumo.totalClientes)} />
        <CardIndicador label="Em atraso" value={number(report.resumo.clientesEmAtraso)} tone="warn" />
        <CardIndicador label="Atraso critico" value={number(report.resumo.clientesAtrasoCritico)} tone="bad" />
        <CardIndicador label="Taxa pagto 1a" value={percent(report.resumo.taxaPagamentoPrimeiraFatura)} tone="good" />
      </div>
      <div className="panel">
        <h2>Ranking de vendedores</h2>
        <DataTable rows={report.rankingVendedores} columns={[
          { key: "nomeVendedor", label: "Vendedor" },
          { key: "clientesEmAtraso", label: "Atraso" },
          { key: "clientesNaoPagaramPrimeiraFatura", label: "Nao pagaram 1a" },
          { key: "churnSafra", label: "Churn", render: (row) => percent(row.churnSafra) },
          { key: "alertas", label: "Alertas", render: (row) => <div className="badges-row">{row.alertas.map((alerta) => <StatusBadge key={alerta} value={alerta} />)}</div> }
        ]} />
      </div>
      <div className="chart-grid">
        <div className="panel">
          <h2>Clientes em atraso</h2>
          <DataTable rows={report.clientesEmAtraso} columns={[
            { key: "nomeCliente", label: "Cliente" },
            { key: "nomeVendedor", label: "Vendedor" },
            { key: "telefone", label: "Telefone", render: (row) => row.telefone || "-" },
            { key: "cidade", label: "Cidade", render: (row) => row.cidade || "-" },
            { key: "matchedBy", label: "Match", render: (row) => <StatusBadge value={row.matchedBy || row.matchInfo?.matchedBy || "sem_match"} /> },
            { key: "confidence", label: "Confianca", render: (row) => <StatusBadge value={row.confidence || row.matchInfo?.confidence || "baixa"} /> },
            { key: "diasVencidos", label: "Dias" },
            { key: "statusAtraso", label: "Status", render: (row) => <StatusBadge value={row.statusAtraso} /> }
          ]} />
        </div>
        <div className="panel">
          <h2>Nao pagaram 1a fatura</h2>
          <DataTable rows={report.clientesNaoPagaramPrimeiraFatura} columns={[
            { key: "nomeCliente", label: "Cliente" },
            { key: "nomeVendedor", label: "Vendedor" },
            { key: "telefone", label: "Telefone", render: (row) => row.telefone || "-" },
            { key: "matchedBy", label: "Match", render: (row) => <StatusBadge value={row.matchedBy || row.matchInfo?.matchedBy || "sem_match"} /> },
            { key: "confidence", label: "Confianca", render: (row) => <StatusBadge value={row.confidence || row.matchInfo?.confidence || "baixa"} /> },
            { key: "fatPendente", label: "Fat. pendente" },
            { key: "mediaDiasAtraso", label: "Media atraso" }
          ]} />
        </div>
      </div>
    </section>
  );
}
