import { NextResponse } from "next/server";
import { getAuthAdmin } from "@/lib/firebaseAdmin";
import { getContas } from "@/lib/data";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Só o de-para de contas (leve). Para telas que não precisam das métricas diárias
// (ex.: /orientacoes) — evita reler os ~4.6k docs de metricasDiarias.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth) return NextResponse.json({ ok: false, erro: "autenticação não configurada" }, { status: 500 });
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }

  try {
    const contas = await getContas();
    return NextResponse.json({ ok: true, contas });
  } catch (e) {
    console.error("[/api/contas] falha ao ler contas:", e);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}
