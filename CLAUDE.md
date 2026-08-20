# CLAUDE.md — Padrão de trabalho (estúdio de automações e painéis)

Este arquivo define como você (Claude Code) deve trabalhar em TODOS os projetos deste estúdio.
Leia e siga sempre. O objetivo é entregar apps/painéis sob medida para clientes de nichos
diferentes, reaproveitando o mesmo "motor" e trocando só a "casca" (marca, telas, integrações).

## Stack padrão (não trocar sem pedir)
- Frontend/back: **Next.js** (App Router, TypeScript, Tailwind).
- Hospedagem: **Vercel**.
- Dados e login: **Firebase** (Firestore + Authentication).
- Versionamento: **GitHub** (gerenciado pelo GitHub Desktop). O usuário não usa terminal.

## Fluxo de publicação
- Publicar com **commit e push direto na branch `main`, sem Pull Request** (a menos que o
  usuário peça o contrário).
- A Vercel faz deploy automático a cada push.
- Sempre **rode o build** antes de finalizar e diga ao usuário **como testar** (URL/rota).
- Repositório **nunca dentro de pasta sincronizada** (OneDrive, Google Drive, Dropbox) —
  a sincronização corrompe a pasta `.git`. Use algo como `C:\dev\nome-do-projeto`.

### ⚠️ ASSINATURA: 500 em TODOS os estáticos é CACHE, não código
**Código quebrado dá erro em UM lugar; cache dá erro em tudo de uma vez.** Se o console
mostra 500 em `layout.css`, em `webpack.js`, no `main-app.js` e nos chunks de página ao
mesmo tempo, não procure o bug — é a pasta `.next` desencontrada. Vá direto para a
sequência abaixo, sem abrir o código.

### Dev server e a pasta `.next` (ordem que evita falso alarme)
`next build` e `next dev` escrevem na MESMA pasta `.next`. Rodar o build com o dev de pé
(ou apagar `.next` sem parar o dev) deixa o servidor apontando para chunks que não existem
mais. O sintoma é um **500 que parece bug do código** — quase sempre
`TypeError: Cannot read properties of undefined (reading 'call')` ou
`__webpack_modules__[moduleId] is not a function` no `webpack-runtime`, às vezes junto de
`Failed to read source code from <arquivo>` num arquivo que está intacto.

**Ordem correta, sempre nesta sequência:**
1. **parar** o dev server;
2. **limpar** o `.next`;
3. **subir** o dev de novo.

E ao rodar um `next build` no meio do trabalho: **limpe o `.next` DEPOIS do build também**,
antes de subir o dev. Senão o dev sobe herdando artefato de produção e a armadilha volta
na chamada seguinte.

Antes de investigar um 500 no dev, confira se o `next build` passa: **build verde + 500 só
no dev = cache, não código.** Não saia procurando bug no que você acabou de escrever.

## Login (padrão em todo projeto)
- Todo projeto **nasce com login** (Firebase Auth, e-mail/senha). Todas as telas protegidas;
  sem sessão, redireciona para `/login`.
- A proteção precisa ser **de verdade no servidor**: endpoints sensíveis verificam o usuário
  autenticado (ID token do Firebase), não só escondem a tela.
- Em endpoints de **escrita**, o autor/identidade vem SEMPRE do token decodificado no
  servidor — **nunca** do corpo da requisição (senão dá para forjar).
- Cadastro fechado por padrão: usuários criados manualmente no console do Firebase.
- Revisar as **regras do Firestore** (`firestore.rules`): mesmo com tudo passando pelo
  servidor, regras abertas permitem contornar os endpoints e escrever direto no banco.

## Identidade visual
- Base padrão: **tema dark premium**, mas a **cor é ajustável por cliente**.
- Centralize marca e cores em **um só lugar** (design tokens / variáveis CSS), para trocar a
  identidade de um cliente mexendo em um único arquivo.
- Sem gradientes/sombras pesadas; layout limpo, tipografia forte, uma cor de destaque.
- A cor de destaque é para **ação e ênfase**, não decoração. Verde/vermelho só com
  significado (bom/ruim). Cuidado com semântica invertida: CPL subindo é **ruim** (vermelho).
- ⚠️ **BLOQUEIO DE PERMISSÃO NÃO É PANE — 403 desenhado como erro vermelho faz a pessoa
  reportar bug.** Uma tela de admin deste painel (`/fila-contas`) fica atrás de uma
  allowlist, e o item de menu aparece para os 8 gestores de propósito: esconder não é
  proteção, a checagem é no servidor. Se o 403 saísse no mesmo card vermelho de "falhou ao
  carregar", **7 pessoas por dia veriam o painel quebrado** e alguém iria procurar defeito
  onde não há. Sai em painel NEUTRO, com o texto que explica de quem é a tela e por quê.
  **A régua: vermelho é para o que está QUEBRADO, não para o que está NEGADO.** É o mesmo
  raciocínio do alarme que dispara todo dia (ver *Robustez*) noutro eixo — vermelho gasto
  onde nada está errado é vermelho que ninguém lê quando algo estiver.
  **Corolário prático:** a mensagem do 403 vira **constante compartilhada** entre a rota e a
  tela, porque é o TEXTO que decide o desenho; textos duplicados divergem, e no dia em que
  divergirem o bloqueio volta a se parecer com pane, sem ninguém ter mexido no CSS.
- Números em tabelas e KPIs com `tabular-nums` (evita as colunas "dançarem").
- Ao trocar a identidade de um cliente, peça uma **auditoria de cores "chumbadas"** fora dos
  tokens — é isso que mantém o starter realmente reutilizável.
- ⚠️ **A auditoria de cor tem DUAS metades, e só a primeira é uma busca de texto.**
  1. **Procure `#RRGGBB`, `rgba(` E `hsl(`.** Numa migração claro→escuro, quatro `rgba(...)`
     atravessaram a auditoria inteira porque ela só caçava hexadecimal — e eram justamente
     as cores dependentes do tema: véu de modal, cursor de hover de gráfico, realce de item
     ativo. **Quebram do jeito mais silencioso:** véu escuro sobre fundo escuro não escurece
     nada. O cursor de hover dos gráficos ficou com razão de luminância **1,000x** contra o
     card — não "difícil de ver": inexistente.
  2. **Token VÁLIDO em contexto ERRADO não aparece em busca nenhuma — só medindo o par
     real.** A barra de início do waterfall usava `navFundo`, um token legítimo: sobre o
     card branco do tema claro era a barra de maior contraste do gráfico, e sobre o card
     escuro virou 1,15:1. Nenhum grep acha isso. **A auditoria termina medindo cada par
     {cor, fundo em que ela é realmente pintada}**, não conferindo se a cor saiu do arquivo
     certo.
- ⚠️ **Token de contraste baixo é para TRILHO e MOLDURA. Qualquer elemento cujo TAMANHO ou
  POSIÇÃO codifica informação precisa de 3:1, mesmo sendo cinza.** Barra de ranking, fatia,
  série, ponto num eixo — o comprimento é o dado, então some junto com a cor. Três rankings
  deste painel usavam o token de trilho na própria barra; no tema claro passava por
  acidente (o token era escuro sobre card branco) e no escuro a maioria das barras sumiria.
  **Mantenha dois tokens separados** — um para o sulco vazio, outro para o dado neutro — e
  diga no comentário de cada um o que ele NÃO é.
- 🛑 **O caso mais grave dessa família não deixa o elemento feio: deixa o NÚMERO ERRADO.**
  Numa barra empilhada, a fatia invisível não fica "meio apagada" — **vira uma barra
  cheia**, e a tela passa a afirmar 100% onde havia 40%. Sempre que a cor participa de uma
  PROPORÇÃO (barra dividida, pizza, área empilhada), medir cada fatia contra o fundo **e
  contra a fatia vizinha**, antes de aprovar.
- ⚠️ **TOKEN COM NOME DE LUGAR SÓ SERVE NAQUELE LUGAR — a lição mais reutilizável desta
  migração, e vale para o starter.** `navFundo` (fundo da sidebar) foi parar em três
  gráficos porque, no tema claro, ele era *"a cor mais escura disponível"*: escolhido pelo
  que PARECIA, não pelo que SIGNIFICAVA. Foram **três usos legítimos por acaso**, e o
  acaso durou até o contexto inverter. O mesmo aconteceu com um token chamado `sparkline`,
  que acabou em 8 lugares dos quais só um era uma sparkline.
  **Regra:** nome POSICIONAL (`navFundo`, `card`, `zebra`, `chip`) só é consumido no seu
  lugar. Quando algo precisa de "escuro", "claro" ou "neutro" **por contraste**, o token
  tem que ser SEMÂNTICO (`dadoNeutro`, `bordaForte`, `textoSobreDestaque`) — o nome é o que
  impede o reuso errado, porque nenhuma busca acha um token usado fora do papel dele.
