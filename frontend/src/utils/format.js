export function percent(value) {
  return `${((Number(value) || 0) * 100).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
}

export function number(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { maximumFractionDigits: 2 });
}

export function money(value) {
  return (Number(value) || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

export function dateBr(value) {
  if (!value) return "-";
  const [year, month, day] = String(value).slice(0, 10).split("-");
  if (!year || !month || !day) return value;
  return `${day}/${month}/${year}`;
}
