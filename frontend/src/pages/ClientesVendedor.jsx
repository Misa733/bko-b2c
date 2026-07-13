import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import LoadingState from "../components/LoadingState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";
import { dateBr, percent } from "../utils/format.js";

function reason(client) {
  return client.motivoInadimplencia || client.alertas?.join("; ") || "";
}

function MatchCard({ match, confirmed = false }) {
  if (!match) return null;
  return (
    <div className={confirmed ? "match-card confirmed" : "match-card"}>
      <div className="panel-header">
        <div>
          <strong>{match.nomeCompleto || "Nome nao informado"}</strong>
          <p className="muted">{match.source || "-"} - {match.matchedBy || "-"} - confianca {match.confidence || "-"}</p>
        </div>
        {!confirmed && <button className="ghost" type="button">Usar este contato</button>}
      </div>
      <div className="client-profile compact-profile">
        <span>Telefone <strong>{match.telefone || "-"}</strong></span>
        <span>WhatsApp <strong>{match.whatsapp || "-"}</strong></span>
        <span>CPF <strong>{match.cpfCompleto || "-"}</strong></span>
        <span>Score <strong>{match.score || "-"}</strong></span>
        <span>Cidade <strong>{match.cidade || "-"}</strong></span>
        <span>Bairro <strong>{match.bairro || "-"}</strong></span>
        <span>Endereco <strong>{match.endereco || "-"}</strong></span>
      </div>
      {(match.scoreCriteria || []).length > 0 && (
        <p className="muted">{match.scoreCriteria.map((criterion) => `${criterion.label} (+${criterion.points})`).join("; ")}</p>
      )}
      {match.needsReview && <p className="warning-text">{match.warning || "Conferir dados antes da cobranca"}</p>}
    </div>
  );
}