- **Fatias que se separam por MATIZ e não por luminância só valem com canal redundante.**
  Ouro contra off-white difere 1,6:1 — quem não distingue matiz não lê a divisão. Aceitável
  quando existe legenda com rótulo, valor e percentual em texto; **se o componente for
  reusado sem a legenda, o par precisa ser revisto antes.**
- **Efeito visual também inverte com o tema, não só cor.** `hover:opacity-90` clareia sobre
  fundo claro e ESCURECE sobre fundo escuro — o gesto continua funcionando e passa a
  significar o contrário. Sombra some no escuro (não há luz para bloquear), então `shadow`
  como única indicação de que algo é clicável vira nada. No escuro, profundidade e hover se
  comunicam **clareando**: `brightness` para superfície tingida ou de marca, troca de
  `background` para superfície neutra.
- **Todo par {fundo de marca + texto} tem token PRÓPRIO**, nunca reuso do token de texto
  geral. `{ background: destaque, color: texto }` funcionava a 9,4:1 no tema claro e virou
  1,6:1 no escuro sem que um único hex mudasse: o build passa, o tipo confere, e o botão
  fica ilegível. Um token `textoSobreDestaque` torna a regra explícita.
- Contraste é **medido**, não estimado. Rode a fórmula WCAG nos pares antes de aprovar a
  paleta, e **remeça sempre que trocar um valor** — a diferença entre 4,4:1 e 4,5:1 não se
  enxerga e é a fronteira entre passar e reprovar.
- 🔧 **`node scripts/audita-tema.js`** faz a parte mecânica: espelho entre `brand.ts` e
  `tailwind.config.ts`, contraste de todos os pares, cor chumbada (`#`, `rgba(`, `hsl(`) e
  hover morto. Sai com código 1 se reprovar. **Ele NÃO acha token legítimo em contexto
  errado** — existe para sobrar atenção humana justamente para essa parte.
  Retrospectiva completa da migração de tema em `data/migracao-tema-escuro.md`.

## Segurança e variáveis de ambiente (crítico)
- **Segredos** (tokens de API, chaves admin) ficam **só no servidor**, em variáveis de ambiente.
  Nunca no cliente, nunca no repositório.
- ⚠️⚠️ **O QUE O CÓDIGO ACEITA E ONDE O SEGREDO DEVE IR SÃO DUAS PERGUNTAS — e confundir
  as duas faz procurar bug onde não há.** A checagem de `CRON_SECRET` aceita header
  `Authorization: Bearer` **e** querystring `?key=`; a regra da casa é **usar o header**,
  porque querystring entra em log de servidor, histórico de navegador, `Referer` e
  histórico de shell — lugares que ninguém limpa.
  Caso real: um 401 foi lido como "a rota só aceita Bearer, o exemplo está errado". Não
  estava — o código aceitava as duas, e o exemplo estava certo. A regra que existia era
  sobre ONDE PÔR, não sobre O QUE O CÓDIGO ACEITA, e ela não estava escrita em lugar
  nenhum. **Regra de conduta não anotada vira, na cabeça de quem lembra dela, uma
  afirmação sobre o código** — e aí a próxima investigação começa no arquivo errado.
  🕳️ E há um motivo TÉCNICO além do vazamento: se o segredo tiver `+`, `/`, `=`, `&` ou
  `#`, o `?key=` **quebra em silêncio** — em querystring o `+` vira espaço. O sintoma é
  `401` com a chave correta, e ele parece bug de autenticação.
- Só use o prefixo `NEXT_PUBLIC_` para config **não secreta** do cliente (ex.: chaves públicas
  do Firebase client). Deixe claro para o usuário o que é secreto e o que é público.
- Sempre que criar/precisar de uma env, **diga exatamente qual variável adicionar na Vercel**
  e lembre do **Redeploy** (env nova só vale em build novo).
- Chaves privadas (Firebase Admin, contas de serviço Google) vêm com `\n` escapado —
  trate isso ao ler a env. É o erro mais comum dessas integrações.
- Mantenha um `.env.example` atualizado.

## Integração de dados (regra de ouro)
- **Antes de prometer qualquer integração, confirme se o dado existe e é acessível.**
- Primeiro passo de toda integração: criar um **endpoint de diagnóstico** temporário que
  consulta a fonte (a API do cliente) e mostra os campos disponíveis. Só depois construa a
  feature em cima do que realmente vem. Remova o diagnóstico ao final.
  🔑 **E o melhor argumento a favor disso não é o que ele evita, é o que ele responde
  depois: a sondagem que mais valeu respondeu uma pergunta que não existia quando foi
  escrita.** No `/api/diag-xmax`, a pergunta 3 era "`getOpportunity` devolve oportunidade
  já encerrada?", feita para decidir se haveria backfill de fechamentos. Três semanas
  depois, o veredito dela — SIM — foi o que respondeu se o histórico do `fk_campaign`
  poderia ser coberto, uma feature que ninguém tinha imaginado ali.
  **Sondar é barato e o resultado não expira**; a decisão que ele destrava pode ser outra,
  mais tarde. Por isso a pergunta certa nunca é "vale a pena sondar para ISTO", é "o que a
  fonte responde de graça enquanto eu estou aqui".
  ⚠️ **Mas o diagnóstico sai mesmo assim, e o critério de urgência não é a regra da casa:**
  o `diag-xmax` devolvia `title`, `mainphone` e `mainmail` de leads reais atrás de um
  segredo fraco. Sondagem que imprime dado pessoal é dívida com prazo, não com data.
- Cada cliente/sistema tem sua própria API (algumas boas, outras ruins ou inexistentes).
- **Nunca transcreva IDs (accountId, etc.) a partir de imagem ou print** — um dígito errado
  cria registro fantasma que nunca sincroniza. Peça sempre o retorno em **texto**.
- **Joins sempre por ID único, nunca por nome.** Nomes de cliente se repetem e geram
  duplicação silenciosa (a mesma conta aparecendo em vários lugares).
- **Status ≠ atividade.** No Meta, `account_status: ACTIVE` diz que a conta de anúncios
  está **regular** (não desabilitada, não encerrada) — **não** que há campanha rodando.
  Veiculação só se afere por **gasto > 0 no período**, consultado dia a dia. Confundir os
  dois já custou a classificação errada de 3 contas numa conciliação de carteira, e quase
  levou a decisões de pausa erradas. Vale para qualquer API: **campo de estado descreve o
  cadastro, não o comportamento** — para saber se algo aconteceu, olhe a métrica, não a flag.

## Escrita e importação de dados
- Toda rotina que grava em massa precisa de **prévia (dry-run) por padrão** e só gravar com
  um parâmetro explícito (`&aplicar=1`). O relatório da prévia mostra o que seria criado,
  atualizado, inalterado e o que ficou órfão.
- **Idempotente**: rodar de novo atualiza (merge), não duplica. Use docId determinístico.
- **Não destrutivo**: nunca apague registros que sumiram da fonte — apenas liste como órfãos
  e deixe o usuário decidir. (Um import destrutivo já apagou uma coleção inteira neste
  estúdio; não repetir.)
- Ao importar dados existentes do cliente, **nunca sobrescreva** o que ele já escreveu na
  ferramenta — pule e reporte.

## Custo de leitura (Firestore) — pense antes de varrer coleção
- Leitura de documento **custa dinheiro** no plano Blaze e **derruba o app** no plano grátis
  ao estourar a cota. Trate leitura como recurso caro.
- **Nunca varra uma coleção grande a cada carregamento de tela.** Prefira **documentos
  pré-agregados** gravados no momento do sync (um doc por entidade com a série já pronta).
- Estime e informe ao usuário quantas leituras cada tela custa antes de implementar.
- Use **cache** (no servidor e na sessão do cliente) para navegação entre abas e troca de
  filtros que não precisam refazer a busca.
- Telas leves não devem depender de dados pesados: se uma tela só precisa da lista de
  entidades, não carregue o histórico inteiro junto.

## Robustez (nunca mentir para o cliente)
- **Dados de exemplo (mock) jamais podem aparecer em produção.** Se a fonte falhar, mostre
  um aviso claro de indisponibilidade — número falso na tela do cliente é pior que tela fora
  do ar.
- Uma feature secundária que falha **não pode derrubar** a tela principal: degrade com
  elegância (some o enfeite, o essencial continua).
