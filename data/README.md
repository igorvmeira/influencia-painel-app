# `data/` — fontes de carga do painel

## Arquivos

| arquivo | o que é |
|---|---|
| `contas.json` | de-para oficial da carteira de tráfego (ver abaixo) |
| `orientacoes-seed.json` | carga inicial das orientações por conta |
| `xmax-api.yaml` | spec OpenAPI do **Xmax**, o CRM do comercial — insumo do futuro painel comercial |
| `xmax-integracao.md` | levantamento e plano dessa integração; **nada implementado ainda** |
| `perguntas-agencia.md` | fila de perguntas que só a agência responde e que travam feature |
| `bi-comercial-inventario.md` | inventário do Power BI da agência: estrutura, réguas e o que não é comparável |
| `grafana-referencia-inspecao.md` | inspeção da instância de referência — **não é um dashboard de Grafana** |

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
/api/sync-meta?accountId=act_1,act_2,act_3
```

⚠️ O segredo vai no header `Authorization: Bearer`, não na URL — ver "Como chamar as
rotas internas" no README da raiz. O `?key=` também funciona, mas vaza no histórico e
**quebra em silêncio** se o segredo tiver `+`, `/`, `=`, `&` ou `#`.

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
invisível, puxando o número para cima.

> 🛑 **O IMPACTO DE ~~6,3%~~ NÃO É O NÚMERO FINAL — não use este parágrafo para decidir.**
>
> ~~CPL R$ 13,22 → R$ 12,39, diferença de 6,3%.~~
>
> Aquele cálculo tinha **dois defeitos de recorte**, os dois do mesmo tipo:
> 1. **janela de 7 dias** (06 a 12/08), não a retida inteira;
> 2. **lista de grupos incompleta** — excluía só 4 grupos, e a régua final do Roberto exclui
>    10. Entre os que a amostra curta não mostrou estava o `OFFSITE_CONVERSIONS`, que ENTRA
>    no CPL e traz muita conversão junto.
>
> O impacto pela régua final foi medido em 17/08/2026 na carteira toda (78 contas ativas,
> 6.165 dia-conta, 15/05 a 16/08) e é **muito menor**. **O número está apurado e ainda NÃO
> foi registrado aqui de propósito:** ele muda se a decisão sobre o caso do CPL indefinido
> mexer na régua, e este número já foi corrigido duas vezes para quem o leva à agência.
> Entra quando a decisão do Roberto sobre o gestor sem campanha de lead fechar.
>
> **A lição de recorte está no CLAUDE.md** (*a premissa não medida também mora no tamanho
> da amostra*). O que este parágrafo continua provando, e é o que originou a conversa: existe
> gasto relevante fora da geração de lead, e ele estava invisível.

> ⚠️ **A régua mudou — ver a decisão do Roberto abaixo.** O registro acima é a MEDIÇÃO que
> originou a conversa; a decisão que saiu dela está na seção seguinte.

### A DECISÃO DO ROBERTO (17/08/2026) — a régua nova do CPL

Três respostas, e elas são a especificação da Etapa 2:

**1. Quatro grupos entram no CPL.** `REPLIES`, `QUALITY_LEAD`, `LEAD_GENERATION` e
`OFFSITE_CONVERSIONS`.

Ficam **fora**: `LINK_CLICKS`, `IMPRESSIONS`, `REACH`, `PROFILE_VISIT`,
`VISIT_INSTAGRAM_PROFILE`, `POST_ENGAGEMENT`, `THRUPLAY`, `AUTOMATIC_OBJECTIVE`,
`PROFILE_AND_PAGE_ENGAGEMENT`, `LANDING_PAGE_VIEWS` e qualquer grupo novo que a Meta
inventar.

