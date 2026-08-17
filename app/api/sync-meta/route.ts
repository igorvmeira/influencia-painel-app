import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { buscarDiario, buscarLimiteConta, buscarDiarioPorConjunto, somarPorGrupoDia, somarPorDia } from "@/lib/meta";
import { ContaMap, GrupoDia, MetricaDiaria } from "@/lib/types";
import { COL_AGREGADAS, COL_CONJUNTOS, RETENCAO_DIAS, cutoffRetencao, mesclarDias, mesclarGrupos } from "@/lib/agregadas";
import { checarCronSecret } from "@/lib/cronAuth";
import { descobrirContas } from "@/lib/descobrirContas";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

// Janela padrão de dias sincronizados (fácil de mudar).
// Pode ser sobrescrita por ?dias=N na chamada — útil para conta NOVA, que não tem
// histórico anterior para o mesclarDias acumular: sem isso ela nasceria com apenas
// JANELA_DIAS de série, aparecendo TRUNCADA (e sem aviso) em períodos maiores.
const JANELA_DIAS = 30;
// Teto de segurança da janela: acima da retenção do agregado não há ganho.
const JANELA_MAX = 130;

// Janela para conta NOVA (nunca sincronizada). Alinhada com a retenção do agregado:
// puxar mais que RETENCAO_DIAS seria descartado pelo mesclarDias na hora de gravar.
const JANELA_NOVA = RETENCAO_DIAS;

// Quantas contas novas (janela cheia) podem rodar numa MESMA chamada.
// Puxar ~95 dias é bem mais pesado que 30; se muitas contas novas entrarem juntas,
// o bloco arriscaria estourar o tempo da função. As excedentes são ADIADAS —
// deliberadamente NÃO sincronizadas neste bloco, e não sincronizadas com 30 dias.
// Motivo: sincronizar com 30 criaria o doc agregado e a conta ficaria travada como
// "já tem histórico", truncada em definitivo e em silêncio. Pular preserva o estado
// de "nova", então a próxima execução do sync a pega com a janela cheia.
// ⚠️ CAIU DE 3 PARA 1 EM 16/08/2026, junto do dual-write por conjunto. Com
// `level=adset` a janela cheia pagina de verdade: uma conta com 20 conjuntos e 95
// dias dá ~1.900 linhas = 4 requisições sequenciais onde antes era 1, mais ~4x as
// gravações. Três dessas na mesma chamada estouram o teto da Vercel grátis.
// Uma por chamada mantém o custo previsível; a próxima execução pega a seguinte.
const MAX_NOVAS_POR_CHAMADA = 1;

/**
 * Tolerância da conferência de identidade, em R$ por dia.
 *
 * O gasto vem como string por linha; somar 20 conjuntos e comparar com o total da
 * conta pode diferir por centavos de ponto flutuante. Conversão é inteiro e a
 * comparação dela é EXATA — sem tolerância nenhuma.
 */
const TOLERANCIA_GASTO = 0.02;
// Quantas contas processar por chamada (cabe no limite de 10s da Vercel free).
const LIMITE_PADRAO = 20;
// Abaixo do limite de 500 operações por batch do Firestore.
const LOTE = 450;

// Orçamento de tempo da descoberta de contas novas (etapa secundária — ver abaixo).
// Curto de propósito: ela anda no bloco FINAL, que já é o mais barato, e mesmo assim
// não pode empurrar a chamada para fora do teto da Vercel grátis.
const DESCOBERTA_MS = 4000;

interface Divergencia {
  accountId: string;
  cliente: string;
  data: string;
  campo: "gasto" | "leadsForm" | "convWhats";
  conta: number;
  conjuntos: number;
}

