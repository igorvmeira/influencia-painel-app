import { createHash } from "node:crypto";
import { epochParaISO, criadaEm, OportunidadeXmax } from "./xmax";

/**
 * REGRAS DO FUNIL COMERCIAL — puras, sem I/O.
 *
 * Único lugar onde estas decisões moram. O sync, o pré-agregado e a tela leem
 * daqui; cópia que diverge é o defeito clássico deste estúdio.
 *
 * As decisões abaixo saíram do diagnóstico de 15/08/2026 contra a base real e do
 * que a agência respondeu — ver data/xmax-integracao.md para o porquê de cada uma.
 */

/** Funil de captação (id 4, "Provedor de internet"). NÃO é o funil 1, que se chama
 *  "COMERCIAL" e tem 52 abertas. Ver PIPELINE_COMERCIAL em lib/xmax.ts. */
export const FUNIL_CAPTACAO = 4;
/** Onde a desqualificação era registrada ANTES da etiqueta [38]. */
export const FUNIL_DESQUALIFICADOS = 23;
/** Etiqueta que registra a desqualificação HOJE. */
export const TAG_SEM_PERFIL = 38;

// ===========================================================================
// ⚠️⚠️ O FUNIL É DEFINIDO PELO DONO, NÃO PELO `stageorders` DO XMAX ⚠️⚠️
// ===========================================================================
/**
 * Definido pelo Thiago em 15/08/2026. Até aqui a ordem vinha do `stageorders`
 * do próprio funil; a partir daqui a **ordem de negócio é esta constante**, e o
 * `stageorders` continua sendo lido só para DENUNCIAR divergência (ver
 * `conflitoDeOrdem` abaixo e o bloco `ordemDasEtapas` no retorno do sync).
 *
 * ⚠️ O NÍVEL 1 TEM DUAS ETAPAS, E ISSO É O PONTO. "Novo Lead - TRÁFEGO" e
 * "LEADS OUTBOUND" são a MESMA coisa por caminhos diferentes: lead novo que veio
 * de anúncio e lead novo que veio de lista ativa. Pela ordem do Xmax, [15] é a
 * posição 1 e [114] a posição 3 — o que faria OUTBOUND parecer "mais avançado"
 * que TRÁFEGO. Não é mais avançado, é outra porta de entrada.
 *
 * Por isso a comparação passa a ser por NÍVEL, nunca por posição no array. A
 * conferência que pega o erro é a soma dos níveis fechar em 472: se o empate
 * quebrar, a soma continua certa e os níveis 1 e 2 trocam gente entre si.
 */
export const NIVEIS_FUNIL = [
  { nivel: 1, nome: "Lead novo", etapas: [15, 114] },
  { nivel: 2, nome: "Follow-up Agendamento", etapas: [21] },
  { nivel: 3, nome: "Agendado Reunião", etapas: [17] },
  { nivel: 4, nome: "Negociação", etapas: [27] },
  { nivel: 5, nome: "Fechamento", etapas: [20] },
] as const;

/** As 6 etapas do funil de captação, na ordem de negócio. */
export const ETAPAS_DO_FUNIL: readonly number[] = NIVEIS_FUNIL.flatMap((n) => n.etapas);

const NIVEL_POR_ETAPA = new Map<number, number>(
  NIVEIS_FUNIL.flatMap((n) => n.etapas.map((e) => [e, n.nivel] as [number, number]))
);

/** Nível de negócio da etapa. null = não faz parte do funil de captação. */
export const nivelDaEtapa = (stageId: unknown): number | null =>
  NIVEL_POR_ETAPA.get(Number(stageId)) ?? null;

/**
 * ⚠️ Pessoa em várias etapas conta UMA vez, no nível mais alto que alcançou —
 * e duas etapas do mesmo nível EMPATAM, em vez de uma vencer a outra.
 */
export function nivelMaisAvancado(etapas: Iterable<unknown>): number | null {
  let melhor: number | null = null;
  for (const e of etapas) {
    const n = nivelDaEtapa(e);
    if (n !== null && (melhor === null || n > melhor)) melhor = n;
  }
  return melhor;
}

