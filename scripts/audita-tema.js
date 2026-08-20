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
  ["lineStrong", "bordaForteElevada"],
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
  ["dadoNeutro", "card", 3], ["bordaForte", "card", 3],
  // ⚠️ A MOLDURA DA SIDEBAR PISA `navHover`, não o card. O botão "Sair" é o único
  // controle com borda ali, e era este par que faltava: `bordaForte` contra `navHover`
  // dava 2,97:1 enquanto o par declarado (contra o card) dizia 3,31:1 e passava.
  ["bordaForteElevada", "navHover", 3], ["bordaForteElevada", "navFundo", 3],
  // A rampa categorica contra a superficie onde ela e pintada (piso 3:1 da WCAG
  // 1.4.11 — em serie o TAMANHO e a POSICAO codificam informacao).
  ["serie1", "card", 3], ["serie2", "card", 3], ["serie3", "card", 3],
  // ⚠️ PARES QUE A LEITURA DO DASHBOARD REVELOU (commit 5). Os tres primeiros sao o
  // selo de tipo do alerta, que pousa no  (a linha tem background: INK), nao no
  // card — e o  reprovava sobre o  que ele usava antes.
  ["negativo", "fundo", 4.5], ["atencao", "fundo", 4.5],
  // A moldura do DeltaChip neutralizado: superficie ELEVADA, nao card.
  ["bordaForteElevada", "neutroFundo", 3],
  // O botao de FECHAR do Modal pousa no `chip` — a superficie elevada mais clara.
  ["bordaForteElevada", "chip", 3],
  // A BarraSplit aparece em card, chip e zebra na /comercial. A rampa nunca tinha
  // sido medida fora do card.
  ["serie1", "chip", 3], ["serie2", "chip", 3],
  ["serie1", "zebra", 3], ["serie2", "zebra", 3],
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

// ------------------------------------------------- 5) tinta transformada
/**
 * ⚠️ OPACIDADE MUDA A COR, E NENHUMA BUSCA DE `#` OU `rgba(` ACHA ISSO.
 *
 * Caso real (18/08/2026): a Sparkline tinha `opacity={0.9}` no stroke. O token era
 * `dadoNeutro`, que passa 3,31:1 sobre o card — mas a 90% ele pintava OUTRA cor, com
 * 2,91:1, abaixo do piso de 3:1 da WCAG 1.4.11. O par declarado estava certo sobre o
 * token e errado sobre a tela.
 *
 * Esta seção mede a cor RESULTANTE. Ela derruba o job quando a opacidade é o que quebra
 * — token que passa sozinho e reprova depois de misturado — porque alerta em documento
 * depende de alguém lembrar de ler.
 *
 * ⚠️⚠️ O FORMATO DO BURACO, que já apareceu DUAS VEZES com caras diferentes:
 * **conferência que exige duas informações na MESMA LINHA só enxerga o código que as
 * escreve juntas.**
 *
 *   · a varredura de pares não vê fundo herdado de ANCESTRAL — e é assim que a maior
 *     parte do painel pinta (o `Bloco` embrulha a seção 400 linhas acima);
 *   · a primeira versão desta seção não via `opacity-70` de CLASSE, porque a cor vinha
 *     do `style` do elemento PAI e a opacidade estava na classe do filho;
 *   · esta seção não vê `opacity={op}` com VARIÁVEL — o `SlopeCpl` esmaece as linhas
 *     não destacadas com um valor calculado, e a busca procura literal;
 *   · a varredura de token órfão não vê consumo por CLASSE Tailwind (`placeholder:`,
 *     `bg-nav-hover`) — apagar por ela quebraria dois consumos reais.
 *
 * Toda vez que uma conferência nova precisar de duas informações para decidir, pergunte
 * ANTES: e se o código escrever as duas em lugares diferentes? A resposta honesta costuma
 * ser "não enxergo" — e aí ela precisa DIZER que não enxergou, nunca passar em silêncio.
 * É por isso que o caso não resolvido abaixo imprime "MEÇA À MÃO" em vez de sumir.
 */
