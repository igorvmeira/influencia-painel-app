import { MARCA } from "./brand";
import {
  NIVEIS_FUNIL, ETAPAS_RECUPERACAO, ETAPAS_NEGOCIACAO, ETAPAS_CONVERSA_AVANCADA,
  ETAPAS_FORA_DO_FUNIL, ehEncerrada, TAG_SEM_PERFIL,
  OportunidadeGravada, PessoaGravada,
} from "./comercial";

/**
 * O PRÉ-AGREGADO DO COMERCIAL — um documento, uma leitura.
 *
 * ⚠️ MOTIVO, não estilo: a tela do funil precisa de 4.862 oportunidades e 2.653
 * pessoas para se montar. Varrer as duas coleções a cada carregamento custaria
 * ~7.500 leituras POR VISITA — no plano grátis derruba o app antes do almoço, no
 * Blaze vira dinheiro. Este doc é gravado no sync e lido inteiro em **1 leitura**.
 *
 * É derivado e reconstruível: as coleções granulares continuam intactas como
 * auditoria. Se uma regra mudar, roda o sync de novo e o agregado se refaz.
 *
 * ⚠️ TUDO AQUI VEM ROTULADO EM PESSOA **OU** OPORTUNIDADE. Nunca um número solto:
 * é a diferença entre 1.656 e 1.455 no mesmo funil, e entre 1.456 e 11 no mesmo
 * mês de perdas.
 */

/** Faixas de idade na etapa Fechamento. É o que separa negociação viva de venda
 *  não registrada — 3 entraram nos últimos 30 dias, 17 estão lá há mais de um ano. */
export const FAIXAS_IDADE = [
  { chave: "ate30", rotulo: "até 30 dias", min: 0, max: 30 },
  { chave: "d31a90", rotulo: "31 a 90 dias", min: 31, max: 90 },
  { chave: "d91a180", rotulo: "91 a 180 dias", min: 91, max: 180 },
  { chave: "d181a365", rotulo: "181 a 365 dias", min: 181, max: 365 },
  { chave: "mais365", rotulo: "mais de um ano", min: 366, max: Infinity },
] as const;

/** Acima disto, a razão oportunidades÷pessoas do mês denuncia clonagem da
 *  automação — ver o contraexemplo de 05/02/2026 em data/xmax-integracao.md:
 *  o que separa carga real de clone NÃO é o volume, é esta razão. */
// ===========================================================================
// PORTE — as cinco faixas de tamanho de cliente (Demanda 2)
// ===========================================================================
/**
 * Ids e nomes lidos de `getTags` em 20/08/2026.
 *
 * ⚠️⚠️ `[38] Sem Perfil` NÃO ENTRA AQUI, e não é esquecimento: ela marca
 * DESQUALIFICAÇÃO, não tamanho. Somar as duas responderia outra pergunta, e as
 * duas NÃO são exclusivas — 11 pessoas têm as duas. Ela sai contada à parte,
 * junto da interseção, em `porte.desqualificacao`.
 *
 * ⚠️ A ORDEM DESTE ARRAY É A ORDEM DA TELA. As faixas são ORDINAIS (menos de 1k <
 * ... < mais de 10k), e é a ordem que carrega o significado — a cor não, porque
 * 1k não é pior que 10k. Ver o comentário do componente.
 */
export const FAIXAS_PORTE = [
  { id: 39, nome: "menos de 1k" },
  { id: 40, nome: "1k a 3k" },
  { id: 41, nome: "3k a 5k" },
  { id: 42, nome: "5k a 10k" },
  { id: 43, nome: "Mais de 10k" },
] as const;

/**
 * O nível cuja cobertura de porte é PATAMAR — o único sobre o qual dá para afirmar
 * algo hoje. Medido em 20/08/2026: 77,3% / 78,9% / 80,0% nos três cortes de era,
 * contra rampas em todos os outros níveis.
 *
 * ⚠️⚠️ ESTÁVEL NÃO É SUFICIENTE — são 22, 19 e 10 pessoas. A taxa se sustenta, o `n`
 * não. É por isso que a tela mostra COBERTURA (uma fila de trabalho) e não
 * DISTRIBUIÇÃO: dividir 19 pessoas em cinco faixas dá ~4 por faixa.
 */
export const NIVEL_PORTE_CONFIAVEL = 4;

/**
 * Fronteira entre a era SEM etiqueta e a era COM etiqueta.
 *
 * 🛑 É ESCOLHA, NÃO FATO, e isto vai NA TELA junto do número. O CRM não guarda
 * quando uma etiqueta foi aplicada: esta data é onde a SÉRIE vira (24 meses entre
 * 0% e 9,5%, depois 31,1% / 37,9% / 70,8%), não onde o processo mudou. Sem a frase
 * na tela, daqui a três meses ela vira um fato que ninguém questiona.
 */
export const CORTE_ERA_PORTE = "2026-06-01";

const RAZAO_CLONAGEM = 5;

/** Sessão de marcação retroativa: mês com volume real em que a maioria das vendas
 *  fechou num único dia. Ver o cálculo de `vendasConfirmadasPorMes`. */
const MIN_VENDAS_LOTE = 5;
const SHARE_LOTE = 0.7;

/** Mês YYYY-MM no fuso da marca. ⚠️ Nunca `slice(0,7)` do ISO cru: em UTC, um
 *  fechamento das 22h de 31/07 em Brasília cai em agosto e muda o mês do número. */
export function mesLocal(iso: string | null | undefined): string | null {
  return parteLocal(iso, false);
}

/** Dia YYYY-MM-DD no fuso da marca — mesma armadilha do `mesLocal`, um nível abaixo:
 *  um contato das 22h de 15/08 em Brasília cai em 16/08 no UTC e muda de dia. */
export function diaLocal(iso: string | null | undefined): string | null {
  return parteLocal(iso, true);
}

