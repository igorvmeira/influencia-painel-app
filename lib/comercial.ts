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
 */
export const ETAPAS_RECUPERACAO = [113, 49] as const;

/** O que conta como conversa de venda de verdade. */
export const ETAPAS_NEGOCIACAO = [17, 27, 61, 20] as const;

export const ehRecuperacao = (stageId: unknown): boolean =>
  (ETAPAS_RECUPERACAO as readonly number[]).includes(Number(stageId));
export const ehNegociacao = (stageId: unknown): boolean =>
  (ETAPAS_NEGOCIACAO as readonly number[]).includes(Number(stageId));

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
  vezesTrabalhado: number;
  etapaMaisAvancada: number | null;
  /** Etapa mais avançada IGNORANDO recuperação — é a do funil de captação. */
  etapaNaCaptacao: number | null;
  emRecuperacao: boolean;
  emNegociacao: boolean;
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
    const etapas = doCaptacao.map((o) => Number(o.stageId)).filter(Number.isFinite);
    const naCaptacao = etapas.filter((e) => !ehRecuperacao(e));
    const datas = lista.map((o) => o.criadaEm).filter((d): d is string => !!d).sort();
    const ganhas = lista.filter((o) => o.status === 1);

    return {
      id: idPessoa(chave),
      chave,
      telefone: lista.find((o) => o.telefone)?.telefone ?? null,
      temTelefone: lista.some((o) => o.temTelefone),
      nomes: [...new Set(lista.map((o) => o.titulo).filter((t): t is string => !!t))],
      oportunidadeIds: lista.map((o) => o.id).sort((a, b) => a - b),
      vezesTrabalhado: lista.length,
      // Todas as três olham SÓ o funil de captação, pelo motivo acima.
      etapaMaisAvancada: etapas.length ? etapaMaisAvancada(etapas, ordem) : null,
      etapaNaCaptacao: naCaptacao.length ? etapaMaisAvancada(naCaptacao, ordem) : null,
      emRecuperacao: etapas.some(ehRecuperacao),
      emNegociacao: etapas.some(ehNegociacao),
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
