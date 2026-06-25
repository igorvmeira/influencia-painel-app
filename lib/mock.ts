import { Painel } from "./types";

export const mockPainel: Painel = {
  periodoLabel: "Últimos 15 dias",
  atualizadoEm: "dados de exemplo",
  totais: {
    gasto: 168420,
    conversas: 4213,
    cpl: 39.98,
    b2b: 1180,
    b2c: 3033,
    gastoVar: 4,
    conversasVar: 9,
    cplVar: -5,
  },
  gestores: [
    { nome: "Ana Souza", gasto: 62300, conversas: 1624, b2b: 470, b2c: 1154, cpl: 38.36, cplVar: -6 },
    { nome: "Bruno Lima", gasto: 58900, conversas: 1402, b2b: 410, b2c: 992, cpl: 42.01, cplVar: 3 },
    { nome: "Carla Dias", gasto: 47220, conversas: 1187, b2b: 300, b2c: 887, cpl: 39.78, cplVar: -2 },
  ],
  detalhes: [
    {
      gestor: "Ana Souza",
      contasCount: 15,
      cplSemanal: [
        { semana: "Sem 1", atual: 41, doisMesesAtras: 45 },
        { semana: "Sem 2", atual: 39, doisMesesAtras: 44 },
        { semana: "Sem 3", atual: 37, doisMesesAtras: 46 },
        { semana: "Sem 4", atual: 36, doisMesesAtras: 43 },
      ],
      clientes: [
        { cliente: "Loja Verde", tipo: "B2C", gasto: 8420, conversas: 312, cplSemanal: 27.01 },
        { cliente: "TechPrime", tipo: "B2B", gasto: 11200, conversas: 96, cplSemanal: 116.67 },
        { cliente: "Studio Bella", tipo: "B2C", gasto: 5640, conversas: 248, cplSemanal: 22.74 },
        { cliente: "Contábil Onuma", tipo: "B2B", gasto: 7900, conversas: 71, cplSemanal: 111.27 },
        { cliente: "FitLab", tipo: "B2C", gasto: 6310, conversas: 274, cplSemanal: 23.03 },
        { cliente: "Imob Costa", tipo: "B2B", gasto: 9100, conversas: 88, cplSemanal: 103.41 },
      ],
    },
    {
      gestor: "Bruno Lima",
      contasCount: 15,
      cplSemanal: [
        { semana: "Sem 1", atual: 40, doisMesesAtras: 39 },
        { semana: "Sem 2", atual: 42, doisMesesAtras: 40 },
        { semana: "Sem 3", atual: 43, doisMesesAtras: 41 },
        { semana: "Sem 4", atual: 44, doisMesesAtras: 42 },
      ],
      clientes: [
        { cliente: "AutoPeças BH", tipo: "B2B", gasto: 12800, conversas: 102, cplSemanal: 125.49 },
        { cliente: "Doce Encanto", tipo: "B2C", gasto: 7200, conversas: 286, cplSemanal: 25.17 },
        { cliente: "Clínica Vita", tipo: "B2C", gasto: 8900, conversas: 301, cplSemanal: 29.57 },
        { cliente: "Jurídico Prado", tipo: "B2B", gasto: 9400, conversas: 79, cplSemanal: 118.99 },
        { cliente: "PetWorld", tipo: "B2C", gasto: 6100, conversas: 233, cplSemanal: 26.18 },
      ],
    },
    {
      gestor: "Carla Dias",
      contasCount: 15,
      cplSemanal: [
        { semana: "Sem 1", atual: 41, doisMesesAtras: 43 },
        { semana: "Sem 2", atual: 40, doisMesesAtras: 42 },
        { semana: "Sem 3", atual: 39, doisMesesAtras: 41 },
        { semana: "Sem 4", atual: 39, doisMesesAtras: 40 },
      ],
      clientes: [
        { cliente: "Moda Urbana", tipo: "B2C", gasto: 7700, conversas: 305, cplSemanal: 25.25 },
        { cliente: "Construtora Líder", tipo: "B2B", gasto: 10600, conversas: 84, cplSemanal: 126.19 },
        { cliente: "Sabor Caseiro", tipo: "B2C", gasto: 5300, conversas: 219, cplSemanal: 24.20 },
        { cliente: "Seguros Mais", tipo: "B2B", gasto: 8200, conversas: 73, cplSemanal: 112.33 },
      ],
    },
  ],
};
