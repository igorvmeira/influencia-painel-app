/**
 * MARCA DE "SEM ACESSO, CIENTE" — faz o sync-meta só AVISAR (em vez de ficar vermelho) sobre
 * UMA conta ativa que não dá para consertar agora. PRÉVIA por padrão; grava só com --aplicar.
 *
 *   node scripts/marcar-falha-ciente.js --conta act_X --ate AAAA-MM-DD --motivo "..." [--codigo 200] [--aplicar]
 *   node scripts/marcar-falha-ciente.js --conta act_X --remover [--aplicar]
 *   node scripts/marcar-falha-ciente.js --listar
 *
 * ⚠️ A MARCA EXPIRA, e isso é o ponto dela. Sem prazo, ela seria o mesmo aviso diário que
 * ninguém lê — o silêncio que o conserto de 15/09/2026 veio acabar (a ISP4 ficou 12 dias sem
 * dado com o job verde). Por isso este script RECUSA:
 *   · prazo maior que PRAZO_MAX_CIENTE_DIAS (14) a partir de hoje, ou no passado;
 *   · motivo curto (a marca precisa dizer POR QUE está calada e O QUE se espera);
 *   · conta pausada (pausada já é falha esperada — marca nela seria ruído);
 *   · conta que não existe no de-para.
 * E o sync ignora a marca vencida, a de prazo acima do máximo e a de outro código de erro —
 * ver `situacaoDaMarca` em lib/falhasSync.ts. Renovar é registrar de novo, com motivo novo.
 *
 * ⚠️ `registradoPor` NÃO identifica pessoa: o painel tem um login compartilhado (CLAUDE.md,
 * seção Login). O campo diz de onde veio a escrita, não quem decidiu — quem decidiu vai no motivo.
 *
 * Duplicações declaradas (este é JS solto e não importa TypeScript):
 *   · PRAZO_MAX_CIENTE_DIAS = 14 — igual a lib/falhasSync.ts; mudar lá obriga a mudar aqui;
 *   · FUSO "America/Sao_Paulo" — igual a MARCA.fuso em lib/brand.ts;
 *   · "sistema"/"falhasCientes" — iguais a COL_SISTEMA/DOC_FALHAS_CIENTES em lib/colecoes.ts.
 */
const fs = require("fs");
const path = require("path");

const PRAZO_MAX_CIENTE_DIAS = 14;
const FUSO = "America/Sao_Paulo";
const COLECAO = "sistema";
const DOCUMENTO = "falhasCientes";
const MOTIVO_MIN = 20;

