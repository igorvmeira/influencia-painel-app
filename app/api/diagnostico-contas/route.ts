// ===========================================================================
// 🛑 ISTO NÃO É UMA ROTA DE DIAGNÓSTICO. NÃO REMOVA "SEGUINDO A REGRA DA CASA".
// ===========================================================================
// A regra do estúdio é apagar o endpoint de diagnóstico ao fim da integração. Esta
// rota NASCEU assim e deixou de ser: é FERRAMENTA OPERACIONAL RECORRENTE, usada em
// toda conciliação com a planilha de monitoramento da agência, e no modo sondagem
// antes de cadastrar qualquer conta que a agência mandar.
//
// Promovida formalmente em 20/08/2026. O nome ficou como está de propósito — ele
// está no `data/README.md` em dois lugares e nos atalhos do Igor; renomear trocaria
// custo real por ganho estético.
//
// Somente leitura: não escreve, não apaga, não cadastra nada.
//
// ===========================================================================
// ⚠️⚠️ O TESTE DE ACESSO É A CONSULTA DIRETA, NÃO `me/adaccounts`
//      ESTE PARÁGRAFO É O MOTIVO DE A ROTA EXISTIR. NÃO ENCURTE.
// ===========================================================================
// Esta rota já classificou contas por presença em `me/adaccounts`, e isso produziu
// um diagnóstico ERRADO em 12/08/2026: 7 contas foram reportadas como "o token não
// enxerga → precisa de parceria de BM" quando na verdade respondiam à consulta
// direta e tinham gasto real — R$ 45,9 mil em 120 dias que o painel NÃO VIA.
//
// 🔑 Esse erro é a origem do rodapé permanente da /fila-contas ("fila vazia não
// significa que não há contas novas"). O conhecimento não está em mais lugar
// nenhum do código: é aqui e no lib/filaContas.ts. Apagar isto reabre um buraco
// de R$ 45,9 mil que já custou uma conciliação inteira para ser encontrado.
//
// O motivo é simples: o sync chama `buscarDiario()`, que consulta
// `/{accountId}/insights` DIRETO (lib/meta.ts). Ele nunca olha `me/adaccounts`.
// Logo, **ausência em `me/adaccounts` não diz nada sobre o sync funcionar**.
// `me/adaccounts` continua útil para DESCOBRIR contas cujo id ninguém informou —
// mas só a consulta direta prova acesso.
//
// ===========================================================================
// AS DUAS CONFERÊNCIAS DE CADASTRO
// ===========================================================================
// 1. A consulta direta funciona?
// 2. Qual é a MOEDA? O painel soma `gasto` cru e formata com brl(), sem conversão
//    em lugar nenhum — uma conta em moeda estrangeira contamina totais, CPL e
//    ranking em silêncio. A NEXA TELECOM (ARS) quase entrou assim.
// Por isso a moeda vem no retorno: sem ela o diagnóstico responde metade.
//
// ATENÇÃO ao interpretar: esta rota só enxerga o MUNDO META. Cliente que anuncia só
// no Google Ads jamais aparece — e isso é o esperado, não é conta faltando (ex.:
// LAVE MAIS EXPRESS, CHRISTIANE ROBINE). Ver data/README.md.

import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import { ContaMap } from "@/lib/types";
// ⚠️ Constantes COMPARTILHADAS, não cópias locais. Antes esta rota tinha as suas,
// com um comentário dizendo "mesmo valor do /api/diagnostico-contas" nos outros
// arquivos — promessa, não vínculo. Extraídas em 20/08/2026.
import { LOTE_SONDA, MOEDA_ACEITA, STATUS_ROTULO, bare } from "@/lib/filaContas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Mesmas envs que o sync já usa (não cria env nova).
const API = process.env.META_API_VERSION || "v21.0";
const TOKEN = process.env.META_ACCESS_TOKEN || "";

// Teto de sondagens no modo padrão. Cada conta custa 1 requisição; sem teto, uma
// carteira grande viraria uma varredura lenta e silenciosa. O corte é REPORTADO.
const MAX_SONDAS = 40;
// LOTE_SONDA vem de @/lib/filaContas.
// Janela PADRÃO de gasto do modo ?accountId (veiculação só se afere por gasto > 0).
// Ajustável por chamada com ?dias=N — 30 responde "está rodando AGORA?", 120 responde
// "rodou em algum momento?". As duas perguntas aparecem em toda conciliação.
const DIAS_GASTO = 120;
const DIAS_GASTO_MAX = 365;

