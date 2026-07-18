// TODO REMOVER — rota TEMPORÁRIA de diagnóstico (somente leitura).
// Testa se a conta de serviço do Google consegue LER um calendário do Google
// Agenda e mostra os campos reais dos eventos (próximos 30 dias). Não escreve,
// não cria e não apaga nada. Passo de validação antes da aba "Reuniões".

import crypto from "crypto";
import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // precisa do crypto para assinar o JWT (RS256)
export const maxDuration = 60;

const ESCOPO = "https://www.googleapis.com/auth/calendar.readonly";

const b64url = (buf: Buffer | string) =>
  Buffer.from(buf).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function tipoDe(v: unknown): string {
  if (v === null) return "null";
  if (v === undefined) return "undefined";
  if (Array.isArray(v)) return "array";
  if (typeof v === "object") return "object";
  return typeof v;
}

// Assina o JWT da conta de serviço e troca por um access_token (só leitura).
async function obterAccessToken(email: string, privateKey: string): Promise<string> {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claim = b64url(JSON.stringify({
    iss: email,
    scope: ESCOPO,
    aud: "https://oauth2.googleapis.com/token",
    iat: now,
    exp: now + 3600,
  }));
  const unsigned = `${header}.${claim}`;
  const assinatura = b64url(crypto.createSign("RSA-SHA256").update(unsigned).sign(privateKey));
  const jwt = `${unsigned}.${assinatura}`;

  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });
  const j = await res.json().catch(() => null);
  if (!res.ok || !j?.access_token) {
    throw new Error(`TOKEN:${res.status}:${JSON.stringify(j?.error_description ?? j?.error ?? j)}`);
  }
  return j.access_token as string;
}

// Traduz falhas comuns dessa integração para português.
function explicar(status: number, corpo: unknown): string {
  const txt = JSON.stringify(corpo ?? "");
  if (status === 401) return "chave/credencial inválida (verifique GOOGLE_PRIVATE_KEY e o e-mail da conta de serviço).";
  if (status === 404) return "calendário não encontrado: id errado, ou o calendário não foi compartilhado com o e-mail da conta de serviço.";
  if (status === 403) {
    if (txt.includes("has not been used") || txt.includes("disabled")) return "a API do Google Agenda não está habilitada no projeto do Google Cloud.";
    return "sem permissão: compartilhe o calendário com o e-mail da conta de serviço (permissão de 'Ver detalhes de todos os eventos').";
  }
  return `falha ${status}: ${txt}`;
}

export async function GET(req: Request) {
  // Proteção: mesmo segredo do sync (CRON_SECRET; não cria env de segredo).
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "";
  // A private key vem com "\n" escapado na env → converte para quebra de linha real.
  const privateKey = (process.env.GOOGLE_PRIVATE_KEY || "").replace(/\\n/g, "\n");
  if (!email || !privateKey) {
    return NextResponse.json(
      { ok: false, erro: "GOOGLE_SERVICE_ACCOUNT_EMAIL e/ou GOOGLE_PRIVATE_KEY não configurados na Vercel." },
      { status: 500 }
    );
  }

  const calendarId = url.searchParams.get("calendarId")?.trim();
  if (!calendarId) {
    return NextResponse.json(
      { ok: false, erro: "informe ?calendarId=... (o ID do Google Agenda a testar, ex.: fulano@grupo.com ou o id longo @group.calendar.google.com)." },
      { status: 400 }
    );
  }

  // 1) Access token (só leitura).
  let accessToken: string;
  try {
    accessToken = await obterAccessToken(email, privateKey);
  } catch (e) {
    const msg = String(e);
    const motivo = msg.startsWith("TOKEN:")
      ? "não foi possível autenticar a conta de serviço — chave inválida ou e-mail errado (confira o replace do \\n na GOOGLE_PRIVATE_KEY)."
      : msg;
    return NextResponse.json({ ok: false, etapa: "autenticacao", erro: motivo, detalhe: msg }, { status: 502 });
  }

  const headers = { Authorization: `Bearer ${accessToken}` };
  const enc = encodeURIComponent(calendarId);

  // 2) Metadados do calendário (nome + fuso).
  const calRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc}`, { headers, cache: "no-store" });
  const calJson = await calRes.json().catch(() => null);
  if (!calRes.ok) {
    return NextResponse.json(
      { ok: false, etapa: "calendario", status: calRes.status, erro: explicar(calRes.status, calJson?.error), detalhe: calJson?.error ?? null },
      { status: calRes.status }
    );
  }

  // 3) Eventos dos próximos 30 dias (somente leitura).
  const agora = new Date();
  const em30 = new Date(agora.getTime() + 30 * 86400000);
  const qs = new URLSearchParams({
    timeMin: agora.toISOString(),
    timeMax: em30.toISOString(),
    singleEvents: "true",   // expande recorrências
    orderBy: "startTime",
    maxResults: "2500",
  });
  const evRes = await fetch(`https://www.googleapis.com/calendar/v3/calendars/${enc}/events?${qs}`, { headers, cache: "no-store" });
  const evJson = await evRes.json().catch(() => null);
  if (!evRes.ok) {
    return NextResponse.json(
      { ok: false, etapa: "eventos", status: evRes.status, erro: explicar(evRes.status, evJson?.error), detalhe: evJson?.error ?? null },
      { status: evRes.status }
    );
  }

  const eventos: Record<string, unknown>[] = evJson?.items ?? [];
  const exemplo = eventos[0] ?? null;
  const camposExemplo = exemplo
    ? Object.entries(exemplo).map(([campo, v]) => ({ campo, tipo: tipoDe(v) }))
    : [];

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    escopo: ESCOPO,
    calendario: {
      id: calJson?.id ?? calendarId,
      nome: calJson?.summary ?? null,
      descricao: calJson?.description ?? null,
      fusoHorario: calJson?.timeZone ?? null,
    },
    janela: { de: agora.toISOString(), ate: em30.toISOString() },
    quantidadeEventos: eventos.length,
    // 5 primeiros eventos com TODOS os campos, pra você ver o que existe.
    primeirosEventos: eventos.slice(0, 5),
    camposDeUmEvento: camposExemplo,
    consultadoEm: new Date().toISOString(),
  });
}
