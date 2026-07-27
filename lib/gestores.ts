// Fonte ÚNICA e canônica dos gestores da carteira. Antes disto, a lista só existia
// derivada em runtime do campo `gestor` das contas (dropdown de /orientacoes e o
// agrupamento do dashboard) — texto livre, sujeito a gestor-fantasma por typo.
// A tela /carteira e a rota de escrita (POST /api/contas) validam contra esta lista:
// só se grava um gestor que esteja aqui. Para trocar a equipe, mexe-se só neste arquivo.

// Marcador de conta "estacionada" (sem gestor responsável ativo). ATENÇÃO: é apenas
// o valor do CAMPO gestor — quem realmente tira a conta de rankings/médias/alertas é a
// flag booleana `pausado` (ContaMap.pausado), regra única lida no Dashboard. Os dois
// podem divergir; a /carteira sinaliza visualmente quando isso acontece.
export const PAUSADO = "PAUSADO";

// Os 8 gestores reais (ordem alfabética, para o dropdown).
export const GESTORES = [
  "ANDRÉ",
  "DANIEL",
  "ISMAIL",
  "JOÃO PEDRO",
  "LUCAS",
  "MATHEUS",
  "VINÍCIUS",
  "WEDER",
] as const;

// Opções válidas do dropdown de gestor: os 8 nomes + PAUSADO.
export const OPCOES_GESTOR: readonly string[] = [...GESTORES, PAUSADO];

// Guard de escrita: rejeita qualquer valor fora da lista (barra typo e forja no corpo).
export function ehGestorValido(valor: unknown): valor is string {
  return typeof valor === "string" && OPCOES_GESTOR.includes(valor);
}
