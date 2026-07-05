import { getDadosDiarios } from "./data";
import { montarPainel, montarNichos } from "./painel";
import { brl, brlDec, num } from "./format";

// Teto de tamanho do contexto enviado à IA (em caracteres). Segura custo e evita
// despejar os milhares de docs de metricasDiarias — usamos só os AGREGADOS.
const TETO_CONTEXTO = 12000;

// Monta um resumo compacto e já em R$ a partir dos agregados do período pedido:
// totais + por gestor + por nicho + clientes + contas perto do limite de gasto.
export async function montarContextoIA(periodoDias: number): Promise<string> {
  const { daily, contas, limites, fonte } = await getDadosDiarios();
  const painel = montarPainel(daily, contas, periodoDias);
  const nichos = montarNichos(daily, contas, periodoDias);
  const t = painel.totais;

  const l: string[] = [];
  l.push(`Fonte dos dados: ${fonte === "mock" ? "exemplo (mock)" : "Firestore (real)"}.`);
  l.push(`Período analisado: últimos ${periodoDias} dias. Todos os valores em R$ (BRL).`);

  l.push("", "== TOTAIS DO PERÍODO ==");
  l.push(`Investido: ${brl(t.gasto)} (${t.gastoVar >= 0 ? "+" : ""}${t.gastoVar}% vs período anterior).`);
  l.push(`Conversas: ${num(t.conversas)} (${t.conversasVar}%) — ${num(t.b2b)} B2B (formulário) / ${num(t.b2c)} B2C (WhatsApp).`);
  l.push(`CPL geral: ${brlDec(t.cpl)} (${t.cplVar}%).`);

  l.push("", "== POR GESTOR ==");
  for (const g of painel.gestores) {
    l.push(`- ${g.nome}: gasto ${brl(g.gasto)}, ${num(g.conversas)} conversas, CPL ${brlDec(g.cpl)} (${g.cplVar}%).`);
  }

  l.push("", "== POR NICHO ==");
  for (const n of nichos) {
    l.push(`- ${n.nicho}: ${n.clientesCount} clientes, gasto ${brl(n.gasto)}, ${num(n.conversas)} conversas, CPL ${brlDec(n.cpl)}.`);
  }

  l.push("", "== CLIENTES (por gestor) ==");
  for (const d of painel.detalhes) {
    for (const c of d.clientes) {
      l.push(`- ${c.cliente} [${c.tipo}] (gestor ${d.gestor}): gasto ${brl(c.gasto)}, ${num(c.conversas)} conversas, CPL ${brlDec(c.cplSemanal)}.`);
    }
  }

  l.push("", "== CONTAS PERTO DO LIMITE DE GASTO (spend_cap > 0) ==");
  const mapaConta = new Map(contas.map((c) => [c.accountId, c]));
  const perto = limites
    .filter((x) => x.spendCap > 0 && x.amountSpent / x.spendCap >= 0.8)
    .sort((a, b) => b.amountSpent / b.spendCap - a.amountSpent / a.spendCap);
  if (!perto.length) {
    l.push("Nenhuma conta com teto acima de 80% de uso.");
  } else {
    for (const x of perto) {
      const c = mapaConta.get(x.accountId);
      const pct = Math.round((x.amountSpent / x.spendCap) * 100);
      const resta = Math.max(0, x.spendCap - x.amountSpent);
      l.push(`- ${c?.cliente ?? x.accountId} (gestor ${c?.gestor ?? "?"}): ${pct}% usado, ${brlDec(x.amountSpent)} de ${brlDec(x.spendCap)}, resta ${brlDec(resta)}.`);
    }
  }

  let texto = l.join("\n");
  if (texto.length > TETO_CONTEXTO) {
    texto = texto.slice(0, TETO_CONTEXTO) + "\n… (contexto truncado por tamanho)";
  }
  return texto;
}
