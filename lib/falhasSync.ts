/**
 * QUANDO UMA FALHA DE CONTA DERRUBA O SYNC — a regra mora aqui. A rota do sync aplica e
 * devolve o veredito; o workflow só lê.
 *
 * 🛑 POR QUE EXISTE (15/09/2026). A rota devolvia `ok: true` fixo e o workflow só AVISAVA
 * conta que falhava, "porque o próximo sync refaz". A ISP4 — ativa, 22,8% do gasto de agosto
 * do ISMAIL — teve a leitura recusada pela Meta a partir de 04/09 (#200: o dono retirou o
 * acesso), e o job ficou verde em 11 execuções seguidas. O próximo sync nunca refez. E pela
 * mesma regra, um token vencido derrubaria as 124 contas com o job verde.
 *
 * AS QUATRO REGRAS:
 *  1. Conta PAUSADA que falha é ESPERADA e nunca derruba — `pausado` já é a decisão registrada.
 *  2. Conta ATIVA com erro de PERMISSÃO derruba no mesmo dia: não se resolve sozinho.
 *  3. Conta ATIVA com erro PASSAGEIRO (ou sem classificação) só avisa enquanto a conta tem
 *     gravação recente; derruba quando passa de `HORAS_TOLERANCIA_PASSAGEIRA` sem gravar.
 *  4. FALHA EM MASSA derruba sempre, de qualquer tipo — ver `falhaEmMassa`.
 * A exceção: conta ATIVA com MARCA DE CIENTE válida só avisa — ver `situacaoDaMarca`.
 */

/** Regra 3: um sync diário pode atrasar ou falhar uma vez; 36 h separa "um dia" de "dois". */
export const HORAS_TOLERANCIA_PASSAGEIRA = 36;

/**
 * Regra 4 — o corte de "em massa": 20% das contas ativas, com piso de 3 contas.
 *
 * ⚠️ PROPORÇÃO, e não número fixo, porque a carteira muda: "10 contas" é muito em 50 e pouco
 * em 500. Por que 20%: medido de 01/09 a 15/09, o pior dia teve 1 conta ativa falhando em ~83
 * (1,2%, a ISP4) — 20% fica muito acima do ruído real e muito abaixo dos 100% de um token
 * vencido. O PISO existe para a proporção não virar "uma conta = massa" numa carteira pequena
 * (este módulo é do starter): com 5 contas ativas, 20% seria 1.
 * A conta é sobre contas ativas COM documento agregado — conta nova ainda sem doc fica fora,
 * porque a ausência dela é esperada (adiada) e não falha.
 */
export const CORTE_MASSA_PROPORCAO = 0.2;
export const PISO_MASSA_CONTAS = 3;

/**
 * Validade máxima de uma marca de ciente, contada do registro. Curta de propósito: a marca
 * existe para conta que não dá para consertar AGORA, não para sempre. Renovar é registrar de
 * novo, com motivo novo.
 */
export const PRAZO_MAX_CIENTE_DIAS = 14;

// Códigos da Meta, conferidos na documentação em 15/09/2026 — a classificação é SEMPRE pelo
// código, nunca pela mensagem (a própria Meta avisa que o texto muda sem aviso).
//   · permissão/acesso/token: 10, 190, 200 (documentados) e 100 com subcódigo 33 (medido
//     aqui em 07/09/2026: "id não resolvido" — também não se resolve sozinho);
//   · limite de volume: 4, 17, 32, 613 e a faixa 80000–80014 (limites por caso de uso).
// Todo o resto — inclusive 1 ("erro desconhecido") e 100 sem subcódigo 33 — é "desconhecido".
const CODIGOS_PERMISSAO = new Set([10, 190, 200]);
const CODIGOS_PASSAGEIRO = new Set([4, 17, 32, 613]);

export type TipoErro = "permissao" | "passageiro" | "desconhecido";

export interface ErroClassificado {
  tipo: TipoErro;
  http: number | null;
  codigo: number | null;
  subcodigo: number | null;
  mensagem: string;
}

/** Lê o código de um erro vindo do sync (ver `ErroMetaApi` em lib/meta.ts) e o classifica. */
export function tipoDoErro(e: unknown): ErroClassificado {
  const o = (e ?? {}) as { http?: unknown; codigoMeta?: unknown; subcodigoMeta?: unknown; message?: unknown };
  const http = typeof o.http === "number" ? o.http : null;
  const codigo = typeof o.codigoMeta === "number" ? o.codigoMeta : null;
  const subcodigo = typeof o.subcodigoMeta === "number" ? o.subcodigoMeta : null;
  const mensagem = String(o.message ?? e).slice(0, 300);
  let tipo: TipoErro = "desconhecido";
  if (codigo !== null) {
    if (CODIGOS_PERMISSAO.has(codigo) || (codigo === 100 && subcodigo === 33)) tipo = "permissao";
    else if (CODIGOS_PASSAGEIRO.has(codigo) || (codigo >= 80000 && codigo <= 80014)) tipo = "passageiro";
  } else if (http !== null && http >= 500) {
    tipo = "passageiro";
  }
  return { tipo, http, codigo, subcodigo, mensagem };
}

/** Marca de "sem acesso, ciente" de UMA conta, gravada em `sistema/falhasCientes`. */
export interface MarcaCiente {
  cliente?: string;
  /** Código da Meta que a marca cobre. Falha com OUTRO código não é coberta. null = qualquer. */
  codigo: number | null;
  registradoEm: string; // ISO
  expiraEm: string;     // YYYY-MM-DD, inclusive (no fuso da marca)
  motivo: string;
  registradoPor: string;
}

