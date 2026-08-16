"use client";

import Link from "next/link";
import { useComercial } from "@/lib/useComercial";
import { useEntrada, atrasoDe } from "@/lib/useEntrada";
import { TEMA, MOVIMENTO } from "@/lib/brand";
import SecaoHeader from "./SecaoHeader";
import KpiCard from "./KpiCard";
import BarraDado from "./BarraDado";

const MUTED = TEMA.muted;
const GOLD = TEMA.destaque;
const AMBER = TEMA.atencao;
const RED = TEMA.negativo;

const n = (v: number) => v.toLocaleString("pt-BR");
const NOME_ETAPA: Record<number, string> = {
  113: "Recuperação de LEAD",
  49: "LEAD RECUPERADO — automação",
};

/**
 * A VISÃO DE RECUPERAÇÃO — Variante B, decidida pelo Igor em 15/08/2026.
 *
 * ⚠️ ELA NÃO É ABA ESCONDIDA, e isso foi condição da decisão. As etapas de
 * recuperação saíram do funil de captação porque 830 linhas de reprocessamento
 * faziam o funil parecer maior do que é — mas tirar do funil e enterrar numa aba
 * seria o mesmo que apagar. Fica a um clique, com link nos dois sentidos.
 */
export default function Recuperacao() {
  const { agregado, carregando, erro, recarregar } = useComercial();
  const { ref: refDist, entrou: entrouDist } = useEntrada<HTMLDivElement>();

  if (erro) {
    return (
      <div>
        <h1 className="mb-4 text-lg font-semibold text-brand-ink">Recuperação de leads</h1>
        <div className="rounded-xl px-4 py-4" style={{ background: TEMA.erroFundo, color: RED, border: `1px solid ${TEMA.negativo}` }}>
          <div className="text-[13px] font-medium">Não foi possível carregar a recuperação.</div>
          <div className="mt-1 text-[12.5px] opacity-90">{erro}</div>
          <button
            type="button" onClick={recarregar}
            className="mt-3 rounded-full px-4 py-1.5 text-[12px] font-semibold transition hover:brightness-125"
            style={{ background: GOLD, color: TEMA.textoSobreDestaque }}
          >
            Tentar de novo
          </button>
        </div>
      </div>
    );
  }
  if (carregando) {
    return (
      <div className="space-y-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-32 animate-pulse motion-reduce:animate-none"
            style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard }} />
        ))}
      </div>
    );
  }
  if (!agregado) {
    return (
      <div className="rounded-lg px-4 py-3 text-[12.5px]" style={{ background: TEMA.limiteFundo, color: AMBER }}>
        <b>Ainda não sincronizado.</b> Esta tela lê o mesmo documento pré-agregado do funil,
        e ele ainda não foi gravado. Nenhum número é exibido até lá.
      </div>
    );
  }

  const { recuperacao: r, funil } = agregado;
  const maxDist = Math.max(1, ...r.distribuicao.map((d) => d.pessoas));
  const maisDeUma = r.distribuicao.filter((d) => d.vezes > 1).reduce((t, d) => t + d.pessoas, 0);
  const piso = r.sucesso.find((s) => s.chave === "provado");

  return (
    <div>
      <div className="mb-5">
        <h1 className="text-lg font-semibold text-brand-ink">Recuperação de leads</h1>
        <p className="text-[13px]" style={{ color: MUTED }}>
          Contatos que não deram para trabalhar na primeira vez e voltaram para a fila.{" "}
          {/* ⚠️ O caminho de volta é obrigatório: a recuperação saiu do funil, não do painel. */}
          <Link href="/comercial" className="underline underline-offset-2 transition hover:brightness-125" style={{ color: TEMA.ouroTexto }}>
            ← voltar ao funil de captação ({n(funil.pessoasNoFunil)} pessoas)
          </Link>
        </p>
      </div>

      {/* ================= O TAMANHO ================= */}
      <SecaoHeader
        titulo="O tamanho da recuperação"
        icone="↻"
        subtitulo={`${n(r.pessoas)} pessoas · ${n(r.oportunidades)} oportunidades abertas`}
      />
      <div className="mb-5 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
        {r.porEtapa.map((e) => (
          <KpiCard
            key={e.etapaId}
            rotulo={NOME_ETAPA[e.etapaId] ?? `etapa ${e.etapaId}`}
            valor={e.pessoas}
            formatar={(v) => n(Math.round(v))}
            base={e.etapaId === 49
              ? "A automação moveu para cá dizendo que recuperou. Estar aqui é reivindicação do sistema, não evidência de que o lead avançou."
              : "Aguardando reprocessamento. É de onde a automação puxa."}
          />
        ))}
        <KpiCard
          rotulo="Maior que o funil"
          valor={r.pessoas}
          formatar={(v) => n(Math.round(v))}
          base={`A recuperação tem mais gente que o funil de captação inteiro (${n(funil.pessoasNoFunil)}). Ler o funil sem olhar para cá dá a impressão de uma operação menor do que ela é.`}
          destaque={r.pessoas > funil.pessoasNoFunil}
        />
      </div>

      {/* ================= QUANTAS VEZES ================= */}
      <SecaoHeader
        titulo="Quantas vezes o mesmo contato é trabalhado"
        icone="⟳"
        subtitulo={`${n(maisDeUma)} pessoas voltaram mais de uma vez · histórico completo, incluindo o que já encerrou`}
      />
      <div className="mb-5 px-5 py-5" style={{ background: TEMA.card, border: `1px solid ${TEMA.borda}`, borderRadius: TEMA.raioCard, boxShadow: TEMA.sombraCard }}>
        <div ref={refDist} className="space-y-1.5">
          {r.distribuicao.map((d, i) => (
            <div key={d.vezes} className="flex items-center gap-3">
              <span className="w-10 text-right text-[12px] tabular-nums" style={{ color: MUTED }}>{d.vezes}×</span>
              <BarraDado
                pct={(d.pessoas / maxDist) * 100}
                cor={d.vezes >= 5 ? AMBER : GOLD}
                degrade={d.vezes < 5}
                entrou={entrouDist}
                indice={i}
                titulo={`${n(d.pessoas)} pessoas trabalhadas ${d.vezes}×`}
              />
              <span className="w-12 text-right text-[12.5px] font-medium tabular-nums text-brand-ink">{n(d.pessoas)}</span>
            </div>
          ))}
        </div>
        <p className="mt-4 text-[11.5px] leading-relaxed" style={{ color: MUTED }}>
          {/* A correção que o backfill obrigou — ver data/xmax-integracao.md. */}
          Conta o <b style={{ color: TEMA.texto }}>histórico completo</b>, incluindo as oportunidades
          já encerradas que o backfill trouxe. Medir só as abertas subestimaria justamente o que esta
          métrica existe para mostrar: a mesma pessoa sendo reprocessada.
          {" "}Barras em <span style={{ color: AMBER }}>âmbar</span> marcam 5 ou mais passagens.
        </p>
      </div>

      {/* ================= O QUE ISSO PRODUZ ================= */}
      <SecaoHeader
        titulo="O que o reprocessamento produz"
        icone="✓"
        subtitulo="Três medidas, porque a distância entre elas é a informação"
      />
      <div className="mb-4 grid gap-4" style={{ gridTemplateColumns: "repeat(auto-fit,minmax(230px,1fr))" }}>
        {r.sucesso.map((s) => (
          <KpiCard
            key={s.chave}
            rotulo={s.rotulo}
            valor={s.pct}
            formatar={(v) => `${v.toFixed(2).replace(".", ",")}%`}
            secundario={`${n(s.pessoas)} de ${n(r.pessoas)} pessoas`}
            destaque={s.chave === "provado"}
            base={s.definicao}
          />
        ))}
      </div>

      {/* ⚠️ LIMITAÇÃO NO CORPO, não em tooltip — mesmo padrão da /comercial: quando
          a ressalva muda como o número deve ser lido, ela não pode estar escondida. */}
      <div className="rounded-lg px-4 py-3 text-[12.5px] leading-relaxed" style={{ background: TEMA.limiteFundo, color: AMBER }}>
        <b>Estes números são PISO, nunca taxa.</b> O CRM não guarda o caminho do lead: não existe
        histórico de etapas, só a etapa atual. Então quem foi recuperado, avançou e fechou{" "}
        <b>não deixa rastro nesta conta</b> — some da recuperação e aparece no funil como se
        nunca tivesse passado por aqui.
        <br /><br />
        A taxa real de recuperação só passa a existir com o histórico de etapas, ou seja,{" "}
        <b>com as automações do Xmax ligadas</b> para registrar cada movimentação. Até lá, o número
        de cima é o mínimo comprovável, e o de baixo{piso ? ` (${piso.pct.toFixed(2).replace(".", ",")}%)` : ""}{" "}
        é o que sabemos com certeza — não o que aconteceu.
      </div>
    </div>
  );
}
