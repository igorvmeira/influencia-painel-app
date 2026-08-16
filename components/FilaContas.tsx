"use client";

import { useMemo, useState } from "react";
import { TEMA } from "@/lib/brand";
import { MARCA } from "@/lib/brand";
import { brlDec } from "@/lib/format";
import { OPCOES_GESTOR } from "@/lib/gestores";
import { useContas } from "@/lib/useContas";
import { useFilaContas, procurarAgora, acaoFila, RespostaFila } from "@/lib/useFilaContas";
import { CandidataFila, MOEDA_ACEITA, MSG_RESTRITO, podeCadastrar, linhaJson } from "@/lib/filaContas";
import SecaoHeader from "./SecaoHeader";
import AvisoDadoVelho from "./AvisoDadoVelho";

const CARD = TEMA.card;
const LINE = TEMA.borda;
const MUTED = TEMA.muted;

/**
 * FILA DE APROVAÇÃO DE CONTAS NOVAS.
 *
 * O sistema DESCOBRE, a pessoa DECIDE. Nada aqui cadastra sozinho — ver o porquê
 * em lib/filaContas.ts (a conta fantasma que passou nas duas conferências técnicas
 * e não era cliente de ninguém).
 *
 * ⚠️ A PARTE MAIS IMPORTANTE DESTA TELA É O RODAPÉ, não a lista. Uma fila vazia lê
 * como "está tudo cadastrado", e essa leitura é falsa: `me/adaccounts` não lista
 * conta de BM parceira. O aviso do rodapé é o que impede a tela de dar uma
 * confiança que ela não pode dar — se algum dia ele for cortado por ser "texto
 * demais", a tela passa a mentir por omissão.
 */

/** Formata o gasto NA MOEDA DA CONTA. Carimbar "R$" em conta ARS seria um número
    errado com cara de certo — o mesmo defeito que a conferência de moeda evita. */
function gasto(c: CandidataFila): string {
  if (c.moeda === MOEDA_ACEITA) return brlDec(c.gastoPeriodo);
  const n = c.gastoPeriodo.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  return `${c.moeda ?? "?"} ${n}`;
}

const dataBR = (iso: string | null) =>
  iso ? new Date(iso + "T12:00:00").toLocaleDateString("pt-BR", { timeZone: MARCA.fuso }) : "—";

/** ISO completo (com hora) → data no fuso da marca. Usado no rastro de carteira. */
const dataHoraBR = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("pt-BR", { timeZone: MARCA.fuso });
};