function parteLocal(iso: string | null | undefined, comDia: boolean): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (isNaN(d.getTime())) return null;
  const p = new Intl.DateTimeFormat("en-CA", {
    timeZone: MARCA.fuso, year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(d);
  const ano = p.find((x) => x.type === "year")?.value;
  const mes = p.find((x) => x.type === "month")?.value;
  const dia = p.find((x) => x.type === "day")?.value;
  if (!ano || !mes) return null;
  return comDia ? (dia ? `${ano}-${mes}-${dia}` : null) : `${ano}-${mes}`;
}

/** Janela da série diária de leads novos. 30 dias cobre o "últimos 7" da Início
 *  com folga e ainda dá forma para uma sparkline, sem inchar o documento. */
export const DIAS_SERIE_LEADS = 30;

/**
 * A partir de qual NÍVEL a régua do dono cobra valor recorrente informado.
 *
 * ⚠️⚠️ A TELA NÃO IMPORTA ESTA CONSTANTE — ela lê o booleano `cobraValor` que o agregado
 * publica por nível. Assim continua havendo uma fonte só (aqui), e a tela não precisa
 * conhecer o limiar.
 *
 * 🛑 E ISSO NÃO É PREFERÊNCIA DE ESTILO: importar a constante daqui QUEBRA O BUILD. Este
 * módulo importa `./comercial`, que importa `node:crypto` (o hash do docId de pessoa), e
 * um import de VALOR num componente arrasta a cadeia inteira para o bundle do cliente —
 * `UnhandledSchemeError: Reading from "node:crypto"`. O `import type` é apagado na
 * compilação e não tem esse efeito; o de valor tem. O typecheck passa nos dois casos, só
 * o build acusa.
 *
 * 🛑 E O QUE ELA IMPEDE: nos níveis 1 a 3 a ausência de valor é o COMPORTAMENTO ESPERADO
 * pela régua do dono ("valor a partir de Negociação"). Marcar isso de âmbar transformaria
 * o normal em pendência — o Follow-up Agendamento tem **248 pessoas e ZERO com valor**, e
 * a tela mostraria 248 linhas âmbar que ninguém pode resolver. É o alarme que dispara todo
 * dia, na sua forma mais cara: 248 de uma vez, na primeira abertura.
 *
 *   abaixo deste nível ... "—" neutro, sem destaque e sem ordenação especial;
 *   deste nível acima .... sem valor PRIMEIRO e marcado, porque ali é fila de trabalho.
 */
export const NIVEL_COBRA_VALOR = 4;

const diasAte = (iso: string | null | undefined, ref: Date): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : Math.floor((ref.getTime() - d.getTime()) / 86400000);
};

/**
 * Uma pessoa parada numa etapa — a lista que a demanda 3 pede.
 *
 * ⚠️⚠️ DADO PESSOAL. Nome de pessoa real fica neste documento. O que protege:
 *   · `firestore.rules` = `allow read, write: if false` — nenhum cliente lê a coleção
 *     direto, só o Admin SDK pelo servidor. É ISTO que protege de verdade;
 *   · `/api/comercial/funil` exige ID token do Firebase (401 sem sessão);
 *   · nada aqui vai para log — o único `console.*` da rota registra a exceção, não o dado.
 *
 * 🛑 TELEFONE FICA DE FORA, e é decisão, não esquecimento. A tela responde "quem está
 * parado e há quanto tempo"; para ligar para a pessoa existe o CRM, que é onde o contato
 * deve morar. Guardar telefone aqui aumentaria o estrago de um vazamento sem melhorar a
 * resposta. Não acrescente "por conveniência".
 */
export interface PessoaNaEtapa {
  nome: string;
  /**
   * O `title` da oportunidade, CRU — e o rótulo na tela é "título no CRM", nunca
   * "empresa".
   *
   * ⚠️ NÃO EXISTE CAMPO DE EMPRESA. Medido em 17/08/2026: os 489 títulos estão
   * preenchidos e **478 contêm parte do nome da pessoa** ("ALINNE | TEK TELECOM",
   * "Fernando Lourenço Grupo Technet"). O Xmax mistura nome e empresa no mesmo campo, sem
   * separador confiável. Partir a string faria o painel afirmar o que não sabe — então vai
   * uma coluna só, com o valor como veio.
   */
  tituloCrm: string | null;
  /**
   * Dias na etapa ATUAL. `null` = o CRM não devolveu `stagebegintime`.
   *
   * ⚠️ NÃO É "há quanto tempo está no funil". É `stagebegintime`: zera quando a pessoa
   * volta atrás e avança de novo, porque o CRM não guarda o caminho. Mesma limitação que a
   * tela já declara sobre o histórico de etapas, e o rótulo é "parado nesta etapa desde".
   */
  diasParado: number | null;
  /**
   * ⚠️ `null` = valor NÃO INFORMADO. Nunca 0 — zero é um valor real, e "desconhecido" não
   * é zero. É a mesma regra do `reach` ausente no sync de tráfego.
   */
  mrrCent: number | null;
  /**
   * A faixa de porte da pessoa (`39`..`43`), ou `null` quando ela não tem nenhuma.
   *
   * ⚠️ UNIÃO das etiquetas de TODAS as oportunidades dela, não as da última: a faixa é
   * atributo do CONTATO no CRM e pousa em UMA oportunidade por pessoa (medido: 254
   * pessoas, 255 oportunidades). Olhar só a atual subestimaria a cobertura.
   *
   * ⚠️ `null` = SEM FAIXA INFORMADA, nunca "pequeno". É o que a fila de trabalho da tela
   * procura, e confundir os dois inventaria classificação que ninguém fez.
   */
  faixaPorte: number | null;
  /**
   * O MÊS EM QUE A PESSOA ENTROU NO COMERCIAL ("YYYY-MM"), para a safra da /comercial.
   *
   * ⚠️ MESMA RÉGUA DO `leadsNovos`: sai de `primeiroContato`, que é o `createdAt` mais
   * antigo entre as oportunidades da pessoa nos funis 4 **e 23**. Ou seja é "entrou no
   * COMERCIAL", não "entrou no funil de captação" — quem chegou direto como
   * desqualificado nunca esteve no funil e mesmo assim tem mês de entrada. O rótulo na
   * tela precisa dizer isso.
   * Usar a mesma régua não é detalhe: é o que faz o denominador da tela fechar. Se a
   * safra do funil e a série mensal contassem de formas diferentes, "30 das 210 que
   * entraram" seria uma divisão entre dois universos, e ninguém saberia qual está certo.
   *
   * ⚠️ POR QUE POR PESSOA e não um agregado `porMesEntrada` por nível (que custaria 3 kB
   * em vez de 9): com o campo aqui, a CONTAGEM da safra é o tamanho da própria lista que
   * a janela mostra. Um agregado paralelo seria uma segunda fonte, e no dia em que ela
   * divergisse o funil diria 6 e a janela mostraria 47. Divergir fica impossível por
   * construção — vale os 6 kB de diferença.
   *
   * ⚠️ CUSTO MEDIDO: 489 pessoas x ~19 bytes = ~9 kB, levando o documento de ~61 kB para
   * ~70 kB — 7% do limite de 1 MB, margem de 14x.
   *
   * ⚠️ `null` = sem data de entrada. Medido em 18/08/2026 contra a fonte: das 1.679
   * oportunidades ABERTAS no pipeline 4, **zero** estão sem `createdAt` válido — e como
   * toda pessoa do funil tem ao menos uma aberta ali, hoje ninguém fica sem mês. O tipo
   * continua aceitando `null` porque isso é propriedade do DADO DE HOJE, não garantia do
   * CRM: basta uma oportunidade sem data amanhã. Quem consome soma o residual e mostra a
   * linha só quando ele existe.
   */
  mesEntrada: string | null;
}

