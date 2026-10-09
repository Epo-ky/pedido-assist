# Voltz

> Projeto de portfólio chamado `pedido-assist` no repositório. **Voltz** é a loja fictícia e **Volt** é o assistente.

O Volt é um assistente de pedidos com IA para a Voltz, uma loja fictícia de eletrônicos. O cliente faz login e conversa com
um assistente que responde dúvidas sobre **os próprios pedidos**, usando dados reais do PostgreSQL
por meio de *function calling* (tool use).

> **Status:** em construção. Hoje existem o banco (schema, migrations e seed), o login, o cadastro e as rotas
> protegidas. As tools e o chat com IA estão nas próximas fases. Veja o roteiro em [CLAUDE.md](CLAUDE.md) e as
> decisões e problemas reais em [docs/DIARIO.md](docs/DIARIO.md).

## Stack

- Next.js (App Router) + TypeScript
- PostgreSQL + Drizzle ORM (migrations e seed)
- Function calling via Groq (plano gratuito), atrás de uma interface de provedor — *fase 4*
- Autenticação por cookie JWT assinado (`jose`) — *fase 2*
- Vitest e GitHub Actions — *fases 3 e 7*

## Como rodar local

Pré-requisitos: Node.js 20+ e PostgreSQL instalado (usei a versão 18, direto no Windows, sem Docker).

1. Instale as dependências:

   ```bash
   npm install
   ```

2. Crie o banco `pedido_assist` no seu PostgreSQL.

3. Copie `.env.example` para `.env` e preencha a senha do seu usuário do Postgres em `DATABASE_URL`.

4. Crie as tabelas e popule com dados de exemplo:

   ```bash
   npm run db:migrate
   npm run db:seed
   ```

5. Confira a conexão com o banco (opcional) e inicie o servidor de desenvolvimento:

   ```bash
   npm run db:test
   npm run dev
   ```

Abra http://localhost:3000. Você pode entrar com um usuário de demonstração ou criar uma conta em `/cadastro`.

## Usuários de demonstração

O seed cria 3 clientes, todos com a senha `senha123` (dados fictícios, só para o ambiente local):

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
| `npm run db:generate` | Gera uma migration a partir do `schema.ts` |
| `npm run db:migrate` | Aplica as migrations no banco |
| `npm run db:seed` | Apaga e recria os dados de exemplo |
| `npm run db:test` | Testa a conexão com o banco |

## Modelo de dados

`clientes` → `pedidos` → `itens_pedido` → `produtos`, e `pedidos` → `entregas` (no máximo uma por pedido).
O schema está em [`src/lib/db/schema.ts`](src/lib/db/schema.ts).

## O que ainda vem

Diagrama do fluxo (mensagem → LLM → tool → banco → resposta), como a segurança por cliente funciona e
foi testada, resumo do que deu errado no caminho, print e link do deploy.
