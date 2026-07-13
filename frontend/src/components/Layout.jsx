import { useState } from "react";
import { Menu } from "lucide-react";
import Sidebar from "./Sidebar.jsx";
import { dateBr } from "../utils/format.js";

export default function Layout({ children, page, setPage, competencias, competenciaId, setCompetenciaId, competencia }) {
  const [menuOpen, setMenuOpen] = useState(false);

  function changePage(nextPage) {
    setPage(nextPage);
    setMenuOpen(false);
  }

  return (
    <div className={menuOpen ? "app-shell menu-open" : "app-shell"}>
      <button className="sidebar-backdrop" aria-label="Fechar menu" onClick={() => setMenuOpen(false)} />
      <Sidebar page={page} setPage={changePage} onClose={() => setMenuOpen(false)} />
      <main>
        <header className="topbar">
          <div className="topbar-title">
            <button className="menu-trigger" onClick={() => setMenuOpen(true)} aria-label="Abrir menu">
              <Menu size={20} />
              Menu
            </button>
            <div>
              <h1>Cockpit Comercial B2C</h1>
              <p>
                {competencia
                  ? `${competencia.nome} - ${dateBr(competencia.dataInicio)} a ${dateBr(competencia.dataFim)}`
                  : "Selecione ou crie uma competencia"}
              </p>
            </div>
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