export default function FilaContas() {
  const { fila, erro, recarregar, aplicar } = useFilaContas();
  const { contas } = useContas();
  const [procurando, setProcurando] = useState(false);
  const [erroAcao, setErroAcao] = useState<string | null>(null);
  const [verIgnoradas, setVerIgnoradas] = useState(false);

  // Valores já usados na carteira — viram sugestão nos campos, para o cadastro pela
  // tela não inventar um nicho novo por typo e quebrar o agrupamento da /dashboard.
  const { nichos, tipos, nomes } = useMemo(() => {
    const lista = contas ?? [];
    return {
      nichos: [...new Set(lista.map((c) => (c.nicho ?? "").trim()).filter(Boolean))].sort(),
      tipos: [...new Set(lista.map((c) => (c.tipo ?? "").trim()).filter(Boolean))].sort(),
      nomes: lista.map((c) => (c.cliente ?? "").trim().toLowerCase()),
    };
  }, [contas]);

  async function buscar() {
    setProcurando(true);
    setErroAcao(null);
    try {
      const nova = await procurarAgora();
      if (nova) aplicar(nova as RespostaFila);
    } catch (e) {
      setErroAcao((e as Error).message);
    } finally {
      setProcurando(false);
    }
  }

  const carregando = !fila && !erro;

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-lg font-semibold text-brand-ink">Contas novas encontradas</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>
          Contas de anúncio que o token enxerga e que ainda não estão na carteira. O sistema
          encontra; quem decide é você — nada é cadastrado automaticamente.
        </p>
      </div>

      {/* ⚠️ BLOQUEIO NÃO É PANE. O 403 sai em painel neutro, com o texto que explica
          o porquê; pintá-lo de vermelho faria quem não tem acesso reportar um bug e
          alguém procurar defeito onde não há. O `erro` de verdade continua vermelho. */}
      {erro === MSG_RESTRITO ? (
        <div className="rounded-xl px-4 py-6 text-center text-[13px]"
          style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, color: MUTED }}>
          {MSG_RESTRITO}
          <br />
          Cadastrar conta muda o que todas as outras telas medem, então esta fica com quem
          responde pela carteira.
        </div>
      ) : erro ? (
        <div className="rounded-xl px-4 py-3 text-[13px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
          {erro}
        </div>
      ) : carregando ? (
        <div className="space-y-2">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse motion-reduce:animate-none"
              style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }} />
          ))}
        </div>
      ) : (
        <>
          {/* O sync-meta roda todo dia e é ele que reabastece a fila. */}
          <AvisoDadoVelho geradoEm={fila!.geradoEm} oQue="a busca por contas novas" workflow="sync-meta" />

          {fila!.erroDescoberta && (
            <div className="mb-4 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed"
              style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
              <b>⚠ A última busca falhou.</b> {fila!.erroDescoberta}
              <br />
              A lista abaixo é a busca anterior — pode estar incompleta. Ela NÃO foi apagada de
              propósito: lista vazia diria &quot;nenhuma conta nova&quot;, que é diferente de
              &quot;não deu para procurar&quot;.
            </div>
          )}

          {erroAcao && (
            <div className="mb-4 rounded-lg px-4 py-3 text-[12.5px]"
              style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
              {erroAcao}
            </div>
          )}

          <SecaoHeader
            titulo="Aguardando sua decisão"
            subtitulo={
              fila!.totalListadas != null
                ? `O token listou ${fila!.totalListadas} conta(s); ${fila!.jaCadastradas} já estão na carteira.`
                : "Ainda não houve nenhuma busca."
            }
            icone="⌛"
            pill={fila!.diasGasto ? `gasto dos últimos ${fila!.diasGasto} dias` : undefined}
          >
            <button
              onClick={buscar}
              disabled={procurando}
              className="rounded-full px-3 py-1.5 text-[12px] font-medium transition hover:brightness-125 disabled:opacity-60"
              style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
            >
              {procurando ? "Procurando…" : "Procurar agora"}
            </button>
          </SecaoHeader>

          {fila!.cortadasPeloTeto > 0 && (
            <div className="mb-4 rounded-lg px-4 py-3 text-[12.5px]"
              style={{ background: TEMA.limiteFundo, color: TEMA.atencao }}>
              <b>⚠ {fila!.cortadasPeloTeto} conta(s) não foram sondadas</b>
              {fila!.motivoCorte === "tempo"
                ? " porque a busca estourou o tempo disponível."
                : " porque o teto de sondagens por execução foi atingido."}{" "}
              Clique em <b>Procurar agora</b> depois de decidir as de baixo — a próxima busca
              pega as que sobraram.
            </div>
          )}

          {fila!.candidatas.length === 0 ? (
            <div className="rounded-xl px-4 py-6 text-center text-[13px]"
              style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, color: MUTED }}>
              Nenhuma conta nova nesta listagem.
              <br />
              <span style={{ color: TEMA.atencao }}>
                Isso não quer dizer que não há contas novas — leia o aviso no rodapé.
              </span>
            </div>
          ) : (
            <div className="space-y-3">
              {fila!.candidatas.map((c) => (
                <CardCandidata
                  key={c.accountId}
                  c={c}
                  nichos={nichos}
                  tipos={tipos}
                  nomesExistentes={nomes}
                  aoDecidir={recarregar}
                  aoErrar={setErroAcao}
                />
              ))}
            </div>
          )}

          {/* ---------------------------------------------------------- IGNORADAS */}
          {fila!.ignoradas.length > 0 && (
            <div className="mt-8">
              <button
                onClick={() => setVerIgnoradas((v) => !v)}
                className="text-[12px] hover:text-brand-ink"
                style={{ color: MUTED }}
              >
                {verIgnoradas ? "Ocultar" : "Ver"} {fila!.ignoradas.length} conta(s) marcada(s) como ignorada(s)
              </button>
              {verIgnoradas && (
                <div className="mt-2 space-y-2">
                  <p className="text-[12px]" style={{ color: MUTED }}>
                    Ignorar não apaga nada: a conta continua sendo encontrada, só sai da lista de
                    cima. Desfazer devolve na hora.
                  </p>
                  {fila!.ignoradas.map((i) => (
                    <div key={i.accountId}
                      className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5"
                      style={{ background: TEMA.zebra, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard }}>
                      <span className="text-[12.5px]" style={{ color: TEMA.texto }}>
                        <span className="tabular-nums">{i.accountId}</span>
                        <span style={{ color: MUTED }}>
                          {" "}· por {i.por} em {new Date(i.em).toLocaleDateString("pt-BR", { timeZone: MARCA.fuso })}
                          {i.motivo ? ` · ${i.motivo}` : ""}
                        </span>
                      </span>
                      <button
                        onClick={async () => {
                          setErroAcao(null);
                          try {
                            await acaoFila({ acao: "desfazerIgnorar", accountId: i.accountId });
                            await recarregar();
                          } catch (e) { setErroAcao((e as Error).message); }
                        }}
                        className="rounded-full px-3 py-1 text-[12px] font-medium transition hover:bg-brand-hover"
                        style={{ color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
                      >
                        Desfazer
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <AvisoDoRodape />
        </>
      )}
    </div>
  );
}

/**
 * ⚠️⚠️ O AVISO QUE NÃO PODE SAIR DA TELA.
 *
 * `me/adaccounts` é a única forma de descobrir conta cujo id ninguém informou, e é
 * comprovadamente incompleta. O número citado é medido, não estimado: em 15/08/2026,
 * 8 contas com R$ 45.943,25 de gasto em 120 dias respondiam à consulta direta e NÃO
 * apareciam nesta listagem — vinham de parceria de Business Manager.
 *
 * Fica em `avisoFundo` (dourado) e não em vermelho de propósito: não é um erro, é o
 * limite permanente da ferramenta. Vermelho aqui viraria ruído que se aprende a
 * ignorar, e é justamente este o texto que precisa continuar sendo lido.
 */
function AvisoDoRodape() {
  return (
    <div
      className="mt-10 px-4 py-3.5 text-[12.5px] leading-relaxed"
      style={{ background: TEMA.avisoFundo, color: TEMA.destaque, borderRadius: TEMA.raioCard }}
    >
      <b>⚠ Lista vazia NÃO significa &quot;não há contas novas&quot;.</b> Esta tela mostra o que o
      token <b>lista</b>, e a listagem do Meta é incompleta: conta que vem de parceria de Business
      Manager não aparece nela, mesmo o painel conseguindo ler os dados normalmente.
      <br /><br />
      <b>Isso já aconteceu, e o tamanho é este:</b> em 15/08/2026, <b>8 contas</b> que somavam{" "}
      <b>R$ 45.943,25 em 120 dias</b> estavam fora desta listagem — e fora do painel.
      <br /><br />
      Para essas, o caminho continua sendo o de sempre: <b>peça o accountId à agência em texto</b>{" "}
      (nunca transcreva de print — um dígito errado cria conta fantasma que nunca sincroniza) e
      sonde pela consulta direta antes de cadastrar.
    </div>
  );
}

// ===========================================================================
// CARD DE UMA CANDIDATA
// ===========================================================================
function CardCandidata({ c, nichos, tipos, nomesExistentes, aoDecidir, aoErrar }: {
  c: CandidataFila;
  nichos: string[];
  tipos: string[];
  nomesExistentes: string[];
  aoDecidir: () => Promise<void>;
  aoErrar: (m: string | null) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [cliente, setCliente] = useState(c.nomeNaMeta ?? "");
  const [gestor, setGestor] = useState("");
  const [nicho, setNicho] = useState("");
  const [tipo, setTipo] = useState("");
  const [salvando, setSalvando] = useState(false);
  const [copiado, setCopiado] = useState(false);
  /**
   * ⚠️ IGNORAR PEDE O PORQUÊ — e é lição deste próprio painel: restrição sem o
   * motivo anotado junto vira superstição, mantida por quem não sabe se ainda vale
   * ou desfeita por quem não sabe o que ela protegia. Daqui a seis meses,
   * "act_39439… ignorada" não diz nada; "moeda ARS, esperando decisão sobre
   * conversão" diz o que precisa mudar para ela voltar.
   *
   * O campo é OPCIONAL de propósito: exigir texto faria a pessoa digitar "x" para
   * passar, e um motivo falso é pior que nenhum.
   */
  const [ignorando, setIgnorando] = useState(false);
  const [motivo, setMotivo] = useState("");

  const conferencia = podeCadastrar(c);
  const nomeRepetido = cliente.trim() !== "" && nomesExistentes.includes(cliente.trim().toLowerCase());
  const podeSalvar = conferencia.ok && cliente.trim() !== "" && gestor !== "" && !salvando;

  async function cadastrar() {
    if (!podeSalvar) return;
    setSalvando(true);
    aoErrar(null);
    try {
      await acaoFila({ acao: "cadastrar", accountId: c.accountId, cliente: cliente.trim(), gestor, nicho, tipo });
      await aoDecidir();
    } catch (e) {
      aoErrar((e as Error).message);
      setSalvando(false);
    }
  }

  async function copiar() {
    const linha = linhaJson({ accountId: c.accountId, cliente: cliente.trim(), gestor, nicho, tipo });
    try {
      await navigator.clipboard.writeText(linha);
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2500);
    } catch {
      aoErrar("O navegador não deixou copiar. A linha é: " + linha);
    }
  }

  return (
    <div className="p-4" style={{ background: CARD, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-brand-ink">{c.nomeNaMeta ?? "(sem nome na Meta)"}</p>
          <p className="mt-0.5 text-[11px] tabular-nums" style={{ color: MUTED }}>{c.accountId}</p>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {/* MOEDA sempre visível, não só quando diverge: o selo é a conferência, e
              uma conferência que só aparece quando falha não ensina que ela existe. */}
          <Selo
            texto={c.moeda ?? "moeda ?"}
            cor={c.moeda === MOEDA_ACEITA ? TEMA.positivo : TEMA.negativo}
            fundo={c.moeda === MOEDA_ACEITA ? TEMA.positivoFundo : TEMA.negativoFundo}
            titulo={c.moeda === MOEDA_ACEITA
              ? "Moeda aceita — o painel soma em reais."
              : "O painel não converte moeda: somar esta conta contaminaria totais, CPL e ranking."}
          />
          {c.statusRotulo && (
            <Selo
              texto={c.statusRotulo}
              cor={MUTED}
              fundo={TEMA.chip}
              // ⚠️ A distinção que já custou a classificação errada de 3 contas.
              titulo="Situação CADASTRAL da conta (não diz se anunciou). Veiculação é o gasto ao lado."
            />
          )}
        </div>
      </div>

      {/*
        ⚠️ VEM ANTES DE TUDO NO CARD, e em `atencao` — não em vermelho.
        Não é falha nem bloqueio: é um fato que muda o julgamento, e precisa ser
        lido ANTES dos números, senão a pessoa já decidiu olhando o gasto.
        Ver o porquê da marca em lib/filaContas.ts.
      */}
      {c.jaEsteveNaCarteira && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[12px] leading-relaxed"
          style={{ background: TEMA.limiteFundo, color: TEMA.atencao }}>
          <b>⚠ Esta conta já esteve na carteira.</b>{" "}
          {c.ultimaSincronizacao
            ? <>O painel sincronizou dados dela até <b>{dataHoraBR(c.ultimaSincronizacao)}</b> — ela saiu
              da carteira em algum momento <b>depois</b> disso (a data exata não está no dado).</>
            : <>Sobrou dado de sincronização dela, sem data.</>}
          {" "}Recadastrar desfaz uma decisão que alguém tomou. Confirme com a agência antes.
        </p>
      )}

      {/* GASTO — a única prova de veiculação. */}
      <div className="mt-3 flex flex-wrap items-baseline gap-x-5 gap-y-1 text-[12.5px]">
        <span style={{ color: TEMA.texto }}>
          <span className="tabular-nums font-medium">{gasto(c)}</span>
          <span style={{ color: MUTED }}> gastos</span>
        </span>
        <span style={{ color: MUTED }}>
          <span className="tabular-nums">{c.diasComGasto}</span> dia(s) com gasto
        </span>
        <span style={{ color: MUTED }}>último: <span className="tabular-nums">{dataBR(c.ultimoDiaComGasto)}</span></span>
      </div>
      {c.diasComGasto === 0 && !c.erro && (
        <p className="mt-1 text-[12px]" style={{ color: TEMA.atencao }}>
          Não gastou nada na janela. Pode ser conta recém-criada, de teste, ou parada — cadastrar
          uma conta que não anuncia cria uma linha zerada no painel.
        </p>
      )}

      {!conferencia.ok && (
        <p className="mt-3 rounded-lg px-3 py-2 text-[12px]" style={{ background: TEMA.negativoFundo, color: TEMA.negativo }}>
          <b>Não pode ser cadastrada:</b> {conferencia.motivo}
        </p>
      )}

      {/* ------------------------------------------------------------- AÇÕES */}
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {conferencia.ok && !aberto && (
          <button
            onClick={() => setAberto(true)}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium transition hover:brightness-125"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            Cadastrar na carteira
          </button>
        )}
        {!ignorando && (
          <button
            onClick={() => setIgnorando(true)}
            className="rounded-full px-3 py-1.5 text-[12px] font-medium transition hover:bg-brand-hover"
            style={{ color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
            title="Some da lista e continua auditável. Reversível a qualquer momento."
          >
            Ignorar
          </button>
        )}
      </div>

      {ignorando && (
        <div className="mt-3 rounded-lg p-3" style={{ background: TEMA.zebra, border: `1px solid ${LINE}` }}>
          <p className="text-[12px]" style={{ color: TEMA.texto }}>
            Por que esta conta não entra na carteira?
          </p>
          <p className="mt-0.5 text-[11px]" style={{ color: MUTED }}>
            Opcional, mas é o que faz a decisão continuar fazendo sentido daqui a seis meses —
            e o que diz o que precisaria mudar para ela voltar.
          </p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <input
              value={motivo}
              onChange={(e) => setMotivo(e.target.value)}
              maxLength={300}
              className="min-w-0 flex-1 rounded-lg px-3 py-2 text-sm outline-none placeholder:text-brand-placeholder"
              style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
              placeholder="Ex.: conta de teste da BM, não é cliente"
            />
            <button
              onClick={async () => {
                aoErrar(null);
                try {
                  await acaoFila({ acao: "ignorar", accountId: c.accountId, motivo: motivo.trim() || null });
                  await aoDecidir();
                } catch (e) { aoErrar((e as Error).message); setIgnorando(false); }
              }}
              className="rounded-full px-3 py-2 text-[12px] font-medium transition hover:brightness-125"
              style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
            >
              Confirmar
            </button>
            <button
              onClick={() => { setIgnorando(false); setMotivo(""); }}
              className="rounded-full px-3 py-2 text-[12px] font-medium transition hover:bg-brand-hover"
              style={{ color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* ---------------------------------------------------------- FORMULÁRIO */}
      {aberto && conferencia.ok && (
        <div className="mt-4 border-t pt-4" style={{ borderColor: LINE }}>
          <div className="grid gap-3 sm:grid-cols-2">
            <Campo rotulo="Nome comercial" dica="Como a agência chama o cliente. O nome na Meta é pista, não decisão.">
              <input
                value={cliente}
                onChange={(e) => setCliente(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:text-brand-placeholder"
                style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
                placeholder="Ex.: HELLO NET"
              />
            </Campo>
            <Campo rotulo="Gestor" dica="Lista fechada — só os gestores de lib/gestores.ts.">
              <select
                value={gestor}
                onChange={(e) => setGestor(e.target.value)}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none"
                style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
              >
                <option value="">Escolha…</option>
                {OPCOES_GESTOR.map((g) => <option key={g} value={g}>{g}</option>)}
              </select>
            </Campo>
            <Campo rotulo="Nicho (opcional)" dica="Sugestões vêm da carteira — evita nicho novo por typo.">
              <input
                value={nicho}
                onChange={(e) => setNicho(e.target.value)}
                list={`nichos-${c.accountId}`}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:text-brand-placeholder"
                style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
                placeholder="Deixe vazio se não souber"
              />
              <datalist id={`nichos-${c.accountId}`}>
                {nichos.map((n) => <option key={n} value={n} />)}
              </datalist>
            </Campo>
            <Campo rotulo="Tipo (opcional)" dica="B2B / B2C. Vazio quando não se sabe — não inventar.">
              <input
                value={tipo}
                onChange={(e) => setTipo(e.target.value)}
                list={`tipos-${c.accountId}`}
                className="w-full rounded-lg px-3 py-2 text-sm outline-none placeholder:text-brand-placeholder"
                style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
                placeholder="Deixe vazio se não souber"
              />
              <datalist id={`tipos-${c.accountId}`}>
                {tipos.map((t) => <option key={t} value={t} />)}
              </datalist>
            </Campo>
          </div>

          {/* Aviso, não bloqueio: um cliente pode ter duas contas de anúncio de verdade. */}
          {nomeRepetido && (
            <p className="mt-3 text-[12px]" style={{ color: TEMA.atencao }}>
              ⚠ Já existe uma conta com este nome na carteira. Se for a segunda conta do mesmo
              cliente, tudo bem — o painel junta por accountId, nunca por nome. Se não for,
              confira antes: dois clientes com o mesmo nome ficam impossíveis de distinguir na tela.
            </p>
          )}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            <button
              onClick={cadastrar}
              disabled={!podeSalvar}
              className="rounded-full px-4 py-2 text-[12px] font-medium transition hover:brightness-125 disabled:opacity-50"
              style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
            >
              {salvando ? "Cadastrando…" : "Confirmar cadastro"}
            </button>
            <button
              onClick={() => setAberto(false)}
              className="rounded-full px-3 py-2 text-[12px] font-medium transition hover:bg-brand-hover"
              style={{ color: TEMA.texto, border: `1px solid ${TEMA.bordaForte}` }}
            >
              Cancelar
            </button>
            {/* ⚠️ EXISTE PORQUE A FONTE FICOU DIVIDIDA: cadastro pela tela nasce no
                Firestore, e o data/contas.json deixa de ser a lista inteira. Quem
                quiser o git como histórico da carteira cola esta linha lá. */}
            <button
              onClick={copiar}
              disabled={!cliente.trim() || !gestor}
              className="ml-auto rounded-full px-3 py-2 text-[12px] transition hover:bg-brand-hover disabled:opacity-50"
              // ⚠️ `bordaForte`, não `borda`. É BOTÃO — e o jeito de deixá-lo
              // secundário é o TEXTO em `muted` (5,92:1), não apagar o contorno:
              // em `borda` (1,23:1) o limite some e o botão vira texto solto,
              // exatamente o defeito das opções do seletor de semáforo.
              style={{ color: MUTED, border: `1px solid ${TEMA.bordaForte}` }}
              title="Para manter o data/contas.json completo no git. Preencha nome e gestor antes."
            >
              {copiado ? "✓ copiado" : "Copiar linha do JSON"}
            </button>
          </div>
          <p className="mt-2 text-[11px]" style={{ color: MUTED }}>
            O cadastro grava direto no Firestore, marcado como feito pela tela. O import do
            <code> data/contas.json</code> não apaga nem sobrescreve contas assim — e lista todas
            elas no relatório, sempre.
            {" "}
            {/* Expectativa de tempo: sem isto, a pessoa cadastra, abre o Dashboard, vê a
                conta zerada e acha que deu errado. O histórico cheio vem sozinho — conta
                sem agregado é detectada como nova e recebe a janela cheia. */}
            <b>Os números dela só aparecem depois do próximo sync</b> (roda todo dia às 9h UTC);
            o histórico entra completo, não só de hoje em diante.
          </p>
        </div>
      )}
    </div>
  );
}

function Campo({ rotulo, dica, children }: { rotulo: string; dica: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[12px] font-medium" style={{ color: TEMA.texto }}>{rotulo}</span>
      {children}
      <span className="mt-1 block text-[11px]" style={{ color: MUTED }}>{dica}</span>
    </label>
  );
}

function Selo({ texto, cor, fundo, titulo }: { texto: string; cor: string; fundo: string; titulo: string }) {
  return (
    <span
      className="rounded px-1.5 py-0.5 text-[10px] font-semibold uppercase"
      style={{ background: fundo, color: cor, cursor: "help" }}
      title={titulo}
    >
      {texto}
    </span>
  );
}