/** Etapa 20 (Fechamento) — o nível 5, isolado porque a Etapa E depende dele. */
export const ETAPA_FECHAMENTO = 20;

/**
 * ⚠️ AS DUAS ETAPAS QUE SAEM DO FUNIL PRINCIPAL.
 *
 * Não são "etapas menos importantes": são 61% do volume e 90% da duplicação. A
 * automação de recuperação cria uma oportunidade NOVA a cada disparo, então a
 * etapa "LEAD RECUPERADO- AUTOMAÇÃO" está 91% duplicada e há contato com 11
 * oportunidades. Mantê-las no funil principal faria 830 linhas parecerem
 * negociação em andamento quando são reprocessamento dos mesmos contatos.
 *
 * Decisão do Igor em 15/08/2026 (Variante B): saem do funil de captação e ganham
 * visão própria — que NÃO pode ser aba escondida.
 *
 * ⚠️ O [49] FICA AQUI, decidido pelo Igor em 15/08/2026. O Thiago o descreveu
 * como estado transitório ("o lead recuperado volta para lead novo"), o que
 * tentaria tirá-lo das duas visões — e 35 pessoas estão SÓ nele. Sumiriam.
 * Recuperação = 838 pessoas com ele, 803 sem.
 */
export const ETAPAS_RECUPERACAO = [113, 49] as const;

/**
 * ⚠️ NEGOCIAÇÃO É SÓ [27] E [20] — mudou em 15/08/2026, era [17,27,61,20] = 225.
 *
 * O Thiago listou "Agendado Reunião" como etapa PRÓPRIA, separada de
 * "Negociação": reunião marcada não é negociação, é reunião marcada. E o [61]
 * "Nutrição Negociação" saiu do funil por decisão dele. Sobram 110 pessoas.
 */
export const ETAPAS_NEGOCIACAO = [27, 20] as const;

/**
 * O conjunto ANTIGO, mantido com o nome certo: 150 pessoas. Não é "a versão
 * antiga de negociação" — responde outra pergunta ("quem já sentou para
 * conversar"), e as duas aparecem na tela com rótulos distintos.
 */
export const ETAPAS_CONVERSA_AVANCADA = [17, 27, 20] as const;

/**
 * ⚠️ SAEM DO FUNIL, MAS NÃO DA TELA. 156 pessoas estão nestas etapas, e some-las
 * seria cometer contra o Thiago exatamente a queixa que ele trouxe sobre o BI
 * ("dá a perda e some do funil"). Viram linha visível, detalhe a um clique.
 *
 * [138] e [134] são M&A — OUTRO PRODUTO, que merece funil próprio no futuro.
 */
export const ETAPAS_FORA_DO_FUNIL = [118, 138, 134, 61] as const;

export const ehRecuperacao = (stageId: unknown): boolean =>
  (ETAPAS_RECUPERACAO as readonly number[]).includes(Number(stageId));
export const ehNegociacao = (stageId: unknown): boolean =>
  (ETAPAS_NEGOCIACAO as readonly number[]).includes(Number(stageId));
export const ehConversaAvancada = (stageId: unknown): boolean =>
  (ETAPAS_CONVERSA_AVANCADA as readonly number[]).includes(Number(stageId));
export const ehForaDoFunil = (stageId: unknown): boolean =>
  (ETAPAS_FORA_DO_FUNIL as readonly number[]).includes(Number(stageId));

/**
 * O `stageorders` do Xmax continua sendo lido — não para mandar, para DENUNCIAR.
 * Devolve as etapas do funil de negócio cuja ordem relativa no Xmax diverge da
 * ordem do dono, e as que sumiram do `stageorders`.
 *
 * Medido em 15/08/2026: `[15,118,114,138,134,21,113,49,17,27,61,20]` — removidas
 * as excluídas, a ordem relativa das 6 é IDÊNTICA. Hoje não há conflito, só
 * recorte. Se a agência reordenar, aparece aqui em vez de mudar a foto em
 * silêncio.
 */
