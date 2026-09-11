/**
 * CONCILIAÇÃO PLANILHA × PAINEL — função PURA, sem I/O nenhum.
 *
 * ⚠️ ZERO ACESSO A REDE E A BANCO, DE PROPÓSITO. Ela recebe a planilha já lida, os
 * documentos já lidos, as lápides, as ignoradas e as sondagens já feitas — e devolve um
 * PLANO. Nada aqui grava. É o que permite exercitar a regra inteira contra os dados
 * reais de hoje sem tocar no Firestore, que é exatamente como ela foi conferida antes
 * de existir rota.
 *
 * ⚠️⚠️ A REGRA QUE GOVERNA TUDO: **o sync escreve dentro de `planilha.*` e mais nada,
 * exceto `gestor` e `gestorHistorico`.** Ver `CHAVES_QUE_O_SYNC_PODE_TOCAR`. Isso não é
 * organização: é o que torna IMPOSSÍVEL — não improvável — que a planilha mexa em
 * `pausado`, em `cliente` ou em qualquer número que veio da Meta.
 */
import { PAUSADO } from "./gestores";
import type { LinhaPlanilha } from "./planilhaGerencial";
import { formatoCanonico } from "./planilhaGerencial";
import { ehSituacaoDesconhecida } from "./situacaoPlanilha";
import type { ConceitoSituacao } from "./situacaoPlanilha";

/**
 * AS ÚNICAS CHAVES DE TOPO QUE O SYNC DA PLANILHA PODE ESCREVER.
 *
 * 🛑 `pausado` NÃO ESTÁ AQUI, E É O ITEM MAIS IMPORTANTE DESTE ARQUIVO.
 *
 * "0 - PAUSADO" na planilha e `pausado: true` no painel têm nomes parecidos e medem
 * coisas diferentes. A planilha mede a RELAÇÃO COMERCIAL; o painel mede VEICULAÇÃO
 * (`gasto > 0 no período`), regra escrita no `data/README.md`. Medido em 10/09/2026,
 * sobre as 84 linhas com id:
 *
 *   concordam "ativo" ........................ 61
 *   planilha PAUSADO, painel ATIVO ........... 11   ← veiculam e a agência pausou
 *   planilha ATIVO, painel PAUSADO ............ 2   ← não veiculam há meses
 *   concordam "pausado" ....................... 0
 *
 * **Nenhuma das 13 é erro.** Se a situação da planilha escrevesse `pausado`, a primeira
 * execução tiraria 11 contas que gastam dos totais da agência e do CPL de carteira dos
 * gestores — e devolveria 2 contas paradas para dentro das médias. Por isso a situação
 * entra como campo NOVO, ao lado, e nunca por cima.
 *
 * 🛑 `cliente` também NÃO está aqui. Há 5 pares de nome divergentes DE PROPÓSITO
 * (TAC NET/TAC TELECOM, Hotel Oscar/OLT HOTEL, Líder/LÍDER ASSESSORIA, IFALEI/IFALEI -
 * ZIEVO, JETFIBER/JETSUCESSO), registrados no `data/README.md`: a agência pediu para não
 * alinhar. Toda conciliação por nome vai querer "corrigir" — e não deve.
 */
export const CHAVES_QUE_O_SYNC_PODE_TOCAR = ["planilha", "gestor", "gestorHistorico"] as const;

/**
 * Clientes que a planilha lista e o painel NÃO cobre — só-Google Ads.
 *
 * ⚠️ ISTO É LISTA DE NOMES, E ELA EXISTE PORQUE NÃO HÁ REGRA ESTRUTURAL POSSÍVEL: são
 * exatamente as linhas SEM accountId, então não existe id para chavear. O CLAUDE.md
 * autoriza a lista mínima justamente neste caso — quando há caso REAL e nenhuma
 * propriedade que o defina. Os dois casos são reais e foram decididos em 29/07/2026,
 * com o motivo escrito no `data/README.md`.
 *
 * 🔑 E o modo de falha é o seguro: se alguém renomear a linha na planilha, o nome deixa
 * de casar e o cliente **volta a aparecer como pendência**. Ninguém some da lista por
 * acidente; no máximo alguém reaparece nela.
 *
 * ⚠️ Sem isto, LAVE MAIS EXPRESS e CHRISTIANE ROBINE apareceriam como "falta preencher o
 * accountId" em toda execução, para sempre — a cobrança repetida de algo que já foi
 * decidido, que é como um relatório vira mobília.
 */
