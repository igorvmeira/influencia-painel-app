#!/usr/bin/env node
/**
 * AUDITA AS DECLARAÇÕES DE ENV — o que cada módulo DIZ que lê contra o que ele LÊ.
 *
 * ⚠️⚠️ SEM ISTO, AS DECLARAÇÕES SÃO PROMESSA. O desenho novo põe um `ENVS_*` ao lado do
 * `process.env` em cada módulo, e a rota compõe. Isso só é melhor que uma lista central
 * enquanto as duas coisas andarem juntas — e nada no `tsc` liga uma à outra: acrescentar
 * um `process.env.X` e esquecer da declaração compila, passa no build, e volta a produzir
 * exatamente a falha que o desenho veio evitar (a rota jura que conferiu tudo e não
 * conferiu o novo).
 *
 * ⚠️ E ELE CONFERE A ROTA TAMBÉM, não só os módulos: uma rota de cron que importa um
 * módulo com env e não compõe o `ENVS_*` dele passaria a checagem com a lista incompleta.
 *
 * Sai com código 1 se reprovar. Rodar: `node scripts/audita-envs.js`
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

/**
 * ⚠️ AS ROTAS QUE PRECISAM CONFERIR ENV SÃO AS DE CRON, e a régua é o ATRASO DA
 * DESCOBERTA, não a importância da rota. Numa tela, env ausente aparece para uma pessoa
 * em segundos e ela avisa. Num cron, aparece amanhã de manhã — e só se alguém ler o
 * e-mail. Foi assim que o `PLANILHA_GERENCIAL_ID` custou um dia em 12/09/2026.
 */
const ROTAS_DE_CRON = [
  "app/api/sync-planilha/route.ts",
  "app/api/sync-meta/route.ts",
  "app/api/comercial/sync/route.ts",
];

const lerArquivo = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