export function conflitoDeOrdem(ordemXmax: number[]): {
  divergem: boolean;
  ordemDoDono: number[];
  ordemNoXmax: number[];
  ausentesNoXmax: number[];
} {
  const noXmax = ordemXmax.map(Number).filter((e) => ETAPAS_DO_FUNIL.includes(e));
  const doDono = [...ETAPAS_DO_FUNIL];
  const ausentes = doDono.filter((e) => !ordemXmax.map(Number).includes(e));
  // Compara só a ordem RELATIVA das etapas que o funil de negócio usa.
  const divergem = noXmax.length === doDono.length
    ? noXmax.some((e, i) => e !== doDono[i])
    : true;
  return { divergem, ordemDoDono: doDono, ordemNoXmax: noXmax, ausentesNoXmax: ausentes };
}

/**
 * ⚠️ ENCERRADA = ganha (1) ou perdida (2). Qualquer outra coisa — inclusive
 * status ausente — conta como ABERTA.
 *
 * A direção do "não sei" é deliberada: oportunidade sem status vira linha do
 * funil (visível, conferível) em vez de sumir. Some silenciosamente é o defeito
 * pior dos dois, porque ninguém procura o que nunca apareceu.
 */
export const ehEncerrada = (status: unknown): boolean =>
  Number(status) === 1 || Number(status) === 2;

// ===========================================================================
// IDENTIDADE DA PESSOA
// ===========================================================================
/**
 * O telefone é a chave de PESSOA. Medido antes de decidir: 93,8% dos telefones
 * têm 11 dígitos, só 4 de 1.656 estão vazios e 3 são lixo. Dos 110 grupos de
 * telefone repetido, 71% são clone da mesma pessoa e 8% têm o próprio telefone
 * como título (criada por automação); sobram 23 grupos ambíguos = **1,4% do
 * funil**, e a inspeção mostrou que a maioria é pessoa × EMPRESA
 * ("ricardo | techbrasil") ou variação do mesmo nome ("debia | debbie").
 *
 * ⚠️ MATCH ESTRITO — número completo normalizado, NUNCA os 8 últimos dígitos.
 * Existem 12 chaves de 8 dígitos cobrindo mais de um número completo; o frouxo
 * juntaria pessoas diferentes só porque o final coincide. É o "GOLD contém OLD"
 * aplicado a gente.
 */
const soDigitos = (v: unknown): string => String(v ?? "").replace(/\D/g, "");

/** Telefone inutilizável: vazio, curto demais ou dígito repetido (000000…). */
export function telefoneInvalido(bruto: unknown): boolean {
  const d = soDigitos(bruto);
  return !d || d.length < 10 || /^(\d)\1+$/.test(d);
}

/** "+55 51 97400-1969" e "5197400 1969" viram a MESMA chave. */
export function normalizarTelefone(bruto: unknown): string | null {
  const d = soDigitos(bruto);
  if (telefoneInvalido(d)) return null;
  return d.length > 11 && d.startsWith("55") ? d.slice(2) : d;
}

export interface ChavePessoa {
  /** O valor que identifica: telefone normalizado, ou fallback por id. */
  chave: string;
  /** false = sem telefone usável; a pessoa é única por construção. */
  temTelefone: boolean;
}

/**
 * ⚠️ SEM TELEFONE NÃO JUNTA COM NINGUÉM. A oportunidade vira uma "pessoa" só
 * dela, com chave derivada do id. Agrupar os sem-telefone num balde comum
 * fundiria desconhecidos diferentes numa pessoa fantasma — o oposto do que a
 * contagem por pessoa quer resolver.
 */
export function chavePessoa(op: { id: number; mainphone?: unknown }): ChavePessoa {
  const tel = normalizarTelefone(op.mainphone);
  return tel ? { chave: tel, temTelefone: true } : { chave: `op:${op.id}`, temTelefone: false };
}

