#!/usr/bin/env node
/**
 * AUDITA AS DECLARAÇÕES DE ENV — o que cada módulo DIZ que lê contra o que ele LÊ.
 *
 * ⚠️⚠️ SEM ISTO, AS DECLARAÇÕES SÃO PROMESSA. O desenho põe um `ENVS_*` ao lado do
 * `process.env` em cada módulo, e a rota compõe. Isso só é melhor que uma lista central
 * enquanto as duas coisas andarem juntas — e nada no `tsc` liga uma à outra.
 *
 * 🛑🛑 E ELE TEVE UM PONTO CEGO QUE CUSTOU DOIS DIAS DE DADOS (13–14/09/2026). A primeira
 * versão só reconhecia `process.env.X` e `process.env["X"]`. A `lib/firebaseAdmin.ts` lê o
 * trio de credenciais por DESESTRUTURAÇÃO — `const { A, B, C } = process.env` —, o ÚNICO
 * caso desse padrão no projeto inteiro. O auditor não viu, disse "ok", o `.env.example` foi
 * declarado "completo", e a declaração errada derrubou os três crons em produção.
 * **Conferência automática herda os pontos cegos de quem a escreveu, e a cobertura dela
 * parece total porque ela não sabe o que não vê.**
 *
 * 🔑 POR ISSO A VERIFICAÇÃO 0: ele CONTA todo acesso a `process.env` e reprova quando algum
 * não é explicado por um padrão que ele sabe ler. Não é cobertura total — é o auditor
 * sabendo dizer onde a cobertura dele ACABA. E cada padrão reconhecido foi visto reprovando
 * um defeito plantado antes de ser confiado.
 *
 * Sai com código 1 se reprovar. Rodar: `node scripts/audita-envs.js`
 */
const fs = require("fs");
const path = require("path");

const RAIZ = path.resolve(__dirname, "..");

/**
 * ⚠️ AS ROTAS QUE PRECISAM CONFERIR ENV SÃO AS DE CRON, e a régua é o ATRASO DA
 * DESCOBERTA, não a importância da rota. Numa tela, env ausente aparece para uma pessoa
 * em segundos. Num cron, aparece amanhã de manhã — e só se alguém ler o e-mail.
 */
const ROTAS_DE_CRON = [
  "app/api/sync-planilha/route.ts",
  "app/api/sync-meta/route.ts",
  "app/api/comercial/sync/route.ts",
  // Chamada pelo cron da Vercel (vercel.json). Entrou aqui só depois de a verificação 1b
  // reprovar a ausência dela — em 15/09/2026, a primeira versão desta lista não a tinha.
  "app/api/cron/dispara/[workflow]/route.ts",
];

/**
 * Arquivos que leem `process.env` por NOME VARIÁVEL, de propósito.
 * ⚠️ Só o próprio conferidor, que lê as envs pelos nomes que as declarações entregam.
 * Qualquer outro acesso dinâmico reprova: é exatamente a leitura que nenhuma declaração
 * consegue acompanhar.
 */
const PODE_LER_DINAMICO = new Set(["lib/envs.ts"]);

const lerArquivo = (p) => fs.readFileSync(path.join(RAIZ, p), "utf8");

function arquivosTs(dir, out = []) {
  for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
    const rel = `${dir}/${e.name}`;
    if (e.isDirectory()) arquivosTs(rel, out);
    else if (/\.tsx?$/.test(e.name)) out.push(rel);
  }
  return out;
}