const diasEntre = (deIso: string, ateYmd: string) =>
  Math.round((Date.parse(ateYmd + "T00:00:00Z") - Date.parse(deIso.slice(0, 10) + "T00:00:00Z")) / 86400000);
const ddmm = (ymd: string) => `${ymd.slice(8, 10)}/${ymd.slice(5, 7)}`;

/**
 * A marca vale hoje? Ela deixa de valer — e a conta VOLTA A DERRUBAR o job — quando:
 *  · a data de validade passou (vale até o dia informado, inclusive);
 *  · o prazo informado passa de `PRAZO_MAX_CIENTE_DIAS` desde o registro;
 *  · falta motivo ou data;
 *  · a falha de hoje tem código diferente do que a marca cobre (a falha MUDOU).
 * ⚠️ É isto que impede a marca de virar o silêncio permanente que ela veio substituir.
 */
export function situacaoDaMarca(
  marca: MarcaCiente | undefined,
  codigoHoje: number | null,
  hojeYmd: string
): { valida: boolean; problema: string | null } {
  if (!marca) return { valida: false, problema: null };
  if (!marca.expiraEm || !/^\d{4}-\d{2}-\d{2}$/.test(marca.expiraEm) || !marca.registradoEm) {
    return { valida: false, problema: "a marca de ciente não tem data de registro ou de validade válida" };
  }
  if (!marca.motivo || !marca.motivo.trim()) {
    return { valida: false, problema: "a marca de ciente não tem motivo" };
  }
  if (diasEntre(marca.registradoEm, marca.expiraEm) > PRAZO_MAX_CIENTE_DIAS) {
    return { valida: false, problema: `a marca de ciente vale mais de ${PRAZO_MAX_CIENTE_DIAS} dias desde o registro e não é aceita` };
  }
  if (marca.expiraEm < hojeYmd) {
    return { valida: false, problema: `a marca de ciente venceu em ${ddmm(marca.expiraEm)} — rever: o acesso voltou? a conta sai da carteira? renovar com motivo novo` };
  }
  if (marca.codigo !== null && codigoHoje !== null && marca.codigo !== codigoHoje) {
    return { valida: false, problema: `a falha mudou: a marca de ciente cobre o código #${marca.codigo} e a de hoje é #${codigoHoje}` };
  }
  return { valida: true, problema: null };
}

export type Veredito = "esperada" | "ciente" | "tolerada" | "bloqueante";

/** O veredito de UMA conta que falhou no sync. */
export function classificarFalha(p: {
  pausada: boolean;
  erro: ErroClassificado;
  marca?: MarcaCiente;
  hojeYmd: string;
  /** `atualizadoEm` do doc agregado ANTES desta execução; null = nunca gravou. */
  ultimaGravacaoIso: string | null;
  agoraMs: number;
}): { veredito: Veredito; motivo: string } {
  const cod = p.erro.codigo !== null ? `#${p.erro.codigo}` : p.erro.http !== null ? `HTTP ${p.erro.http}` : "sem código";

  // Regra 1
  if (p.pausada) {
    return { veredito: "esperada", motivo: `conta pausada (${cod}) — fora dos números; sem leitura não dá para saber se voltou a veicular` };
  }

  const m = situacaoDaMarca(p.marca, p.erro.codigo, p.hojeYmd);
  if (m.valida) {
    return { veredito: "ciente", motivo: `ciente até ${ddmm(p.marca!.expiraEm)} (${cod}): ${p.marca!.motivo}` };
  }
  if (m.problema) return { veredito: "bloqueante", motivo: `${m.problema} (${cod})` };

  // Regra 2
  if (p.erro.tipo === "permissao") {
    return {
      veredito: "bloqueante",
      motivo: `a Meta recusa a leitura por permissão (${cod}) — não se resolve sozinho: o cliente precisa conceder o acesso de novo, ou a conta sai da carteira`,
    };
  }

  // Regra 3
  const horas = p.ultimaGravacaoIso ? (p.agoraMs - Date.parse(p.ultimaGravacaoIso)) / 3600e3 : Infinity;
  const tipo = p.erro.tipo === "passageiro" ? "erro passageiro" : "erro sem classificação";
  if (!(horas <= HORAS_TOLERANCIA_PASSAGEIRA)) {
    const quanto = Number.isFinite(horas) ? `há ${Math.round(horas)} h sem gravar` : "sem nenhuma gravação anterior";
    return { veredito: "bloqueante", motivo: `${tipo} (${cod}) e a conta já está ${quanto}` };
  }
  return { veredito: "tolerada", motivo: `${tipo} (${cod}); última gravação há ${Math.round(horas)} h — o próximo sync tenta de novo` };
}

/** Regra 4: a execução inteira deixou contas ativas demais sem gravar? */
export function falhaEmMassa(ativasComDoc: number, naoGravadas: number): {
  massa: boolean; proporcao: number; corteContas: number;
} {
  const corteContas = Math.max(PISO_MASSA_CONTAS, Math.ceil(ativasComDoc * CORTE_MASSA_PROPORCAO));
  const proporcao = ativasComDoc > 0 ? naoGravadas / ativasComDoc : 0;
  return { massa: naoGravadas >= corteContas, proporcao, corteContas };
}
