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
];
for (const [tw, tema] of ESPELHO) {
  if (TW.get(tw) !== T.get(tema)) erro(`brand.${tw} = ${TW.get(tw)} mas TEMA.${tema} = ${T.get(tema)}`);
}
for (const [tw, tema] of ESPELHO_NAV) {
  if (TWNAV.get(tw) !== T.get(tema)) erro(`nav.${tw} = ${TWNAV.get(tw)} mas TEMA.${tema} = ${T.get(tema)}`);
}
L(falhas ? "" : "   OK — os 18 espelhos batem");

// ---------------------------------------------------------------- 2) contraste
// Piso 4.5 = texto normal · 3 = texto ≥18px, dado não-textual e limite de controle.
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
  ["olivaTexto", "chipOliva", 4.5], ["terraTexto", "chipTerra", 4.5],
  ["dadoNeutro", "card", 3], ["bordaForte", "card", 3],
];
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
L("PASSOU. ⚠️ Lembre: isto NÃO cobre token legítimo em contexto errado —");
L("`navFundo` numa barra de gráfico passa aqui e some na tela. Esse só a");
L("medição do par REAL acha, e ela é humana.");