// ---------------------------------------------------------------------------
// OS PADRÕES DE LEITURA QUE ESTE AUDITOR RECONHECE — e só estes
// ---------------------------------------------------------------------------
const RE_PONTO = /process\.env\.([A-Z0-9_]+)/g;
const RE_COLCHETE = /process\.env\[["'`]([A-Z0-9_]+)["'`]\]/g;
/** `const { A, B: b, C = "x" } = process.env` — o padrão que faltou em 12/09/2026. */
const RE_DESESTRUTURA = /\{([^{}]*)\}\s*=\s*process\.env\b/g;

/** Envs realmente lidas num arquivo, pelos três padrões. */
function envsLidas(src) {
  const s = new Set();
  for (const m of src.matchAll(RE_PONTO)) s.add(m[1]);
  for (const m of src.matchAll(RE_COLCHETE)) s.add(m[1]);
  for (const m of src.matchAll(RE_DESESTRUTURA)) {
    for (const parte of m[1].split(",")) {
      const nome = parte.split(/[:=]/)[0].trim();
      if (/^[A-Z0-9_]+$/.test(nome)) s.add(nome);
    }
  }
  return s;
}

/**
 * Tira comentário de bloco e linha inteira de comentário — SÓ para contar acessos.
 * ⚠️ Não é parser. O erro comum é alarme a mais (um `process.env` citado num comentário no
 * fim de uma linha de código). O raro é uma string com `/*` engolir código até o próximo
 * fechamento de comentário. Quando reprova, o total do arquivo vai junto para quem for olhar.
 */
function semComentarios(src) {
  return src
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((l) => !l.trim().startsWith("//"))
    .join("\n");
}

/** Quantos acessos a `process.env` nenhum padrão reconhecido explica. */
function contarAcessos(src) {
  const c = semComentarios(src);
  const total = (c.match(/process\.env\b/g) || []).length;
  const explicados =
    (c.match(RE_PONTO) || []).length +
    (c.match(RE_COLCHETE) || []).length +
    (c.match(RE_DESESTRUTURA) || []).length;
  return { total, naoReconhecidos: total - explicados };
}

/** Os objetos `ENVS_* = { ... }` de um arquivo, com chaves balanceadas. */
function blocosEnvs(src) {
  const blocos = [];
  const re = /\bENVS_[A-Z0-9_]*\s*=\s*\{/g;
  let m;
  while ((m = re.exec(src))) {
    let i = m.index + m[0].length;
    let prof = 1;
    while (i < src.length && prof > 0) {
      if (src[i] === "{") prof++;
      else if (src[i] === "}") prof--;
      i++;
    }
    blocos.push(src.slice(m.index, i));
  }
  return blocos;
}

/** Tudo o que um arquivo DECLARA — obrigatórias, opcionais e os grupos de alternativas. */
function envsDeclaradas(src) {
  const todas = new Set();
  for (const b of blocosEnvs(src)) {
    for (const n of b.matchAll(/["']([A-Z0-9_]+)["']/g)) todas.add(n[1]);
  }
  return { todas };
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
const todos = [...arquivosTs("lib"), ...arquivosTs("app"), ...arquivosTs("components")];

// ---------------------------------------------------------------------------
// 0. ONDE A COBERTURA DESTE AUDITOR ACABA — vem ANTES de tudo, porque limita o resto
// ---------------------------------------------------------------------------
console.log("0) Algum acesso a process.env que este auditor NÃO sabe ler?\n");
let semPontoCego = true;
for (const f of todos) {
  const { total, naoReconhecidos } = contarAcessos(lerArquivo(f));
  if (!naoReconhecidos) continue;
  if (PODE_LER_DINAMICO.has(f)) {
    console.log(`   ok  ${f} — ${naoReconhecidos} acesso dinâmico, permitido: é o próprio conferidor`);
    continue;
  }
  semPontoCego = false;
  aviso(
    `${f}: ${naoReconhecidos} de ${total} acesso(s) a process.env num padrão que o auditor não reconhece — ` +
      `as verificações abaixo NÃO valem para este arquivo`
  );
}
if (semPontoCego) {
  console.log("   ok  todo acesso a process.env está num padrão reconhecido (ponto, colchete com literal, desestruturação)");
}

// ---------------------------------------------------------------------------
// 1. MÓDULO QUE LÊ ENV E NÃO DECLARA (ou declara a mais)
// ---------------------------------------------------------------------------
console.log("\n1) Cada módulo declara o que lê?\n");
const declaracoes = new Map();

for (const f of todos) {
  const src = lerArquivo(f);
  const lidas = envsLidas(src);
  if (!lidas.size) continue;
  const dec = envsDeclaradas(src);
  declaracoes.set(f, dec);

  // ⚠️ `NEXT_PUBLIC_*` fica de fora: é embutida no bundle em tempo de BUILD, então ausente
  // em runtime não é o modo de falha dela — ausente no build é, e a tela quebra na hora.
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
// 1b. QUEM É ROTA DE CRON se decide por QUEM A CHAMA — não pela lista lembrada à mão
// ---------------------------------------------------------------------------
// ⚠️ `ROTAS_DE_CRON` é lista mantida à mão, e lista à mão envelhece calada: em 15/09/2026 a
// rota nova do disparo pela Vercel (`app/api/cron/dispara/[workflow]`) entrou sem entrar
// na lista, e a verificação 2 respondeu "Tudo certo" sem nunca tê-la olhado. Agora quem
// define "rota de cron" é o agendador: os `crons` do vercel.json e as URLs de API dos
// workflows que têm `schedule`. Rota chamada por agendador e ausente da lista REPROVA.
function rotaDoCaminho(caminho) {
  const partes = caminho.split("?")[0].replace(/^\/+|\/+$/g, "").split("/");
  function busca(dir, i) {
    if (i === partes.length) {
      const f = `${dir}/route.ts`;
      return fs.existsSync(path.join(RAIZ, f)) ? f : null;
    }
    const exato = `${dir}/${partes[i]}`;
    if (fs.existsSync(path.join(RAIZ, exato))) {
      const r = busca(exato, i + 1);
      if (r) return r;
    }
    if (!fs.existsSync(path.join(RAIZ, dir))) return null;
    for (const e of fs.readdirSync(path.join(RAIZ, dir), { withFileTypes: true })) {
      if (e.isDirectory() && /^\[[^\]]+\]$/.test(e.name)) {
        const r = busca(`${dir}/${e.name}`, i + 1);
        if (r) return r;
      }
    }
    return null;
  }
  return busca("app", 0);
}
console.log("\n1b) Toda rota chamada por agendador está em ROTAS_DE_CRON?\n");
const chamadasAgendadas = [];
if (fs.existsSync(path.join(RAIZ, "vercel.json"))) {
  try {
    for (const c of JSON.parse(lerArquivo("vercel.json")).crons ?? []) chamadasAgendadas.push({ origem: "vercel.json", caminho: c.path });
  } catch (e) {
    aviso(`vercel.json não pôde ser lido como JSON (${e.message}) — os crons dele não foram conferidos`);
  }
}
const DIR_WF = ".github/workflows";
if (fs.existsSync(path.join(RAIZ, DIR_WF))) {
  for (const f of fs.readdirSync(path.join(RAIZ, DIR_WF))) {
    if (!/\.ya?ml$/.test(f)) continue;
    const src = lerArquivo(`${DIR_WF}/${f}`);
    if (!/^\s*schedule:/m.test(src)) continue; // só o que roda sozinho
    for (const m of src.matchAll(/https?:\/\/[^\s"'$]+?(\/api\/[A-Za-z0-9_\-\/]+)/g)) {
      chamadasAgendadas.push({ origem: f, caminho: m[1] });
    }
  }
}
const rotasVistas = new Set();
for (const ch of chamadasAgendadas) {
  const rota = rotaDoCaminho(ch.caminho);
  if (!rota) { aviso(`${ch.origem} chama ${ch.caminho}, que não corresponde a nenhuma rota do app`); continue; }
  if (rotasVistas.has(rota)) continue;
  rotasVistas.add(rota);
  if (!ROTAS_DE_CRON.includes(rota)) {
    aviso(`${rota} é chamada por ${ch.origem} e NÃO está em ROTAS_DE_CRON — a verificação 2 não a olharia`);
  } else {
    console.log(`   ok  ${rota} (chamada por ${ch.origem})`);
  }
}
if (!chamadasAgendadas.length) aviso("nenhuma chamada agendada encontrada — a lista de rotas de cron não pôde ser conferida");

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

  const precisa = new Set();
  for (const f of alcancaveis(rota)) {
    for (const e of envsLidas(lerArquivo(f))) {
      if (!e.startsWith("NEXT_PUBLIC_")) precisa.add(e);
    }
  }
  // ⚠️ SÓ CONTA O QUE ESTÁ NA CHAMADA `comporEnvs(...)`, FORA DE COMENTÁRIO. Até 15/09/2026 bastava o
  // nome `ENVS_X` aparecer em QUALQUER lugar do arquivo — e um comentário dizendo
  // "(`ENVS_ADMIN_CARTEIRA`, composta abaixo)", escrito ANTES de compor, fez este auditor aprovar a
  // rota do cron da conciliação sem a composição. Busca de palavra num texto que fala sobre o
  // assunto que ela procura (CLAUDE.md, *conferência por busca de palavra*).
  const codigo = semComentarios(src);
  const argumentosCompor = [...codigo.matchAll(/comporEnvs\s*\(([^)]*)\)/g)].map((m) => m[1]).join(",");
  const compoe = new Set(envsDeclaradas(codigo).todas);
  for (const f of alcancaveis(rota)) {
    const d = declaracoes.get(f);
    if (!d) continue;
    const nomes = [...lerArquivo(f).matchAll(/export const (ENVS_[A-Z_]+)/g)].map((m) => m[1]);
    if (nomes.some((n) => new RegExp(`\\b${n}\\b`).test(argumentosCompor))) for (const e of d.todas) compoe.add(e);
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
// ⚠️ LINHA COMENTADA CONTA COMO DOCUMENTADA. O `.env.example` descreve credenciais
// alternativas assim: "escolha UMA das duas opções", com a opção B comentada (`# NOME=`).
// Exigir linha ativa obrigaria a deixar as duas formas "ligadas" no exemplo — que é
// justamente a confusão entre as duas que derrubou os crons em 13/09/2026.
const noExemplo = new Set([...exemplo.matchAll(/^#?\s*([A-Z0-9_]+)=/gm)].map((m) => m[1]));
const usadas = new Set();
for (const f of todos) for (const e of envsLidas(lerArquivo(f))) usadas.add(e);
const foraDoExemplo = [...usadas].filter((e) => !noExemplo.has(e)).sort();
if (foraDoExemplo.length) aviso(`.env.example não declara: ${foraDoExemplo.join(", ")}`);
else {
  // ⚠️ "Completo" aqui quer dizer completo EM RELAÇÃO AO QUE A VERIFICAÇÃO 0 DEIXOU LER.
  // Em 12/09/2026 esta mesma linha disse "ok" com três envs do Firebase invisíveis para ela.
  console.log(`   ok  ${usadas.size} envs lidas pelos padrões reconhecidos, todas no .env.example`);
}

console.log("");
if (falhas) { console.log(`REPROVADO — ${falhas} problema(s).`); process.exit(1); }
console.log("Tudo certo.");
