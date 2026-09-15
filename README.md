# Painel de Tráfego — Influência 4.0

Painel que puxa os resultados do Meta Ads por gestor e por cliente (gasto, leads de
formulário B2B, conversas de WhatsApp B2C e CPL), com comparação contra o período
anterior. Frontend em Next.js (Vercel), dados no Firebase Firestore, atualização
automática por GitHub Actions (ver "Automação" — o cron da Vercel NÃO é usado, e há
motivo escrito).

Sobe e renderiza com dados de exemplo antes de plugar o Meta — dá pra fazer o deploy
primeiro e ligar o token depois.

## Stack
- Next.js 14 (App Router) na Vercel
- Firebase Firestore (de-para de contas + números processados)
- GitHub Actions chamando `/api/sync-meta` (Meta Marketing API → Firestore) — **não** o
  cron da Vercel; ver "Automação" para o porquê

## 1. Rodar local
```bash
npm install
cp .env.example .env.local   # pode deixar vazio: cai no mock
npm run dev
```
Abra http://localhost:3000 — verá o painel com dados de exemplo.

## 2. Firebase
1. Crie um projeto no console do Firebase e ative o Firestore (modo produção).
2. Configurações do projeto → Contas de serviço → **Gerar nova chave privada**.
3. Preencha `FIREBASE_PROJECT_ID`, `FIREBASE_CLIENT_EMAIL` e `FIREBASE_PRIVATE_KEY`
   no `.env.local` (a private key entre aspas, com os `\n` literais).
4. Publique as regras de `firestore.rules` (acesso direto do cliente bloqueado; o
   servidor usa o Admin SDK e ignora as regras).

### De-para das contas
Crie a coleção `contas` no Firestore, um documento por conta de anúncio:
```json
{ "accountId": "act_123456789", "cliente": "Loja Verde", "gestor": "Ana Souza", "tipo": "B2C" }
```
O modelo está em `data/depara.example.json`. `tipo` é "B2B" (formulário) ou "B2C" (WhatsApp).

## 3. Meta Marketing API
1. Crie um app no developers.facebook.com e adicione o produto Marketing API.
2. No Business Manager, crie um **System User** e gere um token de longa duração com
   permissão `ads_read`.
3. Garanta que esse usuário tem acesso (papel de analista basta) a **cada** conta de
   anúncio dos clientes — sem isso a API não enxerga os números.
4. Preencha `META_ACCESS_TOKEN` e `META_API_VERSION`.

### O ID do Business Manager da agência — o número que o CLIENTE precisa receber

```
929455658485115
```

**Verificado em 10/09/2026** consultando `GET /{id}?fields=id,name` no Graph `v21.0`: o id
responde **`"BM - Influência"`**.

⚠️ **Este número não estava registrado em lugar nenhum até 10/09/2026** — vivia na memória
de quem lembrava, e é pedido toda vez que um cliente precisa liberar acesso. Se ele mudar,
**remeça e atualize a data acima**, porque a próxima pessoa vai confiar nesta linha.

🔑 **Quem manda o número ao cliente pede que ele CONFIRA O NOME na tela antes de
confirmar.** É a única defesa contra um dígito trocado: com o id errado o cliente concede
acesso à BM de outra pessoa, e não há erro nenhum — a autorização simplesmente vai para o
lugar errado. É o mesmo risco do `accountId` transcrito de print, no sentido inverso.

**O caminho, do lado do cliente** (Gerenciador de Negócios **dele**, não o nosso):
Configurações → Contas de anúncios → selecionar a conta → **Atribuir parceiros** →
identificar por ID → `929455658485115` → conferir que aparece **BM - Influência** →
conceder **"Ver desempenho"**.

📌 **"Ver desempenho" é o mínimo, e é só leitura** — corresponde ao `ads_read`. Dizer isso
ao cliente costuma ser o que destrava o "sim": a agência não passa a poder criar, pausar
nem gastar nada na conta dele.

