"use client";

import { TEMA } from "@/lib/brand";
import { MARCA } from "@/lib/brand";

/**
 * Avisa quando a foto na tela está velha.
 *
 * ⚠️ POR QUE ISTO EXISTE: a tela dizia "Sincronizado em 15/08, 09:44" — tecnicamente
 * correto e enganoso do mesmo jeito. Uma data ao lado de números parece carimbo de
 * atualidade: quem lê assume que o painel se mantém sozinho e não confere.
 *
 * Enquanto a automação funciona, ninguém vê este aviso. Ele existe para o dia em
 * que ELA falhar — e é justamente aí que o dado velho é perigoso, porque a tela
 * continua parecendo viva. **Data sozinha não é frescor; frescor é a data
 * comparada com o esperado.**
 */

/** O sync roda todo dia. Dois dias = pelo menos uma execução falhou em silêncio. */
export const DIAS_ATE_AVISAR = 2;

export default function AvisoDadoVelho({
  geradoEm, diasLimite = DIAS_ATE_AVISAR, oQue = "os dados", workflow = "sync-comercial",
}: {
  geradoEm: string | null | undefined;
  diasLimite?: number;
  oQue?: string;
  /** Qual automação alimenta esta tela — o nome do workflow no GitHub Actions.
      Sem isto o aviso mandaria conferir o sync errado, que é pior que não mandar. */
  workflow?: string;
}) {
  if (!geradoEm) return null;
  const d = new Date(geradoEm);
  if (isNaN(d.getTime())) return null;

  const dias = Math.floor((Date.now() - d.getTime()) / 86400000);
  if (dias < diasLimite) return null;

  const quando = d.toLocaleString("pt-BR", {
    timeZone: MARCA.fuso, dateStyle: "short", timeStyle: "short",
  });

  return (
    <div
      className="mb-4 rounded-lg px-4 py-3 text-[12.5px] leading-relaxed"
      style={{ background: TEMA.limiteFundo, color: TEMA.atencao }}
    >
      <b>⚠ Dado desatualizado — {dias} dias sem sincronizar.</b> A última atualização de{" "}
      {oQue} foi em <b>{quando}</b>, e o sync roda todo dia. Os números abaixo são dessa data,
      não de hoje.
      <br />
      A automação provavelmente falhou — vale conferir a execução do{" "}
      <b>{workflow}</b> no GitHub Actions antes de usar esta tela para decidir.
    </div>
  );
}
