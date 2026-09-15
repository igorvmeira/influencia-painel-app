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

/**
 * Fotos do fechamento de mês: um documento por VERSÃO (`AAAA-MM_vN`), criado uma vez e nunca
 * sobrescrito — refechar cria a versão seguinte, com motivo. Ver lib/fotoFechamento.ts.
 */
export const COL_FOTOS_FECHAMENTO = "fotosFechamento";

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
 * Registro do DISPARO dos workflows pelo cron da Vercel (um campo por workflow).
 *
 * ⚠️ Existe porque o cron da Vercel descarta a resposta da rota: sem este documento, um
 * disparo recusado pelo GitHub (token expirado, permissão faltando) só apareceria no log da
 * Vercel, que guarda poucos dias. Escrito por `app/api/cron/dispara/[workflow]`.
 */
export const DOC_DISPARO_WORKFLOWS = "disparoWorkflows";

/**
 * Marcas de "sem acesso, ciente": um campo por accountId (ver `MarcaCiente` em
 * lib/falhasSync.ts). Lido pelo sync-meta; escrito SÓ por `scripts/marcar-falha-ciente.js`,
 * que exige prazo e motivo.
 */
export const DOC_FALHAS_CIENTES = "falhasCientes";

/**
 * Resumo dos fechamentos de mês: `meses[AAAA-MM] = { versao, id, fechadoEm, valor }`. É o que a
 * /gestores lê para saber se um mês tem foto (uma leitura) antes de ler a foto em si. Escrito na
 * MESMA transação que cria a versão (lib/fechamentoServidor.ts) — os dois nunca discordam.
 */
export const DOC_FECHAMENTOS = "fechamentos";

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

/**
 * Cursor da conciliação com a planilha de Monitoramento.
 *
 * ⚠️ NÃO É SÓ "QUANDO RODOU". O campo que importa é `lidaEmPlanilha` da execução
 * ANTERIOR: ele é o início da janela em que uma troca de gestor detectada agora pode
 * ter acontecido. Sem ele, toda troca vira "aconteceu neste instante", que é o teto e
 * não o fato — a correção registrada em `EntradaGestor` (lib/types.ts).
 *
 * 🔑 E por isso ele só é gravado quando a leitura foi COMPLETA e bem-sucedida. Gravar
 * cursor de uma execução que falhou no meio encurtaria a janela seguinte para um
 * intervalo em que ninguém olhou de verdade, e a janela passaria a mentir para menos —
 * o lado que parece mais preciso.
 */
export const DOC_SYNC_PLANILHA = "sync_planilha";

/** Contas que alguém dispensou da fila — decisão humana, não some sozinha. */
export const DOC_IGNORADAS = "contasIgnoradas";

/**
 * Lápide: contas que ESTIVERAM na carteira e saíram. A `lib/descobrirContas.ts`
 * pedia este documento pelo nome desde 20/08/2026 (ver o bloco de `COLECOES_RASTRO`).
 *
 * ⚠️⚠️ NÃO É O MESMO QUE `DOC_IGNORADAS`, e juntar os dois quebraria os dois.
 * `contasIgnoradas` é DECISÃO sobre a fila — mutável, e existe `desfazerIgnorar`
 * para apagá-la. `contasRemovidas` é FATO sobre a história — e desfazer um "ignorar"
 * nunca pode apagar o fato de a conta ter estado na carteira. Um é reversível por
 * desenho, o outro é append-only por desenho.
 *
 * 🔑 O que ele conserta: hoje `jaEsteveNaCarteira` sai de SOBRA de sincronização
 * (docs órfãos em `limitesConta`/`metricasAgregadas`), então `true` é afirmação e
 * `false` é silêncio — e a data é PISO, não a data da remoção. Com a lápide, a data
 * é exata, o rastro deixa de depender de limpeza incompleta, e os órfãos podem ser
 * apagados sem destruir o sinal.
 *
 * ⚠️ O que ele NÃO conserta: `false` continua sendo silêncio para tudo que saiu da
 * carteira ANTES de a lápide existir. Ela só torna afirmativo o que for registrado
 * daqui para frente, mais o que for preenchido à mão — e cada registro retroativo
 * diz isso no campo `fonte`.
 */
export const DOC_REMOVIDAS = "contasRemovidas";

// ===========================================================================
// AINDA FORA DAQUI — candidatos medidos em 20/08/2026, com consumidor real
// ===========================================================================
// ⚠️ NÃO são código morto esperando uso: cada linha abaixo JÁ TEM consumidores
// hoje, escritos à mão. Não foram trazidos porque a migração de cada um toca
// arquivos que não estavam no recorte — não porque não valham.
//
//   14x  collection("contas")            o maior de todos
//    5x  collection("orientacoes")
//    2x  doc("funil")                    em comercial_agregados
//    1x  collection("metricasDiarias")
//    1x  doc("etapas")                   em comercial_config
//
// 🔑 E UM CASO QUE A RÉGUA DAS CINCO CATEGORIAS NÃO PREVIA — a busca falha dos
// DOIS lados, porque nem os NOMES coincidem:
//
//   `"comercial_oportunidades"` está declarado DUAS vezes, como `COL_OP`, em
//   `app/api/comercial/backfill/route.ts` e em `app/api/comercial/sync/route.ts`.
//   `"comercial_agregados"` está declarado duas vezes com nomes DIFERENTES:
//   `COL_AGREGADO` em `app/api/comercial/sync` e `COL` em `app/api/comercial/funil`.
//
// Nas cinco categorias sempre havia um lado com nome — procurar o VALOR achava o
// outro. Aqui os dois lados têm nome, os nomes divergem, e os valores são iguais:
// **nem a busca por nome nem a busca por valor liga as duas pontas**, porque quem
// procura `COL_AGREGADO` não sabe que existe um `COL`. Constante privada com nome
// local é o disfarce mais completo de duplicação que este projeto tem.
