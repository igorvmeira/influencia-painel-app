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
1   fontes (Space Grotesk + Inconsolata)        FEITO  5f3c5db
1b  correção de peso (face 600 + b/strong)      FEITO  este commit
1c  calibração tipográfica                      pendente — decisão do Igor
2   flip atômico da paleta                      pendente
3-8 tela a tela                                 pendente
9   logo                                        pendente (SVGs recebidos)
10  auditoria final (a /tipografia e a Poppins saem aqui)
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
