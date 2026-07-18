// Mensagem amigável a partir do erro cru das APIs. "indisponivel" (503) vira um
// aviso claro de indisponibilidade — nunca mostramos dados de exemplo no lugar.
export function mensagemErro(cru: string): string {
  if (/indispon[ií]vel/i.test(cru)) {
    return "Não foi possível carregar os dados agora (indisponibilidade temporária). Tente novamente em instantes.";
  }
  return cru;
}
