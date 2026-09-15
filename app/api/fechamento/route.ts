import { NextResponse } from "next/server";
import { getAuthAdmin, getDb, ENVS_FIREBASE_ADMIN } from "@/lib/firebaseAdmin";
import { comporEnvs, conferirEnvs } from "@/lib/envs";
import { getDadosDiarios } from "@/lib/data";
import { emailsAdminCarteira, ENVS_ADMIN_CARTEIRA } from "@/lib/listaDeEmails";
import {
  chaveMes, liberacaoFechamento, montarConteudoFoto, MSG_FECHAMENTO_RESTRITO, VALOR_DA_FOTO_NOVA,
} from "@/lib/fotoFechamento";
import {
  assinaturaDoConteudo, gravarVersao, lerFotoAtual, lerResumo, NOMES_PRODUCAO, RecusaFechamento,
} from "@/lib/fechamentoServidor";

// ===========================================================================
// FOTO DO FECHAMENTO DE MÊS — prévia, gravação e leitura
// ===========================================================================
//
// GET  ?mes=AAAA-MM            → resumo dos fechamentos + a foto atual do mês (1 ou 2 leituras).
// POST { acao: "previa", ano, mes }  → monta a foto com o dado de agora. NÃO grava. Abre para
//                                      qualquer pessoa logada: ver não é decidir.
// POST { acao: "fechar", ano, mes, assinatura, versaoEsperada, motivo? } → grava uma VERSÃO nova.
//
// 🔑 O QUE PROTEGE A DECISÃO (desenho aprovado pelo Igor em 15/09/2026):
//  · o conteúdo é montado AQUI, nunca aceito do corpo — o corpo só traz a ASSINATURA da prévia, e
//    se o dado de agora der outra assinatura (sync novo, troca de carteira), recusa sem gravar:
//    o que se grava é o que a pessoa viu;
//  · quem fechou vem do token, e a foto grava que o login é compartilhado;
//  · versão nova nunca sobrescreve a anterior, e refechar exige motivo (lib/fechamentoServidor.ts);
//  · o botão só libera pela mesma regra que a tela mostra (`liberacaoFechamento`).

/**
 * As envs que esta rota alcança. A lista de quem administra a carteira mora em
 * lib/listaDeEmails.ts (`ENVS_ADMIN_CARTEIRA`, OPCIONAL): vazia, a prévia continua abrindo para
 * quem está logado e o "fechar" recusa todo mundo com o texto de acesso restrito — a mesma dívida
 * conhecida da /conciliacao. Quem disser "não consigo fechar o mês" começa por ela.
 */
const ENVS = comporEnvs(ENVS_ADMIN_CARTEIRA, ENVS_FIREBASE_ADMIN);

export const dynamic = "force-dynamic";
export const runtime = "nodejs";
export const maxDuration = 60;

async function identificar(req: Request): Promise<{ email: string; podeGravar: boolean } | NextResponse> {
  const adminAuth = getAuthAdmin();
  if (!adminAuth) return NextResponse.json({ ok: false, erro: "autenticação não configurada" }, { status: 500 });
  const h = req.headers.get("authorization") || "";
  const token = h.startsWith("Bearer ") ? h.slice(7) : "";
  try {
    const dec = await adminAuth.verifyIdToken(token);
    const email = (dec.email || dec.uid).toLowerCase();
    // A lista é a da carteira (lib/listaDeEmails.ts) — a mesma da /conciliacao e da /fila-contas.
    return { email, podeGravar: emailsAdminCarteira().includes(email) };
  } catch {
    return NextResponse.json({ ok: false, erro: "não autenticado" }, { status: 401 });
  }
}

export async function GET(req: Request) {
  const falta = conferirEnvs(ENVS);
  if (falta) return NextResponse.json({ ok: false, erro: falta.mensagem, faltando: falta.faltando }, { status: 503 });
  const quem = await identificar(req);
  if (quem instanceof NextResponse) return quem;
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  const mes = new URL(req.url).searchParams.get("mes") ?? "";
  if (mes && !/^\d{4}-\d{2}$/.test(mes)) {
    return NextResponse.json({ ok: false, erro: "mes no formato AAAA-MM" }, { status: 400 });
  }
  try {
    const resumo = await lerResumo(db, NOMES_PRODUCAO);
    const foto = mes ? await lerFotoAtual(db, NOMES_PRODUCAO, resumo, mes) : null;
    return NextResponse.json({ ok: true, resumo, foto });
  } catch (e) {
    console.error("[/api/fechamento] leitura falhou:", e);
    return NextResponse.json({ ok: false, erro: "indisponível" }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const falta = conferirEnvs(ENVS);
  if (falta) return NextResponse.json({ ok: false, erro: falta.mensagem, faltando: falta.faltando }, { status: 503 });
  const quem = await identificar(req);
  if (quem instanceof NextResponse) return quem;
  const db = getDb();
  if (!db) return NextResponse.json({ ok: false, erro: "Firebase não configurado" }, { status: 500 });

  let corpo: Record<string, unknown>;
  try {
    corpo = await req.json();
  } catch {
    return NextResponse.json({ ok: false, erro: "corpo inválido" }, { status: 400 });
  }
  const ano = Number(corpo.ano), mes = Number(corpo.mes);
  const acao = corpo.acao;
  if (!Number.isInteger(ano) || !Number.isInteger(mes) || mes < 1 || mes > 12 || (acao !== "previa" && acao !== "fechar")) {
    return NextResponse.json({ ok: false, erro: "informe acao (previa|fechar), ano e mes" }, { status: 400 });
  }

  try {
    const dados = await getDadosDiarios();
    const conteudo = montarConteudoFoto(dados, ano, mes);
    if (!conteudo) return NextResponse.json({ ok: false, erro: "Este mês não tem janela montável no painel." }, { status: 409 });
    const liberacao = liberacaoFechamento(dados, ano, mes);
    const assinatura = assinaturaDoConteudo(conteudo);
    const resumo = await lerResumo(db, NOMES_PRODUCAO);
    const versaoAtual = resumo.meses[chaveMes(ano, mes)]?.versao ?? 0;

    if (acao === "previa") {
      return NextResponse.json({
        ok: true, liberacao, conteudo, assinatura, versaoAtual,
        exigeMotivo: versaoAtual > 0, valor: VALOR_DA_FOTO_NOVA, podeGravar: quem.podeGravar,
      });
    }

    if (!quem.podeGravar) return NextResponse.json({ ok: false, erro: MSG_FECHAMENTO_RESTRITO }, { status: 403 });
    if (!liberacao.pode) return NextResponse.json({ ok: false, erro: liberacao.motivo }, { status: 409 });
    if (corpo.assinatura !== assinatura) {
      return NextResponse.json({
        ok: false,
        erro: "O dado mudou desde a prévia (sincronização nova ou troca na carteira). Nada foi gravado — abra a prévia de novo.",
      }, { status: 409 });
    }
    const foto = await gravarVersao(db, NOMES_PRODUCAO, {
      conteudo,
      assinatura,
      versaoEsperada: Number(corpo.versaoEsperada),
      motivo: typeof corpo.motivo === "string" ? corpo.motivo : null,
      email: quem.email,
      agoraIso: new Date().toISOString(),
    });
    return NextResponse.json({ ok: true, foto });
  } catch (e) {
    if (e instanceof RecusaFechamento) return NextResponse.json({ ok: false, erro: e.message }, { status: e.status });
    console.error("[/api/fechamento] falhou:", e);
    return NextResponse.json({ ok: false, erro: "Falha ao montar ou gravar a foto — nada foi confirmado." }, { status: 500 });
  }
}
