export default function DataTable({ columns, rows, empty = "Nenhum registro encontrado.", rowClassName }) {
  return (
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            {columns.map((column) => <th key={column.key}>{column.label}</th>)}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr><td colSpan={columns.length} className="empty">{empty}</td></tr>
          )}
          {rows.map((row, index) => (
            <tr className={rowClassName ? rowClassName(row) : ""} key={row.id || `${row.nomeCliente || row.nomeVendedor}-${index}`}>
              {columns.map((column) => (
                <td key={column.key}>{column.render ? column.render(row) : row[column.key]}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
