import { BarChart3, FileSpreadsheet, LayoutDashboard, ListChecks, SearchCheck, Settings, ShieldCheck, Upload, Users } from "lucide-react";

const items = [
  { id: "competencias", label: "Competencias", icon: ListChecks },
  { id: "importacao", label: "Importacao", icon: Upload },
  { id: "vendedores", label: "Vendedores", icon: Users },
  { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
  { id: "clientes", label: "Clientes", icon: BarChart3 },
  { id: "auditoria-enriquecimento", label: "Auditoria", icon: SearchCheck },
  { id: "diagnostico-bases", label: "Bases Internas", icon: ShieldCheck },
  { id: "teste-cruzamento", label: "Teste Cruzamento", icon: SearchCheck },
  { id: "relatorios", label: "Relatorios", icon: FileSpreadsheet },
  { id: "configuracoes", label: "Configuracoes", icon: Settings }
];

export default function Sidebar({ page, setPage }) {
  return (
    <aside className="sidebar">
      <div className="brand">
        <span>CB</span>
        <div>
          <strong>Cockpit Comercial</strong>
          <small>B2C Brisa/Brisanet</small>
        </div>
      </div>
      <nav>
        {items.map((item) => {
          const Icon = item.icon;
          return (
            <button key={item.id} className={page === item.id ? "active" : ""} onClick={() => setPage(item.id)}>
              <Icon size={18} />
              {item.label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}
