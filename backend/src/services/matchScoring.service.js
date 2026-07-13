import { normalizeCpf, normalizeMatchKey, normalizePhone } from "../utils/normalize.js";

export function cpfLast3(value = "") {
  const digits = normalizeCpf(value);
  return digits.length >= 3 ? digits.slice(-3) : "";
}

export function scoreConfidence(score = 0) {
  if (score >= 90) return "alta";
  if (score >= 70) return "media";
  if (score >= 50) return "baixa";
  return "sem_match";
}

function tokenSimilarity(left = "", right = "") {
  const a = normalizeMatchKey(left).split(" ").filter((token) => token.length > 2);
  const b = normalizeMatchKey(right).split(" ").filter((token) => token.length > 2);
  if (!a.length || !b.length) return 0;
  const setB = new Set(b);
  const hits = a.filter((token) => setB.has(token)).length;
  const containment = normalizeMatchKey(left).includes(normalizeMatchKey(right)) || normalizeMatchKey(right).includes(normalizeMatchKey(left));
  return Math.min(100, Math.round((hits / Math.max(a.length, b.length)) * 100) + (containment ? 20 : 0));
}

function sameNormalized(left = "", right = "") {
  const normalizedLeft = normalizeMatchKey(left);
  const normalizedRight = normalizeMatchKey(right);
  return Boolean(normalizedLeft && normalizedRight && normalizedLeft === normalizedRight);
}

function samePhone(left = "", right = "") {
  const a = normalizePhone(left);
  const b = normalizePhone(right);
  if (!a || !b) return false;
  return a === b || (a.length >= 10 && b.length >= 10 && a.slice(-10) === b.slice(-10));
}

export function scoreComplementaryCandidate(client, candidate) {
  const criteria = [];
  let score = 0;
  const clientCpf = normalizeCpf(client.cpfCliente || client.cpfCompleto);
  const candidateCpf = normalizeCpf(candidate.cpfCompleto || candidate.cpfCliente);
  const clientPhone = normalizePhone(client.telefone || client.whatsapp);
  const candidatePhone = normalizePhone(candidate.telefone || candidate.whatsapp);

  if (clientCpf && candidateCpf && clientCpf === candidateCpf) {
    score += 100;
    criteria.push({ label: "CPF completo igual", points: 100 });
  }

  if (clientPhone && candidatePhone && samePhone(clientPhone, candidatePhone)) {
    score += 80;
    criteria.push({ label: "Telefone igual", points: 80 });
  }

  const clientName = client.nomeCliente || client.nomeClienteBrisa || "";
  const candidateName = candidate.nomeCompleto || candidate.nomeCliente || "";
  if (sameNormalized(clientName, candidateName)) {
    score += 50;
    criteria.push({ label: "Nome igual", points: 50 });
  } else if (tokenSimilarity(clientName, candidateName) >= 55) {
    score += 50;
    criteria.push({ label: "Nome muito parecido", points: 50 });
  }

  if (sameNormalized(client.nomeVendedor, candidate.nomeVendedor)) {
    score += 30;
    criteria.push({ label: "Mesmo vendedor", points: 30 });
  }

  if (sameNormalized(client.cidade, candidate.cidade)) {
    score += 20;
    criteria.push({ label: "Mesma cidade", points: 20 });
  }

  const brisaLast3 = cpfLast3(clientCpf);
  const candidateLast3 = cpfLast3(candidateCpf);
  if (clientCpf !== candidateCpf && brisaLast3 && candidateLast3 && brisaLast3 === candidateLast3) {
    score += 60;
    criteria.push({ label: "Ultimos 3 digitos do CPF iguais", points: 60 });
  }

  return {
    score,
    confidence: scoreConfidence(score),
    criteria,
    nameSimilarity: tokenSimilarity(clientName, candidateName)
  };
}
