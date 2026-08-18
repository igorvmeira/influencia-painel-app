# O BI comercial da agência — inventário de estrutura e tabela de réguas

Levantado em **17/08/2026** do Power BI publicado que o comercial usa hoje.

> **Método, e o que NÃO foi lido.** Tudo saiu da camada de acessibilidade da página
> (aria-label de visual, nome de medida, rótulo de slicer, cabeçalho de tabela). **Nenhum
> dado de cliente atravessou a fronteira do navegador**, nenhum número de negócio foi
> registrado, nada foi para disco ou log. Onde havia contagem, ela foi mascarada dentro da
> própria página antes de sair.
>
> **Isto não é um plano de cópia.** O BI pode ter fontes que não temos (ERP, base de
> assinantes, retenção). O objetivo é achar o que é **pertinente E possível** no nosso
> escopo — Meta Ads + Xmax —, não igualar.

---

## 1. Inventário por página

### Página 1 — Dashboard

Cartões de contexto: dias úteis, dias corridos, dias restantes, atualização mais recente.

| medida | rótulo na tela |
|---|---|
| TOTAL_LEADS | Leads |
| CONVERTIDO | Fechamentos |
| CONVERSÃO (%) | Conversões |
| CONVERSAO_LIQUIDA (%) | Conversões Líquidas |
| ENTREGA_CONVERSAO / ENTREGA_CONVERSAO_LIQUIDA | dois medidores contra meta |
| META_CONVERSAO, Meta | as duas metas |
| KPI_MEDIA_LEADS, KPI_MEDIA_FECHAMENTOS | médias por dia |
| KPI_TENDENCIA_LEADS, KPI_TENDENCIA_FECHAMENTOS | projeções |
| KPI_LEADS_QUALIFICADOS | leads qualificados |
| EM_PROCESSAMENTO (# e %), CONVERTIDO (%) | barra de composição |

Tabelas: por **nome_etapa** (uma para o funil, outra isolando o fechamento) e por
**origem** (com coluna de %). Gráfico de colunas com duas séries — total de leads e
convertidos — ao longo do tempo.

### Página 2 — Comercial

As mesmas medidas em recorte de KPI, mais QUALIFICADO, MEDIA_FECHAMENTO, TENDENCIA_LEADS
e TENDENCIA_FECHAMENTO.

Duas tabelas próprias:

- **temperatura x total** — a família de porte (menos de 1k até mais de 10k, e Sem Perfil)
  mais o valor **Etiquetar**, que é o não-classificado;
- **tipo x qtd x % x Mínimo de peso** — três estados: LEAD NOVO, EM_PROCESSAMENTO,
  CONVERTIDO. A coluna **Mínimo de peso** indica que as etapas têm **peso numérico** e que
  o "tipo" sai de um limiar de peso. **Não temos nada equivalente.**

### Página 3 — Base

Tabela crua, uma linha por oportunidade, com as colunas:

    id_oportunidade | data_entrada | nome_etapa | responsavel
    nome_oportunidade | valor | telefone_oportunidade | Etiqueta

Dois slicers próprios desta página: **Etiqueta** e **nome_etapa**.

---

## 2. Filtros — o que eles conseguem cruzar

| slicer | onde | observação |
|---|---|---|
| Ano | todas as páginas | |
| Nome do Mês | todas | |
| empresa | todas | **fixo em INFLUENCIA MARKETING** — o modelo comporta mais de uma empresa |
| situacao | todas | valores não determinados |
| Etiqueta | só na Base | |
| nome_etapa | só na Base | |

⚠️ **Não há slicer de responsável, de origem nem de porte.** Origem e porte aparecem como
tabelas (leitura), não como filtro (cruzamento).

---

## 3. O que existe lá e não existe aqui

| recorte no BI | temos? | pertinente e possível? |
|---|---|---|
| **temperatura / porte do provedor** | não | **Sim** — as tags 38 a 43 já estão nomeadas. Barrado pela cobertura de 8%, não pela técnica. |
| **tipo com Mínimo de peso** | não | **Talvez.** Etapa com peso numérico é conceito que não temos. Precisa saber se o peso é campo do CRM ou do modelo do BI. |
| **Metas e % de entrega** | não | **Sim, e é a maior lacuna conceitual.** O BI compara contra meta; nós não temos meta em lugar nenhum. Exige a agência informar quais são. |
| **Tendência / projeção do período** | não | **Sim.** Projeta o fechamento a partir do ritmo. Barato: já temos dias corridos e restantes no comercial. |
| **Dias úteis / corridos / restantes** | não | **Sim.** Nossa Início ancora no último dia com dado; nunca mostra progresso do período. |
| **Recorte por empresa** | não | **Não pertinente** — o painel é de uma agência só. |
| **origem como tabela** | não | Bloqueado: os ids não têm nome (ver perguntas-agencia.md, item 1). |
| **responsavel** | não | ⚠️ **Corrige uma suposição nossa** — ver abaixo. |
| Funil por etapa, pessoas paradas, MRR por etapa, série mensal, perdas, recuperação | **nosso** | O BI **não tem** nada disso. |

### ⚠️ A quebra por vendedor NÃO existe no BI

A suposição era que eles olham por vendedor e nós não. **Não confere.** `responsavel` é
apenas uma **coluna da tabela crua** — não há visual, gráfico ou slicer que agregue por
ela. E o preenchimento é parcial: numa amostragem de ~520 linhas, cerca de **um terço**
tinha o campo preenchido (medida aproximada, por posição de coluna).

Ou seja: **não é uma pergunta que o BI responde.** Se a agência quiser análise por
vendedor, é feature nova para os dois lados — e esbarra no mesmo problema de preenchimento
que a qualificação por porte.

---

## 4. A tabela de réguas — como cada lado conta

> 🛑 **Nada aqui autoriza comparar número.** A régua do lado do BI é, em vários pontos,
> **indeterminável** sem acesso ao modelo (o DAX não é exposto). Onde não deu para
> determinar, está escrito NÃO COMPARÁVEL e o porquê. **Número divergente com régua
> desconhecida faz a reunião discutir quem está certo em vez de o que cada um mede.**

| dimensão | nosso painel | BI | comparável? |
|---|---|---|---|
| **unidade** | PESSOA (telefone distinto) como principal, oportunidade rotulada ao lado | OPORTUNIDADE — a Base tem uma linha por id_oportunidade | ⚠️ só depois de igualar a unidade |
| **frame de data** | primeiroContato (primeira oportunidade da pessoa) | **data_entrada — NÃO DETERMINADO.** Pode ser criação da oportunidade ou entrada na etapa | ❌ **NÃO COMPARÁVEL** |
| **escopo de funil** | só pipeline 4, e **recuperação FICA DE FORA** do funil de captação (Variante B) | nome_etapa inclui **RECUPERAÇÃO DE LEAD** como etapa do funil | ❌ escopos diferentes por desenho |
| **status** | abertas vs encerradas explícito; ganhas e perdidas separadas | situacao é slicer de valores desconhecidos | ❌ **NÃO COMPARÁVEL** |
| **empresa** | não existe — a base é só a agência | filtrado em INFLUENCIA MARKETING; o modelo comporta outras | ⚠️ verificar se o dataset traz mais empresas |
| **clonagem da automação** | neutralizada (contagem por pessoa) e sinalizada nos meses afetados | **nenhum tratamento visível** | ❌ o BI provavelmente conta clone como lead |
| **período parcial** | mês corrente e primeiro mês marcados com hachura | não observado | — |

### ⚠️ O caso "168 no BI contra 137 no nosso" NÃO está resolvido

A explicação corrente é "o BI conta oportunidade por createdAt, nós contamos pessoa por
primeiroContato". **A direção está certa e o valor não fecha:** em agosto/2026 temos ~145
oportunidades criadas, não 168. Sobra diferença que a explicação não cobre.

Candidatos, **nenhum verificado**:

1. data_entrada não ser createdAt;
2. o BI incluir pipelines que excluímos;
3. o filtro situacao recortar diferente;
4. tratamento diferente das oportunidades clonadas pela automação.

**Até isso ser determinado, os dois números não vão lado a lado** — nem para dizer que
batem, nem para dizer que divergem. Uma explicação que cobre a direção mas não o valor é
meia explicação, e meia explicação numa reunião vira consenso falso.

---

## 5. A META — o que dá para determinar, e o que não

A aritmética dos medidores fecha, então **o que eles comparam está determinado**:

    % ENTREGA_CONVERSAO           = % CONVERSÃO         ÷ % META_CONVERSAO
    % ENTREGA_CONVERSAO_LIQUIDA   = % CONVERSAO_LIQUIDA ÷ % Meta

Os dois medidores vão de 0% a 100% e respondem **"quanto do alvo já foi entregue"** — não
são a conversão em si, são a fração da meta atingida.

E duas das quatro medidas de base também fecham:

    % CONVERSAO_LIQUIDA = CONVERTIDO ÷ LEADS_QUALIFICADOS
    % CONVERTIDO        = CONVERTIDO ÷ TOTAL_LEADS

### A unidade da meta: é TAXA, não volume

As duas metas são **percentuais de conversão**, não quantidade de leads, de vendas nem de
MRR. Consequência prática: **nós já temos o numerador e os candidatos a denominador — falta
só o alvo.** Se for isso, é constante de configuração, não feature.

### 🛑 MAS FALTA O DENOMINADOR DE `% CONVERSÃO` — e sem ele a meta não é implementável

O BI tem **duas** taxas de conversão sobre bases diferentes:

| medida | denominador | fecha? |
|---|---|---|
| `% CONVERTIDO` | TOTAL_LEADS | ✅ determinado |
| `% CONVERSAO_LIQUIDA` | LEADS_QUALIFICADOS | ✅ determinado |
| **`% CONVERSÃO`** | **não é nenhum dos dois** | ❌ **NÃO DETERMINADO** |

E **é justamente a `% CONVERSÃO` que é medida contra a meta de 15%.** Implementar o alvo
sem saber sobre o que ele é percentual construiria a régua sobre a base errada — o erro
clássico do "antes de comparar um percentual contra um limiar, diga sobre o que ele é
percentual".

### Fixa ou derivada: NÃO DETERMINADO

As metas aparecem como valores redondos (15% e 25%) e como medidas próprias, o que
**sugere** constante — mas sugestão não é determinação. O teste que decidiria é filtrar por
um mês só e ver se o alvo se move; os slicers do relatório são canvas e não abriram por
automação.

**Isso muda o desenho:** meta fixa é uma env; meta por período é um documento de config com
grão de mês. Não dá para escolher sem a resposta.

## 6. Decisões tomadas a partir deste levantamento

**As perguntas que isto gera foram para `perguntas-agencia.md`** (itens 8 a 13), para a
lista da agência ficar num lugar só.

### ❌ Análise por vendedor — CONSIDERADA E DESCARTADA (17/08/2026)

Registrado com o motivo para **não voltar à mesa sem dado novo**:

1. **Não é pergunta que a agência faz hoje.** `responsavel` é coluna da tabela crua do BI;
   nenhum visual, gráfico ou slicer agrega por ela.
2. **O campo é ~1/3 preenchido.** Uma tela por vendedor descreveria o preenchimento do CRM,
   não o desempenho da equipe — o mesmo defeito da qualificação por porte com 8%.

**O que reabriria:** o preenchimento subir de forma consistente, ou a agência pedir
explicitamente e assumir o custo de preencher.

### ⏸ Anotado para depois — entra JUNTO com a meta

**Dias úteis / corridos / restantes** e **tendência (projeção pelo ritmo)** são baratos e a
Início hoje só ancora no último dia com dado, sem nunca mostrar progresso do período.

Os três se completam e **entram juntos**: progresso sem alvo é número solto, e alvo sem
projeção não diz se dá tempo. Separados, cada um vale pouco.

### ❔ "Mínimo de peso" — pergunta, não importação

A tabela `tipo` do BI tem uma coluna `Mínimo de peso`, indicando que as etapas têm **peso
numérico** e o estado sai de um limiar. **Conceito que não existe no nosso modelo, e não
será importado sem entender de onde o peso vem** — se é campo do CRM ou invenção do modelo
do BI. Está no item 10 da lista da agência.
