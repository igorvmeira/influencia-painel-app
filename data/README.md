# `data/` — fontes de carga do painel

## Arquivos

| arquivo | o que é |
|---|---|
| `contas.json` | de-para oficial da carteira de tráfego (ver abaixo) |
| `orientacoes-seed.json` | carga inicial das orientações por conta |
| `xmax-api.yaml` | spec OpenAPI do **Xmax**, o CRM do comercial — insumo do futuro painel comercial |
| `xmax-integracao.md` | levantamento e plano dessa integração; **nada implementado ainda** |

### Xmax — correção de expectativa sobre o retroativo

Foi dito à agência que "não há funil retroativo". **Está forte demais.** As
oportunidades carregam `createdAt`, `closedat` e `stagebegintime`, então **leads por
mês, fechamentos por mês e MRR por mês são calculáveis para trás**, sem depender de
nenhuma automação.

O que só começa a existir quando as automações estiverem apontando para o nosso
endpoint é o **caminho do lead pelas etapas** — a conversão etapa a etapa e o tempo em
cada etapa anterior à atual. A API guarda só a etapa atual e desde quando ela começou.

Detalhes, riscos e o plano do endpoint de diagnóstico em
[`xmax-integracao.md`](./xmax-integracao.md).

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
| JETFIBER | JETFIBER | `act_1004781690939605` | **JETSUCESSO** |

Toda conciliação por nome vai marcá-las como divergência. São estes cinco pares,
já investigados e confirmados por `accountId` e pelo nome da Meta em 06–12/08/2026.

Nos quatro primeiros o painel usa um nome e a planilha outro. Na JETFIBER os dois
concordam — quem diverge é a **Meta**, que chama a conta de "JETSUCESSO". Vale o
padrão da casa: o campo `cliente` guarda o **nome comercial**, não o rótulo da conta
de anúncio.
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

### A exceção: saída confirmada

Veiculação é o teste **padrão**. **EXCEÇÃO: saída CONFIRMADA pela agência pausa a
conta mesmo com gasto** — o que ela gasta depois não é mais trabalho da agência, e
manter isso no CPL de carteira do gestor credita a ele um resultado que não é dele.
O motivo fica registrado ao lado, sempre.

Sem esse registro a próxima pessoa lê "veicula → ativa", vê uma conta pausada
gastando e "corrige" achando que é erro. Por isso os casos concretos ficam escritos:

| conta | estado | por quê |
|---|---|---|
| ZAY SUSHI `act_1670450540519360` | pausada | zero em 120 dias, embora a agência liste o cliente como ativo (07/08/2026) |
| GUARÁ NET `act_2030710527729327` | pausada | idem — reconferido em 14/08: segue **nenhum dia com gasto** em 120 dias |
| TRAJETO `act_2622092654889646` | pausada | criada em 17/07, `ACTIVE`, **nunca veiculou** |
| DRA. ANA PAULA `act_2057134961683901` | pausada | cadastrada já pausada: último gasto em **02/05/2026**, zero há 104 dias |
| **JS FIBRA** `act_1321889532494546` | **pausada pela EXCEÇÃO** | a agência **confirmou a saída em 14/08/2026** e a conta **continuava gastando** (R$ 2.112,17 nos últimos 30 dias, com registro do próprio dia 14/08). Não é erro: é a exceção acima. |

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

## A tela `/fila-contas` — e por que este arquivo pode não ser mais a lista inteira

Desde **16/08/2026** existe uma segunda porta de entrada para a carteira: a tela
**Contas Novas** (`/fila-contas`). O `sync-meta` lista o que o token expõe, tira o que
já está cadastrado, sonda moeda/status/gasto do que sobra e grava em
`sistema/filaContas`. **Uma pessoa decide; nada é cadastrado automaticamente.**

O cadastro pela tela grava **direto no Firestore**, marcado com
`origemCadastro: "tela"`, `cadastradaPor` e `cadastradaEm`.

> ⚠️ **Consequência: `contas.json` deixa de ser necessariamente a lista completa.**
> Ele continua sendo a fonte que o import gerencia, mas passa a ser *uma* fonte, não
> *a* fonte. A divergência é **declarada, nunca silenciosa**:
>
> - o relatório do `/api/import-contas` tem uma seção **`cadastradasPelaTela` que
>   aparece SEMPRE**, inclusive dizendo "zero" — é ela que ensina que a divergência
>   é possível antes de a primeira existir;
> - conta com `origemCadastro: "tela"` **não é listada como órfã** (órfã é doc que
>   ninguém declarou; estas têm autor e data);
> - a tela tem um botão **"copiar linha do JSON"** para reconciliar quando se quiser
>   o git como histórico da carteira. Colada a linha e rodado o import, o campo
>   `noJson` daquela conta vira `true` no relatório.