/**
 * docId da pessoa = HASH da chave, nunca o telefone em claro.
 *
 * ⚠️ Telefone é dado pessoal, e docId aparece no console do Firebase, em export,
 * em log e em mensagem de erro — lugares onde o campo DENTRO do documento não
 * aparece. O hash é determinístico (mesma pessoa, mesmo doc, import idempotente)
 * e o telefone fica como campo, acessível a quem tem acesso ao dado.
 * Contrato com a agência terá cláusula de LGPD; isto é a parte técnica dela.
 */
export const idPessoa = (chave: string): string =>
  createHash("sha1").update(chave).digest("hex").slice(0, 20);

// ===========================================================================
// ORDEM DAS ETAPAS
// ===========================================================================
/**
 * A ordem vem do `stageorders` do PRÓPRIO funil, nunca escrita à mão aqui.
 *
 * ⚠️ Se a agência reordenar as etapas no Xmax, a ordem muda sozinha na próxima
 * execução — e é por isso que o sync REPORTA a ordem que leu: uma reordenação
 * silenciosa mudaria qual etapa é "a mais avançada" e, com ela, a foto inteira
 * do funil. Ver o bloco `ordemDasEtapas` no retorno de /api/comercial/sync.
 *
 * Fallback para a ordem do array `stages` quando `stageorders` vier vazio —
 * documentado porque é decisão, não acaso: sem ordem nenhuma, `etapaMaisAvancada`
 * devolveria qualquer coisa.
 */
export function ordemDeEtapas(funil: { stageorders?: unknown; stages?: { id: number }[] }): number[] {
  const so = Array.isArray(funil?.stageorders) ? funil.stageorders.map(Number).filter(Number.isFinite) : [];
  if (so.length) return so;
  return (funil?.stages ?? []).map((e) => Number(e.id)).filter(Number.isFinite);
}

/**
 * Pessoa em várias etapas conta UMA vez, na etapa MAIS AVANÇADA que alcançou.
 * Etapa fora da ordem conhecida vai para o fim da fila (posição -1): não pode
 * ganhar de uma etapa real só por ser desconhecida.
 */
export function etapaMaisAvancada(etapas: Iterable<number>, ordem: number[]): number | null {
  const pos = new Map(ordem.map((id, i) => [id, i]));
  let melhor: number | null = null;
  let melhorPos = -Infinity;
  for (const e of etapas) {
    const p = pos.has(e) ? pos.get(e)! : -1;
    if (p > melhorPos) { melhorPos = p; melhor = e; }
  }
  return melhor;
}

// ===========================================================================
// DESQUALIFICAÇÃO — as DUAS formas, sempre
// ===========================================================================
/**
 * O Marcos confirmou que o funil 23 e a etiqueta [38] têm o MESMO papel, em
 * épocas diferentes: antes movia de funil, hoje etiqueta (criada pelo Thiago).
 *
 * ⚠️ CONTAR SÓ UMA APAGA METADE. Só a etiqueta perde todo o histórico (14 usos
 * contra 333 no funil 23); só o funil perde os de agora.
 *
 * A virada é ~julho/2026, INFERIDA — a etiqueta aparece a partir de 29/06 e o
 * funil 23 despenca em agosto. Nunca tratar como fato: `createdAt` é a data da
 * OPORTUNIDADE, não da marcação, e a API não guarda nem a aplicação da etiqueta
 * nem a mudança de funil.
 */
export function ehDesqualificado(op: { fkPipeline?: unknown; tags?: unknown }): boolean {
  if (Number(op?.fkPipeline) === FUNIL_DESQUALIFICADOS) return true;
  const tags = Array.isArray(op?.tags) ? op.tags.map(Number) : [];
  return tags.includes(TAG_SEM_PERFIL);
}