export interface NivelAgregado {
  nivel: number;
  nome: string;
  etapas: number[];
  pessoas: number;
  oportunidades: number;
  /** Só quando o nível tem mais de uma etapa — é o detalhe do empate. */
  porEtapa: { etapaId: number; oportunidades: number }[] | null;
  /**
   * A régua do dono cobra valor recorrente informado neste nível? (= `NIVEL_COBRA_VALOR`)
   *
   * ⚠️ VEM COMO DADO, não como constante importada pela tela — ver a nota em
   * NIVEL_COBRA_VALOR. A regra fica num lugar só e a tela só obedece: onde é `true`,
   * ausência de valor é PENDÊNCIA (marcada, e primeiro na lista); onde é `false`, é o
   * comportamento esperado e vira "—" neutro.
   */
  cobraValor: boolean;
  /**
   * QUEM está parado neste nível (demanda 3 do dono, 17/08/2026).
   *
   * ⚠️ ORDEM DEFINIDA AQUI, não na tela: **sem valor primeiro**, depois por MRR
   * decrescente. As sem valor são a fila de trabalho da demanda 4, e quem abre a etapa vê
   * primeiro o que precisa preencher. Ordenar por MRR jogaria as sem valor para o fim como
   * se valessem zero.
   *
   * ⚠️ TAMANHO MEDIDO antes de existir: 489 pessoas × ~102 bytes = 48,9 kB, levando o
   * documento de 12,1 kB para 60,9 kB — **6% do limite de 1 MB do Firestore**, margem de
   * 21x. A versão com telefone e ids daria 114 kB; a sem título, 19 kB.
   */
  pessoasNaEtapa: PessoaNaEtapa[];
}

/**
 * Uma medida de sucesso da recuperação, com a régua colada no número.
 *
 * ⚠️ `chave` é estável e o texto NÃO — a tela ordena e destaca pela chave, então
 * reescrever `rotulo` ou `definicao` para ficar mais claro nunca quebra nada.
 */
export interface MedidaSucesso {
  chave: "provado" | "venda" | "autoDeclarado";
  rotulo: string;
  /** A RÉGUA: o que exatamente foi contado, em uma frase. */
  definicao: string;
  pessoas: number;
  /** Sobre o total de pessoas em recuperação. */
  pct: number;
  /** true = é reivindicação de sistema, não evidência observada. */
  autoDeclarada: boolean;
}

export interface SerieMes {
  mes: string;
  pessoas: number;
  oportunidades: number;
  /** true = razão pessoa/oportunidade denuncia clonagem da automação neste mês. */
  clonagem: boolean;
  /**
   * ⚠️ MÊS QUE A BASE NÃO COBRE INTEIRO — e são DOIS, nos dois extremos da série:
   *
   *   · o mês CORRENTE, porque o sync rodou no meio dele;
   *   · o PRIMEIRO mês, porque o CRM começa em 21/05/2024 e não no dia 1.
   *
   * Sem isto a última coluna **sempre parece queda** (agosto/2026 mostrava 137 contra
   * 177 de julho, cobrindo 17 de 31 dias), e o primeiro mês parece o menor da série
   * quando é o de maior intensidade diária: 42 pessoas em 11 dias = 3,8/dia, contra
   * 2,3/dia em junho.
   *
   * ⚠️ CALCULADO AQUI, NÃO NA TELA. O cliente conseguiria deduzir o mês corrente (tem
   * `geradoEm`), mas não o primeiro — ele não sabe onde a base começa. Metade da regra
   * na tela seria a metade que marca só um dos dois extremos.
   *
   * ⚠️ E É ESTADO SEPARADO DE `clonagem`, nunca o mesmo: um diz "o dado está
   * incompleto", o outro diz "o dado está inflado pela automação". Juntar os dois faria
   * o tooltip afirmar a causa errada.
   */
  parcial: boolean;
  /** Dias do mês que a base cobre, e quantos o mês tem. Vão para o tooltip. */
  diasCobertos: number;
  diasNoMes: number;
}

/** Quantos dias do mês `mes` (YYYY-MM) a janela [de, ate] cobre. Datas YYYY-MM-DD. */
export function coberturaDoMes(mes: string, de: string, ate: string): {
  parcial: boolean; diasCobertos: number; diasNoMes: number;
} {
  const [ano, m] = mes.split("-").map(Number);
  // Meio-dia UTC evita que fuso/DST empurre a data para o mês vizinho.
  const primeiro = Date.UTC(ano, m - 1, 1, 12);
  const diasNoMes = new Date(Date.UTC(ano, m, 0, 12)).getUTCDate();
  const ultimo = Date.UTC(ano, m - 1, diasNoMes, 12);
  const dDe = Date.parse(de + "T12:00:00Z");
  const dAte = Date.parse(ate + "T12:00:00Z");

  const ini = Math.max(primeiro, dDe);
  const fim = Math.min(ultimo, dAte);
  const diasCobertos = fim < ini ? 0 : Math.round((fim - ini) / 86400000) + 1;
  return { parcial: diasCobertos < diasNoMes, diasCobertos, diasNoMes };
}