interface AdAccount {
  id: string;          // "act_123..."
  account_id: string;  // "123..."
  name: string;
  account_status: number;
}

// STATUS_ROTULO e bare() vêm de @/lib/filaContas.
const idDe = (m: AdAccount) => m.id || `act_${m.account_id}`;
const ymd = (d: Date) => d.toISOString().slice(0, 10);

/** Resultado da sonda por CONSULTA DIRETA — o teste que corresponde ao sync. */
interface Sonda {
  acessivelDireto: boolean;
  nomeNaMeta: string | null;
  status: number | null;
  statusRotulo: string | null;
  moeda: string | null;
  erro: string | null;
}

async function sondar(accountId: string): Promise<Sonda> {
  const vazio: Sonda = {
    acessivelDireto: false, nomeNaMeta: null, status: null,
    statusRotulo: null, moeda: null, erro: null,
  };
  try {
    const url = `https://graph.facebook.com/${API}/${accountId}`
      + `?fields=name,account_status,currency&access_token=${TOKEN}`;
    const r = await fetch(url, { cache: "no-store" });
    const j = await r.json();
    if (!r.ok) return { ...vazio, erro: String(j?.error?.message ?? `HTTP ${r.status}`).slice(0, 160) };
    return {
      acessivelDireto: true,
      nomeNaMeta: j.name ?? null,
      status: j.account_status ?? null,
      statusRotulo: STATUS_ROTULO[j.account_status] ?? null,
      moeda: j.currency ?? null,
      erro: null,
    };
  } catch (e) {
    return { ...vazio, erro: String(e).slice(0, 160) };
  }
}

/** Gasto dia a dia na janela — única prova de VEICULAÇÃO (status não serve). */
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
    if (!r.ok) return { erro: String(j?.error?.message ?? `HTTP ${r.status}`).slice(0, 160) };
    const dias = ((j.data ?? []) as { spend?: string; date_start: string }[])
      .filter((x) => Number(x.spend ?? 0) > 0);
    return {
      total: Number(dias.reduce((s, x) => s + Number(x.spend ?? 0), 0).toFixed(2)),
      diasComGasto: dias.length,
      ultimoDiaComGasto: dias.length ? dias[dias.length - 1].date_start : null,
      erro: null,
    };
  } catch (e) {
    return { erro: String(e).slice(0, 160) };
  }
}

// Roda as sondas em lotes pequenos (paralelo controlado).
async function emLotes<T, R>(itens: T[], n: number, fn: (x: T) => Promise<R>): Promise<R[]> {
  const out: R[] = [];
  for (let i = 0; i < itens.length; i += n) {
    out.push(...(await Promise.all(itens.slice(i, i + n).map(fn))));
  }
  return out;
}