- Coleção que ainda não existe deve retornar lista vazia, não erro 500.
- ⚠️ **LISTA VAZIA AMBÍGUA PRECISA DIZER O QUE O VAZIO *NÃO* SIGNIFICA.** Quando a fonte de
  uma listagem é sabidamente incompleta, "nenhum resultado" tem duas leituras — *não existe*
  e *não apareceu* — e a tela mostra a mesma coisa nas duas. **A leitura errada é sempre a
  tranquilizadora**, e por isso ela vence: vazio parece "está tudo em dia".
  Caso real: a fila de contas novas usa `me/adaccounts`, que **não lista conta vinda de
  parceria de BM**. Medido em 16/08/2026 — o token lista 111 contas e **9 das 117
  cadastradas estão fora dessa listagem**; antes disso, 8 contas com **R$ 45.943,25 em 120
  dias** ficaram fora do painel exatamente assim. Fila vazia ali significa "o token não
  listou nada novo", nunca "não há contas novas". **O aviso vai na tela, junto do vazio** —
  documentar no código não protege ninguém, porque quem lê a tela não lê o código.
  É a mesma família do `situacaoDoAnuncio`, que devolve `null` (e não "pausado") quando a
  Meta não responde: **ausência de dado não é evidência de ausência do fato.** Antes de
  escrever "nenhum X encontrado", pergunte se a fonte enxerga todos os X — e se não
  enxergar, o vazio precisa vir acompanhado do que ele não prova.
  ⚠️ E esse aviso é **estado permanente, não alerta**: vai em cor de ênfase (dourado), nunca
  em vermelho. Não é uma falha que alguém vá consertar — é o limite da ferramenta, e ele
  estará lá em toda visita.
- ⚠️⚠️ **CAMPO QUE NÃO VOLTA NÃO AUTORIZA AFIRMAÇÃO NENHUMA — nem "está preenchido",
  nem "não está".** A mesma ausência que impede a leitura impede as duas conclusões, e a
  tentação é sempre a segunda, porque ela SOA como cautela: dizer "o CRM não registra o
  motivo" parece humildade e é, na verdade, uma afirmação sobre um dado que ninguém viu.
  E ela é cara: falta da FONTE e falta da NOSSA LEITURA levam a ações **opostas** — a
  primeira manda desistir, a segunda manda pedir acesso.
  Caso real: escrevi no aviso da `/comercial` que os 6 motivos de perda "são preenchidos
  lá" e apaguei antes de subir. Não dava para saber: `getOpportunity` devolve 53 campos e
  nenhum é o motivo — exatamente o campo que provaria a frase. O que a tela pode afirmar é
  o que foi medido (o funil TEM 6 motivos cadastrados; a API não os devolve) mais a
  ignorância explícita: *"se estão sendo preenchidos, daqui não dá para saber"*.
  **A régua: separe o que a fonte NEGA do que ela apenas NÃO MOSTRA.** Só a primeira é
  informação sobre o mundo; a segunda é informação sobre a nossa via de acesso.
  É a mesma família do vazio ambíguo e do `situacaoDoAnuncio`, no eixo em que ela mais
  engana — aqui a frase falsa é a que parece modesta.
- ⚠️⚠️ **VALOR IGUAL NÃO É PARTICIPAÇÃO NA DECISÃO — a quinta da família, e a única que
  some da BUSCA.** Literal que coincide com uma constante exportada está FORA do alcance
  do `grep` — e a busca é como se descobre quem precisa mudar quando a decisão muda.
  **Cópia divergente aparece na comparação; literal coincidente não aparece nunca.**
  Caso real: `MOEDA_ACEITA = "BRL"` mora em `lib/filaContas.ts` com o motivo escrito, e a
  rota `/api/diagnostico-contas` tinha o literal `"BRL"` em três lugares. **Os valores
  concordavam** — a extração das três constantes duplicadas (`LOTE_SONDA`,
  `STATUS_ROTULO`, `bare`) não achou uma única divergência. O defeito era o literal, que
  nenhuma delas era.
  🔑 **E repare na inversão:** a duplicação que a gente foi procurar (cópias que podem
  divergir) é a menos perigosa, porque comparar as duas revela. A perigosa é a que não se
  parece com cópia. No dia em que a agência aceitar uma segunda moeda, quem alterar a
  constante vai achar que cobriu tudo — e terá coberto, menos os três lugares que a busca
  não mostrou.
  **A régua: antes de confiar numa constante compartilhada, procure o VALOR dela, não o
  NOME.** Nome acha quem já participa; valor acha quem devia participar e não participa.
  🛑 **E O CONTRAEXEMPLO VAI JUNTO DA RÉGUA, senão a próxima varredura vira substituição
  em massa. A régua acha CANDIDATOS; separar conceito de valor é leitura humana.**

  **AS CINCO CATEGORIAS QUE UMA VARREDURA DE LIMIAR ENCONTRA — e só a primeira se
  conserta trocando:**

  | # | categoria | como se reconhece | conserto |
  |---|---|---|---|
  | 1 | **literal que coincide com constante** | a busca por NOME não acha | trocar pelo import |
  | 2 | **constante ausente** | não há o que coincidir | **criar**, não trocar |
  | 3 | **valor igual, conceito diferente** | coincide e **não deve** ser trocado | deixar, e escrever por quê |
  | 4 | **nome que codifica valor** | o número está DENTRO do identificador | renomear — ou **declarar a dívida** |
  | 5 | **não pode ser compartilhada por ONDE MORA** | o import cruzaria fronteira cliente/servidor | mudar de casa — ou **declarar nos DOIS lados** |

  🛑 **E UM CASO DA CATEGORIA 1 QUE NÃO É ORGANIZAÇÃO, É SEGURANÇA:** escrita e leitura
  do MESMO documento, em arquivos diferentes, acopladas por string crua. O Firestore
  aceita **qualquer** string como docId — então um erro de digitação não daria erro em
  lugar nenhum: criaria um documento novo, o outro lado leria vazio, e o painel diria
  que nunca sincronizou. Caso real: `doc("sync")` escrito em `app/api/sync-meta` e lido
  em `lib/data.ts`, os dois à mão. **Quando as duas pontas de um docId moram em arquivos
  diferentes, a constante não é organização — é a única coisa que faz o erro EXISTIR.**

  **1 — literal que coincide.** `MOEDA_ACEITA = "BRL"` em `lib/filaContas.ts`, e o literal
  `"BRL"` em três lugares da rota. É o caso que abre esta régua.

  **2 — constante ausente.** `doc("sync")` e `"limitesConta"` não têm constante nenhuma
  para coincidir. São buraco, não duplicação.

  **3 — valor igual, conceito diferente. A categoria que faz a varredura estragar código.**
  `lib/kpis.ts` formata moeda com `currency: "BRL"` e isso **NÃO** é `MOEDA_ACEITA`: se a
  agência passar a aceitar dólar, a constante muda e o formatador **não deve** mudar junto —
  trocar ali acoplaria duas decisões que precisam ser independentes. O mesmo na varredura
  de `"sistema"`: 12 ocorrências eram `db.collection("sistema")` e **duas eram
  `por: "sistema"`**, autoria da mudança, conceito oposto com a mesma string.

  **4 — nome que codifica valor. A única que a varredura de literais NÃO ACHA por
  construção.** `contasPara80Pct`, `janela7d`, `topCinco` — o identificador vira mais uma
  cópia do limiar, e o número está **dentro do nome**, fora do alcance de qualquer busca
  por literal. Renomear costuma ter ripple (o campo atravessa agregado gravado), e aí a
  saída não é adiar em silêncio: **quando não der para renomear na hora, a obrigação fica
  DECLARADA na declaração do campo — trocar a constante obriga a renomear junto.**
  Sem isso, extrair a constante cria uma sensação falsa de vínculo: o valor passa a ter um
  lugar só, e o nome continua afirmando o valor antigo para quem ler.

  **5 — não pode ser compartilhada por ONDE MORA. Mesmo valor, mesmo conceito, e mesmo
  assim o import é que não pode existir.** `TETO_PADRAO_MS` vive em
  `lib/buscaAutenticada.ts`, que importa `lib/firebaseClient.ts` — módulo com
  `"use client"` que chama `initializeApp` no nível do módulo. `lib/xmax.ts` é servidor
  (rotas de sync e backfill) e ainda é importado por `lib/comercial.ts`. Ligar os dois
  `20000` arrastaria o SDK **cliente** do Firebase para dentro da cadeia do servidor.
  **Não se resolve trocando.** Ou a constante muda de casa — módulo neutro, sem import
  nenhum, como `lib/colecoes.ts` — ou a duplicação **FICA, com o motivo escrito NOS DOIS
  LADOS**. Duplicação declarada é outra coisa que duplicação esquecida.

  🔑 **E a lição que só apareceu errando:** eu classifiquei este caso como "renomeação
  pura, risco zero" e ele era o único da leva que não era mecânico. **A categoria de uma
  duplicata não se decide pelo VALOR nem pelo CONCEITO — se decide por ONDE ELA MORA, e
  isso só aparece lendo a cadeia de import.** Antes de chamar uma troca de mecânica,
  siga os imports do módulo de origem até o fim; o `tsc` passa nos cinco casos e só o
  `next build` acusa este.

  🔑 **E A ESCOLHA QUE ATRAVESSA TUDO ISTO: REGRA ESTRUTURAL EM VEZ DE LISTA DE NOMES.**
  Quando precisar tratar casos especiais, prefira a propriedade que os DEFINE à
  enumeração dos que você conhece hoje. **A primeira escala; a segunda envelhece — e
  lista mantida à mão é a segunda cópia com outro nome.**
  Caso real: apresentar o nome de etapa que vem do CRM (`LEAD RECUPERADO- AUTOMAÇÃO` →
  `Lead Recuperado - Automação`) sem guardar texto nosso. A regra *"token com SÍMBOLO
  fica intacto"* salva `M&A`, `B2B` e `2ª` **sem conhecer nenhum deles**; uma lista de
  siglas conheceria `SDR` e não conheceria o próximo. Nenhuma exceção precisou ser
  cadastrada para os 12 nomes reais.
  ⚠️ **E quando a regra estrutural não existir, isso se DECLARA em vez de virar lista
  por precaução.** Sigla puramente alfabética (`SDR`) é indistinguível de palavra
  gritada (`LEADS`): não há propriedade que as separe. A saída — uma lista mínima — fica
  escrita junto da função como o que fazer **quando existir um caso REAL**, e não antes.
  Lista criada por precaução nasce sem caso e é mantida para sempre.
  🔑 **O que autoriza conviver com o furo é ele ser COSMÉTICO, não semântico:**
  `Sdr - Qualificação` continua identificando a etapa. Se a falha mudasse o SIGNIFICADO,
  a conta seria outra — feio é aceitável, errado não é, e essa é a pergunta que decide
  se dá para adiar.
