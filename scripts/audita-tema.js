/**
 * AUDITORIA DE TEMA — `node scripts/audita-tema.js`
 *
 * Nasceu da migração para tema escuro (16/08/2026), onde a conferência "nenhuma cor
 * chumbada fora dos tokens" deixou passar TODOS os defeitos reais. Este script é a
 * versão executável das regras que ficaram no CLAUDE.md.
 *
 * ⚠️ O QUE ELE ACHA (e o que não acha):
 *
 *   1. Espelho fora de sincronia entre lib/brand.ts e tailwind.config.ts.
 *   2. Par de contraste abaixo do piso da WCAG.
 *   3. Cor chumbada — `#RRGGBB`, `rgba(` E `hsl(`. Procurar só hexadecimal deixou
 *      quatro `rgba()` passarem por toda a vida do tema claro.
 *   4. `hover:bg-*` num elemento com `background` inline: inline vence stylesheet,
 *      então o hover nunca pinta. Três estavam mortos desde antes do tema escuro.
 *
 *   ❌ NÃO acha token legítimo usado no contexto errado — `navFundo` numa barra de
 *      gráfico, `barraNeutra` como dado. Isso só aparece MEDINDO o par real, e a
 *      medição depende de saber onde a cor é pintada. É trabalho humano; o script
 *      cobre o resto para sobrar atenção para essa parte.
 *
 * Sai com código 1 se algo reprovar, para poder virar passo de CI.
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.join(__dirname, "..");
const L = console.log;

// ---------------------------------------------------------------- contraste
const hex = (h) => { const s = h.replace("#", ""); return [0, 2, 4].map((i) => parseInt(s.slice(i, i + 2), 16)); };
const lin = (c) => { const x = c / 255; return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4); };
const lum = (h) => { const [r, g, b] = hex(h); return 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b); };
const cr = (a, b) => { const [x, y] = [lum(a), lum(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

// ---------------------------------------------------------------- leitura
function tokens(arquivo, bloco) {
  const txt = fs.readFileSync(path.join(RAIZ, arquivo), "utf8");
  let trecho = txt;
  if (bloco) {
    // ⚠️ O tailwind.config tem chaves de MESMO NOME em blocos diferentes (brand.bg e
    // nav.bg). Achatar tudo num mapa faz o segundo sobrescrever o primeiro e a
    // auditoria acusa divergência que não existe — aconteceu na primeira versão.
    const i = txt.indexOf(bloco + ": {");
    if (i < 0) return new Map();
    let nivel = 0, fim = i;
    for (let k = txt.indexOf("{", i); k < txt.length; k++) {
      if (txt[k] === "{") nivel++;
      else if (txt[k] === "}") { nivel--; if (!nivel) { fim = k; break; } }
    }
    trecho = txt.slice(i, fim);
  }
  const m = new Map();
  for (const x of trecho.matchAll(/(\w+):\s*"(#[0-9a-fA-F]{6})"/g)) m.set(x[1], x[2].toUpperCase());
  return m;
}

const T = tokens("lib/brand.ts");
const TW = tokens("tailwind.config.ts", "brand");
const TWNAV = tokens("tailwind.config.ts", "nav");

let falhas = 0;
const erro = (msg) => { falhas++; L("   >>> " + msg); };

// ---------------------------------------------------------------- 1) espelho
L("=".repeat(74));
L("1) ESPELHO — tailwind.config.ts bate com lib/brand.ts?");
L("=".repeat(74));
const ESPELHO = [
  ["ink", "texto"], ["yellow", "destaque"], ["yellowDeep", "ouroTexto"],
  ["onYellow", "textoSobreDestaque"], ["bg", "fundo"], ["card", "card"],
  ["hover", "hover"], ["line", "borda"], ["lineStrong", "bordaForte"],
  ["muted", "muted"], ["placeholder", "placeholder"], ["zebra", "zebra"],
];
const ESPELHO_NAV = [
  ["bg", "navFundo"], ["text", "navTexto"], ["muted", "navMuted"],
  ["line", "navBorda"], ["hover", "navHover"], ["chip", "navChip"],
  ["lineStrong", "navBordaForte"],
];
for (const [tw, tema] of ESPELHO) {
  if (TW.get(tw) !== T.get(tema)) erro(`brand.${tw} = ${TW.get(tw)} mas TEMA.${tema} = ${T.get(tema)}`);
}
for (const [tw, tema] of ESPELHO_NAV) {
  if (TWNAV.get(tw) !== T.get(tema)) erro(`nav.${tw} = ${TWNAV.get(tw)} mas TEMA.${tema} = ${T.get(tema)}`);
}
L(falhas ? "" : `   OK — os ${ESPELHO.length + ESPELHO_NAV.length} espelhos batem`);

// ---------------------------------------------------------------- 2) contraste
// Piso 4.5 = texto normal · 3 = texto ≥18px, dado não-textual e limite de controle.
const PARES = [
  ["texto", "fundo", 4.5], ["texto", "card", 4.5], ["texto", "hover", 4.5],
  ["texto", "zebra", 4.5], ["texto", "flutuante", 4.5], ["texto", "chip", 4.5],
  ["muted", "fundo", 4.5], ["muted", "card", 4.5], ["muted", "chip", 4.5],
  ["muted", "neutroFundo", 4.5],
  // ⚠️ PLACEHOLDER PISA O `fundo`, NÃO O `card`. O input do /login tem
  // `background: TEMA.fundo` DENTRO do card — encaixado, não elevado. O par declarado
  // contra o card passava por SORTE (4,80 aqui, 7,04 na superfície real), e passar por
  // sorte é o mesmo erro de reprovar por engano: mede outra tela.
  ["placeholder", "fundo", 4.5],
  ["destaque", "card", 3], ["destaque", "fundo", 3], ["destaque", "avisoFundo", 4.5],
  ["destaque", "chipDourado", 3], ["textoSobreDestaque", "destaque", 4.5],
  ["positivo", "card", 4.5], ["positivo", "positivoFundo", 4.5],
  ["negativo", "card", 4.5], ["negativo", "negativoFundo", 4.5], ["negativo", "erroFundo", 4.5],
  ["atencao", "card", 4.5], ["atencao", "limiteFundo", 4.5],
  ["navTexto", "navFundo", 4.5], ["navMuted", "navFundo", 4.5], ["navMuted", "navChip", 4.5],
  ["roxoTexto", "chipRoxo", 4.5], ["azulTexto", "chipAzul", 4.5],
  ["begeTexto", "chipBege", 4.5],
  ["dadoNeutro", "card", 3], ["bordaForte", "card", 3],
  // ⚠️ A MOLDURA DA SIDEBAR PISA `navHover`, não o card. O botão "Sair" é o único
  // controle com borda ali, e era este par que faltava: `bordaForte` contra `navHover`
  // dava 2,97:1 enquanto o par declarado (contra o card) dizia 3,31:1 e passava.
  ["navBordaForte", "navHover", 3], ["navBordaForte", "navFundo", 3],
  // A rampa categorica contra a superficie onde ela e pintada (piso 3:1 da WCAG
  // 1.4.11 — em serie o TAMANHO e a POSICAO codificam informacao).
  ["serie1", "card", 3], ["serie2", "card", 3], ["serie3", "card", 3],
];

/**
 * O PAR DE HIERARQUIA — texto contra texto, e a conferência que NÃO existia.
 *
 * ⚠️ ELE MEDE OUTRA COISA. Todos os pares acima medem TINTA CONTRA FUNDO, e o piso vem
 * da WCAG: abaixo dele a pessoa não LÊ. Este mede `texto` contra `muted` — a distância
 * que separa RÓTULO de VALOR em dezenas de lugares do painel. Não é legibilidade, é
 * HIERARQUIA, e ela não tem piso normativo.
 *
 * 🛑 POR QUE ELE PRECISOU EXISTIR. Na migração de marca 2026 os dois passavam folgados
 * sobre o card — 13,53:1 e 5,72:1 — enquanto a distância ENTRE eles caía de 2,56:1 para
 * 1,62:1. Nenhuma régua do projeto olhava esse par, então a hierarquia teria achatado 37%
 * com todas as conferências verdes. Só apareceu porque alguém mediu à mão.
 *
 * ⚠️ PISO DE REGRESSÃO, NÃO META. 2,3 fica logo abaixo do valor entregue (2,40) para
 * disparar se alguém achatar de novo — teria pego o bege na hora. NÃO afrouxe este piso
 * para "passar": se ele acusar, o que quebrou foi a hierarquia da tela, não o teste.
 *
 * ⚠️ E ELE NÃO TEM FOLGA de 0,3 como os outros — por geometria, não por exceção. Os dois
 * pisos prendem a MESMA variável por lados opostos: `muted` mais claro passa os 4,8:1
 * sobre card/chip/hover e achata a hierarquia; mais escuro preserva a hierarquia e
 * reprova como texto. Medido: a distância máxima alcançável é ~2,53. Exigir folga aqui
 * obrigaria a afrouxar um piso de LEGIBILIDADE para ganhar hierarquia — a troca errada.
 */
