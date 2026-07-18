# CLAUDE.md — Padrão de trabalho (estúdio de automações e painéis)

Este arquivo define como você (Claude Code) deve trabalhar em TODOS os projetos deste estúdio.
Leia e siga sempre. O objetivo é entregar apps/painéis sob medida para clientes de nichos
diferentes, reaproveitando o mesmo "motor" e trocando só a "casca" (marca, telas, integrações).

## Stack padrão (não trocar sem pedir)
- Frontend/back: **Next.js** (App Router, TypeScript, Tailwind).
- Hospedagem: **Vercel**.
- Dados e login: **Firebase** (Firestore + Authentication).
- Versionamento: **GitHub** (gerenciado pelo GitHub Desktop). O usuário não usa terminal.

## Fluxo de publicação
- Publicar com **commit e push direto na branch `main`, sem Pull Request** (a menos que o
  usuário peça o contrário).
- A Vercel faz deploy automático a cada push.
- Sempre **rode o build** antes de finalizar e diga ao usuário **como testar** (URL/rota).
- Repositório **nunca dentro de pasta sincronizada** (OneDrive, Google Drive, Dropbox) —
  a sincronização corrompe a pasta `.git`. Use algo como `C:\dev\nome-do-projeto`.

## Login (padrão em todo projeto)
- Todo projeto **nasce com login** (Firebase Auth, e-mail/senha). Todas as telas protegidas;
  sem sessão, redireciona para `/login`.
- A proteção precisa ser **de verdade no servidor**: endpoints sensíveis verificam o usuário
  autenticado (ID token do Firebase), não só escondem a tela.
- Em endpoints de **escrita**, o autor/identidade vem SEMPRE do token decodificado no
  servidor — **nunca** do corpo da requisição (senão dá para forjar).
- Cadastro fechado por padrão: usuários criados manualmente no console do Firebase.
- Revisar as **regras do Firestore** (`firestore.rules`): mesmo com tudo passando pelo
  servidor, regras abertas permitem contornar os endpoints e escrever direto no banco.

## Identidade visual
- Base padrão: **tema dark premium**, mas a **cor é ajustável por cliente**.
- Centralize marca e cores em **um só lugar** (design tokens / variáveis CSS), para trocar a
  identidade de um cliente mexendo em um único arquivo.
- Sem gradientes/sombras pesadas; layout limpo, tipografia forte, uma cor de destaque.
- A cor de destaque é para **ação e ênfase**, não decoração. Verde/vermelho só com
  significado (bom/ruim). Cuidado com semântica invertida: CPL subindo é **ruim** (vermelho).
- Números em tabelas e KPIs com `tabular-nums` (evita as colunas "dançarem").
- Ao trocar a identidade de um cliente, peça uma **auditoria de cores "chumbadas"** fora dos
  tokens — é isso que mantém o starter realmente reutilizável.

## Segurança e variáveis de ambiente (crítico)
- **Segredos** (tokens de API, chaves admin) ficam **só no servidor**, em variáveis de ambiente.
  Nunca no cliente, nunca no repositório.
- Só use o prefixo `NEXT_PUBLIC_` para config **não secreta** do cliente (ex.: chaves públicas
  do Firebase client). Deixe claro para o usuário o que é secreto e o que é público.
- Sempre que criar/precisar de uma env, **diga exatamente qual variável adicionar na Vercel**
  e lembre do **Redeploy** (env nova só vale em build novo).
- Chaves privadas (Firebase Admin, contas de serviço Google) vêm com `\n` escapado —
  trate isso ao ler a env. É o erro mais comum dessas integrações.
- Mantenha um `.env.example` atualizado.

## Integração de dados (regra de ouro)
- **Antes de prometer qualquer integração, confirme se o dado existe e é acessível.**
- Primeiro passo de toda integração: criar um **endpoint de diagnóstico** temporário que
  consulta a fonte (a API do cliente) e mostra os campos disponíveis. Só depois construa a
  feature em cima do que realmente vem. Remova o diagnóstico ao final.
- Cada cliente/sistema tem sua própria API (algumas boas, outras ruins ou inexistentes).
- **Nunca transcreva IDs (accountId, etc.) a partir de imagem ou print** — um dígito errado
  cria registro fantasma que nunca sincroniza. Peça sempre o retorno em **texto**.
- **Joins sempre por ID único, nunca por nome.** Nomes de cliente se repetem e geram
  duplicação silenciosa (a mesma conta aparecendo em vários lugares).

## Escrita e importação de dados
- Toda rotina que grava em massa precisa de **prévia (dry-run) por padrão** e só gravar com
  um parâmetro explícito (`&aplicar=1`). O relatório da prévia mostra o que seria criado,
  atualizado, inalterado e o que ficou órfão.
- **Idempotente**: rodar de novo atualiza (merge), não duplica. Use docId determinístico.
- **Não destrutivo**: nunca apague registros que sumiram da fonte — apenas liste como órfãos
  e deixe o usuário decidir. (Um import destrutivo já apagou uma coleção inteira neste
  estúdio; não repetir.)