const SO_GOOGLE_ADS: ReadonlySet<string> = new Set(["LAVE MAIS EXPRESS", "CHRISTIANE ROBINE"]);

const nomeChave = (s: string) => String(s || "").replace(/\s+/g, " ").trim().toUpperCase();

/** O documento do painel, no recorte que a conciliação precisa. */
export interface ContaNoPainel {
  accountId: string;
  cliente: string;
  gestor: string;
  pausado: boolean;
  /** O que a última execução gravou — para saber o que MUDOU sem reescrever igual. */
  planilha?: CamposDaPlanilha | null;
  /**
   * A conta já tem `gestorHistorico`? Decide se a troca precisa SEMEAR o dono anterior
   * como "desde sempre" antes de acrescentar a entrada nova.
   *
   * ⚠️ NÃO USE `gestorEditadoEm` PARA ISTO — eu usei, e estava errado. Aquele carimbo diz
   * que alguém editou pela tela `/carteira`; o histórico pode existir sem ele (o
   * `import-contas` grava histórico sem carimbar) e o carimbo pode existir com o
   * histórico já semeado. São dois fatos diferentes sobre a mesma conta, e só um
   * responde "preciso semear?".
   */
  temHistoricoGestor: boolean;
  /** A marca de governo que está gravada hoje. `null` = a tela ainda edita o gestor. */
  gestorDaPlanilha?: { aba: string; em: string } | null;
}

/**
 * ⚠️ TETO DE REMOÇÃO DE MARCA NUMA EXECUÇÃO. Acima disto, a conciliação NÃO remove —
 * reporta e espera uma pessoa, exatamente como troca de gestor.
 *
 * 🛑 O modo de falha que ele existe para barrar: se uma aba for renomeada, ela cai em
 * `abasIgnoradas` e **as contas dela somem do conjunto visto de uma vez** — a maior aba
 * hoje tem 16 linhas. Sem o teto, uma leitura parcial desmarcaria 16 contas e **abriria
 * permissão de escrita em silêncio**, por causa de um erro de leitura.
 *
 * Deriva é 1–2 linhas que alguém apagou da planilha; 16 de uma vez é quebra estrutural.
 * É a régua do alarme diário aplicada à ESCRITA: só quebra exige gente, deriva passa.
 */
export const TETO_REMOCAO_MARCA = 5;

/** Resultado da sondagem de um id que a planilha tem e o painel não. */
export interface Sonda {
  ok: boolean;
  /** `code` do Graph quando falhou. Classificar por código, nunca por mensagem. */
  codigo?: number | null;
  moeda?: string | null;
  nomeNaMeta?: string | null;
}

export interface Lapide {
  motivo?: string | null;
  em?: string | null;
  por?: string | null;
}

/**
 * O bloco que a planilha manda — e o ÚNICO lugar onde o sync escreve valor de negócio.
 *
 * ⚠️ É objeto ANINHADO em vez de campos soltos com sufixo. Campo solto (`situacaoPlanilha`,
 * `orcamentoMetaPlanilha`…) depende de todo mundo lembrar do sufixo; um aninhado torna a
 * procedência visível no Console do Firebase e torna a regra "o sync só escreve aqui"
 * conferível de relance, em vez de depender de convenção de nome.
 */
export interface CamposDaPlanilha {
  /** Texto exato da célula. É o que o gerente vê e o que resolve discussão. */
  situacaoCrua: string;
  /** `null` = rótulo desconhecido ou célula vazia — as duas viram pendência distinta. */
  situacaoConceito: ConceitoSituacao | null;
  orcamentoMeta: string;
  orcamentoGoogle: string;
  formaPagamento: string;
  notificacaoGerencial: string;
  preencheBI: string;
  /** De onde a linha veio — para o Roberto achar a célula quando discordar. */
  aba: string;
  linha: number;
  /** Data da leitura da PLANILHA, nunca a do painel. */
  lidaEm: string;
}

export type NaturezaPendencia =
  | "semAccountId"
  | "foraDeEscopo"
  | "formatoTorto"
  | "naoLegivel"
  | "temLapide"
  | "estaIgnorada"
  | "naoSondada"
  | "moedaEstrangeira"
  | "situacaoDesconhecida"
  | "estrutura";

