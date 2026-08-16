/**
 * DESCOBERTA de contas acessíveis e não cadastradas — o lado com I/O da fila.
 *
 * As regras (o que pode ser cadastrado, o que a fila NÃO enxerga) moram em
 * `lib/filaContas.ts`. Aqui só se busca, sonda e grava.
 *
 * ⚠️ ROTINA CARA, POR ISSO NÃO MORA NA TELA. Cada candidata custa 2 requisições ao
 * Meta (identidade + gasto dia a dia), e a listagem em si é paginada. A tela lê
 * 1 documento; quem paga o custo é o sync, uma vez por varredura.
 *
 * ⚠️ E POR ISSO A ETAPA É TOLERANTE A FALHA. Descobrir conta nova é conveniência;
 * sincronizar métrica é o que o painel precisa para não mentir. Se a Meta recusar a
 * listagem, a descoberta grava o erro, a fila fica com a foto anterior — e o sync
 * segue verde.
 */

import type { Firestore } from "firebase-admin/firestore";
import { CandidataFila, FilaContas, Ignorada } from "./filaContas";

const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

export const COL_SISTEMA = "sistema";
export const DOC_FILA = "filaContas";
export const DOC_IGNORADAS = "contasIgnoradas";

/**
 * Janela do gasto sondado. 120 dias responde "rodou em algum momento?", que é a
 * pergunta certa aqui: conta recém-criada pode ter gastado semana passada e estar
 * parada hoje — e continua sendo conta para cadastrar.
 */
const DIAS_GASTO = 120;
/** Teto de sondagens por execução. O corte é REPORTADO, nunca silencioso. */
const MAX_SONDAS = 25;
/** Sondas simultâneas — mesmo valor do /api/diagnostico-contas. */
const LOTE_SONDA = 8;

/** Rótulos de `account_status` (mesma tabela do /api/diagnostico-contas). */
const STATUS_ROTULO: Record<number, string> = {
  1: "ACTIVE", 2: "DISABLED", 3: "UNSETTLED", 7: "PENDING_RISK_REVIEW",
  8: "PENDING_SETTLEMENT", 9: "IN_GRACE_PERIOD", 100: "PENDING_CLOSURE",
  101: "CLOSED", 201: "ANY_ACTIVE", 202: "ANY_CLOSED",
};

const bare = (s: string) => String(s || "").replace(/^act_/, "");
const ymd = (d: Date) => d.toISOString().slice(0, 10);

interface AdAccount {
  id: string;
  account_id: string;
  name: string;
  account_status: number;
}

/**
 * O que o token LISTA. Serve para DESCOBRIR contas cujo id ninguém informou — e
 * SÓ para isso: quem prova acesso é a consulta direta (ver lib/filaContas.ts).
 */
async function listarContasMeta(): Promise<AdAccount[]> {
  const out: AdAccount[] = [];
  const params = new URLSearchParams({
    fields: "id,account_id,name,account_status",
    limit: "200",
    access_token: TOKEN,
  });
  let url: string | undefined = `https://graph.facebook.com/${API}/me/adaccounts?${params}`;
  while (url) {
    const res: Response = await fetch(url, { cache: "no-store" });
    if (!res.ok) throw new Error(`Meta API ${res.status} (me/adaccounts): ${(await res.text()).slice(0, 200)}`);
    const json = await res.json();
    out.push(...((json?.data ?? []) as AdAccount[]));
    url = json?.paging?.next;
  }
  return out;
}

