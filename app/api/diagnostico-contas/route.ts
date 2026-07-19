// TODO REMOVER — rota TEMPORÁRIA de descoberta (somente leitura).
// Lista as contas de anúncio que o token enxerga hoje no Meta (me/adaccounts, com
// paginação) e compara com o de-para (coleção "contas"): NOVAS (no Meta, fora do
// de-para) e SUMIDAS (no de-para, fora do Meta). Não escreve, não apaga, não
// adiciona conta nenhuma. Remover após o uso.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import { ContaMap } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Mesmas envs que o sync já usa (não cria env nova).
const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

interface AdAccount {
  id: string;          // "act_123..."
  account_id: string;  // "123..."
  name: string;
  account_status: number;
}

const STATUS_ROTULO: Record<number, string> = {
  1: "ACTIVE",
  2: "DISABLED",
  3: "UNSETTLED",
  7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT",
  9: "IN_GRACE_PERIOD",
  100: "PENDING_CLOSURE",
  101: "CLOSED",
  201: "ANY_ACTIVE",
  202: "ANY_CLOSED",
};

// Normaliza "act_123"/"123" para o id numérico puro (o de-para usa "act_...").
const bare = (s: string) => String(s || "").replace(/^act_/, "");
const idDe = (m: AdAccount) => m.id || `act_${m.account_id}`;

// Busca todas as contas visíveis ao token, seguindo a paginação do "next"
// (hoje são mais de 100 contas, então paginar é obrigatório).
async function buscarContasMeta(): Promise<AdAccount[]> {
  const out: AdAccount[] = [];
  const params = new URLSearchParams({
    fields: "id,account_id,name,account_status",
    limit: "200",
    access_token: TOKEN,
  });
  let url: string | undefined = `https://graph.facebook.com/${API}/me/adaccounts?${params}`;
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    out.push(...((json?.data ?? []) as AdAccount[]));
    url = json?.paging?.next;
  }
  return out;
}

export async function GET(req: Request) {
  // Mesma proteção do sync (CRON_SECRET; não cria env de segredo).
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  if (!TOKEN) {
    return NextResponse.json({ erro: "META_ACCESS_TOKEN não configurado" }, { status: 500 });
  }

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  // 1) Contas no Meta.
  let metaContas: AdAccount[];
  try {
    metaContas = await buscarContasMeta();
  } catch (e) {
    return NextResponse.json({ ok: false, erro: "falha ao consultar o Meta", detalhe: String(e) }, { status: 502 });
  }

  // 2) De-para no Firestore (somente leitura).
  const snap = await db.collection("contas").get();
  const dePara: ContaMap[] = snap.docs.map((d) => d.data() as ContaMap);

  const metaPorId = new Map(metaContas.map((m) => [bare(idDe(m)), m]));
  const deParaPorId = new Map(dePara.map((c) => [bare(c.accountId), c]));

  // 3) NOVAS: no Meta, fora do de-para.
  const novas = metaContas
    .filter((m) => !deParaPorId.has(bare(idDe(m))))
    .map((m) => ({
      accountId: idDe(m),
      nome: m.name ?? null,
      status: m.account_status ?? null,
      statusRotulo: STATUS_ROTULO[m.account_status] ?? null,
    }));

  // 4) SUMIDAS: no de-para, fora do Meta.
  const sumidas = dePara
    .filter((c) => !metaPorId.has(bare(c.accountId)))
    .map((c) => ({ accountId: c.accountId, cliente: c.cliente ?? null, gestor: c.gestor ?? null }));

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    totalNoMeta: metaContas.length,
    totalNoDePara: snap.size,
    novas,
    sumidas,
    consultadoEm: new Date().toISOString(),
  });
}
