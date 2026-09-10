"use client";

import { useMemo, useState } from "react";
import { TEMA, MARCA } from "@/lib/brand";
import { MSG_RESTRITO } from "@/lib/filaContas";
import { ROTULO_SITUACAO } from "@/lib/situacaoPlanilha";
import {
  useConciliacao, aplicarCampos, aplicarGestor, aplicarCriacao,
  type RespostaConciliacao,
} from "@/lib/useConciliacao";
import type { NaturezaPendencia, Pendencia } from "@/lib/conciliaPlanilha";
import SecaoHeader from "./SecaoHeader";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;

/**
 * CONCILIAÇÃO PLANILHA × PAINEL.
 *
 * ⚠️ A TELA RECEBE A DECISÃO, NÃO A RECALCULA. Toda classificação — o que é pendência,
 * de que natureza, o que exige clique, o que é esperado — vem pronta de
 * `lib/conciliaPlanilha.ts`. Aqui só se decide o DESENHO. Se esta tela recalculasse
 * qualquer regra, existiriam duas cópias dela e um dia divergiriam num número que
 * ninguém confere.
 *
 * ⚠️ AS TRÊS DATAS FICAM À VISTA, e não é enfeite: planilha, painel e sondagem
 * envelhecem separado. Em 10/09/2026 três contas saíram de "o token não lê" para
 * "lê" ao longo de uma tarde — uma pendência de acesso sem a hora ao lado é
 * indistinguível de uma que já foi resolvida.
 */

/** ⚠️ O TEXTO É A REGRA DO DESENHO, e por isso ele mora numa constante só. */
const NATUREZA: Record<NaturezaPendencia, { titulo: string; peso: "acao" | "espera" | "quieto" }> = {
  semAccountId: { titulo: "Falta o accountId na planilha", peso: "acao" },
  formatoTorto: { titulo: "accountId com formato errado", peso: "acao" },
  naoLegivel: { titulo: "O token não lê a conta", peso: "acao" },
  situacaoDesconhecida: { titulo: "Situação fora do vocabulário", peso: "acao" },
  estrutura: { titulo: "Estrutura da planilha", peso: "acao" },
  naoSondada: { titulo: "Não foi sondada nesta execução", peso: "espera" },
  temLapide: { titulo: "Já esteve na carteira e foi removida", peso: "espera" },
  estaIgnorada: { titulo: "Dispensada por decisão de alguém", peso: "espera" },
  moedaEstrangeira: { titulo: "Conta em moeda estrangeira", peso: "espera" },
  // ⚠️ NASCE QUIETO, e é o único assim. Não é pendência de verdade: é uma decisão
  // tomada em 29/07/2026 que a conciliação reencontra toda vez. Se saísse com o mesmo
  // peso das outras, seria a mesma cobrança repetida para sempre — e é assim que um
  // relatório vira mobília que ninguém lê.
  foraDeEscopo: { titulo: "Fora do escopo do painel (só Google Ads)", peso: "quieto" },
};

const ORDEM: NaturezaPendencia[] = [
  "naoLegivel", "semAccountId", "formatoTorto", "situacaoDesconhecida", "estrutura",
  "naoSondada", "temLapide", "estaIgnorada", "moedaEstrangeira", "foraDeEscopo",
];

const hora = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime())
    ? "—"
    : d.toLocaleString("pt-BR", { timeZone: MARCA.fuso, day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });
};

/**
 * Dobra. ⚠️ O GATILHO DIZ A QUANTIDADE E A NATUREZA do que está escondido — dobra que
 * esconde um número que ninguém vê equivale a não ter o número. E `aberta` nasce `true`
 * para tudo que é alerta ou pendência: aviso dentro de seção fechada é aviso que não existe.
 */