- ⚠️ **AUSÊNCIA DE REGISTRO NÃO É AUSÊNCIA DE HISTÓRIA — a quarta da mesma família.**
  Uma listagem "do que não está cadastrado" mistura duas populações que exigem decisões
  opostas: o que **nunca existiu** e o que foi **removido de propósito**. Sem separar, quem
  recadastra desfaz a decisão de outra pessoa sem nunca saber que houve decisão.
  Caso real: a fila de contas novas mostrou a BAUMAN CA 02 como candidata nova; ela tinha
  saído da carteira 29 dias antes. **O erro é assimétrico** — deixar de cadastrar algo novo
  se corrige na próxima varredura; recadastrar o que alguém tirou não se percebe nunca.
  **A evidência costuma já existir de graça, em sobra:** coleções que só são escritas para
  itens ativos guardam o rastro de quem saiu. Antes de escrever "novo", pergunte se a fonte
  distingue *novo* de *voltou*.
  🛑 **E o corolário que quase custou caro:** ao "limpar registros órfãos" para economizar,
  confira se eles não SÃO o sinal que alguma tela lê. A limpeza que parece higiene apaga a
  memória — e o aviso some sem nada quebrar. Rastro por sobra é frágil por natureza: quando
  a informação passar a valer, grave uma **lápide explícita** (quem removeu, quando) em vez
  de depender do que não foi apagado.
  Junto com o vazio ambíguo e o `situacaoDoAnuncio`: **a tela nunca deve afirmar mais do que
  a fonte sabe.**
- ⚠️ **ALARME QUE DISPARA TODO DIA VIRA RUÍDO QUE NINGUÉM LÊ.** Ao ligar uma verificação
  automática, separe o que **deriva** do que **quebra**:
  · comparação contra uma foto de referência **diverge sozinha** com o tempo (a base é
    viva) — serve de contexto, nunca de alarme;
  · **identidades** — soma das partes = total, subconjunto ⊆ conjunto, sem sobreposição —
    valem em qualquer dia, e se uma quebrar é bug de verdade.
  **Só a segunda derruba o job.** É o mesmo raciocínio do aviso de dado velho, que fica
  invisível enquanto tudo funciona e só aparece quando algo está errado: **um aviso que
  está sempre lá deixa de ser aviso.**
- ⚠️ **AFIRMAÇÃO SOBRE DADO VIVO SE CALCULA, NÃO SE ESCREVE.** Frase fixa na tela que
  descreve o número de hoje é a que ninguém revisa quando o número muda — ela continua
  ali, com a autoridade de texto escrito, dizendo o contrário do gráfico ao lado.
  Caso real: o funil da /comercial ALARGA em duas das quatro transições (Follow-up 248,
  Negociação 23, Fechamento 88), e a tela precisa explicar isso ou quem bate o olho lê
  "gráfico quebrado". A linha varre os níveis, acha onde cresce e nomeia os pontos com o
  multiplicador — **no dia em que o funil afunilar de verdade, a frase some sozinha.**
  **A régua: se a frase cita um número, uma direção ou uma comparação, ela é derivada do
  dado — nunca literal.** Vale para o texto de apoio tanto quanto para o número: o texto
  envelhece pior, porque ninguém confere prosa.
- ⚠️ **EXPLICAÇÃO PARCIAL NÃO VAI PARA A TELA — dizer O QUE acontece sem inventar o PORQUÊ
  é melhor que uma causa plausível não verificada.** Causa plausível ENCERRA a
  investigação: ninguém procura o motivo de uma coisa que já foi "entendida".
  No mesmo funil, o alargamento no FIM tem causa medida (a agência definiu que estar em
  Fechamento É venda feita, então as pessoas se acumulam ali — 88 com R$ 157.560 parados).
  O alargamento do nível 1 para o 2 **não tem**. A tela diz que os dois alargam e explica
  só o que foi medido; o outro fica sem causa, à vista.
  É a mesma família do "explicação que acerta a direção e não fecha o valor não é
  explicação", um degrau antes: lá a causa existia e não fechava; aqui a tentação é
  escrever uma que soa bem. **Buraco declarado é convite a investigar; buraco preenchido
  com hipótese é assunto encerrado.**
- ⚠️ **DOBRA NUNCA ESCONDE ALERTA — e o que nasce recolhido ANUNCIA o que tem dentro.**
  Seção colapsável é a forma mais fácil de fazer um aviso deixar de existir sem ninguém
  apagar nada: ele continua no código, passa em todo teste, e não está na tela. É a camada
  de honestidade outra vez — aviso dentro de seção fechada é aviso que não existe.
  **As duas regras que toda dobra carrega:**
  · o gatilho diz a QUANTIDADE e a NATUREZA do que está escondido — "Ver as 47 pessoas
    paradas aqui", "14 contas pausadas · fora dos rankings, médias e alertas". Dobra que
    esconde um número que ninguém vê equivale a não ter o número;
  · **alerta, pendência e aviso de limite da fonte nascem ABERTOS**, sempre.
  ⚠️ E antes de construir "um sistema de seções colapsáveis": conte quantos você já tem.
  Este painel tinha **oito** mecanismos de revelação inventados um a um (abas, acordeão de
  rodapé, acordeão um-por-vez, interruptor de série, dois níveis aninhados, vários
  independentes com expandir/recolher tudo, carga sob demanda e filtro com contador) —
  com TRÊS afordâncias visuais diferentes (▸ girando, ▼/▶, checkbox). **O defeito eram as
  três setas, não os oito comportamentos.** Unifique a AFORDÂNCIA; os comportamentos são
  respostas a problemas diferentes, e um deles nem é cosmético (recolher o bloco de
  criativos EVITA chamada à Meta). É a mesma régua do `DeltaChip` vs `Trend`.
- ⚠️ **`fetch` NÃO tem timeout, e carregamento eterno é pior que erro.** Se o servidor
  aceita a conexão e não responde, a promessa **nunca settla** — o `.catch` nunca roda e a
  tela fica em "Carregando…" indefinidamente **sem nunca dizer que falhou**. Erro visível é
  recuperável (recarrega, avisa alguém); espera eterna parece que o sistema ainda está
  trabalhando. Use sempre um `AbortController` com teto — é a única forma, porque
  `Promise.race` deixa a requisição original correndo solta.
  **Pior caso: `Promise.allSettled`** — ele espera TODAS se acomodarem, então uma única
  requisição pendurada trava o bloco inteiro, mesmo com todas as outras já respondidas.
  **Teto em GET sempre; em POST, só com escrita idempotente** — abortar o cliente não
  cancela o que o servidor já gravou, e a retentativa duplicaria o registro.

