import { normalizeColumnName } from "../utils/normalize.js";

export const SHEET_TYPES = {
  VENCIMENTOS: "VENCIMENTOS",
  INADIMPLENCIA: "INADIMPLENCIA",
  QUALIDADE: "QUALIDADE",
  CLIENTES_ATIVOS: "CLIENTES_ATIVOS",
  CHURN_SAFRA: "CHURN_SAFRA",
  PAGAMENTOS_FATURAS: "PAGAMENTOS_FATURAS"
};

const signatures = [
  {
    type: SHEET_TYPES.VENCIMENTOS,
    label: "Vencimentos",
    required: ["dias vencidos", "dt vencimento"]
  },
  {
    type: SHEET_TYPES.INADIMPLENCIA,
    label: "Inadimplencia",
    required: ["qt nao pagou 1 fat"]
  },
  {
    type: SHEET_TYPES.QUALIDADE,
    label: "Qualidade por Vendedor",
    required: ["qtd contestacoes", "tkm entrada"]
  },
  {
    type: SHEET_TYPES.CLIENTES_ATIVOS,
    label: "Clientes Ativos",
    required: ["qtd ativos"]
  },
  {
    type: SHEET_TYPES.CHURN_SAFRA,
    label: "Churn Safra",
    required: ["canc safra", "churn safra"]
  },
  {
    type: SHEET_TYPES.PAGAMENTOS_FATURAS,
    label: "Pagamento da 1a e 2a Fatura",
    required: ["qt pagou 1 fat", "qt pagou 2 fat"]
  }
];

export function classifySheet(columns = []) {
  const normalized = columns.map(normalizeColumnName);
  const match = signatures.find((signature) =>
    signature.required.every((column) => normalized.includes(column))
  );

  if (!match) {
    return {
      type: "DESCONHECIDO",
      label: "Nao reconhecida",
      recognized: false,
      message: "Nao foi possivel identificar o tipo desta planilha. Verifique se o arquivo possui as colunas esperadas."
    };
  }

  return {
    type: match.type,
    label: match.label,
    recognized: true,
    message: "Planilha reconhecida com sucesso."
  };
}

export function expectedSheetStatus(imports = []) {
  const importedTypes = new Set(imports.filter((item) => item.status === "reconhecido").map((item) => item.type));
  return signatures.map((signature) => ({
    type: signature.type,
    label: signature.label,
    status: importedTypes.has(signature.type) ? "importado" : "faltando"
  }));
}
