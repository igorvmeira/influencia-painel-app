// ===========================================================================
// NOMES DE COLEÇÃO E DOCUMENTO DO FIRESTORE — casa única, sem import nenhum.
// ===========================================================================
// ⚠️ ESTE ARQUIVO NÃO IMPORTA NADA, E ISSO É REQUISITO, NÃO ACASO. Nome de
// coleção é consumido por rota de servidor, por `lib/data.ts` e por qualquer
// coisa que toque o banco. Se a casa dos nomes tiver dependência, todo mundo que
// só quer uma string herda a cadeia — é o defeito que já matou um `next build`
// neste projeto (uma tela importou constante de um módulo que puxava
// `node:crypto`). Manter em zero import é o que garante que ninguém pague caro
// por uma string.
//
// ⚠️ ANTES DELE, `COL_SISTEMA` morava em `lib/descobrirContas.ts` — ao lado de uma
// função que faz I/O no Firestore e chama a Meta. Quem só queria o nome da
// coleção importava tudo aquilo junto, e `lib/data.ts` teria que depender do
// módulo de descoberta de contas para saber como um documento se chama.
//
// 🔑 O QUE ESTE ARQUIVO CONSERTA, medido em 20/08/2026:
// `app/api/fila-contas/route.ts` importava `DOC_FILA` e `DOC_IGNORADAS` e escrevia
// `collection("sistema")` **8 vezes** à mão — na MESMA LINHA em que usava a
// constante do documento. Participava da decisão para o nome do doc e não para o
// nome da coleção. É a régua do CLAUDE.md: *valor igual não é participação na
// decisão*, e a busca por NOME nunca acharia aquelas oito.
//
// 🛑 O QUE **NÃO** ENTRA AQUI: a string `"sistema"` usada como AUTORIA
// (`por: "sistema"`, em `app/api/contas/route.ts` e `app/api/import-contas/route.ts`)
// significa "quem alterou foi o sistema, não uma pessoa". Mesma string, conceito
// oposto — é o caso 3 da régua, e trocar ali acoplaria duas decisões que não têm
// relação nenhuma.

// ---- coleções -------------------------------------------------------------


/** Teto de gasto por conta (`spend_cap` / `amount_spent`). */
export const COL_LIMITES = "limitesConta";

/** Documentos de controle: cursores de sync, fila de contas novas, ignoradas. */
export const COL_SISTEMA = "sistema";

// ---- documentos dentro de `sistema` ---------------------------------------

/**
 * Cursor do sync de tráfego (Meta).
 *
 * ⚠️ Chamava-se só `"sync"` cru, em DOIS lugares que precisam concordar
 * (`app/api/sync-meta` escreve, `lib/data.ts` lê). Um erro de digitação num deles
 * não daria erro: criaria um documento novo, o outro leria vazio, e o painel
 * passaria a dizer que nunca sincronizou.
 */
export const DOC_SYNC_META = "sync";

/**
 * Cursor do sync do comercial (Xmax).
 *
 * ⚠️ Existia como `const DOC_SYNC` PRIVADO em `app/api/comercial/backfill` e como
 * literal `"sync_comercial"` em `app/api/comercial/sync`. As duas rotas escrevem o
 * MESMO documento, e nenhuma busca ligava as duas: uma tinha nome, a outra não.
 */
export const DOC_SYNC_COMERCIAL = "sync_comercial";

/** Fila de contas novas aguardando aprovação. */
export const DOC_FILA = "filaContas";

/** Contas que alguém dispensou da fila — decisão humana, não some sozinha. */
export const DOC_IGNORADAS = "contasIgnoradas";
