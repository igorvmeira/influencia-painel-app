"use client";

import { createContext, useCallback, useContext, useMemo, useState } from "react";

/**
 * PERÍODO QUE VIAJA ENTRE AS TELAS — o estado, e as regras que o mantêm honesto.
 *
 * O que isto NÃO é: um seletor global no chrome. De 8 telas visíveis, só 2 têm
 * período livre e 2 têm mês; nas outras 4 um controle no menu ficaria inerte ou
 * mentindo — um chrome dizendo "15 dias" enquanto a /gestores mostra "julho vs
 * junho" é a tela afirmando mais do que sabe. Cada tela mantém o seletor dela.
 * Isto aqui só GUARDA a última escolha e SEMEIA a próxima tela.
 *
 * ────────────────────────────────────────────────────────────────────────────
 * ⚠️ 1. DUAS CASAS QUE NUNCA SE CONVERTEM
 *
 * `janelaDias` (7/15/30/60) e `mes` são UNIDADES DIFERENTES e ficam separadas de
 * propósito. Ninguém deriva uma da outra — nem "o mês tem 31 dias, então
 * janelaDias = 31", nem o contrário. É a regra de nunca comparar números em
 * frames de data diferentes, aplicada ANTES de existir número: se a conversão
 * não existe no código, ela não pode aparecer numa tela.
 *
 * Uma tela lê a casa que entende e IGNORA a outra. A /gestores não sabe o que
 * fazer com "15 dias" — e a resposta certa é não fazer nada.
 *
 * ⚠️ 2. LER É TOLERANTE, ESCREVER É SÓ POR CLIQUE
 *
 * Chegar numa tela pode ADAPTAR o valor: a /gestores só oferece mês FECHADO,
 * então recebendo agosto (corrente, parcial) ela apara para julho — e diz na
 * tela que aparou, nunca em silêncio.
 *
 * Mas a adaptação NÃO volta para cá. Se a /gestores gravasse julho, voltar para
 * a /comercial te tiraria de agosto sem você ter pedido — um efeito colateral
 * que ninguém consegue rastrear, porque não houve clique nenhum.
 * **Só ação explícita do usuário chama `escolherJanelaDias`/`escolherMes`.**
 *
 * ⚠️ 3. TRAVA DURA — TROCAR O PERÍODO NUNCA DISPARA CHAMADA À META
 *
 * Consumidor SEMEIA um `useState` local com estes valores (o inicializador roda
 * uma vez e o React ignora as mudanças seguintes) e daí em diante é dono do
 * próprio período. É o que `<CriativosSection diasInicial={diasEfetivos} />` já
 * faz hoje — e hoje funciona POR ACIDENTE, o que é justamente o risco.
 *
 * NUNCA ligue um `useEffect` neste valor para refazer busca. `/api/criativos`
 * consulta a Meta AO VIVO, por conta; um efeito aqui transformaria um clique no
 * seletor de período em N chamadas à Meta que ninguém pediu — e a próxima
 * refatoração faria isso sem perceber, porque a proteção de hoje é implícita.
 * Quem quiser recarregar, clica no seletor do próprio bloco.
 *
 * ⚠️ 4. SESSÃO, NUNCA `localStorage`
 *
 * O valor morre no reload, de propósito. Período que sobrevive ao reload faz
 * alguém abrir o painel na segunda-feira lendo números de 60 dias escolhidos
 * semanas atrás, sem perceber que escolheu. O PADRÃO vale mais que a memória.
 * É o mesmo estilo do `PausadasRodape` e da /reunioes ("não persiste").
 *
 * ⚠️ 5. ESTADO DE DOBRA NÃO MORA AQUI
 *
 * Alguém vai querer guardar "esta seção está recolhida" neste mesmo lugar. Não.
 * Período é escolha sobre QUAL DADO; dobra é escolha sobre QUANTO DA TELA. O
 * primeiro merece viajar entre telas, o segundo é local por natureza.
 * ────────────────────────────────────────────────────────────────────────────
 */

/** As janelas em DIAS que viajam. "Mês" e "Personalizado" NÃO entram: o número
 *  de dias delas é DERIVADO (dias decorridos, tamanho do intervalo), não uma
 *  escolha — e o que viaja é a escolha. */
export const JANELAS_DIA = [7, 15, 30, 60] as const;
export type JanelaDia = (typeof JANELAS_DIA)[number];

/** O mesmo padrão que o Dashboard já usava chumbado. Trocar aqui muda a tela
 *  que abre primeiro — é decisão de produto, não detalhe. */
export const JANELA_PADRAO: JanelaDia = 15;

/** Mês de calendário. `mes` é 1..12 (não 0..11 — o formato do lib/periodo.ts). */
export interface MesEscolhido {
  ano: number;
  mes: number;
}

interface Ctx {
  janelaDias: JanelaDia;
  /** null = ninguém escolheu mês nesta sessão; a tela usa o padrão dela. */
  mes: MesEscolhido | null;
  escolherJanelaDias: (dias: JanelaDia) => void;
  escolherMes: (m: MesEscolhido) => void;
}

/**
 * Padrão do contexto: escritores no-op. Sem provider, o período simplesmente
 * NÃO VIAJA e cada tela segue com o padrão dela — que é o comportamento de
 * hoje. Não lança: um provider esquecido não pode derrubar o Dashboard, que é
 * a tela que a agência mais usa. Degrada tirando o enfeite, não o essencial.
 */
const PeriodoContext = createContext<Ctx>({
  janelaDias: JANELA_PADRAO,
  mes: null,
  escolherJanelaDias: () => {},
  escolherMes: () => {},
});

export const usePeriodoGlobal = () => useContext(PeriodoContext);

export default function PeriodoGlobalProvider({ children }: { children: React.ReactNode }) {
  const [janelaDias, setJanelaDias] = useState<JanelaDia>(JANELA_PADRAO);
  const [mes, setMes] = useState<MesEscolhido | null>(null);

  const escolherJanelaDias = useCallback((dias: JanelaDia) => setJanelaDias(dias), []);
  const escolherMes = useCallback((m: MesEscolhido) => setMes(m), []);

  const valor = useMemo(
    () => ({ janelaDias, mes, escolherJanelaDias, escolherMes }),
    [janelaDias, mes, escolherJanelaDias, escolherMes]
  );

  return <PeriodoContext.Provider value={valor}>{children}</PeriodoContext.Provider>;
}
