import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

// ROTA TEMPORÁRIA DE DIAGNÓSTICO.
// Objetivo: inspecionar quais campos de limite/orçamento/gasto a Marketing API
// preenche para nossas contas (pós-pago), para decidir sobre qual valor montar
// o futuro alerta de "limite chegando". Não é feature final — remover depois.

// Campos válidos do nó AdAccount relacionados a limite, gasto e funding/billing.
// Campos válidos mas não preenchidos voltam ausentes (viram null abaixo).
const CAMPOS = [
  "name",
  "account_status",
  "currency",
  "spend_cap",
  "amount_spent",
  "balance",
  "min_campaign_group_spend_cap",
  "min_daily_budget",
  "is_prepay_account",
  "disable_reason",
  "funding_source",
  "funding_source_details",
];

export async function GET(req: Request) {
  const url = new URL(req.url);
  const segredo = process.env.CRON_SECRET;
  const chaveUrl = url.searchParams.get("key");
  const autorizado = !segredo || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  if (!TOKEN) {
    return NextResponse.json({ erro: "META_ACCESS_TOKEN não configurado" }, { status: 500 });
  }

  const accountId = url.searchParams.get("accountId")?.trim();
  if (!accountId) {
    return NextResponse.json({ erro: "informe ?accountId=act_XXXX" }, { status: 400 });
  }

  const params = new URLSearchParams({
    fields: CAMPOS.join(","),
    access_token: TOKEN,
  });
  const alvo = `https://graph.facebook.com/${API}/${accountId}?${params}`;

  const res = await fetch(alvo, { cache: "no-store" });
  const bruto = await res.json().catch(() => null);

  if (!res.ok) {
    // Repassa o erro da Meta (sem vazar o token — ele só vai na querystring).
    return NextResponse.json(
      { ok: false, accountId, status: res.status, erroMeta: bruto?.error ?? bruto ?? "erro desconhecido" },
      { status: res.status }
    );
  }

  // Monta a resposta com todos os campos pedidos; ausentes viram null.
  const campos = Object.fromEntries(
    CAMPOS.map((c) => [c, bruto && c in bruto ? bruto[c] : null])
  );

  return NextResponse.json({
    ok: true,
    accountId,
    apiVersion: API,
    campos,
    // Eco do JSON cru da Meta para inspeção completa.
    bruto,
    consultadoEm: new Date().toISOString(),
  });
}
