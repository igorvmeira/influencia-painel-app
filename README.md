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

## Próximos passos
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
