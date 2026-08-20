# Demanda 2 — qualificação por porte na `/comercial`

> **Entregue em 20/08/2026.** Este arquivo existe para a próxima sessão não reconstruir as
> decisões: cada uma tem o **motivo** e o **número** que a produziu, e várias delas
> contrariam o pedido original — foi a medição que mandou.

---

## O que a tela mostra, e por quê

### 1. A manchete é COBERTURA em Negociação, não distribuição

**Cobertura**, porque o pedido original (distribuir as cinco faixas entre quem está em
Negociação) não sobrevive ao `n`: são **19 pessoas com faixa**, e dividir 19 em cinco dá
~4 por faixa — o mesmo critério que a casa usa para DESCARTAR uma faixa.

**Negociação**, porque é o **único patamar**. Medida a cobertura contra três cortes de era:

| nível | desde 01/06 | desde 01/07 | desde 01/08 |
|---|---|---|---|
| 2 Follow-up | 43,2% | 49,5% | 79,5% |
| 3 Agendado Reunião | 34,4% | 29,6% | 71,4% |
| **4 Negociação** | **77,3%** | **78,9%** | **80,0%** |
| 5 Fechamento | 0% (n=4) | 0% (n=2) | — (n=0) |

Todos os outros são RAMPA — o número muda com o corte, então nenhum deles é patamar.

> 🔑 **E a armadilha que quase passou: estabilidade PARECE solidez.** Os três números
> estáveis do nível 4 são **22, 19 e 10 pessoas**. A estabilidade valida a **RÉGUA** (o
> recorte é consistente); o `n` valida a **CONCLUSÃO** (dá para dividir). São dois testes, e
> passar num não dispensa o outro.

⚠️ **A hierarquia é PROVISÓRIA POR DESENHO.** A fila se esvazia conforme a agência etiqueta.
No dia em que houver volume em Negociação, a distribuição vira manchete sozinha e a fila
desce. Está escrito no componente para ninguém "arrumar" o que é intencional.

### 2. A pendência vai do nível 2 ao 5

Não é sugestão: o Thiago confirmou que **a marcação é obrigatória** — o cliente declara a
faixa no formulário e o vendedor aplica a etiqueta depois de conversar, porque na conversa o
valor real costuma ser outro (declara 3k, apura-se 5k).

**Quem está sem faixa está fora do processo.**

| nível | está na fila? | por quê |
|---|---|---|
| 1 Novo Lead | 🛑 **não** | **IMPOSSIBILIDADE** — a etiqueta depende de a conversa ter acontecido, e ninguém conversou. Os ~1% ali são o ESPERADO. |
| 2 · 3 · 4 | ✅ sim | é onde ainda dá para influenciar a venda |
| 5 Fechamento | ✅ sim, **por último** | **OMISSÃO** — houve conversa e fechamento, o valor FOI apurado, só não foi registrado |

> 🛑 **A DIFERENÇA ENTRE O 1 E O 5 NÃO É DE GRAU, É DE NATUREZA — e é o que impede alguém
> de "limpar a lista" tirando os dois juntos.** Um é "não dá para saber", o outro é "sabia e
> não anotou". Tratá-los igual apagaria isso.

**Ordem:** nível mais avançado primeiro, **menos o 5**, que vai para o fim — a régua da
urgência mede o que ainda dá para **influenciar**, e depois da venda não dá. Dentro do
mesmo nível: **mais parado primeiro**, com `diasParado === null` no fim (sem dado, sem
prioridade — nunca tratado como 0).

⚠️ **Os rótulos de grupo são condicionais**, não texto solto: só aparecem quando os dois
grupos estão na parte mostrada. Se o pós-venda sair da lista um dia, as duas frases somem
sozinhas.

**Teto de exibição:** `LINHAS_VISIVEIS` (20), **global e não por nível** — um teto por nível
contradiria a ordenação por urgência, mostrando Follow-up à frente de Negociação escondida.
Nunca dobra: truncagem declarada (`"Mostrando 20 de 121 — ver todas"`), com o total à vista
antes de qualquer clique, porque **pendência é alerta e alerta não nasce recolhido**.

📌 Consequência aceita: com o 5 por último e teto de 20, o grupo pós-venda só aparece em
"ver todas". Decisão do Igor — quatro linhas que não dá mais para influenciar não devem
ocupar o espaço de quem ainda dá, e quem vai agir sobre elas clica.

### 3. O corte 01/06/2026 é ESCOLHA, e a tela diz isso

A pendência lista só quem entrou a partir do corte. **Antes disso a lista abria com a era
morta** — as 20 primeiras eram Fechamento com 561d, 370d, 153d parados, e 126 das 130
pessoas do Fechamento entraram antes de junho, quando ninguém etiquetava.

Resultado: **215 → 121**, com as 94 restantes **contadas à parte** e o motivo escrito.
Filtro silencioso num alerta é a mesma coisa que dobra escondendo alerta.

> ⚠️ **A data é onde a SÉRIE vira, não onde o PROCESSO mudou.** O CRM não guarda quando uma
> etiqueta foi aplicada — ela é inferida da ENTRADA das pessoas. **Isso vai na tela junto do
> número**, porque data de corte sem o motivo escrito vira, três meses depois, um fato que
> ninguém questiona.