export interface Pendencia {
  natureza: NaturezaPendencia;
  aba: string | null;
  linha: number | null;
  cliente: string | null;
  accountId: string | null;
  /** O que se sabe. */
  motivo: string;
  /** O que fazer. Pendência sem ação vira mobília. */
  acao: string;
}

export interface Atualizacao {
  accountId: string;
  cliente: string;
  /** Nomes dos campos de `planilha.*` que mudaram — nunca o objeto inteiro. */
  campos: string[];
  valores: CamposDaPlanilha;
}

export interface TrocaGestor {
  accountId: string;
  cliente: string;
  de: string;
  para: string;
  aba: string;
  linha: number;
  /** Não havia histórico: a troca vai semear o dono anterior como "desde sempre". */
  primeiroRegistro: boolean;
}

export interface SugestaoGestor {
  accountId: string;
  cliente: string;
  gestorNoPainel: string;
  donoNaPlanilha: string;
  aba: string;
  linha: number;
  motivo: string;
}

export interface Criacao {
  accountId: string;
  cliente: string;
  gestor: string;
  aba: string;
  linha: number;
  nomeNaMeta: string | null;
  moeda: string | null;
}

export interface EntradaConciliacao {
  linhas: LinhaPlanilha[];
  contas: ContaNoPainel[];
  removidas: Record<string, Lapide>;
  ignoradas: Record<string, Lapide>;
  /** Sondagem dos ids que a planilha tem e o painel não. Ausente ≠ aprovado. */
  sondas: Record<string, Sonda>;
  /**
   * Quando as sondagens foram feitas.
   *
   * ⚠️ É A TERCEIRA DATA, e ela não é decorativa: o veredito da Meta MUDA. Medido em
   * 10/09/2026 — WOLVES TATICAL e PLENA PRIME responderam `403 code 200` às 17:51 e
   * `200` às 18:32 do mesmo dia, e depois ficaram estáveis por 5 rodadas seguidas. Os
   * clientes liberaram o acesso no meio da tarde. Uma pendência de "não legível" sem a
   * hora ao lado é indistinguível de uma que já foi resolvida.
   */
  sondadasEm: string;
  lidaEmPlanilha: string;
  lidaEmPainel: string;
  /**
   * Fim da janela da execução anterior. A troca de gestor aconteceu depois disto.
   * `null` na primeira execução — e aí a janela é aberta, o que o relatório diz.
   */
  leituraAnterior: string | null;
}

export interface PlanoConciliacao {
  lidaEmPlanilha: string;
  lidaEmPainel: string;
  /** Três datas, nunca uma. Ver `sondadasEm` em EntradaConciliacao. */
  sondadasEm: string;
  /** Escritas em `planilha.*`, seguras o bastante para o cron aplicar. */
  atualizacoes: Atualizacao[];
  inalteradas: number;
  /** Exigem clique: histórico é append-only e troca errada não se desfaz. */
  trocasGestor: TrocaGestor[];
  /** Exigem clique: conta criada por engano entra em ranking e média. */
  criacoes: Criacao[];
  /** Conta estacionada no balde PAUSADO — a planilha SUGERE o dono, nunca escreve. */
  sugestoesGestor: SugestaoGestor[];
  pendencias: Pendencia[];
  /**
   * QUEM GOVERNA O GESTOR — o campo que a `/carteira` lê para saber se edita ou não.
   *
   * ⚠️⚠️ A MARCA SAI POR EVIDÊNCIA, NUNCA POR PRAZO, e a frase que decide é esta:
   * **prazo abriria permissão de escrita por causa de uma falha do cron, que é a
   * direção errada. Trancado quando incerto, nunca editável quando incerto.**
   *
   * 🔑 E a versão ingênua não funciona, o que é fácil de não ver: dá vontade de comparar
   * `planilha.lidaEm` com a última execução e expirar o que ficou para trás. Mas o
   * `aplicar=1` **só grava conta cujos campos mudaram** — conta com linha estável não
   * recebe escrita nenhuma e o `lidaEm` dela congela. Expirar por data desmarcaria
   * justamente as contas que estão mais certamente na planilha.
   *
   * O que a conciliação sabe de verdade é o CONJUNTO de ids vistos nesta leitura. Conta
   * com marca fora desse conjunto perdeu a linha — transição observada, não tempo
   * esgotado. E só dispara quando a planilha foi lida com sucesso.
   */
  marcas: {
    /**
     * Contas que JÁ EXISTEM e passam a ser governadas: escrever `gestorDaPlanilha`.
     *
     * ⚠️ Conta a CRIAR não está aqui — a marca dela vai no payload da criação, e
     * misturar as duas faria a lista prometer escritas que o `aplicar=1` não faz.
     */
    entram: { accountId: string; cliente: string; aba: string }[];
    /** Deixaram de ser governadas: remover a marca. */
    saem: { accountId: string; cliente: string; abaAnterior: string; motivo: string }[];
    /** Já marcadas e na mesma aba — nada a escrever. */
    inalteradas: number;
    /**
     * `saem` passou de `TETO_REMOCAO_MARCA` e NÃO deve ser aplicado nesta execução.
     * O cron nunca remove em massa; uma pessoa confirma na /conciliacao.
     */
    bloqueadaPorTeto: boolean;
  };
  /** As que o painel tem e a planilha não, separadas por natureza. */
  foraDeOperacao: { accountId: string; cliente: string }[];
  semLinhaNaPlanilha: { accountId: string; cliente: string; gestor: string }[];
  /** Janela em que uma troca de gestor detectada agora pode ter acontecido. */
  janelaGestor: { de: string | null; ate: string };
}

