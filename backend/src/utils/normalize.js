export function removeAccents(value = "") {
  return String(value).normalize("NFD").replace(/[\u0300-\u036f]/g, "");
}

export function normalizeText(value = "") {
  return removeAccents(value).replace(/\s+/g, " ").trim();
}

export function normalizeKey(value = "") {
  return normalizeText(value).toLowerCase();
}

export function normalizeMatchKey(value = "") {
  return normalizeKey(value)
    .replace(/\*+/g, " ")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeCpf(value = "") {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizePhone(value = "") {
  return String(value ?? "").replace(/\D/g, "");
}

export function normalizeVendorName(value = "") {
  return normalizeText(value || "Sem vendedor informado");
}

export function normalizeColumnName(value = "") {
  return normalizeKey(value)
    .replace(/\b(\d+)\s*[aªº]\b/g, "$1")
    .replace(/[ªº]/g, "")
    .replace(/[^\w\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function toNumber(value, fallback = 0) {
  if (value === null || value === undefined || value === "") return fallback;
  if (typeof value === "number" && Number.isFinite(value)) return value;
  const cleaned = String(value)
    .replace(/\s/g, "")
    .replace(/%/g, "")
    .replace(/\.(?=\d{3}(,|$))/g, "")
    .replace(",", ".");
  const parsed = Number(cleaned);
  return Number.isFinite(parsed) ? parsed : fallback;
}

export function toBooleanFromPositive(value) {
  return toNumber(value, 0) > 0;
}

export function percent(value) {
  const numeric = toNumber(value, 0);
  if (numeric > 1) return numeric / 100;
  return numeric;
}

export function clientKey(row) {
  const cpf = normalizeCpf(row.cpfCliente);
  if (cpf) return `cpf:${cpf}`;
  return `nome:${normalizeKey(row.nomeCliente)}|vendedor:${normalizeKey(row.nomeVendedor)}`;
}
