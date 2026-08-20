import { NextResponse } from "next/server";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import { ehGestorValido } from "@/lib/gestores";
import { podeCadastrar, CandidataFila, FilaContas, Ignorada, MOEDA_ACEITA, MSG_RESTRITO } from "@/lib/filaContas";
import { descobrirContas } from "@/lib/descobrirContas";
// ⚠️ Este arquivo já importava DOC_FILA e DOC_IGNORADAS e escrevia collection("sistema")
// à mão OITO vezes — na mesma linha em que usava a constante do documento. Participava
// da decisão para o nome do doc e não para o da coleção.
import { COL_SISTEMA, DOC_FILA, DOC_IGNORADAS } from "@/lib/colecoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Orçamento da busca sob demanda ("procurar agora"). Maior que o do sync porque
// aqui existe uma pessoa esperando na tela, e nada mais divide a chamada.
const DESCOBERTA_MS = 8000;

/**
 * A fila de aprovação: LÊ o que o sync descobriu, e ESCREVE a decisão humana.
 *
 * ⚠️ CUSTO DE LEITURA: 2 documentos (`sistema/filaContas` + `sistema/contasIgnoradas`).
 * A descoberta em si é cara — 2 requisições à Meta por candidata — e por isso roda
 * no sync, não a cada carregamento de tela.
 *
 * ⚠️ IGNORADAS MORAM EM `sistema/`, num doc só, e o motivo é estrutural: a conta
 * ignorada NÃO está em `contas` (é o ponto da fila), então não há doc dela para
 * carregar o campo. E `sistema/` é intocado pelo import não destrutivo.
 */

/**
 * ⚠️ TELA DE ADMIN — allowlist por env, o MESMO padrão temporário que trancou o
 * /api/ia. Cadastrar conta muda o que o painel inteiro mede; esconder o item de
 * menu não é proteção, então a checagem é aqui no servidor.
 * PROVISÓRIO até o sistema de papéis existir.
 */
function emailsPermitidos(): string[] {
  return (process.env.FILA_EMAILS_PERMITIDOS || "")
    .split(",").map((e) => e.trim().toLowerCase()).filter(Boolean);
}

async function autenticar(req: Request): Promise<{ email: string } | null> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth || !token) return null;
  try {
    const dec = await adminAuth.verifyIdToken(token);
    return { email: (dec.email || dec.uid).toLowerCase() };
  } catch {
    return null;
  }
}

/** Falha FECHADO: env ausente = ninguém entra. */
function autorizado(email: string): boolean {
  const permitidos = emailsPermitidos();
  return permitidos.length > 0 && permitidos.includes(email);
}

/** Corpo comum do GET e do "procurar agora" — a tela lê o mesmo formato dos dois. */
function resposta(fila: FilaContas | null, ignoradas: Record<string, Ignorada>, candidatas: CandidataFila[]) {
  return {
    geradoEm: fila?.geradoEm ?? null,
    diasGasto: fila?.diasGasto ?? null,
    totalListadas: fila?.totalListadas ?? null,
    jaCadastradas: fila?.jaCadastradas ?? null,
    erroDescoberta: fila?.erro ?? null,
    cortadasPeloTeto: fila?.cortadasPeloTeto ?? 0,
    motivoCorte: fila?.motivoCorte ?? null,
    candidatas,
    ignoradas: Object.entries(ignoradas).map(([accountId, i]) => ({ accountId, ...i })),
  };
}

