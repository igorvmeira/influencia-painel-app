// ===========================================================================
// 🕐 DIAGNÓSTICO TEMPORÁRIO — CRIADO EM 02/09/2026, REMOVER APÓS A MEDIÇÃO
// ===========================================================================
// MOTIVO: decidir se é VIÁVEL um módulo de análise de atendimento por IA em cima
// do Xmax. NÃO é a feature — é a medição que decide se ela existe.
//
// ⚠️ LEITURA PURA. Nenhum `set`/`update`/`delete`, nenhuma env nova, e o Firestore
//    não é aberto em momento nenhum.
//
// ===========================================================================
// 🛑 ESTA ROTA FOI REESCRITA — a primeira versão media um caminho MORTO
// ===========================================================================
// A v1 media a cobertura de `clientid` NA OPORTUNIDADE, para ir dali ao
// atendimento. Medido: **0 de 100 (0,0%)** — e não é a régua: a chave existe na
// listagem, vem `""`, e o `getOpportunity` do detalhe devolve a mesma string vazia.
//
// 🔑 O VÍNCULO EXISTE NA DIREÇÃO CONTRÁRIA: `getAllOpenChats` traz um campo
// `opportunities` em cada chat. O join é chat → oportunidade, nunca o inverso.
// Esta versão mede por aí.
//
// ⚠️⚠️ E O ESQUEMA DE MENSAGEM DA SPEC ESTÁ ERRADO — o objeto inteiro. Os nomes
// reais estão em `data/xmax-chat-schema.md`, junto da tabela spec × real. Quem
// mexer aqui lê aquele arquivo ANTES, senão reescreve os mesmos campos errados.
//
// 🛑 E A ARMADILHA QUE ESTA ROTA EXISTE PARA NÃO REPETIR: `getChatMessages` é
// escopado por `queueId` e responde **HTTP 200 com lista vazia** quando o chat é
// de outra fila. Nada distingue isso de um chat sem mensagens. Por isso a leitura
// aqui é por `backupChatAsJson`, que usa a chave GLOBAL e alcança todas as filas.

import { NextResponse } from "next/server";
import { checarCronSecret } from "@/lib/cronAuth";
import { lerConfigXmax, chamarXmax } from "@/lib/xmax";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

/** Janela dos encerrados. 30 dias deu 152 atendimentos em 02/09/2026. */
const DIAS_JANELA = 30;
/** Quantos backups são abertos de verdade. Cada um é uma chamada à API. */
const AMOSTRA = 25;

/**
 * Campos cujo valor pode sair na resposta. **LISTA DE PERMISSÃO.**
 *
 * ⚠️ Tudo que NÃO está aqui sai mascarado — inclusive campo que a API venha a
 * acrescentar amanhã. Lista de PROIBIÇÃO protegeria só o que já se conhece, e o
 * campo novo é justamente o que ninguém revisou.
 */
const CAMPOS_SEGUROS = new Set([
  "id", "chatId", "queueId", "queueType", "status", "direction", "directionCode",
  "userId", "fk_user", "deleted", "beginTime", "endTime", "firstResponseTime",
  "firstResponseUserId", "lastUserId", "closeUserId", "initiatedByUserId",
  "endReason", "protocol", "campaignId", "opportunities", "tickets",
  "timestampUnix", "messagetimestamp", "aiScore",
  // O piso do histórico: datas e ids de atendimento, sem dado de pessoa. Nomeados
  // um a um DE PROPÓSITO — foi a lista de permissão que obrigou, e é assim que ela
  // deve doer: expor exige nomear.
  "minId", "minIdDate", "minIdEndDate", "oldestDate", "oldestDateChatId",
  "oldestDateBeginTime", "oldestDateEndTime",
]);

const mascarar = (v: unknown): string =>
  v === null ? "null"
    : v === undefined ? "(ausente)"
      : Array.isArray(v) ? `array(${v.length})`
        : typeof v === "object" ? `object{${Object.keys(v as object).join(",")}}`
          : typeof v === "string" ? `string(${v.length})`
            : typeof v;

const estrutura = (o: Record<string, unknown>) =>
  Object.fromEntries(Object.entries(o).map(([k, v]) => [k, CAMPOS_SEGUROS.has(k) ? v : mascarar(v)]));

const mediana = (xs: number[]) => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : Math.round((s[m - 1] + s[m]) / 2);
};
const frac = (x: number, y: number) =>
  `${x} de ${y}` + (y > 0 ? ` (${((x / y) * 100).toFixed(1).replace(".", ",")}%)` : "");
const dia = (d: Date) => d.toISOString().slice(0, 10);

interface MsgBackup {
  direction?: string; directionCode?: number; userId?: number | null;
  text?: string; rewrittenByAi?: unknown; insultDetected?: unknown; transcription?: unknown;
}
interface ChatBackup {
  id?: number; queueId?: number; messages?: MsgBackup[];
  firstResponseTime?: unknown; endReason?: unknown;
  aiSummary?: unknown; aiSuggestion?: unknown; aiScore?: unknown;
  opportunities?: unknown[];
}

