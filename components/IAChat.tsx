"use client";

import { useEffect, useRef, useState } from "react";
import { auth } from "@/lib/firebaseClient";
import { MARCA } from "@/lib/brand";

// A UI só aparece se NEXT_PUBLIC_IA_ATIVA = "true". Sem isso, nada é renderizado
// (o wrapper retorna null antes de qualquer hook do painel interno).
const ATIVA = process.env.NEXT_PUBLIC_IA_ATIVA === "true";

const INK = "#141414";
const CARD = "#1F1F1F";
const YELLOW = "#F6E003";
const LINE = "#2A2A2A";
const MUTED = "#9A968F";

interface Msg { role: "user" | "assistant"; content: string }

export default function IAChat({ periodoDias }: { periodoDias: number }) {
  if (!ATIVA) return null;
  return <IAChatPainel periodoDias={periodoDias} />;
}

function IAChatPainel({ periodoDias }: { periodoDias: number }) {
  const [aberto, setAberto] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [texto, setTexto] = useState("");
  const [carregando, setCarregando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const fimRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    fimRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [msgs, carregando]);

  async function enviar() {
    const pergunta = texto.trim();
    if (!pergunta || carregando) return;
    setErro(null);
    const novo: Msg[] = [...msgs, { role: "user", content: pergunta }];
    setMsgs(novo);
    setTexto("");
    setCarregando(true);
    try {
      const usuario = auth?.currentUser;
      if (!usuario) throw new Error("Sessão expirada. Faça login novamente.");
      const token = await usuario.getIdToken();
      const r = await fetch("/api/ia", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ mensagens: novo, periodoDias }),
      });
      const j = await r.json();
      if (j?.desligado) setErro("Módulo de IA desligado (sem chave configurada).");
      else if (!r.ok || !j?.ok) setErro(j?.erro || `Erro ${r.status}`);
      else setMsgs([...novo, { role: "assistant", content: j.resposta || "(sem resposta)" }]);
    } catch (e) {
      setErro(e instanceof Error ? e.message : "Falha ao consultar a IA.");
    } finally {
      setCarregando(false);
    }
  }

  return (
    <div className="fixed bottom-5 right-5 z-50 flex flex-col items-end gap-3">
      {aberto && (
        <div
          className="flex h-[28rem] w-[22rem] max-w-[calc(100vw-2.5rem)] flex-col overflow-hidden rounded-2xl shadow-2xl"
          style={{ background: INK, border: `1px solid ${LINE}` }}
        >
          {/* Cabeçalho */}
          <div className="flex items-center justify-between px-4 py-3" style={{ background: CARD, borderBottom: `1px solid ${LINE}` }}>
            <div className="flex items-center gap-2">
              <span className="h-2 w-2 rounded-full" style={{ background: YELLOW }} />
              <span className="text-sm font-semibold text-white">{MARCA.assistente}</span>
              <span className="text-[11px]" style={{ color: MUTED }}>· últimos {periodoDias} dias</span>
            </div>
            <button onClick={() => setAberto(false)} className="text-[13px] hover:text-white" style={{ color: MUTED }}>✕</button>
          </div>

          {/* Mensagens */}
          <div className="flex-1 space-y-3 overflow-y-auto px-4 py-3">
            {msgs.length === 0 && (
              <p className="text-[13px]" style={{ color: MUTED }}>
                Pergunte sobre gasto, CPL, leads por gestor/nicho ou contas perto do limite. Uso os dados do período selecionado.
              </p>
            )}
            {msgs.map((m, i) => (
              <div key={i} className={m.role === "user" ? "flex justify-end" : "flex justify-start"}>
                <div
                  className="max-w-[85%] whitespace-pre-wrap rounded-xl px-3 py-2 text-[13px]"
                  style={m.role === "user"
                    ? { background: YELLOW, color: INK }
                    : { background: CARD, color: "#fff", border: `1px solid ${LINE}` }}
                >
                  {m.content}
                </div>
              </div>
            ))}
            {carregando && (
              <div className="flex justify-start">
                <div className="rounded-xl px-3 py-2 text-[13px]" style={{ background: CARD, color: MUTED, border: `1px solid ${LINE}` }}>
                  {MARCA.assistente} está pensando…
                </div>
              </div>
            )}
            {erro && (
              <div className="rounded-xl px-3 py-2 text-[12px]" style={{ background: "#2a1414", color: "#FF6B5E" }}>{erro}</div>
            )}
            <div ref={fimRef} />
          </div>

          {/* Entrada */}
          <div className="flex items-center gap-2 px-3 py-3" style={{ background: CARD, borderTop: `1px solid ${LINE}` }}>
            <input
              value={texto}
              onChange={(e) => setTexto(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); enviar(); } }}
              placeholder="Pergunte algo…"
              className="flex-1 rounded-xl px-3 py-2 text-[13px] outline-none placeholder:text-[#6b675f]"
              style={{ background: INK, color: "#fff", border: `1px solid ${LINE}` }}
            />
            <button
              onClick={enviar}
              disabled={carregando || !texto.trim()}
              className="rounded-xl px-3 py-2 text-[13px] font-semibold transition-opacity disabled:opacity-40"
              style={{ background: YELLOW, color: INK }}
            >
              Enviar
            </button>
          </div>
        </div>
      )}

      {/* Botão flutuante */}
      <button
        onClick={() => setAberto((a) => !a)}
        className="rounded-full px-4 py-3 text-sm font-semibold shadow-lg transition-transform hover:scale-105"
        style={{ background: YELLOW, color: INK }}
      >
        {aberto ? "Fechar" : `Falar com ${MARCA.assistente}`}
      </button>
    </div>
  );
}