Acesso: env **`FILA_EMAILS_PERMITIDOS`** (falha fechado — vazia, ninguém entra). Mesma
trava temporária do `IA_EMAILS_PERMITIDOS`, pelo mesmo motivo: as rotas checam se o
usuário está logado, não o papel dele. Sai quando o sistema de papéis entrar.

### ⚠️ Conta REMOVIDA volta a aparecer como novidade — e a fila agora avisa

A fila lista o que o token enxerga e não está no de-para. **Conta que já esteve na
carteira e foi removida cai exatamente nesse filtro**, e até 16/08/2026 aparecia
indistinguível de uma conta nunca vista. Quem recadastrasse desfaria uma decisão sem
nunca saber que houve decisão.

Caso real: **BAUMAN CA 02** (`act_2060095867813465`, gestor LUCAS) saiu do
`contas.json` em **18/07/2026** (commit `13a44e7`) e apareceu na primeira fila como
candidata nova. Está registrada em `sistema/contasIgnoradas` com o motivo escrito.

Como a fila detecta: `limitesConta` e `metricasAgregadas` só são escritos pelo sync
para contas do de-para, então **doc lá para conta fora do de-para é sobra de quando
ela esteve**. Custo: ≤2 leituras por candidata no sync, zero na tela. O campo
`ultimaSincronizacao` é **piso, não data de remoção** — a conta saiu em algum momento
depois dela.

> 🛑 **Não limpe os docs órfãos dessas duas coleções.**
> `limitesConta/act_2060095867813465` é hoje a única evidência em runtime de que a
> BAUMAN esteve na carteira, e é ele que acende o aviso. Apagar destrói o sinal.
> Para poder limpar, a remoção de conta precisa antes gravar uma **lápide própria**
> (ex.: `sistema/contasRemovidas`, com quem removeu e quando) — aí o rastro deixa de
> depender de sobra, a data vira exata, e os órfãos saem sem perder nada.

### ⚠️ Fila vazia NÃO quer dizer "não há contas novas"

A descoberta usa `me/adaccounts`, e **essa listagem é comprovadamente incompleta**: em
15/08/2026, **8 contas somando R$ 45.943,25 em 120 dias** respondiam à consulta direta
e não apareciam nela — vinham de parceria de Business Manager. Medido de novo em
16/08/2026: o token lista **111** contas, e **9 das 117 cadastradas** estão fora dessa
listagem.

Para essas o caminho continua sendo o de sempre: pedir o `accountId` **em texto**
(nunca transcrever de print) e sondar por consulta direta —
`/api/diagnostico-contas?accountId=act_1,act_2`. Este aviso está na própria tela, no
rodapé, e é a parte dela que não pode ser cortada.

## 🛑 PENDÊNCIA DE DECISÃO: 6,8% do gasto está em conjuntos que não buscam lead

**Medido em 16/08/2026**, janela de 06 a 12/08 (7 dias assentados), com `level=adset`
na carteira inteira (115 contas legíveis):

| conjuntos que otimizam para | gasto 7d | conversas geradas |
|---|---|---|
| IMPRESSIONS | R$ 2.173 | 21 |
| PROFILE_VISIT | R$ 673 | 2 |
| VISIT_INSTAGRAM_PROFILE | R$ 654 | 1 |
| REACH | R$ 56 | 0 |
| **total** | **R$ 3.556** | **24** |

São **6,8% do gasto da carteira** em conjuntos que nunca tentaram gerar lead —
alcance, visita a perfil, impressão. Esse dinheiro está hoje no **denominador do CPL**,
invisível, puxando o número para cima:

- CPL da carteira como o painel calcula hoje: **R$ 13,22**
- Excluindo os conjuntos que não buscam lead: **R$ 12,39**

Diferença de **6,3%** no número que a agência usa para avaliar gestor.

> ⚠️ **NÃO MUDE O CÁLCULO DO CPL POR CONTA DISSO.** Decisão do Igor em 16/08/2026: a
> /gestores está aprovada e embasa bonificação. Trocar a régua sem alinhar com o Roberto
> mudaria a nota de todos os gestores de um dia para o outro, e a mudança pareceria uma
> correção técnica quando é uma mudança de critério.
>
> Fica registrado como **pendência de decisão**, não como bug. O gatilho é a conversa
> com a agência; o Igor vai levar o número.

## Lição de método: eu pedi a coisa errada e a medição mostrou

Registro porque a lição é sobre COMO investigar, não sobre este dado.