> **`OFFSITE_CONVERSIONS` ENTROU por decisão do Roberto em 17/08/2026.** Ele ficou fora na
> primeira versão da régua e a revisão o trouxe: é **conversão de pixel** — o lead acontece
> no site do cliente —, e **97% do volume dele é formulário**. É diferente de IMPRESSIONS e
> REACH, que não tentam gerar lead: esse tenta e consegue, só que fora da Meta.
>
> Ele era o **maior grupo excluído** da versão anterior: R$ 10.322 na janela retida, contra
> R$ 309 na amostra de 7 dias que originou a primeira lista. Foi a amostra curta que quase
> o deixou de fora.
>
> **`LINK_CLICKS` continua FORA, também por decisão** — apesar de ter gerado **132
> conversas** na janela medida.
>
> ⚠️ **Os dois casos juntos são o ponto: a lista é JULGAMENTO DA AGÊNCIA, não consequência
> mecânica do dado.** Um grupo que gera lead está dentro, outro que gera lead está fora.
> Sem isso escrito, alguém no futuro "corrige" um dos dois olhando só as conversões, e
> muda a nota de bonificação de todos sem saber que está revertendo uma decisão.

> ⚠️ A lista de dentro é **fechada**, a de fora é **o resto** — e essa assimetria é
> deliberada. Grupo novo que a Meta inventar cai automaticamente **fora** do CPL, que é o
> lado seguro: um grupo desconhecido entrando no denominador mudaria a nota de gestor sem
> ninguém ter decidido nada. Para incluir um grupo novo, alguém precisa escrevê-lo na
> lista — e é essa a intenção.

> ⚠️ `LINK_CLICKS` está fora **por decisão**, não por não gerar lead: ele gerou 132
> conversas na janela medida. A régua é do Roberto, não uma consequência do dado.

**2. O gasto excluído APARECE À PARTE — nunca some da tela.** O gestor continua vendo
quanto está investido fora da geração de lead. Sem isso o dinheiro desaparece e ninguém
percebe que existe — que é o defeito que a medição dos R$ 3.556 revelou, e repetir isso
com o número na mão seria pior que a primeira vez.

**3. Vale A PARTIR DA DATA DE CORTE. O retroativo NÃO muda.** Os meses que já embasaram
bonificação ficam exatamente como estão. Antes do corte, o CPL é calculado como sempre
foi (todo o gasto no denominador); a partir dele, pela régua nova.

> ⚠️ E a tela precisa **DIZER** isso onde os dois períodos se encontram. Série mensal que
> troca de régua no meio sem avisar é pior que duas séries separadas: alguém vai ler a
> queda do CPL como melhora de desempenho, quando é mudança de denominador.

**A data de corte é `2026-09-01`**, aprovada em 17/08/2026. Quatro motivos, e o terceiro
decide:

1. **É fronteira de mês, e a /gestores compara meses fechados.** Corte no meio do mês
   deixaria um mês metade régua velha, metade nova — internamente inconsistente, pior que
   qualquer das duas.
2. **Nada que alguém já viu muda.** Agosto fecha com a régua com que começou.
3. **Dá ~15 execuções do sync diário com a conferência de identidade verde antes da régua
   ligar.** O backfill é tiro único; o diário só reverifica 30 dias. Ligar a régua no dia
   em que o dado nasceu seria confiar em dado que não sobreviveu a um único dia de sync.
4. Dá tempo de resolver o caso do CPL indefinido (abaixo).

### Como a fronteira é marcada na tela

1. **A comparação que cruza o corte NÃO mostra percentual** — mostra `—` com o motivo, pelo
   `motivo` do `DeltaChip`, que já força o "—" e já explica. Percentual com asterisco
   continua sendo lido como percentual.
2. **Marcador na fronteira da série mensal**, no vocabulário que já existe (o ⚠ âmbar de
   maio/2025 na /comercial).
3. **Cada ponto carrega a régua no tooltip** — quem passa o mouse num ponto isolado não vê
   o marcador da fronteira.
4. **Nunca cor diferente antes/depois.** Cor neste painel significa bom/ruim; gastá-la em
   "régua" faria alguém ler a régua velha como estado ruim.

### 🛑 CPL SEM CONVERSÃO ELEGÍVEL É INDEFINIDO, NUNCA ZERO

Medido em 17/08/2026: o gestor **MATHEUS** tem as duas contas ativas rodando
**inteiramente** em grupos excluídos (AW ONLINE em `PROFILE_VISIT`; RODA MINEIRA em `REACH`
e `VISIT_INSTAGRAM_PROFILE`), somando R$ 2.184,41. Pela régua nova ele tem **zero gasto
elegível e zero conversão elegível**.

