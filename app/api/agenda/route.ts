import { NextResponse } from "next/server";
import { getAuthAdmin } from "@/lib/firebaseAdmin";
import { buscarReunioes } from "@/lib/googleAgenda";

export const dynamic = "force-dynamic";
export const runtime = "nodejs"; // crypto (JWT) e firebase-admin
export const maxDuration = 60;

// Janela padrão e teto de resultados (fácil de ajustar aqui no topo).
const DIAS_JANELA = 15;
const MAX_RESULTS = 250;

export async function GET(req: Request) {
  // Proteção de verdade: exige sessão válida do Firebase (mesmo padrão do /api/ia).
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth) return NextResponse.json({ ok: false, erro: "autenticação não configurada" }, { status: 500 });
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }

  const calendarId = process.env.GOOGLE_CALENDAR_ID || "";
  if (!calendarId) {
    return NextResponse.json({ ok: false, erro: "GOOGLE_CALENDAR_ID não configurado na Vercel." }, { status: 500 });
  }

  try {
    const reunioes = await buscarReunioes(calendarId, DIAS_JANELA, MAX_RESULTS);
    return NextResponse.json({ ok: true, janelaDias: DIAS_JANELA, reunioes });
  } catch (e) {
    const msg = String(e);
    const erro = msg.includes(":404:")
      ? "calendário não encontrado ou não compartilhado com a conta de serviço."
      : msg.includes(":403:")
        ? "sem permissão para ler o calendário (compartilhe com a conta de serviço)."
        : msg.includes("Credenciais Google ausentes")
          ? "credenciais Google não configuradas."
          : msg.startsWith("Error: TOKEN:") || msg.includes("TOKEN:")
            ? "não foi possível autenticar a conta de serviço (verifique GOOGLE_PRIVATE_KEY)."
            : "falha ao consultar a agenda.";
    return NextResponse.json({ ok: false, erro, detalhe: msg }, { status: 502 });
  }
}
