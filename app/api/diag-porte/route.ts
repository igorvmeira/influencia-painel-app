// ===========================================================================
// 🕐 DIAGNÓSTICO TEMPORÁRIO — CRIADO EM 20/08/2026, REMOVER APÓS A MEDIÇÃO
// ===========================================================================
// MOTIVO: decidir a Demanda 2 (tela de qualificação por porte). O número que
// circulava — "~8%, 212 de 2.670" — NÃO serve para essa decisão:
//   · foi contado por OPORTUNIDADE, e a régua da casa conta PESSOA;
//   · é de 17/08/2026, e a base cresce todo dia.
// Isso se REMEDE, não se confere. Esta rota é a remedição.
//
// ⚠️ LEITURA PURA. Nenhum `set`, `update` ou `delete`. Nenhuma env nova.
// ⚠️ NENHUM DADO PESSOAL NA RESPOSTA. Só contagens e ids de etiqueta. A
//    `pessoaChave` (telefone em claro) é usada como chave de deduplicação em
//    memória e NUNCA sai daqui.
//
// ===========================================================================
// OS QUATRO ACHADOS DE DESENHO HERDADOS DA `diag-etiquetas` (ver o doc)
// ===========================================================================
// 1. O AGREGADO NÃO RESPONDE. `comercial_agregados/funil` não guarda etiqueta
//    nenhuma — só o booleano `desqualificada`, derivado da tag [38]. A
//    distribuição por id não existe lá. É varredura de `comercial_oportunidades`
//    ou nada.
// 2. NÃO LER `comercial_pessoas`. A oportunidade já carrega `pessoaChave` e
//    `temTelefone`, então a contagem POR PESSOA sai da mesma varredura. Ler as
//    ~2.657 pessoas seria pagar 2.657 leituras por um dado que já está na mão.
// 3. A RÉGUA CONTA PESSOA, NÃO LINHA. A automação de recuperação cria
//    oportunidade nova a cada disparo; contar linha infla o mesmo contato.
// 4. `[38] Sem Perfil` NÃO ENTRA NA COBERTURA DE PORTE — ela marca
//    desqualificação, não tamanho. Sai contada À PARTE.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import { NIVEIS_FUNIL, TAG_SEM_PERFIL, FUNIL_CAPTACAO, FUNIL_DESQUALIFICADOS } from "@/lib/comercial";
import { nomeEtapa } from "@/lib/etapas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const COL_OP = "comercial_oportunidades";

/**
 * As CINCO faixas de tamanho. `[38] Sem Perfil` fica de fora de propósito —
 * ver o achado 4 no topo. Nomes lidos de `getTags` em 20/08/2026.
 */
const FAIXAS: Record<number, string> = {
  39: "menos de 1k",
  40: "1k a 3k",
  41: "3k a 5k",
  42: "5k a 10k",
  43: "Mais de 10k",
};
const IDS_FAIXA = Object.keys(FAIXAS).map(Number);

/** nível de negócio (1..5) de uma etapa; `null` fora do funil de captação. */
const NIVEL_POR_ETAPA = new Map<number, number>(
  NIVEIS_FUNIL.flatMap((n) => n.etapas.map((e) => [e, n.nivel] as [number, number]))
);
const NOME_NIVEL = new Map<number, string>(NIVEIS_FUNIL.map((n) => [n.nivel, n.nome]));

interface Pessoa {
  tags: Set<number>;
  /** Maior nível de negócio alcançado entre TODAS as oportunidades dela. */
  nivelMax: number | null;
  temTelefone: boolean;
  oportunidades: number;
}

