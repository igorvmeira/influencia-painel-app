import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { ContaMap, MetricaDiaria } from "@/lib/types";
import { montarPainel, montarNichos } from "@/lib/painel";
import { montarKpis, montarKpisMes, serieGrafico, serieGraficoMes } from "@/lib/kpis";
import { janelaMes } from "@/lib/periodo";
import { COL_AGREGADAS, cutoffRetencao } from "@/lib/agregadas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// TODO REMOVER — conferidor de uso único (item 3). Calcula TODO o painel (KPIs,
// gestores, nichos, gráfico) pelas DUAS fontes — metricasDiarias (atual) e
// metricasAgregadas (nova) — em 7/15/30 dias e Modo Mês, e aponta qualquer
// divergência numérica. Só leitura, não escreve nada. Use pra decidir o Commit B:
// se `identico: true`, as duas fontes produzem números idênticos.

const DIAS = [7, 15, 30] as const;

// Deep-diff: percorre objetos/arrays e registra caminhos onde os valores diferem
// (números com epsilon; strings/bools/null por igualdade estrita).
function difs(a: any, b: any, caminho: string, out: { caminho: string; a: any; b: any }[]): void {
  if (out.length >= 300) return;
  if (typeof a === "number" && typeof b === "number") {
    if (Math.abs(a - b) > 1e-6) out.push({ caminho, a, b });
    return;
  }
  if (a === b) return;
  if (a && b && typeof a === "object" && typeof b === "object") {
    const chaves = new Set([...Object.keys(a), ...Object.keys(b)]);
    for (const k of chaves) difs(a[k], b[k], caminho ? `${caminho}.${k}` : k, out);
    return;
  }
  out.push({ caminho, a, b });
}

// Painel completo (o que a tela mostra) para uma fonte `daily`, em todos os períodos.
function resumo(daily: MetricaDiaria[], contasAtivas: ContaMap[]) {
  const r: Record<string, unknown> = {};
  for (const d of DIAS) {
    r[`${d} dias`] = {
      kpis: montarKpis(daily, contasAtivas, d),
      painel: montarPainel(daily, contasAtivas, d),
      nichos: montarNichos(daily, contasAtivas, d),
      grafico: serieGrafico(daily, contasAtivas, d),
    };
  }
  const jm = janelaMes(daily, contasAtivas);
  r["Mês"] = jm
    ? {
        kpis: montarKpisMes(daily, contasAtivas, jm),
        painel: montarPainel(daily, contasAtivas, jm.D, jm.espec),
        nichos: montarNichos(daily, contasAtivas, jm.D, jm.espec),
        grafico: serieGraficoMes(daily, contasAtivas, jm),
        janela: { D: jm.D },
      }
    : null;
  return r;
}

const maxData = (daily: MetricaDiaria[]) => daily.reduce((mx, m) => (m.data > mx ? m.data : mx), "");

export async function GET(req: Request) {
  const url = new URL(req.url);
  const chaveUrl = url.searchParams.get("key");
  const auth = req.headers.get("authorization");
  const segredo = process.env.CRON_SECRET;
  const autorizado = !segredo || auth === `Bearer ${segredo}` || chaveUrl === segredo;
  if (!autorizado) return NextResponse.json({ erro: "não autorizado" }, { status: 401 });

  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const cutoff = cutoffRetencao();

  // Fonte ATUAL (o que o painel lê hoje) e fonte NOVA (agregada), lidas em paralelo.
  const [contasSnap, diariasSnap, aggSnap] = await Promise.all([
    db.collection("contas").get(),
    db.collection("metricasDiarias").where("data", ">=", cutoff).get(),
    db.collection(COL_AGREGADAS).get(),
  ]);

  // Mesma regra do painel: dedup por accountId e pausadas fora.
  const vistos = new Set<string>();
  const contasAtivas: ContaMap[] = [];
  for (const d of contasSnap.docs) {
    const c = d.data() as ContaMap;
    if (!c.accountId || vistos.has(c.accountId)) continue;
    vistos.add(c.accountId);
    if (!c.pausado) contasAtivas.push(c);
  }

  const dailyAtual = diariasSnap.docs.map((d) => d.data() as MetricaDiaria);
  const dailyAgg = aggSnap.docs.flatMap((d) => ((d.data()?.dias as MetricaDiaria[] | undefined) ?? []));

  const diasPorConta = aggSnap.docs.map((d) => ((d.data()?.dias as unknown[] | undefined)?.length ?? 0));

  const divergencias: { caminho: string; a: any; b: any }[] = [];
  difs(resumo(dailyAtual, contasAtivas), resumo(dailyAgg, contasAtivas), "", divergencias);

  // Contagem de divergências por período (o caminho começa com "7 dias", "Mês", etc.).
  const porPeriodo: Record<string, number> = {};
  for (const dv of divergencias) {
    const p = dv.caminho.split(".")[0];
    porPeriodo[p] = (porPeriodo[p] ?? 0) + 1;
  }

  const identico = divergencias.length === 0;
  const diasMin = diasPorConta.length ? Math.min(...diasPorConta) : 0;
  const diasMax = diasPorConta.length ? Math.max(...diasPorConta) : 0;

  return NextResponse.json({
    ok: true,
    identico,
    mensagem: identico
      ? "Fontes IDÊNTICAS em 7/15/30 dias e Modo Mês. Seguro subir o Commit B."
      : `DIVERGÊNCIAS: ${divergencias.length} (mostrando até 300). NÃO subir o B até zerar.`,
    cutoff,
    contasAtivas: contasAtivas.length,
    fontes: {
      docsDiarias: diariasSnap.size,
      docsAgregadas: aggSnap.size,
      diasPorContaAgregada: { min: diasMin, max: diasMax },
      dataMaisRecente: { diarias: maxData(dailyAtual), agregadas: maxData(dailyAgg) },
    },
    porPeriodo,
    divergencias: divergencias.slice(0, 300),
  });
}
