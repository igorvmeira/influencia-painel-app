import { NextResponse } from "next/server";
import { getDadosDiarios } from "@/lib/data";
import { getAuthAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Dados do painel só para usuários autenticados (verifica o ID token do Firebase).
// Evita expor os dados no HTML/SSR de quem não está logado.
export async function GET(req: Request) {
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth) {
    return NextResponse.json({ erro: "autenticação não configurada" }, { status: 500 });
  }
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ erro: "não autenticado" }, { status: 401 });
  }

  // Erro de leitura do Firestore (cota/rede/permissão) → 503, NUNCA dados de
  // exemplo. O cliente mostra aviso de indisponibilidade, não número falso.
  try {
    const dados = await getDadosDiarios();
    return NextResponse.json({ ok: true, ...dados });
  } catch (e) {
    console.error("[/api/painel] falha ao ler dados:", e);
    return NextResponse.json({ ok: false, erro: "indisponivel" }, { status: 503 });
  }
}