export interface AgregadoComercial {
  geradoEm: string;
  fuso: string;
  funil: {
    /** ⚠️ Rótulos explícitos: os dois números existem e respondem perguntas diferentes. */
    oportunidadesAbertas: number;
    pessoasComAberta: number;
    pessoasNoFunil: number;
    niveis: NivelAgregado[];
  };
  recuperacao: {
    pessoas: number;
    oportunidades: number;
    etapas: number[];
    /** Uma linha por etapa de recuperação — [113] e [49] contam coisas diferentes. */
    porEtapa: { etapaId: number; pessoas: number }[];
    /**
     * Quantas vezes o MESMO contato foi trabalhado, sobre o HISTÓRICO COMPLETO.
     * ⚠️ Inclui as encerradas que o backfill trouxe: contar só as abertas
     * subestima exatamente o que a métrica quer medir. Ver a correção em
     * data/xmax-integracao.md.
     */
    distribuicao: { vezes: number; pessoas: number }[];
    /**
     * ⚠️ TRÊS MEDIDAS DE SUCESSO, e a diferença entre elas É a informação —
     * mostrar só uma faria alguém decidir errado sobre manter a automação.
     * Cada uma carrega a própria RÉGUA em `definicao`, aqui e não num doc
     * separado: daqui a três meses quem recalcular precisa achar a régua junto
     * do resultado.
     */
    sucesso: MedidaSucesso[];
  };
  negociacao: { pessoas: number; etapas: number[] };
  /**
   * DINHEIRO PARADO E VALOR FALTANDO, etapa por etapa, a partir de Negociação.
   * Pedido do dono na reunião de 17/08/2026 (demandas 4 e 5 — mesma forma, uma seção).
   *
   * ⚠️⚠️ A PREMISSA DO DONO NÃO SE CONFIRMOU, e isso muda o que a feature É. A régua dele
   * era "95% das vezes vai ter valor a partir de Negociação", o que faria de valor
   * faltando uma EXCEÇÃO — coisa de alerta. Medido em 17/08/2026, **por pessoa**, que é a
   * unidade da tela: **79 de 111 = 71,2%** têm valor — 17 de 23 em Negociação, 62 de 88 em
   * Fechamento. São **32 pessoas sem valor**.
   *
   * (Contando por OPORTUNIDADE dá 69,3%, e a diferença não é erro: são unidades
   * diferentes. A tela conta pessoa, então a régua dela conta pessoa — comparar as duas
   * seria comparar denominadores distintos.)
   *
   * 32 não é exceção, é FILA DE TRABALHO. Por isso o campo se chama `semValor` e a tela
   * apresenta como pendência a preencher, não como alarme: alarme que acende em 29% dos
   * casos é o alarme diário que ninguém lê.
   *
   * ⚠️ A DIVERGÊNCIA COM A RÉGUA SUPOSTA FICA AQUI E NO README, NUNCA NA TELA. Decisão do
   * Igor em 17/08/2026: o dono precisa saber, e a interface é lida por outras pessoas —
   * citar a régua dele ali viraria correção pública. O número vai na conversa. Na tela só
   * o medido, com o denominador.
   *
   * 🛑 E O `mrrCent` É PISO, NUNCA TOTAL. Ele soma só quem TEM valor informado — as 32
   * pessoas sem valor têm MRR desconhecido, não zero. Publicar R$ 226.530 como "dinheiro
   * parado" seria afirmar que 29% da fila vale zero. `pessoas` e `comValor` vão ao lado
   * justamente para o número poder ser lido como o piso que é.
   *
   * ⚠️ CONFERIDO contra `fechamento.emFechamento`, que publica os mesmos números para a
   * etapa 20: 88 pessoas, 62 com valor, R$ 157.560 — batem exatamente. Duas seções que
   * divergissem sobre a mesma etapa seriam pior que uma seção só.
   */
  porEtapaAvancada: {
    etapaId: number;
    nome: string;
    /** Pessoas com oportunidade ABERTA nesta etapa. */
    pessoas: number;
    comValor: number;
    semValor: number;
    /** ⚠️ PISO: soma só de `comValor`. Ver a nota acima. */
    mrrCent: number;
  }[];
  conversaAvancada: { pessoas: number; etapas: number[] };
  foraDoFunil: {
    pessoas: number;
    porEtapa: { etapaId: number; pessoas: number; oportunidades: number }[];
  };
  fechamento: {
    /** O número duro: `status = 1`, com `closerecurrentvalue`. */
    confirmadas: { vendas: number; comValor: number; semValor: number; mrrCent: number };
    /** Venda por decisão do dono: aberta em [20], com `recurrentvalue`. SEM DATA. */
    emFechamento: {
      pessoas: number; comValor: number; semValor: number; mrrCent: number;
      porIdade: { chave: string; rotulo: string; pessoas: number; mrrCent: number }[];
    };
    /** ⚠️ Disponível se o Thiago pedir. NUNCA somada às confirmadas. */
    entrouEmFechamentoNoMes: { mes: string; pessoas: number; mrrCent: number }[];
  };
  leadsNovos: SerieMes[];
  /**
   * Leads novos DIA A DIA nos últimos DIAS_SERIE_LEADS dias — a série que responde
   * "e nos últimos 7 dias?" sem a tela varrer `comercial_pessoas` (2.657 docs).
   *
   * ⚠️ MESMA DEFINIÇÃO DA SÉRIE MENSAL: pessoa cujo PRIMEIRO CONTATO caiu no dia.
   * Não é oportunidade criada — com a clonagem da automação a mesma pessoa
   * apareceria várias vezes.
   *
   * ⚠️ E A JANELA TERMINA EM `ate`, NÃO NO RELÓGIO DE QUEM LÊ. A série é congelada
   * no instante do sync; se o sync falhar por dois dias, "últimos 7 dias" na tela
   * seria uma janela deslocada e ninguém perceberia. Quem consome soma para trás a
   * partir de `ate` e ROTULA o intervalo — nunca diz "hoje".
   *
   * Dias sem nenhum lead aparecem com `pessoas: 0` (a série é densa, não esparsa):
   * buraco na série viraria linha ligando dois pontos distantes na sparkline.
   */
  leadsNovosPorDia: { ate: string; dias: { dia: string; pessoas: number }[] };
  perdas: SerieMes[];
  /** ⚠️ `closedat` é a data do CLIQUE, não da venda — ver o comentário no cálculo.
   *  `mesmoDia` marca o mês em que a maioria fechou num dia só (sessão de marcação). */
  vendasConfirmadasPorMes: {
    mes: string; vendas: number; mrrCent: number; mesmoDia: boolean; maiorDia: number;
  }[];
  /**
   * QUALIFICAÇÃO POR PORTE (Demanda 2, 20/08/2026).
   *
   * ⚠️⚠️ A TELA RECEBE A DECISÃO, NÃO A RECALCULA. `nivelConfiavel`, `corte` e
   * `ehPatamar` saem prontos daqui. A régua de "qual nível é defensável" não pode
   * morar nos dois lados — e aqui é mais grave que de costume: este arquivo puxa
   * `lib/comercial.ts`, que importa `node:crypto`, então a tela NÃO PODE importá-lo.
   * Um import de valor mataria o `next build`.
   *
   * ⚠️⚠️ OPCIONAL NO TIPO, E ISSO É PROPOSITAL. O documento gravado ANTES desta
   * versão não tem o bloco, e vai continuar sem até um sync com `aplicar=1` rodar.
   * Marcar como obrigatório faria o TypeScript afirmar que ele existe — e a tela
   * renderizaria "0 de 79 (0,0%)" com a autoridade de um número medido. O tipo
   * opcional é o que OBRIGA cada consumidor a distinguir "ainda não sincronizado"
   * de "zero", que são coisas diferentes.
   */
  porte?: PorteAgregado;
}