export async function GET(req: Request) {
  const barrado = checarCronSecret(req);
  if (barrado) return barrado;

  const cfg = lerConfigXmax();
  // Falha fechado: sem as envs a rota não executa nada.
  if ("faltando" in cfg) {
    return NextResponse.json({ ok: false, erro: "envs ausentes", faltando: cfg.faltando }, { status: 500 });
  }
  const c = cfg.config;

  // =========================================================================
  // 3) O PISO DO HISTÓRICO — barato, e enquadra tudo o mais
  // =========================================================================
  const rPiso = await chamarXmax<Record<string, unknown>>(c, "getChatsMinIdAndDate", "global");

  // =========================================================================
  // 1) COBERTURA DE `opportunities`
  // =========================================================================
  // ⚠️ SÓ APARECE NO `getAllOpenChats`. O backup NÃO traz o campo (0 de 25
  // medido), então a cobertura dos ENCERRADOS não é obtenível por este caminho —
  // e dizer que ela é 0% seria confundir "não existe" com "não é devolvido".
  const rAbertos = await chamarXmax<{ chats?: Record<string, unknown>[]; openChats?: number }>(
    c, "getAllOpenChats", "fila"
  );
  const abertos = rAbertos.dados?.chats ?? [];
  const abertosComOp = abertos.filter(
    (x) => Array.isArray(x.opportunities) && (x.opportunities as unknown[]).length > 0
  );
  const porUsuarioAberto = new Map<unknown, number>();
  for (const x of abertos) porUsuarioAberto.set(x.userId, (porUsuarioAberto.get(x.userId) ?? 0) + 1);

  // =========================================================================
  // 2) OS ENCERRADOS — via backup, que é o único que alcança todas as filas
  // =========================================================================
  const rIds = await chamarXmax<unknown[]>(c, "getChatsByDateRange", "global", {
    startDate: dia(new Date(Date.now() - DIAS_JANELA * 864e5)),
    endDate: dia(new Date()),
  });
  const brutos = Array.isArray(rIds.dados) ? rIds.dados : [];
  const ids = brutos
    .map((x) => (typeof x === "object" && x !== null ? (x as { chatId?: number; id?: number }).chatId ?? (x as { id?: number }).id : x))
    .filter((x): x is number => typeof x === "number");

  const porFila = new Map<unknown, number>();
  const porDirecao = new Map<string, { n: number; comUser: number; semUser: number }>();
  const porUsuarioMsg = new Map<unknown, number>();
  const msgs: number[] = [];
  const chars: number[] = [];
  let comAlgumCampoDeIA = 0, lidos = 0, comFirstResponse = 0;
  let chavesChat: string[] | null = null, chavesMsg: string[] | null = null;
  let exemploMsg: Record<string, unknown> | null = null;

  for (const id of ids.slice(0, AMOSTRA)) {
    const r = await chamarXmax<{ chat?: ChatBackup }>(c, "backupChatAsJson", "global", { id });
    const chat = r.dados?.chat;
    if (!chat) continue;
    lidos++;
    if (!chavesChat) chavesChat = Object.keys(chat);

    porFila.set(chat.queueId, (porFila.get(chat.queueId) ?? 0) + 1);
    if (chat.firstResponseTime) comFirstResponse++;
    if (chat.aiSummary || chat.aiSuggestion || (chat.aiScore != null && chat.aiScore !== 0)) comAlgumCampoDeIA++;

    const lista = Array.isArray(chat.messages) ? chat.messages : [];
    if (lista.length && !chavesMsg) chavesMsg = Object.keys(lista[0]);
    let n = 0;
    for (const m of lista) {
      n += typeof m.text === "string" ? m.text.length : 0;
      const k = `${m.direction} / ${m.directionCode}`;
      const e = porDirecao.get(k) ?? { n: 0, comUser: 0, semUser: 0 };
      e.n++;
      if (m.userId != null) { e.comUser++; porUsuarioMsg.set(m.userId, (porUsuarioMsg.get(m.userId) ?? 0) + 1); }
      else e.semUser++;
      porDirecao.set(k, e);
      if (!exemploMsg && m.direction === "out") exemploMsg = estrutura(m as unknown as Record<string, unknown>);
    }
    msgs.push(lista.length);
    chars.push(n);
  }

  const naoVazios = chars.filter((x) => x > 0);
  /** ⚠️ PISO, não previsão: ~4 chars/token é aproximação para inglês. */
  const CHARS_POR_TOKEN = 4;

  return NextResponse.json({
    ok: true,
    aviso:
      "Diagnóstico TEMPORÁRIO de 02/09/2026. Leitura pura, ZERO Firestore. Sem telefone, "
      + "nome de cliente ou texto de mensagem — só contagens, nomes de campo e tamanhos.",
    medidoEm: new Date().toISOString(),
    leiaAntes: "data/xmax-chat-schema.md — a spec descreve o objeto de mensagem ERRADO",

    // ---------------------------------------------------------------------
    piso: {
      pergunta: "até onde o histórico existe, para o corte ser DECLARADO na proposta",
      // 🛑 PASSA PELO MASCARAMENTO, mesmo sendo hoje só datas e ids. Espalhar a
      // resposta crua da API seria abrir exceção na lista de permissão — e a exceção
      // vale para o campo que a API acrescentar amanhã, que é justamente o que
      // ninguém revisou. A regra não admite "este endpoint é inofensivo".
      ...estrutura(rPiso.dados ?? {}),
      erro: rPiso.erro,
    },

    // ---------------------------------------------------------------------
    vinculoComOportunidade: {
      pergunta: "quantos atendimentos têm oportunidade vinculada",
      alerta: "o caminho oportunidade → chat é MORTO: `clientid` vem \"\" em 100 de 100",
      abertos: {
        total: abertos.length,
        comOpportunities: frac(abertosComOp.length, abertos.length),
        porUsuario: [...porUsuarioAberto.entries()].map(([userId, chats]) => ({ userId, chats })),
        ressalva: "os abertos podem ser DISPARO, não conversa — conferir a concentração por usuário acima",
      },
      encerrados: {
        naoMensuravel:
          "o `backupChatAsJson` NÃO devolve `opportunities` (0 de 25 medido). Isso é "
          + "AUSÊNCIA DO CAMPO no endpoint, não ausência de vínculo — os dois não se "
          + "confundem. Medir a cobertura nos encerrados exigiria outro endpoint.",
      },
      erro: rAbertos.erro,
    },

    // ---------------------------------------------------------------------
    encerrados: {
      janelaDias: DIAS_JANELA,
      totalNaJanela: ids.length,
      lidos,
      porFila: [...porFila.entries()].sort((a, b) => b[1] - a[1]).map(([queueId, chats]) => ({ queueId, chats })),
      alerta: "ler só a nossa fila perderia a maior parte — ver a distribuição acima",
      comFirstResponseTime: frac(comFirstResponse, lidos),
      erro: rIds.erro,
    },

    quemAtendeu: {
      identificaOAtendente: {
        campo: "`userId` no backup, `fk_user` no getChatMessages — o MESMO dado, dois nomes",
        ehNomeOuId: "ID numérico. O nome vem de `getAllUsers` (chave global).",
        porUsuario: [...porUsuarioMsg.entries()].sort((a, b) => b[1] - a[1]).map(([userId, mensagens]) => ({ userId, mensagens })),
      },
      distingueHumanoDeBot: {
        veredito: "NÃO existe campo booleano. O que segue é INFERÊNCIA, não campo.",
        ressalva: "`userId` preenchido NÃO significa humano — as mensagens `system` também o têm",
        porDirecao: [...porDirecao.entries()].sort((a, b) => b[1].n - a[1].n)
          .map(([direcao, e]) => ({ direcao, mensagens: e.n, comUserId: e.comUser, semUserId: e.semUser })),
        perguntaAberta: "o que cada `directionCode` significa não está documentado — perguntar ao Manuel",
      },
      timestamp: {
        campos: ["timestamp", "timestampUnix", "serverReceivedTime", "clientReceivedTime", "clientReadTime"],
        nota: "cinco no backup. Tempo de resposta se mede entre uma `in` e a `out` seguinte.",
      },
      exemploDeMensagemOut: exemploMsg ?? "nenhuma `out` na amostra",
    },

    volumeECusto: {
      mensagensPorAtendimento: { mediana: mediana(msgs), maior: msgs.length ? Math.max(...msgs) : null },
      caracteres: { mediana: mediana(naoVazios), maior: chars.length ? Math.max(...chars) : null },
      tokens: {
        regua: `PISO ~${CHARS_POR_TOKEN} chars/token (aproximação para inglês; pt acentuado gasta mais)`,
        mediano: mediana(naoVazios) === null ? null : Math.round(mediana(naoVazios)! / CHARS_POR_TOKEN),
        maior: chars.length ? Math.round(Math.max(...chars) / CHARS_POR_TOKEN) : null,
      },
      ressalva: "mediana e máximo diferem ~90× — teto por atendimento é obrigatório",
    },

    iaJaNaPlataforma: {
      camposQueExistem: ["aiSummary", "aiSuggestion", "aiScore", "rewrittenByAi", "insultDetected", "transcription", "assistantId"],
      chatsComAlgumPreenchido: frac(comAlgumCampoDeIA, lidos),
      ressalva: "zero preenchido NÃO diz que a plataforma não faz — diz que nestes não estava em uso. "
        + "Se o Xmax já entrega resumo e score, o módulo pode estar reconstruindo algo que se liga "
        + "num botão. Perguntar ao Manuel ANTES de propor.",
    },

    esquema: {
      chavesDoChat: chavesChat,
      chavesDaMensagem: chavesMsg,
      nota: "a tabela spec × real está em data/xmax-chat-schema.md",
    },
  });
}