## Sincronização e tarefas longas
- ⚠️ **O TETO DE TEMPO DA VERCEL: MEÇA, NÃO ASSUMA.** Esta linha dizia "grátis corta em
  ~10s", herdado da documentação, e **está errado para este projeto**. Medido em
  17/08/2026, em 117 chamadas reais ao `/api/sync-meta` em produção: mediana **4,2s**,
  p90 9,3s, p99 14,9s, e a maior que **completou** foi **33,7s** — com **zero estouros**.
  O que vale é o `maxDuration` declarado na rota (60s aqui), não o número da doc.
  **Continue projetando sync incremental** — resumível é bom por si, e o dia em que o
  plano ou o runtime mudar o teto volta a apertar. Mas **não desenhe em volta de um teto
  que você não mediu**: premissa de infraestrutura envelhece, e uma linha errada no
  arquivo de regras orienta desenho por meses. Este projeto quase quebrou um sync em
  blocos por causa de um limite que não existia.
- Para uso **comercial**, prefira **Vercel Pro** (mais tempo + cron nativo).
- Se estiver no grátis: torne o sync **incremental/resumível** (parâmetros de offset/limite,
  grava cada item ao terminar) e automatize com **GitHub Actions** (workflow em cron que chama
  o endpoint em blocos até terminar).
- Sync **idempotente**: rodar de novo atualiza (merge), não duplica. Use docId determinístico.
- Ao mudar o sync, valide que ele **continua gravando tudo que já gravava** — ele alimenta o
  app inteiro. Campo ausente na fonte grava `null`, nunca `0` (zero é um valor real).

## O QUE NÃO É CONFERIDO NÃO É GRAVADO
- ⚠️ **Regra geral, não detalhe de um sync.** Quando uma rotina calcula um número E o
  confere, os dois lados precisam cobrir **exatamente o mesmo recorte**. Conferir menos do
  que se grava deixa dado não verificado no banco; gravar menos do que se confere é
  desperdício inofensivo. É o primeiro que morde.
- **Como o erro aparece:** a conferência ganha uma exclusão legítima — "o dia mais recente
  é parcial, não dá para comparar" — e a gravação não ganha a mesma. O banco passa a
  guardar justamente a parte que ninguém validou. Caso real: a quebra por conjunto ficou
  com 2 conversões num dia em que o total dizia 0, porque as duas fontes foram amostradas
  a ~1s de distância e a Meta atribuiu no meio.
- 🛑 **E o pior modo de falha é a soma que não fecha.** Duas somas na mesma tela que
  divergem por pouco não parecem erro, parecem arredondamento — ninguém investiga. É a
  mesma família da fatia invisível na barra empilhada: o número está errado e a tela
  continua plausível.
- **Corolário do merge:** se o recorte fresco exclui um período, o merge precisa **APAGAR**
  o que estava lá naquele período — senão o valor antigo, escrito antes da regra existir,
  nunca mais é reescrito e vira imortal. O dado fresco define o teto; o que está acima
  dele é resíduo.
- **E diga na estrutura até onde o número vale** (um campo como `porGrupoAte`), porque a
  parte conferida costuma cobrir menos que o resto do documento — e quem consome precisa
  rotular a janela em vez de assumir que é a mesma.
- ⚠️ **CONFERÊNCIA QUE TRATA AUSÊNCIA COMO APROVAÇÃO É CONFERÊNCIA QUE NÃO CONFERE.** Ao
  comparar duas fontes, é tentador pular o que existe num lado e não no outro — "não há o
  que comparar". Isso abre um buraco do tamanho de um registro inteiro: se a segunda fonte
  responder 200 com dado vazio, a entidade passa com ZERO itens conferidos e o relatório
  diz verde. **Separe "ausente e inativo" (nada a comparar, pule) de "ausente com
  atividade" (a fonte veio incompleta, é divergência).**
  É a mesma família do vazio ambíguo, aplicada à própria régua — o lugar onde ela é mais
  difícil de ver, porque quem escreve a conferência confia nela.
- ⚠️⚠️ **CONFERIR O QUE SE MONTOU É CONFERIR A SI MESMO — a escrita se prova LENDO DE
  VOLTA.** Rotina que grava e relata costuma calcular o relatório a partir do objeto EM
  MEMÓRIA. Isso descreve a INTENÇÃO, não o resultado: o objeto pode estar perfeito e o
  campo não chegar ao banco (regra de merge, sanitização, tipo recusado, escrita numa
  coleção diferente da que se pensa) — e o relatório continua verde, porque ele nunca
  olhou o banco.
  **A régua: se a resposta afirma que gravou, ela leu de volta.** Um `get` do documento
  logo após o `set` é fortemente consistente no Firestore, custa UMA leitura, e é a única
  frase do relatório que fala do que existe em vez do que se pretendia.
  Caso real: o `mesEntrada` entrou no agregado do comercial e o relatório do sync dizia
  `idempotente: true, gravadas: 0` — porque esses dois contam as coleções GRANULARES, e o
  agregado é reescrito inteiro fora do diff. A leitura natural era "o campo novo não foi
  gravado". A resposta certa não foi explicar o número: foi **ler o documento de volta e
  contar quantas pessoas têm o campo no banco**, mais uma linha dizendo de quem os outros
  números falam.
  ⚠️ E isto NÃO é código de uma migração: fica. Toda vez que um campo novo entrar numa
  estrutura gravada, é a leitura de volta que responde se ele chegou — o que muda é só a
  contagem comparada.
  ⚠️⚠️ **E VALE PARA A FERRAMENTA DE QUEM ESCREVE, NÃO SÓ PARA O CÓDIGO ESCRITO:**
  *script de edição que não confere o resultado depois de escrever não é conferência.*
  Ele imprime "ok" porque a âncora casou — e âncora casada prova que ACHOU o lugar, nunca
  que escreveu o certo nele. Dois defeitos numa sessão, os dois com "ok" no console:
  um array passado onde ia string (o `replace` coagiu e juntou 12 linhas com vírgula,
  destruindo dois blocos de documentação) e cinco argumentos numa função de quatro (a
  segunda linha do comentário virou o rótulo do log e sumiu do arquivo).
  **Nenhum dos dois falhou.** O primeiro só apareceu porque fui reler o arquivo por outro
  motivo, dias depois de já estar empurrado.
  **A régua: depois de escrever, leia o trecho de volta — `sed -n` na faixa alterada — e
  varra a ASSINATURA do defeito no resto do lote** (aqui, `grep -c ",   "`). É a mesma
  frase de sempre, no lugar mais fácil de esquecer: quem confia no próprio script está
  descrevendo a intenção, não o resultado.
- ⚠️ **ATUALIZAR A CONFERÊNCIA É PARTE DA MUDANÇA, NÃO ETAPA POSTERIOR.** Conferência que
  não acompanha a regra vira ruído (acusa o que está certo) ou falso negativo (aprova o que
  está errado) — e nos dois casos ela para de valer justamente quando mais precisaria.
  **Três verificações deram veredito errado num único dia**, por dois mecanismos:
  · **premissa não medida** — um teste comparou todos os dias contra o conjunto de chaves
    de um dia recente e acusou 1.312 "defeitos" que eram o comportamento correto (campos
    que só passaram a ser coletados depois); outro mediu a hachura sobre a cor errada.
  · **deriva** — a regra de ordenação passou a depender do nível e o teste continuou
    checando a regra antiga, reprovando dois níveis que estavam certos.
  **Antes de confiar num verde ou investigar um vermelho, releia o que o teste assume.** O
  primeiro suspeito de uma divergência é a régua, não o código medido.
- ⚠️⚠️ **EXPLICAÇÃO QUE ACERTA A DIREÇÃO E NÃO FECHA O VALOR NÃO É EXPLICAÇÃO — é hipótese
  com aparência de conclusão.** E é **pior que não ter explicação nenhuma**, porque encerra
  a investigação: ninguém procura a causa de uma diferença que já foi "entendida".
  Caso real: o BI da agência mostrava 168 e o nosso painel 137 no mesmo mês. A explicação
  aceita — "o BI conta oportunidade por data de criação, nós contamos pessoa por primeiro
  contato" — está **certa na direção** (as unidades e os frames são mesmo diferentes) e
  **não fecha**: por oportunidade criada o nosso número é ~145, não 168. Sobravam 23 que a
  explicação não cobria, e ela já tinha sido passada ao dono como resolvida.
  **A régua: uma explicação de divergência só vale quando RECONSTRÓI o número.** Enquanto
  sobrar resto, ela é uma pista — e o resto é o que ainda não se sabe.
  **Corolário:** enquanto não fecha, os dois números **não vão lado a lado** em tela nem em
  reunião, nem para dizer que batem nem para dizer que divergem. Número divergente com
  régua desconhecida faz a conversa discutir quem está certo em vez de o que cada um mede.
