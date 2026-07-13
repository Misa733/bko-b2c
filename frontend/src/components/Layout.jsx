import Sidebar from "./Sidebar.jsx";
import { dateBr } from "../utils/format.js";

export default function Layout({ children, page, setPage, competencias, competenciaId, setCompetenciaId, competencia }) {
  return (
    <div className="app-shell">
      <Sidebar page={page} setPage={setPage} />
      <main>
        <header className="topbar">
          <div>
            <h1>Cockpit Comercial B2C</h1>
            <p>
              {competencia
                ? `${competencia.nome} • ${dateBr(competencia.dataInicio)} a ${dateBr(competencia.dataFim)}`
                : "Selecione ou crie uma competencia"}
            </p>
          </div>
          <select value={competenciaId} onChange={(event) => setCompetenciaId(event.target.value)}>
            {competencias.map((item) => (
              <option key={item.id} value={item.id}>{item.nome}</option>
            ))}
          </select>
        </header>
        {children}
      </main>
    </div>
  );
}