const PAR_HIERARQUIA = ["texto", "muted", 2.3];
L("");
L("=".repeat(74));
L("2) CONTRASTE — medido dos valores que estão no arquivo");
L("=".repeat(74));
let piores = [];
for (const [a, b, alvo] of PARES) {
  if (!T.get(a) || !T.get(b)) { erro(`token ausente: ${a} ou ${b}`); continue; }
  const r = cr(T.get(a), T.get(b));
  if (r < alvo) erro(`${a} sobre ${b}: ${r.toFixed(2)}:1 (piso ${alvo})`);
  piores.push([`${a}/${b}`, r, alvo]);
}
piores.sort((x, y) => x[1] - y[1]);
L("   " + PARES.length + " pares medidos. Os 3 mais apertados:");
piores.slice(0, 3).forEach(([n, r, alvo]) => L(`      ${n.padEnd(30)}${r.toFixed(2)}:1   (piso ${alvo})`));

// ⚠️ `atencao` e `destaque` são os dois amarelados da paleta. Se a razão de
// luminância entre eles cair, voltam a ser indistinguíveis lado a lado.
const rz = (lum(T.get("atencao")) + 0.05) / (lum(T.get("destaque")) + 0.05);
const razao = rz < 1 ? 1 / rz : rz;
if (razao < 1.25) erro(`atencao e destaque colidem (razão ${razao.toFixed(2)}, mínimo 1.25)`);
else L(`   atencao vs destaque: razão ${razao.toFixed(2)} — distinguíveis`);