export default function ClientesVendedor({ competencia, competenciaId, selectedVendorName, goToVendedores }) {
  const [vendedor, setVendedor] = useState(null);
  const [clientsPage, setClientsPage] = useState(null);
  const [quickFilter, setQuickFilter] = useState("todos");
  const [search, setSearch] = useState({ cliente: "", cpf: "" });
  const [debouncedSearch, setDebouncedSearch] = useState({ cliente: "", cpf: "" });
  const [orderBy, setOrderBy] = useState("dias");
  const [page, setPage] = useState(1);
  const [clientDetail, setClientDetail] = useState(null);

  const query = useMemo(() => ({
    page,
    pageSize: 50,
    filter: quickFilter === "todos" ? "" : quickFilter,
    cliente: debouncedSearch.cliente,
    cpf: debouncedSearch.cpf,
    orderBy
  }), [page, quickFilter, debouncedSearch, orderBy]);

  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedSearch(search);
      setPage(1);
    }, 350);
    return () => clearTimeout(timer);
  }, [search]);

  useEffect(() => {
    if (!competenciaId || !selectedVendorName) return;
    setVendedor(null);
    api.getVendedor(competenciaId, selectedVendorName)
      .then((data) => setVendedor(data.vendedor))
      .catch(console.error);
  }, [competenciaId, selectedVendorName]);

  useEffect(() => {
    if (!competenciaId || !selectedVendorName) return;
    setClientsPage(null);
    api.getVendedorClientes(competenciaId, selectedVendorName, query)
      .then(setClientsPage)
      .catch(console.error);
  }, [competenciaId, selectedVendorName, query]);

  function openPdf() {
    window.open(api.vendedorPdfUrl(competenciaId, selectedVendorName, query), "_blank");
  }

  function openExcel() {
    window.open(api.vendedorExcelUrl(competenciaId, selectedVendorName, query), "_blank");
  }

  if (!selectedVendorName) return <div className="state">Selecione um vendedor na tela Vendedores.</div>;
  if (!vendedor || !clientsPage) return <LoadingState />;

  return (
    <section className="stack">
      <div className="panel">
        <div className="panel-header">
          <div>
            <button className="ghost" onClick={goToVendedores}>Voltar</button>
            <h2>{vendedor.nomeVendedor}</h2>
            <p className="muted">
              Clientes: {vendedor.totalClientes} - Inadimplentes: {vendedor.clientesInadimplentes} - Churn: {percent(vendedor.churnSafra)}
            </p>
          </div>
          <div className="actions">
            <button onClick={openExcel}>Exportar Excel dos filtrados</button>
            <button className="primary" onClick={openPdf}>Gerar PDF dos filtrados</button>
          </div>
        </div>
        <div className="quick-filters">
          {[
            ["todos", "Todos"],
            ["inadimplentes", "Somente inadimplentes"],
            ["critico", "Somente atraso critico"],
            ["nao-pagaram-primeira", "Somente nao pagaram primeira"],
            ["aguardando-segunda", "Somente aguardando segunda"],
            ["ativos", "Somente clientes ativos"]
          ].map(([id, label]) => (
            <button key={id} className={quickFilter === id ? "active" : ""} onClick={() => { setQuickFilter(id); setPage(1); }}>{label}</button>
          ))}
        </div>
      </div>

      <div className="panel filters">
        <input placeholder="Pesquisar cliente" value={search.cliente} onChange={(e) => setSearch({ ...search, cliente: e.target.value })} />
        <input placeholder="Pesquisar CPF" value={search.cpf} onChange={(e) => setSearch({ ...search, cpf: e.target.value })} />
        <select value={orderBy} onChange={(e) => { setOrderBy(e.target.value); setPage(1); }}>
          <option value="dias">Ordenar por dias vencidos</option>
          <option value="nome">Ordenar por nome</option>
        </select>
        <span className="muted">{clientsPage.total} clientes filtrados</span>
      </div>

      <div className="panel">
        <div className="panel-header">
          <h2>Clientes do vendedor</h2>
          <span className="muted">Pagina {clientsPage.page} de {clientsPage.totalPages}</span>
        </div>
        <DataTable
          rows={clientsPage.rows}
          rowClassName={(row) => row.inadimplenteOperacional ? "row-critical" : row.statusSegundaFatura === "Aguardando vencimento" ? "row-warning" : ""}
          columns={[
            { key: "nomeCliente", label: "Nome Cliente", render: (row) => <button className="link" onClick={() => setClientDetail(row)}>{row.nomeCliente}</button> },
            { key: "cpfCliente", label: "CPF" },
            { key: "cpfCompleto", label: "CPF compl.", render: (row) => row.cpfCompleto || "-" },
            { key: "telefone", label: "Telefone", render: (row) => row.telefone || "Nao encontrado" },
            { key: "whatsapp", label: "WhatsApp", render: (row) => row.whatsapp || "Nao encontrado" },
            { key: "cidade", label: "Cidade", render: (row) => row.cidade || "-" },
            { key: "matchedBy", label: "Match", render: (row) => <StatusBadge value={row.matchedBy || row.matchInfo?.matchedBy || "sem_match"} /> },
            { key: "confidence", label: "Confianca", render: (row) => <StatusBadge value={row.confidence || row.matchInfo?.confidence || "baixa"} /> },
            { key: "inicioContrato", label: "Data inicio", render: (row) => dateBr(row.inicioContrato) },
            { key: "statusPrimeiraFatura", label: "Status primeira fatura", render: (row) => <StatusBadge value={row.statusPrimeiraFatura} /> },
            { key: "statusSegundaFatura", label: "Status segunda fatura", render: (row) => <StatusBadge value={row.statusSegundaFatura} /> },
            { key: "diasVencidos", label: "Dias vencidos" },
            { key: "alertas", label: "Alertas", render: (row) => <div className="badges-row">{(row.alertas || []).map((alerta) => <StatusBadge key={alerta} value={alerta} />)}</div> }
          ]}
        />
        <div className="actions">
          <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button>
          <button disabled={page >= clientsPage.totalPages} onClick={() => setPage((value) => value + 1)}>Proxima</button>
        </div>
      </div>

      {clientDetail && (
        <div className="modal-backdrop" onClick={() => setClientDetail(null)}>
          <div className="modal" onClick={(event) => event.stopPropagation()}>
            <div className="panel-header">
              <h2>{clientDetail.nomeCliente}</h2>
              <button className="ghost" onClick={() => setClientDetail(null)}>Fechar</button>
            </div>
            <div className="client-profile">
              <span>CPF <strong>{clientDetail.cpfCliente || "-"}</strong></span>
              <span>CPF complementar <strong>{clientDetail.cpfCompleto || "-"}</strong></span>
              <span>Nome complementar <strong>{clientDetail.nomeCompleto || clientDetail.nomeClienteComplementar || "-"}</strong></span>
              <span>Telefone <strong>{clientDetail.telefone || "-"}</strong></span>
              <span>WhatsApp <strong>{clientDetail.whatsapp || "-"}</strong></span>
              <span>Cidade <strong>{clientDetail.cidade || "-"}</strong></span>
              <span>Estado <strong>{clientDetail.estado || "-"}</strong></span>
              <span>Bairro <strong>{clientDetail.bairro || "-"}</strong></span>
              <span>Endereco <strong>{clientDetail.endereco || "-"}</strong></span>
              <span>CEP <strong>{clientDetail.cep || "-"}</strong></span>
              <span>Email <strong>{clientDetail.email || "-"}</strong></span>
              <span>Vendedor <strong>{clientDetail.nomeVendedor || "-"}</strong></span>
              <span>Fonte complementar <strong>{clientDetail.origemComplementar || "-"}</strong></span>
              <span>Metodo <strong>{clientDetail.matchedBy || clientDetail.matchInfo?.matchedBy || "-"}</strong></span>
              <span>Confianca <strong>{clientDetail.confidence || clientDetail.matchInfo?.confidence || "-"}</strong></span>
              <span>Primeira fatura <strong>{clientDetail.statusPrimeiraFatura}</strong></span>
              <span>Segunda fatura <strong>{clientDetail.statusSegundaFatura}</strong></span>
              <span>Dias vencidos <strong>{clientDetail.diasVencidos}</strong></span>
            </div>
            <h3>Motivo</h3>
            <p>{reason(clientDetail) || "-"}</p>
            <h3>Informacoes complementares</h3>
            {clientDetail.confirmedComplementaryMatch ? (
              <MatchCard match={clientDetail.confirmedComplementaryMatch} confirmed />
            ) : (
              <>
                <p className="muted">Nenhum match confirmado. Possiveis correspondencias encontradas:</p>
                {(clientDetail.possibleComplementaryMatches || []).length ? (
                  <div className="matches-list">
                    {clientDetail.possibleComplementaryMatches.map((match, index) => (
                      <MatchCard key={`${match.source}-${match.cpfCompleto}-${index}`} match={match} />
                    ))}
                  </div>
                ) : (
                  <p className="state">Nenhum candidato encontrado nas bases internas.</p>
                )}
              </>
            )}
            <h3>JSON bruto preservado</h3>
            <pre className="json-block">{JSON.stringify({
              complementaryRawData: clientDetail.complementaryRawData || {},
              matchCandidates: clientDetail.matchCandidates || [],
              rawMatches: clientDetail.rawMatches || []
            }, null, 2)}</pre>
          </div>
        </div>
      )}
    </section>
  );
}
