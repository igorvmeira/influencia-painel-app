"use client";

import { useState } from "react";
import { salvarOrientacao } from "@/lib/useOrientacoes";
import { SEMAFOROS, estiloDe, Semaforo } from "@/lib/semaforo";
import { TEMA } from "@/lib/brand";
import { EntradaOrientacao } from "@/lib/types";

const MUTED = TEMA.muted;
const MAX = 400;

/**
 * O FORMULÁRIO de orientação — um só, usado pela /orientacoes e pelo modal.
 *
 * ⚠️ FOI EXTRAÍDO, NÃO DUPLICADO, e a diferença é o ponto. O modal nasceu só de
 * leitura justamente para não criar "duas verdades sobre como se escreve
 * orientação" — mas o problema nunca foi ESCREVER no modal; era ter dois
 * formulários. Com um componente só, escrever nos dois lugares é a mesma coisa
 * acontecendo em dois lugares, e não duas coisas parecidas.
 *
 * ⚠️ O POST NÃO TEM TETO DE ESPERA, de propósito, e isso vem junto: `salvarOrientacao`
 * EMPILHA no histórico. Abortar o cliente não cancela o que o servidor já gravou, e a
 * retentativa duplicaria o registro. Ver a regra em lib/useOrientacoes.ts.
 */
export default function FormularioOrientacao({
  accountId, inicial, aoSalvar, aoCancelar, rotuloSalvar = "Salvar",
}: {
  accountId: string;
  /** Preenchido = edição; ausente = primeira orientação da conta. */
  inicial?: EntradaOrientacao | null;
  aoSalvar: (nova: EntradaOrientacao) => void;
  aoCancelar?: () => void;
  rotuloSalvar?: string;
}) {
  const [texto, setTexto] = useState(inicial?.texto ?? "");
  const [semaforo, setSemaforo] = useState<Semaforo | null>(inicial?.semaforo ?? null);
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  async function salvar() {
    if (!texto.trim()) return;
    setSalvando(true);
    setErro(null);
    try {
      const nova = await salvarOrientacao(accountId, texto.trim(), semaforo);
      aoSalvar(nova);
    } catch (e) {
      setErro((e as Error)?.message ?? String(e));
    } finally {
      setSalvando(false);
    }
  }

  return (
    <div>
      <textarea
        value={texto}
        onChange={(e) => setTexto(e.target.value.slice(0, MAX))}
        rows={3}
        placeholder="Ex.: CPL levemente alto. Fazer mais 4 criativos."
        className="w-full rounded-lg px-3 py-2 text-[13px] outline-none placeholder:text-brand-placeholder"
        style={{ background: TEMA.fundo, color: TEMA.texto, border: `1px solid ${TEMA.borda}` }}
      />

      <SeletorSemaforo valor={semaforo} onChange={setSemaforo} />

      <div className="mt-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-[11px] tabular-nums" style={{ color: MUTED }}>{texto.length}/{MAX}</span>
        <div className="flex items-center gap-2">
          {erro && <span className="text-[12px]" style={{ color: TEMA.negativo }}>{erro}</span>}
          {aoCancelar && (
            <button type="button" onClick={aoCancelar} className="rounded-full px-3 py-1.5 text-[12px] font-medium" style={{ color: MUTED }}>
              Cancelar
            </button>
          )}
          <button
            type="button"
            onClick={salvar}
            disabled={salvando || !texto.trim()}
            className="rounded-full px-4 py-1.5 text-[12px] font-semibold transition-opacity disabled:opacity-40"
            style={{ background: TEMA.destaque, color: TEMA.textoSobreDestaque }}
          >
            {salvando ? "Salvando…" : rotuloSalvar}
          </button>
        </div>
      </div>
    </div>
  );
}

/**
 * ⚠️ "SEM CLASSIFICAR" É OPÇÃO EXPLÍCITA, não a ausência de clique. Sem ela, quem
 * abrisse uma orientação já classificada não teria como voltar atrás, e o
 * julgamento viraria irreversível por acidente de interface.
 *
 * ⚠️ O rótulo diz o QUE a cor significa — cor sozinha não sobrevive a daltonismo
 * nem a print em preto e branco, e os dois acontecem em reunião de agência.
 */
function SeletorSemaforo({ valor, onChange }: {
  valor: Semaforo | null; onChange: (s: Semaforo | null) => void;
}) {
  const opcoes: (Semaforo | null)[] = [...SEMAFOROS, null];
  return (
    <div className="mt-2">
      <p className="mb-1 text-[11px]" style={{ color: MUTED }}>
        Desempenho do cliente — seu julgamento, independente do alerta automático de CPL.
      </p>
      <div className="flex flex-wrap gap-1.5">
        {opcoes.map((o) => {
          const e = estiloDe(o);
          const ativo = valor === o;
          return (
            <button
              key={o ?? "neutro"}
              type="button"
              onClick={() => onChange(o)}
              title={e.descricao}
              className="rounded-full px-3 py-1 text-[12px] font-medium transition hover:brightness-125"
              // A opção NÃO selecionada precisa parecer clicável: em `borda` (1,23:1)
              // o contorno some no escuro e as quatro viram texto solto.
              style={ativo
                ? { background: e.fundo, color: e.cor, border: `1.5px solid ${e.cor}` }
                : { background: "transparent", color: MUTED, border: `1px solid ${TEMA.bordaForte}` }}
            >
              {o ? e.rotulo : "Sem classificar"}
            </button>
          );
        })}
      </div>
    </div>
  );
}
