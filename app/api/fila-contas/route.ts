import { NextResponse } from "next/server";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import { ehGestorValido } from "@/lib/gestores";
import { podeCadastrar, classificarFalhaSonda, CandidataFila, FilaContas, Ignorada, MOEDA_ACEITA, MSG_RESTRITO, bare as bareId } from "@/lib/filaContas";
import { descobrirContas, sondarIdentidade, sondarGasto } from "@/lib/descobrirContas";
// ⚠️ Este arquivo já importava DOC_FILA e DOC_IGNORADAS e escrevia collection("sistema")
// à mão OITO vezes — na mesma linha em que usava a constante do documento. Participava
// da decisão para o nome do doc e não para o da coleção.
import { COL_SISTEMA, DOC_FILA, DOC_IGNORADAS, DOC_REMOVIDAS } from "@/lib/colecoes";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Orçamento da busca sob demanda ("procurar agora"). Maior que o do sync porque
// aqui existe uma pessoa esperando na tela, e nada mais divide a chamada.
const DESCOBERTA_MS = 8000;

/**
 * Janela do gasto no cadastro por id colado. Igual a DIAS_GASTO da descoberta (120):
 * a pergunta e a mesma -- "rodou em algum momento?" -- e dois numeros diferentes para
 * a mesma pergunta fariam a mesma conta parecer ativa num caminho e parada no outro.
 * ⚠️ Duplicado de proposito: lib/descobrirContas nao exporta o dele. Mudar um obriga
 * a mudar o outro ate que exista um lugar neutro para os dois.
 */
