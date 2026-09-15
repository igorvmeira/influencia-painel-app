import { createHash } from "node:crypto";
import { COL_FOTOS_FECHAMENTO, COL_SISTEMA, DOC_FECHAMENTOS } from "./colecoes";
import {
  LOGIN_IDENTIFICA_PESSOA, MOTIVO_MINIMO_CARACTERES, VALOR_DA_FOTO_NOVA,
  type ConteudoFoto, type FotoFechamento, type ResumoFechamentos,
} from "./fotoFechamento";

// ===========================================================================
// FOTO DO FECHAMENTO — a parte que só o servidor faz: assinatura e gravação
// ===========================================================================
// ⚠️ SEPARADO de lib/fotoFechamento.ts por ONDE MORA, não por assunto: `node:crypto` num módulo
// que a tela importa derruba o `next build` (CLAUDE.md, *import de valor num componente*).

/** Onde gravar — parâmetro para o teste de gravação poder usar uma coleção de teste. */
export interface NomesFechamento {
  colecaoFotos: string;
  colecaoResumo: string;
  docResumo: string;
}

export const NOMES_PRODUCAO: NomesFechamento = {
  colecaoFotos: COL_FOTOS_FECHAMENTO,
  colecaoResumo: COL_SISTEMA,
  docResumo: DOC_FECHAMENTOS,
};

/** sha256 do conteúdo. Mesma entrada, mesma assinatura — é o que prova que a prévia é o gravado. */
export function assinaturaDoConteudo(c: ConteudoFoto): string {
  return createHash("sha256").update(JSON.stringify(c)).digest("hex");
}

export class RecusaFechamento extends Error {
  constructor(msg: string, public status: number) {
    super(msg);
    this.name = "RecusaFechamento";
  }
}

export async function lerResumo(db: FirebaseFirestore.Firestore, nomes: NomesFechamento): Promise<ResumoFechamentos> {
  const s = await db.collection(nomes.colecaoResumo).doc(nomes.docResumo).get();
  const meses = (s.exists ? (s.data()?.meses as ResumoFechamentos["meses"] | undefined) : undefined) ?? {};
  return { meses };
}

export async function lerFotoAtual(
  db: FirebaseFirestore.Firestore, nomes: NomesFechamento, resumo: ResumoFechamentos, mes: string
): Promise<FotoFechamento | null> {
  const r = resumo.meses[mes];
  if (!r) return null;
  const s = await db.collection(nomes.colecaoFotos).doc(r.id).get();
  return s.exists ? (s.data() as FotoFechamento) : null;
}

/**
 * Grava uma VERSÃO nova da foto. Nunca sobrescreve.
 *
 * Na mesma transação: relê o resumo, confere que a versão atual é a que a prévia viu
 * (`versaoEsperada`) — senão alguém fechou no meio —, exige motivo para refechar, CRIA o doc da
 * versão (`create` falha se o id existir) e aponta o resumo para ela. Depois lê de volta.
 * ⚠️ Por isso o cliente pode ter teto de espera neste POST: repetir a mesma chamada depois de um
 * abort não duplica — a segunda recebe "versão mudou" em vez de gravar outra foto.
 */
export async function gravarVersao(
  db: FirebaseFirestore.Firestore,
  nomes: NomesFechamento,
  p: { conteudo: ConteudoFoto; assinatura: string; versaoEsperada: number; motivo: string | null; email: string; agoraIso: string }
): Promise<FotoFechamento> {
  const resumoRef = db.collection(nomes.colecaoResumo).doc(nomes.docResumo);
  const mes = p.conteudo.mes;
  const foto = await db.runTransaction(async (tx) => {
    const s = await tx.get(resumoRef);
    const meses = (s.exists ? (s.data()?.meses as ResumoFechamentos["meses"] | undefined) : undefined) ?? {};
    const versaoAtual = meses[mes]?.versao ?? 0;
    if (versaoAtual !== p.versaoEsperada) {
      throw new RecusaFechamento(
        `Este mês foi fechado por outra sessão depois que a prévia foi aberta (versão ${versaoAtual}). Nada foi gravado — abra a prévia de novo.`, 409
      );
    }
    const motivo = p.motivo?.trim() || null;
    if (versaoAtual > 0 && (!motivo || motivo.length < MOTIVO_MINIMO_CARACTERES)) {
      throw new RecusaFechamento(`Refechar exige motivo com pelo menos ${MOTIVO_MINIMO_CARACTERES} caracteres.`, 400);
    }
    const versao = versaoAtual + 1;
    const id = `${mes}_v${versao}`;
    const nova: FotoFechamento = {
      ...p.conteudo,
      id,
      versao,
      valor: VALOR_DA_FOTO_NOVA,
      assinatura: p.assinatura,
      fechadoEm: p.agoraIso,
      fechadoPor: { email: p.email, identificaPessoa: LOGIN_IDENTIFICA_PESSOA },
      motivo,
      substitui: versaoAtual > 0 ? `${mes}_v${versaoAtual}` : null,
    };
    tx.create(db.collection(nomes.colecaoFotos).doc(id), nova);
    tx.set(resumoRef, { meses: { [mes]: { versao, id, fechadoEm: p.agoraIso, valor: nova.valor } } }, { merge: true });
    return nova;
  });

  // Leitura de volta: a resposta fala do banco, não do objeto em memória.
  const lido = await db.collection(nomes.colecaoFotos).doc(foto.id).get();
  const x = lido.data() as FotoFechamento | undefined;
  if (!x || x.assinatura !== foto.assinatura || x.versao !== foto.versao || x.contas?.length !== foto.contas.length) {
    throw new RecusaFechamento("A foto foi gravada, mas a leitura de volta não confere com o que se gravou. Avise quem cuida do painel.", 500);
  }
  return x;
}
