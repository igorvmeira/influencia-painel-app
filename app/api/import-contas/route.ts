import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import fonte from "@/data/contas.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450; // abaixo do limite de 500 operações por batch do Firestore

// Lista oficial da carteira: NOME, TIPO e NICHO de cada conta de anúncio. Rode esta rota
// sempre que o data/contas.json mudar (idempotente e não-destrutiva).
//
// 🛑 DESDE O CUTOVER DE 14/09/2026 O IMPORT NÃO CUIDA DE `gestor` NEM DE `pausado`.
// Os dois campos tinham duas origens — o JSON e a planilha/tela — e duas origens para o
// mesmo campo divergem sem ninguém ver. Medido naquele dia: rodar o import antigo com
// `aplicar=1` devolveria CAFÉ JEQUITINHONHA ao ANDRÉ e COPYNORTE ao JOÃO PEDRO, desfazendo
// trocas da planilha e gravando a volta no `gestorHistorico`, que é append-only. Hoje o
// gestor vem da planilha (/conciliacao) ou da /carteira, e `pausado` vem de estacionar na
// /carteira. As travas que protegiam esses campos DAQUI (`gestorEditadoEm`, e a marca
// `gestorDaPlanilha`) deixaram de ter assunto neste arquivo e saíram junto.
//
// ⚠️ E O IMPORT NÃO CRIA CONTA. Criar exige gestor, e ele não está mais aqui. Conta que
// está no JSON e não no banco sai em `naoCadastradas`, com o caminho escrito.
//
// ESCOPO: o painel cobre APENAS Meta Ads. Cliente que anuncia só no Google Ads não
// entra aqui — não é conta faltando, é fora de escopo (ex.: LAVE MAIS EXPRESS,
// CHRISTIANE ROBINE). Cadastrá-lo criaria uma conta permanentemente zerada na tela.
// Ver data/README.md para o escopo, as regras do de-para e o checklist de conta nova.
interface ContaFonte {
  accountId: string;
  cliente: string;
  tipo?: string;
  nicho?: string;
}

/**
 * Campos que o JSON NÃO pode mais trazer.
 *
 * ⚠️ Linha no formato antigo — colada de um commit velho, de outra branch, de um print —
 * faria alguém achar que trocou gestor ou pausou uma conta por aqui, e o import ignoraria
 * em silêncio. Ignorar calado é o pior dos três desfechos: a pessoa sai convencida de que
 * fez. Por isso o `aplicar` é RECUSADO enquanto houver uma linha assim, e a prévia lista
 * quais são.
 */
const CAMPOS_FORA_DO_ESCOPO = ["gestor", "pausado"] as const;

// Campos gravados no de-para (merge — não apaga outros campos existentes).
function payloadDe(c: ContaFonte) {
  return {
    accountId: c.accountId,
    cliente: c.cliente ?? "",
    tipo: c.tipo ?? "",
    nicho: c.nicho ?? "",
    ativo: true,
  };
}

// Timestamp do Firestore (ou ISO) → "DD/MM" para o relatório da prévia.
function dataBR(v: unknown): string {
  const d =
    v && typeof (v as { toDate?: unknown }).toDate === "function"
      ? (v as { toDate: () => Date }).toDate()
      : typeof v === "string"
        ? new Date(v)
        : null;
  if (!d || isNaN(d.getTime())) return "";
  return `${String(d.getDate()).padStart(2, "0")}/${String(d.getMonth() + 1).padStart(2, "0")}`;
}

// Quais dos campos gravados mudariam em relação ao doc existente.
function camposQueMudam(existente: Record<string, unknown>, c: ContaFonte): string[] {
  const alvo = payloadDe(c);
  const campos: string[] = [];
  for (const k of ["cliente", "tipo", "nicho"] as const) {
    if ((existente[k] ?? "") !== alvo[k]) campos.push(k);
  }
  if (existente.ativo !== true) campos.push("ativo");
  return campos;
}