// -------------------------------------------------- 2b) hierarquia texto/muted
{
  const [a, b, piso] = PAR_HIERARQUIA;
  L("");
  L("   HIERARQUIA — a distância que separa RÓTULO de VALOR (não é legibilidade)");
  if (!T.get(a) || !T.get(b)) erro(`token ausente: ${a} ou ${b}`);
  else {
    const r = cr(T.get(a), T.get(b));
    if (r < piso) erro(`${a} vs ${b}: ${r.toFixed(2)}:1 achatou (piso ${piso}) — a tela perde a hierarquia entre rótulo e valor, mesmo com os dois legíveis`);
    else L(`      ${a} vs ${b}: ${r.toFixed(2)}:1   (piso ${piso} — regressão, não meta)`);
  }
}

// ------------------------------------------- 2c) vizinhas da rampa categórica
/**
 * ⚠️ A CONFERÊNCIA QUE IMPEDE A FATIA INVISÍVEL DE VOLTAR POR OUTRO CAMINHO.
 *
 * Duas séries podem passar folgado contra o CARD e serem indistinguíveis ENTRE SI —
 * e aí a barra empilhada não fica "meio apagada": ela vira uma barra cheia, e a tela
 * passa a afirmar 100% onde havia 40%. O piso de 1,3:1 é entre VIZINHAS.
 *
 * ⚠️ Par abaixo de 1,3 não é proibido: é permitido SÓ com canal redundante (legenda
 * com rótulo e valor em texto). O amarelo e o bege do manual ficam em 1,08:1 e são
 * exatamente esse caso. O que a conferência faz é NOMEAR o par, para ninguém usar a
 * rampa sem legenda achando que dá.
 *
 * A rampa entra no commit 4. Até lá esta seção diz que não há o que medir — e isso é
 * melhor que não existir, porque conferência que nasce junto da feature nasce esquecida.
 */