/**
 * A CONFERÊNCIA DE IDENTIDADE: soma dos conjuntos = total da conta, dia a dia.
 *
 * ⚠️ ISTO É IDENTIDADE, NÃO COMPARAÇÃO CONTRA FOTO — e a distinção é a que decide se
 * um alarme serve. As duas fontes são requisições INDEPENDENTES à Meta (level=account
 * e level=adset) sobre a mesma janela: a soma tem que fechar em qualquer dia, para
 * sempre. Se quebrar, é bug de verdade — apelido de conversão contado duas vezes,
 * conjunto que a listagem não devolveu, paginação truncada. Por isso derruba o job.
 * (Compare com o `tudoBate` do sync-comercial, que confronta uma foto de referência e
 * diverge sozinho porque a base é viva — esse só serve de contexto.)
 *
 * ⚠️ O DIA MAIS RECENTE FICA FORA, e isso NÃO é teoria — foi medido. Em 17/08/2026 a
 * PLIQ voltou com 0 formulários no level=account e 2 no level=adset, com o gasto
 * idêntico: as duas chamadas acontecem ~1s apart, o adset vem depois, e a Meta
 * atribuiu duas conversões no meio. Divergência do relógio, não do código. Alarme que
 * dispara todo dia vira ruído que ninguém lê — e este precisa continuar sendo lido.
 *
 * ⚠️ E O QUE NÃO É CONFERIDO NÃO É GRAVADO: o mesmo dia excluído aqui é excluído do
 * `porGrupo`. Senão o agregado guardaria uma quebra que CONTRADIZ o próprio total —
 * duas somas na mesma tela que não fecham, que é o pior tipo de defeito porque o erro
 * é pequeno e invisível. A quebra fica um dia atrás do total, de propósito, e o campo
 * `porGrupoAte` diz até onde ela vale.
 *
 * ⚠️ E SÓ CONFERE OS DIAS QUE OS DOIS LADOS TÊM. Dia presente num lado e ausente no
 * outro não é divergência de valor: no level=account um dia sem gasto pode simplesmente
 * não vir, e tratar ausência como zero inventaria uma diferença que não existe.
 */