- ⚠️ **ANTES DE PAGAR O CUSTO DE UM MÉTODO, CONFIRME QUE A FONTE TEM O QUE VOCÊ FOI
  BUSCAR.** O método caro tende a ser planejado em detalhe — condições, salvaguardas,
  ordem dos passos — e essa preparação toda esconde que ninguém verificou o pressuposto
  mais básico: existe lá o que se quer? Caso real: havia um caminho rigoroso para extrair
  um mapa de etiquetas de um BI de terceiro, com quatro condições de proteção de dado
  pessoal. Uma checagem de dois minutos mostrou que **o BI não continha as etiquetas
  procuradas** — o método inteiro teria sido executado, manipulando dado de cliente, para
  um resultado vazio.
- ⚠️ **`ok: true` NO ENVELOPE NÃO SIGNIFICA QUE TUDO FOI.** Rotina que processa N itens e
  tolera falha individual devolve sucesso com os fracassos numa lista à parte. Quem lê só
  o envelope recebe "deu certo". Caso real: uma conta com R$ 9.079 de gasto lançou exceção
  no meio de um backfill, entrou em `.erros`, a resposta veio `ok: true`, e o laço registrou
  como bloco vazio — a conta ficou sem o dado novo e só apareceu numa conferência manual.
  **Todo consumidor de resposta parcial checa a lista de falhas, não o booleano.** E a
  severidade é assimétrica: em rotina que se repete (sync diário), falha individual AVISA,
  porque amanhã refaz; em rotina de tiro único (backfill, migração), REPROVA, porque item
  perdido fica perdido.
- ⚠️ **REGRA QUE FUNCIONA POR ACASO NÃO É REGRA — confira se ela cobre a CLASSE ou só o
  caso.** Um piso de "mínimo de 100 conversões" barrava corretamente o gestor sem campanha
  de geração de lead… porque ele tinha 5 conversões, não porque tinha zero elegíveis. Um
  gestor com 500 conversões, todas em grupos fora da régua, passaria no piso e entraria no
  ranking com CPL indefinido. **A correção não foi uma regra nova: foi trocar o INSUMO** da
  regra existente (conversões elegíveis em vez de totais), e aí ela passa a cobrir a classe.
  Quando uma proteção parece já funcionar, pergunte por que — se a resposta for um valor
  específico da base de hoje, ela vai falhar quando a base mudar.

## Mudanças estruturais em dados (migração segura)
- Quando trocar a fonte de leitura de uma tela, faça em **duas etapas**:
  1. o sync passa a escrever nos dois lugares (dual-write) + backfill do histórico;
  2. só depois de conferir que a fonte nova está populada, a leitura muda.
- Nunca suba a etapa 2 antes de confirmar a 1 — senão a tela lê dados incompletos.
- A fonte granular original permanece intacta como auditoria; o agregado é derivado e
  reconstruível.

## Módulo de IA (premium, opcional)
- Assistente de IA entra como **módulo premium**, **desligável por env** (off por padrão).
- **Nome definido por cliente** (não use "Influ" — esse nome é exclusivo da Influência).
- Chave em `ANTHROPIC_API_KEY` (servidor). Modelo padrão: **claude-sonnet-4-6**.
- Contexto vem dos **dados já sincronizados** do cliente; a IA responde em português, prática,
  e **nunca inventa números** — só usa o que recebe. Inclua teto de contexto/histórico p/ custo.
- O contexto deve vir de **agregados**, não de varredura de coleção (custo de leitura).

## Localização
- Português (Brasil). Valores monetários em **R$** quando fizer sentido para o cliente.
- Confirme a moeda dos dados da fonte antes de assumir (pode vir em outra moeda).
- Fuso horário como **constante única** no arquivo de marca — nunca espalhado pelo código.
- Ao comparar períodos, compare **intervalos equivalentes** (1..D vs 1..D) e ancore no último
  dia **com dado**, não no relógio. Deixe o intervalo explícito na tela.

## Convenções de código
- Limiares/parâmetros (tetos de alerta, janelas de dias, limites) como **constantes no topo**
  do arquivo, fáceis de ajustar.
- Regras de negócio (ex.: o que é um alerta) ficam em **um único módulo**, consumido por todas
  as telas — nunca duplicadas.
- ⚠️⚠️ **A TELA RECEBE A DECISÃO, NÃO A RECALCULA.** Quando uma regra precisa aparecer na
  interface, o servidor publica o **resultado** dela como campo, e a tela obedece. Aplicado
  quatro vezes num único dia: `parcial` (o mês está incompleto?), `porGrupoAte` e
  `porGrupoDe` (até onde a quebra vale) e `cobraValor` (esta etapa exige valor informado?).
  Em todos, a alternativa era a tela refazer a conta — e em todos ela teria acesso só a
  metade do insumo.
  É a mesma regra do "que mora no ponto de chamada se perde na terceira tela", agora na
  fronteira cliente/servidor. E aqui ela é mais perigosa: **quando a regra mora nos dois
  lados, às vezes o build salva e às vezes a divergência só aparece meses depois**, num
  número que ninguém confere.
- ⚠️ **EM ESTADO COMPARTILHADO ENTRE TELAS, SÓ A ESCOLHA VIAJA.** Valor DERIVADO e valor
  PADRÃO não são escolha — e os dois viajam disfarçados de escolha se você deixar.
  A mesma régua pegou dois casos no mesmo dia, no período que viaja entre as telas:
  · **derivado** — os modos "Mês" e "Personalizado" do Dashboard têm um número de dias
    (dias decorridos, tamanho do intervalo), mas ele é consequência, não decisão. Levar
    "23 dias" para outra tela inventaria uma janela que ninguém pediu;
  · **padrão** — guardar o 15 do Dashboard como valor inicial do estado faria o modal de
    Análise de Conta abrir em 15 no primeiro uso de cada sessão, em vez dos 30 dele, **sem
    nenhum clique ter acontecido**. O estado nasce `null` = ninguém escolheu, e cada tela
    segue com o padrão dela até existir escolha de verdade.
  Os dois são silenciosos do mesmo jeito: a tela mostra um número plausível, e a única
  pergunta que os denuncia é **"que clique produziu isto?"** — se a resposta for
  "nenhum", não era escolha.
  **Corolário — LER É TOLERANTE, ESCREVER É SÓ POR CLIQUE.** Chegar numa tela pode ADAPTAR
  o valor recebido (uma tela de mês fechado apara o mês corrente para o anterior — e diz na
  tela que aparou). Mas a adaptação NUNCA volta para o estado compartilhado: se voltasse,
  navegar de volta moveria a outra tela sem nenhum clique, e não haveria o que rastrear.
  🔑 **E O TERCEIRO CASO, que fecha a régua: AUSÊNCIA DE ESCOLHA E ESCOLHA DE AUSÊNCIA
  SÃO COISAS DIFERENTES — e é a segunda que precisa viajar.** Todo filtro tem um estado
  "sem filtro", e é tentador representá-lo pelo mesmo `null` de "ninguém escolheu ainda".
  Aí desligar o filtro deixa de ser gravável, o estado guarda o último valor escolhido, e
  voltar para a tela **reaplica justamente o filtro que a pessoa acabou de desligar** — a
  única escolha que o sistema desfaz sozinha é a de NÃO filtrar.
  Caso real: o "todos os períodos" da /comercial ganhou valor próprio (`MES_NENHUM`) ao
  lado de `{ano, mes}` e de `null`. Quem não entende esse valor — a /gestores, que só
  existe em mês fechado — simplesmente o ignora e usa o padrão dela, que é o que a régua
  das duas casas já mandava fazer com o que não se entende.
  **Teste rápido: se desligar o filtro não gera escrita, o estado está guardando a
  intenção antiga.**
- ⚠️ **QUEM APARA UM VALOR RECEBIDO DIZ O MOTIVO, NÃO SÓ QUE APAROU** — porque o motivo é
  o que decide o que a pessoa faz a seguir. "Não dá" trata como iguais situações que
  pedem ações opostas.
  Caso real: a /gestores recebe mês da /comercial e recusa por três razões distintas —
  *ainda não fechou* (volta a servir sozinho no dia 1º), *fora da janela de ~95 dias*
  (não volta nunca, a retenção é móvel) e *sem o mês anterior inteiro* (é limite da
  COMPARAÇÃO, não do dado). Uma mensagem só apagaria a diferença entre esperar, desistir
  e escolher outro recorte.
  ⚠️ O aviso descreve a CHEGADA e some no primeiro clique do seletor: depois disso ele
  passaria a explicar uma escolha que não está mais na tela.
