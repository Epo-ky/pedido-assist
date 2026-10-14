# Voltz

**Demonstração no ar: https://pedido-assist.vercel.app** — entre com `ana@exemplo.com` / `senha123` (dados fictícios) ou crie uma conta.

[![CI](https://github.com/Epo-ky/pedido-assist/actions/workflows/ci.yml/badge.svg)](https://github.com/Epo-ky/pedido-assist/actions/workflows/ci.yml)

> Projeto de portfólio chamado `pedido-assist` no repositório. **Voltz** é a loja fictícia e **Volt** é o assistente.

<p align="center"><img src="docs/img/06-chat-confirmacao.png" alt="Volt propõe o cancelamento e o cliente confirma com um clique" width="820"></p>

O Volt é um assistente de pedidos com IA para a Voltz, uma loja fictícia de eletrônicos. O cliente faz login, compra na
vitrine e conversa com um assistente que responde dúvidas sobre **os próprios pedidos**, usando dados reais do PostgreSQL por
meio de *function calling* (tool use). O Volt também **age**: ele propõe o cancelamento de um pedido pendente, mas quem cancela
é o clique do cliente, validado pelo servidor.

O projeto existe para demonstrar, de forma verificável:

1. **IA dentro do produto:** um LLM que chama funções TypeScript que consultam o Postgres.
2. **Segurança:** o cliente nunca vê (nem altera) pedido de outro cliente, mesmo com prompt injection.
3. **Qualidade:** testes, evals, CI e deploy público.
4. **Honestidade sobre os problemas:** tudo o que deu errado está em [docs/DIARIO.md](docs/DIARIO.md).

## Como fica

<table>
<tr>
<td width="50%"><img src="docs/img/04-chat-pedidos.png" alt="Chat: lista de pedidos"><br><sub>O Volt lista os pedidos reais da cliente logada.</sub></td>
<td width="50%"><img src="docs/img/05-chat-injecao.png" alt="Chat: prompt injection recusado"><br><sub>Pedido para ver os pedidos do cliente 2: recusado.</sub></td>
</tr>
<tr>
<td><img src="docs/img/02-loja.png" alt="Loja"><br><sub>Loja: o preço e o total vêm sempre do banco.</sub></td>
<td><img src="docs/img/01-login.png" alt="Login"><br><sub>Login e cadastro, com cookie JWT.</sub></td>
</tr>
</table>

A imagem do topo mostra o ponto central: o Volt só **propõe** o cancelamento; o pedido continua pendente até o clique em "Confirmar cancelamento".

## Como funciona

```mermaid
flowchart LR
    A[Cliente logado] -->|mensagem| B[POST /api/chat]
    B -->|clienteId vem do cookie JWT| C[Loop de tool use]
    C -->|mensagens + definição das tools| D[LLM via Groq]
    D -->|pede uma tool| C
    C -->|clienteId da sessão + argumentos validados por zod| E[Tool: query parametrizada]
    E --> F[(PostgreSQL)]
    F -->|só linhas do cliente| E
    E -->|JSON, ou encontrado: false| C
    D -->|resposta final| C
    C -->|texto simples| A
    C -.->|propor_cancelamento| G[Proposta pendente, 10 min]
    G -.->|cartão na tela| A
    A -->|clique em Confirmar| H[POST /api/acoes/:id]
    H -->|dono + pendente + não expirada| F
```

Passo a passo:

1. A mensagem chega em `/api/chat`. O servidor descobre quem é o cliente pelo **cookie de sessão**, nunca pelo corpo da requisição.
2. O loop (`runChat`) manda ao modelo a conversa e a lista de tools. O modelo **não escreve SQL**: só pede "chame `listar_pedidos`".
3. O servidor valida os argumentos com `zod`, executa a tool com o `clienteId` da sessão e devolve o JSON ao modelo. Resultado vazio
   vira `{"encontrado": false}`, para o modelo dizer "não encontrei" em vez de inventar.
4. O loop repete até o modelo parar de pedir tools (no máximo 6 voltas) e a resposta final sai em texto simples.

Tools: `listar_pedidos`, `detalhe_pedido`, `rastrear_entrega` e `propor_cancelamento`.

## Segurança por cliente

A segurança **não depende do modelo se comportar**. Ela está no código:

- O `cliente_id` vem da sessão no servidor. Não existe campo `cliente_id` nos argumentos de nenhuma tool, e o `zod` em modo
  estrito **rejeita** campos extras: um `cliente_id` forjado pelo modelo dá erro.
- Toda tool faz uma query parametrizada que **sempre** filtra por `cliente_id`. Pedido de outra pessoa e pedido inexistente
  dão exatamente a mesma resposta, para não revelar se um id existe.
- O histórico da conversa vem do banco, não do navegador: um turno de "assistente" forjado no corpo da requisição é ignorado.
- O modelo **nunca executa uma ação que muda dados**. Ele só propõe. O cancelamento exige uma requisição separada
  (`POST /api/acoes/[id]`) com a sessão do cliente e um código UUID inadivinhável, uso único e válido por 10 minutos. O servidor
  confere de novo, numa transação, se o pedido é do cliente e ainda está pendente. O código da proposta vai para a tela, nunca
  para o modelo.
- Limites de uso guardados no Postgres (não em memória, porque na Vercel cada requisição pode cair numa instância diferente):
  chat 20 mensagens/hora por cliente e 300/dia no total; login por IP e por e-mail; cadastro por IP; compras e ações por hora.

### Como foi testada

| O que | Como |
|---|---|
| Tools e rotas | 203 testes (Vitest) contra um Postgres real, incluindo "cliente A não consegue ver pedido do cliente B" e "ninguém age sobre pedido alheio" |
| Loop e provedor | Testes com um modelo falso programado, sem gastar cota |
| Prompt injection | `npm run security:check`: 31 ataques contra o **modelo real**. Um detector confere o que as tools ENTREGARAM ao modelo (e não só o que ele respondeu), procura promessas falsas ("cancelei", SAC, prazos) e, **no banco**, que nenhum pedido mudou de status e que toda proposta criada é do cliente atacado |
| Os próprios testes | "Quebras de propósito": reintroduzo o bug e confirmo que o teste certo fica vermelho. Foi assim que descobri um ataque que mirava um pedido que seria recusado de qualquer jeito, e portanto não testava a trava de dono |

Limite honesto: passar em 31 ataques não prova segurança total. A garantia de verdade é o código descrito acima; a bateria
serve para pegar regressões e comportamento indevido do modelo.

## Evals

`evals/perguntas.json` tem 23 perguntas reais com o resultado esperado de cada uma (valores, status, rastreio, pedido de outro
cliente, injeção, cancelamentos, assunto fora do escopo, conta sem pedidos, conversa com contexto).

```bash
npm run evals                                # todas
npm run evals -- motivo-do-cancelamento --repeat 8   # um caso, 8 repetições (o modelo varia)
```

Elas rodam contra o modelo de verdade, por isso ficam fora do `npm test` e da CI (gastam cota, variam e precisam do banco no
estado do seed). Uma eval reprovada pode ser erro do modelo **ou** expectativa injusta; leio a resposta inteira antes de decidir.

Exemplo real: a eval `motivo-do-cancelamento` mostrou que o Volt terminava com "entre em contato com o nosso atendimento", um canal
que não existe. Linha de base: 3 de 8 aprovações (38%). Depois de reforçar o prompt: 8 de 8.

## O que deu errado no caminho

Resumo do [diário](docs/DIARIO.md), que tem todos os detalhes:

- **Plano de IA paga não coube no bolso.** Planejei a API da Anthropic, mas é paga; migrei para a Groq (gratuita) atrás de uma
  interface `LlmProvider`, então trocar de provedor é escrever outra classe.
- **O modelo aplicava filtros sozinho.** "Quais são os meus pedidos?" mostrava 1 de 8 porque ele filtrava por `status: pendente`.
  Só apareceu com o modelo de verdade; o modelo falso dos testes não pegaria.
- **O provedor recusava antes de o servidor ver.** A Groq valida a chamada contra o schema e devolvia 400 para `null` e para
  `exclusiveMinimum`. Regra que ficou: o schema que vai ao modelo é só um guia; o juiz é o `zod` do servidor.
- **O Volt prometia o que não podia.** Num teste manual ele ofereceu "registrar a solicitação" e "retorno em até 48 horas". Meus
  20 ataques só cobriam vazamento, não honestidade. Criei um detector de promessas indevidas e novos casos na bateria.
- **Bug de fuso horário.** A regra de "entrega atrasada" usava UTC e, entre 21h e meia-noite, marcava como atrasada uma entrega
  que vencia hoje. Os testes antigos não pegavam porque nunca simulavam o horário.
- **CI que só falhava no GitHub.** O `npm ci` reclamava de pacotes opcionais do Linux ausentes no lockfile gerado no Windows.
  Não consegui reproduzir localmente; só a CI mostrou.
- **Teste instável.** Um teste contava a tabela inteira e falhava de vez em quando, porque o Vitest roda arquivos em paralelo
  no mesmo banco.
- **Eval injusta.** Duas expectativas minhas estavam erradas, e não o modelo. Corrigi a pergunta/expectativa em vez de afrouxar a conferência.

## Stack

- Next.js 16 (App Router) + TypeScript
- PostgreSQL + Drizzle ORM (migrations e seed)
- Function calling via Groq (plano gratuito, modelo `openai/gpt-oss-120b`), atrás de uma interface de provedor
- Autenticação por cookie JWT assinado (`jose`), senhas com `bcryptjs` e validação com `zod`
- Vitest (testes) e GitHub Actions (CI com Postgres de teste a cada push)
- Deploy: Vercel (região de São Paulo) e Neon (Postgres na nuvem, plano gratuito)

## Como rodar local

Pré-requisitos: Node.js 20+ e PostgreSQL instalado (usei direto no Windows, sem Docker).

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o banco `pedido_assist` no seu PostgreSQL.

3. Copie `.env.example` para `.env`, preencha a senha do seu usuário do Postgres em `DATABASE_URL`, gere um
   `SESSION_SECRET` aleatório e coloque uma chave gratuita do Groq (console.groq.com) em `GROQ_API_KEY`.

4. Crie as tabelas e popule com dados de exemplo:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Inicie o servidor de desenvolvimento:

   ```bash
   npm run dev
   ```

Abra http://localhost:3000. Você pode entrar com um usuário de demonstração ou criar uma conta em `/cadastro`.

## Usuários de demonstração

O seed cria 3 clientes, todos com a senha `senha123` (dados fictícios):

| Cliente | E-mail |
|---|---|
| Ana Souza | ana@exemplo.com |
| Bruno Lima | bruno@exemplo.com |
| Carla Mendes | carla@exemplo.com |

## Scripts

| Comando | O que faz |
|---|---|
| `npm run dev` | Servidor de desenvolvimento |
| `npm run lint` | ESLint |
| `npm run typecheck` | Checagem de tipos (TypeScript) |
| `npm test` | Testes (Vitest); os de tools e rotas usam o banco com o seed aplicado |
| `npm run security:check` | Bateria de 31 ataques de prompt injection contra o modelo real (gasta a cota do Groq) |
| `npm run evals` | 23 perguntas com resposta esperada contra o modelo real (exige o banco no estado do seed) |
| `npm run ai:test` | Chamada de teste ao modelo, com um ciclo completo de tool |
| `npm run db:generate` | Gera uma migration a partir do `schema.ts` |
| `npm run db:migrate` | Aplica as migrations no banco |
| `npm run db:seed` | Apaga e recria os dados de exemplo |
| `npm run db:test` | Testa a conexão com o banco |

## Modelo de dados

`clientes` → `pedidos` → `itens_pedido` → `produtos`, e `pedidos` → `entregas` (no máximo uma por pedido). Também há
`mensagens_chat` (histórico, até 50 por cliente), `acoes_pendentes` (propostas do Volt) e `limites_uso` (contadores dos limites).
O schema está em [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

## Deploy

O projeto está na Vercel e o banco no Neon (os dois no plano gratuito). A cada push na `main`, a Vercel publica sozinha e o
GitHub Actions roda lint, typecheck e testes. As variáveis de ambiente (`DATABASE_URL`, `SESSION_SECRET` e `GROQ_API_KEY`) ficam
só no painel da Vercel, nunca no repositório. A primeira requisição depois de um tempo parado é mais lenta: o Neon escala a zero.

## Roteiro e o que não foi feito

O roteiro completo está em [CLAUDE.md](CLAUDE.md). Fases 1 a 8 concluídas . Ficam como bônus: recuperar senha por e-mail e uma
tool de política de trocas com RAG (pgvector). O pagamento é simulado: o pedido nasce pendente e não há como pagar.
