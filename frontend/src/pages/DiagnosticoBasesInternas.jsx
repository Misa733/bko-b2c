import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";

function metric(label, value) {
  return <span>{label}<strong>{value}</strong></span>;
}

export default function DiagnosticoBasesInternas() {
  const [data, setData] = useState(null);
  const [selectedSource, setSelectedSource] = useState("");
  const [problemFilter, setProblemFilter] = useState("");

  useEffect(() => {
    api.getDiagnosticoBasesInternas().then((result) => {
      setData(result);
      setSelectedSource(result[0]?.source || "");
    }).catch(console.error);
  }, []);

  const selected = useMemo(
    () => (data || []).find((sheet) => sheet.source === selectedSource) || data?.[0],
    [data, selectedSource]
  );

  const problems = useMemo(() => {
    const rows = selected?.problemas || [];
    if (!problemFilter) return rows;
    return rows.filter((row) => row.problema === problemFilter);
  }, [selected, problemFilter]);

  const problemTypes = useMemo(
    () => Array.from(new Set((selected?.problemas || []).map((row) => row.problema))).sort(),
    [selected]
  );

  if (!data || !selected) return <LoadingState />;

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Diagnostico das Bases Internas</h2>
            <p className="muted">Qualidade das planilhas complementares usadas no cruzamento com a Brisa.</p>
          </div>
          <select value={selectedSource} onChange={(event) => { setSelectedSource(event.target.value); setProblemFilter(""); }}>
            {data.map((sheet) => <option key={sheet.source} value={sheet.source}>{sheet.nome}</option>)}
          </select>
        </div>
        <div className="audit-grid">
          {metric("Total de linhas lidas", selected.totalLinhas)}
          {metric("Colunas encontradas", selected.colunasEncontradas.length)}
          {metric("Registros com CPF", selected.registrosComCpf)}
          {metric("Registros com telefone", selected.registrosComTelefone)}
          {metric("Registros com nome", selected.registrosComNomeCliente)}
          {metric("Registros com vendedor", selected.registrosComVendedor)}
          {metric("Sem CPF", selected.registrosSemCpf)}
          {metric("Sem telefone", selected.registrosSemTelefone)}
          {metric("Duplicados", selected.registrosDuplicados)}
          {metric("Nome curto/invalido", selected.registrosNomeInvalido)}
        </div>
      </div>

      <details className="panel">
        <summary>Colunas encontradas</summary>
        <div className="badges-row diagnostics-columns">
          {selected.colunasEncontradas.map((column) => <span className="badge gray" key={column}>{column}</span>)}
        </div>
      </details>

      <div className="panel">
        <div className="panel-header">
          <div>
            <h2>Problemas encontrados</h2>
            <p className="muted">{problems.length} ocorrencias filtradas</p>
          </div>
          <select value={problemFilter} onChange={(event) => setProblemFilter(event.target.value)}>
            <option value="">Todos os problemas</option>
            {problemTypes.map((problem) => <option key={problem} value={problem}>{problem}</option>)}
          </select>
        </div>
        <DataTable
          rows={problems}
          columns={[
            { key: "linha", label: "Linha" },
            { key: "nomeCliente", label: "Nome Cliente", render: (row) => row.nomeCliente || "-" },
            { key: "cpf", label: "CPF", render: (row) => row.cpf || "-" },
            { key: "telefone", label: "Telefone", render: (row) => row.telefone || "-" },
            { key: "vendedor", label: "Vendedor", render: (row) => row.vendedor || "-" },
            { key: "problema", label: "Problema encontrado" }
          ]}
        />
      </div>
    </section>
  );
}