- 🛑 **IMPORT DE VALOR NUM COMPONENTE ARRASTA A CADEIA INTEIRA PARA O BUNDLE DO CLIENTE.**
  `import type` é apagado na compilação; import de valor não é. Caso real: a tela importou
  uma constante de `lib/comercialAgregado.ts`, que importa `lib/comercial.ts`, que importa
  `node:crypto` — e o `next build` morreu com `UnhandledSchemeError: Reading from
  "node:crypto"`. **O typecheck passa nos dois casos; só o build acusa.**
  ⚠️ E o conserto NÃO foi mover a constante de lugar: foi a **tela deixar de conhecer a
  regra**, recebendo o booleano pronto. Mover o arquivo teria resolvido o erro e mantido o
  defeito de desenho — duas cópias da mesma decisão, uma em cada lado da fronteira.
- Em listas do React, a `key` deve ser o **ID único**, nunca o nome (nomes repetidos causam
  linhas duplicadas e vazamento entre agrupamentos).
- Não quebre features existentes ao adicionar novas; mudanças cirúrgicas.
- ⚠️ **UNIFICAR COMPONENTE PEDE LISTA EXPLÍCITA, conferida contra o código final.** Ler os
  dois lados e concluir que "parecem equivalentes" não basta: numa unificação real deste
  painel, **4 de 9 estados estavam faltando** no componente que ia absorver o outro, e um
  deles (o sinal de menos TIPOGRÁFICO do `pct()`, que alinha em `tabular-nums`) só apareceu
  comparando linha a linha. Defeito assim não é reportado como bug — é lido como "ficou
  estranho".
  **Método:** levante os estados ANTES de tocar, e reconfira cada um DEPOIS, no arquivo
  final. E a união vai **na direção da versão mais rica**, não da mais nova.
- ⚠️ **Nem tudo que se parece é duplicata — antes de unificar, pergunte o PAPEL.** Este
  painel tem três coisas que exibem variação percentual e **não** devem virar uma só:
  `DeltaChip` (chip com fundo tingido, para KPI que se lê de longe), `Trend` (só seta e cor,
  para linha de tabela onde o chip pesaria) e o "—" com motivo. Unificar por semelhança
  visual apagaria a diferença de peso, que é justamente a informação.
  Do mesmo jeito, **card de MÉTRICA e card de ENTIDADE são naturezas distintas**: o de
  entidade tem avatar, é clicável e carrega selos; forçá-lo no molde do de métrica custa
  exatamente o que ele tem de próprio.
- ⚠️⚠️ **ANTES DE MANTER UMA RESTRIÇÃO, PERGUNTE DE QUE ELA ERA PROXY — E SE O MOTIVO AINDA
  EXISTE.** Quase nenhuma restrição é sobre o que ela proíbe: ela proíbe X para proteger Y.
  Quando Y deixa de estar em risco, a proibição de X não vale mais nada — e continuar
  obedecendo custa exatamente o que a restrição nunca quis custar.
  **Restrição bem escrita carrega o porquê, e é o porquê que diz quando ela expira.** Sem o
  motivo anotado a regra vira superstição: mantida por quem não sabe se ainda vale, ou
  quebrada por quem não sabe o que ela protegia.
  🔑 **HÁ TRÊS SAÍDAS, E A TERCEIRA É QUASE SEMPRE A CERTA.** Obedecer e quebrar são as
  óbvias — e são as únicas que aparecem quando a pergunta é "mantenho ou não mantenho".
  A terceira é **REMOVER A CONDIÇÃO QUE CRIAVA O RISCO**: aí não há o que manter nem o que
  quebrar, porque a restrição deixou de ter assunto. As três expirações desta semana foram
  todas ela, e nenhuma teria sido encontrada discutindo se a regra ainda valia.
  ⚠️ Quando a restrição expira, **reescreva o comentário junto com o código**: comentário
  que afirma o contrário do que o código faz é pior que comentário nenhum, porque o próximo
  leitor confia nele.
  *Os casos se acumulam; a régua é uma. Três, comprimidos — repare que em todos a saída foi
  a terceira:* o modal "só leitura" (motivo: "dois formulários = duas verdades" → **extrair
  o formulário**, e nenhum dos dois passou a ser a segunda verdade); o modal que "não herda
  o período do Dashboard" (motivo: **não havia período para herdar** → passou a haver, e ele
  continua perguntando, só não começa do zero); a constante importada num componente
  (motivo: **o bundle** → não foi mover o arquivo, foi **a tela deixar de conhecer a**
  **regra**, e aí não havia mais import).
- ⚠️ **Regra que mora no PONTO DE CHAMADA se perde na terceira tela.** Um card fazia
  `delta={semComparacao ? null : delta}` no render: funcionava, e dependia de todo uso
  futuro lembrar. Regra que define o comportamento do componente mora **dentro** dele.
- **Tamanho de número é decisão de TELA, não de componente.** O mesmo KPI é 34px na tela de
  varredura e 26px numa grade densa. Vira prop com valores FIXOS — nunca auto-dimensionar
  ao container, que é frágil e quebra em telas estreitas.
- ⚠️ **Fundo de elemento que tem `hover:` vai em CLASSE, nunca em `style` inline.** Estilo
  inline vence stylesheet, então `style={{ background: X }}` + `hover:bg-y` na classe faz o
  hover **nunca pintar** — sem erro, sem aviso, e a tela parece só "sem resposta ao mouse".
  Três hovers deste painel estavam mortos assim desde antes do tema escuro; só apareceram
  quando a migração obrigou a medir par a par.
  **Conferência que vale rodar em projeto novo:** procurar `hover:bg-` e checar se o mesmo
  elemento tem `background:` inline nas linhas seguintes. É rápida e acha dívida antiga.
- ⚠️ **Varredura por `onClick` acusa CONTAINER, não só controle — confira o elemento antes
  de aplicar.** Uma conferência de afordância desta migração apontou um `<div>` de painel
  como se fosse botão: o `onClick` das linhas acima pertencia ao card irmão, não a ele.
  Heurística de proximidade encontra candidatos, não veredictos — **a correção em massa sai
  depois de olhar cada um**, senão a varredura conserta o que não estava quebrado.
- ⚠️ **Substituição em massa por PREFIXO roda ANTES das correções pontuais** — ou o padrão
  ancora o fim. Trocar `color: TEMA.texto` por `color: TEMA.textoSobreDestaque` em massa,
  depois de já ter corrigido uma linha à mão, casa o prefixo da linha corrigida e produz
  `textoSobreDestaqueSobreDestaque`. Aqui o TypeScript pegou; num nome de classe CSS ou
  numa string, passaria.
- ⚠️⚠️ **ANTES DE COMPARAR UM PERCENTUAL CONTRA UM LIMIAR, DIGA SOBRE O QUE ELE É
  PERCENTUAL.** Um número correto sobre o denominador errado **passa na revisão, porque a
  conta fecha** — e sai plausível, que é o pior tipo de errado: ninguém investiga um número
  que parece razoável.
  Caso real: o BI da agência mede o desempenho contra uma meta de 15%, e tem **duas** taxas
  de conversão sobre bases diferentes — uma sobre o total de leads, outra sobre os
  qualificados. **A taxa medida contra a meta não é nenhuma das duas.** Implementar o alvo
  sem determinar o denominador construiria a régua sobre a base errada, e o painel passaria
  a afirmar "72% da meta" sem que ninguém pudesse dizer meta de quê.
  **Corolário: limiar e denominador são UMA decisão, não duas.** Quem informa o alvo tem que
  informar a base junto; alvo sem base é número sem unidade. E quando a base não é
  determinável, **a régua não sobe** — melhor não ter indicador de meta que ter um cujo
  denominador ninguém sabe.
  É a mesma família do piso duplo (`a ÷ b` com `a` zero) e do "nunca compare dois números em
  frames de data diferentes": nos três, o defeito não está no número, está no que ele divide.
