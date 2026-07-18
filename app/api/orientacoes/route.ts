import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import { EntradaOrientacao } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // firebase-admin
export const maxDuration = 60;

const MAX_TEXTO = 500;
const MAX_HISTORICO = 50;

// Remove caracteres de controle (mantém \t=9, \n=10, \r=13; descarta DEL=127).
function sanitizar(s: string): string {
  let out = "";
  for (const ch of s) {
    const c = ch.charCodeAt(0);
    if (c === 9 || c === 10 || c === 13 || (c >= 32 && c !== 127)) out += ch;
  }
  return out.trim();
}

// Verifica o ID token do Firebase e devolve o e-mail (autor). Sem sessão → null.
async function autenticar(req: Request): Promise<{ email: string } | null> {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth || !token) return null;
  try {
    const dec = await adminAuth.verifyIdToken(token);
    return { email: dec.email || dec.uid }; // autor SEMPRE do token, nunca do corpo
  } catch {
    return null;
  }
}

// Firestore Timestamp → ISO (ou passa string, ou null).
function emISO(v: unknown): string | null {
  if (v && typeof (v as { toDate?: unknown }).toDate === "function") return (v as Timestamp).toDate().toISOString();
  return typeof v === "string" ? v : null;
}
function normalizar(e: any): EntradaOrientacao | null {
  if (!e || typeof e.texto !== "string") return null;
  return { texto: e.texto, autor: e.autor ?? "", em: emISO(e.em) ?? "" };
}

export async function GET(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const url = new URL(req.url);
  const accountId = url.searchParams.get("accountId")?.trim();

  // DEGRADAÇÃO: se a leitura falhar (cota/rede) OU a coleção não existir, devolve
  // vazio (200) — nunca 500. Assim o dashboard renderiza sem os ícones, sem quebrar.
  try {
    // Modo por conta: traz atual + HISTÓRICO (sob demanda).
    if (accountId) {
      const snap = await db.collection("orientacoes").doc(accountId).get();
      const data = snap.exists ? snap.data() : null;
      return NextResponse.json({
        ok: true,
        accountId,
        atual: normalizar(data?.atual),
        historico: ((data?.historico ?? []) as any[]).map(normalizar).filter(Boolean),
      });
    }

    // Modo lista: SÓ a orientação atual de cada conta (leve).
    const col = await db.collection("orientacoes").get();
    const orientacoes = col.docs.map((d) => {
      const data = d.data();
      return { accountId: (data.accountId as string) || d.id, atual: normalizar(data.atual) };
    });
    return NextResponse.json({ ok: true, orientacoes });
  } catch (e) {
    console.error("[/api/orientacoes] leitura falhou (degradando p/ vazio):", e);
    return accountId
      ? NextResponse.json({ ok: true, accountId, atual: null, historico: [] })
      : NextResponse.json({ ok: true, orientacoes: [] });
  }
}

export async function POST(req: Request) {
  const sessao = await autenticar(req);
  if (!sessao) return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  let corpo: { accountId?: unknown; texto?: unknown };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }

  const accountId = typeof corpo.accountId === "string" ? corpo.accountId.trim() : "";
  const texto = sanitizar(typeof corpo.texto === "string" ? corpo.texto : "");

  if (!accountId) return NextResponse.json({ ok: false, erro: "accountId obrigatório" }, { status: 400 });
  if (!texto) return NextResponse.json({ ok: false, erro: "texto vazio" }, { status: 400 });
  if (texto.length > MAX_TEXTO) return NextResponse.json({ ok: false, erro: `texto acima de ${MAX_TEXTO} caracteres` }, { status: 400 });

  // A conta precisa existir no de-para (contas). docId = accountId; fallback por campo.
  let existe = (await db.collection("contas").doc(accountId).get()).exists;
  if (!existe) {
    const q = await db.collection("contas").where("accountId", "==", accountId).limit(1).get();
    existe = !q.empty;
  }
  if (!existe) return NextResponse.json({ ok: false, erro: "conta não encontrada no de-para" }, { status: 400 });

  const ref = db.collection("orientacoes").doc(accountId);
  const agora = Timestamp.now(); // relógio do servidor (serverTimestamp não vale em array)
  const entrada = { texto, autor: sessao.email, em: agora };

  await db.runTransaction(async (tx) => {
    const snap = await tx.get(ref);
    const data = snap.exists ? snap.data() : null;
    const atualAnterior = data?.atual ?? null;
    const historicoAnterior: any[] = Array.isArray(data?.historico) ? data!.historico : [];
    // A atual anterior vai pro topo do histórico; corta em MAX_HISTORICO.
    const novoHistorico = (atualAnterior ? [atualAnterior, ...historicoAnterior] : historicoAnterior).slice(0, MAX_HISTORICO);
    tx.set(ref, { accountId, atual: entrada, historico: novoHistorico });
  });

  return NextResponse.json({
    ok: true,
    atual: { texto, autor: sessao.email, em: agora.toDate().toISOString() },
  });
}
