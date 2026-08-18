/**
 * DERIVA A PALETA DO MANUAL DE MARCA 2026 — a conta, não o resultado.
 *
 * ⚠️ POR QUE ISTO É VERSIONADO. A paleta do painel não é uma lista de hex escolhidos a
 * olho: é uma ESCADA derivada de duas cores do manual (página #19001E, card #530163) e
 * de razões de luminância herdadas do tema anterior. Quem precisar mexer num degrau
 * daqui a seis meses precisa da CONTA, não do valor — sem ela, "clarear um pouco o chip"
 * vira tentativa e erro que quebra três pares de contraste em silêncio.
 *
 * ⚠️ ELE NÃO ESCREVE NADA. Roda, imprime, e a pessoa copia para lib/brand.ts com o
 * contraste medido no comentário. A separação é de propósito: o brand.ts é a fonte
 * única e precisa ser legível sem executar nada.
 *
 * ⚠️ FOLGA MÍNIMA DE 0,3 EM TODO PAR — decisão do Igor em 18/08/2026. A régua da casa já
 * dizia que a diferença entre 4,4:1 e 4,5:1 não se enxerga; par que sobe ao ar exatamente
 * no piso quebra no primeiro ajuste que alguém fizer, e ninguém vai saber por quê.
 *
 * Uso:  node scripts/deriva-paleta.js
 */

const hx = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = hx(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };
const f = (v) => v.toFixed(2).replace(".", ",");
const mix = (a, b, t) => "#" + hx(a).map((v, i) => Math.round(v + (hx(b)[i] - v) * t))
  .map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");

// ---------------------------------------------------------------- manual 2026
const M = {
  preto: "#000000", branco: "#FFFFFF", amarelo: "#FFDD02",
  roxo: "#530163", azul: "#001A77", bege: "#D9D6C7",
};
// ⚠️ #530163 é o do MANUAL. O LOGO_E_SIMBOLO.svg entregue traz #530263 — um dígito de
// diferença, registrado no README. Vale o manual até a agência responder.

const PAGINA = "#19001E"; // roxo −70% preto — arranjo C, decisão do Igor
const CARD = M.roxo;
const FOLGA = 0.3;

// Razões de luminância do TEMA ANTERIOR — é o que preserva a linguagem de elevação.
// Medidas em lib/brand.ts antes do flip: card 1,000x é a referência.
const ESCADA = { zebra: 0.970, hover: 1.111, chip: 1.170, borda: 1.235, flutuante: 1.269 };

/** Mix de CARD em direção a `alvo` que chega mais perto da razão de luminância pedida. */
function porRazao(razao, alvo) {
  let melhor = CARD, erro = Infinity;
  for (let t = 0; t <= 1000; t++) {
    const c = mix(CARD, alvo, t / 1000);
    const e = Math.abs((lum(c) + 0.05) / (lum(CARD) + 0.05) - razao);
    if (e < erro) { erro = e; melhor = c; }
  }
  return melhor;
}

/** O mais ESCURO (menos claro) que ainda passa `piso` em todas as superfícies dadas. */
function tintaMinima(piso, superficies, P) {
  for (let t = 200; t <= 950; t++) {
    const c = mix(CARD, M.branco, t / 1000);
    if (superficies.every((s) => cr(c, P[s]) >= piso)) return c;
  }
  return null;
}

/**
 * Fundo semântico ENCAIXADO (abaixo do card), na direção da página.
 *
 * ⚠️ Devolve o mais CLARO — ou seja o mais tingido — que ainda dá `piso` com a tinta.
 * Iterar na direção errada colapsa os seis fundos na cor da página e apaga a distinção
 * semântica inteira: aconteceu na primeira versão desta função.
 */
function fundoEncaixado(tinta, piso) {
  for (let t = 600; t <= 980; t++) {
    const c = mix(tinta, PAGINA, t / 1000);
    if (cr(tinta, c) >= piso && cr(c, CARD) >= 1.18) return c;
  }
  return null;
}

