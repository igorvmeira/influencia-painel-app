import { NextResponse } from "next/server";
import { buscarCriativos } from "@/lib/meta";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
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