🛑 **Sem essa liberação, a conta responde `HTTP 403 / code 200`** (*"Ad account owner has
NOT grant ads_management or ads_read permission"*) e **fica fora de todos os números do
painel** — não é erro de cadastro nem de sync. Medido em 10/09/2026: **8 contas da carteira
estavam nesse estado**, distribuídas em cinco gestores.

⚠️⚠️ **E `403 code 200` NÃO PROVA que falta liberação do cliente — pode ser o id ERRADO.**
Medido em 10/09/2026: das 8, **três** (`GUARÁ NET`, `SOLUÇÃO NETWORK`, `ZAY SUSHI`) tinham
na planilha um `accountId` que **não é o da conta compartilhada**. O cliente já havia
liberado, o token já lia a conta certa, e ela **já estava cadastrada** — o número na
planilha é que apontava para outra conta do mesmo dono.
🔑 **O sintoma é idêntico nos dois casos**, e o que separa é olhar o NOME: o token lista
uma conta com o nome do cliente e um id diferente do que está na planilha. **Antes de
cobrar liberação, procure o nome do cliente no `me/adaccounts`** — se aparecer com outro
id, é correção de planilha, não cobrança. Mandar a cobrança errada pede ao cliente algo
que ele já fez.

### 🛑🛑 ATRIBUIR A CONTA AO USUÁRIO DO SISTEMA **NÃO** É O QUE FAZ O TOKEN LER

**Medido em 10/09/2026, em 18 contas de uma vez** — a lista de contas que estão na
`BM - Influência` e **não** estão atribuídas ao usuário do sistema (Painel Tokens):

```
respondem 200 à consulta direta : 18 de 18
em me/adaccounts                :  0 de 18
em me/assigned_ad_accounts      :  0 de 18
códigos de erro                 : NENHUM
```

**Todas não atribuídas. Todas legíveis. Nenhuma listada.** Nove delas estavam faturando —
**R$ 11.716,49 em 30 dias** — e o painel já as sincronizava normalmente, porque o sync lê
por consulta direta e nunca pela listagem.

🔎 **De onde vem o acesso, então — CANDIDATO, NÃO MEDIDO.** Os donos dessas contas são BMs
dos **clientes** (`BM - Sigaon Mais`, `Vox Conexão`, `hipercg`…), não a nossa. A explicação
provável é que o acesso venha da **parceria concedida na BM DO CLIENTE**, que é um caminho
diferente da atribuição interna. ⚠️ **Confirmar isso exigiria `business_management`, que o
token não tem** — então fica como hipótese, não como fato.

⚠️ **O que a tela da BM mede e o que a API responde são coisas diferentes.** A auditoria de
"contas não atribuídas" descreve **configuração interna da nossa BM**; a legibilidade
depende de outro grant. Ler uma como se fosse a outra faz procurar conta perdida onde não
há nenhuma.

### `me/assigned_ad_accounts` — a segunda listagem tem o MESMO ponto cego

Existe e **responde sem `business_management`** (ao contrário de `owned_ad_accounts` e
`client_ad_accounts`, que exigem e falham com `#100`). Em 10/09/2026 devolvia **110** contra
**111** do `me/adaccounts`, e a única diferença era `act_191616327202757` — a conta
fantasma.

🛑 **CORRIGIDO no mesmo dia.** Esta seção dizia que `assigned` *"parece listar só o que foi
explicitamente atribuído ao system user"* e que, se fosse isso, seria *"a lista mais fiel do
que nos deram acesso"*. **A medição das 18 desmente:** elas não estão atribuídas e também
**não** aparecem em `assigned`. Os dois endpoints erram exatamente as mesmas contas.
**Trocar de endpoint não conserta nada** — o ponto cego é o mesmo.

🔑 **A regra de ouro continua sendo a CONSULTA DIRETA a `/{accountId}`, e agora ela tem
prova de POPULAÇÃO, não de amostra:** 18 de 18. Antes eram 9 de 117 e 10 de 13 — números
que ainda admitiam a leitura de "casos isolados". Uma população inteira, 100% invisível e
100% legível, não admite.

As ações lidas são `lead` (formulário) e
`onsite_conversion.messaging_conversation_started_7d` (WhatsApp). Ajuste a lista em
`lib/meta.ts` se as contas usarem outros eventos de resultado.

## 4. Deploy — 100% no navegador (sem git, sem terminal)

1. **GitHub:** descompacte o zip. Em github.com, crie um repositório novo →
   **Add file → Upload files** → arraste as pastas (`app`, `components`, `lib`, `data`)
   e os arquivos soltos. A estrutura é preservada. Commit. (Não suba `node_modules`.)
2. **Firebase:** no console, crie o projeto, ative o Firestore e crie a coleção
   `contas` (um documento por conta — modelo em `data/depara.example.json`). Em
   Configurações → Contas de serviço → **Gerar nova chave privada** (baixa um `.json`).
3. **Vercel:** **Add New → Project → Import** o repositório. Em Environment Variables,
   abra o `.json` num bloco de notas e preencha: `FIREBASE_PROJECT_ID` (project_id),
   `FIREBASE_CLIENT_EMAIL` (client_email), `FIREBASE_PRIVATE_KEY` (private_key, copie
   como está no arquivo), `META_ACCESS_TOKEN`, `META_API_VERSION=v21.0` e `CRON_SECRET`
   (uma senha aleatória). Deploy.
4. **Ligar o Meta:** para puxar os dados, chame `/api/sync-meta` — ver
   **"Como chamar as rotas internas"** logo abaixo. No plano grátis isso é manual.
   Para rodar sozinho todo dia, veja "Automação".

## Como chamar as rotas internas (sync, backfill, diagnóstico)

Todas passam por `lib/cronAuth.ts` e aceitam o `CRON_SECRET` de **duas** formas:
header `Authorization: Bearer <segredo>` **ou** querystring `?key=<segredo>`.

⚠️⚠️ **O QUE O CÓDIGO ACEITA E ONDE VOCÊ DEVE PÔR O SEGREDO SÃO COISAS DIFERENTES.**
O código aceita as duas; **use o header**. Querystring entra no histórico do navegador,
no log do servidor, no `Referer` e no histórico do shell — lugares que ninguém limpa.
`?key=` existe para o caso em que só há uma barra de endereços à mão, e é o modo pior.

🕳️ **E há uma armadilha que torna o `?key=` não só pior, mas QUEBRADO:** se o segredo
tiver `+`, `/`, `=`, `&` ou `#`, a URL o corrompe — em querystring, `+` é decodificado
como **espaço**. O sintoma é `401 não autorizado` com a chave certa. Aconteceu em
20/08/2026, abrindo a rota no navegador.

### PowerShell (o terminal desta casa)

⚠️ No PowerShell, `curl` é **alias de `Invoke-WebRequest`** e engasga nas flags do curl
de verdade. Use `Invoke-RestMethod`, que é nativo e já entrega o JSON pronto:

⚠️ **A primeira linha não é opcional.** `$env:CRON_SECRET` **não existe** numa sessão nova
do PowerShell — a variável do `.env.local` não é lida pelo terminal. Sem definir antes, o
header vai vazio e a resposta é `401`, que parece problema de chave. Comando que pressupõe
estado do ambiente que o leitor não tem é a mesma família do exemplo errado.

```powershell
# 1. defina na sessão (some quando você fechar o terminal — é o comportamento desejado)
$env:CRON_SECRET = "cole-aqui-o-valor-que-está-na-Vercel"

# 2. agora sim
Invoke-RestMethod -Uri "https://SEU-APP.vercel.app/api/sync-meta" -Headers @{ Authorization = "Bearer $env:CRON_SECRET" }
```

Para conferir que a variável existe antes de chamar (devolve `True`):

```powershell
[bool]$env:CRON_SECRET
```

Para salvar num arquivo:

```powershell
Invoke-RestMethod -Uri "https://SEU-APP.vercel.app/api/diag-porte" -Headers @{ Authorization = "Bearer $env:CRON_SECRET" } | ConvertTo-Json -Depth 10 | Out-File -Encoding utf8 porte.json
```

⚠️ **O `-Encoding utf8` não é enfeite.** Sem ele o redirecionamento `>` do Windows
PowerShell grava em **UTF-16**, e a maioria das ferramentas lê o arquivo como lixo
(`{ " o k " : t r u e`). Aconteceu em 20/08/2026.
⚠️ E `Out-File` grava onde o PowerShell **está**, não onde você acha que está: um
arquivo "salvo no repositório" foi parar em `C:\Users\<você>\`.

Se preferir o curl de verdade, chame `curl.exe` pelo nome completo — e no PowerShell
o descarte é `NUL`, não `/dev/null`:

```powershell
curl.exe -sS -H "Authorization: Bearer $env:CRON_SECRET" "https://SEU-APP.vercel.app/api/sync-meta"
```

### bash / WSL / Linux

```bash
curl -sS -H "Authorization: Bearer $CRON_SECRET" "https://SEU-APP.vercel.app/api/sync-meta"
```

### Navegador

A barra de endereços não manda header, então só resta `?key=` — com as duas ressalvas
acima (fica no histórico, e quebra se o segredo tiver `+`, `/`, `=`, `&` ou `#`).
**Se o seu segredo tiver qualquer um desses caracteres, o navegador não é opção.**

Rodar local (`npm run dev`) é opcional e não faz parte do fluxo online acima.

### Sobre a chave do Firebase (erro "Invalid PEM")
Esse erro vem da `FIREBASE_PRIVATE_KEY` com quebras de linha erradas. O código já
normaliza, então cole a `private_key` exatamente como aparece no `.json`. Se ainda
reclamar, use `FIREBASE_SERVICE_ACCOUNT_BASE64` (o JSON inteiro em base64, numa linha).

## Automação — GitHub Actions, e NÃO o cron da Vercel

> ⚠️ **ESTA SEÇÃO DIZIA O CONTRÁRIO até 12/09/2026**, e o que ela mandava fazer é
> exatamente o que foi decidido NÃO fazer. Ela instruía: "para o sync rodar sozinho,
> faça upgrade para o Pro, ponha `crons` no `vercel.json` e suba o `maxDuration` para
> 300". O projeto **está no Pro desde setembro/2026**, e mesmo assim a resposta é não.
> Documento que manda fazer o que a equipe decidiu evitar é pior que documento ausente.

Os três syncs rodam por **GitHub Actions**, em `.github/workflows/`:

| workflow | horário (UTC) | o que faz |
|---|---|---|
| `sync-meta.yml` | `0 9` | LAÇO de blocos: `?offset=N&limite=10` até `proximoOffset` vir null |
| `sync-comercial.yml` | `30 9` | uma chamada |
| `sync-planilha.yml` | `40 9` | uma chamada, só os campos de `planilha.*` |

O `vercel.json` é `{}` de propósito. **Não ponha `crons` nele.**

### Por que NÃO migrar para o cron da Vercel

O Pro destrava o cron nativo, e ele parece upgrade. **É menos do que já existe aqui**, em
quatro eixos — e o quarto é o que decide:

| | GitHub Actions | cron da Vercel |
|---|---|---|
| falha visível, com e-mail | **sim** | a doc de cron não descreve notificação |
| retry | sim, 1 tentativa extra após 20s | não |
| retenção de log | ~90 dias | **1 dia** no Pro (medido em 12/09/2026) |
| **asserção sobre o CORPO da resposta** | **sim** | **não há onde pôr** |

🔑 **A quarta é a que fecha, e é específica deste projeto.** Os workflows não checam
"respondeu 200" — eles **leem o JSON e reprovam o job**: o `sync-comercial` derruba se
`conferencia.coerencia.tudoCoerente` quebrar; o `sync-planilha` derruba se o detector de
coluna perder uma âncora, ou se gravar e não achar o campo na leitura de volta.

**Cron da Vercel é dispara-e-esquece.** Um `200` com o detector cego por dentro passaria —
e é exatamente o modo de falha que aquelas guardas existem para pegar. Trocar o agendador
apagaria a camada de conferência junto com ele.

⚠️ **E o `sync-meta` nem poderia migrar sem reescrita.** Ele é um LAÇO de 13–14 chamadas
paginadas (~100s de relógio, medido nos logs de 11/09/2026); o cron da Vercel dispara
**uma** requisição. Caberia numa invocação só apenas com `maxDuration` bem acima do atual —
ou seja, reescrever o sync para resolver um problema que não existe.

**Se um dia migrar mesmo assim**, a pergunta a responder ANTES é "como eu fico sabendo que
falhou?". Hoje a resposta é um e-mail que já funciona — foi assim que a falta do
`PLANILHA_GERENCIAL_ID` apareceu em 12/09/2026.

### `maxDuration`: 60 fica, e o ganho disponível é DESCER

Medido em 12/09/2026, em produção: `sync-planilha` **5,5s** ponta a ponta com rede;
`sync-meta` **7–13s por bloco**; `comercial/backfill` ~25s. **Nada chega perto de 60.**
A régua da casa vale aqui: *não desenhe em volta de um teto que você não mediu*.

Duas pendências anotadas, nenhuma urgente:

- 📌 **Descer o teto das rotas de LEITURA DE TELA** (`/api/contas`, `/api/painel`,
  `/api/orientacoes`) de 60s para ~15s. As 17 rotas estão em 60 por cópia, não por
  decisão, e um Firestore pendurado segura a função um minuto inteiro antes de devolver
  erro — uma tela quer falhar rápido. **Não feito agora porque mexe em rota que a tela
  usa e não há urgência.**
- 📌 **`comercial/backfill`, se um dia apertar: LOTE MAIOR, não mais tempo.** Ele está em
  ~25s de 60 com 400 ids por chamada; 800 ids ainda cabem. Subir o `maxDuration` trataria
  o sintoma e deixaria a chamada mais longa e mais cara de repetir quando falhasse.

## O auditor de envs é lembrete, não garantia

`node scripts/audita-envs.js` confere se cada módulo declara as envs que lê, se as rotas de cron
compõem tudo o que alcançam e se o `.env.example` está completo. **Ele faz isso por BUSCA DE TEXTO
no arquivo, não lendo o código como código** — e isso muda o que o "Tudo certo" dele vale.

🛑 **Levantado em 15/09/2026, lendo o auditor inteiro: dez pontos funcionam por busca de texto, e
SETE deles podem aprovar o que está errado.** Ele não é uma conferência com pontos cegos: é uma busca
de texto que se parece com conferência. **Pega o caso descuidado e perde o caso torto. Serve como
lembrete, não como garantia** — quem ler "Tudo certo" não deve concluir que as envs estão conferidas.

As três falhas que ele já teve têm essa forma — o padrão de leitura sem desestruturação (12–14/09),
a lista de rotas de cron mantida à mão (15/09) e o nome de uma declaração achado num comentário
(15/09) —, e a do teste da foto do fechamento também (ver CLAUDE.md, *conferência por busca de
palavra*).

**Podem aprovar o que está errado:**

| # | onde (em `scripts/audita-envs.js`) | o que ele busca | como aprova errado |
|---|---|---|---|
| 1 | verificação 2 — "chama `conferirEnvs`?" | o texto `conferirEnvs(` no arquivo, com comentários | um comentário citando a chamada basta — o caso de 15/09, noutra linha |
| 2 | verificação 2 — "compõe?" | o texto dentro de `comporEnvs(...)` | não confere se o resultado é o que chega a `conferirEnvs`; parêntese aninhado quebra a leitura |
| 3 | `alcancaveis` e `resolver` | `import … from "…"` e as extensões `.ts`, `.tsx`, `/index.ts` | módulo alcançado por `require`, `export … from` ou `import()` dinâmico — ou em `/index.tsx` e `.js` — fica fora do grafo, e as envs dele somem da verificação 2 |
| 4 | `blocosEnvs` e `envsDeclaradas` | qualquer texto maiúsculo entre aspas dentro do bloco `ENVS_*`, com as chaves contadas no texto | nome entre aspas num comentário dentro do bloco conta como declarado; chave dentro de string desalinha o bloco |
| 5 | `envsLidas` nas verificações 1, 2 e 3 | `process.env.X` no arquivo com comentários (só a verificação 0 tira comentário) | um comentário citando uma env esconde a declaração que ninguém mais lê |
| 6 | verificação 1b — leitura dos workflows | `schedule:` e URLs `https://…/api/…` escritas no workflow | URL montada por variável ou secret: a rota de cron nem é detectada, e a verificação 2 nunca a olha |
| 7 | verificação 3 — leitura do `.env.example` | qualquer linha `# NOME=` (de propósito, para opções comentadas) | um exemplo em prosa com `NOME=` também conta como documentada |

**Só dão alarme a mais:**

| # | onde | o que acontece |
|---|---|---|
| 8 | `RE_PONTO` e `contarAcessos` | `process.env.X` dentro de string (uma mensagem de erro) conta como leitura, ou como acesso fora dos padrões reconhecidos |
| 9 | `semComentarios` | tira comentário por linha — não é leitor de código, e o próprio comentário da função diz isso |

**Listas mantidas à mão:**

| # | onde | o que acontece |
|---|---|---|
| 10 | `ROTAS_DE_CRON` e `PODE_LER_DINAMICO` | envelhecem caladas; a primeira é vigiada pela verificação 1b, que depende do item 6 |

📌 **Não consertado, de propósito (decisão do Igor, 15/09/2026).** Se um dia valer a pena, a saída
**não é tapar os dez — é ler o código como código** (a árvore de sintaxe do TypeScript, não o texto):
chamada é chamada, comentário não é código, e import de qualquer forma é aresta do grafo.
🔑 **Por onde começar: o item 3.** Módulo alcançado por `require`, `export … from` ou `import()`
dinâmico fica invisível — e isso não é um caso torto, é um jeito normal de escrever código.

## Próximos passos
- 📌 **Pendência (14/09/2026): o contexto da IA não filtra conta pausada.**
  `lib/iaContexto.ts` monta o painel com a carteira INTEIRA (`montarPainel(daily, contas, …)`),
  enquanto Dashboard, Início, /gestores, alertas e orientações usam só `!c.pausado` — a
  "regra única" do painel. Em 14/09 eram **41 contas no balde PAUSADO** entrando no que a IA
  descreve: nos totais, no CPL geral e como se "PAUSADO" fosse um gestor. Frase de IA
  ninguém confere contra a tela, então a divergência não aparece sozinha.
- ✅ **Resolvido (14/09/2026): a cópia própria de `cplDe` em `lib/destaques.ts` saiu.** Ela
  exigia conversão e não exigia gasto — gestor com conversões e gasto zero entraria no pódio
  da Início com −100% enquanto a /gestores já devolvia `null`. Trocada pela de `lib/cpl.ts`
  com conferência antes×depois no mesmo dado: pódio da Início e decomposição da /gestores de
  julho e agosto idênticos. A régua que ela deixou está no CLAUDE.md ("proteção que funciona
  pelo dado, e não pelo código").
- ✅ **Resolvido (14/09/2026): o selo da /gestores podia ir para gestor SEM variação.** A fila
  punha quem não tinha variação no FIM, mas não o tirava; se todos os gestores com variação
  fossem inelegíveis, o selo iria para um sem evolução, e a Início não daria a ninguém. Agora
  só entra na fila quem tem variação (`escolherPremiado` em `lib/destaques.ts`, extraída do
  componente para poder ser conferida com o código compilado). **Conferido com o dado real,
  antes e depois: agosto ISMAIL nas duas versões, julho sem selo nas duas** (nenhum gestor
  elegível), e a Início concorda em agosto. Caso plantado — só o gestor sem variação é
  elegível: antes ele levava o selo, agora ninguém leva.
- 📌 **NÃO MEDIDO (15/09/2026): quanto o GitHub demora para COMEÇAR uma execução disparada à
  mão.** A opção escolhida para o horário do sync (cron da Vercel às 06:00 de Brasília
  dispara o `sync-meta` por `workflow_dispatch`) parte de uma premissa: o atraso documentado
  pelo GitHub é do AGENDAMENTO (`schedule`), não do disparo. **Se o disparo também entrar em
  fila por horas, a opção não resolve nada.**
  Referência antes dela: 65 execuções agendadas, atraso de 0h29 a 11h46 depois das 09:00 UTC;
  desde 27/08 nenhuma começou antes de 09:29 em Brasília.
  **Como medir, a partir do primeiro dia no ar:** cada execução disparada imprime um aviso
  com o instante em que o GitHub aceitou o disparo e quantos segundos levou para começar; a
  API pública de execuções (`/actions/workflows/sync-meta.yml/runs?event=workflow_dispatch`)
  dá `created_at` e `run_started_at`; e `sistema/disparoWorkflows` no Firestore guarda a hora
  em que a Vercel disparou e a resposta do GitHub.
  **Critério, em 7 dias no ar:** disparo aceito até 09:05 UTC e execução começando até 09:15
  UTC em todos os dias. Se não cumprir, a opção volta à mesa — e a tela continua dizendo a
  verdade no meio-tempo ("entra assim que a sincronização de hoje rodar").
- ✅ **Resolvido (15/09/2026): a régua de base incompleta barrava conta que só começou a
  veicular no meio do mês.** Ela perguntava "a série da conta começa no dia 1?"; agora pergunta
  "o painel LEU a conta do começo ao fim do mês?" (`coberturaMes` em `lib/periodo.ts`, com a
  janela de leitura de cada conta publicada em `leituraPorConta` por `lib/data.ts`).
  Medido antes de mudar: 18 contas ativas com a série começando depois do início da leitura, e
  nas 18 a Meta devolve gasto e impressões ZERO no buraco; nenhuma conta ativa com buraco de 30
  dias ou mais no meio da série. Em agosto eram 9 falsos positivos, e eles tiravam do selo
  WEDER, ANDRÉ, VINÍCIUS, JOÃO PEDRO e DANIEL. A régua nova também pega o que a antiga deixava
  passar: conta cuja leitura PAROU antes do fim do mês.
  ⚠️ **O conserto abria um furo, fechado no mesmo commit:** doc agregado nascido truncado (conta
  nova sincronizada com `?dias=N`) pareceria "não veiculava". O sync passa a gravar `lidoDesde`
  (`lidoDesdeAposSync` em `lib/agregadas.ts`); doc sem o campo cai na retenção, o que a medição
  acima valida para os docs de hoje.
  Conferência antes×depois com o código compilado e o dado real: números dos gestores
  idênticos; julho sem mudança (81 incompletas nas duas, sem selo); selo de agosto ISMAIL →
  WEDER com a carteira da manhã. Casos plantados — começou no meio, doc truncado, leitura parou,
  sem leitura, mês em curso, gestor elegível e inelegível pelos dois lados, sete caminhos do
  `lidoDesde`: todos no esperado. **Agosto foi pago com a régua antiga** — ver CLAUDE.md, *MÊS
  PAGO NÃO É MÊS EXIBIDO*.
  📌 **NÃO CONFERIDO AINDA:** que o sync grava `lidoDesde` de fato. Só o sync grava o campo, e
  nenhuma execução rodou com o código novo. Conferir na próxima: os docs de
  `metricasAgregadas` reescritos têm `lidoDesde` (presença, não valor).
- ✅ **Resolvido (15/09/2026): a ISP4 (ISMAIL) saiu da carteira e foi ESTACIONADA** (decisão do
  Igor em 15/09: agosto já foi pago, a conta pode ser tratada). Foi a saída que retirou o acesso
  (#200 desde 04/09); o "0 - PAUSADO" da planilha não provava a saída — lá PAUSADO é relação
  comercial, e 11 contas assim seguiam veiculando em 10/09 (ver `lib/conciliaPlanilha.ts`).
  **Caminho usado: estacionar** — a mesma gravação da `/carteira` (gestor PAUSADO, `pausado`
  true, entrada no `gestorHistorico` com `por` dizendo que foi script), com prévia e leitura de
  volta; coleção inteira sem divergência entre gestor PAUSADO e `pausado`. A marca de ciente em
  `sistema/falhasCientes` foi removida: conta pausada é falha esperada.
  **Lápide não:** `sistema/contasRemovidas` só é lida para conta FORA do cadastro (fila de
  contas, conciliação da planilha, descoberta), e a ISP4 continua cadastrada — seria um
  registro que nenhum código consulta. Renovar a marca também não resolvia: a conta seguia
  ativa nos números.
  ⚠️ **O que mudou na tela:** agosto do ISMAIL de CPL R$ 14,71 para R$ 12,68 (variação −4,76%
  → −9,26%), julho de R$ 15,45 para R$ 13,97; com a régua nova, o selo de agosto é do ISMAIL.
  E **julho deixou de ser oferecido na /gestores**: aparecia só porque o doc parado da ISP4
  guardava dados desde 31/05; sem ela, nenhuma conta ativa tem junho inteiro na janela.
  A `/conciliacao` passa a listar a ISP4 entre as estacionadas com "planilha diz dono ISMAIL" —
  é sugestão, não escrita; enquanto a linha estiver na aba do ISMAIL, ela fica lá.
- ✅ **Resolvido (15/09/2026): DRA. ANA PAULA e TRAJETO reativadas** (→ ISMAIL e → VINÍCIUS, as
  abas delas na planilha). Veiculavam todos os dias desde 17/08 e 25/08 e estavam marcadas como
  paradas. Decisão do Igor: reativar se nenhum selo mudar. Medido com a régua nova em quatro
  cenários (carteira atual, cada uma sozinha, as duas): nenhum selo muda na /gestores nem na
  Início, e agosto continua o único mês oferecido. Mudou na tela: agosto do ISMAIL CPL R$ 12,68 →
  R$ 12,75 (−9,26% → −8,74%) e do VINÍCIUS variação 5,10% → 5,13%. Gravadas por script com prévia
  (aba da planilha conferida contra o destino) e leitura de volta; coleção inteira depois: 40
  pausadas, 40 no balde PAUSADO, 0 divergentes. ⚠️ Pela régua antiga a mesma reativação tiraria o
  selo de agosto do ISMAIL (a DRA. ANA PAULA contava como base incompleta) — era o que a travava.
- 📌 **Ordem decidida (Igor, 15/09/2026): a janela de 95 dias ANTES da saída com data.** A saída
  com data muda agosto na tela de novo: a ISP4 volta para o ISMAIL até 15/09 e, pelo histórico
  gravado, a DRA. ANA PAULA e a TRAJETO saem dos dias de agosto em que estavam no balde PAUSADO.
  **O que a janela resolve e o que não resolve (calculado em 15/09/2026):** agosto deixa de ser
  oferecido na /gestores na sincronização de 05/10/2026 com 95 dias, e na de 01/11/2026 com os
  122 dias propostos — janela maior ADIA, não evita; setembro sai em 05/11 ou 02/12. Nesse dia
  some a TELA, não o dado: `metricasDiarias` guarda julho e agosto inteiros desde 02/04/2026
  (2.352 e 2.346 linhas conta-dia, iguais ao agregado). Manter um mês pago à vista é outra obra —
  foto do fechamento, ou leitura sob demanda do granular para mês fora da janela. Sem decisão.
- ✅ **Feito (15/09/2026): a janela de 122 dias, pelos motivos dela** (decisão do Igor: não conta
  como solução do agosto). `RETENCAO_DIAS` passou a ser conferida no build contra a exigência das
  telas no pior dia do calendário (`EXIGENCIAS_DA_TELA` em `lib/agregadas.ts`: dois meses fechados
  na /gestores = 122 dias; 60d contra 60d = 120). O que mudou:
  · a borda do que as telas oferecem (`inicioJanela`) é o primeiro dia LIDO para a carteira
    inteira (`inicioDaCarteira` em `lib/data.ts`), não a menor data de qualquer conta nem a
    retenção da sync. Doc parado não alarga mais a oferta, e /gestores, Início e Dashboard usam a
    mesma borda;
  · doc sem `lidoDesde` continua lido pela retenção LEGADA de 95 (`RETENCAO_LEGADO_DIAS`) — pela
    janela nova ele afirmaria 27 dias que nenhum sync leu;
  · conta nova busca 123 dias, um a mais, para o `lidoDesde` dela nascer no corte;
  · o modal da conta perde a variação quando o painel não leu os dois períodos DAQUELA conta: hoje
    o 60d mostra "—" com o motivo (exigiria dados desde 18/05, o painel lê desde 12/06);
  · o calendário do Dashboard calcula os dias disponíveis em vez de afirmar "guarda os últimos N".
  ✅ **Docs estendidos para trás em 15/09/2026** (decisão do Igor, depois de prévia com custo).
  Fonte Meta, faixa 16/05..11/06: 121 docs (1.790 linhas) e 81 linhas no granular das 3 contas
  cadastradas em 07/09 (SIGA ON, VOX ITABUNA, VIVA CONNECTION). ⚠️ A primeira prévia usava o
  granular como fonte e deixava as três de fora — e a extensão inteira não mudaria a tela, porque
  o início da carteira é o `desde` mais TARDIO entre as ativas: uma conta sem extensão segura todas.
  Conferência antes de gravar: nos 1.730 dias-conta em que granular e Meta existem, zero diferenças.
  Custo real: 572 leituras, 202 gravações, 121 chamadas à Meta — a prévia estimou 242 leituras e
  181 gravações e deixou de fora a leitura do plano e a de volta do granular. Lido de volta: 121
  docs com `lidoDesde` 16/05, nenhum errado. Conferido na tela depois: início da carteira 16/05;
  julho de volta com selo LUCAS (−26,34%, registrado ANTES no CLAUDE.md); agosto intacto (ISMAIL
  −8,74%); comparação de 7/15/30/60d no Dashboard e 60d no modal das 84 contas. O
  `backfill-conjuntos` com `dias=123` continua marcado para não rodar sem decisão.
  Conferência antes×depois com o código de produção, no dado real: meses oferecidos, selo de agosto
  (ISMAIL), pódio da Início, "Mês", calendário e comparação de 7/15/30/60d idênticos; o modal da
  conta em 7/15/30d igual nas 84 contas ativas, e em 60d as 84 perdem a variação com o motivo.
  Casos plantados (doc parado, conta nova truncada, exigência do calendário, doc legado, conta nova,
  agosto em 05/10 e em 01/11, modal com leitura curta, parada e ausente): todos no esperado.
- ✅ **Construída (15/09/2026): a foto do fechamento** — decisão do Igor, prazo 01/10/2026 (quando
  setembro fecha, a primeira chance de fotografar um mês antes de ele ser pago).
  **Desenho aprovado:** resultado por gestor + composição conta a conta, sem série diária (medido com
  agosto: 3,1 kB só por gestor, 31,9 kB com a composição, 453,8 kB com a série; a foto real ficou em
  25 kB); clique humano; aviso na /gestores a partir do dia 1 com os dias até o mês sair da janela;
  a foto é o número principal, e a linha de divergência só aparece quando o cálculo de hoje difere,
  com a causa separada em régua, carteira ou dado — e o texto diz qual dos dois vale para quê,
  nunca que a foto está errada.
  · **Nasce como REGISTRO** (`VALOR_DA_FOTO_NOVA` em `lib/fotoFechamento.ts`). 📌 **Decisão pendente
    do Thiago:** se a foto vale para a bonificação. Se valer, muda essa linha e o texto de
    `textoDoValor` — nada mais.
  · Já pronta para valer: prévia antes de gravar (o servidor monta o conteúdo e só grava se a
    assinatura for a da prévia — sync novo ou troca de carteira no meio recusa), quem fechou (e-mail
    do token, gravado junto de "login compartilhado, não identifica a pessoa"), versões que nunca se
    sobrescrevem (`fotosFechamento/AAAA-MM_vN`, resumo em `sistema/fechamentos`) e refechamento com
    motivo de pelo menos 20 caracteres.
  · **O botão libera no dia 1**, por medição (15/09/2026): de um sync para o seguinte, nenhuma
    conversão mudou nos 30 dias mais recentes (83 contas) e o gasto mudou 0,03% só nos 7 mais
    recentes; depois dos 30 dias do sync, zero diferença em 1.730 dias-conta contra a Meta. Trava se
    o último dia do mês não está completo, se o mês não é comparável ou se alguma conta ativa parou
    de ser lida antes do fim. Julho e agosto de 2026 não podem ser fotografados.
  · Fechar exige estar em `FILA_EMAILS_PERMITIDOS`; a prévia abre para quem está logado.
  · Custo: a /gestores lê +1 documento por troca de mês (o resumo), +1 quando o mês tem foto.
  Conferido com casos plantados e dado real: a foto de agosto e de julho dá o mesmo selo,
  elegibilidade e variação da tela; liberação nos quatro casos; saída da janela (agosto 01/11,
  setembro 02/12); cada causa de divergência isolada, sem texto dizendo que a foto está errada;
  gravação v1, recusa 409 com prévia velha, recusa 400 sem motivo, v2 substituindo a v1 com a v1
  intacta — numa coleção de teste que FICOU no banco (`teste_fotosFechamento_1789486947166`, 3 docs).
  ⚠️ **Não exercitada ponta a ponta na tela:** exige login, e o primeiro mês fechável é setembro.
  📌 **Pendências:** (1) abaixo da foto, cards, slope e decomposição seguem no cálculo de hoje — ok
  por decisão do Igor (15/09/2026) enquanto o bloco disser isso, e ele diz; a Início ler a foto fica
  para depois; (2) ✅ a leitura de `FILA_EMAILS_PERMITIDOS`, copiada em três rotas, foi consolidada
  em `lib/listaDeEmails.ts` (15/09/2026), e a /api/ia usa a mesma leitura com a env dela; a coleção
  de teste da gravação foi apagada no mesmo dia; (3) remedição da mudança por dia de atraso
  contra a Meta em 16/09 (vigia em segundo plano), que confirma ou derruba a liberação no dia 1.
- 📌 **Depois dela: a saída/troca com data.** O painel reescreve mês fechado toda
  vez que uma conta sai ou troca de gestor, porque `montarPainel` soma cada conta inteira no
  gestor que ela tem hoje e as telas tiram a conta pausada de todos os meses. Não iniciada.
  ⚠️ **Ela não fecha o problema inteiro:** correção de regra e a janela de 95 dias continuam
  mudando mês fechado na tela. Só uma foto do fechamento faria da tela um registro — não
  existe, sem decisão. Ver CLAUDE.md, *MÊS PAGO NÃO É MÊS EXIBIDO*.
- 📌 **Decisão pendente (15/09/2026): `sync-comercial` e `sync-planilha` continuam INDEPENDENTES**
  do `sync-meta`, no agendamento próprio do GitHub. Encadear ao fim do `sync-meta` criaria um
  ponto único de falha entre fontes que não dependem uma da outra (Xmax, planilha e Meta).
- 📌 **Decisão (14/09/2026): não medir criativo ao vivo com 5+ conversões e gasto zero.** Era o
  único caso em que o CPL 0 abria o ranking de criativos do Dashboard em 1º, em dourado, e
  medir custa uma chamada à Meta por conta.
  ⚠️ **O cache de mês fechado NÃO mostra que o caso não existe — ele não consegue mostrar:**
  `buscarCriativosPeriodo` descarta anúncio sem gasto antes de gravar. O cache só prova que o
  melhor/pior dos meses já gravados na /gestores não muda.
  **O que autoriza não medir é outro motivo:** desde `96fcbee` a tela trata o caso certo se ele
  vier (fim da lista, sem posição, com o motivo escrito). Medir diria QUANTOS, não se está certo.
- **Login (fase 2)**: Firebase Auth + leitura por usuário; liberar leitura na
  `firestore.rules` e usar `lib/firebaseClient.ts`.

Já implementado: pull do CPL semanal (atual vs ~2 meses atrás) e seletor de gestor.

## Identidade

⚠️ **A paleta NÃO é repetida aqui.** A fonte única é `lib/brand.ts` (`TEMA`), espelhada em
`tailwind.config.ts` para uso em classes. Esta seção já listou três hex que deixaram de
existir na migração do tema escuro e ninguém percebeu — README que repete valor de cor
envelhece calado. Para conferir a paleta viva: `node scripts/audita-tema.js`.

### Marca 2026 — migração em andamento

A agência entregou o Manual de Marca 2026. A migração é feita em commits numerados, com o
`audita-tema.js` rodando entre eles:

```
1   fontes (Space Grotesk + Inconsolata)        FEITO
1b  correção de peso (face 600 + b/strong)      FEITO
1c  calibração tipográfica                      FEITO
2   flip atômico da paleta                      FEITO
3   Shell, sidebar, login                       FEITO
4   gráficos e rampa categórica                 FEITO
5   Dashboard                                   FEITO
6   Início (+ remoção dos chips órfãos)         FEITO
7   Comercial                                   FEITO
7b  Gestores                                    FEITO
8   Carteira, Orientações, Fila, Recuperação    FEITO
9   logo                                        🔶 BLOQUEADO — SVGs não chegaram
10  auditoria final                             FEITO
```

### Retrospectiva — o que a migração ensinou

13 commits, 41 pares de contraste declarados, **6 reprovações**. Todas encontradas por
LEITURA; nenhuma por ferramenta. As conferências novas nasceram DEPOIS de cada defeito, e
existem para o próximo não depender de alguém olhar.

#### As cinco famílias de cegueira

Nenhuma sai de busca por `#` ou `rgba(`, e as cinco passaram por conferência verde antes
de alguém medir à mão:

| família | o caso |
|---|---|
| **superfície errada** | `bordaForte` declarado sobre `card` (3,31) e pintado sobre `navHover` (2,97) |
| **par não medido** | `texto` e `muted` passavam sozinhos e a distância entre eles caiu 37% |
| **tinta transformada** | `dadoNeutro` 3,31 puro, 2,91 a 90% de opacidade |
| **consumo por classe** | a varredura de órfãos acusou `placeholder` e `navHover`, que são usados por classe Tailwind |
| **valor em variável** | `opacity={op}` no `SlopeCpl` — a busca procurava literal |

🔑 **O formato é sempre o mesmo:** *conferência que exige duas informações num formato só
enxerga apenas o código que as escreve assim.* Antes de escrever qualquer conferência,
pergunte **em quantos formatos o código pode escrever a mesma coisa**.

#### A métrica que previu onde estava o defeito

| tela | linhas | superfícies | empilhamento | achados |
|---|---|---|---|---|
| Início | 480 | 1 | — | **0** |
| Dashboard | 1.400 | 12 | sim | **2** |
| Fila de Contas | 607 | 9 | plano | **0** |
| Carteira | 272 | 9 | **três andares** | **2** |

**Não é quantas superfícies, é quantas se SOBREPÕEM.** A Fila tem o mesmo número de
superfícies que a Carteira e menos da metade dos achados — porque são oito avisos lado a
lado, não empilhados. Para planejar a próxima: **conte os níveis de aninhamento, não os
tokens de fundo.**

#### Quatro réguas que ficaram

**Empilhamento além de um nível se resolve por BORDA, não por superfície.** A escada de
elevação inteira cabe entre 1,03 e 1,27 — no escuro nenhuma elevação chega a 3:1. `card`
sobre `card` em 1,00:1 não é defeito quando há borda medida (3,31:1). Criar um
`cardEncaixado` prometeria um nível abaixo que a paleta não pode entregar.

**A régua do esmaecimento é a DURAÇÃO, não o número.** Transitório com gesto reversível é
FOCO (sem piso); persistente sem o gesto é DADO ESCONDIDO (piso 3:1). Se o realce do
`SlopeCpl` virar clique-para-fixar em vez de hover, ele muda de categoria e o piso passa a
valer. Não é o 0,25 que decide; é o gesto.

**Nome POSICIONAL bloqueia reuso legítimo.** `navBordaForte` nasceu com nome de lugar e o
segundo consumidor apareceu fora da sidebar em dois dias; o terceiro, no dia seguinte. A
renomeação para `bordaForteElevada` não foi cosmética — foi o que fez a terceira aparição
custar zero em vez de exigir um terceiro token duplicado.

**O primeiro suspeito de uma divergência é a RÉGUA, não o medido.** Duas vezes num dia a
medição acusou o que não existia (o balão media `dadoNeutro` quando usa `muted`; a
varredura de pares não via fundo herdado de ancestral). ⚠️ E o custo é **assimétrico**: um
falso positivo vira trabalho inventado, um falso NEGATIVO vira defeito que ninguém procura
mais.

#### O que a medição derrubou

Três decisões já aprovadas caíram porque o número disse o contrário:

- **bege como cor de texto** — a cor de maior proporção do manual (35%) achatava a
  distância `texto`↔`muted` de 2,56 para 1,62. Virou branco.
- **rampa de 4 séries** — as quatro passavam contra o card e o par amarelo × bege dava
  **1,08:1** entre si. Virou 3.
- **`serie2` na linha de leads do HeroChart** — consertava um par (1,35 → 1,62) e quebrava
  outro (2,72 → 1,24). Ficou como estava.

#### Números finais

```
41 pares declarados     19 espelhos brand.ts ↔ tailwind
 3 séries categóricas    0 cor chumbada     0 hover morto
 6 reprovações corrigidas               3 pendências nomeadas
```

### Divergências e correções registradas

**18/08/2026 — `#530263` no SVG contra `#530163` no manual.** O `LOGO_E_SIMBOLO.svg`
entregue pela agência traz o roxo como `#530263`; o manual escrito diz `#530163`. Um
dígito. **Vale o do MANUAL** (`#530163`) até a agência responder qual dos dois está errado.
Se for o manual, o token muda num lugar só; se for o arquivo, a agência reexporta. A
pergunta está com o Igor.

**18/08/2026 — o commit 1 deslocou 76 lugares de peso 600 para 700, por omissão de face.**
O commit 1 (`5f3c5db`) carregou Space Grotesk 400/500/700, deixando o 600 "de fora até
alguém medir". O `next/font` gera faces **discretas** (verificado no CSS servido: três
`@font-face`, não uma faixa variável), e pela regra de casamento do CSS um peso pedido
acima de 500 procura primeiro **para cima** — então os 74 `font-semibold` e os 2
`fontWeight: 600` do `SlopeCpl` passaram a renderizar 700. Sem erro e sem aviso: o painel
ficou mais pesado do que estava escrito no código, e a comparação de peso feita na
/tipografia olhava um app que não renderizava o que estava escrito.

O commit **1b** reverteu carregando a face 600. Nenhuma classe foi tocada — elas voltaram a
renderizar 600 sozinhas, que é o que sempre estiveram escritas.

**A lição, que vale além desta migração:** não carregar uma face não deixa o peso de fora,
deixa o **navegador escolher outro**. Omitir peso só é seguro DEPOIS de trocar quem o usa.

**18/08/2026 — ênfase em prosa ganhou peso explícito (500).** Os 88 `<b>`/`<strong>`
herdavam o `bolder` do navegador (700) em prosa de 11 a 12,5px, incluindo 41 nas frases da
camada de honestidade da /comercial. Nunca foi escolha de ninguém: era o que sobrava por
omissão. Regra única em `app/globals.css`, com o porquê e com a saída documentada — se 500
não destacar o bastante, a resposta é **contraste**, nunca subir o peso.

**18/08/2026 — a calibração tipográfica foi MEDIDA e confirmou o existente (commit 1c).**
Feita na /tipografia contra o app já corrigido pelo 1b — ou seja, contra uma tela que
renderiza o que está escrito no código, e não o 700 que o commit 1 estava produzindo por
omissão de face. Resultado:

| o que foi medido | decisão |
|---|---|
| pesos carregados | mantém **400 / 500 / 600 / 700** |
| Poppins 700 → Space Grotesk | **700** |
| Poppins 600 (grande e pequeno) → | **600** |
| Poppins 500 → | **500** |
| tracking dos rótulos em caps | mantém **.13em** |
| Inconsolata vs Space Grotesk no mesmo corpo | **sem ajuste** — nenhum `font-size-adjust`, nenhum multiplicador |

⚠️ **É registro de DECISÃO MEDIDA, não de mudança.** Nenhum peso, tracking, tamanho ou
família foi alterado no 1c — o diff dele é comentário e este README. A medição vale
justamente por ter confirmado o existente: sem ela, "não mudou nada" seria indistinguível
de "ninguém olhou".

A única coisa que o 1c decidiu de novo foi o **terceiro caso da régua tipográfica**, que a
versão anterior errava. Ela dizia que KPI era coluna; KPI não é coluna, é um número solto
num card. A régua completa mora em `app/layout.tsx`, junto da declaração da Inconsolata:

```
1. número em COLUNA        -> Inconsolata      (vizinho vertical; alinhar É a informação)
2. número em FRASE         -> Space Grotesk    (vizinho é texto; sem troca no meio da linha)
3. número SOZINHO em card  -> Space Grotesk    (sem vizinho; o card fala a língua do título)
```

A aplicação da régua acontece nos commits de tela (3 a 8), com a paleta já nova.
