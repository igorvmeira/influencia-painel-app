import { NextResponse } from "next/server";
import { buscarCriativos } from "@/lib/meta";
import { getAuthAdmin } from "@/lib/firebaseAdmin";
import { getDadosDiarios } from "@/lib/data";
import { gastoPorContaNoPeriodo } from "@/lib/painel";
import { Criativo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Máximo de contas consultadas ao vivo por nicho por requisição (as de maior gasto).
const MAX_CONTAS_POR_NICHO = 12;

const nichoDe = (n?: string) => (n && n.trim()) || "Sem nicho";

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

  const diasParam = Number(url.searchParams.get("dias"));
  const dias = Number.isFinite(diasParam) && diasParam > 0 ? diasParam : 15;

  const nicho = url.searchParams.get("nicho");
  const accountId = url.searchParams.get("accountId");

  // --- Ranking por NICHO: várias contas ao vivo ---
  if (nicho) {
    const { daily, contas } = await getDadosDiarios();
    const gastos = gastoPorContaNoPeriodo(daily, dias);
    const contasNicho = contas
      .filter((c) => nichoDe(c.nicho) === nicho)
      .sort((a, b) => (gastos.get(b.accountId) ?? 0) - (gastos.get(a.accountId) ?? 0))
      .slice(0, MAX_CONTAS_POR_NICHO);

    if (contasNicho.length === 0) {
      return NextResponse.json({ ok: true, nicho, dias, contas: 0, criativos: [], erros: [] });
    }

    // Busca em paralelo; contas que falharem não derrubam o restante.
    const resultados = await Promise.allSettled(
      contasNicho.map(async (c) => {
        const crs = await buscarCriativos(c.accountId, dias);
        return crs.map((cr) => ({ ...cr, cliente: c.cliente }));
      })
    );

    const criativos: Criativo[] = [];
    const erros: { accountId: string; erro: string }[] = [];
    resultados.forEach((r, i) => {
      if (r.status === "fulfilled") criativos.push(...r.value);
      else erros.push({ accountId: contasNicho[i].accountId, erro: String(r.reason) });
    });

    return NextResponse.json({ ok: true, nicho, dias, contas: contasNicho.length, criativos, erros });
  }

  // --- Ranking por CLIENTE (uma conta) ---
  if (!accountId) {
    return NextResponse.json({ erro: "informe accountId ou nicho" }, { status: 400 });
  }
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
