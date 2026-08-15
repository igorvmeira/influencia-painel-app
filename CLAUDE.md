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

## Segurança e variáveis de ambiente (crítico)
- **Segredos** (tokens de API, chaves admin) ficam **só no servidor**, em variáveis de ambiente.
  Nunca no cliente, nunca no repositório.
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

## Sincronização e tarefas longas
- Vercel grátis corta funções em ~10s. Para uso **comercial**, prefira **Vercel Pro**
  (mais tempo + cron nativo).
- Se estiver no grátis: torne o sync **incremental/resumível** (parâmetros de offset/limite,
  grava cada item ao terminar) e automatize com **GitHub Actions** (workflow em cron que chama
  o endpoint em blocos até terminar).
- Sync **idempotente**: rodar de novo atualiza (merge), não duplica. Use docId determinístico.
- Ao mudar o sync, valide que ele **continua gravando tudo que já gravava** — ele alimenta o
  app inteiro. Campo ausente na fonte grava `null`, nunca `0` (zero é um valor real).

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
- Em listas do React, a `key` deve ser o **ID único**, nunca o nome (nomes repetidos causam
  linhas duplicadas e vazamento entre agrupamentos).
- Não quebre features existentes ao adicionar novas; mudanças cirúrgicas.
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
- **Antes de comparar um percentual contra um limiar, diga sobre o que ele é percentual.**
  Um número correto sobre o denominador errado passa na revisão, porque a conta fecha.
- **Nunca compare dois números em frames de data diferentes.** Cada um pode estar certo
  sozinho e a comparação medir coisas distintas — "criados este ano" contra "fechados este
  ano" não é a mesma pergunta, e a conclusão sai maior que o dado.
- Ao terminar uma tarefa grande, faça um resumo curto do que mudou e como testar.

## Estilo de comunicação com o usuário
- Explique em **português, passo a passo, sem jargão**.
- Diga exatamente **quais cliques** (Vercel/Firebase/GitHub) e **quais envs** são necessários.
- Antes de publicar algo visual, sugira **validar no navegador** (rodar em dev e conferir).
- Diante de um problema, **descubra a causa real** antes de propor correção — e diga quando
  não souber, em vez de chutar. Um erro de infraestrutura (cota, permissão, credencial) se
  parece com bug de código, mas o conserto é outro.
- Ao mexer em algo que já está no ar sendo usado, mostre o **plano antes do código**.