// ===========================================================================
// NORMALIZAÇÃO PARA GRAVAÇÃO
// ===========================================================================
/** O que vai para `comercial_oportunidades`. Datas já convertidas; nunca undefined. */
export interface OportunidadeGravada {
  id: number;
  pipelineId: number | null;
  stageId: number | null;
  status: number | null;
  titulo: string | null;
  telefone: string | null;
  email: string | null;
  origem: number;
  tags: number[];
  responsavelId: number | null;
  /**
   * Campanha de disparo que originou a oportunidade. `null` = sem vínculo.
   *
   * ⚠️ DIVERGE DE `origem` DE PROPÓSITO. Ali o zero é gravado cru porque a spec
   * não documenta sentinela — não dá para saber se 0 é ausência ou categoria.
   * Aqui a spec diz explicitamente "0 quando não houver vinculação", então a
   * ausência É conhecível e vira `null`, como manda a regra da casa.
   */
  campanhaId: number | null;
  valorCent: number | null;
  recorrenteCent: number | null;
  fechamentoValorCent: number | null;
  fechamentoRecorrenteCent: number | null;
  criadaEm: string | null;
  fechadaEm: string | null;
  naEtapaDesde: string | null;
  desqualificada: boolean;
  /** Chave de pessoa, em claro — o hash é só o docId de `comercial_pessoas`. */
  pessoaChave: string;
  pessoaId: string;
  temTelefone: boolean;
}

const n = (v: unknown): number | null => (Number.isFinite(Number(v)) ? Number(v) : null);
const s = (v: unknown): string | null => {
  const x = String(v ?? "").trim();
  return x || null;
};

export function normalizarOportunidade(op: OportunidadeXmax): OportunidadeGravada {
  const k = chavePessoa(op as { id: number; mainphone?: unknown });
  return {
    id: Number(op.id),
    pipelineId: n(op.fkPipeline),
    stageId: n(op.fkStage),
    status: n(op.status),
    titulo: s(op.title),
    telefone: normalizarTelefone(op.mainphone),
    email: s(op.mainmail)?.toLowerCase() ?? null,
    // Origem 0 é AUSÊNCIA, não categoria — gravada como 0 e resolvida na leitura.
    origem: Number(op.origin ?? 0) || 0,
    tags: Array.isArray(op.tags) ? op.tags.map(Number).filter(Number.isFinite) : [],
    responsavelId: n(op.responsableid),
    campanhaId: Number(op.fk_campaign) > 0 ? Number(op.fk_campaign) : null,
    valorCent: n(op.value),
    recorrenteCent: n(op.recurrentvalue),
    fechamentoValorCent: n(op.closevalue),
    fechamentoRecorrenteCent: n(op.closerecurrentvalue),
    // ⚠️ closedat e stagebegintime são EPOCH; createdAt é ISO. Ver lib/xmax.ts.
    criadaEm: criadaEm(op),
    fechadaEm: epochParaISO(op.closedat),
    naEtapaDesde: epochParaISO(op.stagebegintime),
    desqualificada: ehDesqualificado(op),
    pessoaChave: k.chave,
    pessoaId: idPessoa(k.chave),
    temTelefone: k.temTelefone,
  };
}

