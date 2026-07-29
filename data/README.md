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

Conta **nova** também nasce sem histórico para o `mesclarDias` acumular: sincronize-a
com janela ampla (`/api/sync-meta?accountId=act_...&dias=117`), senão ela entra com
apenas 30 dias e aparece truncada em períodos maiores, sem aviso.