L("");
L("=".repeat(74));
L("5) TINTA TRANSFORMADA — opacidade sobre cor de dado");
L("=".repeat(74));
{
  const mistura = (a, b, t) => "#" + hex(a).map((v, i) => Math.round(v + (hex(b)[i] - v) * t))
    .map((v) => v.toString(16).padStart(2, "0").toUpperCase()).join("");
  const CARD = T.get("card");
  let achados = 0, quebrados = 0, decorativos = 0, naoResolvidos = 0, isentos = 0, declarados = 0;
  for (const arq of arquivos) {
    const linhas = fs.readFileSync(path.join(RAIZ, arq), "utf8").split(/\r?\n/);
    // ⚠️ Estado de BLOCO, não linha a linha: um comentário que EXPLICA uma opacidade
    // (e este projeto tem varios) acusaria a si mesmo. Aconteceu na primeira versao.
    let dentroDeComentario = false;
    linhas.forEach((linha, i) => {
      const limpa = linha.trim();
      if (limpa.includes("/*")) dentroDeComentario = true;
      const fecha = limpa.includes("*/");
      const eraComentario = dentroDeComentario;
      if (fecha) dentroDeComentario = false;
      if (eraComentario || limpa.startsWith("//") || limpa.startsWith("*")) return;
      // duas formas: inline (`opacity={0.9}`) e CLASSE do Tailwind (`opacity-70`)
      const inline = linha.match(/(?:fill-opacity|fillOpacity|strokeOpacity|opacity)\s*[=:]\s*\{?\s*([01]?\.\d+)/);
      const classe = linha.match(/\bopacity-(\d{1,3})\b/);
      if (!inline && !classe) return;
      /**
       * ⚠️ `disabled:opacity-NN` FICA DE FORA — e não por conveniência: a WCAG 1.4.3
       * isenta explicitamente componente de interface INATIVO de piso de contraste.
       * Um botão desligado precisa parecer desligado, e exigir 4,5:1 dele proibiria
       * justamente o sinal que ele existe para dar.
       *
       * ⚠️ A ISENÇÃO É DO ESTADO `disabled:`, não da opacidade. `opacity-90` num texto
       * de erro é outra coisa — esse continua sendo medido.
       */
      if (/disabled:opacity-/.test(linha)) { isentos++; return; }
      const alfa = inline ? parseFloat(inline[1]) : parseInt(classe[1], 10) / 100;
      achados++;
      /**
       * ⚠️ OS MARCADORES VÊM PRIMEIRO, antes de qualquer desistência. Na primeira versão
       * o "não achei o token" retornava ANTES de olhar o marcador — e uma linha já medida
       * à mão continuava sendo cobrada em toda execução. Conferência que ignora a resposta
       * que alguém já deu ensina a ignorar a conferência.
       */
      const marcador = [linhas[i - 2], linhas[i - 1], linha].filter(Boolean).join(" ");

      // Exceção DECLARADA: preenchimento que não carrega o valor (a área sob uma linha).
      if (marcador.includes("audita-tema: decorativo")) {
        decorativos++;
        L(`   ~ ${arq}:${i + 1} — opacidade ${alfa}: DECORATIVO declarado`);
        return;
      }

      /**
       * Medição HUMANA registrada. Quando a cor vem de um ancestral distante a janela não
       * alcança — e um "MEÇA À MÃO" que reaparece em toda execução vira o alarme diário
       * que ninguém lê. Quem mediu escreve o número no comentário, e ele fica NO CÓDIGO.
       *
       * ⚠️ NÃO é isenção, é registro: se a paleta mudar, o número declarado fica velho.
       * Por isso ele aparece no relatório, com o pedido de reconferência.
       */
      const medido = marcador.match(/audita-tema: medido ([0-9]+[,.][0-9]+)/);
      if (medido) {
        declarados++;
        L(`   = ${arq}:${i + 1} — opacidade ${alfa}: ${medido[1]}:1 medido à mão (reconfira se a paleta mudar)`);
        return;
      }

      /**
       * ⚠️ A COR PODE NÃO ESTAR NA MESMA LINHA. Com `opacity-NN` de classe ela costuma vir
       * do `style` do elemento, às vezes num ternário duas linhas acima. A janela olha 3
       * para cima e 1 para baixo — e quando não acha, DIZ que não achou.
       */
      const janela = [linhas[i - 3], linhas[i - 2], linhas[i - 1], linha, linhas[i + 1]]
        .filter(Boolean).join(" ");
      // ⚠️ `background` NÃO entra na alternativa da TINTA: ele casava primeiro e a
      // conferência media "destaque sobre destaque", imprimindo OK com um número que não
      // existe na tela. Conferência que não resolve tem que DIZER — nunca fabricar.
      const tok = janela.match(/(?:stroke|fill|(?:^|[^a-zA-Z])color)\s*[=:]\s*\{?\s*TEMA\.([a-zA-Z]+)/);
      const sup = janela.match(/background\s*[=:]\s*\{?\s*(?:TEMA\.)?([a-zA-Z]+)/);
      if (!tok || !T.get(tok[1])) {
        naoResolvidos++;
        L(`   ? ${arq}:${i + 1} — opacidade ${alfa}, sem token na janela: MEÇA À MÃO e registre com \`audita-tema: medido N,NN\``);
        return;
      }
      const puro = T.get(tok[1]);
      /**
       * ⚠️ A MISTURA É CONTRA A SUPERFÍCIE REAL, não contra o card por padrão. O seletor
       * de período do Dashboard é o caso: o texto opaco pousa sobre a PILL AMARELA, não
       * sobre o card, e medir contra o card daria um número que não existe na tela.
       */
      const nomeSup = sup && T.get(sup[1]) ? sup[1] : "card";
      const fundo = T.get(nomeSup);
      const real = mistura(fundo, puro, alfa);
      const rPuro = cr(puro, fundo), rReal = cr(real, fundo);
      if (rPuro >= 3 && rReal < 3) {
        quebrados++;
        erro(`${arq}:${i + 1} — ${tok[1]} sobre ${nomeSup} passa sozinho (${rPuro.toFixed(2)}:1) e a ${Math.round(alfa * 100)}% cai para ${rReal.toFixed(2)}:1. A opacidade É o defeito.`);
      } else {
        L(`   OK ${arq}:${i + 1} — ${tok[1]} sobre ${nomeSup} a ${Math.round(alfa * 100)}%: ${rReal.toFixed(2)}:1 (puro ${rPuro.toFixed(2)}:1)`);
      }
    });
  }
  if (!achados) L("   nenhuma opacidade sobre cor de dado");
  else if (!quebrados) {
    L(`   ${achados} medida(s) · ${decorativos} decorativa(s) declarada(s) · ${declarados} medida(s) à mão · ${naoResolvidos} sem token · ${isentos} disabled: (isento pela WCAG 1.4.3)`);
    if (naoResolvidos) L("   ⚠ as SEM TOKEN precisam de medição humana — a conferência não as cobre");
  }
}

/**
 * 6) BARRA CONTRA O TRILHO — a conferência que nasceu de uma reprovação real.
 *
 * ⚠️⚠️ EXISTE PORQUE O VERDE DESTA FERRAMENTA NÃO PEGOU. Em 20/08/2026 a seção 2
 * mediu `dadoNeutro` contra `card` (3,31:1, passa) e imprimiu verde — enquanto a tela
 * pintava a barra sobre o TRILHO, onde o mesmo token dá 2,27:1 e REPROVA. Foi achado
 * lendo o componente, não aqui. É a família 1 (superfície errada) no lugar mais fácil
 * de errar: a barra não pousa no card, pousa no sulco.
 *
 * O comprimento da barra É o dado, então o piso é 3:1 da WCAG 1.4.11 contra o que
 * está atrás dela — e o que está atrás é `barraNeutra`, não o card.
 *
 * ⚠️ E o que ela NÃO alcança: `cor={}` que recebe variável ou ternário. A varredura
 * resolve `TEMA.x` literal; o resto ela DIZ que não resolveu, em vez de passar calada.
 * ⚠️ `semTrilho` isenta — ali a barra pousa no card de propósito, e o par correto
 * passa a ser o da seção 2.
 */
L("");
L("=".repeat(74));
L("6) BARRA CONTRA O TRILHO — o comprimento é o dado (piso 3:1)");
L("=".repeat(74));
{
  const TRILHO = T.get("barraNeutra");
  const razaoDe = (a, b) => {
    const r = (lum(a) + 0.05) / (lum(b) + 0.05);
    return r < 1 ? 1 / r : r;
  };
  let medidas = 0, isentas = 0, naoResolvidas = 0;
  /**
   * ⚠️ RESOLVER O APELIDO LOCAL NÃO É REFINAMENTO, É O QUE SEPARA CONFERÊNCIA DE
   * RUÍDO. Quase todo componente desta base faz `const RED = TEMA.negativo` no topo e
   * passa `cor={RED}`. Sem resolver, 11 das 13 barras saíam como "MEÇA À MÃO" — e um
   * aviso que aparece em toda execução deixa de ser lido, que é o alarme diário do
   * CLAUDE.md. Com a resolução, sobra só o que é genuinamente dinâmico.
   */
  const apelidos = (texto) => {
    const mapa = new Map();
    for (const m of texto.matchAll(/^\s*const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*TEMA\.([A-Za-z0-9]+)\s*;/gm)) {
      mapa.set(m[1], m[2]);
    }
    return mapa;
  };
  for (const arq of arquivos) {
    const bruto = fs.readFileSync(arq, "utf8");
    const alias = apelidos(bruto);
    const linhas = bruto.split(/\r?\n/);
    linhas.forEach((linha, i) => {
      const m = linha.match(/\bcor=\{([^}]+)\}/);
      if (!m) return;
      // A janela olha 6 linhas abaixo: `semTrilho` costuma vir logo depois, às vezes
      // separado por comentário. Se aparecer, a barra pousa no card e a seção 2 cobre.
      const janela = linhas.slice(i, i + 7).join(" ");
      if (/\bsemTrilho\b/.test(janela)) { isentas++; return; }
      const cru = m[1].trim();
      // `TEMA.x` direto, ou um apelido local que aponta para `TEMA.x`.
      const direto = cru.match(/^TEMA\.([A-Za-z0-9]+)$/);
      const nomeTok = direto ? direto[1] : (alias.get(cru) ?? null);
      if (!nomeTok) {
        /**
         * ⚠️ TERNÁRIO: mede os DOIS lados. `velho ? AMBER : GOLD` pinta as duas cores
         * em execuções diferentes, então as duas precisam passar — reprovar só quando
         * a variável "estiver" numa delas seria conferência que depende do dado.
         */
        const ternario = [...cru.matchAll(/(?:TEMA\.)?([A-Za-z_][A-Za-z0-9_]*)/g)]
          .map((x) => (alias.has(x[1]) ? alias.get(x[1]) : x[1]))
          .filter((n) => T.get(n) !== undefined);
        if (ternario.length >= 2) {
          for (const n of new Set(ternario)) {
            const rr = razaoDe(T.get(n), TRILHO);
            medidas++;
            if (rr < 3) erro(`${arq}:${i + 1} — barra ${n} (num ternário) sobre barraNeutra: ${rr.toFixed(2)}:1 (piso 3)`);
          }
          return;
        }
        naoResolvidas++;
        L(`   ? ${arq}:${i + 1} — cor={${cru.slice(0, 40)}} não resolve para token, MEÇA À MÃO`);
        return;
      }
      // ⚠️ `T.get` é um Map: devolve `undefined`, não lança. Um try/catch aqui daria a
      // impressão de estar tratando o caso e deixaria passar.
      const cor = T.get(nomeTok);
      if (cor === undefined) {
        naoResolvidas++;
        L(`   ? ${arq}:${i + 1} — "${nomeTok}" não é token do brand, MEÇA À MÃO`);
        return;
      }
      const r = razaoDe(cor, TRILHO);
      medidas++;
      if (r < 3) erro(`${arq}:${i + 1} — barra ${nomeTok} sobre barraNeutra: ${r.toFixed(2)}:1 (piso 3)`);
    });
  }
  if (!medidas && !naoResolvidas) L("   nenhuma barra com cor de token literal");
  else L(`   ${medidas} barra(s) medida(s) · ${isentas} sem trilho (isenta, pousa no card) · ${naoResolvidas} não resolvida(s)`);
  if (naoResolvidas) L("   ⚠ as NÃO RESOLVIDAS precisam de medição humana — a conferência não as cobre");
}

// ---------------------------------------------------------------- veredito
L("");
L("=".repeat(74));
if (falhas) { L(`REPROVOU — ${falhas} problema(s).`); process.exit(1); }
L("PASSOU — e leia o que isto NÃO quer dizer.");
L("");
L("╔══════════════════════════════════════════════════════════════════════╗");
L("║ AS TRÊS FAMÍLIAS DE CEGUEIRA — nenhuma sai de busca por # ou rgba(  ║");
L("╚══════════════════════════════════════════════════════════════════════╝");
L("");
L("  1. SUPERFÍCIE ERRADA — o par declara `card`, a tela pinta outra coisa.");
L("     bordaForte declarado sobre card (3,31) e pintado sobre navHover (2,97).");
L("     placeholder declarado sobre card (4,80) e pintado sobre fundo (7,04) —");
L("     esse PASSAVA, e passar por sorte é o mesmo erro: mede outra tela.");
L("     → seção 2 mede o declarado. O real só sai LENDO o componente.");
L("");
L("  2. PAR NÃO MEDIDO — as duas peças passam sozinhas e quebram JUNTAS.");
L("     texto e muted: 13,53 e 5,72 sobre o card, 1,62 entre si (era 2,56).");
L("     amarelo e bege: 10,05 e 9,27 sobre o card, 1,08 entre si.");
L("     → seções 2b e 2d medem PARES. Vizinho na tela precisa de régua própria.");
L("");
L("  3. TINTA TRANSFORMADA — o token está certo e a opacidade muda a cor.");
L("     Sparkline: dadoNeutro 3,31 puro, 2,91 a 90%. O declarado não mentia");
L("     sobre o token; mentia sobre o que a tela pintava.");
L("     → seção 5 mede a cor RESULTANTE.");
L("");
L("  As três apareceram na migração de marca 2026, e as três passaram por");
L("  conferências verdes antes de alguém medir à mão.");
L("");
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
