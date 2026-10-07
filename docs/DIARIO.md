# Diário do projeto

## 2026-10-01 — Fase 1, passos 1 e 2

### O que foi feito
- Projeto criado com `create-next-app` (Next 16, App Router, TypeScript, ESLint, `src/`, sem Tailwind).
- Script `typecheck` adicionado ao `package.json`.
- PostgreSQL 18 (já instalado no Windows, em `D:\Program Files\PostgreSQL\18`) conectado ao projeto.
  Banco `pedido_assist` criado; conexão testada com sucesso via `DATABASE_URL` no `.env`.
- `.env.example` criado; `.env` ignorado pelo git.
- Repositório publicado em https://github.com/Epo-ky/pedido-assist (branch `main`).
- Regra de idioma registrada no `CLAUDE.md`.

### O que deu errado
- **Docker Desktop não instalou.** O `winget install` baixou e verificou o instalador, mas terminou com
  código 1 logo após pedir permissão de administrador. A causa não foi confirmada (UAC não aceito ou WSL2
  desabilitado). Resolvido contornando: usei o Postgres nativo.
- **`npm start` não abriu a página.** `start` serve o build de produção e exige `npm run build` antes.
  Para desenvolver, o comando é `npm run dev`.
- **`tsc --noEmit` falhou com `Cannot find name 'LayoutProps'`.** O tipo é gerado pelo Next (route types)
  e não existia porque a `.next` não tinha sido gerada. Corrigido com o script
  `next typegen && tsc --noEmit`.
- **`.env.example` não aparecia no `git status`.** O padrão `.env*` do `.gitignore` também o ignorava.
  Corrigido com `!.env.example`.
- **Push falhou: `src refspec main does not match any`.** O repositório local já existia e a branch se
  chamava `master`. Renomeada para `main`.
- **Senha do Postgres esquecida.** Redefinida editando temporariamente o `pg_hba.conf` para `trust`,
  trocando a senha com `\password` e restaurando o arquivo. Conferido depois que não restou nenhuma
  linha `trust` ativa.

### Decisões
- **Postgres nativo no Windows, sem Docker.** O Docker não instalou e o Postgres já estava na máquina.
  Consequência: o "Como rodar local" do README final não usa `docker compose up`.
- **Idioma:** produto, docs, commits e nomes de domínio (tabelas, tools) em português; nomes de
  variáveis, funções e arquivos de código em inglês.
- **Projeto gerado fora da pasta e copiado,** porque o nome "Pedido Assist" (espaço e maiúscula) é
  inválido como nome de pacote npm; o pacote se chama `pedido-assist`.
- **Deploy (Vercel/Neon) fica para a Fase 7.** Nada foi publicado além do repositório no GitHub.

### Próximo passo
Passo 3: Drizzle ORM e conexão com o banco em `src/lib/db/`.

> Nota: rascunho escrito a partir do que aconteceu na sessão. Ajuste com as suas palavras o que quiser.

## 2026-10-06 — Fase 1, passo 3 (Drizzle + conexão com o banco)

### O que foi feito
- Instalados `drizzle-orm`, `pg`, `drizzle-kit`, `@types/pg` e `tsx`.
- Criado `src/lib/db/index.ts` com o `Pool` do `pg` e o `db` do Drizzle.
- Criado `scripts/test-db.ts` e o script `npm run db:test`: o código consegue consultar o Postgres.

### O que deu errado
- Rodei o `npm ls` no terminal na pasta errada (`C:\Users\Evando`) e ele mostrou `(empty)`.
  O terminal precisa estar dentro da pasta do projeto.
- Depois de instalar, o `npm audit` foi de 0 para 9 vulnerabilidades. Eu fiquei perdido sobre isso.
  Explicação: vêm de ferramentas de desenvolvimento (`drizzle-kit` e `eslint-config-next`), não
  do que vai para produção. Decisão: não rodar `npm audit fix --force`.

### Como eu entendi (e correções)
- `--env-file`: eu entendi como "o que mantém a criptografia do projeto".
  Correção: ele só carrega as variáveis do `.env` (como a senha do banco) quando o script roda fora do Next.
- `pool`: eu entendi como "o final da aplicação, o que puxa ela".
  Correção: é um grupo de conexões reaproveitadas com o banco; `pool.end()` fecha essas conexões.

### Decisões
- Só segui o passo a passo; ainda estou confuso sobre o que tudo faz e o propósito final.
  Próxima sessão: reler o fluxo geral (cliente → chat → IA → tool → banco) antes de seguir para o Passo 4.
