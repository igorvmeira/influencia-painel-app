import { NextResponse } from "next/server";
import { getDb } from "@/lib/firebaseAdmin";
import { checarCronSecret } from "@/lib/cronAuth";
import fonte from "@/data/contas.json";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

const LOTE = 450; // abaixo do limite de 500 operações por batch do Firestore

// Lista oficial da carteira. Preencha data/contas.json e rode esta rota de novo
// sempre que a carteira mudar (idempotente e não-destrutiva).
//
// ESCOPO: o painel cobre APENAS Meta Ads. Cliente que anuncia só no Google Ads não
// entra aqui — não é conta faltando, é fora de escopo (ex.: LAVE MAIS EXPRESS,
// CHRISTIANE ROBINE). Cadastrá-lo criaria uma conta permanentemente zerada na tela.
// Ver data/README.md para o escopo, as regras do de-para e o checklist de conta nova.
interface ContaFonte {
  accountId: string;
  cliente: string;
  gestor: string;
  tipo: string;
  nicho?: string;
  pausado?: boolean;
}

// Campos gravados no de-para (merge — não apaga outros campos existentes).
function payloadDe(c: ContaFonte) {
  return {
    accountId: c.accountId,
    cliente: c.cliente ?? "",
    gestor: c.gestor ?? "",
    tipo: c.tipo ?? "",
    nicho: c.nicho ?? "",
    pausado: !!c.pausado, // sem o campo na fonte => false
    ativo: true,
  };
}

// Conta cujo gestor foi editado pela tela /carteira: import NÃO mexe no campo gestor.
function gestorTravado(existente: Record<string, unknown>): boolean {
  return !!existente.gestorEditadoEm;
}

// Teto defensivo do histórico — mesmo valor usado no POST /api/contas.
const MAX_HISTORICO_GESTOR = 50;

