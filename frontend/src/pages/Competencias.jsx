import { useState } from "react";
import { api } from "../services/api.js";
import DataTable from "../components/DataTable.jsx";
import { dateBr } from "../utils/format.js";

export default function Competencias({ competencias, reload, setCompetenciaId }) {
  const [form, setForm] = useState({ nome: "", dataInicio: "", dataFim: "", observacao: "" });
  const [message, setMessage] = useState("");

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    const created = await api.createCompetencia(form);
    setCompetenciaId(created.id);
    setForm({ nome: "", dataInicio: "", dataFim: "", observacao: "" });
    reload();
  }

  async function remove(id) {
    await api.deleteCompetencia(id);
    reload();
  }

  return (
    <section className="page-grid">
      <form className="panel compact" onSubmit={submit}>
        <h2>Nova competencia</h2>
        {message && <p className="error">{message}</p>}
        <label>Nome<input required value={form.nome} onChange={(e) => setForm({ ...form, nome: e.target.value })} placeholder="Julho/2026" /></label>
        <label>Data inicial<input required type="date" value={form.dataInicio} onChange={(e) => setForm({ ...form, dataInicio: e.target.value })} /></label>
        <label>Data final<input required type="date" value={form.dataFim} onChange={(e) => setForm({ ...form, dataFim: e.target.value })} /></label>
        <label>Observacao<textarea value={form.observacao} onChange={(e) => setForm({ ...form, observacao: e.target.value })} /></label>
        <button className="primary">Criar competencia</button>
      </form>

      <div className="panel">
        <h2>Competencias cadastradas</h2>
        <DataTable
          rows={competencias}
          columns={[
            { key: "nome", label: "Nome" },
            { key: "dataInicio", label: "Inicio", render: (row) => dateBr(row.dataInicio) },
            { key: "dataFim", label: "Fim", render: (row) => dateBr(row.dataFim) },
            { key: "arquivosImportados", label: "Arquivos", render: (row) => row.arquivosImportados?.length || 0 },
            { key: "acoes", label: "Acoes", render: (row) => <button className="ghost danger" onClick={() => remove(row.id)}>Excluir</button> }
          ]}
        />
      </div>
    </section>
  );
}