/** Monta o bloco da planilha a partir de uma linha lida. */
function camposDe(l: LinhaPlanilha, lidaEm: string): CamposDaPlanilha {
  return {
    situacaoCrua: l.situacao.cru,
    situacaoConceito: l.situacao.conceito,
    orcamentoMeta: l.orcamentoMeta,
    orcamentoGoogle: l.orcamentoGoogle,
    formaPagamento: l.formaPagamento,
    notificacaoGerencial: l.notificacaoGerencial,
    preencheBI: l.preencheBI,
    aba: l.aba,
    linha: l.linha,
    lidaEm,
  };
}

/**
 * Quais campos de `planilha.*` mudaram.
 *
 * ⚠️ `lidaEm` FICA DE FORA DA COMPARAÇÃO de propósito: ele muda em toda execução, e
 * incluí-lo faria 100% das linhas aparecerem como "atualizada" todo dia. O relatório
 * perderia o sinal — que é justamente o que mudou — e a gravação viraria 84 escritas
 * diárias sem conteúdo novo. `aba` e `linha` ENTRAM, porque mudança de aba é a troca de
 * gestor e mudança de linha é a planilha sendo reorganizada: as duas são informação.
 */
function camposQueMudam(anterior: CamposDaPlanilha | null | undefined, novo: CamposDaPlanilha): string[] {
  const chaves: (keyof CamposDaPlanilha)[] = [
    "situacaoCrua", "situacaoConceito", "orcamentoMeta", "orcamentoGoogle",
    "formaPagamento", "notificacaoGerencial", "preencheBI", "aba", "linha",
  ];
  if (!anterior) return chaves.filter((k) => String(novo[k] ?? "") !== "");
  return chaves.filter((k) => String(anterior[k] ?? "") !== String(novo[k] ?? ""));
}

