import { MARCA } from "./brand";
import {
  NIVEIS_FUNIL, ETAPAS_RECUPERACAO, ETAPAS_NEGOCIACAO, ETAPAS_CONVERSA_AVANCADA,
  ETAPAS_FORA_DO_FUNIL, ehEncerrada,
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

const diasAte = (iso: string | null | undefined, ref: Date): number | null => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : Math.floor((ref.getTime() - d.getTime()) / 86400000);
};

export interface NivelAgregado {
  nivel: number;
  nome: string;
  etapas: number[];
  pessoas: number;
  oportunidades: number;
  /** Só quando o nível tem mais de uma etapa — é o detalhe do empate. */
  porEtapa: { etapaId: number; oportunidades: number }[] | null;
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
    return {
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
  const NIVEL_NEGOCIACAO = 4;
  const porEtapaAvancada = NIVEIS_FUNIL
    .filter((n) => n.nivel >= NIVEL_NEGOCIACAO)
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
  };
}
