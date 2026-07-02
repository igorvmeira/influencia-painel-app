import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import seed from "@/data/contas-seed.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450; // abaixo do limite de 500 operações por batch do Firestore

interface ContaSeed {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: string;
  nicho?: string;
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) {
    return NextResponse.json({ erro: "não autorizado" }, { status: 401 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const contas = (seed as ContaSeed[]).filter((c) => c && c.accountId);
  const col = db.collection("contas");

  // 1) Apaga todos os documentos existentes (remove contas de teste antigas).
  const existentes = await col.get();
  let removidas = 0;
  for (let i = 0; i < existentes.docs.length; i += LOTE) {
    const batch = db.batch();
    for (const doc of existentes.docs.slice(i, i + LOTE)) batch.delete(doc.ref);
    await batch.commit();
    removidas += Math.min(LOTE, existentes.docs.length - i);
  }

  // 2) Grava um documento por conta do seed, usando o accountId como docId.
  let importadas = 0;
  for (let i = 0; i < contas.length; i += LOTE) {
    const batch = db.batch();
    for (const c of contas.slice(i, i + LOTE)) {
      batch.set(col.doc(c.accountId), {
        accountId: c.accountId,
        cliente: c.cliente,
        gestor: c.gestor,
        tipo: c.tipo,
        nicho: c.nicho ?? "",
      });
    }
    await batch.commit();
    importadas += Math.min(LOTE, contas.length - i);
  }

  return NextResponse.json({ ok: true, importadas, removidas });
}