export async function GET(req: Request) {
  const barrado = checarCronSecret(req);
  if (barrado) return barrado;

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  // ⚠️ `select()` corta BANDA, não LEITURA: o Firestore cobra 1 por documento de
  // qualquer jeito. Está aqui para a varredura caber no maxDuration, não para
  // economizar dinheiro — e dizer isso evita a próxima pessoa achar que economiza.
  const snap = await db.collection(COL_OP)
    .select("tags", "pessoaChave", "temTelefone", "stageId", "pipelineId")
    .get();

  // ---- acumuladores ---------------------------------------------------------
  const porOportunidade = new Map<number, number>();   // tagId -> nº de oportunidades
  const pessoas = new Map<string, Pessoa>();
  let opsComAlgumaFaixa = 0;
  let opsComSemPerfil = 0;
  const porEtapaOp = new Map<number, { total: number; comFaixa: number }>();

  for (const d of snap.docs) {
    const o = d.data() as {
      tags?: unknown; pessoaChave?: unknown; temTelefone?: unknown;
      stageId?: unknown; pipelineId?: unknown;
    };
    const tags = Array.isArray(o.tags) ? o.tags.map(Number).filter(Number.isFinite) : [];
    const chave = typeof o.pessoaChave === "string" ? o.pessoaChave : null;
    const etapa = Number.isFinite(Number(o.stageId)) ? Number(o.stageId) : null;

    for (const t of tags) porOportunidade.set(t, (porOportunidade.get(t) ?? 0) + 1);

    const temFaixa = IDS_FAIXA.some((id) => tags.includes(id));
    if (temFaixa) opsComAlgumaFaixa++;
    if (tags.includes(TAG_SEM_PERFIL)) opsComSemPerfil++;

    if (etapa !== null) {
      const e = porEtapaOp.get(etapa) ?? { total: 0, comFaixa: 0 };
      e.total++;
      if (temFaixa) e.comFaixa++;
      porEtapaOp.set(etapa, e);
    }

    if (!chave) continue;
    const p = pessoas.get(chave) ?? {
      tags: new Set<number>(), nivelMax: null,
      temTelefone: o.temTelefone === true, oportunidades: 0,
    };
    p.oportunidades++;
    // ⚠️ UNIÃO das etiquetas da pessoa, não as da última oportunidade. A faixa de
    // porte é atributo do CONTATO no CRM e aparece só em ALGUMAS oportunidades
    // dele — olhar uma só subestimaria a cobertura.
    for (const t of tags) p.tags.add(t);
    if (o.temTelefone === true) p.temTelefone = true;
    const nv = etapa === null ? null : NIVEL_POR_ETAPA.get(etapa) ?? null;
    if (nv !== null && (p.nivelMax === null || nv > p.nivelMax)) p.nivelMax = nv;
    pessoas.set(chave, p);
  }

  // ---- denominadores --------------------------------------------------------
  const todas = [...pessoas.values()];
  const comTel = todas.filter((p) => p.temTelefone);
  const totalOps = snap.size;

  /** ⚠️ SEMPRE "X de Y", nunca só o percentual — régua da casa. */
  const frac = (x: number, y: number) =>
    `${x} de ${y}` + (y > 0 ? ` (${((x / y) * 100).toFixed(1).replace(".", ",")}%)` : "");

  const temFaixa = (p: Pessoa) => IDS_FAIXA.some((id) => p.tags.has(id));
  const temSemPerfil = (p: Pessoa) => p.tags.has(TAG_SEM_PERFIL);

  const cobertura = (lista: Pessoa[]) => ({
    denominador: lista.length,
    comAlgumaFaixa: frac(lista.filter(temFaixa).length, lista.length),
    comSemPerfil: frac(lista.filter(temSemPerfil).length, lista.length),
    semNenhumaDasSeis: frac(
      lista.filter((p) => !temFaixa(p) && !temSemPerfil(p)).length, lista.length),
    // ⚠️ Pode ter as DUAS: alguém marcado "Sem Perfil" e com faixa. Não é erro —
    // é por isso que os três números acima não somam o denominador.
    comFaixaESemPerfil: lista.filter((p) => temFaixa(p) && temSemPerfil(p)).length,
  });

  const distribuicao = (lista: Pessoa[]) => IDS_FAIXA.map((id) => ({
    etiquetaId: id,
    nome: FAIXAS[id],
    pessoas: lista.filter((p) => p.tags.has(id)).length,
    de: frac(lista.filter((p) => p.tags.has(id)).length, lista.length),
  }));

  // ---- 6) a cobertura recorta por etapa? -----------------------------------
  const porNivel = NIVEIS_FUNIL.map((n) => {
    const doNivel = comTel.filter((p) => p.nivelMax === n.nivel);
    return {
      nivel: n.nivel,
      nome: n.nome,
      pessoas: doNivel.length,
      comAlgumaFaixa: frac(doNivel.filter(temFaixa).length, doNivel.length),
    };
  });
  const foraDoFunil = comTel.filter((p) => p.nivelMax === null);

  // Acumulado: quem chegou AO NÍVEL N OU ADIANTE — é o denominador que a tela
  // usaria se a hipótese ("porte só é marcado depois que o lead avança") colar.
  const doNivelPraCima = NIVEIS_FUNIL.map((n) => {
    const lista = comTel.filter((p) => p.nivelMax !== null && p.nivelMax >= n.nivel);
    return {
      apartirDoNivel: n.nivel,
      nome: n.nome,
      pessoas: lista.length,
      comAlgumaFaixa: frac(lista.filter(temFaixa).length, lista.length),
    };
  });

  return NextResponse.json({
    ok: true,
    aviso:
      "Diagnóstico TEMPORÁRIO de 20/08/2026, leitura pura, sem dado pessoal. "
      + `Custou ${totalOps} leituras de Firestore (uma varredura de ${COL_OP}).`,
    medidoEm: new Date().toISOString(),

    denominadores: {
      oportunidades: totalOps,
      pessoasDistintas: todas.length,
      pessoasComTelefone: comTel.length,
      /**
       * ⚠️ POR QUE DOIS DENOMINADORES DE PESSOA. Oportunidade sem telefone recebe
       * chave `op:{id}` — cada uma vira uma "pessoa" própria, porque não há como
       * saber se são a mesma. Isso INFLA o denominador e AFUNDA o percentual.
       * A régua da casa é telefone estrito; o outro número está aqui só para
       * mostrar o tamanho da distorção.
       */
      semTelefone: todas.length - comTel.length,
    },

    // 1, 3 e 4 — por PESSOA, que é a régua
    porPessoa: {
      regua: "telefone estrito — é este o número que vale",
      ...cobertura(comTel),
      distribuicaoEntreAsCinco: distribuicao(comTel),
    },
    porPessoaTodasAsChaves: {
      nota: "inclui as chaves op:{id} sem telefone — para ver a distorção, não para usar",
      ...cobertura(todas),
    },

    // 5 — por OPORTUNIDADE, para comparar com o número velho
    porOportunidade: {
      nota:
        "É a régua ANTIGA (a do '~8%'), reproduzida aqui só para a comparação. "
        + "Contar linha infla quem tem muitas oportunidades — ver achado 3.",
      comAlgumaFaixa: frac(opsComAlgumaFaixa, totalOps),
      comSemPerfil: frac(opsComSemPerfil, totalOps),
      distribuicaoEntreAsCinco: IDS_FAIXA.map((id) => ({
        etiquetaId: id, nome: FAIXAS[id],
        oportunidades: porOportunidade.get(id) ?? 0,
        de: frac(porOportunidade.get(id) ?? 0, totalOps),
      })),
    },

    // 6 — a hipótese: a cobertura recorta por etapa?
    recorteporEtapa: {
      hipotese:
        "o porte só é marcado depois que o lead avança — se colar, a cobertura "
        + "sobre quem chegou à Negociação é muito maior que sobre o total, e é ESSE "
        + "o denominador que a tela deve usar",
      nota:
        "nível = o MAIOR nível de negócio entre TODAS as oportunidades da pessoa. "
        + "⚠️ O CRM não guarda o caminho percorrido, então isto é a etapa ATUAL mais "
        + "avançada, nunca 'a mais avançada que ela já esteve'.",
      porNivelExato: porNivel,
      doNivelPraCima,
      foraDoFunilDeCaptacao: {
        nota: `pessoas cujas etapas não pertencem aos níveis 1..5 (inclui o funil ${FUNIL_DESQUALIFICADOS} e as etapas fora do funil ${FUNIL_CAPTACAO})`,
        pessoas: foraDoFunil.length,
        comAlgumaFaixa: frac(foraDoFunil.filter(temFaixa).length, foraDoFunil.length),
      },
      // Por ETAPA crua também, porque nível agrupa [15] e [114] no mesmo degrau.
      porEtapaDaOportunidade: [...porEtapaOp.entries()]
        .sort((a, b) => b[1].total - a[1].total)
        .map(([id, v]) => ({
          etapaId: id, nome: nomeEtapa(id),
          oportunidades: v.total,
          comAlgumaFaixa: frac(v.comFaixa, v.total),
        })),
    },

    // Todos os ids vistos, para ninguém sumir em silêncio
    todasAsEtiquetasVistas: [...porOportunidade.entries()]
      .sort((a, b) => b[1] - a[1])
      .map(([id, qtd]) => ({
        etiquetaId: id,
        nome: FAIXAS[id] ?? (id === TAG_SEM_PERFIL ? "Sem Perfil" : null),
        ehFaixaDePorte: IDS_FAIXA.includes(id),
        oportunidades: qtd,
      })),
  });
}