// ---------------------------------------------------------------- a paleta
const P = {};
P.navFundo = "#0A000C";
P.fundo = PAGINA;
P.card = CARD;
P.zebra = porRazao(ESCADA.zebra, M.preto);
P.hover = porRazao(ESCADA.hover, M.branco);
P.chip = porRazao(ESCADA.chip, M.branco);
P.borda = porRazao(ESCADA.borda, M.branco);
P.flutuante = porRazao(ESCADA.flutuante, M.branco);
P.neutroFundo = P.hover;

/**
 * TEXTO = BRANCO, e o bege NÃO é a tinta do painel.
 *
 * ⚠️ Medido em 18/08/2026, e derrubou uma decisão já aprovada. O bege é a cor de MAIOR
 * proporção do manual (35%) e a escolha óbvia para o texto. Sobre o card roxo ele achata
 * a distância texto↔muted de 2,555:1 para 1,621:1 — 37% da hierarquia que separa RÓTULO
 * de VALOR em dezenas de lugares.
 *
 * E o `muted` não conserta: para ficar 2,555x abaixo do bege ele precisaria de L≈0,232,
 * que dá 3,63:1 sobre o card e reprova o piso de 4,5:1 de texto secundário. Não é questão
 * de matiz — a conta é de luminância, e derivar o muted do próprio bege dá o mesmo.
 *
 * A causa é o CARD: o antigo era quase preto (L=0,0109) e cabiam os dois; o roxo
 * (L=0,0276) é 2,5x mais claro e come o espaço. Com branco a distância volta a 2,365:1.
 */
P.texto = M.branco;
P.muted = "#BC9DC3";
// ⚠️ Só contra o CARD: placeholder vive dentro de input, e input não fica sobre chip.
// Somar uma superfície que ele nunca pisa o empurraria para cima do  e apagaria
// a diferença entre "secundário" e "ainda não preenchido".
P.placeholder = tintaMinima(4.5 + FOLGA, ["card"], P);

P.destaque = M.amarelo;
P.ouroTexto = M.amarelo;
P.textoSobreDestaque = M.preto; // 15,60:1 sobre o amarelo

P.positivo = "#5CC98D";
P.negativo = "#F37870";
P.atencao = "#E8944A";

P.positivoFundo = fundoEncaixado(P.positivo, 4.5 + FOLGA);
P.negativoFundo = fundoEncaixado(P.negativo, 4.5 + FOLGA);
P.limiteFundo = fundoEncaixado(P.atencao, 4.5 + FOLGA);
P.avisoFundo = fundoEncaixado(P.destaque, 4.5 + FOLGA);
P.erroFundo = fundoEncaixado(P.negativo, 5.0 + FOLGA);
P.chipDourado = P.avisoFundo;

P.dadoNeutro = tintaMinima(3 + FOLGA, ["card"], P);
P.bordaForte = tintaMinima(3 + FOLGA, ["card"], P);
P.barraNeutra = porRazao(1.47, M.branco); // TRILHO: baixo de propósito

P.navTexto = P.texto;
P.navMuted = P.muted;
P.navBorda = P.borda;
P.navHover = P.hover;
P.navChip = P.chip;

// Chips do Início — terra e oliva saem; entram as secundárias do manual.
const CHIPS = {
  chipRoxo: [mix(M.roxo, M.preto, 0.45), mix(M.roxo, M.branco, 0.66)],
  chipAzul: [mix(M.azul, M.preto, 0.35), mix(M.azul, M.branco, 0.60)],
  chipBege: [mix(M.bege, M.roxo, 0.86), mix(M.bege, M.branco, 0.10)],
};
for (const [k, [fundo, tinta]] of Object.entries(CHIPS)) {
  P[k] = fundo;
  P[k.replace("chip", "").toLowerCase() + "Texto"] = tinta;
}

// ---------------------------------------------------------------- saída
const L = console.log;
L("=".repeat(78));
L("PALETA DERIVADA — Manual de Marca 2026, arranjo C");
L("=".repeat(78));
for (const [k, v] of Object.entries(P)) L(`  ${k.padEnd(20)} ${v}`);