O pedido foi migrar o sync para `level=adset` **para consertar a separação de
conversão** em conta mista — a mesma conta rodando campanha de mensagem e de
formulário. A premissa era que o painel "soma tudo junto".

**Ele não soma.** `leadsForm` e `convWhats` já são campos separados, derivados do
`action_type` do evento — e essa separação é **exata**, porque vem do próprio evento.

E agrupar por objetivo seria **menos** preciso, não mais. Medido nas 1.573 linhas
conjunto-dia da janela:

- `campaign.objective`: `OUTCOME_ENGAGEMENT` produziu **911 linhas de WhatsApp e 3 de
  formulário**. WhatsApp aparece sob quatro objetivos diferentes (ENGAGEMENT, SALES,
  LINK_CLICKS, AWARENESS) — quem lesse o rótulo concluiria que a conta faz engajamento.
- `adset.optimization_goal`: melhor, e ainda ambíguo. `REPLIES` → 940 WhatsApp + 1
  formulário; `QUALITY_LEAD` → 25 formulário + 1 WhatsApp (**14,8% do volume dele**).
- **43 linhas conjunto-dia tiveram AS DUAS famílias no mesmo conjunto no mesmo dia.**
  Nenhum rótulo separa essas.

**O que a migração compra é outra coisa, e mais valiosa: a ATRIBUIÇÃO DE CUSTO.** Hoje
sabe-se que a PRO3 ACADEMIA teve 25 formulários e 695 WhatsApp, e **não** quanto do
gasto foi para cada um. Com a quebra por conjunto sai **CPL por família**, que era
impossível. São 17 contas nessa situação.

**A generalização:** antes de implementar o conserto pedido, medir se o defeito é o
descrito. Aqui o dado separado já existia e era mais preciso que a solução proposta —
e o problema real (custo sem atribuição) estava ao lado, valia mais, e ninguém tinha
pedido. **Confirmar o diagnóstico é parte da tarefa, não etapa opcional antes dela.**

## Pendências de cadastro

Contas identificadas na conciliação de 06/08/2026 que **não** foram cadastradas, com
o motivo e o gatilho para revisar:

| Conta | accountId | Por que não entrou | Gatilho |
|---|---|---|---|
| NEXA TELECOM | `act_3943992782574535` | **Dois motivos independentes.** (1) **Bloqueio da Meta**, confirmado pela agência — `account_status` 3 (UNSETTLED) e veiculação interrompida em 03/08. (2) **Moeda ARS** (fuso Buenos Aires): o painel não converte moeda, então ela contaminaria totais, CPL e ranking. ⚠ Não é o caso de "entraria zerada" — a conta tem 20 dias de veiculação; o problema é a escala dos números. | Só cadastrar quando os **dois** forem resolvidos: bloqueio liberado **e** decisão sobre como o painel trata moeda estrangeira (hoje: não trata). |
| SOLUÇÃO (2ª conta) | `act_974158976372768` | ⚠ **Os números da SOLUÇÃO no painel estão INCOMPLETOS.** A agência confirmou (14/08/2026) que o cliente roda em **duas** contas; só a `act_358502495857953` ("Solução Empresas") é acessível e foi cadastrada. Esta segue **bloqueada** (`#200 ... NOT grant ads_management`), então o gasto e as conversões dela **não entram no painel** — e nada na tela indica que falta metade. Ao ler os números desse cliente, some mentalmente o que não está aqui. | Cadastrar quando sair a parceria de Business Manager. Aí os números do cliente passam a ser completos. |
| DRA. ANA PAULA | `act_2057134961683901` | Cadastrada já **pausada** (regra `pausado` = não veicula): último gasto em **02/05/2026**, zero nos últimos 104 dias. Entrou pausada para não diluir o CPL de carteira do ISMAIL com uma conta parada. | Reativar quando voltar a veicular — `pausado: false` **e `gestor: "ISMAIL"`**, que é a dona. ⚠ Como ela nasceu pausada, o `gestorHistorico` NÃO tem o ISMAIL registrado; este é o único lugar onde a titularidade está escrita. |
| TRAJETO | `act_2622092654889646` | Cadastrada e **pausada**. Conta criada em 17/07/2026, `account_status` ACTIVE, mas **gasto zero em 120 dias** — nunca veiculou. Ativa, entraria zerada e puxaria o CPL de carteira do gestor para baixo. Está também com **nicho vazio**: a planilha diz "Provedor" e a Meta chama a conta de "CA 01 - TRAJETO MÓVEIS". | **Dois gatilhos independentes.** (1) Reativar (`pausado: false` + `gestor: VINÍCIUS`) quando começar a veicular — confira por **gasto > 0 no período**, não por `account_status`. (2) Preencher o nicho quando a agência disser o ramo. |
