import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import fonte from "@/data/contas.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450; // abaixo do limite de 500 operações por batch do Firestore

// Lista oficial da carteira. Preencha data/contas.json e rode esta rota de novo
// sempre que a carteira mudar (idempotente e não-destrutiva).
interface ContaFonte {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: string;
  nicho?: string;
  pausado?: boolean;
}

// Campos gravados no de-para (merge — não apaga outros campos existentes).
function payloadDe(c: ContaFonte) {
  return {
    accountId: c.accountId,
    cliente: c.cliente ?? "",
    gestor: c.gestor ?? "",
    tipo: c.tipo ?? "",
    nicho: c.nicho ?? "",
    pausado: !!c.pausado, // sem o campo na fonte => false
    ativo: true,
  };
}

// Quais dos campos gravados mudariam em relação ao doc existente.
function camposQueMudam(existente: Record<string, unknown>, c: ContaFonte): string[] {
  const alvo = payloadDe(c);
  const campos: string[] = [];
  for (const k of ["cliente", "gestor", "tipo", "nicho"] as const) {
    if ((existente[k] ?? "") !== alvo[k]) campos.push(k);
  }
  if (!!existente.pausado !== alvo.pausado) campos.push("pausado");
  if (existente.ativo !== true) campos.push("ativo");
  return campos;
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const aplicar = url.searchParams.get("aplicar") === "1";

  // Fonte oficial (ignora itens sem accountId).
  const itens = (fonte as ContaFonte[]).filter((c) => c && c.accountId);
  const col = db.collection("contas");

  // De-para atual. Indexa PELO CAMPO accountId (não assume o formato do docId).
  const snap = await col.get();
  const porAccountId = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const chave = (data.accountId as string) || d.id;
    porAccountId.set(chave, { id: d.id, data });
  }

  const idsFonte = new Set(itens.map((c) => c.accountId));

  const criadas: { accountId: string; cliente: string; gestor: string }[] = [];
  const atualizadas: { accountId: string; cliente: string; campos: string[] }[] = [];
  const inalteradas: { accountId: string; cliente: string }[] = [];
  // Fila de gravações (aplicada só no modo aplicar).
  const gravacoes: { docId: string; dados: ReturnType<typeof payloadDe> }[] = [];

  for (const c of itens) {
    const existente = porAccountId.get(c.accountId);
    if (!existente) {
      criadas.push({ accountId: c.accountId, cliente: c.cliente ?? "", gestor: c.gestor ?? "" });
      // Novo doc mantém o mesmo esquema atual: docId = accountId.
      gravacoes.push({ docId: c.accountId, dados: payloadDe(c) });
      continue;
    }
    const campos = camposQueMudam(existente.data, c);
    if (campos.length === 0) {
      inalteradas.push({ accountId: c.accountId, cliente: c.cliente ?? "" });
    } else {
      atualizadas.push({ accountId: c.accountId, cliente: c.cliente ?? "", campos });
      // Atualiza o doc existente (qualquer que seja o docId dele).
      gravacoes.push({ docId: existente.id, dados: payloadDe(c) });
    }
  }

  // Órfãs: docs no de-para que NÃO estão na fonte. Nunca apagadas nem alteradas.
  const orfas = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((data) => !idsFonte.has((data.accountId as string) || ""))
    .map((data) => ({ accountId: (data.accountId as string) ?? null, cliente: (data.cliente as string) ?? null }));

  // MODO APLICAR: grava criadas + atualizadas (merge). Inalteradas não geram escrita.
  let gravadas = 0;
  if (aplicar && gravacoes.length) {
    for (let i = 0; i < gravacoes.length; i += LOTE) {
      const batch = db.batch();
      for (const g of gravacoes.slice(i, i + LOTE)) {
        batch.set(col.doc(g.docId), g.dados, { merge: true });
      }
      await batch.commit();
      gravadas += Math.min(LOTE, gravacoes.length - i);
    }
  }

  return NextResponse.json({
    ok: true,
    modo: aplicar ? "aplicar" : "previa",
    totalNaFonte: itens.length,
    totalNoDePara: snap.size,
    resumo: {
      criadas: criadas.length,
      atualizadas: atualizadas.length,
      inalteradas: inalteradas.length,
      orfas: orfas.length,
      gravadas: aplicar ? gravadas : 0,
    },
    criadas,
    atualizadas,
    inalteradas,
    orfas,
    ...(aplicar ? { aplicadoEm: new Date().toISOString() } : {}),
  });
}
