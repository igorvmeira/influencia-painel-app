# Painel de Tráfego — Influência 4.0

Painel que puxa os resultados do Meta Ads por gestor e por cliente (gasto, leads de
formulário B2B, conversas de WhatsApp B2C e CPL), com comparação contra o período
anterior. Frontend em Next.js (Vercel), dados no Firebase Firestore, atualização
automática via Vercel Cron.

Sobe e renderiza com dados de exemplo antes de plugar o Meta — dá pra fazer o deploy
primeiro e ligar o token depois.

## Stack
- Next.js 14 (App Router) na Vercel
- Firebase Firestore (de-para de contas + números processados)
- Vercel Cron chamando `/api/sync-meta` (Meta Marketing API → Firestore)

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
4. **Ligar o Meta:** para puxar os dados, abra no navegador (sem terminal):
   `https://SEU-APP.vercel.app/api/sync-meta?key=SEU_CRON_SECRET`
   No plano grátis isso é manual. Para rodar sozinho todo dia, veja "Automação" abaixo.

Rodar local (`npm run dev`) é opcional e não faz parte do fluxo online acima.

### Sobre a chave do Firebase (erro "Invalid PEM")
Esse erro vem da `FIREBASE_PRIVATE_KEY` com quebras de linha erradas. O código já
normaliza, então cole a `private_key` exatamente como aparece no `.json`. Se ainda
reclamar, use `FIREBASE_SERVICE_ACCOUNT_BASE64` (o JSON inteiro em base64, numa linha).

## Automação (rodar sozinho) — requer plano Vercel Pro
Por padrão este projeto vem compatível com o plano grátis (Hobby): `vercel.json` vazio
(`{}`) e `maxDuration = 60` na rota. Nesse modo, o sync é disparado manualmente pelo
link `?key=`.

Para o sync rodar sozinho todo dia, faça o upgrade para o Pro e então:
1. No `vercel.json`, coloque:
   `{ "crons": [ { "path": "/api/sync-meta", "schedule": "0 9 * * *" } ] }`
2. Em `app/api/sync-meta/route.ts`, troque `maxDuration = 60` por `maxDuration = 300`
   (o Hobby limita a 60s; o Pro permite 300s, necessário para o pull semanal por gestor).

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