function Dobra({ gatilho, aberta = false, children }: { gatilho: string; aberta?: boolean; children: React.ReactNode }) {
  const [aberto, setAberto] = useState(aberta);
  return (
    <div className="rounded-xl" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
      <button
        type="button"
        onClick={() => setAberto((v) => !v)}
        aria-expanded={aberto}
        className="flex w-full items-center gap-2 px-4 py-3 text-left text-[13px]"
        style={{ color: TEMA.texto }}
      >
        <span aria-hidden="true" className="inline-block w-3 transition-transform" style={{ transform: aberto ? "rotate(90deg)" : "none" }}>▸</span>
        {gatilho}
      </button>
      {aberto && <div className="border-t px-4 py-3" style={{ borderColor: LINE }}>{children}</div>}
    </div>
  );
}

function Linha({ children }: { children: React.ReactNode }) {
  return <div className="py-1 text-[12px] tabular-nums" style={{ color: MUTED }}>{children}</div>;
}

function Botao({ onClick, disabled, children, primario }: {
  onClick: () => void; disabled?: boolean; children: React.ReactNode; primario?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="rounded-lg px-3 py-2 text-[13px] transition-[filter] disabled:opacity-50 hover:brightness-110"
      style={primario
        ? { background: TEMA.destaque, color: TEMA.textoSobreDestaque }
        : { background: TEMA.chip, color: TEMA.texto, border: `1px solid ${LINE}` }}
    >
      {children}
    </button>
  );
}