O `cpl()` da casa devolve **0 quando não há conversão**. Sem conserto, ele apareceria com
**CPL R$ 0,00 — o mínimo matemático — e viraria o melhor gestor da agência** numa tela que
embasa bônus. É a mesma família da ARP TELECOM (ver *piso duplo* no CLAUDE.md): `a ÷ b` com
`a` zero.

Decisão do Igor: é **conserto técnico, não decisão de negócio**. Onde não há conversão
elegível o valor é **indefinido**, a tela mostra `—` com o motivo ("nenhuma campanha de
geração de lead no período"), e o gestor não entra em ranking nem recebe selo.

**E o mecanismo de exclusão não é regra nova: é o piso que já existe, recebendo o insumo
certo.** O `PISO_CONVERSOES_GESTOR` (100) barra o MATHEUS hoje — mas **por acaso**, porque
ele tem 5 conversões, não porque tem zero elegíveis. Um gestor com 500 conversões, todas em
grupos fora da régua, passaria no piso e entraria no ranking com CPL indefinido. Alimentar
o piso com **conversões elegíveis** cobre a classe, e não muda a elegibilidade de ninguém
hoje (os 7 gestores com volume têm elegíveis muito acima de 100).

> ⚠️ **O PISO E O `indefinido` SOBEM COM A RÉGUA, EM 01/09 — NUNCA ANTES, E ATRÁS DA MESMA
> CONSTANTE.** O `motivo` do piso imprime o número (`Volume baixo no mês (N conversões)`).
> Se o piso passasse a contar elegíveis enquanto o CPL ainda usa o total, a /gestores
> mostraria "Volume baixo no mês (0 conversões)" ao lado de uma linha com 5 conversões e
> CPL R$ 128,49 — o número menor **dentro da explicação** de por que o maior não conta.
> Duas chaves separadas deixariam os dois divergirem; uma constante só torna a troca
> atômica.

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

## A camada que não aparece num print lado a lado

Comparando este painel com o BI da agência e com o Grafana de referência, a diferença que
mais pesa **não é visual** — é o que a tela diz sobre o que ela **não sabe**. Ela não
aparece numa captura de tela e é o que impede o painel de mentir.

O inventário dela, para não se perder em refatoração:

| mecanismo | onde | o que impede |
|---|---|---|
| **Hachura de período parcial** | série mensal do comercial | agosto mostrava 139 contra 177 de julho e lia-se **queda de 22%**; são 17 de 31 dias, e a intensidade diária é a maior da série |
| **"É um piso, não o total"** | dinheiro parado por etapa | R$ 229.120 somam só 79 de 111 pessoas; publicar como total afirmaria que 29% da fila vale zero |
| **"Sem valor informado", nunca "R$ 0"** | listas por etapa | zero é um valor real; desconhecido não é zero |
| **"—" com motivo, nunca percentual com asterisco** | `DeltaChip` | percentual com ressalva continua sendo lido como percentual |
| **Aviso de lista vazia ambígua** | fila de contas novas | vazio parece "está tudo em dia"; `me/adaccounts` não lista conta de BM parceira |
| **Rótulo de unidade em todo número** | comercial inteiro | pessoa e oportunidade diferem por 10x em meses de clonagem |
| **Marca de "já esteve na carteira"** | fila de contas novas | recadastrar desfaz decisão que ninguém lembra ter sido tomada |
| **Régua ao lado do número** | recuperação, MRR, CPL | três definições defensáveis de sucesso: a distância entre elas **é** a informação |

⚠️ **Nenhum desses mecanismos sobrevive a uma refatoração que só olha o CSS.** Todos são
texto, estado ou estrutura de dado — some sem quebrar build, sem quebrar teste, e sem que
ninguém perceba até o número já ter ido para uma reunião.

Um BI mostra o número. Este painel mostra o número **com o que ele não prova**. Se em algum
momento a escolha for entre densidade visual e um desses avisos, o aviso fica.