function conferir(
  c: ContaMap,
  registros: MetricaDiaria[],
  conjuntos: Awaited<ReturnType<typeof buscarDiarioPorConjunto>>,
  maisRecente: string
): { diasConferidos: number; divergencias: Divergencia[] } {
  const porDiaConjunto = somarPorDia(conjuntos);
  const divergencias: Divergencia[] = [];
  let diasConferidos = 0;

  for (const r of registros) {
    if (r.data === maisRecente) continue;
    const a = porDiaConjunto.get(r.data);
    if (!a) continue; // ver a nota sobre dia ausente
    diasConferidos++;
    const base = { accountId: c.accountId, cliente: c.cliente ?? "", data: r.data };
    if (Math.abs(r.gasto - a.gasto) > TOLERANCIA_GASTO) {
      divergencias.push({ ...base, campo: "gasto", conta: r.gasto, conjuntos: a.gasto });
    }
    // Conversão é inteiro: comparação EXATA, sem tolerância. É aqui que um apelido
    // duplicado no nível de conjunto apareceria.
    if (r.leadsForm !== a.leadsForm) {
      divergencias.push({ ...base, campo: "leadsForm", conta: r.leadsForm, conjuntos: a.leadsForm });
    }
    if (r.convWhats !== a.convWhats) {
      divergencias.push({ ...base, campo: "convWhats", conta: r.convWhats, conjuntos: a.convWhats });
    }
  }
  return { diasConferidos, divergencias };
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const contasSnap = await db.collection("contas").get();
  // Ordena por accountId para que o offset seja estável entre chamadas.
  const contas: ContaMap[] = contasSnap.docs
    .map((d) => d.data() as ContaMap)
    .sort((a, b) => a.accountId.localeCompare(b.accountId));
  if (!contas.length) {
    return NextResponse.json({ erro: "nenhuma conta no de-para (coleção 'contas')" }, { status: 400 });
  }

  const total = contas.length;
  const offset = Math.max(0, Number(url.searchParams.get("offset")) || 0);
  const limiteParam = Number(url.searchParams.get("limite"));
  const limite = Number.isFinite(limiteParam) && limiteParam > 0 ? limiteParam : LIMITE_PADRAO;

  // Janela de dias desta chamada (?dias=N). Quando ausente, a janela é decidida POR
  // CONTA: cheia se a conta nunca foi sincronizada, JANELA_DIAS se já tem histórico.
  // O cron não passa ?dias, então segue em 30 para a carteira estabelecida.
  const diasParam = Number(url.searchParams.get("dias"));
  const diasExplicito = Number.isFinite(diasParam) && diasParam > 0
    ? Math.min(Math.floor(diasParam), JANELA_MAX)
    : null;

  // Alvo por IDENTIDADE (?accountId=act_1,act_2), não por posição. Offset é frágil:
  // a ordenação muda quando contas entram/saem, e a chamada acertaria OUTRA conta
  // reportando sucesso — deixando a pretendida truncada sem ninguém perceber.
  const alvoParam = (url.searchParams.get("accountId") || "").trim();
  let bloco: ContaMap[];
  if (alvoParam) {
    const pedidos = alvoParam.split(",").map((s) => s.trim()).filter(Boolean);
    const porId = new Map(contas.map((c) => [c.accountId, c]));
    const achados = pedidos.filter((id) => porId.has(id));
    const naoAchados = pedidos.filter((id) => !porId.has(id));
    // FALHA EXPLÍCITA: id inexistente não pode passar como "sucesso".
    if (naoAchados.length) {
      return NextResponse.json(
        { ok: false, erro: "accountId não encontrado no de-para", naoEncontrados: naoAchados },
        { status: 400 }
      );
    }
    bloco = achados.map((id) => porId.get(id)!);
  } else {
    bloco = contas.slice(offset, offset + limite);
  }

  const col = db.collection("metricasDiarias");
  const colLimites = db.collection("limitesConta");
  const colConjuntos = db.collection(COL_CONJUNTOS);

  // ---- Pré-passo: quem do bloco é conta NOVA (sem doc agregado)? ----
  // Uma leitura em lote (getAll) resolve o bloco inteiro; o snapshot é reaproveitado
  // dentro de processarConta, então nenhuma conta é lida duas vezes.
  const snapsAgg = bloco.length
    ? await db.getAll(...bloco.map((c) => db!.collection(COL_AGREGADAS).doc(c.accountId)))
    : [];
  const aggPorConta = new Map(bloco.map((c, i) => [c.accountId, snapsAgg[i]]));
  const novasNoBloco = bloco.filter((c) => !aggPorConta.get(c.accountId)?.exists);

  // Aplica o teto: as primeiras rodam com janela cheia, as excedentes são ADIADAS
  // (puladas por inteiro — ver comentário de MAX_NOVAS_POR_CHAMADA).
  const adiadas = diasExplicito === null ? novasNoBloco.slice(MAX_NOVAS_POR_CHAMADA) : [];
  const idsAdiados = new Set(adiadas.map((c) => c.accountId));
  const aProcessar = bloco.filter((c) => !idsAdiados.has(c.accountId));

  // Processa cada conta do bloco e grava logo que termina, para nunca perder
  // o progresso já feito. Em paralelo para caber no tempo limite.
  async function processarConta(c: ContaMap): Promise<{
    accountId: string; cliente: string; registros: number;
    diasNoAgregado: number; maisAntigo: string | null;
    janelaUsada: number; janelaCheia: boolean;
    conjuntos: number; grupos: number;
    conferencia: { diasConferidos: number; divergencias: Divergencia[] };
  }> {
    // Snapshot já lido no pré-passo (getAll) — é ele que decide a janela.
    const aggRef = db!.collection(COL_AGREGADAS).doc(c.accountId);
    const aggSnap = aggPorConta.get(c.accountId)!;

    // CONTA NOVA = documento agregado INEXISTENTE. Não é "array vazio": o sync
    // grava o doc mesmo quando a conta não teve nenhum dia com gasto, então uma
    // conta que nunca gastou tem doc com dias:[] e NÃO volta a disparar a janela
    // cheia todo dia. Só entra aqui quem nunca foi sincronizada.
    const semHistorico = !aggSnap.exists;
    // ?dias explícito manda; senão, janela cheia para conta nova, 30 para as demais.
    const janelaDaConta = diasExplicito ?? (semHistorico ? JANELA_NOVA : JANELA_DIAS);

    const registros = await buscarDiario(c.accountId, janelaDaConta);
    for (let i = 0; i < registros.length; i += LOTE) {
      const batch = db!.batch();
      for (const m of registros.slice(i, i + LOTE)) {
        batch.set(col.doc(`${m.accountId}_${m.data}`), m, { merge: true });
      }
      await batch.commit();
    }

    /**
     * ETAPA 1 DO DUAL-WRITE — a mesma janela quebrada por CONJUNTO DE ANÚNCIOS.
     *
     * ⚠️ DEPOIS do buscarDiario, e não em paralelo com ele: o bloco já roda 10 contas
     * simultâneas, cada uma disparando insights + limite. Somar uma terceira chamada
     * em paralelo levaria o pico de 20 para 30 requisições em voo, e a sondagem de
     * 16/08 tomou "Application request limit reached" duas vezes — o limite da Meta
     * pesa VOLUME de dado, e level=adset devolve 3x mais. Sequencial dentro da conta
     * mantém o pico igual ao de hoje e custa ~800ms a mais por conta.
     *
     * ⚠️ NÃO DERRUBA A CONTA se falhar. A linha conta-dia já está gravada acima e é
     * ela que alimenta o app inteiro; a quebra por grupo ainda não alimenta tela
     * nenhuma. Perder a quebra de uma conta num dia é adiar uma feature; perder a
     * métrica é fazer o painel mentir.
     */
    let conjuntos: Awaited<ReturnType<typeof buscarDiarioPorConjunto>> = [];
    let porGrupoFresco: GrupoDia[] = [];
    let diaParcial: string | null = null;
    let conferencia: { diasConferidos: number; divergencias: Divergencia[] } = {
      diasConferidos: 0, divergencias: [],
    };
    let falhaConjunto: string | null = null;
    try {
      conjuntos = await buscarDiarioPorConjunto(c.accountId, janelaDaConta);
      // O dia mais recente da janela, calculado UMA vez e usado pelos TRÊS lados — a
      // conferência, o filtro do fresco e o teto do merge. Separados, poderiam
      // divergir, e aí o agregado guardaria um dia que ninguém conferiu.
      let maisRecente = "";
      for (const r of registros) if (r.data > maisRecente) maisRecente = r.data;
      for (const l of conjuntos) if (l.data > maisRecente) maisRecente = l.data;
      diaParcial = maisRecente || null;

      porGrupoFresco = somarPorGrupoDia(conjuntos).filter((g) => g.data < maisRecente);
      conferencia = conferir(c, registros, conjuntos, maisRecente);

      for (let i = 0; i < conjuntos.length; i += LOTE) {
        const batch = db!.batch();
        for (const m of conjuntos.slice(i, i + LOTE)) {
          // docId determinístico: rodar de novo atualiza, nunca duplica.
          batch.set(colConjuntos.doc(`${m.accountId}_${m.adsetId}_${m.data}`), m, { merge: true });
        }
        await batch.commit();
      }
    } catch (e) {
      falhaConjunto = String(e).slice(0, 200);
      console.error(`[sync-meta] quebra por conjunto falhou em ${c.accountId}:`, e);
    }

    // Item 3 — projeção agregada (1 doc/conta). metricasDiarias acima segue como
    // fonte granular; aqui só derivamos a série pro painel ler ~85 docs, não ~4.6k.
    // Merge dos dias frescos sobre os antigos (read-modify-write; blocos do sync
    // tocam contas distintas, então não há concorrência no mesmo doc).
    const antigos = (aggSnap.exists ? (aggSnap.data()?.dias as MetricaDiaria[] | undefined) : undefined) ?? [];
    const dias = mesclarDias(antigos, registros, cutoffRetencao());

    /**
     * ⚠️ `dias` NÃO MUDA — nem de conteúdo nem de forma. `porGrupo` entra como campo
     * PARALELO, para o Dashboard, a /gestores e a Início continuarem lendo o que já
     * leem, sem migração de leitura. É a Etapa 1: escrever nos dois lugares e não
     * tocar em quem lê.
     *
     * ⚠️ Quando a busca do conjunto falha, `porGrupo` é PRESERVADO (não sobrescrito
     * com vazio): array vazio diria "esta conta não tem conjunto nenhum", que é
     * afirmação diferente de "não deu para buscar".
     */
    const gruposAntigos = (aggSnap.exists ? (aggSnap.data()?.porGrupo as GrupoDia[] | undefined) : undefined) ?? [];
    const porGrupo = falhaConjunto
      ? gruposAntigos.filter((g) => g.data >= cutoffRetencao())
      : mesclarGrupos(gruposAntigos, porGrupoFresco, cutoffRetencao(), diaParcial);

    // Até onde a quebra vale. Fica UM dia atrás de `dias` de propósito — ver
    // `conferir`. Quem consumir a quebra rotula a janela por este campo, nunca
    // assumindo que ela cobre o mesmo período que o total.
    const porGrupoAte = porGrupo.length ? porGrupo[porGrupo.length - 1].data : null;

    await aggRef.set({
      accountId: c.accountId, dias, porGrupo, porGrupoAte,
      atualizadoEm: new Date().toISOString(),
    });

    // Teto de gasto (spend_cap) e gasto acumulado (amount_spent) da conta, para o
    // alerta de limite. É secundário: se falhar, não perde o sync diário acima.
    try {
      const lim = await buscarLimiteConta(c.accountId);
      await colLimites.doc(c.accountId).set(
        {
          accountId: c.accountId,
          spendCap: lim.spendCap,
          amountSpent: lim.amountSpent,
          isPrepay: lim.isPrepay,
          atualizadoEm: new Date().toISOString(),
        },
        { merge: true }
      );
    } catch {
      // ignora: o teto é secundário em relação às métricas diárias
    }

    // Devolve a IDENTIDADE do que foi sincronizado (nome + accountId) e o estado
    // resultante do agregado — para conferir que a chamada acertou a conta certa.
    return {
      accountId: c.accountId,
      cliente: c.cliente ?? "",
      registros: registros.length,
      diasNoAgregado: dias.length,
      maisAntigo: dias.length ? dias[0].data : null, // mesclarDias devolve ordenado asc
      janelaUsada: janelaDaConta,
      janelaCheia: semHistorico,
      conjuntos: conjuntos.length,
      grupos: new Set(porGrupoFresco.map((g) => g.grupo)).size,
      conferencia,
      ...(falhaConjunto ? { falhaConjunto } : {}),
    };
  }

  const resultados = await Promise.allSettled(aProcessar.map(processarConta));

  let processadas = 0;
  let registros = 0;
  const sincronizadas: Awaited<ReturnType<typeof processarConta>>[] = [];
  const erros: { accountId: string; erro: string }[] = [];
  resultados.forEach((r, i) => {
    if (r.status === "fulfilled") { processadas++; registros += r.value.registros; sincronizadas.push(r.value); }
    else erros.push({ accountId: aProcessar[i].accountId, erro: String(r.reason) });
  });

  // ---- CONFERÊNCIA DE IDENTIDADE consolidada do bloco (ver `conferir`) ----
  const divergencias = sincronizadas.flatMap((s) => s.conferencia.divergencias);
  const conferencia = {
    diasConferidos: sincronizadas.reduce((t, s) => t + s.conferencia.diasConferidos, 0),
    contasConferidas: sincronizadas.filter((s) => s.conferencia.diasConferidos > 0).length,
    // ⚠️ ESTE é o campo que o workflow olha para derrubar o job. Identidade quebrada
    // significa bug — nunca deriva sozinha com o tempo.
    identidadeOk: divergencias.length === 0,
    divergencias: divergencias.slice(0, 20),
    divergenciasTotal: divergencias.length,
    // Falha de rede na quebra por conjunto NÃO é divergência de identidade: não houve
    // o que comparar. Aparece separado, para o workflow avisar sem reprovar.
    falhasNaQuebra: sincronizadas
      .filter((s) => (s as { falhaConjunto?: string }).falhaConjunto)
      .map((s) => ({ accountId: s.accountId, cliente: s.cliente, erro: (s as { falhaConjunto?: string }).falhaConjunto })),
  };

  const fim = offset + limite;
  const proximoOffset = fim < total ? fim : null;

  // Registra o horário desta sincronização para o rodapé do painel.
  // Grava a cada chamada (inclusive nas incrementais), então o valor exibido
  // reflete a atividade de sync mais recente.
  const atualizadoEm = new Date().toISOString();
  await db.collection("sistema").doc("sync").set({ atualizadoEm }, { merge: true });

  // Contas novas que receberam janela cheia nesta chamada — visível no retorno,
  // para não passar despercebido que uma conta entrou com histórico completo.
  const comJanelaCheia = sincronizadas.filter((s) => s.janelaCheia);

  // =========================================================================
  // ETAPA SECUNDÁRIA: DESCOBERTA DE CONTAS NOVAS (fila de aprovação)
  // =========================================================================
  // ⚠️ NUNCA CADASTRA NADA. Só lista o que o token enxerga e ainda não está no
  // de-para, para uma pessoa decidir na tela /fila-contas.
  //
  // ⚠️ RODA NO ÚLTIMO BLOCO da varredura por offset, uma vez por sincronização.
  // O último bloco é o mais barato (sobra da divisão), e assim a descoberta não se
  // repete a cada chamada — cada candidata custa 2 requisições ao Meta.
  //
  // ⚠️ E FALHA SEM DERRUBAR O SYNC. Métrica errada faz o painel mentir; fila
  // desatualizada só adia um cadastro. `descobrirContas` já não lança, e o try
  // aqui é a segunda rede — o `catch` só existe para o sync nunca virar 500 por
  // causa da etapa secundária. O resultado aparece no retorno de qualquer jeito.
  const pediuDescoberta = url.searchParams.get("descobrir");
  const rodarDescoberta = pediuDescoberta === "1"
    || (pediuDescoberta !== "0" && !alvoParam && proximoOffset === null);
  let descoberta: { ok: boolean; candidatas?: number; cortadas?: number; erro?: string | null } | null = null;
  if (rodarDescoberta) {
    try {
      const fila = await descobrirContas(db, { orcamentoMs: DESCOBERTA_MS });
      descoberta = {
        ok: !fila.erro,
        candidatas: fila.candidatas.length,
        cortadas: fila.cortadasPeloTeto,
        erro: fila.erro,
      };
    } catch (e) {
      console.error("[sync-meta] descoberta de contas falhou:", e);
      descoberta = { ok: false, erro: String(e).slice(0, 200) };
    }
  }

  return NextResponse.json({
    ok: true,
    janelaPadrao: JANELA_DIAS,
    janelaNova: JANELA_NOVA,
    janelaExplicita: diasExplicito,  // null = decidida por conta
    modoAlvo: alvoParam ? "accountId" : "offset",
    ...(alvoParam ? {} : { offset, limite, proximoOffset }),
    totalContas: total,
    contasNoBloco: bloco.length,
    processadas,
    registros,
    // Log visível da detecção automática.
    novasDetectadas: novasNoBloco.length,
    novasComJanelaCheia: comJanelaCheia.map((s) => ({
      accountId: s.accountId, cliente: s.cliente, janelaUsada: s.janelaUsada,
      diasNoAgregado: s.diasNoAgregado, maisAntigo: s.maisAntigo,
    })),
    // Adiadas: NÃO sincronizadas neste bloco (nem com janela curta). Seguem "novas"
    // e a próxima execução do sync as pega com a janela cheia.
    adiadas: adiadas.map((c) => ({ accountId: c.accountId, cliente: c.cliente ?? "" })),
    sincronizadas,                 // identidade + estado do agregado, por conta
    // Dual-write por conjunto (Etapa 1). `identidadeOk: false` = bug, derruba o job.
    conferencia,
    erros,
    // null = não rodou nesta chamada (não era o bloco final). ok:false NÃO reprova
    // o sync — é etapa secundária, e o workflow só avisa.
    descoberta,
    atualizadoEm,
  });
}