/** Identidade + moeda + status pela CONSULTA DIRETA. */
async function sondarIdentidade(accountId: string) {
  try {
    const url = `https://graph.facebook.com/${API}/${accountId}`
      + `?fields=name,account_status,currency&access_token=${TOKEN}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      return { nomeNaMeta: null, status: null, statusRotulo: null, moeda: null,
        erro: String(j?.error?.message ?? `HTTP ${r.status}`).slice(0, 160) };
    }
    return {
      nomeNaMeta: j.name ?? null,
      status: j.account_status ?? null,
      statusRotulo: STATUS_ROTULO[j.account_status] ?? null,
      moeda: j.currency ?? null,
      erro: null as string | null,
    };
  } catch (e) {
    return { nomeNaMeta: null, status: null, statusRotulo: null, moeda: null, erro: String(e).slice(0, 160) };
  }
}

/**
 * Gasto dia a dia na janela — a ÚNICA prova de veiculação.
 * ⚠️ `account_status: ACTIVE` diz que a conta está regular, NÃO que anunciou.
 */
async function sondarGasto(accountId: string, dias: number) {
  const until = new Date();
  const since = new Date(until.getTime() - (dias - 1) * 86400000);
  const p = new URLSearchParams({
    fields: "spend",
    time_range: JSON.stringify({ since: ymd(since), until: ymd(until) }),
    time_increment: "1", level: "account", limit: "500", access_token: TOKEN,
  });
  try {
    const r = await fetch(`https://graph.facebook.com/${API}/${accountId}/insights?${p}`, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) {
      return { total: 0, diasComGasto: 0, ultimoDiaComGasto: null,
        erro: String(j?.error?.message ?? `HTTP ${r.status}`).slice(0, 160) };
    }
    const comGasto = ((j.data ?? []) as { spend?: string; date_start: string }[])
      .filter((x) => Number(x.spend ?? 0) > 0);
    return {
      total: Number(comGasto.reduce((s, x) => s + Number(x.spend ?? 0), 0).toFixed(2)),
      diasComGasto: comGasto.length,
      ultimoDiaComGasto: comGasto.length ? comGasto[comGasto.length - 1].date_start : null,
      erro: null as string | null,
    };
  } catch (e) {
    return { total: 0, diasComGasto: 0, ultimoDiaComGasto: null, erro: String(e).slice(0, 160) };
  }
}

/**
 * Roda a descoberta inteira e GRAVA `sistema/filaContas`.
 *
 * Nunca lança: devolve a fila com `erro` preenchido. Quem chama (o sync) trata a
 * descoberta como enfeite — ela não pode derrubar a sincronização de métricas.
 *
 * @param orcamentoMs teto de tempo das sondagens. Na Vercel grátis o sync inteiro
 *   precisa caber em ~10s, então a descoberta anda com relógio próprio e para no
 *   meio se precisar — reportando quantas ficaram de fora.
 */