export function conciliar(e: EntradaConciliacao): PlanoConciliacao {
  const porId = new Map<string, ContaNoPainel>();
  for (const c of e.contas) porId.set(String(c.accountId).trim(), c);

  const atualizacoes: Atualizacao[] = [];
  const trocasGestor: TrocaGestor[] = [];
  const criacoes: Criacao[] = [];
  const sugestoesGestor: SugestaoGestor[] = [];
  const pendencias: Pendencia[] = [];
  let inalteradas = 0;

  const idsVistosNaPlanilha = new Set<string>();
  /**
   * Contas cujo gestor o SYNC governa → aba. É o insumo de `marcas`.
   *
   * ⚠️ NÃO é "está na planilha": conta no balde `PAUSADO` entra em `idsVistosNaPlanilha`
   * e NÃO entra aqui. Em 10/09/2026 são 74 contra 72 — e as 2 de diferença são
   * exatamente as que a guarda do balde protege.
   */
  const governadas = new Map<string, string>();

  for (const l of e.linhas) {
    // ---------------------------------------------------------------------
    // 1. LINHA SEM accountId — e "sem id" tem duas causas com ações OPOSTAS
    // ---------------------------------------------------------------------
    if (!l.accountId) {
      if (SO_GOOGLE_ADS.has(nomeChave(l.cliente))) {
        pendencias.push({
          natureza: "foraDeEscopo",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: null,
          motivo: "cliente anuncia só no Google Ads — o painel cobre exclusivamente Meta Ads",
          acao: "nada a fazer. Não é conta faltando: é fora de escopo, decidido em 29/07/2026 (data/README.md)",
        });
      } else {
        pendencias.push({
          natureza: "semAccountId",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: null,
          motivo: "a coluna de ID META está vazia nesta linha",
          acao: "preencher o accountId na planilha, EM TEXTO — nunca transcrito de print",
        });
      }
      continue;
    }

    // Formato torto reconhecido e reportado. Os dígitos são usados; o aviso fica.
    if (!formatoCanonico(l.idCru)) {
      pendencias.push({
        natureza: "formatoTorto",
        aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
        motivo: `o id está escrito como "${l.idCru}" — o formato do painel é act_<números>`,
        acao: `corrigir a célula para ${l.accountId}. Sinal de digitação à mão: confira os dígitos com o cliente`,
      });
    }

    // Rótulo de situação que não está no vocabulário. Vira pendência COM O TEXTO, nunca
    // um balde "outro" — em balde, um typo mora para sempre.
    if (ehSituacaoDesconhecida(l.situacao)) {
      pendencias.push({
        natureza: "situacaoDesconhecida",
        aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
        motivo: `situação "${l.situacao.cru}" não está no vocabulário da planilha`,
        acao: "ou é rótulo novo (cadastrar em lib/situacaoPlanilha.ts) ou é texto no lugar errado",
      });
    }

    idsVistosNaPlanilha.add(l.accountId);
    const conta = porId.get(l.accountId);

    // ---------------------------------------------------------------------
    // 2. NÃO ESTÁ NO PAINEL — candidata a criação, e aqui as guardas mordem
    // ---------------------------------------------------------------------
    if (!conta) {
      // 🛑 LÁPIDE E IGNORADA SÃO PRÉ-CONDIÇÃO, NÃO REFINAMENTO. Medido em 10/09/2026:
      // das 10 linhas com id fora do painel, DUAS respondem HTTP 200 e seriam criadas
      // por um sync ingênuo — a conta fantasma `act_191616327202757`, apagada de
      // propósito em 12/08, e a NEXA TELECOM, em pesos argentinos. A primeira desfaria
      // uma decisão que ninguém lembra de ter tomado; a segunda somaria ARS ao total em
      // reais, em silêncio, porque o painel não converte moeda.
      const lapide = e.removidas[l.accountId];
      if (lapide) {
        pendencias.push({
          natureza: "temLapide",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
          motivo: `esta conta ESTEVE na carteira e foi removida${lapide.em ? ` em ${lapide.em}` : ""}` +
            `${lapide.motivo ? ` — ${lapide.motivo}` : ""}`,
          acao: "não recadastrar sem decidir de novo. Se o cliente voltou, apague a lápide antes",
        });
        continue;
      }
      const ignorada = e.ignoradas[l.accountId];
      if (ignorada) {
        pendencias.push({
          natureza: "estaIgnorada",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
          motivo: `dispensada da fila por decisão de alguém${ignorada.motivo ? ` — ${ignorada.motivo}` : ""}`,
          acao: "se a decisão mudou, desfaça o 'ignorar' na tela /fila-contas primeiro",
        });
        continue;
      }

      // ⚠️ AUSÊNCIA DE SONDAGEM NÃO É APROVAÇÃO. Sem resultado, a conta não vira
      // candidata — sai como "não sondada". É a régua do CLAUDE.md aplicada à própria
      // ferramenta: conferência que trata ausência como aprovação não confere.
      const sonda = e.sondas[l.accountId];
      if (!sonda) {
        pendencias.push({
          natureza: "naoSondada",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
          motivo: "não está no painel e não foi sondada nesta execução",
          acao: "rodar a conciliação de novo; se persistir, sondar à mão em /api/diagnostico-contas",
        });
        continue;
      }
      if (!sonda.ok) {
        // ⚠️ A FONTE NÃO SEPARA AS DUAS CAUSAS, e a mensagem cita as duas. `403 code 200`
        // responde byte a byte igual para conta real sem liberação e para id inexistente
        // — é decisão de projeto do Graph, para impedir enumeração de contas alheias.
        // Escrever só "id errado" mandaria conferir o texto colado quando a ação certa
        // pode ser pedir a parceria de Business Manager.
        pendencias.push({
          natureza: "naoLegivel",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
          motivo: `o token não lê esta conta (Graph code ${sonda.codigo ?? "?"})`,
          acao: sonda.codigo === 200
            ? "a Meta responde igual em DOIS casos e não dá para saber daqui qual é: " +
              "(a) o cliente não concedeu acesso — peça a parceria de Business Manager; " +
              "(b) o id da planilha aponta para outra conta — confira o número na BM do cliente. Faça as duas"
            : "conferir o id na planilha e sondar de novo",
        });
        continue;
      }
      if (sonda.moeda && sonda.moeda !== "BRL") {
        pendencias.push({
          natureza: "moedaEstrangeira",
          aba: l.aba, linha: l.linha, cliente: l.cliente, accountId: l.accountId,
          motivo: `conta em ${sonda.moeda} — o painel soma em reais e não converte moeda em lugar nenhum`,
          acao: "não cadastrar. Entraria somando outra escala no total, no CPL e no ranking, sem nada na tela avisar",
        });
        continue;
      }
      criacoes.push({
        accountId: l.accountId, cliente: l.cliente, gestor: l.aba,
        aba: l.aba, linha: l.linha,
        nomeNaMeta: sonda.nomeNaMeta ?? null, moeda: sonda.moeda ?? null,
      });
      // Nasce governada: veio da planilha e o gestor dela É a aba. Só vira marca de
      // verdade quando a criação for aplicada — a rota escreve as duas coisas juntas.
      governadas.set(l.accountId, l.aba);
      continue;
    }

    // ---------------------------------------------------------------------
    // 3. ESTÁ NO PAINEL — campos da planilha (seguros) e gestor (com guarda)
    // ---------------------------------------------------------------------
    const novos = camposDe(l, e.lidaEmPlanilha);
    const campos = camposQueMudam(conta.planilha, novos);
    if (campos.length) {
      atualizacoes.push({ accountId: l.accountId, cliente: conta.cliente, campos, valores: novos });
    } else {
      inalteradas++;
    }

    // 🛑 A GUARDA DO BALDE PAUSADO. `gestor: "PAUSADO"` não é uma pessoa: é o marcador de
    // conta estacionada, e a planilha nunca vai dizer "PAUSADO" porque não existe aba com
    // esse nome. Medido em 10/09/2026: das 84 linhas com id, o gestor já batia em 72 e
    // mudaria em 2 — DRA. ANA PAULA e TRAJETO, as duas estacionadas de propósito, com o
    // motivo escrito no `data/README.md` ("reativar quando voltar a veicular"). Ou seja,
    // as duas únicas trocas que a regra produzia eram as duas que desfariam decisões.
    // A planilha diz quem é o DONO; o painel diz o BALDE OPERACIONAL. Nomes parecidos,
    // sistemas diferentes, perguntas diferentes.
    if (conta.gestor === PAUSADO) {
      if (l.aba !== PAUSADO) {
        sugestoesGestor.push({
          accountId: l.accountId, cliente: conta.cliente,
          gestorNoPainel: conta.gestor, donoNaPlanilha: l.aba,
          aba: l.aba, linha: l.linha,
          motivo: "conta estacionada no painel; a planilha diz quem é o dono, mas reativar é decisão de carteira",
        });
      }
      continue;
    }

    // Fora do balde e com linha na planilha → o sync governa o gestor desta conta, e a
    // `/carteira` para de editá-lo (menos para PAUSADO). Vale mesmo quando o gestor já
    // bate: governar não é "vai mudar agora", é "de quem é este campo".
    governadas.set(l.accountId, l.aba);

    if (conta.gestor !== l.aba) {
      trocasGestor.push({
        accountId: l.accountId, cliente: conta.cliente,
        de: conta.gestor || "(vazio)", para: l.aba,
        aba: l.aba, linha: l.linha,
        primeiroRegistro: !conta.temHistoricoGestor,
      });
    }
  }

  // -----------------------------------------------------------------------
  // 4. NO PAINEL E NÃO NA PLANILHA — duas populações, dois tratamentos
  // -----------------------------------------------------------------------
  // ⚠️ SEPARADAS PORQUE JUNTAS VIRAM RUÍDO. Medido em 10/09/2026: são 47 contas, e 39
  // delas estão no balde PAUSADO — vão estar lá amanhã e no ano que vem. Um relatório
  // que abre com 47 pendências treina quem lê a ignorá-lo, e aí a 48ª, que é real, não é
  // vista. É a régua do alarme que dispara todo dia: separe o que DERIVA do que QUEBRA.
  const foraDeOperacao: { accountId: string; cliente: string }[] = [];
  const semLinhaNaPlanilha: { accountId: string; cliente: string; gestor: string }[] = [];
  for (const c of e.contas) {
    if (idsVistosNaPlanilha.has(String(c.accountId).trim())) continue;
    if (c.gestor === PAUSADO) foraDeOperacao.push({ accountId: c.accountId, cliente: c.cliente });
    else semLinhaNaPlanilha.push({ accountId: c.accountId, cliente: c.cliente, gestor: c.gestor });
  }

  // -----------------------------------------------------------------------
  // 5. AS MARCAS DE GOVERNO — quem a /carteira deixa de editar
  // -----------------------------------------------------------------------
  const entram: PlanoConciliacao["marcas"]["entram"] = [];
  const saem: PlanoConciliacao["marcas"]["saem"] = [];
  let marcasInalteradas = 0;

  for (const c of e.contas) {
    const id = String(c.accountId).trim();
    const aba = governadas.get(id);
    const marca = c.gestorDaPlanilha ?? null;

    if (aba && !marca) {
      entram.push({ accountId: id, cliente: c.cliente, aba });
    } else if (aba && marca && marca.aba !== aba) {
      // Mudou de aba: a marca precisa apontar para a aba certa, senão a tela mandaria
      // a pessoa mexer na linha errada — e o texto dela cita o nome da aba.
      entram.push({ accountId: id, cliente: c.cliente, aba });
    } else if (aba && marca) {
      marcasInalteradas++;
    } else if (!aba && marca) {
      // Perdeu o governo. As duas causas são diferentes e a mensagem diz qual.
      saem.push({
        accountId: id, cliente: c.cliente, abaAnterior: marca.aba,
        motivo: idsVistosNaPlanilha.has(id)
          ? "entrou no balde PAUSADO — a planilha não escreve gestor de conta estacionada"
          : "a linha saiu da planilha",
      });
    }
  }

  // 🛑 CONTA A CRIAR **NÃO** ENTRA EM `entram`, e a primeira versão disto colocava.
  //
  // O sintoma foi a conferência não fechar: `entram` deu 75 onde o esperado era 72. Não
  // era a guarda do balde falhando — eram **duas populações na mesma lista**, escritas
  // por flags diferentes. As 72 existentes o `aplicar=1` grava; as 3 a criar só existem
  // com `aplicarCriacao=1`, e a marca delas já vai dentro do payload da criação.
  //
  // 🔑 Misturadas, a lista prometia 75 escritas e o cron só conseguia fazer 72 — e a
  // diferença não apareceria como erro, apareceria como um número que ninguém consegue
  // reconciliar. É a mesma família do balde silencioso: o resto de um recorte precisa
  // ser contado à parte, não empurrado para o lado que parece caber.
  //
  // Elas estão em `criacoes`, com `aba`, que é tudo o que a rota precisa.

  return {
    lidaEmPlanilha: e.lidaEmPlanilha,
    lidaEmPainel: e.lidaEmPainel,
    sondadasEm: e.sondadasEm,
    marcas: {
      entram,
      saem,
      inalteradas: marcasInalteradas,
      bloqueadaPorTeto: saem.length > TETO_REMOCAO_MARCA,
    },
    atualizacoes,
    inalteradas,
    trocasGestor,
    criacoes,
    sugestoesGestor,
    pendencias,
    foraDeOperacao,
    semLinhaNaPlanilha,
    janelaGestor: { de: e.leituraAnterior, ate: e.lidaEmPlanilha },
  };
}
