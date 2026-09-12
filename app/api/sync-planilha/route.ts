import { NextResponse } from "next/server";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import { COL_SISTEMA, DOC_SYNC_PLANILHA, DOC_IGNORADAS, DOC_REMOVIDAS } from "@/lib/colecoes";
import { lerPlanilhaGerencial } from "@/lib/planilhaGerencial";
import { conciliar, type ContaNoPainel, type Sonda, type PlanoConciliacao } from "@/lib/conciliaPlanilha";
import { sondarIdentidade } from "@/lib/descobrirContas";
import { MOEDA_ACEITA, MSG_RESTRITO, LOTE_SONDA } from "@/lib/filaContas";
import { ENVS_META } from "@/lib/descobrirContas";
import { ENVS_GOOGLE } from "@/lib/googleAuth";
import { ENVS_PLANILHA } from "@/lib/planilhaGerencial";
import { ENVS_FIREBASE_ADMIN } from "@/lib/firebaseAdmin";
import { comporEnvs, conferirEnvs } from "@/lib/envs";
import type { EntradaGestor } from "@/lib/types";

/**
 * As envs que ESTA rota lê diretamente.
 *
 * ⚠️ `FILA_EMAILS_PERMITIDOS` é OPCIONAL aqui de propósito, e a distinção importa: o
 * CRON entra por `CRON_SECRET` e funciona sem ela. Exigi-la faria uma env que só serve
 * à porta HUMANA derrubar a automação — conferência que reprova ambiente funcionando é
 * a primeira a ser desligada.
 * 🕳️ O que ela custa: vazia, a tela recusa TODO MUNDO com o texto de "acesso restrito",
 * que descreve uma regra e não uma configuração faltando. É dívida conhecida, não
 * descuido: o dia em que alguém disser "perdi o acesso à /conciliacao", a primeira
 * coisa a olhar é esta env.
 */
const ENVS_ROTA = {
  obrigatorias: ["CRON_SECRET"],
  opcionais: ["FILA_EMAILS_PERMITIDOS"],
} as const;

/**
 * Tudo o que esta rota alcança — a maior lista do projeto, 8 envs, e SEIS delas entram
 * por transitividade, em módulo que a rota importa sem saber que ele lê env nenhuma.
 * COMPOSTO dos módulos, nunca à mão: ver o porquê em `lib/envs.ts`.
 */
const ENVS = comporEnvs(ENVS_ROTA, ENVS_FIREBASE_ADMIN, ENVS_GOOGLE, ENVS_META, ENVS_PLANILHA);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Abaixo do limite de 500 operações por batch do Firestore. */
const LOTE = 450;

/** Teto defensivo do histórico — mesmo valor do POST /api/contas e do import. */
const MAX_HISTORICO_GESTOR = 50;

// =========================================================================
// QUEM ESTÁ CHAMANDO — e é a IDENTIDADE que decide o que pode ser aplicado
// =========================================================================
/**
 * ⚠️⚠️ AS DUAS PORTAS USAM O MESMO HEADER, e isso é armadilha se não for tratado de
 * frente: o cron manda `Authorization: Bearer <CRON_SECRET>` e a tela manda
 * `Authorization: Bearer <ID token do Firebase>`. Mesmo cabeçalho, credenciais de
 * naturezas diferentes.
 *
 * 🔑 E A DIFERENÇA VIROU A TRAVA, em vez de virar um problema. O plano diz que troca de
 * gestor e criação de conta exigem clique humano — e aqui isso deixa de ser disciplina e
 * passa a ser mecânico: **o cron não tem identidade, então ele não CONSEGUE aplicar
 * gestor nem criar conta.** Não há flag que o autorize. O `gestorHistorico` grava o
 * e-mail de quem clicou porque só existe entrada quando alguém clicou.
 *
 * ⚠️ O motivo de o cron ser barrado não é desconfiança do cron: é que `gestorHistorico`
 * é append-only. Uma linha arrastada por engano às 8h59 viraria registro permanente que
 * ninguém desfaz. Campo de `planilha.*` errado, ao contrário, a próxima execução corrige.
 */
type Chamador =
  | { tipo: "cron" }
  | { tipo: "pessoa"; email: string }
  | { tipo: "negado"; resposta: NextResponse };

