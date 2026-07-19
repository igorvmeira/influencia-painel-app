// TODO REMOVER — rota TEMPORÁRIA de carga inicial das orientações (da planilha).
// Prévia por padrão (?key=CRON_SECRET); grava só com &aplicar=1. Idempotente por
// accountId e NÃO-DESTRUTIVA: nunca sobrescreve orientação já existente no painel.
// Remover após a carga.

import { NextResponse } from "next/server";
import { Timestamp } from "firebase-admin/firestore";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import seed from "@/data/orientacoes-seed.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450;
const MAX_TEXTO = 500;
const AUTOR = "Importado da planilha"; // deixa claro na tela que veio do Monitoramento

interface OrientacaoSeed {
  accountId: string;
  cliente: string;
  gestor: string;
  texto: string;
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const aplicar = url.searchParams.get("aplicar") === "1";
  const itens = (seed as OrientacaoSeed[]).filter((o) => o && o.accountId && o.texto && o.texto.trim());

  // Contas existentes (para não criar orientação órfã) e orientações já existentes.
  const [contasSnap, oriSnap] = await Promise.all([
    db.collection("contas").get(),
    db.collection("orientacoes").get(),
  ]);
  const contasSet = new Set(contasSnap.docs.map((d) => (d.data().accountId as string) || d.id));
  const jaExiste = new Set(oriSnap.docs.map((d) => (d.data().accountId as string) || d.id));

  const criadas: { accountId: string; cliente: string }[] = [];
  const puladasJaExiste: { accountId: string; cliente: string }[] = [];
  const puladasSemConta: { accountId: string; cliente: string }[] = [];
  const puladasDuplicadaSeed: { accountId: string; cliente: string }[] = [];
  const vistos = new Set<string>();

  for (const o of itens) {
    const rot = { accountId: o.accountId, cliente: o.cliente ?? "" };
    if (vistos.has(o.accountId)) { puladasDuplicadaSeed.push(rot); continue; }
    vistos.add(o.accountId);
    if (!contasSet.has(o.accountId)) { puladasSemConta.push(rot); continue; }
    if (jaExiste.has(o.accountId)) { puladasJaExiste.push(rot); continue; } // NUNCA sobrescreve
    criadas.push(rot);
  }

  // Aplica: cria a orientação atual (histórico vazio) só das novas.
  let gravadas = 0;
  if (aplicar && criadas.length) {
    const col = db.collection("orientacoes");
    for (let i = 0; i < criadas.length; i += LOTE) {
      const batch = db.batch();
      for (const { accountId } of criadas.slice(i, i + LOTE)) {
        const o = itens.find((x) => x.accountId === accountId)!;
        batch.set(col.doc(accountId), {
          accountId,
          atual: { texto: o.texto.trim().slice(0, MAX_TEXTO), autor: AUTOR, em: Timestamp.now() },
          historico: [],
        });
      }
      await batch.commit();
      gravadas += Math.min(LOTE, criadas.length - i);
    }
  }

  return NextResponse.json({
    ok: true,
    modo: aplicar ? "aplicar" : "previa",
    autor: AUTOR,
    totalNaFonte: itens.length,
    resumo: {
      criadas: criadas.length,
      puladasJaExiste: puladasJaExiste.length,
      puladasSemConta: puladasSemConta.length,
      puladasDuplicadaSeed: puladasDuplicadaSeed.length,
      gravadas: aplicar ? gravadas : 0,
    },
    criadas,
    puladasJaExiste,
    puladasSemConta,
    puladasDuplicadaSeed,
    ...(aplicar ? { aplicadoEm: new Date().toISOString() } : {}),
  });
}