### 4. A distribuição é MÉDIA DE DUAS ERAS, e o rótulo é condição de ela existir

`113 · 51 · 20 · 27 · 44` sobre a carteira inteira (290 com faixa). **Nunca é o número de
Negociação:** a cobertura ainda está subindo — 31,1% desde junho, 37,9% desde julho, 70,8%
desde agosto.

**Cor:** as cinco faixas são ORDINAIS, e a rampa categórica tem três séries. Três cores
sobre cinco itens ordenados inventariam um agrupamento que não existe — então a distinção
vem da **ORDEM**, do rótulo e do absoluto. Token único: `dadoNeutro`, **sem trilho**.

🛑 **E o `semTrilho` não é estética: é medição.** `dadoNeutro` dá **2,27:1** contra
`barraNeutra` e **3,31:1** contra o card. Nenhum dos três neutros da paleta passa contra o
trilho — ver a pendência 4 em `pares-desencontrados.md`.

**Clique:** a linha inteira abre quem está na faixa (a `[38] Sem Perfil` entra como sexta
linha clicável). ⚠️ **A barra conta a CARTEIRA; o clique lista o FUNIL** — só quem tem
oportunidade aberta tem "etapa atual" e "tempo parado". O modal abre com `"Mostrando N de
M"` e explica a diferença, senão contradiz o gráfico que o abriu.

---

## Custo

**A tela custa 1 leitura de Firestore**, inalterado. O `porte` sai do laço que o sync já
roda (**zero leituras a mais**); o documento cresceu ~1 kB mais o booleano `semPerfil`
(~4,5 kB).

⚠️ `porte` é **opcional no tipo de propósito**: o documento gravado antes desta versão não
tem o bloco. Marcar obrigatório faria o TypeScript afirmar que existe, e a tela renderizaria
`"0 de 79 (0,0%)"` com autoridade de número medido. **Ausência é "ainda não sincronizado",
nunca zero.**

Conferido por leitura de volta: `porte.chegou: true`, `comCampoSemPerfil: 447 de 447`.

---

## 🔶 As duas pendências que ficaram — e a ORDEM importa

As duas vão para a conversa de padronização, **e não são o mesmo problema**:

| | defeito | depende de | enquanto espera |
|---|---|---|---|
| **1º** | **o teto da escala termina cedo demais** | Thiago | 🛑 **cada lead novo perde a informação de quão acima, e não volta** |
| **2º** | as taxonomias da Meta e do CRM divergem | Thiago | nada se perde — traduz-se depois |

A maior faixa do CRM é `Mais de 10k`, e existem clientes de **20k e 50k** (vistos em títulos
de oportunidades reais). **Um cliente de 11k e um de 50k caem no mesmo balde.**

> 🔑 **Faixa-teto aberta destrói informação NA MARCAÇÃO, não na leitura.** Um vocabulário
> divergente se traduz depois; um valor achatado no momento em que foi registrado não se
> destraduz — ninguém reetiqueta cliente por cliente. **Por isso o teto vai primeiro, mesmo
> sendo o menor dos dois em aparência.**

**E alinhar as duas listas NÃO resolve o teto:** as escalas ficariam iguais e as duas
continuariam achatando 11k e 50k no mesmo ponto.

### Bloqueado, e por DUAS partes diferentes

O "declarado × apurado" (mostrar o que o cliente diz contra o que o vendedor apura) tem dois
bloqueios **independentes**: a divergência de taxonomia (**agência**) e a ausência de
endpoint que nomeie os campos do formulário (**suporte do Xmax**). Resolver um não destrava.
Ver `data/xmax-integracao.md`.

---

## O que foi MEDIDO e derrubou o pedido

Três coisas mudaram de desenho porque o número contrariou a premissa:

| pedido | medição | resultado |
|---|---|---|
| distribuição como manchete | 19 pessoas em 5 faixas | virou **cobertura** |
| "várias pendentes têm a faixa no título" | **5 de 128 (4%)** | achado **retirado** |
| `dadoNeutro` na barra | **2,27:1** contra o trilho | virou **sem trilho** |

⚠️ **E o mecanismo do segundo vale mais que o número:** cinco casos vistos na parte
**visível** de uma lista de 121 viraram "várias". **Amostra que você viu não é amostra que
você tirou** — o topo de uma ordenação é o recorte com maior chance de parecer padrão.

📌 **Sinal para remedir, não achado:** em Negociação o padrão no título é 2 de 5 (40%)
contra 3 de 115 (3%) no Follow-up. Com esse `n` é ruído — **remedir quando a base de
Negociação crescer.**

---

## Também não fechado

**A cobertura do Fechamento (0,8%) segue sem explicação.** A leitura de "é cedo demais" não
fecha: o ciclo tem mediana de **24 dias** e 83% chegam em até 80 — a safra de junho já teve
tempo. **Repetir a medição em novembro/2026**, quando ela passar do p90 de 136 dias.
Ver a lápide da `diag-porte` em `data/xmax-integracao.md`.