// ===========================================================================
// AGRUPAMENTO POR PESSOA
// ===========================================================================
export interface PessoaGravada {
  id: string;
  chave: string;
  telefone: string | null;
  temTelefone: boolean;
  /** Todos os nomes já vistos — a mesma pessoa aparece como nome e como empresa. */
  nomes: string[];
  oportunidadeIds: number[];
  /** Histórico: TODAS as oportunidades, abertas e encerradas. */
  vezesTrabalhado: number;
  /** Quantas ainda estão abertas — a diferença mostra o que já se encerrou. */
  abertas: number;
  /** ⚠️ Os campos abaixo olham só as ABERTAS: são a FOTO do funil. */
  etapaMaisAvancada: number | null;
  /** Etapa mais avançada IGNORANDO recuperação — é a do funil de captação. */
  etapaNaCaptacao: number | null;
  /** ⚠️ Nível de negócio (1..5) da pessoa no funil do dono. null = fora dele. */
  nivel: number | null;
  /** A etapa do funil de negócio em que ela está — para o detalhe do nível 1. */
  etapaNoFunil: number | null;
  emRecuperacao: boolean;
  emNegociacao: boolean;
  emConversaAvancada: boolean;
  /** Em [118]/[138]/[134]/[61]: fora do funil, mas NUNCA fora da tela. */
  foraDoFunil: boolean;
  /** Em [20] com oportunidade aberta — venda por decisão do dono (15/08/2026). */
  emFechamento: boolean;
  /** `recurrentvalue` das abertas em Fechamento. ⚠️ Campo DIFERENTE do MRR ganho. */
  fechamentoAbertoCent: number;
  /** Quando entrou em Fechamento — a única data que existe para essas vendas. */
  emFechamentoDesde: string | null;
  desqualificada: boolean;
  /** ⚠️ A data que define "lead novo do mês" — ver o comentário abaixo. */
  primeiroContato: string | null;
  ultimoContato: string | null;
  ganhou: boolean;
  mrrFechadoCent: number;
  fechamentosSemValor: number;
}

/**
 * ⚠️ "LEADS QUE CHEGARAM NO MÊS" = PESSOAS CUJO PRIMEIRO CONTATO FOI NO MÊS.
 * NUNCA oportunidades criadas no mês.
 *
 * Com a duplicação da automação, contar `createdAt` de oportunidade faria a MESMA
 * pessoa aparecer como lead novo em julho, agosto e setembro — inflando
 * justamente o número que o Thiago olha primeiro.
 *
 * CONSEQUÊNCIA A DEIXAR LEGÍVEL NA TELA: um mês pode ter MAIS oportunidades
 * criadas do que leads novos, e os dois números vão aparecer no painel. Quem
 * comparar sem rótulo vai achar que um está errado. Ambos ficam rotulados, e a
 * diferença entre eles é justamente o retrabalho.
 */
