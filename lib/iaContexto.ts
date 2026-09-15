import { getDadosDiarios } from "./data";
// ⚠️ O LIMIAR VEM DE lib/alertas.ts, NÃO É LITERAL AQUI.
// Antes este arquivo tinha `>= 0.8` no filtro e "80%" na frase logo abaixo — duas
// cópias do mesmo limiar, nenhuma ligada à régua dos alertas. Calibrar LIMITE_ATENCAO
// mudaria a TELA e não mudaria o que a IA DESCREVE, e frase de IA ninguém confere.
import { LIMITE_ATENCAO } from "./alertas";
import { montarPainel, montarNichos } from "./painel";
import { brl, brlDec, num } from "./format";
import { explicaSemCpl } from "./cpl";

// Teto de tamanho do contexto enviado à IA (em caracteres). Segura custo e evita
// despejar os milhares de docs de metricasDiarias — usamos só os AGREGADOS.
const TETO_CONTEXTO = 12000;

// Monta um resumo compacto e já em R$ a partir dos agregados do período pedido:
// totais + por gestor + por nicho + clientes + contas perto do limite de gasto.
export async function montarContextoIA(periodoDias: number): Promise<string> {
  const { daily, contas, limites, fonte, ultimoDiaCompleto, diaParcial } = await getDadosDiarios();
  const painel = montarPainel(daily, contas, periodoDias);
  const nichos = montarNichos(daily, contas, periodoDias);
  const t = painel.totais;

  const l: string[] = [];
  l.push(`Fonte dos dados: ${fonte === "mock" ? "exemplo (mock)" : "Firestore (real)"}.`);
  l.push(`Período analisado: últimos ${periodoDias} dias${ultimoDiaCompleto ? `, até ${ultimoDiaCompleto}` : ""}. Todos os valores em R$ (BRL).`);
  // O dia parcial já saiu dos dados na fonte (lib/data.ts); a IA precisa saber disso para
  // não descrever "hoje" com números que não o incluem.
  if (diaParcial) l.push(`O dia ${diaParcial} ainda está sendo sincronizado e ficou FORA de todos os números (dia incompleto).`);

  // ⚠️ CPL indefinido e variação sem base vão ESCRITOS como tal. "CPL R$ 0,00 (0%)" a IA
  // leria como "a conta mais barata, estável" — e frase de IA ninguém confere.
  const cplTxt = (cpl: number | null, gasto: number, conversas: number) =>
    cpl === null ? `indefinido (${explicaSemCpl(gasto, conversas)})` : brlDec(cpl);
  const varTxt = (v: number | null) =>
    v === null ? "sem base de comparação" : `${v >= 0 ? "+" : ""}${v}% vs período anterior`;

  l.push("", "== TOTAIS DO PERÍODO ==");
  l.push(`Investido: ${brl(t.gasto)} (${varTxt(t.gastoVar)}).`);
  l.push(`Conversas: ${num(t.conversas)} (${varTxt(t.conversasVar)}) — ${num(t.b2b)} B2B (formulário) / ${num(t.b2c)} B2C (WhatsApp).`);
  l.push(`CPL geral: ${cplTxt(t.cpl, t.gasto, t.conversas)} (${varTxt(t.cplVar)}).`);

  l.push("", "== POR GESTOR ==");
  for (const g of painel.gestores) {
    l.push(`- ${g.nome}: gasto ${brl(g.gasto)}, ${num(g.conversas)} conversas, CPL ${cplTxt(g.cpl, g.gasto, g.conversas)} (${varTxt(g.cplVar)}).`);
  }

  l.push("", "== POR NICHO ==");
  for (const n of nichos) {
    l.push(`- ${n.nicho}: ${n.clientesCount} clientes, gasto ${brl(n.gasto)}, ${num(n.conversas)} conversas, CPL ${cplTxt(n.cpl, n.gasto, n.conversas)}.`);
  }

  l.push("", "== CLIENTES (por gestor) ==");
  for (const d of painel.detalhes) {
    for (const c of d.clientes) {
      l.push(`- ${c.cliente} [${c.tipo}] (gestor ${d.gestor}): gasto ${brl(c.gasto)}, ${num(c.conversas)} conversas, CPL ${cplTxt(c.cplSemanal, c.gasto, c.conversas)}.`);
    }
  }

  l.push("", "== CONTAS PERTO DO LIMITE DE GASTO (spend_cap > 0) ==");
  const mapaConta = new Map(contas.map((c) => [c.accountId, c]));
  const perto = limites
    .filter((x) => x.spendCap > 0 && x.amountSpent / x.spendCap >= LIMITE_ATENCAO)
    .sort((a, b) => b.amountSpent / b.spendCap - a.amountSpent / a.spendCap);
  if (!perto.length) {
    l.push(`Nenhuma conta com teto acima de ${Math.round(LIMITE_ATENCAO * 100)}% de uso.`);
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