function arquivosTs(dir, out = []) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) arquivosTs(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

/** Envs realmente lidas num arquivo. */
function envsLidas(src) {
  const s = new Set();
  for (const m of src.matchAll(/process\.env\.([A-Z0-9_]+)/g)) s.add(m[1]);
  for (const m of src.matchAll(/process\.env\[["'`]([A-Z0-9_]+)["'`]\]/g)) s.add(m[1]);
  return s;
}

/** Envs declaradas num arquivo (obrigatórias + opcionais, de qualquer bloco `ENVS_*`). */
function envsDeclaradas(src) {
  const obrig = new Set();
  const opc = new Set();
  for (const m of src.matchAll(/obrigatorias:\s*\[([^\]]*)\]/g)) {
    for (const n of m[1].matchAll(/["']([A-Z0-9_]+)["']/g)) obrig.add(n[1]);
  }
  for (const m of src.matchAll(/opcionais:\s*\[([^\]]*)\]/g)) {
    for (const n of m[1].matchAll(/["']([A-Z0-9_]+)["']/g)) opc.add(n[1]);
  }
  return { obrig, opc, todas: new Set([...obrig, ...opc]) };
}

/** Resolve um import relativo/aliased para um caminho real. */
function resolver(spec, doArquivo) {
  let base;
  if (spec.startsWith("@/")) base = path.join(RAIZ, spec.slice(2));
  else if (spec.startsWith(".")) base = path.resolve(path.dirname(path.join(RAIZ, doArquivo)), spec);
  else return null;
  for (const ext of [".ts", ".tsx", "/index.ts"]) {
    if (fs.existsSync(base + ext)) return path.relative(RAIZ, base + ext).replace(/\\/g, "/");
  }
  return fs.existsSync(base) ? path.relative(RAIZ, base).replace(/\\/g, "/") : null;
}

/** Grafo a partir de uma entrada, ignorando `import type` (apagado na compilação). */
function alcancaveis(entrada) {
  const vistos = new Set();
  const fila = [entrada];
  while (fila.length) {
    const f = fila.shift();
    if (vistos.has(f)) continue;
    vistos.add(f);
    let src;
    try { src = lerArquivo(f); } catch { continue; }
    for (const m of src.matchAll(/^\s*import\s+(type\s+)?[^;]*?from\s+["']([^"']+)["']/gm)) {
      if (m[1]) continue;
      const alvo = resolver(m[2], f);
      if (alvo) fila.push(alvo);
    }
  }
  return vistos;
}

let falhas = 0;
const aviso = (msg) => { console.log(`🛑 ${msg}`); falhas++; };

// ---------------------------------------------------------------------------
// 1. MÓDULO QUE LÊ ENV E NÃO DECLARA (ou declara a menos)
// ---------------------------------------------------------------------------
console.log("1) Cada módulo declara o que lê?\n");
const todos = [...arquivosTs("lib"), ...arquivosTs("app"), ...arquivosTs("components")];
const declaracoes = new Map(); // arquivo -> {obrig, opc, todas}

for (const f of todos) {
  const src = lerArquivo(f);
  const lidas = envsLidas(src);
  if (!lidas.size) continue;
  const dec = envsDeclaradas(src);
  declaracoes.set(f, dec);

  // ⚠️ `NEXT_PUBLIC_*` fica de fora: são embutidas no bundle em tempo de BUILD, então
  // "ausente em runtime" não é o modo de falha delas — ausente no build é, e aí a tela
  // quebra na hora, visível. Conferi-las aqui reprovaria o caso normal.
  const relevantes = [...lidas].filter((e) => !e.startsWith("NEXT_PUBLIC_"));
  if (!relevantes.length) continue;

  const naoDeclaradas = relevantes.filter((e) => !dec.todas.has(e));
  if (naoDeclaradas.length) {
    aviso(`${f} lê ${naoDeclaradas.join(", ")} e não declara — acrescente ao ENVS_* do módulo`);
  }
  const declaradasAtoa = [...dec.todas].filter((e) => !lidas.has(e));
  if (declaradasAtoa.length) {
    aviso(`${f} declara ${declaradasAtoa.join(", ")} e não lê — declaração sobrando envelhece igual`);
  }
  if (!naoDeclaradas.length && !declaradasAtoa.length) {
    console.log(`   ok  ${f} (${relevantes.sort().join(", ")})`);
  }
}

// ---------------------------------------------------------------------------
// 2. ROTA DE CRON: confere TODAS as envs alcançáveis pelo grafo dela?
// ---------------------------------------------------------------------------
console.log("\n2) Rota de cron compõe tudo o que ela alcança?\n");
for (const rota of ROTAS_DE_CRON) {
  if (!fs.existsSync(path.join(RAIZ, rota))) { aviso(`${rota} não existe`); continue; }
  const src = lerArquivo(rota);

  if (!/conferirEnvs\s*\(/.test(src)) {
    aviso(`${rota} é rota de cron e não chama conferirEnvs() — env ausente só aparece amanhã`);
    continue;
  }

  // Tudo o que o grafo dela realmente lê, menos as embutidas no build.
  const precisa = new Set();
  for (const f of alcancaveis(rota)) {
    for (const e of envsLidas(lerArquivo(f))) {
      if (!e.startsWith("NEXT_PUBLIC_")) precisa.add(e);
    }
  }
  // Tudo o que ela declara + o que ela compõe dos módulos que importa.
  const compoe = new Set(envsDeclaradas(src).todas);
  for (const f of alcancaveis(rota)) {
    const d = declaracoes.get(f);
    if (!d) continue;
    // Só conta se a rota realmente COMPÔS o grupo daquele módulo.
    const nomes = [...lerArquivo(f).matchAll(/export const (ENVS_[A-Z_]+)/g)].map((m) => m[1]);
    if (nomes.some((n) => new RegExp(`\\b${n}\\b`).test(src))) for (const e of d.todas) compoe.add(e);
  }

  const faltam = [...precisa].filter((e) => !compoe.has(e)).sort();
  if (faltam.length) {
    aviso(`${rota} alcança ${faltam.join(", ")} e não compõe — a checagem passaria incompleta`);
  } else {
    console.log(`   ok  ${rota} (${[...precisa].sort().join(", ")})`);
  }
}

// ---------------------------------------------------------------------------
// 3. .env.example cobre tudo o que o código lê
// ---------------------------------------------------------------------------
console.log("\n3) .env.example está completo?\n");
const exemplo = lerArquivo(".env.example");
const noExemplo = new Set([...exemplo.matchAll(/^([A-Z0-9_]+)=/gm)].map((m) => m[1]));
const usadas = new Set();
for (const f of todos) for (const e of envsLidas(lerArquivo(f))) usadas.add(e);
const foraDoExemplo = [...usadas].filter((e) => !noExemplo.has(e)).sort();
if (foraDoExemplo.length) aviso(`.env.example não declara: ${foraDoExemplo.join(", ")}`);
else console.log(`   ok  ${usadas.size} envs usadas, todas no .env.example`);

console.log("");
if (falhas) { console.log(`REPROVADO — ${falhas} problema(s).`); process.exit(1); }
console.log("Tudo certo.");
