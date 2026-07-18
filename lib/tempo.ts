// Tempo relativo em pt-BR ("há 2 dias", "há 3h", "agora há pouco"). Duração pura
// (não depende de fuso). Vazio se a data for inválida.
export function haQuanto(iso: string | null): string {
  if (!iso) return "";
  const ts = Date.parse(iso);
  if (Number.isNaN(ts)) return "";
  const min = Math.floor((Date.now() - ts) / 60000);
  if (min < 1) return "agora há pouco";
  if (min < 60) return `há ${min} min`;
  const h = Math.floor(min / 60);
  if (h < 24) return `há ${h}h`;
  const d = Math.floor(h / 24);
  return `há ${d} ${d === 1 ? "dia" : "dias"}`;
}
