"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { DadosPainel } from "@/lib/useDadosPainel";
import { MARCA, TEMA } from "@/lib/brand";
import { brlDec } from "@/lib/format";
import { momentoSync, rotuloMes, ymdParaBR } from "@/lib/periodo";
import {
  antesDoPrimeiroFechamento, chaveMes, divergenciasDaFoto, liberacaoFechamento, mesesSemFechamento, textoDoValor,
  MOTIVO_MINIMO_CARACTERES, MSG_FECHAMENTO_RESTRITO,
  type CausaDivergencia, type Divergencias, type FotoFechamento, type GestorNaFoto, type InsumosFoto, type ResumoFechamentos,
} from "@/lib/fotoFechamento";
import { buscarFechamentos, ErroFechamento, pedirFechamento, type RespostaPrevia } from "@/lib/useFechamento";
import Modal from "./Modal";
import DeltaChip from "./DeltaChip";

const MUTED = TEMA.muted;
const AMBAR = TEMA.atencao;
const LINE = TEMA.borda;

const hojeNoFuso = () =>
  new Intl.DateTimeFormat("en-CA", { timeZone: MARCA.fuso, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());

/**
 * O FECHAMENTO DO MÊS na /gestores — aviso, foto e prévia.
 *
 * 🔑 A FOTO É O NÚMERO PRINCIPAL do mês fechado, e o que está abaixo dela é o cálculo de hoje (desenho
 * aprovado pelo Igor em 15/09/2026). A linha de divergência só aparece quando há diferença, com a
 * causa separada — e o texto sai de lib/fotoFechamento.ts, que diz qual dos dois vale para quê.
 *
 * ⚠️ LIMITE DESTA VERSÃO: os cards, o slope e a decomposição abaixo continuam no cálculo de hoje,
 * e a Início não lê a foto. A foto fica no topo, e o bloco termina dizendo onde começa o cálculo.
 *
 * Custo: 1 leitura por troca de mês (resumo), 2 quando o mês tem foto. Divergência e liberação são
 * calculadas aqui, sobre o `daily` que a sessão já carregou — zero leitura. Prévia e gravação são
 * calculadas no servidor, que é quem grava.
 */
export default function FechamentoMes({ dados, ano, mes }: { dados: DadosPainel; ano: number; mes: number }) {
  const chave = chaveMes(ano, mes);
  const rotulo = rotuloMes(ano, mes);
  const [carregado, setCarregado] = useState<{ chave: string; resumo: ResumoFechamentos; foto: FotoFechamento | null } | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [recarga, setRecarga] = useState(0);
  const [previaAberta, setPreviaAberta] = useState(false);

  useEffect(() => {
    let vivo = true;
    setErro(null);
    buscarFechamentos(chave)
      .then((r) => { if (vivo) setCarregado({ chave, resumo: r.resumo, foto: r.foto }); })
      .catch((e) => { if (vivo) setErro((e as Error).message); });
    return () => { vivo = false; };
  }, [chave, recarga]);

  const ins: InsumosFoto = useMemo(() => ({
    daily: dados.daily, contas: dados.contas, leituraPorConta: dados.leituraPorConta,
    inicioJanela: dados.inicioJanela, ultimaSync: dados.ultimaSync, ultimoDiaCompleto: dados.ultimoDiaCompleto,
  }), [dados]);
  const hoje = hojeNoFuso();
  const resumo = carregado?.resumo ?? null;
  // A foto só vale para o mês que ela descreve — resposta atrasada de outro mês não aparece aqui.
  const foto = carregado?.chave === chave ? carregado.foto : null;
  const pendentes = useMemo(() => (resumo ? mesesSemFechamento(ins, resumo, hoje) : []), [ins, resumo, hoje]);
  const liberacao = useMemo(() => liberacaoFechamento(ins, ano, mes), [ins, ano, mes]);
  const diverg = useMemo(() => (foto ? divergenciasDaFoto(foto, ins) : null), [foto, ins]);
  const antigo = antesDoPrimeiroFechamento(ano, mes);
  const fecharPrevia = useCallback(() => setPreviaAberta(false), []);
  const aoGravar = useCallback(() => { setPreviaAberta(false); setRecarga((n) => n + 1); }, []);

  return (
    <div className="mb-6 space-y-2">
      {/* O aviso vale para TODO mês sem foto, qualquer que seja o mês escolhido — ele nasce aberto e só
          some com a foto. Âmbar: é prazo, não pane. */}
      {pendentes.map((p) => (
        <div key={`${p.ano}-${p.mes}`} className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          ⚠ <b>{p.rotulo} sem fechamento</b> ·{" "}
          {p.saida.dias > 0 ? `${p.saida.dias} dia(s) até sair da janela` : "sai da janela na próxima sincronização"}
          {" "}(sincronização de {ymdParaBR(p.saida.data)}). Depois disso, o mês só existe na tela como reconstrução.
        </div>
      ))}

      {erro && (
        <p className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: TEMA.erroFundo, color: TEMA.negativo }}>
          Não deu para carregar o fechamento: {erro}
        </p>
      )}

      {antigo ? (
        <p className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: TEMA.limiteFundo, color: AMBAR }}>
          {rotulo} foi pago sem foto do fechamento: o que aparece abaixo é o cálculo de hoje, não o que embasou o pagamento.
        </p>
      ) : carregado?.chave !== chave ? null : foto ? (
        <section className="p-4" style={{ background: TEMA.card, border: `1px solid ${LINE}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
          <p className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: MUTED }}>
            {foto.valor === "pagamento" ? "Fechamento" : "Registro do fechamento"} · {rotulo} · versão {foto.versao}
          </p>
          <p className="mt-1 text-[12.5px]" style={{ color: TEMA.texto }}>{textoDoValor(foto.valor)}</p>
          <p className="mt-1 text-[12px]" style={{ color: MUTED }}>
            Fechado em {momentoSync(foto.fechadoEm, MARCA.fuso)} pela conta {foto.fechadoPor.email}
            {!foto.fechadoPor.identificaPessoa && " — o login do painel é compartilhado; isto não identifica quem clicou"}.
            {" "}Dado da sincronização de {momentoSync(foto.dado.ultimaSync, MARCA.fuso) ?? "—"}.
            {foto.motivo && <> Motivo desta versão: {foto.motivo}</>}
          </p>
          <TabelaGestores gestores={foto.gestores} selo={foto.selo} mesAnterior={foto.mesAnterior} mes={foto.mes} />
          {diverg && <LinhasDivergencia d={diverg} />}
          <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
            <p className="text-[12px]" style={{ color: MUTED }}>Abaixo, o cálculo de hoje — dado e carteira atuais.</p>
            <button type="button" onClick={() => setPreviaAberta(true)}
              className="rounded-full px-3.5 py-1.5 text-[12px] font-medium transition hover:brightness-125"
              style={{ background: TEMA.chip, color: TEMA.texto }}>
              Refechar {rotulo}
            </button>
          </div>
        </section>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg px-3 py-2"
          style={{ background: TEMA.card, border: `1px solid ${LINE}` }}>
          <p className="text-[12.5px]" style={{ color: TEMA.texto }}>
            <b>{rotulo} ainda não foi fechado.</b>{" "}
            <span style={{ color: MUTED }}>{liberacao.pode ? "O botão está liberado: o mês está inteiro nos dados." : liberacao.motivo}</span>
          </p>
          <button type="button" onClick={() => setPreviaAberta(true)}
            className="rounded-full px-3.5 py-1.5 text-[12px] font-medium transition hover:brightness-125"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}>
            Ver prévia do fechamento
          </button>
        </div>
      )}

      {previaAberta && <PreviaFechamento ano={ano} mes={mes} aoFechar={fecharPrevia} aoGravar={aoGravar} />}
    </div>
  );
}

function TabelaGestores({ gestores, selo, mesAnterior, mes }: { gestores: GestorNaFoto[]; selo: string | null; mesAnterior: string; mes: string }) {
  const rot = (k: string) => { const [a, m] = k.split("-").map(Number); return rotuloMes(a, m); };
  const ordenados = [...gestores].sort((a, b) => (a.cplVar ?? Infinity) - (b.cplVar ?? Infinity));
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full border-collapse text-[12.5px]">
        <thead>
          <tr className="text-left" style={{ color: MUTED }}>
            <th className="py-1.5 pr-3 font-medium">Gestor</th>
            <th className="py-1.5 pr-3 text-right font-medium">CPL {rot(mesAnterior)}</th>
            <th className="py-1.5 pr-3 text-right font-medium">CPL {rot(mes)}</th>
            <th className="py-1.5 pr-3 text-right font-medium">Δ CPL</th>
            <th className="py-1.5 font-medium">Situação</th>
          </tr>
        </thead>
        <tbody>
          {ordenados.map((g) => (
            <tr key={g.gestor} style={{ borderTop: `1px solid ${LINE}` }}>
              <td className="py-1.5 pr-3 font-medium" style={{ color: TEMA.texto }}>
                {g.gestor}{selo === g.gestor && <span className="ml-1.5" title="Selo de melhor evolução no fechamento">🏆</span>}
              </td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-mono" style={{ color: TEMA.texto }}>{g.cplAnterior === null ? "—" : brlDec(g.cplAnterior)}</td>
              <td className="py-1.5 pr-3 text-right tabular-nums font-mono" style={{ color: TEMA.texto }}>{g.cplAtual === null ? "—" : brlDec(g.cplAtual)}</td>
              <td className="py-1.5 pr-3 text-right">
                <DeltaChip delta={g.cplVar} menorMelhor motivo={g.cplVar === null ? "sem CPL num dos dois meses — não há variação" : null} />
              </td>
              <td className="py-1.5" style={{ color: g.elegivel ? TEMA.texto : MUTED }} title={g.motivoInelegivel ?? undefined}>
                {g.elegivel ? "elegível" : "inelegível"}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function LinhasDivergencia({ d }: { d: Divergencias }) {
  const causas: [string, CausaDivergencia | null][] = [["régua", d.regua], ["carteira", d.carteira], ["dado", d.dado]];
  return (
    <div className="mt-3 space-y-2">
      {causas.filter(([, c]) => c).map(([nome, c]) => (
        <div key={nome} className="rounded-lg px-3 py-2 text-[12.5px]" style={{ background: TEMA.limiteFundo, color: TEMA.texto }}>
          <p><b style={{ color: AMBAR }}>O cálculo de hoje difere da foto — {nome}.</b> {c!.resumo}</p>
          <p className="mt-0.5">{c!.explicacao}</p>
          {/* A dobra anuncia o que tem dentro; o alerta em si fica aberto acima dela. */}
          <details className="mt-1">
            <summary className="cursor-pointer text-[12px]">Ver {c!.itens.length === 1 ? "o item" : `os ${c!.itens.length} itens`}</summary>
            <ul className="mt-1 list-disc pl-5 text-[12px]">
              {c!.itens.map((i, k) => <li key={k}>{i}</li>)}
            </ul>
          </details>
        </div>
      ))}
      {d.dadoIndisponivel && <p className="text-[12px]" style={{ color: MUTED }}>{d.dadoIndisponivel}</p>}
    </div>
  );
}

type EstadoPrevia =
  | { tipo: "carregando" }
  | { tipo: "erro"; msg: string; restrito: boolean }
  | { tipo: "pronta"; r: RespostaPrevia };

function PreviaFechamento({ ano, mes, aoFechar, aoGravar }: { ano: number; mes: number; aoFechar: () => void; aoGravar: () => void }) {
  const rotulo = rotuloMes(ano, mes);
  const [estado, setEstado] = useState<EstadoPrevia>({ tipo: "carregando" });
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [recusa, setRecusa] = useState<{ msg: string; restrito: boolean } | null>(null);

  useEffect(() => {
    let vivo = true;
    pedirFechamento<RespostaPrevia>({ acao: "previa", ano, mes })
      .then((r) => { if (vivo) setEstado({ tipo: "pronta", r }); })
      .catch((e) => { if (vivo) setEstado({ tipo: "erro", msg: (e as Error).message, restrito: e instanceof ErroFechamento && e.status === 403 }); });
    return () => { vivo = false; };
  }, [ano, mes]);

  const r = estado.tipo === "pronta" ? estado.r : null;
  const motivoOk = !r?.exigeMotivo || motivo.trim().length >= MOTIVO_MINIMO_CARACTERES;
  const podeConfirmar = !!r && r.liberacao.pode && r.podeGravar && motivoOk && !enviando;

  const confirmar = async () => {
    if (!r) return;
    setEnviando(true);
    setRecusa(null);
    try {
      await pedirFechamento({ acao: "fechar", ano, mes, assinatura: r.assinatura, versaoEsperada: r.versaoAtual, motivo: motivo.trim() || null });
      aoGravar();
    } catch (e) {
      setRecusa({ msg: (e as Error).message, restrito: e instanceof ErroFechamento && e.status === 403 });
    } finally {
      setEnviando(false);
    }
  };

  const refechar = !!r && r.versaoAtual > 0;
  return (
    <Modal
      aberto
      aoFechar={aoFechar}
      titulo={`${refechar ? "Refechar" : "Fechar"} ${rotulo}`}
      subtitulo="Prévia — nada é gravado até você confirmar"
      rodape={
        <div className="flex flex-wrap justify-end gap-2">
          <button type="button" onClick={aoFechar} className="rounded-full px-4 py-2 text-[13px] transition hover:brightness-125"
            style={{ background: TEMA.chip, color: TEMA.texto }}>Cancelar</button>
          <button type="button" onClick={confirmar} disabled={!podeConfirmar}
            className="rounded-full px-4 py-2 text-[13px] font-medium transition hover:brightness-125 disabled:cursor-not-allowed disabled:opacity-50"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}>
            {enviando ? "Gravando…" : `${refechar ? `Gravar versão ${r!.versaoAtual + 1}` : "Fechar"} como ${r?.valor === "pagamento" ? "fechamento" : "registro"}`}
          </button>
        </div>
      }
    >
      {estado.tipo === "carregando" && <p className="text-[13px]" style={{ color: MUTED }}>Montando a prévia com o dado de agora…</p>}
      {estado.tipo === "erro" && (
        <p className="rounded-lg px-3 py-2 text-[13px]"
          style={estado.restrito ? { background: TEMA.chip, color: TEMA.texto } : { background: TEMA.erroFundo, color: TEMA.negativo }}>
          {estado.msg}
        </p>
      )}
      {r && (
        <div className="space-y-3 text-[13px]" style={{ color: TEMA.texto }}>
          <p>{textoDoValor(r.valor)}</p>
          <p style={{ color: MUTED }}>
            Dado da sincronização de {momentoSync(r.conteudo.dado.ultimaSync, MARCA.fuso) ?? "—"} · último dia completo{" "}
            {r.conteudo.dado.ultimoDiaCompleto ? ymdParaBR(r.conteudo.dado.ultimoDiaCompleto) : "—"} · {r.conteudo.contas.length} contas
            ativas, {r.conteudo.contas.filter((c) => c.incompleta).length} com mês incompleto.
          </p>
          <p><b>Selo:</b> {r.conteudo.selo ?? "ninguém"}</p>
          <TabelaGestores gestores={r.conteudo.gestores} selo={r.conteudo.selo} mesAnterior={r.conteudo.mesAnterior} mes={r.conteudo.mes} />
          {!r.liberacao.pode && (
            <p className="rounded-lg px-3 py-2" style={{ background: TEMA.limiteFundo, color: AMBAR }}>⚠ {r.liberacao.motivo}</p>
          )}
          {!r.podeGravar && (
            // Neutro, não vermelho: é permissão, não pane.
            <p className="rounded-lg px-3 py-2" style={{ background: TEMA.chip, color: TEMA.texto }}>{MSG_FECHAMENTO_RESTRITO}</p>
          )}
          {r.exigeMotivo && (
            <label className="block">
              <span className="text-[12px]" style={{ color: MUTED }}>
                Motivo do refechamento — a versão {r.versaoAtual} continua gravada; esta vira a {r.versaoAtual + 1}.
              </span>
              <textarea
                value={motivo}
                // O veredito morre quando a entrada muda: a recusa anterior não fica ao lado do texto novo.
                onChange={(e) => { setMotivo(e.target.value); setRecusa(null); }}
                rows={3}
                className="mt-1 w-full rounded-lg px-3 py-2 text-[13px] outline-none"
                style={{ background: TEMA.card, color: TEMA.texto, border: `1px solid ${LINE}` }}
              />
              <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>
                {motivo.trim().length}/{MOTIVO_MINIMO_CARACTERES} caracteres no mínimo
              </span>
            </label>
          )}
          <p className="text-[12px]" style={{ color: MUTED }}>
            O que aparece aqui é exatamente o que será gravado. Se o dado mudar antes de confirmar (sincronização nova ou
            troca na carteira), o painel recusa e pede nova prévia. Fica registrada a conta do login, que é compartilhado —
            isso não identifica quem clicou.
          </p>
          {recusa && (
            <p className="rounded-lg px-3 py-2"
              style={recusa.restrito ? { background: TEMA.chip, color: TEMA.texto } : { background: TEMA.limiteFundo, color: AMBAR }}>
              {recusa.msg}
            </p>
          )}
        </div>
      )}
    </Modal>
  );
}