export function agruparPessoas(ops: OportunidadeGravada[], ordem: number[]): PessoaGravada[] {
  const porChave = new Map<string, OportunidadeGravada[]>();
  for (const o of ops) {
    const lista = porChave.get(o.pessoaChave) ?? [];
    lista.push(o);
    porChave.set(o.pessoaChave, lista);
  }

  return [...porChave.entries()].map(([chave, lista]) => {
    /**
     * ⚠️ AS ETAPAS SÃO SÓ AS DO FUNIL DE CAPTAÇÃO — e isto é correção de um
     * defeito real, não precaução.
     *
     * A pessoa pode ter oportunidade em MAIS DE UM funil: 2 das 1.455 estão ao
     * mesmo tempo no funil 4 (só em Recuperação) e no funil 23 (Desqualificados).
     * Sem este filtro, a etapa 126 do funil 23 entrava como "etapa de captação"
     * — porque não é etapa de recuperação — e essas 2 apareciam no funil de
     * captação sem nunca terem saído da recuperação. Deu 631 onde o diagnóstico
     * media 629.
     *
     * Comparar etapa de um funil contra a ordem de OUTRO não significa nada. A
     * presença no funil 23 já é registrada em `desqualificada`.
     */
    const doCaptacao = lista.filter((o) => Number(o.pipelineId) === FUNIL_CAPTACAO);

    /**
     * ⚠️ A FOTO DO FUNIL CONTA SÓ AS ABERTAS. As históricas contam TUDO.
     *
     * Encerrada tem `fkStage` como qualquer outra: sem este filtro, quem fechou
     * em "Fechamento" em 2024 passaria a contar como "está em Fechamento hoje"
     * assim que o backfill (Etapa B) trouxesse as encerradas. A foto responde
     * ONDE AS PESSOAS ESTÃO AGORA, e encerrada não está no funil.
     *
     * É também o que torna o backfill verificável: com a separação, os cinco
     * números de conferência (1.656 / 1.455 / 629 / 838 / 225) têm de continuar
     * IGUAIS depois dele. Se mudarem, é defeito — não é o backfill funcionando.
     * Sem isso, não haveria como distinguir as duas coisas.
     */
    const abertasCaptacao = doCaptacao.filter((o) => !ehEncerrada(o.status));
    const etapas = abertasCaptacao.map((o) => Number(o.stageId)).filter(Number.isFinite);
    const naCaptacao = etapas.filter((e) => !ehRecuperacao(e));

    /**
     * ⚠️ O NÍVEL VEM DA CONSTANTE DO DONO, não do `stageorders`. Ver NIVEIS_FUNIL:
     * [15] e [114] empatam no nível 1, e `nivelMaisAvancado` trata isso — enquanto
     * `etapaMaisAvancada`, que usa a posição no array do Xmax, não trataria.
     * Os dois convivem: o nível manda na foto, a etapa serve para o detalhe.
     */
    const nivel = nivelMaisAvancado(etapas);
    const noFunil = etapas.filter((e) => nivelDaEtapa(e) !== null);
    const etapaNoFunil = nivel === null
      ? null
      : (noFunil.find((e) => nivelDaEtapa(e) === nivel) ?? null);

    // ⚠️ VENDA SEM CLIQUE (decisão do Thiago, 15/08/2026): aberta em Fechamento é
    // venda feita. Valor vem de `recorrenteCent` — campo DIFERENTE do MRR ganho,
    // que é `fechamentoRecorrenteCent`. Somar o errado devolve zero em silêncio.
    const emFech = abertasCaptacao.filter((o) => Number(o.stageId) === ETAPA_FECHAMENTO);
    const entradas = emFech.map((o) => o.naEtapaDesde).filter((d): d is string => !!d).sort();

    // Histórico: TODAS as oportunidades da pessoa, abertas e encerradas.
    const datas = lista.map((o) => o.criadaEm).filter((d): d is string => !!d).sort();
    const ganhas = lista.filter((o) => Number(o.status) === 1);

    return {
      id: idPessoa(chave),
      chave,
      telefone: lista.find((o) => o.telefone)?.telefone ?? null,
      temTelefone: lista.some((o) => o.temTelefone),
      nomes: [...new Set(lista.map((o) => o.titulo).filter((t): t is string => !!t))],
      oportunidadeIds: lista.map((o) => o.id).sort((a, b) => a - b),
      vezesTrabalhado: lista.length,
      abertas: lista.filter((o) => !ehEncerrada(o.status)).length,
      // Todas olham SÓ o funil de captação, e só as abertas, pelo motivo acima.
      etapaMaisAvancada: etapas.length ? etapaMaisAvancada(etapas, ordem) : null,
      etapaNaCaptacao: naCaptacao.length ? etapaMaisAvancada(naCaptacao, ordem) : null,
      nivel,
      etapaNoFunil,
      emRecuperacao: etapas.some(ehRecuperacao),
      emNegociacao: etapas.some(ehNegociacao),
      emConversaAvancada: etapas.some(ehConversaAvancada),
      foraDoFunil: nivel === null && !etapas.some(ehRecuperacao) && etapas.some(ehForaDoFunil),
      emFechamento: emFech.length > 0,
      fechamentoAbertoCent: emFech.reduce((t, o) => t + (o.recorrenteCent ?? 0), 0),
      // A MAIS ANTIGA: é a que mede a dívida de processo, não a mais recente.
      emFechamentoDesde: entradas[0] ?? null,
      desqualificada: lista.some((o) => o.desqualificada),
      primeiroContato: datas[0] ?? null,
      ultimoContato: datas[datas.length - 1] ?? null,
      ganhou: ganhas.length > 0,
      // Só o que foi informado. Ausente NÃO vira zero somado — vira contagem própria.
      mrrFechadoCent: ganhas.reduce((t, o) => t + (o.fechamentoRecorrenteCent ?? 0), 0),
      fechamentosSemValor: ganhas.filter((o) => !o.fechamentoRecorrenteCent).length,
    };
  });
}
