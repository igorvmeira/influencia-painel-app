import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import { getContas, invalidarCacheContas } from "@/lib/data";
import { ehGestorValido } from "@/lib/gestores";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Teto defensivo do histórico de gestor (mesmo espírito do histórico de orientações).
const MAX_HISTORICO_GESTOR = 50;

// Verifica o ID token do Firebase e devolve o e-mail (autor). Sem sessão → null.
// Autor SEMPRE do token decodificado, nunca do corpo (senão dá para forjar).
async function autenticar(req: Request): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth || !token) return null;
  try {
    const dec = await adminAuth.verifyIdToken(token);
    return { email: dec.email || dec.uid };
  } catch {
    return null;
  }
}

// Só o de-para de contas (leve). Para telas que não precisam das métricas diárias
// (ex.: /orientacoes, /carteira) — evita reler os ~4.6k docs de metricasDiarias.
export async function GET(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  try {
    const contas = await getContas();
    return NextResponse.json({ ok: true, contas });
  } catch (e) {
    console.error("[/api/contas] falha ao ler contas:", e);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}

// Edita o gestor responsável por uma conta (feature de escrita da /carteira).
// - Grava no formato DATADO: além do campo `gestor` atual (que o dashboard lê), empilha
//   em `gestorHistorico` um registro { gestor, desde, por, em } — append-only, nunca apaga.
// - Na 1ª edição de uma conta, SEMEIA o registro inicial: o gestor atual como dono
//   "desde sempre" (desde: null). Sem backfill em massa — só quando a conta é editada.
// - Carimba `gestorEditadoEm`/`gestorEditadoPor`. A partir daí o /api/import-contas PULA
//   o campo gestor desta conta.
//   ATENÇÃO: o carimbo é IRREVERSÍVEL pela ferramenta. Para a conta voltar a seguir o
//   gestor do JSON do import, é preciso APAGAR MANUALMENTE os campos gestorEditadoEm e
//   gestorEditadoPor no Console do Firebase (Firestore > contas > doc da conta).
export async function POST(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  let corpo: { accountId?: unknown; gestor?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }

  const accountId = typeof corpo.accountId === "string" ? corpo.accountId.trim() : "";
  const gestor = typeof corpo.gestor === "string" ? corpo.gestor.trim() : "";

  if (!accountId) return NextResponse.json({ ok: false, erro: "accountId obrigatório" }, { status: 400 });
  // Guard anti-typo/forja: só aceita gestor da lista canônica (lib/gestores).
  if (!ehGestorValido(gestor)) return NextResponse.json({ ok: false, erro: "gestor inválido" }, { status: 400 });

  // Resolve o doc da conta por accountId. docId costuma ser o accountId (docs novos),
  // mas há fallback por campo para docs antigos com outro docId (join sempre por ID).
  let ref = db.collection("contas").doc(accountId);
  const primeiro = await ref.get();
  if (!primeiro.exists) {
    const q = await db.collection("contas").where("accountId", "==", accountId).limit(1).get();
    if (q.empty) return NextResponse.json({ ok: false, erro: "conta não encontrada no de-para" }, { status: 400 });
    ref = q.docs[0].ref;
  }

  const agora = Timestamp.now(); // relógio do servidor (serverTimestamp não vale dentro de array)

  const resultado = await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.data() ?? {};
    const gestorAtual = (data.gestor as string) ?? "";

    // No-op: escolher o gestor que já está gravado não empilha histórico nem carimba.
    if (gestorAtual === gestor) {
      return { gestor, anterior: gestorAtual, por: sessao.email, em: agora.toDate().toISOString(), semMudanca: true };
    }

    const historicoAnterior = Array.isArray(data.gestorHistorico) ? (data.gestorHistorico as unknown[]) : null;
    // 1ª edição desta conta: semeia o gestor atual como dono "desde sempre".
    const base = historicoAnterior ?? [{ gestor: gestorAtual, desde: null, por: "sistema", em: agora }];
    const entrada = { gestor, desde: agora, por: sessao.email, em: agora };
    // Mais recente primeiro; corta no teto defensivo.
    const novoHistorico = [entrada, ...base].slice(0, MAX_HISTORICO_GESTOR);

    tx.set(
      ref,
      { gestor, gestorHistorico: novoHistorico, gestorEditadoEm: agora, gestorEditadoPor: sessao.email },
      { merge: true } // não apaga outros campos da conta (cliente, nicho, pausado…)
    );
    return { gestor, anterior: gestorAtual, por: sessao.email, em: agora.toDate().toISOString() };
  });

  invalidarCacheContas(); // best-effort (ver comentário em lib/data.ts)
  return NextResponse.json({ ok: true, ...resultado });
}
