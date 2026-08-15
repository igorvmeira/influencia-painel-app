import { NextResponse } from "next/server";
import { getDb, getAuthAdmin } from "@/lib/firebaseAdmin";
import type { AgregadoComercial } from "@/lib/comercialAgregado";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * O funil comercial para a tela — **UMA leitura de Firestore**.
 *
 * ⚠️ Lê SÓ o doc pré-agregado, nunca as coleções granulares. Montar isto na hora
 * custaria ~7.500 leituras por visita (4.862 oportunidades + 2.653 pessoas), o que
 * derruba o app no plano grátis e vira dinheiro no Blaze. O agregado é gravado no
 * /api/comercial/sync; se ele não existir, a tela avisa — não improvisa.
 */
const COL = "comercial_agregados";
const DOC = "funil";

/** Cache de servidor. O agregado só muda quando o sync roda. */
const TTL_MS = 5 * 60 * 1000;
let cache: { em: number; dados: AgregadoComercial } | null = null;

async function autenticar(req: Request): Promise<boolean> {
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth || !token) return false;
  try {
    await adminAuth.verifyIdToken(token);
    return true;
  } catch {
    return false;
  }
}

export async function GET(req: Request) {
  if (!(await autenticar(req))) {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }

  if (cache && Date.now() - cache.em < TTL_MS) {
    return NextResponse.json({ ok: true, agregado: cache.dados, doCache: true });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });

  try {
    const snap = await db.collection(COL).doc(DOC).get();
    // ⚠️ Coleção/doc que ainda não existe NÃO é erro 500: é "o sync ainda não
    // rodou". A tela mostra o aviso e continua de pé — dado de exemplo aqui seria
    // pior que tela vazia (regra do CLAUDE.md).
    if (!snap.exists) {
      return NextResponse.json({ ok: true, agregado: null, motivo: "sync ainda não rodou" });
    }
    const dados = snap.data() as AgregadoComercial;
    cache = { em: Date.now(), dados };
    return NextResponse.json({ ok: true, agregado: dados, doCache: false });
  } catch (e) {
    console.error("[/api/comercial/funil] falha ao ler o agregado:", e);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}