function emailsPermitidos(): string[] {
  return (process.env.FILA_EMAILS_PERMITIDOS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

async function identificar(req: Request): Promise<Chamador> {
  const h = req.headers.get("authorization") || "";
  const bearer = h.startsWith("Bearer ") ? h.slice(7) : "";
  const url = new URL(req.url);

  // 1. Cron. FALHA FECHADO: sem a env, ninguém entra por esta porta.
  const segredo = process.env.CRON_SECRET;
  if (segredo && (bearer === segredo || url.searchParams.get("key") === segredo)) {
    return { tipo: "cron" };
  }

  // 2. Pessoa: ID token do Firebase + allowlist. Mesma trava temporária da /fila-contas.
  const adminAuth = getAuthAdmin();
  if (adminAuth && bearer) {
    try {
      const dec = await adminAuth.verifyIdToken(bearer);
      const email = (dec.email || dec.uid).toLowerCase();
      if (emailsPermitidos().includes(email)) return { tipo: "pessoa", email };
      // ⚠️ 403 com o MESMO texto que a tela usa para desenhar painel NEUTRO. Bloqueio de
      // permissão desenhado como pane faz a pessoa reportar bug — ver CLAUDE.md.
      return { tipo: "negado", resposta: NextResponse.json({ erro: MSG_RESTRITO }, { status: 403 }) };
    } catch {
      /* token inválido cai no 401 abaixo */
    }
  }
  return { tipo: "negado", resposta: NextResponse.json({ erro: "não autorizado" }, { status: 401 }) };
}

// =========================================================================
// HISTÓRICO DE GESTOR — com a JANELA, nunca com um instante inventado
// =========================================================================
/**
 * ⚠️ `desde` É O TETO DA JANELA, e o registro diz isso agora. A planilha não guarda
 * quando a linha mudou de aba; o que se sabe é que na leitura anterior o gestor era o
 * antigo e nesta é o novo. A troca aconteceu em `(desdeNaoAntesDe, desde]`.
 *
 * ⚠️ Na PRIMEIRA execução não há leitura anterior e a janela é ABERTA
 * (`desdeNaoAntesDe: null`). Isso não é defeito a esconder: é a informação de que
 * aquela troca não pode ser datada, e quem consome precisa saber para não afirmar
 * "trocou em setembro" sobre algo que pode ser de julho.
 */
function historicoComTroca(
  anterior: unknown,
  gestorAtual: string,
  gestorNovo: string,
  agoraISO: string,
  desdeNaoAntesDe: string | null,
  por: string
): EntradaGestor[] {
  const base = Array.isArray(anterior)
    ? (anterior as EntradaGestor[])
    : [{ gestor: gestorAtual, desde: null, por: "sistema", em: agoraISO }];
  const entrada: EntradaGestor = {
    gestor: gestorNovo,
    desde: agoraISO,
    desdeNaoAntesDe,
    precisao: "janela",
    por,
    em: agoraISO,
  };
  return [entrada, ...base].slice(0, MAX_HISTORICO_GESTOR);
}

// =========================================================================
export async function GET(req: Request) {
  // ⚠️ TODAS DE UMA VEZ, e ANTES de qualquer coisa. Em 12/09/2026 esta rota subiu sem
  // `PLANILHA_GERENCIAL_ID`, parou na primeira ausente, e a falha só apareceu no dia
  // seguinte — dois 502 às 13:05, com 21s entre eles (o retry do workflow). Se houvesse
  // uma segunda faltando, seriam mais 24 horas para descobrir a próxima.
  const falta = conferirEnvs(ENVS);
  if (falta) {
    return NextResponse.json({ ok: false, erro: falta.mensagem, faltando: falta.faltando }, { status: 503 });
  }

  const quem = await identificar(req);
  if (quem.tipo === "negado") return quem.resposta;

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const url = new URL(req.url);
  const aplicarCampos = url.searchParams.get("aplicar") === "1";
  const aplicarGestor = url.searchParams.get("aplicarGestor") === "1";
  const aplicarCriacao = url.searchParams.get("aplicarCriacao") === "1";

  // 🛑 A TRAVA MECÂNICA. O cron pede e é recusado, com o motivo — nunca em silêncio.
  if (quem.tipo === "cron" && (aplicarGestor || aplicarCriacao)) {
    return NextResponse.json({
      erro: "troca de gestor e criação de conta exigem uma pessoa logada",
      porque: "o gestorHistorico é append-only: um registro errado não se desfaz. " +
        "Campo de planilha.* errado a próxima execução corrige; este não.",
    }, { status: 403 });
  }

  // --- 1. PLANILHA (viva, nunca cópia) --------------------------------
  let leitura: Awaited<ReturnType<typeof lerPlanilhaGerencial>>;
  try {
    leitura = await lerPlanilhaGerencial();
  } catch (e) {
    // ⚠️ Falha de leitura NÃO grava cursor e NÃO aplica nada. Ver DOC_SYNC_PLANILHA.
    return NextResponse.json(
      { erro: "não consegui ler a planilha", detalhe: String((e as Error).message).slice(0, 300) },
      { status: 502 }
    );
  }

  // --- 2. PAINEL ------------------------------------------------------
  const col = db.collection("contas");
  const snap = await col.get();
  const lidaEmPainel = new Date().toISOString();
  const docs = new Map<string, { id: string; data: Record<string, unknown> }>();
  const contas: ContaNoPainel[] = snap.docs.map((d) => {
    const x = d.data() as Record<string, unknown>;
    const accountId = String((x.accountId as string) || d.id).trim();
    docs.set(accountId, { id: d.id, data: x });
    return {
      accountId,
      cliente: String(x.cliente ?? ""),
      gestor: String(x.gestor ?? ""),
      pausado: !!x.pausado,
      planilha: (x.planilha as ContaNoPainel["planilha"]) ?? null,
      temHistoricoGestor: Array.isArray(x.gestorHistorico),
      gestorDaPlanilha: (x.gestorDaPlanilha as ContaNoPainel["gestorDaPlanilha"]) ?? null,
    };
  });

  const sistema = db.collection(COL_SISTEMA);
  const [removidasSnap, ignoradasSnap, cursorSnap] = await Promise.all([
    sistema.doc(DOC_REMOVIDAS).get(),
    sistema.doc(DOC_IGNORADAS).get(),
    sistema.doc(DOC_SYNC_PLANILHA).get(),
  ]);
  const removidas = (removidasSnap.data()?.contas ?? {}) as Record<string, { motivo?: string; em?: string }>;
  const ignoradas = (ignoradasSnap.data()?.contas ?? {}) as Record<string, { motivo?: string; em?: string }>;
  const leituraAnterior = (cursorSnap.data()?.lidaEmPlanilha as string) ?? null;

  // --- 3. SONDAGEM: só o que a planilha tem e o painel não -------------
  // ⚠️ Sondar TUDO seria ~84 chamadas à Meta por execução, para responder uma pergunta
  // que só as ausentes fazem. E ausência de sondagem não é aprovação: quem não for
  // sondado sai como pendência "não sondada", nunca como candidata.
  const noPainel = new Set(contas.map((c) => c.accountId));
  const aSondar = [...new Set(
    leitura.linhas.map((l) => l.accountId).filter((id): id is string => !!id && !noPainel.has(id))
  )];
  const sondas: Record<string, Sonda> = {};
  for (let i = 0; i < aSondar.length; i += LOTE_SONDA) {
    const bloco = aSondar.slice(i, i + LOTE_SONDA);
    const rs = await Promise.all(bloco.map(async (id) => {
      const s = await sondarIdentidade(id);
      return [id, s] as const;
    }));
    for (const [id, s] of rs) {
      sondas[id] = s.erro
        ? { ok: false, codigo: s.codigo ?? null }
        : { ok: true, moeda: s.moeda ?? null, nomeNaMeta: s.nomeNaMeta ?? null };
    }
  }
  const sondadasEm = new Date().toISOString();

  // --- 4. CONCILIAR (puro) --------------------------------------------
  const plano: PlanoConciliacao = conciliar({
    linhas: leitura.linhas,
    contas,
    removidas,
    ignoradas,
    sondas,
    sondadasEm,
    lidaEmPlanilha: leitura.lidaEm,
    lidaEmPainel,
    leituraAnterior,
  });

  // --- 5. APLICAR -----------------------------------------------------
  const gravacoes: { docId: string; dados: Record<string, unknown> }[] = [];
  const agoraISO = new Date().toISOString();
  const por = quem.tipo === "pessoa" ? quem.email : "sync-planilha";

  if (aplicarCampos) {
    for (const a of plano.atualizacoes) {
      const alvo = docs.get(a.accountId);
      if (!alvo) continue;
      // ⚠️ Escreve DENTRO de `planilha`, e o objeto inteiro. Merge parcial de campo
      // aninhado deixaria valor velho de uma coluna que a planilha esvaziou.
      gravacoes.push({ docId: alvo.id, dados: { planilha: a.valores } });
    }
  }

  if (aplicarGestor) {
    for (const t of plano.trocasGestor) {
      const alvo = docs.get(t.accountId);
      if (!alvo) continue;
      gravacoes.push({
        docId: alvo.id,
        dados: {
          gestor: t.para,
          gestorHistorico: historicoComTroca(
            alvo.data.gestorHistorico, t.de, t.para, agoraISO, leituraAnterior, por
          ),
        },
      });
    }
  }

  // ---------------------------------------------------------------------
  // AS MARCAS DE GOVERNO — quem a /carteira deixa de editar
  // ---------------------------------------------------------------------
  // ⚠️ VÃO JUNTO COM `aplicar=1`, e não atrás de flag própria. A marca não é uma
  // decisão: é a consequência publicada da regra que o conciliador já aplicou. Separá-la
  // criaria um estado em que a planilha governa o gestor e a tela não sabe disso — que é
  // exatamente a divergência silenciosa que o campo existe para fechar.
  //
  // 🛑 A REMOÇÃO É A ÚNICA PARTE COM TETO. Escrever marca só FECHA permissão de escrita;
  // remover ABRE. Por isso a assimetria: `entram` sempre passa, `saem` acima do teto
  // espera uma pessoa. Ver TETO_REMOCAO_MARCA em lib/conciliaPlanilha.ts.
  if (aplicarCampos) {
    for (const m of plano.marcas.entram) {
      const alvo = docs.get(m.accountId);
      // Conta que ainda vai ser CRIADA não tem doc: a marca dela entra no payload da
      // criação, logo abaixo. Escrever aqui criaria um documento pela metade.
      if (!alvo) continue;
      gravacoes.push({
        docId: alvo.id,
        dados: { gestorDaPlanilha: { aba: m.aba, em: leitura.lidaEm } },
      });
    }
    if (!plano.marcas.bloqueadaPorTeto) {
      for (const m of plano.marcas.saem) {
        const alvo = docs.get(m.accountId);
        if (!alvo) continue;
        // `null` e não FieldValue.delete(): o campo continua existindo com valor nulo,
        // então `typeof x === "object"` na conferência distingue "removida" de "nunca
        // teve" — a mesma régua de conferir presença, não valor.
        gravacoes.push({ docId: alvo.id, dados: { gestorDaPlanilha: null } });
      }
    }
  }

  if (aplicarCriacao) {
    for (const c of plano.criacoes) {
      // ⚠️ `cliente` VEM DA PLANILHA SÓ AQUI, e a distinção é real: na criação não existe
      // nome no painel para proteger. Nas atualizações ele fica de fora de propósito —
      // há 5 pares de nome divergentes por decisão da agência (data/README.md).
      gravacoes.push({
        docId: c.accountId,
        dados: {
          accountId: c.accountId,
          cliente: c.cliente,
          gestor: c.gestor,
          tipo: "",
          nicho: "",
          pausado: false,
          ativo: true,
          moeda: c.moeda ?? MOEDA_ACEITA,
          origemCadastro: "planilha",
          cadastradaPor: por,
          cadastradaEm: agoraISO,
          // Nasce governada: veio da planilha e o gestor dela É a aba. No mesmo
          // documento, para não existir instante em que a conta existe e a tela acha
          // que pode editar o gestor dela.
          gestorDaPlanilha: { aba: c.aba, em: leitura.lidaEm },
        },
      });
    }
  }

  let gravadas = 0;
  if (gravacoes.length) {
    for (let i = 0; i < gravacoes.length; i += LOTE) {
      const batch = db.batch();
      for (const g of gravacoes.slice(i, i + LOTE)) batch.set(col.doc(g.docId), g.dados, { merge: true });
      await batch.commit();
      gravadas += Math.min(LOTE, gravacoes.length - i);
    }
    // ⚠️ CURSOR SÓ DEPOIS DE GRAVAR, e só quando gravou. Ele define a janela da PRÓXIMA
    // detecção de troca; avançá-lo numa execução que não aplicou encurtaria a janela
    // seguinte para um intervalo em que ninguém comparou nada.
    await sistema.doc(DOC_SYNC_PLANILHA).set(
      { lidaEmPlanilha: leitura.lidaEm, aplicadoEm: agoraISO, por }, { merge: true }
    );
  }

  // --- 6. LEITURA DE VOLTA: o relatório fala do BANCO, não da intenção --
  // ⚠️ Conferência por PRESENÇA do campo, nunca contando valor. `planilha.situacaoConceito`
  // é `null` legítimo para célula vazia, e contar valor confundiria "não chegou" com
  // "chegou vazio" — as duas pedem ações opostas.
  let conferencia: Record<string, unknown> | null = null;
  if (gravacoes.length) {
    const ids = [...new Set(gravacoes.map((g) => g.docId))];
    const lidos = await Promise.all(ids.slice(0, 30).map((id) => col.doc(id).get()));
    const comBloco = lidos.filter((d) => d.exists && typeof d.data()?.planilha === "object" && d.data()?.planilha).length;
    // ⚠️ A CONTAGEM QUE IMPORTA É A DA COLEÇÃO INTEIRA, não a da amostra: o número de
    // contas governadas é o que decide quantas pessoas perdem o seletor na /carteira.
    // Ele tem que bater com `marcas` — se divergir, a guarda do balde não entrou.
    const todos = await col.get();
    const governadasNoBanco = todos.docs.filter((d) => {
      const g = d.data()?.gestorDaPlanilha;
      return g && typeof g === "object";
    }).length;
    conferencia = {
      mensagem: "lido de volta do Firestore, por PRESENÇA do campo — não é o objeto em memória",
      documentosConferidos: lidos.length,
      deUmTotalDe: ids.length,
      comBlocoPlanilha: comBloco,
      governadasNoBanco,
      // A régua: governadas = contas na planilha MENOS as do balde PAUSADO.
      esperado: plano.atualizacoes.length + plano.inalteradas - plano.sugestoesGestor.length,
    };
  }

  return NextResponse.json({
    ok: true,
    modo: gravacoes.length ? "aplicar" : "previa",
    chamador: quem.tipo,
    // ⚠️ TRÊS DATAS, NUNCA UMA. A da planilha, a do painel e a da sondagem. O veredito da
    // Meta muda dentro do mesmo dia: em 10/09/2026 duas contas saíram de `403 code 200`
    // para `200` em 40 minutos. Pendência de "não legível" sem hora ao lado é
    // indistinguível de uma já resolvida.
    lidaEmPlanilha: plano.lidaEmPlanilha,
    lidaEmPainel: plano.lidaEmPainel,
    sondadasEm: plano.sondadasEm,
    janelaGestor: plano.janelaGestor,
    planilha: { titulo: leitura.titulo, abasIgnoradas: leitura.abasIgnoradas },
    estrutura: leitura.diagnosticos,
    resumo: {
      linhasLidas: leitura.linhas.length,
      atualizacoes: plano.atualizacoes.length,
      inalteradas: plano.inalteradas,
      trocasGestor: plano.trocasGestor.length,
      criacoes: plano.criacoes.length,
      sugestoesGestor: plano.sugestoesGestor.length,
      pendencias: plano.pendencias.length,
      foraDeOperacao: plano.foraDeOperacao.length,
      semLinhaNaPlanilha: plano.semLinhaNaPlanilha.length,
      marcasEntram: plano.marcas.entram.length,
      marcasSaem: plano.marcas.saem.length,
      marcasInalteradas: plano.marcas.inalteradas,
      gravadas,
    },
    marcas: plano.marcas,
    conferencia,
    atualizacoes: plano.atualizacoes.map((a) => ({ accountId: a.accountId, cliente: a.cliente, campos: a.campos })),
    trocasGestor: plano.trocasGestor,
    criacoes: plano.criacoes,
    sugestoesGestor: plano.sugestoesGestor,
    pendencias: plano.pendencias,
    foraDeOperacao: plano.foraDeOperacao,
    semLinhaNaPlanilha: plano.semLinhaNaPlanilha,
  });
}
