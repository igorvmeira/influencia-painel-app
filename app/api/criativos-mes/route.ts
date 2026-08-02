import { NextResponse } from "next/server";
import { getAuthAdmin, getDb } from "@/lib/firebaseAdmin";
import { buscarCriativosPeriodo, buscarThumbnails } from "@/lib/meta";
import { Criativo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// ===========================================================================
// Criativos de um MÊS FECHADO — cache PERMANENTE por (accountId, ano-mês).
// ===========================================================================
//
// Mês fechado nunca muda: o doc é imutável e sempre válido, então não há TTL.
// Isso não é só otimização — a API do Meta retroage 37 meses, e o agregado só
// guarda ~95 dias. Passado esse prazo, este doc é o ÚNICO lugar onde o histórico
// de criativos sobrevive. Por isso guardamos TODOS os anúncios, não só os
// extremos: mudar o critério depois (top 3, outro piso) não exige re-consulta,
// e re-consultar deixa de ser possível.
//
// Volume medido em julho/2026: 3,7 KB por doc em média, 12,3 KB no maior
// (NEXT, 106 anúncios) — 83x abaixo do limite de 1 MiB do Firestore.
// 72 docs/mês, ~3 MB/ano. Sem poda prevista; se um dia incomodar, poda por
// idade é trivial de acrescentar.
//
// MINIATURAS NÃO SÃO PERSISTIDAS. As URLs do Meta são assinadas e expiram —
// guardá-las num doc que nunca é reescrito daria imagem quebrada meses depois,
// num relatório de bonificação. São buscadas ao vivo, best-effort.

const COL = "criativosMes";
const docIdDe = (accountId: string, ano: number, mes: number) =>
  `${accountId}_${ano}-${String(mes).padStart(2, "0")}`;

const diasNoMes = (ano: number, mes: number) => new Date(Date.UTC(ano, mes, 0)).getUTCDate();

export async function GET(req: Request) {
  const url = new URL(req.url);

  // Tela autenticada: mesmo padrão do /api/criativos.
  const authHeader = req.headers.get("authorization") || "";
  const token = authHeader.startsWith("Bearer ") ? authHeader.slice(7) : "";
  const adminAuth = getAuthAdmin();
  if (!adminAuth) return NextResponse.json({ erro: "autenticação não configurada" }, { status: 500 });
  try {
    await adminAuth.verifyIdToken(token);
  } catch {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }

  const accountId = (url.searchParams.get("accountId") || "").trim();
  const ano = Number(url.searchParams.get("ano"));
  const mes = Number(url.searchParams.get("mes"));
  if (!accountId || !Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12) {
    return NextResponse.json({ ok: false, erro: "informe accountId, ano e mes (1-12)" }, { status: 400 });
  }

  // GUARDA: só mês FECHADO pode ser cacheado. Sem isto, uma chamada no meio do mês
  // congelaria dados parciais para sempre num doc que nunca mais é reescrito.
  const ultimoDia = new Date(Date.UTC(ano, mes - 1, diasNoMes(ano, mes)));
  if (ultimoDia.getTime() >= Date.now()) {
    return NextResponse.json(
      { ok: false, erro: "mês ainda não fechou — o cache só vale para mês fechado" },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const ref = db.collection(COL).doc(docIdDe(accountId, ano, mes));
  const pad = (n: number) => String(n).padStart(2, "0");
  const since = `${ano}-${pad(mes)}-01`;
  const until = `${ano}-${pad(mes)}-${pad(diasNoMes(ano, mes))}`;

  let criativos: Criativo[];
  let doCache = false;

  const snap = await ref.get();
  if (snap.exists && Array.isArray(snap.data()?.criativos)) {
    criativos = snap.data()!.criativos as Criativo[];
    doCache = true;
  } else {
    try {
      criativos = await buscarCriativosPeriodo(accountId, since, until);
    } catch (e) {
      return NextResponse.json(
        { ok: false, erro: e instanceof Error ? e.message : String(e) },
        { status: 502 }
      );
    }
    // Grava mesmo quando vem vazio: "esta conta não veiculou neste mês" também é
    // resposta, e sem o doc a próxima visita repetiria a chamada à API à toa.
    await ref.set({
      accountId, ano, mes, since, until,
      criativos,
      atualizadoEm: new Date().toISOString(),
    });
  }

  // Miniaturas AO VIVO, sempre — nunca vêm do cache (ver comentário no topo).
  const thumbs = await buscarThumbnails(accountId);
  const comThumb = criativos.map((c) => ({ ...c, thumbnailUrl: thumbs[c.adId] ?? null }));

  return NextResponse.json({
    ok: true,
    accountId, ano, mes, since, until,
    doCache,                       // true = não custou chamada de insights
    total: comThumb.length,
    comThumbnail: comThumb.filter((c) => c.thumbnailUrl).length,
    criativos: comThumb,
  });
}