const DIAS_GASTO_POR_ID = 120;

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
  // ------------------------------------------------------ CADASTRAR POR ID COLADO
  /**
   * ⚠️⚠️ O CAMINHO QUE A FILA NÃO PODE OFERECER, E POR ISSO EXISTE.
   *
   * A ação `cadastrar` exige que a conta esteja em `sistema/filaContas.candidatas`, e
   * essa fila NASCE do `me/adaccounts` — que comprovadamente não lista conta vinda de
   * parceria de Business Manager. **A tela era estruturalmente incapaz de cadastrar
   * exatamente as contas que a listagem esconde**, e o rodapé dourado já mandava o
   * humano "pedir o accountId em texto e sondar pela consulta direta" — um fluxo que
   * não existia. Medido em 05/09/2026: das 13 contas da planilha gerencial que
   * faltavam no painel, **10 estavam fora da listagem**, e duas delas (SIGA ON e VOX
   * ITABUNA) respondiam normalmente e somavam R$ 3.918,82 no mês. As duas tiveram de
   * entrar por script porque não havia caminho na tela.
   *
   * 🔑 A DIFERENÇA PARA `cadastrar` É UMA SÓ: a fonte da verdade sobre a conta.
   * Lá é a fila gravada; aqui é a **sondagem viva**. Tudo o mais — moeda, ignoradas,
   * conta já existente, forma do documento — é a mesma régua, importada, não copiada.
   */
  if (acao === "cadastrarPorId") {
    const cliente = String(corpo.cliente ?? "").trim();
    const gestor = String(corpo.gestor ?? "").trim();
    const nicho = String(corpo.nicho ?? "").trim();
    const tipo = String(corpo.tipo ?? "").trim();

    if (!cliente) return NextResponse.json({ ok: false, erro: "informe o nome comercial" }, { status: 400 });
    if (!ehGestorValido(gestor)) {
      return NextResponse.json({ ok: false, erro: "gestor fora da lista de lib/gestores.ts" }, { status: 400 });
    }

    /**
     * Normaliza ANTES de gastar uma requisição no Meta.
     *
     * ⚠️ CORRIGIDO EM 07/09/2026, exercitando a tela. Este comentário dizia que a
     * normalização é o que salva o **espaço no fim**. Não é: o `accountId` já chega
     * aqui com `.trim()` aplicado na leitura do corpo, uma linha que existe desde
     * antes desta ação. Colar `"act_191616327202757 "` no formulário nunca produziu
     * `100/33` — o espaço morre lá em cima. O que esta normalização de fato cobre é o
     * prefixo (`act_` faltando ou escrito `acct_`) e qualquer coisa que não seja
     * dígito.
     *
     * 🕳️ E a consequência disso é uma que não estava prevista: **o estado
     * `formatoInvalido` de `classificarFalhaSonda` é INALCANÇÁVEL por este
     * formulário.** Tudo que seria `100/33` no Graph é barrado aqui, com a mensagem
     * abaixo. O classificador continua com os três estados porque ele é da SONDA, não
     * da tela — outro chamador pode receber um `100/33` de verdade —, mas ninguém
     * deve esperar ver aquele texto vindo daqui.
     */
    const id = `act_${bareId(accountId)}`;
    if (!/^act_\d{6,}$/.test(id)) {
      return NextResponse.json({
        ok: false,
        erro: "o accountId precisa ser `act_` seguido de pelo menos 6 dígitos — confira o texto colado",
        idNormalizado: id,
      }, { status: 400 });
    }

    // Já cadastrada? Mesma resposta da outra ação: não sobrescreve.
    const refNova = db.collection("contas").doc(id);
    if ((await refNova.get()).exists) {
      return NextResponse.json({ ok: false, erro: "esta conta já está cadastrada" }, { status: 409 });
    }

    /**
     * ⚠️ IGNORADAS BLOQUEIAM AQUI TAMBÉM — e este é o ponto do caminho novo que mais
     * podia passar despercebido. A ação `cadastrar` nunca precisou desta checagem
     * porque a tela já filtra as ignoradas da lista. Colando o id à mão não há lista,
     * e sem isto o registro da NEXA (moeda ARS) e a lápide da conta fantasma
     * `act_191616327202757` deixariam de proteger justamente no caminho que não passa
     * pela fila. O motivo escrito volta INTEIRO: quem decidiu isso escreveu por quê.
     */
    const snapIgn2 = await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).get();
    const jaIgnorada = ((snapIgn2.data()?.contas ?? {}) as Record<string, Ignorada>)[id];
    if (jaIgnorada) {
      return NextResponse.json({
        ok: false,
        erro: "esta conta foi dispensada de propósito — leia o motivo antes de insistir",
        ignorada: { por: jaIgnorada.por, em: jaIgnorada.em, motivo: jaIgnorada.motivo ?? null },
      }, { status: 409 });
    }

    // ---- A SONDAGEM VIVA: consulta direta, nunca a listagem ----
    const s = await sondarIdentidade(id);
    if (!s.acessivelDireto) {
      const v = classificarFalhaSonda(s.codigo, s.subcodigo);
      return NextResponse.json({
        ok: false,
        erro: v.titulo,
        oQueFazer: v.oQueFazer,
        estado: v.estado,
        // O cru vai junto SEMPRE, inclusive quando foi classificado: a classificação
        // é interpretação nossa, e quem for investigar precisa do que a Meta disse.
        metaErro: { codigo: s.codigo, subcodigo: s.subcodigo, mensagem: s.erro },
      }, { status: 400 });
    }

    /**
     * ⚠️ A MESMA `podeCadastrar` DA OUTRA AÇÃO, alimentada pela sonda viva em vez da
     * fila gravada. Reimplementar a regra da moeda aqui criaria duas verdades sobre o
     * que o painel aceita — e foi ela que barrou a NEXA TELECOM (ARS) em 05/09/2026.
     */
    const sintetica: CandidataFila = {
      accountId: id,
      nomeNaMeta: s.nomeNaMeta,
      moeda: s.moeda,
      status: s.status,
      statusRotulo: s.statusRotulo,
      gastoPeriodo: 0,
      diasComGasto: 0,
      ultimoDiaComGasto: null,
      erro: s.erro,
      jaEsteveNaCarteira: false,
      ultimaSincronizacao: null,
    };
    const conf = podeCadastrar(sintetica);
    if (!conf.ok) {
      return NextResponse.json({ ok: false, erro: `não pode ser cadastrada: ${conf.motivo}` }, { status: 400 });
    }

    /**
     * ⚠️ AVISA, NÃO BLOQUEIA — a mesma regra do `jaEsteveNaCarteira`. Ter estado na
     * carteira não é impedimento técnico; é informação que muda o julgamento humano,
     * e o julgamento é o que esta rota nunca decide sozinha.
     */
    const snapRem = await db.collection(COL_SISTEMA).doc(DOC_REMOVIDAS).get();
    const lapide = ((snapRem.data()?.contas ?? {}) as Record<string, { removidaEm?: string; motivo?: string }>)[id] ?? null;

    // Gasto: só depois de passar em tudo, porque é a chamada mais cara das duas.
    const g = await sondarGasto(id, DIAS_GASTO_POR_ID);

    await refNova.set({
      accountId: id,
      cliente,
      gestor,
      nicho: nicho || null,
      tipo: tipo || null,
      pausado: false,
      moeda: s.moeda ?? MOEDA_ACEITA,
      origemCadastro: "tela",
      cadastradaPor: sessao.email,
      cadastradaEm: new Date().toISOString(),
      /**
       * ⚠️ MARCA O CAMINHO, e não é enfeite: conta que entrou por aqui é, por
       * definição, conta que o `me/adaccounts` pode não listar. No dia em que alguém
       * for medir a lacuna da listagem, esta é a única forma de achar essas contas
       * sem refazer a sondagem de todas.
       */
      cadastradaPorIdColado: true,
    }, { merge: true });

    return NextResponse.json({
      ok: true,
      acao: "cadastrarPorId",
      accountId: id,
      cliente,
      gestor,
      nomeNaMeta: s.nomeNaMeta,
      moeda: s.moeda,
      statusRotulo: s.statusRotulo,
      gasto: g.erro ? null : { total: g.total, diasComGasto: g.diasComGasto, ultimo: g.ultimoDiaComGasto },
      // Sai como AVISO na resposta de sucesso — a conta foi cadastrada e a pessoa
      // precisa saber que ela já esteve na carteira e alguém a tirou.
      jaEsteveNaCarteira: !!lapide,
      lapide: lapide ? { removidaEm: lapide.removidaEm ?? null, motivo: lapide.motivo ?? null } : null,
    });
  }

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
