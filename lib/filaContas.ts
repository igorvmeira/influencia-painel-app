/**
 * FILA DE APROVAÇÃO DE CONTAS NOVAS — as regras, sem I/O.
 *
 * ⚠️⚠️ O QUE ESTA FILA **NÃO** VÊ, e é a coisa mais importante deste arquivo:
 *
 * A descoberta usa `me/adaccounts`, que é a única forma de listar contas cujo id
 * ninguém informou. **Essa lista é comprovadamente incompleta.** Em 15/08/2026,
 * 8 contas legíveis por consulta direta — gastando **R$ 45.943,25 em 120 dias** —
 * não apareciam nela, porque vinham de parceria de BM.
 *
 * Logo: **fila vazia NÃO significa "não há contas novas".** Significa "o token não
 * está listando nenhuma conta nova". Conta de BM parceira continua chegando por
 * fora, com o id vindo da agência, e para essas existe o modo sondagem do
 * /api/diagnostico-contas.
 *
 * Isto vai NA TELA, não só aqui — uma fila vazia lida como "está tudo cadastrado"
 * é pior que fila nenhuma, porque dá confiança onde não há.
 *
 * ⚠️ E NUNCA CADASTRO AUTOMÁTICO. A conta fantasma da Construminas passou nas duas
 * conferências técnicas e não era cliente de ninguém. A fila elimina a DESCOBERTA
 * manual, nunca o julgamento.
 */

/** Moeda aceita. Conta em outra moeda APARECE na fila, marcada — nunca escondida. */
export const MOEDA_ACEITA = "BRL";

/**
 * Mensagem do 403, compartilhada entre a rota e a tela.
 *
 * ⚠️ É CONSTANTE, e não texto solto nos dois lados, porque a tela DECIDE PELO TEXTO:
 * acesso negado aparece como painel neutro ("esta tela não é para você"), não como
 * card vermelho de erro — um bloqueio de permissão desenhado como falha faz a pessoa
 * reportar bug e alguém ir procurar defeito onde não há. Se os textos divergissem,
 * o 403 voltaria a se parecer com pane.
 */
export const MSG_RESTRITO =
  "Acesso restrito — a fila de contas novas é só para quem administra a carteira.";

export interface CandidataFila {
  accountId: string;
  /** O nome que a Meta dá — pista, não decisão. O nome comercial é digitado. */
  nomeNaMeta: string | null;
  moeda: string | null;
  status: number | null;
  statusRotulo: string | null;
  /** Gasto na janela — a ÚNICA prova de veiculação; `account_status` não serve. */
  gastoPeriodo: number;
  diasComGasto: number;
  ultimoDiaComGasto: string | null;
  /** Erro da sondagem, quando houve. Conta com erro entra marcada, não some. */
  erro: string | null;
  /**
   * ⚠️⚠️ ESTA CONTA JÁ ESTEVE NA CARTEIRA E FOI REMOVIDA.
   *
   * A fila não sabia distinguir **"nunca vista"** de **"removida de propósito"**, e
   * mostrava as duas do mesmo jeito: como novidade. É a terceira tela desta base a
   * afirmar mais do que sabe — depois da lista vazia ambígua e do
   * `situacaoDoAnuncio` que devolvia "pausado" no lugar de `null`.
   *
   * O custo do erro é assimétrico e silencioso: quem recadastra desfaz uma decisão
   * que alguém tomou, sem nunca saber que houve decisão. Caso real: a BAUMAN CA 02
   * (`act_2060095867813465`) saiu da carteira em 18/07/2026 e apareceu na primeira
   * fila como candidata nova, indistinguível das outras duas.
   *
   * A EVIDÊNCIA é sobra de sincronização: `limitesConta` e `metricasAgregadas` são
   * escritos pelo sync apenas para contas do de-para. Doc lá para conta que não
   * está no de-para significa que ela esteve.
   *
   * 🛑 **`false` NÃO PROVA QUE A CONTA É NOVA** — e ignorar isto seria repetir, no
   * sinal novo, o defeito que ele veio consertar. A detecção depende de a limpeza
   * ter sido INCOMPLETA. A conta fantasma `act_191616327202757` esteve na carteira,
   * foi apagada das três coleções em 12/08/2026 e por isso aparece aqui como
   * `false`: verdadeiro para o dado, falso para o fato.
   *
   * Ou seja: `true` é afirmação, `false` é silêncio. A marca ACRESCENTA informação
   * quando existe e nunca autoriza a conclusão contrária — o que só se resolve com
   * a lápide explícita descrita em `lib/descobrirContas.ts`.
   */
  jaEsteveNaCarteira: boolean;
  /**
   * Última vez que o sync tocou nesta conta.
   *
   * ⚠️ É PISO, NÃO A DATA DA REMOÇÃO — e o rótulo na tela precisa dizer isso. A
   * conta saiu da carteira em algum momento **depois** desta data; o quanto depois,
   * o dado não conta. Chamar de "removida em" seria inventar precisão.
   */
  ultimaSincronizacao: string | null;
}