- ⚠️ **PISO SIMPLES NÃO PEGA FURO NO NUMERADOR — todo ranking de razão precisa de piso
  nos DOIS lados.** A régua "mínimo de N conversões" existe para barrar a conta que
  converteu pouco e produz percentual gigante: ela protege o DENOMINADOR. Não protege o
  contrário. Caso real: no ranking de melhor CPL vs a média do nicho, a **ARP TELECOM
  apareceu em 1º lugar da carteira com CPL R$ 0 e −100%** — tinha 5 conversões (passou no
  piso) e **zero gasto**. Custo zero é o mínimo matemático, então uma conta assim é sempre
  a campeã e o pódio inteiro vira mentira.
  **E o modo de falha é o mais caro que existe: ela não aparecia na janela de 7 dias e
  aparecia na de 15.** Entraria sozinha num dia qualquer, sem ninguém ter mexido em nada —
  não há mudança para investigar, e o defeito não é reportado como bug, é lido como "esse
  ranking está estranho".
  **A régua: em `a ÷ b`, pergunte o que acontece quando `a` é zero e quando `b` é zero.**
  Os dois pisos medem coisas diferentes e nenhum substitui o outro — um garante que a razão
  SIGNIFICA algo, o outro garante que ela EXISTE.
- ⚠️ **DUAS RÉGUAS PARA O MESMO DADO É DESENHO, NÃO DUPLICAÇÃO — quando respondem a
  perguntas diferentes.** "Quantas contas estão perto do teto de gasto" (ESTADO) e "quais
  exigem alguém fazer algo hoje" (AÇÃO) saem dos mesmos dois campos e não são a mesma
  pergunta: medido em 16/08/2026, **42 de 51 contas com teto estavam em ≥90%** — como
  estado, uma descrição correta; como alerta, o alarme diário que vira ruído. O que separa
  é o RITMO (`restante ÷ gasto por dia`), e ele reduziu as 42 a 10 já paradas + 11 na
  semana. As duas funções convivem no mesmo módulo, cada uma com o nome do que responde, e
  o comentário diz por que apagar uma para "unificar" quebra a outra.
- **Nunca compare dois números em frames de data diferentes.** Cada um pode estar certo
  sozinho e a comparação medir coisas distintas — "criados este ano" contra "fechados este
  ano" não é a mesma pergunta, e a conclusão sai maior que o dado.
- Ao terminar uma tarefa grande, faça um resumo curto do que mudou e como testar.

## Estilo de comunicação com o usuário
- Explique em **português, passo a passo, sem jargão**.
- Diga exatamente **quais cliques** (Vercel/Firebase/GitHub) e **quais envs** são necessários.
- Antes de publicar algo visual, sugira **validar no navegador** (rodar em dev e conferir).
- ⚠️ **PREVIEW NASCE SERVIDO POR HTTP, nunca como arquivo para duplo clique.** O Chrome trata
  `file:` como **origem única e opaca**, e tudo que dependa de origem — fonte externa, `fetch`,
  iframe, `type="module"`, leitura de `cssRules` — **morre em silêncio**: a página abre, parece
  inteira, e o comportamento simplesmente não acontece. Um preview de componentes chegou a
  parecer defeito de código quando o problema era o protocolo.
  **Regra:** sirva por HTTP (servidor estático numa porta livre já resolve) e, se o arquivo
  também precisar funcionar solto, **elimine toda dependência externa** e faça a página dizer
  na tela de onde veio.
- ⚠️ **Em investigação de comportamento, COMO a pessoa abriu vale tanto quanto o que ela viu.**
  No caso acima, "abri o arquivo" estava na primeira frase do relato e eu li como contexto, não
  como sintoma — custou uma rodada inteira de investigação em cima de código que estava certo.
  **Pergunte o ambiente antes de suspeitar do código:** protocolo, navegador, se é build ou dev,
  se há preferência de acessibilidade ligada.
- Diante de um problema, **descubra a causa real** antes de propor correção — e diga quando
  não souber, em vez de chutar. Um erro de infraestrutura (cota, permissão, credencial) se
  parece com bug de código, mas o conserto é outro.
- ⚠️ **REPETIR A PREMISSA DO PEDIDO SEM MEDIR É COMO O ERRO ENTRA.** O pedido chega com um
  diagnóstico embutido, e ele é *plausível* — foi escrito por quem conhece o sistema. Aceitá-lo
  é o caminho mais rápido para construir a coisa errada com competência.
  Dois erros da MESMA tarefa vieram daí, os dois medidos depois:
  · **o defeito não era o descrito.** O pedido era quebrar o sync por objetivo de campanha
    "porque o painel soma formulário e WhatsApp juntos". Ele não somava: os dois já eram
    campos separados, derivados do `action_type`, e essa separação é EXATA porque vem do
    evento. Agrupar por rótulo de objetivo seria menos preciso — o mesmo valor
    (`OUTCOME_ENGAGEMENT`) produziu 911 linhas de WhatsApp e 3 de formulário. O problema
    real (gasto sem atribuição) estava ao lado, valia mais, e ninguém tinha pedido.
  · **o custo não era o afirmado.** "Zero chamadas a mais, é a mesma requisição com outro
    parâmetro" — eu repeti isso no plano sem conferir. Não fecha: `reach` é métrica
    DEDUPLICADA, e derivar o total da conta somando conjuntos empilharia dupla contagem num
    campo gravado há meses. É uma chamada a mais, e admitir isso melhorou o desenho (duas
    fontes independentes viram conferência de verdade).
  **A régua: antes de implementar o conserto pedido, meça se o defeito é o descrito.**
  Confirmar o diagnóstico é parte da tarefa, não etapa opcional antes dela. E quando a
  medição contraria quem pediu, isso se diz — com o número na mão, antes do código.
- ⚠️ **A PREMISSA NÃO MEDIDA TAMBÉM MORA NO TAMANHO DA AMOSTRA, não só no conteúdo.**
  Apresentar uma lista como completa quando ela veio de uma janela curta é a mesma falha,
  um nível abaixo — e é pior, porque a lista *parece* dado, não opinião.
  Caso real: levantei os grupos de otimização numa janela de 7 dias e reportei "são 10".
  Em 95 dias eram **14**, e o maior grupo excluído aparecia com R$ 309 na amostra curta
  contra **R$ 10.322** no período inteiro — o suficiente para mudar a decisão de negócio
  que se tomou em cima do número.
  **Diga sempre de que recorte a lista veio, e pergunte se o recorte é grande o bastante
  para a lista fechar.** Item raro é justamente o que uma amostra curta esconde.
- ⚠️ **NÚMERO QUE VAI PARA FORA SE MEDE UMA VEZ, NA POPULAÇÃO INTEIRA.** Corrigir o mesmo
  número duas vezes para quem vai levá-lo a uma reunião gasta a confiança nele — na
  terceira, ninguém acredita em nenhum. Se o cálculo depende de uma base que está sendo
  preenchida, **o script se recusa a rodar incompleto** em vez de você lembrar de conferir:
  uma trava no começo (`if (faltando.length) process.exit(1)`) custa três linhas e evita a
  correção seguinte.
- ⚠️ **EXEMPLO ERRADO É PIOR QUE NENHUM EXEMPLO.** Ao registrar uma lição, confira se o
  caso citado é o que realmente aconteceu. Eu quase registrei "a conta X passou verde na
  conferência de identidade" — a lição estava certa, o mecanismo estava certo, e o caso era
  outro (ela nunca chegou à conferência; falhou antes, num ponto diferente). Um exemplo
  falso vira referência: alguém vai desenhar em cima dele. **Lição sem exemplo é honesta;
  lição com exemplo inventado é dívida.**
- ⚠️ **"DECIDIMOS CONTRA" E "DECIDIMOS DIFERENTE" NÃO ENTRAM NA MESMA LISTA.** Toda lista de
  recusas mistura duas coisas de naturezas opostas: o que foi rejeitado **por princípio** (a
  razão vale sempre e não depende de medida) e o que foi apenas **ajustado por medida** (o
  princípio é o mesmo, o número é outro). Juntas, a segunda herda o peso da primeira — e
  quem lê daqui a três meses conclui que rejeitamos uma ideia inteira quando só calibramos
  um valor.
  Caso real: das seis linhas da inspeção da instância de referência, cinco eram recusa de
  princípio (paleta roxa, `clamp()` no número herói, sombras pesadas, animação infinita,
  peso 800) e uma **não era**: a duração da barra (1,1s deles contra 520ms nossos). Ali o
  princípio é idêntico dos dois lados — animação não pode fazer esperar para ler — e só o
  número diverge. Na mesma lista, lia como "somos contra animação longa"; separada, lê como
  o que é: a nossa própria regra aplicada.
  **A régua: se o motivo da recusa contém um NÚMERO, provavelmente é ajuste, não recusa.**
  Princípio se escreve sem medida ("sombra não eleva no escuro porque não há luz para
  bloquear"); ajuste não se escreve sem ela. Separe as duas seções — a lista de recusas é
  lida justamente por quem NÃO participou da decisão, e para essa pessoa a diferença entre
  "caminho fechado" e "número aferido" é a única coisa que importa.
- Ao mexer em algo que já está no ar sendo usado, mostre o **plano antes do código**.