const RAIZ = path.resolve(__dirname, "..");
const envLocal = path.join(RAIZ, ".env.local");
if (fs.existsSync(envLocal)) {
  for (const l of fs.readFileSync(envLocal, "utf8").split(/\r?\n/)) {
    const m = l.match(/^([A-Z0-9_]+)=(.*)$/);
    if (m && process.env[m[1]] === undefined) process.env[m[1]] = m[2].trim().replace(/^["']|["']$/g, "");
  }
}

// Saída travada: aborta se a linha contiver um pedaço da credencial (CLAUDE.md, régua de diagnóstico).
const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || "";
const chaveJson = b64 ? Buffer.from(b64, "base64").toString("utf8") : "";
const travas = [chaveJson.slice(200, 230), (process.env.FIREBASE_PRIVATE_KEY || "").slice(40, 70)].filter((s) => s.length >= 10);
const log = (...a) => { const t = a.join(" "); for (const s of travas) if (t.includes(s)) throw new Error("ABORT: saída conteria credencial"); console.log(t); };

function argumentos() {
  const a = process.argv.slice(2);
  const out = { aplicar: false, remover: false, listar: false };
  for (let i = 0; i < a.length; i++) {
    const k = a[i];
    if (k === "--aplicar") out.aplicar = true;
    else if (k === "--remover") out.remover = true;
    else if (k === "--listar") out.listar = true;
    else if (k.startsWith("--")) out[k.slice(2)] = a[++i];
  }
  return out;
}

function credencial() {
  if (chaveJson) {
    const j = JSON.parse(chaveJson);
    return { projectId: j.project_id, clientEmail: j.client_email, privateKey: j.private_key };
  }
  const { FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY } = process.env;
  if (FIREBASE_PROJECT_ID && FIREBASE_CLIENT_EMAIL && FIREBASE_PRIVATE_KEY) {
    return { projectId: FIREBASE_PROJECT_ID, clientEmail: FIREBASE_CLIENT_EMAIL, privateKey: FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") };
  }
  return null;
}

const hojeYmd = () => new Intl.DateTimeFormat("en-CA", { timeZone: FUSO, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
const diasAte = (ymd) => Math.round((Date.parse(ymd + "T00:00:00Z") - Date.parse(hojeYmd() + "T00:00:00Z")) / 86400000);

(async () => {
  const arg = argumentos();
  const cred = credencial();
  if (!cred) { log("Sem credencial do Firebase Admin no ambiente."); process.exit(2); }
  const { initializeApp, cert } = require("firebase-admin/app");
  const { getFirestore, FieldValue } = require("firebase-admin/firestore");
  const db = getFirestore(initializeApp({ credential: cert(cred) }));
  const ref = db.collection(COLECAO).doc(DOCUMENTO);
  const atual = (await ref.get()).data() || {};

  if (arg.listar) {
    const ids = Object.keys(atual);
    log(ids.length ? `Marcas em ${COLECAO}/${DOCUMENTO}:` : `Nenhuma marca em ${COLECAO}/${DOCUMENTO}.`);
    for (const id of ids) {
      const m = atual[id];
      log(`  · ${m.cliente || id} (${id}) · código ${m.codigo ?? "qualquer"} · até ${m.expiraEm} (${diasAte(m.expiraEm)} dia(s)) · ${m.motivo}`);
    }
    process.exit(0);
  }

  const conta = arg.conta;
  if (!conta || !/^act_\d+$/.test(conta)) { log("Informe --conta act_NNN."); process.exit(2); }
  const contaDoc = (await db.collection("contas").where("accountId", "==", conta).limit(1).get()).docs[0];
  if (!contaDoc) { log(`${conta} não existe no de-para (coleção contas).`); process.exit(2); }
  const c = contaDoc.data();

  let novo;
  if (arg.remover) {
    if (!atual[conta]) { log(`${c.cliente} (${conta}) não tem marca — nada a remover.`); process.exit(0); }
    novo = null;
  } else {
    if (c.pausado) { log(`${c.cliente} está PAUSADA: falha de conta pausada já é esperada e não derruba o sync. Marca recusada.`); process.exit(2); }
    const ate = arg.ate;
    if (!ate || !/^\d{4}-\d{2}-\d{2}$/.test(ate)) { log("Informe --ate AAAA-MM-DD (dia em que a marca deixa de valer, inclusive)."); process.exit(2); }
    const dias = diasAte(ate);
    if (dias < 0) { log(`--ate ${ate} já passou. Marca recusada.`); process.exit(2); }
    if (dias > PRAZO_MAX_CIENTE_DIAS) { log(`--ate ${ate} fica a ${dias} dias; o máximo é ${PRAZO_MAX_CIENTE_DIAS}. Marca recusada — renovar depois, com motivo novo.`); process.exit(2); }
    const motivo = (arg.motivo || "").trim();
    if (motivo.length < MOTIVO_MIN) { log(`--motivo precisa dizer por que a conta está calada e o que se espera (mínimo ${MOTIVO_MIN} caracteres).`); process.exit(2); }
    const codigo = arg.codigo === undefined ? null : Number(arg.codigo);
    if (codigo !== null && !Number.isInteger(codigo)) { log("--codigo precisa ser um número inteiro (o código de erro da Meta)."); process.exit(2); }
    novo = {
      cliente: c.cliente || "",
      codigo,
      registradoEm: new Date().toISOString(),
      expiraEm: ate,
      motivo,
      registradoPor: "scripts/marcar-falha-ciente.js (login compartilhado — não identifica pessoa)",
    };
  }

  log(`${arg.aplicar ? "APLICANDO" : "PRÉVIA (nada gravado — use --aplicar)"} · ${c.cliente} (${conta}) · gestor ${c.gestor} · ${c.pausado ? "pausada" : "ativa"}`);
  log(`  marca atual: ${atual[conta] ? JSON.stringify(atual[conta]) : "nenhuma"}`);
  log(`  marca nova:  ${novo ? JSON.stringify(novo) : "(removida)"}`);
  if (!arg.aplicar) process.exit(0);

  await ref.set({ [conta]: novo === null ? FieldValue.delete() : novo }, { merge: true });
  // Lê de volta: a escrita se prova no banco, não no objeto em memória (CLAUDE.md).
  const depois = ((await ref.get()).data() || {})[conta];
  log(`  lido de volta: ${depois ? JSON.stringify(depois) : "(sem marca)"}`);
  process.exit(0);
})().catch((e) => { console.error("ERRO:", e.message); process.exit(1); });