L("");
L("=".repeat(74));
L("2d) RAMPA CATEGÓRICA — vizinhas (piso 1,3:1)");
L("=".repeat(74));
{
  const RAMPA = ["serie1", "serie2", "serie3", "serie4", "serie5"].filter((k) => T.get(k));
  if (!RAMPA.length) {
    L("   a rampa ainda não existe em lib/brand.ts — entra no commit 4 da marca 2026.");
  } else {
    /**
     * ⚠️⚠️ PEÇA QUE PASSA SOZINHA NÃO PASSA NECESSARIAMENTE JUNTO.
     *
     * Duas vezes num único dia um par quebrou sem nenhuma conferência acusar, e as duas
     * pelo MESMO motivo: a régua media cada cor contra a SUPERFÍCIE, e o problema estava
     * ENTRE as cores.
     *
     *   texto × muted ..... os dois passavam folgado sobre o card (13,53 e 5,72), e a
     *                       distância entre eles caiu de 2,56 para 1,62 em silêncio.
     *   amarelo × bege .... as duas cores MAIS legíveis da paleta sozinhas (10,05 e
     *                       9,27) dão 1,08:1 uma contra a outra.
     *
     * Toda vez que dois tokens forem VIZINHOS na tela — fatias de uma barra, séries de
     * um gráfico, rótulo e valor — o par entre eles precisa de régua PRÓPRIA. Passar
     * contra a superfície não basta, e é justamente isso que engana.
     *
     * ⚠️ TODOS os pares, não só os adjacentes: numa barra empilhada de 3 fatias a 1ª e a
     * 3ª podem encostar quando a do meio for pequena.
     */
    let soMatiz = 0;
    for (let i = 0; i < RAMPA.length; i++) {
      for (let j = i + 1; j < RAMPA.length; j++) {
        const r = cr(T.get(RAMPA[i]), T.get(RAMPA[j]));
        if (r < 1.3) { soMatiz++; erro(`${RAMPA[i]} vs ${RAMPA[j]}: ${r.toFixed(2)}:1 — separam SÓ por matiz; numa barra empilhada a fatia some e a barra passa a afirmar 100% onde havia 40%`); }
        else if (r < 1.6) L(`   ⚠ ${RAMPA[i]} vs ${RAMPA[j]}: ${r.toFixed(2)}:1 — passa o piso 1,3 mas sem a folga de 0,3`);
      }
    }
    if (!soMatiz) L(`   OK — as ${RAMPA.length} séries separam por luminância em TODOS os pares`);
  }
}