export async function descobrirContas(
  db: Firestore,
  { orcamentoMs = 5000 }: { orcamentoMs?: number } = {}
): Promise<FilaContas> {
  const comecou = Date.now();
  const geradoEm = new Date().toISOString();

  const base: FilaContas = {
    geradoEm, diasGasto: DIAS_GASTO, candidatas: [],
    totalListadas: 0, jaCadastradas: 0,
    cortadasPeloTeto: 0, motivoCorte: null, erro: null,
  };

  if (!TOKEN) {
    const fila = { ...base, erro: "META_ACCESS_TOKEN não configurado" };
    await gravar(db, fila);
    return fila;
  }

  // ------------------------------------------------------------- 1) LISTAGEM
  let listadas: AdAccount[];
  try {
    listadas = await listarContasMeta();
  } catch (e) {
    // ⚠️ A fila ANTERIOR fica de pé. Sobrescrever com lista vazia diria "nenhuma
    // conta nova", que é uma afirmação que ninguém fez — o que houve foi uma falha.
    const fila = { ...base, erro: `falha ao listar contas no Meta: ${String(e).slice(0, 200)}` };
    await db.collection(COL_SISTEMA).doc(DOC_FILA).set(
      { erro: fila.erro, tentadoEm: geradoEm }, { merge: true }
    );
    return fila;
  }

  // ------------------------------------------------- 2) TIRA AS JÁ CADASTRADAS
  const snapContas = await db.collection("contas").get();
  const cadastradas = new Set(
    snapContas.docs.map((d) => bare(((d.data() as { accountId?: string }).accountId) || d.id))
  );
  const snapIgn = await db.collection(COL_SISTEMA).doc(DOC_IGNORADAS).get();
  const ignoradas = (snapIgn.data()?.contas ?? {}) as Record<string, Ignorada>;

  const naoCadastradas = listadas.filter((m) => !cadastradas.has(bare(m.id || `act_${m.account_id}`)));

  /**
   * ⚠️ NÃO IGNORADAS PRIMEIRO — e o motivo é o teto. As ignoradas continuam sendo
   * listadas pelo Meta para sempre; se elas entrassem na frente, uma conta nova de
   * verdade poderia ser cortada pelo teto em favor de uma que já foi descartada.
   * Elas SÃO sondadas (o filtro é na leitura), para desfazer o "ignorar" valer na
   * hora, sem esperar a próxima descoberta.
   */
  const ordenadas = [...naoCadastradas].sort((a, b) => {
    const ia = ignoradas[a.id || `act_${a.account_id}`] ? 1 : 0;
    const ib = ignoradas[b.id || `act_${b.account_id}`] ? 1 : 0;
    return ia - ib;
  });

  const aSondar = ordenadas.slice(0, MAX_SONDAS);
  let cortadas = ordenadas.length - aSondar.length;
  let motivoCorte: FilaContas["motivoCorte"] = cortadas > 0 ? "teto" : null;

  // ------------------------------------------------------------- 3) SONDAGEM
  const candidatas: CandidataFila[] = [];
  for (let i = 0; i < aSondar.length; i += LOTE_SONDA) {
    // Relógio próprio: para no meio e reporta, em vez de estourar a função inteira.
    if (Date.now() - comecou > orcamentoMs) {
      cortadas += aSondar.length - i;
      motivoCorte = "tempo";
      break;
    }
    const lote = await Promise.all(
      aSondar.slice(i, i + LOTE_SONDA).map(async (m): Promise<CandidataFila> => {
        const accountId = m.id || `act_${m.account_id}`;
        const ident = await sondarIdentidade(accountId);
        const gasto = ident.erro
          ? { total: 0, diasComGasto: 0, ultimoDiaComGasto: null, erro: null as string | null }
          : await sondarGasto(accountId, DIAS_GASTO);
        return {
          accountId,
          // Nome da listagem como reserva: a sonda pode falhar e o nome ainda ajuda
          // a pessoa a reconhecer a conta. É PISTA, não decisão — o nome comercial
          // continua sendo digitado por quem cadastra.
          nomeNaMeta: ident.nomeNaMeta ?? m.name ?? null,
          moeda: ident.moeda,
          status: ident.status ?? m.account_status ?? null,
          statusRotulo: ident.statusRotulo ?? STATUS_ROTULO[m.account_status] ?? null,
          gastoPeriodo: gasto.total,
          diasComGasto: gasto.diasComGasto,
          ultimoDiaComGasto: gasto.ultimoDiaComGasto,
          erro: ident.erro ?? gasto.erro,
        };
      })
    );
    candidatas.push(...lote);
  }

  // Quem gastou mais aparece primeiro: é a candidata que mais custa deixar de fora.
  candidatas.sort((a, b) => b.gastoPeriodo - a.gastoPeriodo);

  const fila: FilaContas = {
    geradoEm,
    diasGasto: DIAS_GASTO,
    candidatas,
    totalListadas: listadas.length,
    jaCadastradas: snapContas.size,
    cortadasPeloTeto: cortadas,
    motivoCorte,
    erro: null,
  };
  await gravar(db, fila);
  return fila;
}

/** `set` sem merge: a fila é uma FOTO. Merge deixaria candidata antiga viva. */
async function gravar(db: Firestore, fila: FilaContas) {
  await db.collection(COL_SISTEMA).doc(DOC_FILA).set(fila);
}
