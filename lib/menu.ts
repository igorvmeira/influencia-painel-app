// Itens de navegação — fonte única usada pela sidebar (Shell) e pela tela Início.
export interface ItemMenu {
  rotulo: string;
  href?: string;       // ausente = seção EM BREVE (desabilitada)
  descricao: string;
  emBreve?: boolean;
}

export const MENU_PRINCIPAL: ItemMenu[] = [
  { rotulo: "Início", href: "/", descricao: "O que precisa da sua atenção hoje." },
  { rotulo: "Dashboard de Tráfego", href: "/dashboard", descricao: "KPIs, alertas, rankings e tendência do período." },
];

export const MENU_EM_BREVE: ItemMenu[] = [
  { rotulo: "Pautas e Reuniões", emBreve: true, descricao: "Agenda e pautas de reunião com os clientes." },
  { rotulo: "Relatórios Gerenciais", emBreve: true, descricao: "Relatórios consolidados por período e por gestor." },
  { rotulo: "Análise de Clientes", emBreve: true, descricao: "Visão detalhada de desempenho por cliente." },
  { rotulo: "Análise de Gestores", emBreve: true, descricao: "Carteira e desempenho de cada gestor." },
];
