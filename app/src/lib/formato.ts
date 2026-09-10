export const mil = (n: number | null | undefined) =>
  (n ?? 0).toLocaleString("pt-BR");

export const pct = (parte: number, total: number) =>
  total ? `${Math.round((parte / total) * 100)}%` : "—";

export const porteBonito = (p: string) =>
  p === "Medio/grande" ? "Médio/grande" : p;

/** Faixa de temperatura do lead. A cor sai daqui e de mais lugar nenhum. */
export function faixaScore(score: number) {
  if (score >= 90) return { rotulo: "quente", cor: "var(--calor-4)" };
  if (score >= 75) return { rotulo: "morno", cor: "var(--calor-3)" };
  if (score >= 60) return { rotulo: "médio", cor: "var(--calor-2)" };
  return { rotulo: "frio", cor: "var(--calor-1)" };
}

/** Primeiro telefone da célula — é o canal que o DataRunner usa. */
export const telefonePrincipal = (telefone: string) =>
  telefone ? telefone.split(" / ")[0] : "";

export function iniciais(nome: string) {
  const partes = nome.trim().split(/\s+/).filter(Boolean);
  if (!partes.length) return "?";
  if (partes.length === 1) return partes[0].slice(0, 2).toUpperCase();
  return (partes[0][0] + partes[partes.length - 1][0]).toUpperCase();
}