export interface FilaContas {
  geradoEm: string;
  /** Janela do gasto sondado, em dias. */
  diasGasto: number;
  candidatas: CandidataFila[];
  /** Quantas contas o token listou no total — o denominador da varredura. */
  totalListadas: number;
  /** Quantas já estão no de-para. */
  jaCadastradas: number;
  /** Quantas ficaram sem sondar — silêncio aqui viraria fila incompleta. */
  cortadasPeloTeto: number;
  /** Por que ficaram de fora: teto de sondagens ou orçamento de tempo. */
  motivoCorte: "teto" | "tempo" | null;
  /** Preenchido = a descoberta falhou e a fila é a foto anterior. */
  erro: string | null;
}

export interface Ignorada {
  por: string;
  em: string;
  motivo?: string | null;
}

/**
 * As DUAS conferências de cadastro, juntas num só lugar.
 *
 * ⚠️ Acesso é a CONSULTA DIRETA, nunca a presença em `me/adaccounts` — o sync
 * consulta `/{accountId}/insights` direto e nunca olha a listagem. Aqui a conta já
 * chegou por ter sido listada, mas quem prova que dá para cadastrar é a sonda.
 */
/**
 * ⚠️ `jaEsteveNaCarteira` NÃO ENTRA AQUI de propósito. Ter sido removida não é
 * impedimento TÉCNICO — é informação que muda o julgamento humano, e o julgamento é
 * exatamente o que esta fila nunca automatiza. Bloquear o cadastro faria a fila
 * decidir no lugar de quem sabe se o cliente voltou; omitir faria ela esconder a
 * decisão anterior. O caminho é o terceiro: mostrar, com destaque, e deixar passar.
 */
export function podeCadastrar(c: CandidataFila): { ok: boolean; motivo: string | null } {
  if (c.erro) return { ok: false, motivo: `a sondagem falhou: ${c.erro}` };
  if (!c.moeda) return { ok: false, motivo: "moeda desconhecida — a sondagem não devolveu o campo" };
  if (c.moeda !== MOEDA_ACEITA) {
    return {
      ok: false,
      motivo: `moeda ${c.moeda}, não ${MOEDA_ACEITA} — o painel soma em reais e misturar moeda produz total sem significado`,
    };
  }
  return { ok: true, motivo: null };
}

/**
 * A linha do `data/contas.json` para quem quiser manter o arquivo completo.
 *
 * ⚠️ EXISTE PORQUE A FONTE FICOU DIVIDIDA. Conta cadastrada pela tela nasce no
 * Firestore com `origemCadastro: "tela"`, e o JSON deixa de ser a lista inteira.
 * A divergência é DECLARADA — o relatório do import mostra essas contas sempre —,
 * mas quem quiser o git como histórico da carteira cola esta linha lá.
 */
export function linhaJson(c: {
  accountId: string; cliente: string; gestor: string; nicho?: string; tipo?: string;
}): string {
  const campos: Record<string, unknown> = {
    accountId: c.accountId,
    cliente: c.cliente,
    gestor: c.gestor,
  };
  if (c.nicho) campos.nicho = c.nicho;
  if (c.tipo) campos.tipo = c.tipo;
  return "  " + JSON.stringify(campos) + ",";
}
