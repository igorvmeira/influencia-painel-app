// TODO REMOVER — rota TEMPORÁRIA de diagnóstico (somente leitura).
// Responde se a coleção "contas" tem docs duplicados pelo mesmo accountId (o que
// atribuiria a mesma conta a vários gestores) e MEDE o impacto disso nos números:
// compara painel/KPIs com a lista CRUA vs DEDUPLICADA. Não escreve nada.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { ContaMap, MetricaDiaria } from "@/lib/types";
import { montarPainel, montarNichos } from "@/lib/painel";
import { montarKpis } from "@/lib/kpis";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const DIA_MS = 86400000;
const ymd = (d: Date) => d.toISOString().slice(0, 10);
const PERIODO = 15; // mesmo padrão do painel

const r2 = (n: number) => Math.round(n * 100) / 100;

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const cutoff = ymd(new Date(Date.now() - 95 * DIA_MS));
  const [contasSnap, diariasSnap] = await Promise.all([
    db.collection("contas").get(),
    db.collection("metricasDiarias").where("data", ">=", cutoff).get(),
  ]);

  const docs = contasSnap.docs.map((d) => ({ docId: d.id, ...(d.data() as ContaMap) }));
  const daily = diariasSnap.docs.map((d) => d.data() as MetricaDiaria);

  // 1) Duplicados pelo campo accountId (mesmo accountId em mais de um doc).
  const porAccount = new Map<string, typeof docs>();
  for (const d of docs) {
    const k = d.accountId || `(SEM accountId · docId=${d.docId})`;
    const arr = porAccount.get(k) ?? [];
    arr.push(d);
    porAccount.set(k, arr);
  }
  const duplicados = [...porAccount.entries()]
    .filter(([, arr]) => arr.length > 1)
    .map(([accountId, arr]) => ({
      accountId,
      qtdDocs: arr.length,
      gestoresDistintos: [...new Set(arr.map((x) => x.gestor))],
      docs: arr.map((x) => ({ docId: x.docId, cliente: x.cliente, gestor: x.gestor, pausado: !!x.pausado })),
    }));

  // 2) Todos os docs de NORTELINE (o caso relatado).
  const norteline = docs
    .filter((d) => (d.cliente || "").toUpperCase().includes("NORTELINE"))
    .map((d) => ({ docId: d.docId, accountId: d.accountId, cliente: d.cliente, gestor: d.gestor, pausado: !!d.pausado }));

  // 3) Impacto: mesma regra do painel (só contas ativas), lista CRUA vs DEDUPLICADA.
  const contasRaw: ContaMap[] = docs.map(({ docId: _docId, ...c }) => c as ContaMap);
  const ativasRaw = contasRaw.filter((c) => !c.pausado);
  const vistos = new Set<string>();
  const ativasDedup = ativasRaw.filter((c) => {
    if (!c.accountId || vistos.has(c.accountId)) return false;
    vistos.add(c.accountId);
    return true;
  });

  const kRaw = montarKpis(daily, ativasRaw, PERIODO);
  const kDedup = montarKpis(daily, ativasDedup, PERIODO);
  const pRaw = montarPainel(daily, ativasRaw, PERIODO);
  const pDedup = montarPainel(daily, ativasDedup, PERIODO);
  const nRaw = montarNichos(daily, ativasRaw, PERIODO);
  const nDedup = montarNichos(daily, ativasDedup, PERIODO);

  const gestorRaw = new Map(pRaw.gestores.map((g) => [g.nome, g]));
  const porGestor = pDedup.gestores.map((g) => {
    const r = gestorRaw.get(g.nome);
    return {
      gestor: g.nome,
      gastoCru: r2(r?.gasto ?? 0), gastoDedup: r2(g.gasto),
      cplCru: r2(r?.cpl ?? 0), cplDedup: r2(g.cpl),
      inflado: !!r && (Math.abs((r.gasto ?? 0) - g.gasto) > 0.01 || Math.abs((r.cpl ?? 0) - g.cpl) > 0.01),
    };
  });
  const gestoresSoNoCru = pRaw.gestores
    .filter((g) => !pDedup.gestores.some((d) => d.nome === g.nome))
    .map((g) => g.nome);

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    periodoDias: PERIODO,
    resumo: {
      totalDocsContas: docs.length,
      accountIdsUnicos: new Set(docs.map((d) => d.accountId).filter(Boolean)).size,
      accountIdsDuplicados: duplicados.length,
      veredito: duplicados.length > 0
        ? "CENÁRIO (B): há docs duplicados pelo mesmo accountId — rankings/gestores estavam inflados"
        : "CENÁRIO (A): NÃO há duplicados — o de-para está ok; o problema é só de renderização (keys)",
    },
    duplicados,
    norteline,
    // KPIs do topo usam Set de accountId → imunes a doc duplicado (devem bater).
    kpisTopo: {
      cru: { gasto: r2(kRaw.gasto.valor), leads: kRaw.leads.valor, conversas: kRaw.conversas.valor, cpl: r2(kRaw.cpl.valor) },
      dedup: { gasto: r2(kDedup.gasto.valor), leads: kDedup.leads.valor, conversas: kDedup.conversas.valor, cpl: r2(kDedup.cpl.valor) },
    },
    // Totais/rankings do painel percorrem a LISTA → inflam se houver duplicado.
    painelTotais: {
      cru: { gasto: r2(pRaw.totais.gasto), conversas: pRaw.totais.conversas, cpl: r2(pRaw.totais.cpl) },
      dedup: { gasto: r2(pDedup.totais.gasto), conversas: pDedup.totais.conversas, cpl: r2(pDedup.totais.cpl) },
    },
    porGestor,
    gestoresQueSomemAoDeduplicar: gestoresSoNoCru,
    nichos: { qtdCru: nRaw.length, qtdDedup: nDedup.length },
    consultadoEm: new Date().toISOString(),
  });
}
