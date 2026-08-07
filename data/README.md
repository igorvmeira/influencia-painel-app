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

### Nomes que NÃO batem com a planilha — de propósito

Quatro contas têm nome diferente do que a planilha de Monitoramento usa. A agência
pediu para **não alinhar** ("os nomes não importam, nós sabemos quem são"), então
**isto não é pendência e não deve ser 'corrigido' na próxima conciliação**:

| no painel | na planilha | accountId | nome na Meta (desempate) |
|---|---|---|---|
| TAC NET | TAC TELECOM | `act_1145473760827134` | CA 01 - Tac Net |
| Hotel Oscar | OLT HOTEL | `act_1389467714612017` | CA 01 - REDE OLT HOTÉIS + INFLUÊNCIA |
| Líder | LÍDER ASSESSORIA | `act_1666070498074676` | CA O1 \| Líder Telecom |
| IFALEI | IFALEI - ZIEVO | `act_640604454939758` | CA 01 \| iFalei |

Toda conciliação por nome vai marcá-las como divergência. São estes quatro pares,
já investigados e confirmados por `accountId` e pelo nome da Meta em 06/08/2026.
- **Não destrutivo**: conta que sai da lista NÃO é apagada; vira "órfã" no relatório
  e o painel a mantém. Para tirar de operação, use `pausado: true`.
- **Idempotente**: rodar de novo faz merge, não duplica.
- **Prévia por padrão**; só grava com `&aplicar=1`.
- Conta cujo gestor foi editado pela tela `/carteira` recebe carimbo
  (`gestorEditadoEm`) e o import passa a **pular o campo `gestor`** dela. Para voltar
  a seguir este arquivo, apague `gestorEditadoEm` e `gestorEditadoPor` no Console do
  Firebase.

## O que `pausado` significa (regra da carteira)

**`pausado` = a conta NÃO VEICULA.** Não é "contrato encerrado".

A carteira do painel responde **"quem está rodando"**. Quem é **cliente** é a planilha
de Monitoramento da agência. São perguntas diferentes, e misturá-las quebra os números:

- Cliente com contrato ativo mas **sem veiculação** fica `pausado: true`. Ativa, ela
  entraria zerada, contaria na carteira do gestor e puxaria o **CPL de carteira** dele
  para baixo sem representar trabalho nenhum.
- Conta que a agência diz que **saiu** mas **ainda está gastando** fica ATIVA. Pausá-la
  tiraria gasto real dos totais da agência e da carteira do gestor.

O teste é sempre **gasto > 0 no período**, consultado dia a dia — nunca
`account_status`, que descreve o cadastro e não o comportamento.

Casos reais que fixaram a regra (06–07/08/2026): ZAY SUSHI e GUARÁ NET seguem pausadas
apesar de a agência as listar como clientes ativos (zero em 120 dias); JS FIBRA segue
ativa apesar de a agência a listar como saída (R$ 2.460,62 nos últimos 30 dias).

## Antes de cadastrar uma conta nova

Duas conferências, não uma:

**1. O token enxerga?** (`/api/diagnostico-contas` lista as que o Meta expõe.) Conta que
o token não vê nunca sincroniza: apareceria na tela e ficaria permanentemente zerada.
Nesses casos, o caminho é pedir o compartilhamento via parceria de Business Manager —
não cadastrar e esperar.

**2. Qual é a MOEDA da conta?** Consulte `?fields=currency` na Graph API.

> O painel **soma `gasto` cru e formata tudo com `brl()`** (`lib/format.ts`). **Não há
> conversão de moeda em lugar nenhum do código.** Uma conta em moeda estrangeira
> injetaria valores de outra escala no total, no CPL e no ranking de gestores — em
> silêncio, sem nada na tela indicando o problema.

Auditadas em 07/08/2026: das 103 cadastradas, **102 são BRL** e 1 está sem acesso
(LINK 10, já pausada, não soma nada). A NEXA TELECOM (ARS) teria sido a primeira a
contaminar — ver a tabela de pendências.

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
| NEXA TELECOM | `act_3943992782574535` | **Dois motivos independentes.** (1) **Bloqueio da Meta**, confirmado pela agência — `account_status` 3 (UNSETTLED) e veiculação interrompida em 03/08. (2) **Moeda ARS** (fuso Buenos Aires): o painel não converte moeda, então ela contaminaria totais, CPL e ranking. ⚠ Não é o caso de "entraria zerada" — a conta tem 20 dias de veiculação; o problema é a escala dos números. | Só cadastrar quando os **dois** forem resolvidos: bloqueio liberado **e** decisão sobre como o painel trata moeda estrangeira (hoje: não trata). |
| TRAJETO | `act_2622092654889646` | Cadastrada e **pausada**. Conta criada em 17/07/2026, `account_status` ACTIVE, mas **gasto zero em 120 dias** — nunca veiculou. Ativa, entraria zerada e puxaria o CPL de carteira do gestor para baixo. Está também com **nicho vazio**: a planilha diz "Provedor" e a Meta chama a conta de "CA 01 - TRAJETO MÓVEIS". | **Dois gatilhos independentes.** (1) Reativar (`pausado: false` + `gestor: VINÍCIUS`) quando começar a veicular — confira por **gasto > 0 no período**, não por `account_status`. (2) Preencher o nicho quando a agência disser o ramo. |