export async function GET(req: Request) {
  const bloqueio = checarCronSecret(req);
  if (bloqueio) return bloqueio;

  const url = new URL(req.url);
  const db = getDb();
  if (!db) return NextResponse.json({ erro: "Firebase não configurado" }, { status: 500 });

  const aplicar = url.searchParams.get("aplicar") === "1";

  // Fonte oficial (ignora itens sem accountId).
  const brutos = (fonte as unknown as Record<string, unknown>[]).filter((c) => c && c.accountId);
  const itens = brutos as unknown as ContaFonte[];

  // Linhas no formato antigo — ver `CAMPOS_FORA_DO_ESCOPO`.
  const foraDoEscopo = brutos
    .filter((c) => CAMPOS_FORA_DO_ESCOPO.some((k) => k in c))
    .map((c) => ({
      accountId: String(c.accountId),
      cliente: String(c.cliente ?? ""),
      campos: CAMPOS_FORA_DO_ESCOPO.filter((k) => k in c),
    }));
  if (aplicar && foraDoEscopo.length) {
    return NextResponse.json({
      ok: false,
      erro: `${foraDoEscopo.length} linha(s) do data/contas.json ainda trazem gestor ou pausado. `
        + "O import não cuida mais desses campos desde 14/09/2026 — o gestor vem da planilha ou da "
        + "/carteira, e pausado vem de estacionar na /carteira. Tire os campos das linhas e rode de novo.",
      foraDoEscopo,
    }, { status: 409 });
  }

  const col = db.collection("contas");

  // De-para atual. Indexa PELO CAMPO accountId (não assume o formato do docId).
  const snap = await col.get();
  const porAccountId = new Map<string, { id: string; data: Record<string, unknown> }>();
  for (const d of snap.docs) {
    const data = d.data() as Record<string, unknown>;
    const chave = (data.accountId as string) || d.id;
    porAccountId.set(chave, { id: d.id, data });
  }

  const idsFonte = new Set(itens.map((c) => c.accountId));

  const naoCadastradas: { accountId: string; cliente: string }[] = [];
  const atualizadas: { accountId: string; cliente: string; campos: string[] }[] = [];
  const inalteradas: { accountId: string; cliente: string }[] = [];
  // Fila de gravações (aplicada só no modo aplicar).
  const gravacoes: { docId: string; dados: Record<string, unknown> }[] = [];

  for (const c of itens) {
    const existente = porAccountId.get(c.accountId);
    if (!existente) {
      // Não cria: ver o cabeçalho. Vai para a lista com o caminho escrito.
      naoCadastradas.push({ accountId: c.accountId, cliente: c.cliente ?? "" });
      continue;
    }
    const campos = camposQueMudam(existente.data, c);
    if (campos.length === 0) {
      inalteradas.push({ accountId: c.accountId, cliente: c.cliente ?? "" });
    } else {
      atualizadas.push({ accountId: c.accountId, cliente: c.cliente ?? "", campos });
      // Atualiza o doc existente (qualquer que seja o docId dele).
      gravacoes.push({ docId: existente.id, dados: payloadDe(c) });
    }
  }

  // =========================================================================
  // CONTAS CADASTRADAS PELA TELA (/fila-contas)
  // =========================================================================
  // ⚠️ ELAS NÃO SÃO ÓRFÃS, e essa distinção é o ponto todo. Órfã é doc que ninguém
  // sabe de onde veio; estas nasceram no Firestore de propósito, com autor e data,
  // marcadas por `origemCadastro: "tela"`. Chamá-las de órfãs treinaria quem lê o
  // relatório a ignorar a lista de órfãs — que é justamente onde uma sujeira real
  // apareceria.
  //
  // ⚠️ E A SEÇÃO APARECE SEMPRE, MESMO VAZIA (exigência do Igor, 16/08/2026). Vazia
  // ela diz "zero cadastradas pela tela"; se sumisse quando não há nenhuma, ninguém
  // aprenderia que a divergência entre o JSON e o Firestore é possível — e o dia em
  // que ela existisse seria o primeiro em que alguém veria a seção.
  const docs = snap.docs.map((d) => d.data() as Record<string, unknown>);
  const naFonte = (data: Record<string, unknown>) => idsFonte.has((data.accountId as string) || "");

  const cadastradasPelaTela = docs
    .filter((data) => data.origemCadastro === "tela")
    .map((data) => ({
      accountId: (data.accountId as string) ?? null,
      cliente: (data.cliente as string) ?? null,
      gestor: (data.gestor as string) ?? null,
      por: (data.cadastradaPor as string) ?? null,
      em: dataBR(data.cadastradaEm),
      // Já reconciliada = a linha foi colada no data/contas.json. A partir daí o import
      // passa a cuidar do nome, tipo e nicho dela; a marca só fica como origem.
      noJson: naFonte(data),
    }));
  const foraDoJson = cadastradasPelaTela.filter((c) => !c.noJson);

  // Órfãs: docs no de-para que NÃO estão na fonte e que ninguém declarou. Nunca
  // apagadas nem alteradas — a lista existe para uma pessoa decidir.
  const orfas = docs
    .filter((data) => !naFonte(data) && data.origemCadastro !== "tela")
    .map((data) => ({ accountId: (data.accountId as string) ?? null, cliente: (data.cliente as string) ?? null }));

  // MODO APLICAR: grava só as atualizadas (merge). Inalteradas não geram escrita.
  let gravadas = 0;
  if (aplicar && gravacoes.length) {
    for (let i = 0; i < gravacoes.length; i += LOTE) {
      const batch = db.batch();
      for (const g of gravacoes.slice(i, i + LOTE)) {
        batch.set(col.doc(g.docId), g.dados, { merge: true });
      }
      await batch.commit();
      gravadas += Math.min(LOTE, gravacoes.length - i);
    }
  }

  return NextResponse.json({
    ok: true,
    modo: aplicar ? "aplicar" : "previa",
    // O que este import cuida, dito na resposta — quem lê o relatório não lê o código.
    escopo: "Desde 14/09/2026 o import cuida só de cliente, tipo e nicho. Gestor vem da planilha "
      + "(/conciliacao) ou da /carteira; pausado vem de estacionar na /carteira. Ele não cria conta.",
    totalNaFonte: itens.length,
    totalNoDePara: snap.size,
    resumo: {
      atualizadas: atualizadas.length,
      inalteradas: inalteradas.length,
      naoCadastradas: naoCadastradas.length,
      orfas: orfas.length,
      // Contas nascidas na tela /fila-contas. `foraDoJson` é o número que importa:
      // é o tamanho da divergência entre o data/contas.json e o Firestore.
      cadastradasPelaTela: cadastradasPelaTela.length,
      cadastradasPelaTelaForaDoJson: foraDoJson.length,
      // Linhas no formato antigo. Maior que zero = o aplicar é recusado.
      linhasForaDoEscopo: foraDoEscopo.length,
      gravadas: aplicar ? gravadas : 0,
    },
    // SEÇÃO OBRIGATÓRIA — nunca some, nem quando é zero.
    naoCadastradas: {
      mensagem: naoCadastradas.length === 0
        ? "Toda linha do data/contas.json já existe no banco."
        : `${naoCadastradas.length} linha(s) do data/contas.json não existem no banco, e o import não cria conta. `
          + "Cadastre pela /fila-contas (ou pela /conciliacao, se a conta estiver na planilha) — lá entra o gestor.",
      contas: naoCadastradas,
    },
    foraDoEscopo: {
      mensagem: foraDoEscopo.length === 0
        ? "Nenhuma linha traz gestor ou pausado."
        : `${foraDoEscopo.length} linha(s) ainda trazem gestor ou pausado — o aplicar é recusado até elas saírem.`,
      linhas: foraDoEscopo,
    },
    // SEÇÃO OBRIGATÓRIA — nunca some, nem quando é zero. Ver o comentário acima.
    cadastradasPelaTela: {
      mensagem: cadastradasPelaTela.length === 0
        ? "Zero contas cadastradas pela tela — o data/contas.json é a lista inteira da carteira."
        : `${cadastradasPelaTela.length} conta(s) nasceram na tela /fila-contas. `
          + (foraDoJson.length === 0
            ? "Todas já estão no data/contas.json — não há divergência."
            : `${foraDoJson.length} ainda NÃO está(ão) no data/contas.json: o arquivo não é mais a `
              + "lista completa da carteira. Para reconciliar, cole a linha de cada uma no JSON "
              + "(o botão 'copiar linha do JSON' está na própria tela) e rode este import de novo."),
      contas: cadastradasPelaTela,
    },
    atualizadas,
    inalteradas,
    orfas,
    ...(aplicar ? { aplicadoEm: new Date().toISOString() } : {}),
  });
}
