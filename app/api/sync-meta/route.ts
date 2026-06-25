import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { buscarTodas, buscarSemanalGestor } from "@/lib/meta";
import { ContaMap, Detalhe, LinhaCliente, LinhaGestor, Painel, PontoCpl, Tipo } from "@/lib/types";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const ymd = (d: Date) => d.toISOString().slice(0, 10);
function janela(diasAtras: number, duracao: number) {
  const until = new Date();
  until.setDate(until.getDate() - diasAtras - 1);
  const since = new Date(until);
  since.setDate(since.getDate() - duracao + 1);
  return { since: ymd(since), until: ymd(until) };
}
const cpl = (gasto: number, conversas: number) => (conversas > 0 ? gasto / conversas : 0);
const variacao = (atual: number, anterior: number) =>
  anterior > 0 ? Math.round(((atual - anterior) / anterior) * 100) : 0;

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

  const contasSnap = await db.collection("contas").get();
  const contas: ContaMap[] = contasSnap.docs.map((d) => d.data() as ContaMap);
  if (!contas.length) {
    return NextResponse.json({ erro: "nenhuma conta no de-para (coleção 'contas')" }, { status: 400 });
  }

  const atual = janela(0, 15);
  const anterior = janela(15, 15);
  const [rAtual, rAnterior] = await Promise.all([
    buscarTodas(contas, atual.since, atual.until),
    buscarTodas(contas, anterior.since, anterior.until),
  ]);

  const porGestor = new Map<string, LinhaGestor>();
  const porGestorAnterior = new Map<string, { gasto: number; conversas: number }>();
  let gasto = 0, b2b = 0, b2c = 0;
  let gastoAnt = 0, convAnt = 0;

  for (const c of contas) {
    const a = rAtual.get(c.accountId)!;
    const conv = a.leadsForm + a.convWhats;
    gasto += a.gasto; b2b += a.leadsForm; b2c += a.convWhats;

    const g = porGestor.get(c.gestor) ?? { nome: c.gestor, gasto: 0, conversas: 0, b2b: 0, b2c: 0, cpl: 0, cplVar: 0 };
    g.gasto += a.gasto; g.b2b += a.leadsForm; g.b2c += a.convWhats; g.conversas += conv;
    porGestor.set(c.gestor, g);

    const p = rAnterior.get(c.accountId)!;
    const convP = p.leadsForm + p.convWhats;
    gastoAnt += p.gasto; convAnt += convP;
    const ga = porGestorAnterior.get(c.gestor) ?? { gasto: 0, conversas: 0 };
    ga.gasto += p.gasto; ga.conversas += convP;
    porGestorAnterior.set(c.gestor, ga);
  }

  const gestores: LinhaGestor[] = [...porGestor.values()].map((g) => {
    const ant = porGestorAnterior.get(g.nome)!;
    return { ...g, cpl: cpl(g.gasto, g.conversas), cplVar: variacao(cpl(g.gasto, g.conversas), cpl(ant.gasto, ant.conversas)) };
  }).sort((x, y) => y.gasto - x.gasto);

  const conversas = b2b + b2c;

  // Janelas semanais: 4 semanas atuais vs 4 semanas de ~2 meses atrás.
  const semAtual = janela(0, 28);
  const semAntiga = janela(56, 28);

  const detalhes: Detalhe[] = [];
  for (const g of gestores) {
    const contasGestor = contas.filter((c) => c.gestor === g.nome);
    const ids = contasGestor.map((c) => c.accountId);

    const [semA, semB] = await Promise.all([
      buscarSemanalGestor(ids, semAtual.since, semAtual.until),
      buscarSemanalGestor(ids, semAntiga.since, semAntiga.until),
    ]);
    const cplSemanal: PontoCpl[] = semA.map((s, i) => ({
      semana: `Sem ${i + 1}`,
      atual: Math.round(cpl(s.gasto, s.conversas) * 100) / 100,
      doisMesesAtras: semB[i] ? Math.round(cpl(semB[i].gasto, semB[i].conversas) * 100) / 100 : 0,
    }));

    const clientes: LinhaCliente[] = contasGestor
      .map((c) => {
        const a = rAtual.get(c.accountId)!;
        const conv = a.leadsForm + a.convWhats;
        return { cliente: c.cliente, tipo: c.tipo as Tipo, gasto: a.gasto, conversas: conv, cplSemanal: cpl(a.gasto, conv) };
      })
      .sort((x, y) => y.gasto - x.gasto);

    detalhes.push({ gestor: g.nome, contasCount: contasGestor.length, cplSemanal, clientes });
  }

  const painel: Painel = {
    periodoLabel: "Últimos 15 dias",
    atualizadoEm: new Date().toISOString(),
    totais: {
      gasto, conversas, cpl: cpl(gasto, conversas), b2b, b2c,
      gastoVar: variacao(gasto, gastoAnt),
      conversasVar: variacao(conversas, convAnt),
      cplVar: variacao(cpl(gasto, conversas), cpl(gastoAnt, convAnt)),
    },
    gestores,
    detalhes,
  };

  await db.collection("painel").doc("atual").set(painel);
  return NextResponse.json({ ok: true, gestores: gestores.length, contas: contas.length, atualizadoEm: painel.atualizadoEm });
}
