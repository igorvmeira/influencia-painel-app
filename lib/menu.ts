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
  // ESCONDIDO a pedido do Roberto (05/08/2026): a /reunioes mostra a agenda pessoal
  // do Thiago, não a da equipe. Só a ENTRADA saiu — a rota, o componente Reunioes,
  // /api/agenda, lib/googleAgenda.ts e as envs GOOGLE_* continuam intactos, e quem
  // digitar /reunioes entra normalmente. REEXIBIR = descomentar a linha abaixo e
  // devolver o card em components/Inicio.tsx (procure por "ESCONDIDO" lá).
  // { rotulo: "Pautas e Reuniões", href: "/reunioes", descricao: "Reuniões da agenda da agência (Google Agenda)." },
  { rotulo: "Orientações Gerenciais", href: "/orientacoes", descricao: "Observações por conta, com histórico." },
  { rotulo: "Carteira de Contas", href: "/carteira", descricao: "Contas por gestor; edite o responsável (histórico datado)." },
  { rotulo: "Análise de Gestores", href: "/gestores", descricao: "Mês fechado vs mês fechado: evolução de CPL, gasto e conversões." },
  { rotulo: "Funil Comercial", href: "/comercial", descricao: "Captação de novos clientes: onde as pessoas estão, leads novos e perdas." },
  // ⚠️ APARECE PARA TODOS, mas só abre para quem está na env FILA_EMAILS_PERMITIDOS —
  // e a checagem é no servidor (/api/fila-contas), não aqui. Esconder o item seria
  // proteção de mentira; o que ele faz é anunciar que a porta existe.
  // Quem não tem acesso vê um painel NEUTRO explicando o porquê, não um erro
  // vermelho — ver o comentário de MSG_RESTRITO em lib/filaContas.ts.
  { rotulo: "Contas Novas", href: "/fila-contas", descricao: "Contas que o Meta mostra e que ainda não estão na carteira. Restrito." },
];

export const MENU_EM_BREVE: ItemMenu[] = [
  { rotulo: "Relatórios Gerenciais", emBreve: true, descricao: "Relatórios consolidados por período e por gestor." },
  // "Análise de Clientes" SAIU daqui em 16/08/2026: ela existe, mas como MODAL —
  // clicar no nome do cliente na /carteira abre a análise sobre a tela, que foi o
  // caminho que a agência pediu. Deixar "em breve" no menu depois que a coisa
  // existe é dívida de interface, e pior: faz o dono esperar pelo que já tem.
];
