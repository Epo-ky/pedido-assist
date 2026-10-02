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
