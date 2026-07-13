import { useEffect, useState } from "react";
import { Bar, BarChart, CartesianGrid, Cell, Pie, PieChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from "recharts";
import { api } from "../services/api.js";
import CardIndicador from "../components/CardIndicador.jsx";
import LoadingState from "../components/LoadingState.jsx";
import { number, percent } from "../utils/format.js";

const colors = ["#16a34a", "#facc15", "#fb923c", "#dc2626", "#94a3b8"];

export default function Dashboard({ competenciaId }) {
  const [data, setData] = useState(null);

  useEffect(() => {
    if (!competenciaId) return;
    setData(null);
    api.getDashboard(competenciaId).then(setData).catch(console.error);
  }, [competenciaId]);

  if (!data) return <LoadingState />;

  const r = data.resumo;
  return (
    <section className="stack">
      <div className="metrics-grid">
        <CardIndicador label="Clientes analisados" value={number(r.totalClientes)} />
        <CardIndicador label="Vendedores" value={number(r.totalVendedores)} />
        <CardIndicador label="Clientes ativos" value={number(r.clientesAtivos)} tone="good" />
        <CardIndicador label="Em atraso" value={number(r.clientesEmAtraso)} tone="warn" />
        <CardIndicador label="Atraso critico" value={number(r.clientesAtrasoCritico)} tone="bad" />
        <CardIndicador label="Nao pagaram 1a fat." value={number(r.clientesNaoPagaramPrimeiraFatura)} tone="bad" />
        <CardIndicador label="Pagaram 1a fat." value={number(r.clientesPagaramPrimeiraFatura)} tone="good" hint={percent(r.taxaPagamentoPrimeiraFatura)} />
        <CardIndicador label="Pagaram 2a fat." value={number(r.clientesPagaramSegundaFatura)} tone="good" hint={percent(r.taxaPagamentoSegundaFatura)} />
        <CardIndicador label="Cancelamentos safra" value={number(r.cancelamentosSafra)} />
        <CardIndicador label="Churn medio safra" value={percent(r.churnMedioSafra)} tone="warn" />
      </div>

      <div className="chart-grid">
        <div className="panel">
          <h2>Clientes em atraso por vendedor</h2>
          <ResponsiveContainer width="100%" height={280}>
            <BarChart data={data.graficos.atrasoPorVendedor}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" />
              <YAxis />
              <Tooltip />
              <Bar dataKey="value" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </div>
        <div className="panel">
          <h2>Distribuicao por status de atraso</h2>
          <ResponsiveContainer width="100%" height={280}>
            <PieChart>
              <Pie data={data.graficos.atrasoDistribuicao} dataKey="value" nameKey="name" outerRadius={100} label>
                {data.graficos.atrasoDistribuicao.map((_, index) => <Cell key={index} fill={colors[index % colors.length]} />)}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