export async function GET(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  if (!autorizado(sessao.email)) {
    return NextResponse.json({ ok: false, erro: MSG_RESTRITO }, { status: 403 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });

  try {
    const [snapFila, snapIgn] = await Promise.all([
      db.collection(COL_SISTEMA).doc(DOC_FILA).get(),
      db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).get(),
    ]);

    // ⚠️ Doc que ainda não existe devolve fila VAZIA, nunca 500 — a descoberta pode
    // simplesmente não ter rodado ainda. A tela distingue os dois pelo `geradoEm`.
    const fila = (snapFila.data() as FilaContas | undefined) ?? null;
    const ignoradas = (snapIgn.data()?.contas ?? {}) as Record<string, Ignorada>;

    const candidatas = (fila?.candidatas ?? []).filter((c) => !ignoradas[c.accountId]);

    return NextResponse.json({ ok: true, ...resposta(fila, ignoradas, candidatas) });
  } catch (e) {
    console.error("[/api/fila-contas] falha ao ler:", e);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}

/** Cadastrar ou ignorar — a decisão HUMANA. Nunca automática. */
export async function POST(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  if (!autorizado(sessao.email)) {
    return NextResponse.json({ ok: false, erro: MSG_RESTRITO }, { status: 403 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });

  let corpo: Record<string, unknown>;
  try { corpo = await req.json(); } catch { return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 }); }

  const acao = String(corpo.acao ?? "");

  // ----------------------------------------------------------------- PROCURAR
  // A mesma descoberta do sync, sob demanda. É POST e não GET de propósito: gasta
  // requisições no Meta e reescreve `sistema/filaContas` — não é leitura.
  if (acao === "procurar") {
    const fila = await descobrirContas(db, { orcamentoMs: DESCOBERTA_MS });
    const snapIgn = await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).get();
    const ignoradas = (snapIgn.data()?.contas ?? {}) as Record<string, Ignorada>;
    return NextResponse.json({
      ok: !fila.erro,
      ...resposta(fila, ignoradas, fila.candidatas.filter((c) => !ignoradas[c.accountId])),
    });
  }

  const accountId = String(corpo.accountId ?? "").trim();
  if (!accountId) return NextResponse.json({ ok: false, erro: "accountId ausente" }, { status: 400 });

  // ------------------------------------------------------------------ IGNORAR
  if (acao === "ignorar") {
    // ⚠️ MARCA, NÃO APAGA. Nada é destruído: some da fila e continua auditável,
    // com quem decidiu e quando. Desfazer é remover a marca. A descoberta continua
    // sondando a conta ignorada — por isso desfazer vale na hora.
    await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).set({
      contas: {
        [accountId]: {
          por: sessao.email,
          em: new Date().toISOString(),
          motivo: corpo.motivo ? String(corpo.motivo).slice(0, 300) : null,
        },
      },
    }, { merge: true });
    return NextResponse.json({ ok: true, acao: "ignorar", accountId });
  }

  // ------------------------------------------------------------------ DESFAZER
  if (acao === "desfazerIgnorar") {
    const snap = await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).get();
    const contas = { ...(snap.data()?.contas ?? {}) } as Record<string, Ignorada>;
    delete contas[accountId];
    await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).set({ contas }, { merge: false });
    return NextResponse.json({ ok: true, acao: "desfazerIgnorar", accountId });
  }

  // ----------------------------------------------------------------- CADASTRAR
  if (acao !== "cadastrar") {
    return NextResponse.json({ ok: false, erro: "ação desconhecida" }, { status: 400 });
  }

  const cliente = String(corpo.cliente ?? "").trim();
  const gestor = String(corpo.gestor ?? "").trim();
  const nicho = String(corpo.nicho ?? "").trim();
  const tipo = String(corpo.tipo ?? "").trim();

  if (!cliente) return NextResponse.json({ ok: false, erro: "informe o nome comercial" }, { status: 400 });
  // Mesma validação da /carteira: gestor fora da lista canônica não entra.
  if (!ehGestorValido(gestor)) {
    return NextResponse.json({ ok: false, erro: "gestor fora da lista de lib/gestores.ts" }, { status: 400 });
  }

  // ⚠️ AS DUAS CONFERÊNCIAS SÃO REFEITAS NO SERVIDOR, contra a fila gravada. A tela
  // desabilita o botão em moeda estrangeira, mas confiar nisso deixaria a regra do
  // lado de quem pode ser contornado — e o custo de errar aqui é uma conta em outra
  // moeda somando no total em reais.
  const snapFila = await db.collection(COL_SISTEMA).doc(DOC_FILA).get();
  const fila = snapFila.data() as FilaContas | undefined;
  const cand = (fila?.candidatas ?? []).find((c: CandidataFila) => c.accountId === accountId);
  if (!cand) {
    return NextResponse.json(
      { ok: false, erro: "esta conta não está na fila descoberta — cadastre pelo data/contas.json" },
      { status: 400 }
    );
  }
  const conferencia = podeCadastrar(cand);
  if (!conferencia.ok) {
    return NextResponse.json({ ok: false, erro: `não pode ser cadastrada: ${conferencia.motivo}` }, { status: 400 });
  }

  // Já existe? Não sobrescreve — o import não destrutivo vale aqui também.
  const ref = db.collection("contas").doc(accountId);
  if ((await ref.get()).exists) {
    return NextResponse.json({ ok: false, erro: "esta conta já está cadastrada" }, { status: 409 });
  }

  await ref.set({
    accountId,
    cliente,
    gestor,
    nicho: nicho || null,
    tipo: tipo || null,
    pausado: false,
    moeda: cand.moeda ?? MOEDA_ACEITA,
    /**
     * ⚠️ O MARCADOR QUE EVITA A DIVERGÊNCIA SILENCIOSA. Mesmo espírito do
     * `gestorEditadoEm`: diz que a TELA é dona deste documento, então o
     * /api/import-contas não a trata como órfã por não estar no data/contas.json.
     * O relatório do import lista essas contas SEMPRE, mesmo quando são zero.
     */
    origemCadastro: "tela",
    cadastradaPor: sessao.email,
    cadastradaEm: new Date().toISOString(),
  }, { merge: true });

  /**
   * ⚠️ TIRA DA FILA NA HORA. Sem isto a conta recém-cadastrada continuaria na lista
   * até a próxima descoberta, e quem acabou de cadastrar leria "não salvou" e
   * cadastraria de novo — recebendo o 409 como se fosse erro.
   *
   * A alternativa seria o GET conferir cada candidata contra a coleção `contas`,
   * mas isso trocaria a promessa de "1 documento por carregamento" por 117 leituras.
   *
   * Concorrência: é read-modify-write num doc só. Com dois admins cadastrando no
   * mesmo segundo, uma remoção pode se perder — e o pior caso é a conta reaparecer
   * na lista até a próxima busca, onde ela já está em `cadastradas` e é filtrada.
   * Nada é gravado duas vezes: o docId é o accountId.
   */
  if (fila) {
    await db.collection(COL_SISTEMA).doc(DOC_FILA).set(
      { ...fila, candidatas: fila.candidatas.filter((c) => c.accountId !== accountId) }
    );
  }

  return NextResponse.json({ ok: true, acao: "cadastrar", accountId, cliente, gestor });
}