export interface PorteAgregado {
  /** A data usada, para a tela poder ESCREVER qual foi. Ver `CORTE_ERA_PORTE`. */
  corte: string;
  /** O nível cuja cobertura é patamar — a tela obedece, não escolhe. */
  nivelConfiavel: number;
  /**
   * A COBERTURA POR NÍVEL — é ela que EXPLICA por que o denominador é Negociação.
   * Não é enfeite: sem esta linha, "19 de 79" parece um número escolhido a esmo.
   */
  porNivel: {
    nivel: number; nome: string; pessoas: number; comFaixa: number;
    /**
     * A cobertura deste nível se sustenta entre os cortes de era?
     *
     * ⚠️ `true` valida a RÉGUA (o recorte é consistente), NUNCA a conclusão — o `n`
     * é que valida a conclusão, e são coisas diferentes. Ver `NIVEL_PORTE_CONFIAVEL`.
     */
    ehPatamar: boolean;
  }[];
  /**
   * A distribuição das cinco faixas na CARTEIRA INTEIRA.
   *
   * ⚠️ MÉDIA DE DUAS ERAS, e o rótulo é condição de ela existir na tela. Nunca é o
   * número de Negociação: a cobertura ainda está subindo (31,1% / 37,9% / 70,8% nos
   * três cortes), então nada fora do nível confiável é patamar.
   */
  carteira: {
    pessoas: number;
    comAlgumaFaixa: number;
    faixas: { id: number; nome: string; pessoas: number }[];
  };
  /**
   * `[38] Sem Perfil`, SEMPRE à parte das faixas.
   *
   * ⚠️ `ambos` existe porque as duas NÃO são exclusivas: a mesma pessoa pode estar
   * marcada como sem perfil E ter faixa. Sem este campo, alguém somaria os dois e
   * concluiria que a conta não fecha.
   */
  desqualificacao: { pessoas: number; ambos: number };
}

