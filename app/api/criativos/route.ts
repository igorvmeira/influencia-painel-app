import { NextResponse } from "next/server";
import { buscarCriativos } from "@/lib/meta";
import { getAuthAdmin } from "@/lib/firebaseAdmin";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Exige um usuário autenticado: verifica o ID token do Firebase no servidor.
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

  const accountId = url.searchParams.get("accountId");
  if (!accountId) {
    return NextResponse.json({ erro: "accountId é obrigatório" }, { status: 400 });
  }
  const diasParam = Number(url.searchParams.get("dias"));
  const dias = Number.isFinite(diasParam) && diasParam > 0 ? diasParam : 15;

  try {
    const criativos = await buscarCriativos(accountId, dias);
    return NextResponse.json({ ok: true, accountId, dias, criativos });
  } catch (e) {
    return NextResponse.json(
      { ok: false, erro: e instanceof Error ? e.message : String(e) },
      { status: 502 }
    );
  }
}
