// Fonte ÚNICA e canônica dos gestores da carteira. Antes disto, a lista só existia
// derivada em runtime do campo `gestor` das contas (dropdown de /orientacoes e o
// agrupamento do dashboard) — texto livre, sujeito a gestor-fantasma por typo.
// A tela /carteira e a rota de escrita (POST /api/contas) validam contra esta lista:
// só se grava um gestor que esteja aqui. Para trocar a equipe, mexe-se só neste arquivo.

// Marcador de conta "estacionada" (sem gestor responsável ativo). É apenas o valor do
// CAMPO gestor — quem realmente tira a conta de rankings/médias/alertas é a flag booleana
// `pausado` (ContaMap.pausado), regra única lida pelas telas.
//
// ⚠️ Desde 14/09/2026 a TELA grava os dois juntos (ver `pausadoPara`). Antes, estacionar
// pela /carteira gravava só o gestor, e a conta continuava nos rankings sob um "gestor"
// chamado PAUSADO — Hotel Oscar e CAMPEZZA ficaram assim de 08/09 a 14/09/2026. Hoje a
// divergência entre os dois só nasce do `data/contas.json` (import) ou do Console, e a
// /carteira continua sinalizando quando acontece.
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

/**
 * A flag `pausado` que acompanha uma troca de gestor FEITA PELA TELA.
 *
 * Estacionar é tirar de operação, e o que tira de operação é a flag. Gravar só o gestor
 * deixava a /carteira afirmando uma coisa ("estacionar tira de rankings") e o Dashboard
 * fazendo outra. Escolher um gestor de verdade é o inverso: desestaciona, a conta volta.
 *
 * ⚠️ Vale para a TELA, não para o import. O `data/contas.json` segue a régua de
 * veiculação (`pausado` = não veicula, ver data/README.md) — por isso o import deixa de
 * tocar a flag das contas travadas pela tela: quem é dono do gestor é dono da flag.
 */
export function pausadoPara(gestor: string): boolean {
  return gestor === PAUSADO;
}

/**
 * O aviso ANTES do clique de uma troca de gestor pela tela — derivado da transição,
 * nunca escrito à mão em cada botão.
 *
 * 🛑 O motivo é de DESENHO, não de texto: as telas somam o gasto de TODOS os meses ao
 * gestor ATUAL da conta (`montarPainel` agrupa por `conta.gestor`; o `gestorHistorico`
 * só vira selo de troca na /gestores). Então qualquer troca reescreve o passado inteiro,
 * inclusive mês fechado já usado em bonificação. Medido em 14/09/2026: estacionar Hotel
 * Oscar e CAMPEZZA em 08/09 mudou o agosto do LUCAS de CPL R$ 20,74 para R$ 21,36, e
 * nenhuma tela avisou. Enquanto não existir atribuição por data, quem vai clicar lê isto.
 *
 * `null` quando não há troca (nada a avisar).
 */
export function avisoTrocaGestor(de: string, para: string): string | null {
  if (!para || de === para) return null;
  const semData = "O painel ainda não separa o gasto pela data da troca.";
  if (para === PAUSADO) {
    return `Estacionar tira esta conta de rankings, médias e alertas em todos os períodos, `
      + `inclusive meses fechados: ${de || "o gestor atual"} deixa de contar o gasto dela desde sempre. ${semData}`;
  }
  if (de === PAUSADO) {
    return `Esta conta volta a rankings, médias e alertas, e todo o gasto já medido dela — de todos `
      + `os meses, inclusive os fechados — passa a contar para ${para}. ${semData}`;
  }
  return `Todo o gasto já medido desta conta — de todos os meses, inclusive os fechados — passa `
    + `de ${de || "sem gestor"} para ${para}. ${semData}`;
}
