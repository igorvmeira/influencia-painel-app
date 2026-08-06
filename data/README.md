# `data/` — fontes de carga do painel

## ESCOPO DO PAINEL: apenas Meta Ads

O painel cobre **exclusivamente Meta Ads** (Facebook/Instagram). Todo número da tela
vem da Marketing API do Meta, via `/api/sync-meta`.

**Clientes que anunciam só no Google Ads não aparecem — e isso é por definição, não
é conta faltando.** Não cadastre esses clientes em `contas.json`: eles nunca teriam
dado, apareceriam zerados na tela e o gestor perderia tempo investigando um vazio.

Clientes só-Google conhecidos (não cadastrar):

| Cliente | Situação |
|---|---|
| LAVE MAIS EXPRESS | só Google Ads — confirmado com a agência em 29/07/2026 |
| CHRISTIANE ROBINE | só Google Ads |

Se um dia o painel passar a cobrir Google Ads, isto vira um campo de plataforma por
conta (e uma segunda integração de sync), não uma linha a mais nesta lista.

## `contas.json` — o de-para oficial da carteira

Lista oficial das contas de anúncio. É a **fonte da verdade** consumida por
`/api/import-contas`, que grava na coleção `contas` do Firestore.

Campos: `accountId` (chave única, formato `act_...`), `cliente`, `gestor`, `tipo`,
`nicho`, `pausado`.

Regras que o import respeita:

- **Join sempre por `accountId`**, nunca por nome — nomes de cliente se repetem
  (há pares como CONSTRUMINAS e NORTELINE com duas contas cada).
- **Não destrutivo**: conta que sai da lista NÃO é apagada; vira "órfã" no relatório
  e o painel a mantém. Para tirar de operação, use `pausado: true`.
- **Idempotente**: rodar de novo faz merge, não duplica.
- **Prévia por padrão**; só grava com `&aplicar=1`.
- Conta cujo gestor foi editado pela tela `/carteira` recebe carimbo
  (`gestorEditadoEm`) e o import passa a **pular o campo `gestor`** dela. Para voltar
  a seguir este arquivo, apague `gestorEditadoEm` e `gestorEditadoPor` no Console do
  Firebase.

## Antes de cadastrar uma conta nova

Confirme que o **token enxerga** a conta (`/api/diagnostico-contas` lista as que o
Meta expõe). Conta que o token não vê nunca sincroniza: apareceria na tela e ficaria
permanentemente zerada. Nesses casos, o caminho é pedir o compartilhamento via
parceria de Business Manager — não cadastrar e esperar.

Conta **nova** nasce sem histórico para o `mesclarDias` acumular. O sync já resolve
isso sozinho: conta sem documento em `metricasAgregadas` é detectada como nova e
recebe a **janela cheia** (`RETENCAO_DIAS`) automaticamente.

```
/api/sync-meta?key=<CRON_SECRET>&accountId=act_1,act_2,act_3
```

**Não passe `?dias`.** (A instrução anterior aqui mandava usar `&dias=117`; ficou
obsoleta.) Com `dias` explícito, dois mecanismos são desligados de uma vez: a janela
cheia automática e — pior — o teto de `MAX_NOVAS_POR_CHAMADA`, que existe para muitas
contas novas não estourarem o tempo da função puxando ~95 dias cada.

Com o teto ativo, entrando **N contas novas de uma vez, o sync leva `ceil(N/3)`
chamadas**: as três primeiras sincronizam com janela cheia e as demais são **adiadas**
(puladas por inteiro, nunca com janela curta — sincronizar com 30 criaria o agregado e
travaria a conta como truncada em definitivo). Repita a mesma chamada até
`adiadas` voltar vazio, conferindo `novasComJanelaCheia` no retorno.

## Pendências de cadastro

Contas identificadas na conciliação de 06/08/2026 que **não** foram cadastradas, com
o motivo e o gatilho para revisar:

| Conta | accountId | Por que não entrou | Gatilho |
|---|---|---|---|
| NEXA TELECOM | `act_3943992782574535` | `account_status` UNSETTLED na Meta (pendência de cobrança). Entraria zerada e pareceria bug para o gestor. | Cadastrar quando a agência regularizar a cobrança e o status virar ACTIVE. |
| TRAJETO | `act_2622092654889646` | Cadastrada e **pausada**. Conta criada em 17/07/2026, `account_status` ACTIVE, mas **gasto zero em 120 dias** — nunca veiculou. Ativa, entraria zerada e puxaria o CPL de carteira do gestor para baixo. Está também com **nicho vazio**: a planilha diz "Provedor" e a Meta chama a conta de "CA 01 - TRAJETO MÓVEIS". | **Dois gatilhos independentes.** (1) Reativar (`pausado: false` + `gestor: VINÍCIUS`) quando começar a veicular — confira por **gasto > 0 no período**, não por `account_status`. (2) Preencher o nicho quando a agência disser o ramo. |
