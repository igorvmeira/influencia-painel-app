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

/**
 * O TEXTO da conta cujo gestor vem da planilha — constante compartilhada entre a rota
 * e a tela.
 *
 * ⚠️ É CONSTANTE PELO MESMO MOTIVO DO `MSG_RESTRITO`: **é o texto que decide o
 * desenho.** A `/carteira` tira o `<select>` e põe esta frase no lugar; a rota recusa
 * com ela. Se os dois lados tivessem textos próprios, no dia em que divergissem a tela
 * explicaria uma regra e o servidor aplicaria outra — e ninguém veria, porque as duas
 * continuariam plausíveis.
 *
 * ⚠️ E ela CITA A ABA de propósito: "o gestor vem da planilha" sozinho manda a pessoa
 * procurar em 8 abas. O caminho completo é o que transforma um bloqueio em instrução.
 */
export const msgGestorDaPlanilha = (aba: string) =>
  `O gestor desta conta vem da planilha de Monitoramento, aba do ${aba}. ` +
  `Para trocar, mova a linha de aba na planilha.`;

/**
 * A ÚNICA edição de gestor que sobrevive numa conta governada pela planilha.
 *
 * 🛑 Estacionar é a única decisão operacional que a planilha NÃO consegue expressar —
 * não existe aba PAUSADO, e nunca vai existir, porque a planilha é a carteira de quem
 * está rodando. Sem esta exceção, **nenhuma conta conciliada poderia ser tirada de
 * operação por ninguém**: a planilha não tem como dizer, e a tela estaria travada.
 *
 * 🔑 E o ciclo fecha sozinho, o que é o que torna a exceção segura em vez de um furo:
 * estacionou → cai no balde → a guarda do conciliador para de governar → a marca sai na
 * execução seguinte → a conta volta a ser totalmente editável pela tela. Para
 * desestacionar, o relatório da /conciliacao já diz quem é o dono na planilha.
 */
export function podeEditarGestorNaTela(
  temMarcaDaPlanilha: boolean, gestorPedido: string
): boolean {
  return !temMarcaDaPlanilha || gestorPedido === PAUSADO;
}