// Busca as contas que o token LISTA (paginação do "next"). Serve para DESCOBRIR
// contas cujo id ninguém informou — não para afirmar acesso.
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

  const url = new URL(req.url);
  // `has`, não truthiness: com `?accountId=` (variável vazia na URL montada por
  // quem chama), a truthiness cairia no modo COMPARAÇÃO e devolveria 200 com o
  // relatório inteiro — quem pediu uma sondagem receberia outra coisa achando que
  // era a dele. Parâmetro presente e vazio é erro do chamador, e responde 400.
  const pediuSondagem = url.searchParams.has("accountId");
  const alvoParam = url.searchParams.get("accountId") ?? "";

  // ⚠️ A VARREDURA DE `contas` SÓ ACONTECE NO MODO COMPARAÇÃO, e é ele quem precisa
  // dela (compara o de-para INTEIRO contra o que o token lista). O modo sondagem
  // pagava as ~117 leituras para olhar 1 a 40 contas — varrer coleção a cada chamada
  // é justamente o padrão que o CLAUDE.md manda evitar. Corrigido em 20/08/2026.

  // =========================================================================
  // MODO SONDAGEM: ?accountId=act_1,act_2 — testa ids avulsos (ex.: os que a
  // agência mandou) pelas duas conferências, mais o gasto. É o modo usado ANTES
  // de cadastrar: responde "dá para cadastrar?" sem depender de me/adaccounts.
  // =========================================================================
  if (pediuSondagem) {
    const ids = alvoParam.split(",").map((s) => s.trim()).filter(Boolean)
      .map((s) => (s.startsWith("act_") ? s : `act_${s}`));
    if (!ids.length) {
      return NextResponse.json(
        { ok: false, erro: "accountId presente mas vazio — informe ao menos um id, ou omita o parâmetro para o modo comparação" },
        { status: 400 }
      );
    }
    if (ids.length > MAX_SONDAS) {
      return NextResponse.json(
        { ok: false, erro: `máximo de ${MAX_SONDAS} ids por chamada (recebi ${ids.length})` },
        { status: 400 }
      );
    }

    // ?dias=N — janela do gasto. Fora da faixa, cai no padrão em vez de errar:
    // o valor só muda o RECORTE de uma métrica, não o significado da resposta.
    const diasParam = Number(url.searchParams.get("dias"));
    const dias = Number.isFinite(diasParam) && diasParam >= 1
      ? Math.min(Math.floor(diasParam), DIAS_GASTO_MAX)
      : DIAS_GASTO;

    // ---------------------------------------------------------------------
    // BUSCA DIRIGIDA no de-para: só os ids pedidos, não a coleção inteira.
    // ---------------------------------------------------------------------
    // ⚠️⚠️ O FALLBACK NÃO É ZELO EXCESSIVO — SEM ELE A ROTA MENTE NA DIREÇÃO CARA.
    // O docId COSTUMA ser o accountId (docs novos), mas docs antigos têm outro docId
    // e o accountId só no campo — é por isso que `app/api/contas/route.ts` faz o mesmo
    // fallback. Se a busca por docId falhasse sozinha, a conta cadastrada apareceria
    // como `jaCadastrada: null` e `passaNasConferencias: true` — ou seja, a ferramenta
    // usada para decidir cadastro convidaria a cadastrar de novo o que já existe.
    // Errar para "já cadastrada" custa uma conferência; errar para "pode cadastrar"
    // custa uma conta duplicada no painel.
    const refs = ids.map((id) => db.collection("contas").doc(id));
    const porDocId = await db.getAll(...refs);
    const achadas = new Map<string, ContaMap>();
    porDocId.forEach((d, i) => { if (d.exists) achadas.set(bare(ids[i]), d.data() as ContaMap); });

    // Só os que o docId não resolveu pagam a consulta por campo.
    const faltantes = ids.filter((id) => !achadas.has(bare(id)));
    await Promise.all(faltantes.map(async (id) => {
      const q = await db.collection("contas").where("accountId", "==", id).limit(1).get();
      if (!q.empty) achadas.set(bare(id), q.docs[0].data() as ContaMap);
    }));

    const sondados = await emLotes(ids, LOTE_SONDA, async (id) => {
      const s = await sondar(id);
      const gasto = s.acessivelDireto ? await sondarGasto(id, dias) : null;
      const conta = achadas.get(bare(id));
      return {
        accountId: id,
        ...s,
        gasto,
        jaCadastrada: conta
          ? { cliente: conta.cliente ?? null, gestor: conta.gestor ?? null, pausado: !!conta.pausado }
          : null,
        // As duas conferências TÉCNICAS, já resolvidas — para ninguém precisar
        // reinterpretar os campos e errar de novo.
        // ⚠ NÃO é recomendação de cadastro: diz só que nada TÉCNICO impede. Se a
        // conta pertence a um cliente da carteira é decisão humana, contra a
        // planilha de monitoramento. A conta fantasma act_191616327202757 passava
        // nas duas conferências e mesmo assim não era cliente de ninguém.
        passaNasConferencias: s.acessivelDireto && s.moeda === MOEDA_ACEITA && !conta,
        motivo: !s.acessivelDireto ? "sem acesso — precisa de parceria de Business Manager"
          : conta ? "já está no de-para"
          : s.moeda !== MOEDA_ACEITA ? `moeda ${s.moeda} — o painel não converte moeda (ver data/README.md)`
          : null,
      };
    });

    return NextResponse.json({
      ok: true,
      apenasLeitura: true,
      modo: "sondagem",
      criterio: "consulta direta a /{accountId} e /{accountId}/insights — o mesmo caminho do sync",
      // Ecoa a janela USADA (não a pedida): quem lê o número sabe de que recorte ele é.
      janelaGastoDias: dias,
      // Custo declarado: quem lê sabe que esta chamada NÃO varreu a coleção.
      leiturasFirestore: `${ids.length} por docId + ${ids.length - achadas.size} por campo`,
      total: sondados.length,
      passamNasConferencias: sondados.filter((s) => s.passaNasConferencias).length,
      contas: sondados,
      consultadoEm: new Date().toISOString(),
    });
  }

  // =========================================================================
  // MODO PADRÃO: compara o de-para com o que o token LISTA, e sonda os dois lados
  // divergentes pela consulta direta.
  // =========================================================================
  // Aqui a varredura É a pergunta: comparar o de-para INTEIRO com o que o token lista.
  const snap = await db.collection("contas").get();
  const dePara: ContaMap[] = snap.docs.map((d) => d.data() as ContaMap);
  const deParaPorId = new Map(dePara.map((c) => [bare(c.accountId), c]));

  let metaContas: AdAccount[];
  try {
    metaContas = await buscarContasMeta();
  } catch (e) {
    return NextResponse.json({ ok: false, erro: "falha ao consultar o Meta", detalhe: String(e) }, { status: 502 });
  }
  const metaPorId = new Map(metaContas.map((m) => [bare(idDe(m)), m]));

  // NOVAS: o token LISTA e não estão no de-para. Ganham a moeda, senão o
  // diagnóstico responde só metade da regra de cadastro.
  const novasBruto = metaContas.filter((m) => !deParaPorId.has(bare(idDe(m))));
  const novasSondadas = novasBruto.slice(0, MAX_SONDAS);
  const novas = await emLotes(novasSondadas, LOTE_SONDA, async (m) => {
    const id = idDe(m);
    const s = await sondar(id);
    return {
      accountId: id,
      nome: m.name ?? null,
      status: m.account_status ?? null,
      statusRotulo: STATUS_ROTULO[m.account_status] ?? null,
      moeda: s.moeda,
      acessivelDireto: s.acessivelDireto,
      // Conferências TÉCNICAS apenas — ver a nota no modo sondagem.
      passaNasConferencias: s.acessivelDireto && s.moeda === MOEDA_ACEITA,
    };
  });

  // NÃO LISTADAS (antigo "sumidas"): estão no de-para e o token não LISTA. O nome
  // antigo sugeria que a conta tinha sumido/ficado inacessível — não é o que o dado
  // diz. Cada uma é sondada pela consulta direta para o retorno afirmar de fato.
  const naoListadasBruto = dePara.filter((c) => !metaPorId.has(bare(c.accountId)));
  const naoListadas = await emLotes(naoListadasBruto.slice(0, MAX_SONDAS), LOTE_SONDA, async (c) => {
    const s = await sondar(c.accountId);
    return {
      accountId: c.accountId,
      cliente: c.cliente ?? null,
      gestor: c.gestor ?? null,
      pausado: !!c.pausado,
      acessivelDireto: s.acessivelDireto,
      nomeNaMeta: s.nomeNaMeta,
      moeda: s.moeda,
      erro: s.erro,
    };
  });

  const cortadas = (novasBruto.length - novasSondadas.length)
    + Math.max(0, naoListadasBruto.length - MAX_SONDAS);

  return NextResponse.json({
    ok: true,
    apenasLeitura: true,
    modo: "comparacao",
    criterio:
      "`me/adaccounts` serve para DESCOBRIR contas; quem prova acesso é a consulta "
      + "direta (`acessivelDireto`), que é o caminho do sync. Não listada ≠ inacessível.",
    dica: "Para testar ids avulsos: ?accountId=act_1,act_2 (traz moeda, status e gasto). "
      + `Janela do gasto ajustável com &dias=N (padrão ${DIAS_GASTO}, teto ${DIAS_GASTO_MAX}): `
      + "30 responde 'está rodando agora?', 120 responde 'rodou em algum momento?'.",
    totalListadasNoMeta: metaContas.length,
    totalNoDePara: snap.size,
    // Contagem honesta do que o corte deixou de fora (0 = nada foi omitido).
    sondasOmitidasPeloTeto: cortadas,
    novas,
    naoListadas,
    naoListadasMensagem: naoListadas.length === 0
      ? "Todas as contas do de-para aparecem em me/adaccounts."
      : `${naoListadas.filter((n) => n.acessivelDireto).length} de ${naoListadas.length} não aparecem em `
        + "me/adaccounts mas RESPONDEM à consulta direta — essas sincronizam normalmente.",
    consultadoEm: new Date().toISOString(),
  });
}