// Registro datado da troca de gestor, no MESMO formato que a tela /carteira grava
// (EntradaGestor em lib/types.ts). Antes, só a tela registrava: troca feita pelo JSON
// passava sem deixar rastro, e como a carteira é atualizada pelo JSON justamente para
// não carimbar contas, na prática o histórico não via quase nada. Isso fechava a porta
// da detecção de "conta trocou de gestor no meio do mês" na Análise de Gestores.
//
// IMPORTANTE: registrar histórico NÃO carimba a conta. `gestorEditadoEm` continua
// sendo escrito apenas pela tela — é ele que faz o import parar de gerenciar o gestor.
// Aqui só se acrescenta ao histórico; o import segue mandando no campo `gestor`.
function historicoComTroca(
  existente: Record<string, unknown> | null,
  gestorAtual: string,
  gestorNovo: string,
  agoraISO: string
): unknown[] {
  const anterior = Array.isArray(existente?.gestorHistorico) ? (existente!.gestorHistorico as unknown[]) : null;
  // 1ª vez: semeia o dono atual como "desde sempre" (desde: null), igual ao POST.
  const base = anterior ?? [{ gestor: gestorAtual, desde: null, por: "sistema", em: agoraISO }];
  const entrada = { gestor: gestorNovo, desde: agoraISO, por: "import-contas", em: agoraISO };
  return [entrada, ...base].slice(0, MAX_HISTORICO_GESTOR);
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
  const travado = gestorTravado(existente);
  for (const k of ["cliente", "gestor", "tipo", "nicho"] as const) {
    if (k === "gestor" && travado) continue; // gestor editado na tela: import ignora
    if ((existente[k] ?? "") !== alvo[k]) campos.push(k);
  }
  if (!!existente.pausado !== alvo.pausado) campos.push("pausado");
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
  const itens = (fonte as ContaFonte[]).filter((c) => c && c.accountId);
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

  const criadas: { accountId: string; cliente: string; gestor: string }[] = [];
  const atualizadas: { accountId: string; cliente: string; campos: string[] }[] = [];
  const inalteradas: { accountId: string; cliente: string }[] = [];
  // Contas CARIMBADAS pela tela /carteira (gestorEditadoEm presente): o import não
  // gerencia mais o campo `gestor` delas. Separadas em duas listas porque o risco é
  // diferente — ver o comentário no laço abaixo.
  type Carimbada = { accountId: string; cliente: string; gestorJson: string; gestorTela: string; por: string; em: string };
  const carimbadasDivergentes: Carimbada[] = []; // JSON discorda: a troca NÃO será aplicada
  const carimbadasConcordantes: Carimbada[] = []; // JSON concorda hoje, mas a trava existe
  // Trocas de gestor que serão REGISTRADAS no gestorHistorico (append-only).
  const trocasGestor: { accountId: string; cliente: string; de: string; para: string; primeiroRegistro: boolean }[] = [];
  // Instante único desta execução — todas as entradas do histórico levam a mesma data.
  const agoraISO = new Date().toISOString();
  // Fila de gravações (aplicada só no modo aplicar).
  const gravacoes: { docId: string; dados: Record<string, unknown> }[] = [];

  for (const c of itens) {
    const existente = porAccountId.get(c.accountId);
    if (!existente) {
      criadas.push({ accountId: c.accountId, cliente: c.cliente ?? "", gestor: c.gestor ?? "" });
      // Novo doc mantém o mesmo esquema atual: docId = accountId.
      gravacoes.push({ docId: c.accountId, dados: payloadDe(c) });
      continue;
    }

    // TODA conta carimbada entra no relatório — não só as divergentes.
    // Motivo: a versão anterior só listava quando o JSON discordava, então uma conta
    // carimbada cujo JSON por acaso CONCORDA sumia do relatório e a trava ficava
    // invisível. O efeito é traiçoeiro: quem depois trocar o gestor dela no JSON vê o
    // import reportar sucesso e a troca simplesmente não acontecer.
    const travado = gestorTravado(existente.data);
    const gestorTela = (existente.data.gestor as string) ?? "";
    if (travado) {
      const reg = {
        accountId: c.accountId,
        cliente: c.cliente ?? "",
        gestorJson: c.gestor ?? "",
        gestorTela,
        por: (existente.data.gestorEditadoPor as string) ?? "",
        em: dataBR(existente.data.gestorEditadoEm),
      };
      if (gestorTela !== (c.gestor ?? "")) carimbadasDivergentes.push(reg);
      else carimbadasConcordantes.push(reg);
    }

    const campos = camposQueMudam(existente.data, c);
    if (campos.length === 0) {
      inalteradas.push({ accountId: c.accountId, cliente: c.cliente ?? "" });
    } else {
      atualizadas.push({ accountId: c.accountId, cliente: c.cliente ?? "", campos });
      // Atualiza o doc existente (qualquer que seja o docId dele). Se o gestor está
      // travado pela tela, remove-o do payload para o merge não sobrescrevê-lo.
      const dados = payloadDe(c) as ReturnType<typeof payloadDe> & { gestorHistorico?: unknown[] };
      if (travado) delete (dados as { gestor?: string }).gestor;

      // TROCA DE GESTOR pelo JSON: registra no histórico datado (append-only).
      // Só quando o gestor REALMENTE muda e a conta não está travada pela tela.
      if (!travado && campos.includes("gestor")) {
        const de = gestorTela;
        const para = c.gestor ?? "";
        dados.gestorHistorico = historicoComTroca(existente.data, de, para, agoraISO);
        trocasGestor.push({
          accountId: c.accountId,
          cliente: c.cliente ?? "",
          de,
          para,
          primeiroRegistro: !Array.isArray(existente.data.gestorHistorico),
        });
      }

      gravacoes.push({ docId: existente.id, dados });
    }
  }

  // Órfãs: docs no de-para que NÃO estão na fonte. Nunca apagadas nem alteradas.
  const orfas = snap.docs
    .map((d) => d.data() as Record<string, unknown>)
    .filter((data) => !idsFonte.has((data.accountId as string) || ""))
    .map((data) => ({ accountId: (data.accountId as string) ?? null, cliente: (data.cliente as string) ?? null }));

  // MODO APLICAR: grava criadas + atualizadas (merge). Inalteradas não geram escrita.
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
    totalNaFonte: itens.length,
    totalNoDePara: snap.size,
    resumo: {
      criadas: criadas.length,
      atualizadas: atualizadas.length,
      inalteradas: inalteradas.length,
      orfas: orfas.length,
      // Contas cujo gestor o import NÃO gerencia (carimbadas pela tela /carteira).
      carimbadas: carimbadasDivergentes.length + carimbadasConcordantes.length,
      carimbadasDivergentes: carimbadasDivergentes.length,
      carimbadasConcordantes: carimbadasConcordantes.length,
      // Trocas que entram no gestorHistorico. Só REGISTRO: não carimba a conta,
      // o import continua mandando no campo `gestor` dela.
      trocasDeGestor: trocasGestor.length,
      gravadas: aplicar ? gravadas : 0,
    },
    carimbadas: {
      mensagem: (carimbadasDivergentes.length + carimbadasConcordantes.length) === 0
        ? "Nenhuma conta carimbada — o import gerencia o gestor de todas."
        : `${carimbadasDivergentes.length + carimbadasConcordantes.length} conta(s) com gestor TRAVADO pela tela /carteira. `
          + "Para devolvê-las ao controle do JSON, apague gestorEditadoEm e gestorEditadoPor no Console do Firebase.",
      // JSON discorda: a troca pedida no JSON NÃO será aplicada.
      divergentes: carimbadasDivergentes,
      // JSON concorda HOJE — mas a trava existe e uma troca futura pelo JSON seria
      // ignorada em silêncio. Esta lista existe justamente para a trava não sumir.
      concordantes: carimbadasConcordantes,
    },
    trocasDeGestor: {
      mensagem: trocasGestor.length
        ? `${trocasGestor.length} troca(s) de gestor ${aplicar ? "registrada(s)" : "serão registradas"} no histórico (gestorHistorico).`
        : "Nenhuma troca de gestor nesta execução.",
      registradoEm: agoraISO,
      contas: trocasGestor,
    },
    criadas,
    atualizadas,
    inalteradas,
    orfas,
    ...(aplicar ? { aplicadoEm: new Date().toISOString() } : {}),
  });
}
