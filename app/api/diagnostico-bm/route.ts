// TODO REMOVER — rota TEMPORÁRIA (somente leitura) para descobrir a qual Business
// Manager o META_ACCESS_TOKEN pertence. Consulta /me/businesses (e a identidade do
// dono do token). Não escreve, não apaga, não altera nada. Remover após confirmar.

import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

async function meta(path: string, params: Record<string, string>) {
  const p = new URLSearchParams({ ...params, access_token: TOKEN });
  const res = await fetch(`https://graph.facebook.com/${API}/${path}?${p}`, { cache: "no-store" });
  const json = await res.json().catch(() => null);
  if (!res.ok) throw new Error(`Meta API ${res.status}: ${JSON.stringify(json?.error ?? json)}`);
  return json;
}

export async function GET(req: Request) {
  // Mesma proteção do sync (CRON_SECRET; não cria env de segredo).
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }
  if (!TOKEN) {
    return NextResponse.json({ erro: "META_ACCESS_TOKEN não configurado" }, { status: 500 });
  }

  // Identidade do dono do token (system user / usuário).
  let dono: unknown = null;
  let avisoDono: string | null = null;
  try {
    dono = await meta("me", { fields: "id,name" });
  } catch (e) {
    avisoDono = String(e);
  }

  // Business Managers a que o token tem acesso.
  let businesses: { id: string; name?: string }[] = [];
  let avisoBusinesses: string | null = null;
  try {
    const json = await meta("me/businesses", { fields: "id,name", limit: "200" });
    businesses = (json?.data ?? []) as { id: string; name?: string }[];
  } catch (e) {
    avisoBusinesses = String(e);
  }

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    dono,
    // Se houver exatamente 1, é quase certo o Business ID que você quer cadastrar.
    businessIds: businesses.map((b) => b.id),
    businesses,
    dica:
      "Cadastre META_BUSINESS_ID com o 'id' do Business Manager correto. " +
      "Se aparecer mais de um, escolha o que contém as contas de anúncio da carteira.",
    ...(avisoDono ? { avisoDono } : {}),
    ...(avisoBusinesses
      ? {
          avisoBusinesses,
          possivelCausa:
            "Para listar /me/businesses o token precisa da permissão 'business_management'.",
        }
      : {}),
    consultadoEm: new Date().toISOString(),
  });
}