export default function Conciliacao() {
  const { dados, erro, carregando, recarregar, aplicar } = useConciliacao();
  const [acao, setAcao] = useState<string | null>(null);
  const [erroAcao, setErroAcao] = useState<string | null>(null);

  async function rodar(nome: string, fn: () => Promise<RespostaConciliacao>) {
    setAcao(nome);
    setErroAcao(null);
    try {
      aplicar(await fn());
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setAcao(null);
    }
  }

  const porNatureza = useMemo(() => {
    const m = new Map<NaturezaPendencia, Pendencia[]>();
    for (const p of dados?.pendencias ?? []) {
      if (!m.has(p.natureza)) m.set(p.natureza, []);
      m.get(p.natureza)!.push(p);
    }
    return ORDEM.filter((n) => m.has(n)).map((n) => [n, m.get(n)!] as const);
  }, [dados]);

  const avisosEstrutura = useMemo(
    () => (dados?.estrutura ?? []).flatMap((d) => d.avisos.map((a) => ({ aba: d.aba, aviso: a }))),
    [dados]
  );

  return (
    <div className="mx-auto max-w-5xl px-4 pb-16 pt-6">
      <SecaoHeader
        titulo="Conciliação com a planilha"
        subtitulo="A planilha de Monitoramento manda no gestor e nos campos dela; o painel manda no que ele mede."
        icone="⇄"
      />

      {/* ⚠️ BLOQUEIO NÃO É PANE — 403 em painel NEUTRO, nunca no vermelho de falha. */}
      {erro === MSG_RESTRITO ? (
        <div className="rounded-xl px-4 py-6 text-center text-[13px]"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, color: MUTED }}>
          {MSG_RESTRITO}
          <br />
          Conciliar muda o gestor das contas, e o gestor decide de quem é cada número
          no painel inteiro — por isso esta tela fica com quem responde pela carteira.
        </div>
      ) : erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>{erro}</div>
      ) : carregando || !dados ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-24 animate-pulse motion-reduce:animate-none rounded-xl"
              style={{ background: CARD, borderRadius: TEMA.raioCard }} />
          ))}
        </div>
      ) : (
        <div className="space-y-3">
          {/* ------------------------------------------------------------ */}
          {/* AS TRÊS DATAS. Estado permanente, cor de ênfase — nunca vermelho. */}
          {/* ------------------------------------------------------------ */}
          <div className="rounded-xl px-4 py-3 text-[12px]"
            style={{ background: TEMA.avisoFundo, color: TEMA.ouroTexto, borderRadius: TEMA.raioCard }}>
            <strong>Três datas, e elas não são a mesma.</strong>{" "}
            Planilha lida às <span className="tabular-nums">{hora(dados.lidaEmPlanilha)}</span>,
            painel às <span className="tabular-nums">{hora(dados.lidaEmPainel)}</span>,
            contas sondadas na Meta às <span className="tabular-nums">{hora(dados.sondadasEm)}</span>.
            O veredito de acesso da Meta muda ao longo do dia: uma conta listada como
            &ldquo;o token não lê&rdquo; pode já ter sido liberada depois desta hora.
          </div>

          {/* ------------------------------------------------------------ */}
          {/* O QUE O CRON APLICA SOZINHO                                   */}
          {/* ------------------------------------------------------------ */}
          <div className="rounded-xl px-4 py-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
            <div className="mb-2 text-[13px]" style={{ color: TEMA.texto }}>
              <strong>{dados.resumo.atualizacoes}</strong> conta(s) com campo da planilha a atualizar
              {dados.resumo.inalteradas > 0 && <> · {dados.resumo.inalteradas} sem mudança</>}
            </div>
            <div className="mb-3 text-[12px]" style={{ color: MUTED }}>
              Situação, orçamentos, forma de pagamento, notificação e preenche B.I. Nada aqui
              toca <code>pausado</code>, <code>cliente</code> nem número nenhum vindo da Meta.
            </div>
            <Botao primario disabled={!!acao || dados.resumo.atualizacoes === 0}
              onClick={() => rodar("campos", aplicarCampos)}>
              {acao === "campos" ? "Gravando…" : `Aplicar ${dados.resumo.atualizacoes} atualização(ões)`}
            </Botao>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* O QUE EXIGE CLIQUE                                            */}
          {/* ------------------------------------------------------------ */}
          <div className="rounded-xl px-4 py-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
            <div className="mb-1 text-[13px]" style={{ color: TEMA.texto }}>
              <strong>{dados.resumo.trocasGestor}</strong> troca(s) de gestor
            </div>
            <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
              O histórico de gestor é append-only: registro errado não se desfaz. Por isso o
              cron nunca aplica esta parte — ele nem consegue.
            </div>
            {/* ⚠️ A JANELA, NUNCA UM INSTANTE. A planilha não guarda quando a linha mudou
                de aba; o que se sabe é o intervalo entre duas leituras. */}
            <div className="mb-3 text-[12px]" style={{ color: TEMA.ouroTexto }}>
              {dados.janelaGestor.de
                ? <>A troca aconteceu entre <span className="tabular-nums">{hora(dados.janelaGestor.de)}</span> e <span className="tabular-nums">{hora(dados.janelaGestor.ate)}</span> — é uma janela, não um instante.</>
                : <>Primeira execução: a janela é <strong>aberta</strong>. Uma troca detectada agora pode ter acontecido em qualquer momento antes de hoje, e não dá para datar.</>}
            </div>
            {dados.trocasGestor.map((t) => (
              <Linha key={t.accountId}>
                {t.cliente} · <span style={{ color: TEMA.texto }}>{t.de} → {t.para}</span> · {t.aba} L{t.linha}
              </Linha>
            ))}
            {dados.resumo.trocasGestor > 0 && (
              <div className="mt-3">
                <Botao primario disabled={!!acao} onClick={() => rodar("gestor", aplicarGestor)}>
                  {acao === "gestor" ? "Gravando…" : `Aplicar ${dados.resumo.trocasGestor} troca(s) de gestor`}
                </Botao>
              </div>
            )}
          </div>

          {/* SUGESTÕES — a guarda do balde PAUSADO */}
          {dados.sugestoesGestor.length > 0 && (
            <div className="rounded-xl px-4 py-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
              <div className="mb-1 text-[13px]" style={{ color: TEMA.texto }}>
                <strong>{dados.sugestoesGestor.length}</strong> conta(s) estacionadas — a planilha diz quem é o dono
              </div>
              <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
                Estas estão no painel com gestor <code>PAUSADO</code>, que não é uma pessoa: é o
                marcador de conta fora de operação. A planilha nunca diz &ldquo;PAUSADO&rdquo;, então
                aplicar a aba aqui iria desestacioná-las. <strong>É sugestão, não escrita</strong> —
                reativar é decisão de carteira, não de conciliação.
              </div>
              {dados.sugestoesGestor.map((s) => (
                <Linha key={s.accountId}>
                  {s.cliente} · painel <span style={{ color: TEMA.texto }}>{s.gestorNoPainel}</span> · planilha diz dono{" "}
                  <span style={{ color: TEMA.texto }}>{s.donoNaPlanilha}</span> · {s.aba} L{s.linha}
                </Linha>
              ))}
            </div>
          )}

          {/* CRIAÇÕES */}
          <div className="rounded-xl px-4 py-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
            <div className="mb-1 text-[13px]" style={{ color: TEMA.texto }}>
              <strong>{dados.resumo.criacoes}</strong> conta(s) da planilha para cadastrar
            </div>
            <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
              Sondadas agora, legíveis e em reais. Conta com lápide ou dispensada da fila não
              chega aqui — sai em pendência, com o motivo de quem decidiu.
            </div>
            {dados.criacoes.map((c) => (
              <Linha key={c.accountId}>
                {c.cliente} · gestor {c.gestor} · Meta: &ldquo;{c.nomeNaMeta}&rdquo; · {c.moeda} · {c.accountId}
              </Linha>
            ))}
            {dados.resumo.criacoes > 0 && (
              <div className="mt-3">
                <Botao disabled={!!acao} onClick={() => rodar("criar", aplicarCriacao)}>
                  {acao === "criar" ? "Gravando…" : `Cadastrar ${dados.resumo.criacoes} conta(s)`}
                </Botao>
              </div>
            )}
          </div>

          {/* ------------------------------------------------------------ */}
          {/* PENDÊNCIAS — abertas, por natureza, com motivo E ação          */}
          {/* ------------------------------------------------------------ */}
          <SecaoHeader titulo="Pendências" subtitulo={`${dados.resumo.pendencias} no total. Cada uma sai com o motivo e o que fazer.`} icone="!" />
          {porNatureza.map(([nat, ps]) => {
            const meta = NATUREZA[nat];
            const gatilho = `${meta.titulo} — ${ps.length}`;
            const corpo = (
              <>
                <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
                  <div><strong>Motivo:</strong> {ps[0].motivo}</div>
                  <div className="mt-1"><strong>O que fazer:</strong> {ps[0].acao}</div>
                </div>
                {ps.map((p, i) => (
                  <Linha key={`${p.accountId ?? p.cliente}-${i}`}>
                    {p.aba} L{p.linha} · <span style={{ color: TEMA.texto }}>{p.cliente}</span>
                    {p.accountId && <> · {p.accountId}</>}
                    {p.motivo !== ps[0].motivo && <div className="pl-4" style={{ color: MUTED }}>↳ {p.motivo}</div>}
                  </Linha>
                ))}
              </>
            );
            // Pendência de AÇÃO nasce aberta; o que só espera decisão pode nascer
            // recolhido, e o que é decisão já tomada nasce sempre recolhido.
            return (
              <div key={nat} className="mt-2">
                <Dobra gatilho={gatilho} aberta={meta.peso === "acao"}>{corpo}</Dobra>
              </div>
            );
          })}

          {/* ------------------------------------------------------------ */}
          {/* O QUE O PAINEL TEM E A PLANILHA NÃO — duas populações           */}
          {/* ------------------------------------------------------------ */}
          <SecaoHeader titulo="No painel e não na planilha" icone="?" />
          <Dobra gatilho={`${dados.resumo.semLinhaNaPlanilha} conta(s) com gestor de verdade e sem linha na planilha`} aberta>
            <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
              O join é por accountId. Uma conta pode estar na planilha <em>pelo nome</em> e cair
              aqui mesmo assim, se a linha dela estiver sem o id — nesse caso ela também aparece
              em &ldquo;Falta o accountId&rdquo;. Preencher o id resolve as duas de uma vez.
            </div>
            {dados.semLinhaNaPlanilha.map((c) => (
              <Linha key={c.accountId}>{c.cliente} · gestor {c.gestor} · {c.accountId}</Linha>
            ))}
          </Dobra>
          <div className="mt-2">
            {/* ⚠️ RECOLHIDO de propósito, e o número vai no gatilho. Estas 39 estarão aqui
                amanhã e no ano que vem — é estado, não pendência. Uma lista que abre com
                47 linhas todo dia treina quem lê a ignorá-la, e aí a que é real não é vista. */}
            <Dobra gatilho={`${dados.resumo.foraDeOperacao} conta(s) fora de operação · esperado, não é pendência`}>
              <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
                Estão no painel com gestor <code>PAUSADO</code> e a planilha não as lista, porque
                ela é a carteira de quem está rodando. Nada a fazer.
              </div>
              {dados.foraDeOperacao.map((c) => (
                <Linha key={c.accountId}>{c.cliente} · {c.accountId}</Linha>
              ))}
            </Dobra>
          </div>

          {/* ------------------------------------------------------------ */}
          {/* ESTRUTURA DA PLANILHA                                          */}
          {/* ------------------------------------------------------------ */}
          <SecaoHeader titulo="Estrutura da planilha" subtitulo={`${dados.resumo.linhasLidas} linhas de cliente em ${dados.estrutura.length} abas.`} icone="▦" />
          {avisosEstrutura.length > 0 && (
            <Dobra gatilho={`${avisosEstrutura.length} aviso(s) de estrutura`} aberta>
              <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
                A coluna é achada pelo conteúdo das células, não pela posição nem pelo cabeçalho.
                Quando a confiança cai, o aviso aparece aqui em vez de a leitura sair errada em silêncio.
              </div>
              {avisosEstrutura.map((a, i) => (
                <Linha key={i}><span style={{ color: TEMA.texto }}>{a.aba}</span> · {a.aviso}</Linha>
              ))}
            </Dobra>
          )}
          <div className="mt-2">
            <Dobra gatilho={`${dados.planilha.abasIgnoradas.length} aba(s) não lida(s)`}>
              {dados.planilha.abasIgnoradas.map((a) => (
                <Linha key={a.aba}><span style={{ color: TEMA.texto }}>{a.aba}</span> · {a.motivo}</Linha>
              ))}
            </Dobra>
          </div>

          {/* Vocabulário de situação — o que a tela sabe agrupar. */}
          <div className="mt-2">
            <Dobra gatilho={`Vocabulário de situação · ${Object.keys(ROTULO_SITUACAO).length} conceitos`}>
              <div className="mb-2 text-[12px]" style={{ color: MUTED }}>
                O prefixo numérico da planilha é descartado: ele não é estável — o número
                <code> 1 </code> significa &ldquo;A iniciar&rdquo; nas abas de gestor e
                &ldquo;Cliente insatisfeito&rdquo; na aba de pausados. O texto exato da célula
                fica gravado junto do conceito.
              </div>
              {Object.values(ROTULO_SITUACAO).map((r) => <Linha key={r}>{r}</Linha>)}
            </Dobra>
          </div>

          {/* CONFERÊNCIA: fala do banco, não da intenção. */}
          {dados.conferencia && (
            <div className="mt-3 rounded-xl px-4 py-3 text-[12px]"
              style={{ background: TEMA.positivoFundo, color: TEMA.positivo, borderRadius: TEMA.raioCard }}>
              Gravado e <strong>lido de volta do Firestore</strong>: {dados.conferencia.comBlocoPlanilha} de{" "}
              {dados.conferencia.documentosConferidos} documento(s) conferido(s) têm o bloco da planilha
              {dados.conferencia.deUmTotalDe > dados.conferencia.documentosConferidos &&
                <> (amostra de {dados.conferencia.deUmTotalDe} gravados)</>}. A conferência é por
              presença do campo, não por valor.
            </div>
          )}

          {erroAcao && (
            <div className="mt-3 rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
              {erroAcao}
            </div>
          )}

          <div className="mt-4">
            <Botao disabled={!!acao} onClick={() => rodar("recarregar", async () => { await recarregar(); return dados; })}>
              Reler a planilha
            </Botao>
          </div>
        </div>
      )}
    </div>
  );
}
