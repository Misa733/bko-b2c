import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import UploadBox from "../components/UploadBox.jsx";
import DataTable from "../components/DataTable.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

export default function Importacao({ competenciaId, reload }) {
  const [data, setData] = useState({ importacoes: [], fontes: [] });
  const [auditoria, setAuditoria] = useState(null);
  const [auditFilter, setAuditFilter] = useState("todos");
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function load() {
    if (!competenciaId) return;
    const [importacoes, auditResult] = await Promise.all([
      api.getImportacoes(competenciaId),
      api.getAudit(competenciaId).catch(() => null)
    ]);
    setData(importacoes);
    setAuditoria(auditResult || null);
  }

  useEffect(() => {
    load().catch(console.error);
  }, [competenciaId]);

  async function upload(files) {
    if (!files?.length) return;
    setLoading(true);
    setMessage("");
    try {
      await api.upload(competenciaId, files);
      await load();
      reload();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setLoading(false);
    }
  }

  async function consolidar() {
    setLoading(true);
    setMessage("");
    try {
      await api.consolidar(competenciaId);
      await load();
      setMessage("Dados consolidados com sucesso.");
    } catch (error) {
      setMessage(error.message || "Erro ao consolidar dados.");
    } finally {
      setLoading(false);
    }
  }

  const auditRows = (auditoria?.enriquecimentoComplementar?.amostras || []).filter((row) => {
    if (auditFilter === "sem_telefone") return !row.telefoneEncontrado;
    if (auditFilter === "sem_match") return row.metodo === "sem_match" || row.matchEncontrado === "Nao";
    if (auditFilter === "baixa_confianca") return row.confianca === "baixa";
    if (auditFilter === "conflito") return Boolean(row.alertas);
    if (auditFilter === "inadimplentes_sem_contato") return row.inadimplente && !row.telefoneEncontrado;
    return true;
  });

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <h2>Importacao de planilhas</h2>
          <button className="primary" onClick={consolidar} disabled={loading || !competenciaId}>Reconsolidar com dados complementares</button>
        </div>
        <UploadBox onFiles={upload} />
        {loading && <p className="muted">Processando arquivos...</p>}
        {message && <p className={message.includes("sucesso") ? "success" : "error"}>{message}</p>}
      </div>

      <div className="status-grid">
        {data.fontes.map((fonte) => (
          <div className="source-card" key={fonte.type}>
            <strong>{fonte.label}</strong>
            <StatusBadge value={fonte.status} />
          </div>
        ))}
      </div>

      {auditoria && (
        <div className="panel">
          <h2>Auditoria da consolidacao</h2>
          <p className="muted">Use estes numeros para conferir se o volume consolidado bate com as planilhas importadas.</p>
          <div className="audit-grid">
            <span>Data de referencia do atraso <strong>{auditoria.dataReferenciaAtraso}</strong></span>
            <span>Clientes consolidados <strong>{auditoria.clientesConsolidados}</strong></span>
            <span>Vendedores consolidados <strong>{auditoria.vendedoresConsolidados}</strong></span>
            <span>Clientes com CPF <strong>{auditoria.clientesComCpf}</strong></span>
            <span>Clientes sem CPF <strong>{auditoria.clientesSemCpf}</strong></span>
            <span>Pagaram 1a fatura <strong>{auditoria.clientesComPagamentoPrimeiraFatura}</strong></span>
            <span>Pagaram 2a fatura <strong>{auditoria.clientesComPagamentoSegundaFatura}</strong></span>
            <span>Faturas ainda a vencer <strong>{auditoria.clientesComFaturaAindaNaoVenceu}</strong></span>
            <span>Atraso real <strong>{auditoria.clientesEmAtrasoReal}</strong></span>
          </div>

          {auditoria.enriquecimentoComplementar && (
            <>
              <h2>Auditoria de Cruzamento</h2>
              <div className="audit-grid">
                <span>Clientes consolidados <strong>{auditoria.enriquecimentoComplementar.totalClientesConsolidados}</strong></span>
                <span>Com match complementar <strong>{auditoria.enriquecimentoComplementar.totalComMatchComplementar}</strong></span>
                <span>Sem match <strong>{auditoria.enriquecimentoComplementar.totalSemMatch}</strong></span>
                <span>Match por CPF <strong>{auditoria.enriquecimentoComplementar.totalMatchCpf}</strong></span>
                <span>Match nome + vendedor <strong>{auditoria.enriquecimentoComplementar.totalMatchNomeVendedor}</strong></span>
                <span>Match nome + cidade <strong>{auditoria.enriquecimentoComplementar.totalMatchNomeCidade}</strong></span>
                <span>Match por nome <strong>{auditoria.enriquecimentoComplementar.totalMatchNome}</strong></span>
                <span>Match aproximado <strong>{auditoria.enriquecimentoComplementar.totalMatchNomeAproximado}</strong></span>
                <span>Ambiguos <strong>{auditoria.enriquecimentoComplementar.totalAmbiguo}</strong></span>
                <span>Conflitos CPF <strong>{auditoria.enriquecimentoComplementar.totalConflitosCpf}</strong></span>
                <span>Conflitos nome <strong>{auditoria.enriquecimentoComplementar.totalConflitosNome}</strong></span>
                <span>Telefones encontrados <strong>{auditoria.enriquecimentoComplementar.totalTelefonesEncontrados}</strong></span>
                <span>Telefones ausentes <strong>{auditoria.enriquecimentoComplementar.totalTelefonesAusentes}</strong></span>
              </div>
              <div className="filters">
                <select value={auditFilter} onChange={(event) => setAuditFilter(event.target.value)}>
                  <option value="todos">Todos</option>
                  <option value="sem_telefone">Somente sem telefone</option>
                  <option value="sem_match">Somente sem match</option>
                  <option value="baixa_confianca">Somente baixa confianca</option>
                  <option value="conflito">Somente conflito</option>
                  <option value="inadimplentes_sem_contato">Inadimplentes sem contato</option>
                </select>
                <span className="muted">{auditRows.length} registros na amostra</span>
              </div>
              <DataTable
                rows={auditRows}
                columns={[
                  { key: "clienteBrisa", label: "Cliente Brisa" },
                  { key: "clienteComplementar", label: "Cliente complementar" },
                  { key: "metodo", label: "Metodo", render: (row) => <StatusBadge value={row.metodo} /> },
                  { key: "confianca", label: "Confianca", render: (row) => <StatusBadge value={row.confianca} /> },
                  { key: "fonte", label: "Fonte" },
                  { key: "telefoneEncontrado", label: "Telefone" },
                  { key: "cpfBrisa", label: "CPF Brisa" },
                  { key: "cpfComplementar", label: "CPF complementar" },
                  { key: "cidade", label: "Cidade" },
                  { key: "observacoes", label: "Observacoes" },
                  { key: "conflitos", label: "Conflitos" }
                ]}
              />
            </>
          )}

          <DataTable
            rows={Object.entries(auditoria.linhasPorFonte || {}).map(([fonte, linhas]) => ({ fonte, linhas }))}
            columns={[
              { key: "fonte", label: "Fonte" },
              { key: "linhas", label: "Linhas lidas" }
            ]}
          />
        </div>
      )}

      <div className="panel">
        <h2>Arquivos importados</h2>
        <DataTable
          rows={data.importacoes}
          columns={[
            { key: "nomeArquivo", label: "Arquivo" },
            { key: "tipo", label: "Tipo" },
            { key: "linhas", label: "Linhas" },
            { key: "colunas", label: "Colunas", render: (row) => row.colunas?.length || 0 },
            { key: "status", label: "Status", render: (row) => <StatusBadge value={row.status} /> },
            { key: "mensagem", label: "Mensagem" }
          ]}
        />
      </div>
    </section>
  );
}
