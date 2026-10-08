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

## 2026-10-06 (noite) — Fase 1, passos 4 a 6, e Fase 2 (2a a 2g)

### O que foi feito
- Schema das 5 tabelas, migration `0000` aplicada e seed (3 clientes, 8 produtos de eletrônicos, 20 pedidos,
  incluindo cancelados e enviados com entrega atrasada). README reescrito. Fase 1 concluída.
- Fase 2: `jose` e `zod`, `SESSION_SECRET`, sessão por cookie JWT (`token.ts` e `session.ts`),
  `POST /api/login`, `POST /api/logout`, tela de login em português, `proxy.ts`, página `/chat`
  provisória com botão de sair e página inicial que redireciona.
- Falta da Fase 2: cadastro de novos usuários (hoje o "Criar conta" leva a um 404).

### O que deu errado
- Um dos commits falhou: o `git add` apontou para um arquivo (`page.module.css`) que já tinha sido
  removido do índice no commit anterior. Refeito sem esse caminho.
- Falha breve de comunicação: eu achei que o projeto teria cadastro, e a conversa trouxe também a
  recuperação de senha. Resultado: cadastro entrou na Fase 2 e recuperar senha virou bônus.
- Alguns pontos estéticos do front me incomodaram (placeholder do e-mail, subtítulo, tamanho do card).
  Ajustados; o nome do projeto e o fundo do site ficaram para depois.
- No PowerShell, `curl` é apelido do `Invoke-WebRequest`; o certo é `curl.exe`.
- O CLAUDE.md falava em "middleware", mas no Next 16 ele se chama `proxy`, e a documentação diz que
  ele serve só para checagem otimista. Ajustado o desenho e o CLAUDE.md.

### Como eu entendi (e correções)
- Minhas palavras: "O proxy é o responsável pela ponte da aplicação com o banco geral e o setSession é o
  que mantém as sessões ativas por determinado período, então em conjunto é a ponte de acesso e conexão
  da aplicação."
- Correção: o `proxy` não fala com o banco; ele só olha o cookie e redireciona quem não está logado
  (o porteiro). Quem fala com o banco é o `db`. O `getSession()` lê o cookie e confere a assinatura para
  descobrir quem é o cliente logado; o `createSession` é quem cria o cookie (válido por 7 dias).
  Juntos: o `proxy` barra na entrada e o `getSession()` confere o crachá dentro de cada página.

### Decisões
- Nome: loja **Voltz** e assistente **Volt**; fundo com brilhos suaves + grade de pontos. Ainda a aplicar.
- "Esqueci minha senha" fica visível, mas desativado ("em breve"), até a fase bônus.
- Login devolve a mesma mensagem para e-mail inexistente e senha errada, com hash falso para igualar o tempo.
- Sessão JWT sem estado: não dá para invalidar um token antes dos 7 dias de validade.
- Limite de tentativas de login: pendente para a Fase 5.
- Dinheiro como `numeric(10,2)` e somas em centavos no seed, para evitar erro de ponto flutuante.

### Próximo
Cadastro (2f); trocar o nome para Voltz e fazer o fundo; depois a Fase 3 (tools).

## 2026-10-07 — Fase 2: cadastro (2f) e fechamento da fase

### O que foi feito
- Rota `POST /api/cadastro` (validação com zod, hash com bcrypt, quem se cadastra já sai logado).
- Tela `/cadastro` com confirmação de senha, reaproveitando o CSS do login. Testei no navegador e funcionou.
- Fase 2 concluída: login, cadastro, sessão, rotas protegidas e sair.

### O que deu errado
- O `curl.exe` no PowerShell falhou com 400 ao mandar `"Seu Nome"`: o espaço quebrou o JSON em dois
  pedaços. A rota estava certa (recusou o corpo inválido); no PowerShell é mais simples usar
  `Invoke-RestMethod`.
- Depois do teste do cadastro, a conta nova ficou com id 5 e não 4: o insert que falhou (e-mail
  duplicado) já tinha gasto o id 4. A sequência do Postgres não volta atrás; o id só precisa ser único.

### Decisões
- Duplicidade de e-mail tratada pela constraint `UNIQUE` do banco (erro `23505` vira 409), e não por
  uma consulta antes de inserir, para não haver corrida entre dois cadastros simultâneos.
- Senha de 8 a 72 caracteres (o bcrypt só considera os 72 primeiros bytes).
- Aceito que o 409 revele que um e-mail já está cadastrado; e-mail de confirmação fica para o bônus.

### Próximos passos
1. Trocar o nome para **Voltz** (loja) e **Volt** (assistente) em todo lugar (título, telas, README,
   CLAUDE.md) e fazer o fundo com brilhos suaves + grade de pontos, respeitando "reduzir movimento".
2. Atualizar o README: a Fase 2 existe (login e cadastro) e o nome mudou.
3. **Fase 3**: instalar o Vitest e criar o script `npm test` (o CLAUDE.md exige antes de cada commit);
   implementar `listar_pedidos`, `detalhe_pedido` e `rastrear_entrega`, sempre filtrando pelo cliente
   da sessão, com argumentos validados por zod e limite de linhas; escrever o teste "cliente A não
   consegue ver pedido do cliente B".
4. Pendências menores: limite de tentativas de login (Fase 5), decidir o que fazer com a pasta
   `Claudio/`, e rever as vulnerabilidades do `npm audit` (hoje só em ferramentas de desenvolvimento).

## 2026-10-07 (noite) — Voltz, fundo e início da Fase 3 (Vitest)

### O que foi feito
- Nome trocado para **Voltz** (loja) e **Volt** (assistente) nas telas, no título da aba e no README;
  fundo com brilhos suaves e grade de pontos, que respeita "reduzir movimento".
- Criado o documento `docs/ESTUDO.md` com perguntas para eu responder com as minhas palavras.
- Instalado o Vitest, criado o `npm test` e transformado em teste permanente o teste da sessão
  (6 testes de token).

### O que deu errado
- A instalação do Vitest falhou com conflito de dependências: o Vitest 5 pede `@types/node` 22 ou 24+,
  e o projeto estava na 20. Resolvido subindo o `@types/node` para a 24, igual ao Node instalado,
  sem usar `--force`.
- O Vite avisou que a config do Vitest usava sintaxe ESM num arquivo tratado como CommonJS. Resolvido
  renomeando para `vitest.config.mts`.

### Decisões
- Alinhar a versão de `@types/node` com a do Node em uso, em vez de forçar a instalação.
- Os testes de segurança do token vão ficar no repositório e rodar antes de cada commit.

### Próximos passos
1. Responder o `docs/ESTUDO.md` e trazer as respostas para correção.
2. Fase 3: as tools `listar_pedidos`, `detalhe_pedido` e `rastrear_entrega`, sempre filtrando pelo
   cliente da sessão, com `zod` e limite de linhas, e o teste "cliente A não vê pedido do cliente B".
3. Pendências: limite de tentativas de login (Fase 5), pasta `Claudio/` e `npm audit`.