// ---------------------------------------------------------------- 3) chumbado
L("");
L("=".repeat(74));
L("3) COR CHUMBADA — # e rgba( e hsl( fora dos tokens");
L("=".repeat(74));
const ISENTOS = ["lib/brand.ts", "tailwind.config.ts", "scripts/audita-tema.js"];
function varrer(dir, acc = []) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = path.join(dir, e.name).replace(/\\/g, "/");
    if (e.isDirectory()) { if (e.name !== "node_modules" && e.name !== ".next") varrer(rel, acc); }
    else if (/\.(tsx?|css)$/.test(e.name) && !ISENTOS.includes(rel)) acc.push(rel);
  }
  return acc;
}
const arquivos = [...varrer("components"), ...varrer("app"), ...varrer("lib")];
let chumbadas = 0;
for (const f of arquivos) {
  const linhas = fs.readFileSync(path.join(RAIZ, f), "utf8").split("\n");
  linhas.forEach((l, i) => {
    const semComentario = l.replace(/\/\/.*$/, "").replace(/\/\*.*?\*\//g, "");
    // rgba(0,0,0,x) sobre a PRÓPRIA cor de marca é válido: escurece o dourado da
    // pill, não a página, então não inverte com o tema.
    if (/rgba\(0,\s*0,\s*0/.test(semComentario)) return;
    if (/#[0-9a-fA-F]{6}\b|rgba?\(\d|hsla?\(/.test(semComentario)) {
      chumbadas++;
      L(`   >>> ${f}:${i + 1}  ${semComentario.trim().slice(0, 70)}`);
    }
  });
}
if (chumbadas) falhas += chumbadas;
else L("   OK — nenhuma cor fora dos tokens");

// ---------------------------------------------------------------- 4) hover morto
L("");
L("=".repeat(74));
L("4) HOVER MORTO — `hover:bg-*` em elemento com `background` inline");
L("=".repeat(74));
let mortos = 0;
for (const f of arquivos) {
  const linhas = fs.readFileSync(path.join(RAIZ, f), "utf8").split("\n");
  linhas.forEach((l, i) => {
    if (!/hover:bg-/.test(l)) return;
    // O `style` costuma vir na linha seguinte ou na mesma; olha uma janela curta.
    const janela = linhas.slice(i, i + 3).join(" ");
    if (/style=\{\{[^}]*background:/.test(janela)) {
      mortos++;
      L(`   >>> ${f}:${i + 1}  hover não pinta (inline vence stylesheet)`);
    }
  });
}
if (mortos) falhas += mortos;
else L("   OK — nenhum hover morto");

// ---------------------------------------------------------------- veredito
L("");
L("=".repeat(74));
if (falhas) { L(`REPROVOU — ${falhas} problema(s).`); process.exit(1); }
L("PASSOU — e leia o que isto NÃO quer dizer.");
L("");
L("⚠️ ZERO ACUSAÇÃO NÃO É ZERO PAR ERRADO. Esta ferramenta mede os pares que");
L("   ALGUÉM DECLAROU na lista PARES acima. Se a tela pintar aquela tinta sobre");
L("   outra superfície, ela mede a tela errada — e imprime verde do mesmo jeito.");
L("");
L("   E o desencontro NÃO SAI DE VARREDURA. Tentado em 18/08/2026: procurar");
L("   `background:` e `color:` no mesmo style={{}} acusou 6 pares, e os 6 eram");
L("   ARTEFATO — o fundo vinha de um elemento ANCESTRAL, que a janela de busca não");
L("   enxerga. É assim que a maior parte deste painel pinta. Pior: os DOIS");
L("   desencontros reais achados naquele dia não estavam entre os 6.");
L("");
L("   Um deles REPROVAVA (bordaForte sobre navHover, 2,97:1, com o par declarado");
L("   dizendo 3,31:1) e o outro PASSAVA POR SORTE (placeholder medido contra o");
L("   card, pintado sobre o fundo). Passar por sorte é o mesmo erro: o número");
L("   impresso não descreve o que está na tela.");
L("");
L("   Os dois foram achados LENDO o componente. A lista viva está em");
L("   docs/pares-desencontrados.md — acrescente ali o que achar.");
L("");
L("⚠️ E o clássico: token legítimo em contexto errado. `navFundo` numa barra de");
L("   gráfico passa aqui e some na tela. Esse também só a medição do par REAL");
L("   acha, e ela é humana.");
