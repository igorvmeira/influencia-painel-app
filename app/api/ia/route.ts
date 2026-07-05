import { NextResponse } from "next/server";
import Anthropic from "@anthropic-ai/sdk";
import { getAuthAdmin } from "@/lib/firebaseAdmin";
import { montarContextoIA } from "@/lib/iaContexto";
import { MARCA } from "@/lib/brand";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const MODELO = "claude-sonnet-4-6";
const MAX_TOKENS = 1024;        // teto de saída (segura custo)
const MAX_MENSAGENS = 10;       // teto de histórico da conversa enviado
const MAX_CHARS_MSG = 2000;     // teto por mensagem

interface Mensagem { role: "user" | "assistant"; content: string }

export async function POST(req: Request) {
  // 1) DESLIGADO por padrão: sem ANTHROPIC_API_KEY não chama a Claude (custo zero).
  const chave = process.env.ANTHROPIC_API_KEY;
  if (!chave) {
    return NextResponse.json({ ok: false, desligado: true, erro: "módulo de IA desligado" });
  }

  // 2) Proteção de verdade: exige sessão válida do Firebase (mesmo padrão de /api/painel).
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth) {
    return NextResponse.json({ ok: false, erro: "autenticação não configurada" }, { status: 500 });
  }
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }

  // 3) Entrada.
  let corpo: { mensagens?: Mensagem[]; periodoDias?: number };
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }

  const periodoDias = Number(corpo.periodoDias) > 0 ? Math.floor(Number(corpo.periodoDias)) : 15;
  const historico: Mensagem[] = (corpo.mensagens ?? [])
    .filter((m) => (m.role === "user" || m.role === "assistant") && typeof m.content === "string" && m.content.trim().length > 0)
    .slice(-MAX_MENSAGENS)
    .map((m) => ({ role: m.role, content: m.content.slice(0, MAX_CHARS_MSG) }));
  if (!historico.length) {
    return NextResponse.json({ ok: false, erro: "sem mensagem" }, { status: 400 });
  }

  // 4) Contexto enxuto (agregados do período) + prompt do sistema.
  const contexto = await montarContextoIA(periodoDias);
  const sistema =
    `Você é o ${MARCA.assistente}, assistente de performance de tráfego pago da agência ${MARCA.agencia}. ` +
    `Responda em português do Brasil, prático e direto, como um analista de tráfego falando com gestores. ` +
    `REGRAS INVIOLÁVEIS: use SOMENTE os dados do contexto; NUNCA invente números, contas, gestores, CPL ou valores; ` +
    `se o dado não estiver no contexto, diga que não tem essa informação. Valores em R$. ` +
    `Seja conciso e foque no que ajuda o gestor a agir.\n\n` +
    `## DADOS DISPONÍVEIS (única fonte de verdade)\n${contexto}`;

  // 5) Chamada à Claude (Sonnet 4.6). Thinking desligado para segurar custo.
  const client = new Anthropic({ apiKey: chave });
  try {
    const resp = await client.messages.create({
      model: MODELO,
      max_tokens: MAX_TOKENS,
      thinking: { type: "disabled" },
      system: sistema,
      messages: historico,
    });
    const resposta = resp.content.map((b) => (b.type === "text" ? b.text : "")).join("").trim();
    return NextResponse.json({ ok: true, resposta });
  } catch (e) {
    return NextResponse.json({ ok: false, erro: "falha ao consultar a IA", detalhe: String(e) }, { status: 502 });
  }
}