export function montarAgregado(
  ops: OportunidadeGravada[],
  pessoas: PessoaGravada[],
  agora: Date
): AgregadoComercial {
  const doFunil4 = ops.filter((o) => o.pipelineId != null && Number(o.pipelineId) === 4);
  const abertas = doFunil4.filter((o) => !ehEncerrada(o.status));
  /** Índice das abertas por id — a pessoa guarda ids, e o valor mora na oportunidade. */
  const opPorId = new Map(abertas.map((o) => [o.id, o]));
  const idsAbertos = new Set(abertas.map((o) => o.id));
  const comAberta = pessoas.filter((p) => p.oportunidadeIds.some((id) => idsAbertos.has(id)));

  // ===========================================================================
  // PORTE — a faixa de cada pessoa (Demanda 2)
  // ===========================================================================
  /**
   * ⚠️ UNIÃO sobre TODAS as oportunidades da pessoa (`ops`, não `abertas`): a faixa é
   * atributo do CONTATO e pousa em UMA oportunidade — medido, 254 pessoas contra 255
   * oportunidades. Olhar só as abertas perderia quem foi etiquetado numa que fechou.
   *
   * ⚠️ E percorre `ops` cru, sem filtro de funil: a etiqueta é do contato, então uma
   * marcação feita no funil 23 vale para a mesma pessoa no funil 4.
   */
  const tagsPorPessoa = new Map<string, Set<number>>();
  for (const o of ops) {
    if (!o.pessoaId || !o.tags?.length) continue;
    let conj = tagsPorPessoa.get(o.pessoaId);
    if (!conj) { conj = new Set(); tagsPorPessoa.set(o.pessoaId, conj); }
    for (const t of o.tags) conj.add(Number(t));
  }
  const IDS_FAIXA = FAIXAS_PORTE.map((f) => f.id) as readonly number[];
  /** A faixa da pessoa, ou `null`. ⚠️ `null` é SEM INFORMAÇÃO, nunca "pequeno". */
  const faixaDe = (pessoaId: string): number | null => {
    const conj = tagsPorPessoa.get(pessoaId);
    if (!conj) return null;
    // A MAIOR faixa, se houver mais de uma: duas marcações são erro de cadastro, e
    // arredondar para baixo subestimaria o cliente. Raro, mas precisa ser determinístico.
    for (let i = IDS_FAIXA.length - 1; i >= 0; i--) if (conj.has(IDS_FAIXA[i])) return IDS_FAIXA[i];
    return null;
  };
  const temSemPerfil = (pessoaId: string) => tagsPorPessoa.get(pessoaId)?.has(TAG_SEM_PERFIL) === true;

  /**
   * ⚠️ A POPULAÇÃO DAS SÉRIES É QUEM TEM OPORTUNIDADE NO FUNIL 4 — 2.334 de 2.657.
   *
   * As outras 323 existem só no funil 23 (Desqualificados) e entrariam em "leads
   * novos" sem nunca terem passado pelo funil de captação. O sintoma que denunciou
   * foi a coluna de pessoas ficar MAIOR que a de oportunidades em março/2026 (152
   * contra 141) — impossível se as duas olhassem a mesma população.
   */
  const idsFunil4 = new Set(doFunil4.map((o) => o.id));
  const pessoasFunil4 = pessoas.filter((p) => p.oportunidadeIds.some((id) => idsFunil4.has(id)));

  /**
   * A JANELA QUE A BASE COBRE — de onde o CRM começa até o dia deste sync.
   *
   * ⚠️ O piso é a data mais antiga OBSERVADA, não uma constante: se um dia o backfill
   * alcançar mais para trás, a marcação de parcial se ajusta sozinha. Constante aqui
   * envelheceria em silêncio e passaria a marcar como parcial um mês que já está
   * inteiro. Medido em 17/08/2026: a base começa em 2024-05-21.
   */
  const datasObservadas = [
    ...doFunil4.map((o) => diaLocal(o.criadaEm)),
    ...pessoasFunil4.map((p) => diaLocal(p.primeiroContato)),
  ].filter((x): x is string => !!x).sort();
  const baseDe = datasObservadas[0] ?? diaLocal(agora.toISOString())!;
  const baseAte = diaLocal(agora.toISOString())!;
  const cobertura = (mes: string) => coberturaDoMes(mes, baseDe, baseAte);

  // -- níveis ---------------------------------------------------------------
  const niveis: NivelAgregado[] = NIVEIS_FUNIL.map((n) => {
    // `as const` em NIVEIS_FUNIL torna `etapas` uma tupla de literais; alargar
    // para number[] aqui evita espalhar o tipo literal por todo o agregado.
    const etapas: number[] = [...n.etapas];

    /**
     * A LISTA DE QUEM ESTÁ PARADO — ver PessoaNaEtapa para o que entra e o que não entra.
     *
     * ⚠️ A pessoa é listada no nível em que ela CONTA (`p.nivel`), não em todo nível onde
     * tenha oportunidade. Sem isso, alguém em duas etapas apareceria duas vezes e a soma
     * das listas não fecharia com `pessoasNoFunil` — que é a conferência que a tela usa.
     */
    const cobraValor = n.nivel >= NIVEL_COBRA_VALOR;
    const idsDoNivel = new Set(abertas.filter((o) => etapas.includes(Number(o.stageId))).map((o) => o.id));
    const pessoasNaEtapa: PessoaNaEtapa[] = comAberta
      .filter((p) => p.nivel === n.nivel)
      .map((p) => {
        const suas = p.oportunidadeIds
          .filter((id) => idsDoNivel.has(id))
          .map((id) => opPorId.get(id))
          .filter((o): o is OportunidadeGravada => !!o);
        const valor = suas.reduce((t, o) => t + (o.recorrenteCent ?? 0), 0);
        // O `naEtapaDesde` MAIS ANTIGO: se há duas oportunidades na etapa, o relógio que
        // importa é o de quem chegou primeiro.
        const desde = suas.map((o) => o.naEtapaDesde).filter((x): x is string => !!x).sort()[0] ?? null;
        return {
          nome: p.nomes[0] ?? p.chave,
          tituloCrm: suas.map((o) => o.titulo).find((t) => !!t) ?? null,
          diasParado: diasAte(desde, agora),
          // ⚠️ `mesLocal` e não `slice(0, 7)` do ISO: um primeiro contato às 22h de 31/07
          // em Brasília cai em 01/08 no UTC e mudaria de safra. É a mesma função que o
          // `leadsNovos` usa — o mês tem que ser o mesmo nos dois lugares.
          mesEntrada: mesLocal(p.primeiroContato),
          // ⚠️ null e não 0 quando não há valor informado — ver PessoaNaEtapa.
          mrrCent: valor > 0 ? valor : null,
          faixaPorte: faixaDe(p.id),
        };
      })
      /**
       * ⚠️ A ORDEM DEPENDE DO NÍVEL — ver NIVEL_COBRA_VALOR.
       *
       * Onde a régua cobra valor (Negociação para cima), sem valor vem PRIMEIRO: é a fila
       * de trabalho, e quem abre a etapa precisa ver o que falta preencher.
       *
       * Abaixo disso, sem valor é o esperado e não é pendência — então vão para o FIM, e
       * as poucas que têm valor sobem, que é o que ali é notável. Priorizar as 248 sem
       * valor do Follow-up seria destacar o normal.
       */
      .sort((a, b) => {
        if ((a.mrrCent === null) !== (b.mrrCent === null)) {
          const sinal = cobraValor ? -1 : 1; // sem valor primeiro só onde é pendência
          return a.mrrCent === null ? sinal : -sinal;
        }
        return (b.mrrCent ?? 0) - (a.mrrCent ?? 0);
      });

    return {
      pessoasNaEtapa,
      cobraValor,
      nivel: n.nivel,
      nome: n.nome,
      etapas,
      // ⚠️ Pessoa conta no nível MAIS ALTO que alcançou (empate resolvido em
      // `nivelMaisAvancado`), então a soma dos níveis fecha com o total do funil.
      pessoas: comAberta.filter((p) => p.nivel === n.nivel).length,
      oportunidades: abertas.filter((o) => etapas.includes(Number(o.stageId))).length,
      porEtapa: etapas.length > 1
        ? etapas.map((e) => ({
            etapaId: e,
            oportunidades: abertas.filter((o) => Number(o.stageId) === e).length,
          }))
        : null,
    };
  });

  // -- fora do funil: visível, nunca sumiço ---------------------------------
  const idsNaEtapa = (e: number) => new Set(
    abertas.filter((o) => Number(o.stageId) === e).map((o) => o.id));
  const foraPorEtapa = ETAPAS_FORA_DO_FUNIL.map((e) => {
    const ids = idsNaEtapa(e);
    return {
      etapaId: e,
      pessoas: comAberta.filter((p) =>
        p.foraDoFunil && p.oportunidadeIds.some((id) => ids.has(id))).length,
      oportunidades: ids.size,
    };
  });

  // -- fechamento: as duas bases, nunca fundidas ----------------------------
  const ganhas = doFunil4.filter((o) => Number(o.status) === 1);
  const emFechPessoas = comAberta.filter((p) => p.emFechamento);
  const porIdade = FAIXAS_IDADE.map((f) => {
    const g = emFechPessoas.filter((p) => {
      const d = diasAte(p.emFechamentoDesde, agora);
      return d !== null && d >= f.min && d <= f.max;
    });
    return {
      chave: f.chave, rotulo: f.rotulo, pessoas: g.length,
      mrrCent: g.reduce((t, p) => t + p.fechamentoAbertoCent, 0),
    };
  });

  /**
   * Demandas 4 e 5 — dinheiro parado e valor faltando, por etapa, a partir de Negociação.
   *
   * ⚠️ AS ETAPAS VÊM DE `NIVEIS_FUNIL`, não de uma lista nova: "a partir de Negociação" é
   * o nível 4 para cima, e derivar isso da constante do dono garante que reordenar o funil
   * não deixe esta seção apontando para etapa errada em silêncio.
   *
   * ⚠️ A soma das linhas FECHA (nenhuma pessoa está nas duas etapas ao mesmo tempo —
   * conferido em 17/08/2026, zero casos). Se um dia houver, a soma passa a contar duplo e
   * a tela precisa dizer; por isso o número por etapa vem separado, nunca só o total.
   */
  const porEtapaAvancada = NIVEIS_FUNIL
    // A MESMA constante que decide a ordem e a marcação da lista — ver NIVEL_COBRA_VALOR.
    .filter((n) => n.nivel >= NIVEL_COBRA_VALOR)
    .flatMap((n) => n.etapas.map((etapaId) => ({ etapaId, nome: n.nome })))
    .map(({ etapaId, nome }) => {
      const idsEtapa = new Set(abertas.filter((o) => Number(o.stageId) === etapaId).map((o) => o.id));
      const naEtapa = comAberta.filter((p) => p.oportunidadeIds.some((id) => idsEtapa.has(id)));
      let comValor = 0, semValor = 0, mrrCent = 0;
      for (const p of naEtapa) {
        // Soma só as oportunidades DESTA etapa: a pessoa pode ter outras noutro lugar,
        // e o dinheiro parado aqui é o desta etapa.
        const v = p.oportunidadeIds
          .filter((id) => idsEtapa.has(id))
          .reduce((t, id) => t + (opPorId.get(id)?.recorrenteCent ?? 0), 0);
        if (v > 0) { comValor++; mrrCent += v; } else semValor++;
      }
      return { etapaId, nome, pessoas: naEtapa.length, comValor, semValor, mrrCent };
    });

  const entrouNoMes = new Map<string, { pessoas: number; mrrCent: number }>();
  emFechPessoas.forEach((p) => {
    const m = mesLocal(p.emFechamentoDesde);
    if (!m) return;
    const x = entrouNoMes.get(m) ?? { pessoas: 0, mrrCent: 0 };
    x.pessoas++; x.mrrCent += p.fechamentoAbertoCent;
    entrouNoMes.set(m, x);
  });

  // -- séries mensais: sempre nas DUAS contagens ----------------------------
  const serie = (
    itens: { mes: string | null; pessoaId: string }[]
  ): SerieMes[] => {
    const m = new Map<string, { ops: number; pes: Set<string> }>();
    itens.forEach((x) => {
      if (!x.mes) return;
      const e = m.get(x.mes) ?? { ops: 0, pes: new Set<string>() };
      e.ops++; e.pes.add(x.pessoaId);
      m.set(x.mes, e);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, e]) => ({
      mes, oportunidades: e.ops, pessoas: e.pes.size,
      // ⚠️ Clonagem se detecta pela RAZÃO, nunca pelo volume do dia. Ver o
      // contraexemplo de 05/02/2026: 190 oportunidades de 175 pessoas é campanha
      // real; 1.445 de 2 pessoas é a automação em laço.
      clonagem: e.pes.size > 0 && e.ops / e.pes.size >= RAZAO_CLONAGEM,
      ...cobertura(mes),
    }));
  };

  const perdidas = doFunil4.filter((o) => Number(o.status) === 2);

  /**
   * ⚠️ LEAD NOVO = PESSOA cujo PRIMEIRO CONTATO foi no mês. NUNCA oportunidade
   * criada no mês — com a clonagem da automação, a mesma pessoa apareceria como
   * lead novo em julho, agosto e setembro.
   *
   * As duas colunas têm DENOMINADORES DIFERENTES de propósito: `pessoas` agrupa
   * por primeiro contato, `oportunidades` conta as criadas no mês. **A diferença
   * entre elas é o retrabalho da automação** — em maio/2025, 30 pessoas e 1.487
   * oportunidades. Por isso não dá para reaproveitar `serie()` aqui: ela conta os
   * dois a partir da mesma lista, e as duas colunas sairiam iguais.
   */
  const leadsNovos: SerieMes[] = (() => {
    const m = new Map<string, { pes: number; ops: number }>();
    const pega = (mes: string | null) => {
      if (!mes) return null;
      const x = m.get(mes) ?? { pes: 0, ops: 0 };
      m.set(mes, x);
      return x;
    };
    pessoasFunil4.forEach((p) => { const x = pega(mesLocal(p.primeiroContato)); if (x) x.pes++; });
    doFunil4.forEach((o) => { const x = pega(mesLocal(o.criadaEm)); if (x) x.ops++; });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, x]) => ({
      mes, pessoas: x.pes, oportunidades: x.ops,
      clonagem: x.pes > 0 && x.ops / x.pes >= RAZAO_CLONAGEM,
      ...cobertura(mes),
    }));
  })();

  /**
   * A MESMA definição de lead novo, dia a dia — para a Início responder "últimos 7
   * dias" lendo o mesmo documento, sem varrer `comercial_pessoas`.
   *
   * ⚠️ SÉRIE DENSA: todo dia da janela entra, inclusive com zero. Pular os dias
   * vazios faria a sparkline ligar dois pontos distantes como se fosse uma queda
   * suave, e faria a soma de 7 dias depender de quantos dias existem no array.
   */
  const leadsNovosPorDia = (() => {
    const porDia = new Map<string, number>();
    for (const p of pessoasFunil4) {
      const d = diaLocal(p.primeiroContato);
      if (d) porDia.set(d, (porDia.get(d) ?? 0) + 1);
    }
    // A janela termina no dia do sync (`agora`), no fuso da marca — nunca em UTC.
    const ate = diaLocal(agora.toISOString())!;
    const fimMs = Date.parse(ate + "T12:00:00Z"); // meio-dia evita virada por DST
    const dias: { dia: string; pessoas: number }[] = [];
    for (let i = DIAS_SERIE_LEADS - 1; i >= 0; i--) {
      const dia = new Date(fimMs - i * 86400000).toISOString().slice(0, 10);
      dias.push({ dia, pessoas: porDia.get(dia) ?? 0 });
    }
    return { ate, dias };
  })();

  /**
   * ⚠️ ATÉ AS VENDAS CONFIRMADAS VÊM EM LOTE — e isto atinge a única série que
   * eu tinha dado como estável.
   *
   * Medido em 15/08/2026: das 38 ganhas, **12 fecharam em 03/05/2025, todas no
   * mesmo dia**, e 11 em março/2026. Entre out/2025 e fev/2026, zero. Não é
   * sazonalidade de venda: é sessão de marcação retroativa — alguém abre o CRM e
   * marca de uma vez o que fechou nos meses anteriores.
   *
   * CONSEQUÊNCIA: `closedat` é a data do CLIQUE, não a data da VENDA. A série
   * mensal é a melhor que existe, mas o mês marcado com `mesmoDia` deve aparecer
   * sinalizado — senão maio/2025 vira "o melhor mês de vendas da história" sobre
   * uma tarde de arrumação.
   */
  const vendasConfirmadasPorMes = (() => {
    const m = new Map<string, { vendas: number; mrrCent: number; dias: Map<string, number> }>();
    ganhas.forEach((o) => {
      const k = mesLocal(o.fechadaEm);
      if (!k) return;
      const x = m.get(k) ?? { vendas: 0, mrrCent: 0, dias: new Map<string, number>() };
      x.vendas++;
      x.mrrCent += o.fechamentoRecorrenteCent ?? 0;
      const d = String(o.fechadaEm ?? "").slice(0, 10);
      if (d) x.dias.set(d, (x.dias.get(d) ?? 0) + 1);
      m.set(k, x);
    });
    return [...m.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([mes, x]) => {
      const maiorDia = Math.max(0, ...x.dias.values());
      return {
        mes, vendas: x.vendas, mrrCent: x.mrrCent,
        // ⚠️ Limiares calibrados contra a base, não escolhidos no olho: 2 de 4
        // vendas no mesmo dia é coincidência normal e o primeiro corte (metade,
        // mínimo 4) marcava out/2024 por isso. Com 70% e mínimo 5, sobram os dois
        // casos reais — mai/2025 com 12 de 12 num dia, e mar/2026 com 4 de 11
        // (espalhado, mês de verdade) fica de fora.
        mesmoDia: x.vendas >= MIN_VENDAS_LOTE && maiorDia >= x.vendas * SHARE_LOTE,
        maiorDia,
      };
    });
  })();

  /**
   * A RECUPERAÇÃO, com as três medidas de sucesso e a régua de cada uma.
   *
   * ⚠️ AS TRÊS VÃO PARA A TELA, decisão do Igor em 16/08/2026. A distância entre
   * "a automação diz que recuperou" (11,8%) e "dá para provar que avançou" (1,3%)
   * é justamente o que mostra o tamanho do problema — esconder uma delas faria
   * alguém decidir sobre manter a automação com meia informação.
   */
  const recuperacao = (() => {
    const emRec = comAberta.filter((p) => p.emRecuperacao);
    const total = emRec.length || 1;

    // ⚠️ HISTÓRICO COMPLETO, incluindo as encerradas do backfill. Contar só as
    // abertas subestima exatamente o que "quantas vezes foi trabalhado" mede.
    const contagem = new Map<number, number>();
    emRec.forEach((p) => {
      const v = Math.max(1, p.vezesTrabalhado);
      contagem.set(v, (contagem.get(v) ?? 0) + 1);
    });

    const idsNaEtapa = (e: number) =>
      new Set(abertas.filter((o) => Number(o.stageId) === e).map((o) => o.id));
    const idsAutoDeclarado = idsNaEtapa(49);
    const autoDeclarado = emRec.filter((p) => p.oportunidadeIds.some((i) => idsAutoDeclarado.has(i)));

    // "Provado" = tem oportunidade ABERTA numa das 6 etapas do funil de captação.
    // `nivel` só é preenchido por essas etapas — recuperação não entra nele.
    const provado = emRec.filter((p) => p.nivel !== null);
    const venda = emRec.filter((p) => p.ganhou);

    const medida = (
      chave: MedidaSucesso["chave"], rotulo: string, definicao: string,
      lista: PessoaGravada[], autoDeclarada: boolean
    ): MedidaSucesso => ({
      chave, rotulo, definicao,
      pessoas: lista.length,
      pct: Number(((lista.length / total) * 100).toFixed(2)),
      autoDeclarada,
    });

    return {
      pessoas: emRec.length,
      oportunidades: abertas.filter((o) =>
        (ETAPAS_RECUPERACAO as readonly number[]).includes(Number(o.stageId))).length,
      etapas: [...ETAPAS_RECUPERACAO],
      porEtapa: (ETAPAS_RECUPERACAO as readonly number[]).map((e) => {
        const ids = idsNaEtapa(e);
        return { etapaId: e, pessoas: emRec.filter((p) => p.oportunidadeIds.some((i) => ids.has(i))).length };
      }),
      distribuicao: [...contagem.entries()]
        .sort((a, b) => a[0] - b[0])
        .map(([vezes, pessoas]) => ({ vezes, pessoas })),
      sucesso: [
        medida("provado", "Dá para provar que avançou",
          "Pessoa em recuperação que TAMBÉM tem oportunidade aberta numa das seis etapas do funil de captação. É evidência observada — e é PISO, porque o CRM não guarda o caminho do lead: quem foi recuperado, avançou e fechou não deixa rastro nesta conta.",
          provado, false),
        medida("venda", "Chegou a virar venda",
          "Pessoa em recuperação com alguma oportunidade marcada como ganha. Responde outra pergunta que não 'a recuperação funciona' — e herda a mesma limitação: marcar 'ganhou' no CRM não virou rotina.",
          venda, false),
        medida("autoDeclarado", "A automação marcou como recuperado",
          "Pessoa numa oportunidade na etapa [49] LEAD RECUPERADO- AUTOMAÇÃO. ⚠️ É REIVINDICAÇÃO DO SISTEMA, não evidência: a automação se declara bem-sucedida sem que nada tenha avançado no funil.",
          autoDeclarado, true),
      ],
    };
  })();

  // ===========================================================================
  // PORTE — o agregado da Demanda 2
  // ===========================================================================
  /**
   * ⚠️ POPULAÇÃO = `pessoasFunil4`, a mesma das séries. Usar `pessoas` cru incluiria
   * as 323 que só existem no funil 23 e o denominador deixaria de bater com o resto
   * da tela.
   */
  const carteiraPorte = pessoasFunil4.filter((pes) => pes.temTelefone);
  const porte: PorteAgregado = {
    corte: CORTE_ERA_PORTE,
    nivelConfiavel: NIVEL_PORTE_CONFIAVEL,
    porNivel: niveis.map((n) => ({
      nivel: n.nivel,
      nome: n.nome,
      pessoas: n.pessoasNaEtapa.length,
      comFaixa: n.pessoasNaEtapa.filter((x) => x.faixaPorte !== null).length,
      // ⚠️ Vem do MEDIDO em 20/08/2026, não de um cálculo em cima do dado de hoje: a
      // estabilidade entre cortes de era só se enxerga comparando eras, e o agregado
      // não guarda a série por era. Reavaliar quando a medição for repetida.
      ehPatamar: n.nivel === NIVEL_PORTE_CONFIAVEL,
    })),
    carteira: {
      pessoas: carteiraPorte.length,
      comAlgumaFaixa: carteiraPorte.filter((pes) => faixaDe(pes.id) !== null).length,
      faixas: FAIXAS_PORTE.map((f) => ({
        id: f.id, nome: f.nome,
        pessoas: carteiraPorte.filter((pes) => faixaDe(pes.id) === f.id).length,
      })),
    },
    desqualificacao: {
      pessoas: carteiraPorte.filter((pes) => temSemPerfil(pes.id)).length,
      ambos: carteiraPorte.filter((pes) => temSemPerfil(pes.id) && faixaDe(pes.id) !== null).length,
    },
  };

  return {
    geradoEm: agora.toISOString(),
    fuso: MARCA.fuso,
    funil: {
      oportunidadesAbertas: abertas.length,
      pessoasComAberta: comAberta.length,
      pessoasNoFunil: comAberta.filter((p) => p.nivel !== null).length,
      niveis,
    },
    recuperacao,
    negociacao: {
      pessoas: comAberta.filter((p) => p.emNegociacao).length,
      etapas: [...ETAPAS_NEGOCIACAO],
    },
    porEtapaAvancada,
    // ⚠️ NÃO é "a versão antiga de negociação": responde outra pergunta ("quem já
    // sentou para conversar"). As duas aparecem na tela, com rótulos distintos.
    conversaAvancada: {
      pessoas: comAberta.filter((p) => p.emConversaAvancada).length,
      etapas: [...ETAPAS_CONVERSA_AVANCADA],
    },
    foraDoFunil: {
      pessoas: comAberta.filter((p) => p.foraDoFunil).length,
      porEtapa: foraPorEtapa,
    },
    fechamento: {
      confirmadas: {
        vendas: ganhas.length,
        comValor: ganhas.filter((o) => (o.fechamentoRecorrenteCent ?? 0) > 0).length,
        semValor: ganhas.filter((o) => !(o.fechamentoRecorrenteCent ?? 0)).length,
        mrrCent: ganhas.reduce((t, o) => t + (o.fechamentoRecorrenteCent ?? 0), 0),
      },
      emFechamento: {
        pessoas: emFechPessoas.length,
        comValor: emFechPessoas.filter((p) => p.fechamentoAbertoCent > 0).length,
        semValor: emFechPessoas.filter((p) => !p.fechamentoAbertoCent).length,
        mrrCent: emFechPessoas.reduce((t, p) => t + p.fechamentoAbertoCent, 0),
        porIdade,
      },
      entrouEmFechamentoNoMes: [...entrouNoMes.entries()]
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([mes, x]) => ({ mes, ...x })),
    },
    leadsNovos,
    leadsNovosPorDia,
    // ⚠️ maio/2025 vale 11 pessoas e 1.456 oportunidades — a razão marca clonagem.
    perdas: serie(perdidas.map((o) => ({ mes: mesLocal(o.fechadaEm), pessoaId: o.pessoaId }))),
    vendasConfirmadasPorMes,
    porte,
  };
}