const PARES = [
  ["texto", "fundo", 4.5], ["texto", "card", 4.5], ["texto", "hover", 4.5],
  ["texto", "zebra", 4.5], ["texto", "flutuante", 4.5], ["texto", "chip", 4.5],
  ["muted", "fundo", 4.5], ["muted", "card", 4.5], ["muted", "chip", 4.5],
  ["muted", "neutroFundo", 4.5], ["placeholder", "card", 4.5],
  ["destaque", "card", 3], ["destaque", "fundo", 3], ["destaque", "avisoFundo", 4.5],
  ["destaque", "chipDourado", 3], ["textoSobreDestaque", "destaque", 4.5],
  ["positivo", "card", 4.5], ["positivo", "positivoFundo", 4.5],
  ["negativo", "card", 4.5], ["negativo", "negativoFundo", 4.5], ["negativo", "erroFundo", 4.5],
  ["atencao", "card", 4.5], ["atencao", "limiteFundo", 4.5],
  ["navTexto", "navFundo", 4.5], ["navMuted", "navFundo", 4.5], ["navMuted", "navChip", 4.5],
  ["dadoNeutro", "card", 3], ["bordaForte", "card", 3],
  ["roxoTexto", "chipRoxo", 4.5], ["azulTexto", "chipAzul", 4.5], ["begeTexto", "chipBege", 4.5],
];

/**
 * O PAR DE HIERARQUIA — texto ↔ muted. Fica FORA da lista acima de propósito.
 *
 * ⚠️ NÃO É PAR DE LEGIBILIDADE. Os outros medem tinta contra FUNDO, e o piso vem da WCAG:
 * abaixo dele a pessoa não lê. Este mede TEXTO CONTRA TEXTO — é a distância que separa
 * rótulo de valor em dezenas de lugares, e ela não tem piso normativo.
 *
 * 🛑 E A FOLGA DE 0,3 NÃO SE APLICA AQUI — não por exceção, por GEOMETRIA. Os dois pisos
 * prendem a MESMA variável por lados opostos:
 *     muted mais claro  → passa os 4,8:1 sobre card/chip/hover, e ACHATA a hierarquia
 *     muted mais escuro → preserva a hierarquia, e REPROVA como texto secundário
 * Medido: com todas as superfícies em 4,8:1, a distância máxima alcançável é ~2,53. Pedir
 * 2,6 (piso 2,3 + folga 0,3) é pedir um valor que não existe. Exigir a folga aqui
 * obrigaria a afrouxar um piso de LEGIBILIDADE para ganhar hierarquia — a troca errada.
 *
 * O piso de 2,3 é REGRESSÃO, não meta: ele fica logo abaixo do valor entregue para
 * disparar se alguém achatar a hierarquia de novo. Teria pego o bege (1,62) na hora.
 */
const PAR_HIERARQUIA = ["texto", "muted", 2.3];
L("\n" + "=".repeat(78));
L(`PARES — piso + folga de ${FOLGA}`);
L("=".repeat(78));
let falhas = 0, min = [Infinity, ""];
for (const [a, b, piso] of PARES) {
  const r = cr(P[a], P[b]);
  const folga = r - piso;
  if (folga < FOLGA) { falhas++; L(`  🛑 ${a.padEnd(19)} sobre ${b.padEnd(14)} ${f(r).padStart(6)}:1  piso ${piso}  folga ${f(folga)}`); }
  if (folga < min[0]) min = [folga, `${a} sobre ${b}`];
}
L(`\n  ${falhas === 0 ? "TODOS OS " + PARES.length + " PARES DE LEGIBILIDADE COM FOLGA >= " + FOLGA : falhas + " ABAIXO DA FOLGA"}`);
L(`  menor folga: ${min[1]} (${f(min[0])})`);

const [ha, hb, hpiso] = PAR_HIERARQUIA;
const hr = cr(P[ha], P[hb]);
L("");
L("  HIERARQUIA (texto contra texto, sem folga — ver a nota acima)");
L(`    ${ha} sobre ${hb} .......... ${f(hr)}:1   piso ${hpiso}   (hoje era 2,56 · com bege daria 1,62)`);
if (hr < hpiso) { falhas++; L("    🛑 ABAIXO DO PISO"); }

process.exit(falhas === 0 ? 0 : 1);
