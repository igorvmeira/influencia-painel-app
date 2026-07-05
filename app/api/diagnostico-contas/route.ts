// TODO REMOVER — rota TEMPORÁRIA de descoberta (somente leitura).
// Lê a BM INTEIRA pelo Business ID (owned_ad_accounts + client_ad_accounts),
// mostra quais contas o System User ainda NÃO enxerga (temAcessoDoToken=false) e
// compara com o de-para do Firestore (coleção "contas"). Não escreve, não apaga,
// não atribui nada. Remover após o uso.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { ContaMap } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Mesmas envs do Meta já usadas pelo sync + o Business ID da BM.
const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";
const BUSINESS_ID = process.env.META_BUSINESS_ID || "";

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

// Segue a paginação do "next" e devolve todas as páginas de um edge.
async function paginar(urlInicial: string): Promise<AdAccount[]> {
  const out: AdAccount[] = [];
  let url: string | undefined = urlInicial;
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Meta API ${res.status}: ${await res.text()}`);
    const json = await res.json();
    out.push(...((json?.data ?? []) as AdAccount[]));
    url = json?.paging?.next;
  }
  return out;
}

function urlEdge(edge: string): string {
  const p = new URLSearchParams({
    fields: "id,account_id,name,account_status",
    limit: "200",
    access_token: TOKEN,
  });
  return `https://graph.facebook.com/${API}/${BUSINESS_ID}/${edge}?${p}`;
}

function urlMe(): string {
  const p = new URLSearchParams({
    fields: "id,account_id,name,account_status",
    limit: "200",
    access_token: TOKEN,
  });
  return `https://graph.facebook.com/${API}/me/adaccounts?${p}`;
}

export async function GET(req: Request) {
  // Proteção: mesmo segredo do sync (CRON_SECRET; não cria env de segredo).
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

  // Business ID é obrigatório para ler a BM inteira. Se faltar, oriento (não invento).
  if (!BUSINESS_ID) {
    return NextResponse.json(
      {
        ok: false,
        erro: "META_BUSINESS_ID não configurado",
        comoResolver:
          "Crie a env META_BUSINESS_ID (não é segredo) na Vercel com o ID do seu Business Manager. " +
          "Onde achar: Meta Business Suite → Configurações do negócio → Informações do negócio → 'ID do negócio'.",
      },
      { status: 400 }
    );
  }

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  // 1) O que o token enxerga hoje (me/adaccounts) — para o temAcessoDoToken.
  let tokenContas: AdAccount[] = [];
  let avisoToken: string | null = null;
  try {
    tokenContas = await paginar(urlMe());
  } catch (e) {
    avisoToken = String(e);
  }
  const tokenBare = new Set(tokenContas.map((m) => bare(idDe(m))));

  // 2) BM inteira: owned + client. Erros de permissão são capturados, não quebram.
  const errosPermissao: { edge: string; erro: string }[] = [];
  let owned: AdAccount[] = [];
  let cliente: AdAccount[] = [];
  try {
    owned = await paginar(urlEdge("owned_ad_accounts"));
  } catch (e) {
    errosPermissao.push({ edge: "owned_ad_accounts", erro: String(e) });
  }
  try {
    cliente = await paginar(urlEdge("client_ad_accounts"));
  } catch (e) {
    errosPermissao.push({ edge: "client_ad_accounts", erro: String(e) });
  }

  // Combina a BM por id (própria tem prioridade se aparecer nos dois).
  const bmMap = new Map<string, { conta: AdAccount; origem: "propria" | "cliente" }>();
  for (const m of owned) bmMap.set(bare(idDe(m)), { conta: m, origem: "propria" });
  for (const m of cliente) if (!bmMap.has(bare(idDe(m)))) bmMap.set(bare(idDe(m)), { conta: m, origem: "cliente" });

  const contasBM = [...bmMap.values()].map(({ conta, origem }) => ({
    accountId: idDe(conta),
    nome: conta.name ?? null,
    status: conta.account_status ?? null,
    statusRotulo: STATUS_ROTULO[conta.account_status] ?? null,
    origem,
    temAcessoDoToken: tokenBare.has(bare(idDe(conta))),
  }));

  // 3) De-para no Firestore (somente leitura).
  const snap = await db.collection("contas").get();
  const dePara: ContaMap[] = snap.docs.map((d) => d.data() as ContaMap);
  const deParaBare = new Set(dePara.map((c) => bare(c.accountId)));

  // 4) Listas.
  const novas = contasBM.filter((c) => !deParaBare.has(bare(c.accountId)));
  const semAcessoDoToken = contasBM.filter((c) => !c.temAcessoDoToken);
  const sumidas = dePara
    .filter((c) => !bmMap.has(bare(c.accountId)))
    .map((c) => ({ accountId: c.accountId, cliente: c.cliente ?? null, gestor: c.gestor ?? null }));

  const bmIncompleta = errosPermissao.length > 0;

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    businessId: BUSINESS_ID,
    totais: {
      totalNaBM: bmMap.size,
      totalQueTokenVe: tokenContas.length,
      totalNoDePara: snap.size,
      totalSemAcessoDoToken: semAcessoDoToken.length,
    },
    // Contas na BM que o System User AINDA NÃO enxerga — são as que travam o sync
    // até serem atribuídas ao System User (feito manualmente por você no Meta).
    semAcessoDoToken,
    novas,
    sumidas,
    contasBM,
    ...(bmIncompleta
      ? {
          bmIncompleta: true,
          avisoPermissao:
            "Não consegui ler todos os edges da BM. O token do System User precisa da permissão " +
            "'business_management' (e o System User precisa ter acesso a este Business Manager). " +
            "Enquanto isso, os totais/listas da BM podem estar incompletos.",
          errosPermissao,
        }
      : {}),
    ...(avisoToken ? { avisoToken } : {}),
    consultadoEm: new Date().toISOString(),
  });
}
