import { useEffect, useState } from "react";
import { api } from "../services/api.js";
import LoadingState from "../components/LoadingState.jsx";
import StatusBadge from "../components/StatusBadge.jsx";

function formatDate(value) {
  return value ? new Date(value).toLocaleString("pt-BR") : "Nunca sincronizada";
}

export default function Configuracoes({ competenciaId }) {
  const [sheets, setSheets] = useState(null);
  const [message, setMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [needsRebuild, setNeedsRebuild] = useState(false);
  const [googleSheetsForm, setGoogleSheetsForm] = useState({ spreadsheetUrl: "", sheetName: "" });
  const [googleSheetsResult, setGoogleSheetsResult] = useState(null);
  const [googleSheetsLoading, setGoogleSheetsLoading] = useState(false);

  async function load() {
    setSheets(await api.getComplementarySheetsStatus());
  }

  useEffect(() => {
    load().catch(console.error);
  }, []);

  async function sync() {
    setLoading(true);
    setMessage("Sincronizando planilhas complementares...");
    try {
      const result = await api.syncComplementarySheets();
      setSheets(result.sheets);
      setNeedsRebuild(Boolean(result.success));
      setMessage(result.success
        ? "Dados complementares atualizados. Reconsolide a competencia para aplicar telefone, CPF e demais informacoes aos clientes."
        : "Sincronizacao concluida com pendencias.");
    } catch (error) {
      setMessage(error.message || "Erro ao sincronizar planilhas complementares.");
    } finally {
      setLoading(false);
    }
  }

  async function testGoogleSheets(event) {
    event.preventDefault();
    setGoogleSheetsLoading(true);
    setGoogleSheetsResult(null);

    try {
      const result = await api.testGoogleSheets(googleSheetsForm);
      setGoogleSheetsResult(result);
    } catch (error) {
      setGoogleSheetsResult({
        success: false,
        message: error.message || "Erro ao testar conexao com Google Sheets."
      });
    } finally {
      setGoogleSheetsLoading(false);
    }
  }

  async function rebuildNow() {
    if (!competenciaId) return;
    setLoading(true);
    setMessage("Reconsolidando competencia com dados complementares...");
    try {
      await api.consolidar(competenciaId);
      setNeedsRebuild(false);
      setMessage("Competencia reconsolidada com dados complementares.");
    } catch (error) {
      setMessage(error.message || "Erro ao reconsolidar competencia.");
    } finally {
      setLoading(false);
    }
  }

  if (!sheets) return <LoadingState />;

  return (
    <section className="stack">
      <div className="panel">
        <h2>Configuracoes</h2>
        <p className="muted">Ajustes tecnicos e status das fontes complementares do sistema.</p>
      </div>

      <div className="panel compact">
        <div className="panel-header">
          <div>
            <h2>Planilhas Complementares</h2>
            <p className="muted">
              Essas planilhas enriquecem os dados dos clientes com telefone, WhatsApp, CPF, cidade, endereco e observacoes.
            </p>
          </div>
          <button className="primary" onClick={sync} disabled={loading}>
            {loading ? "Sincronizando..." : "Sincronizar planilhas complementares"}
          </button>
        </div>

        <div className="status-grid complementary-status-grid">
          {sheets.map((sheet) => (
            <div className="source-card" key={sheet.id}>
              <div className="panel-header">
                <strong>{sheet.name}</strong>
                <StatusBadge value={sheet.status} />
              </div>
              <small className="muted">Linhas: {sheet.totalRows || 0}</small>
              <small className="muted">Ultima sincronizacao: {formatDate(sheet.lastSync)}</small>
              {sheet.errorMessage && <small className="error">{sheet.errorMessage}</small>}
            </div>
          ))}
        </div>
        {message && <p className={message.includes("pendencias") || message.includes("Erro") ? "error" : "success"}>{message}</p>}
        {needsRebuild && competenciaId && (
          <div className="actions">
            <button className="primary" onClick={rebuildNow} disabled={loading}>Reconsolidar agora</button>
          </div>
        )}
      </div>

      <details className="panel compact">
        <summary>Avancado: Testar Google Sheets</summary>
        <p className="muted">Diagnostico tecnico para validar uma planilha privada compartilhada com a Service Account.</p>
        <form className="stack" onSubmit={testGoogleSheets}>
          <label>
            Link da planilha
            <input
              value={googleSheetsForm.spreadsheetUrl}
              placeholder="https://docs.google.com/spreadsheets/d/..."
              onChange={(event) => setGoogleSheetsForm({ ...googleSheetsForm, spreadsheetUrl: event.target.value })}
              required
            />
          </label>
          <label>
            Nome da aba
            <input
              value={googleSheetsForm.sheetName}
              placeholder="Ex: Clientes"
              onChange={(event) => setGoogleSheetsForm({ ...googleSheetsForm, sheetName: event.target.value })}
              required
            />
          </label>
          <div className="actions">
            <button className="primary" type="submit" disabled={googleSheetsLoading}>
              {googleSheetsLoading ? "Testando..." : "Testar conexao"}
            </button>
          </div>
        </form>

        {googleSheetsResult && (
          <div className={`google-sheets-result ${googleSheetsResult.success ? "ok" : "fail"}`}>
            {googleSheetsResult.success ? (
              <>
                <strong className="success">Conexao realizada com sucesso.</strong>
                <div className="audit-grid">
                  <span>Linhas <strong>{googleSheetsResult.totalRows}</strong></span>
                  <span>Aba <strong>{googleSheetsResult.sheetName}</strong></span>
                  <span>Colunas <strong>{googleSheetsResult.headers?.length || 0}</strong></span>
                </div>
                <div>
                  <strong>Colunas encontradas</strong>
                  <div className="badges-row google-sheets-columns">
                    {(googleSheetsResult.headers || []).map((header, index) => (
                      <span className="badge gray" key={`${header}-${index}`}>
                        {header || `Coluna ${index + 1}`}
                      </span>
                    ))}
                  </div>
                </div>
                <div className="table-wrap">
                  <table>
                    <thead>
                      <tr>
                        {(googleSheetsResult.headers || []).map((header, index) => (
                          <th key={`${header}-${index}`}>{header || `Coluna ${index + 1}`}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {(googleSheetsResult.preview || []).map((row, rowIndex) => (
                        <tr key={rowIndex}>
                          {(googleSheetsResult.headers?.length ? googleSheetsResult.headers : row).map((_, columnIndex) => (
                            <td key={columnIndex}>{row[columnIndex] || ""}</td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </>
            ) : (
              <strong className="error">{googleSheetsResult.message}</strong>
            )}
          </div>
        )}
      </details>
    </section>
  );
}