- Ao importar dados existentes do cliente, **nunca sobrescreva** o que ele já escreveu na
  ferramenta — pule e reporte.

## Custo de leitura (Firestore) — pense antes de varrer coleção
- Leitura de documento **custa dinheiro** no plano Blaze e **derruba o app** no plano grátis
  ao estourar a cota. Trate leitura como recurso caro.
- **Nunca varra uma coleção grande a cada carregamento de tela.** Prefira **documentos
  pré-agregados** gravados no momento do sync (um doc por entidade com a série já pronta).
- Estime e informe ao usuário quantas leituras cada tela custa antes de implementar.
- Use **cache** (no servidor e na sessão do cliente) para navegação entre abas e troca de
  filtros que não precisam refazer a busca.
- Telas leves não devem depender de dados pesados: se uma tela só precisa da lista de
  entidades, não carregue o histórico inteiro junto.

## Robustez (nunca mentir para o cliente)
- **Dados de exemplo (mock) jamais podem aparecer em produção.** Se a fonte falhar, mostre
  um aviso claro de indisponibilidade — número falso na tela do cliente é pior que tela fora
  do ar.
- Uma feature secundária que falha **não pode derrubar** a tela principal: degrade com
  elegância (some o enfeite, o essencial continua).
- Coleção que ainda não existe deve retornar lista vazia, não erro 500.

## Sincronização e tarefas longas
- Vercel grátis corta funções em ~10s. Para uso **comercial**, prefira **Vercel Pro**
  (mais tempo + cron nativo).
- Se estiver no grátis: torne o sync **incremental/resumível** (parâmetros de offset/limite,
  grava cada item ao terminar) e automatize com **GitHub Actions** (workflow em cron que chama
  o endpoint em blocos até terminar).
- Sync **idempotente**: rodar de novo atualiza (merge), não duplica. Use docId determinístico.
- Ao mudar o sync, valide que ele **continua gravando tudo que já gravava** — ele alimenta o
  app inteiro. Campo ausente na fonte grava `null`, nunca `0` (zero é um valor real).

## Mudanças estruturais em dados (migração segura)
- Quando trocar a fonte de leitura de uma tela, faça em **duas etapas**:
  1. o sync passa a escrever nos dois lugares (dual-write) + backfill do histórico;
  2. só depois de conferir que a fonte nova está populada, a leitura muda.
- Nunca suba a etapa 2 antes de confirmar a 1 — senão a tela lê dados incompletos.
- A fonte granular original permanece intacta como auditoria; o agregado é derivado e
  reconstruível.

## Módulo de IA (premium, opcional)
- Assistente de IA entra como **módulo premium**, **desligável por env** (off por padrão).
- **Nome definido por cliente** (não use "Influ" — esse nome é exclusivo da Influência).
- Chave em `ANTHROPIC_API_KEY` (servidor). Modelo padrão: **claude-sonnet-4-6**.
- Contexto vem dos **dados já sincronizados** do cliente; a IA responde em português, prática,
  e **nunca inventa números** — só usa o que recebe. Inclua teto de contexto/histórico p/ custo.
- O contexto deve vir de **agregados**, não de varredura de coleção (custo de leitura).

## Localização
- Português (Brasil). Valores monetários em **R$** quando fizer sentido para o cliente.
- Confirme a moeda dos dados da fonte antes de assumir (pode vir em outra moeda).
- Fuso horário como **constante única** no arquivo de marca — nunca espalhado pelo código.
- Ao comparar períodos, compare **intervalos equivalentes** (1..D vs 1..D) e ancore no último
  dia **com dado**, não no relógio. Deixe o intervalo explícito na tela.

## Convenções de código
- Limiares/parâmetros (tetos de alerta, janelas de dias, limites) como **constantes no topo**
  do arquivo, fáceis de ajustar.
- Regras de negócio (ex.: o que é um alerta) ficam em **um único módulo**, consumido por todas
  as telas — nunca duplicadas.
- Em listas do React, a `key` deve ser o **ID único**, nunca o nome (nomes repetidos causam
  linhas duplicadas e vazamento entre agrupamentos).
- Não quebre features existentes ao adicionar novas; mudanças cirúrgicas.
- Ao terminar uma tarefa grande, faça um resumo curto do que mudou e como testar.

## Estilo de comunicação com o usuário
- Explique em **português, passo a passo, sem jargão**.
- Diga exatamente **quais cliques** (Vercel/Firebase/GitHub) e **quais envs** são necessários.
- Antes de publicar algo visual, sugira **validar no navegador** (rodar em dev e conferir).
- Diante de um problema, **descubra a causa real** antes de propor correção — e diga quando
  não souber, em vez de chutar. Um erro de infraestrutura (cota, permissão, credencial) se
  parece com bug de código, mas o conserto é outro.
- Ao mexer em algo que já está no ar sendo usado, mostre o **plano antes do código**.
