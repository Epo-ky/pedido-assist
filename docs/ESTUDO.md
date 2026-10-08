# Estudo: escreva com as suas palavras

Objetivo: treinar para explicar o projeto em entrevista. **Não precisa rodar nada.** Responda em poucas linhas,
do seu jeito. Errar é esperado: depois você cola as respostas na conversa com o Claude e ele corrige.
Pode abrir o código no GitHub para consultar: https://github.com/Epo-ky/pedido-assist

Dica: se não souber, escreva "não sei". Isso também é uma resposta útil.

---

## Parte 1 — O quadro geral (5 minutos)

**1.** Em 3 ou 4 frases: o que é o projeto e que problema ele resolve?

> Sua resposta:

**2.** Desenhe com palavras o caminho de uma pergunta do cliente até a resposta.
Use estes blocos, na ordem que você achar certa: *cliente, tela de chat, rota da API, Claude (IA), tool, banco de dados*.

> Sua resposta:

**3.** Por que o cliente **nunca** deve ver o pedido de outro cliente? Em qual parte do caminho acima essa garantia acontece?

> Sua resposta:

---

## Parte 2 — Conceitos que já construímos

**4.** O que é uma **migration** e por que não criamos as tabelas "na mão" no banco?
*(consulte: `drizzle/` e `src/lib/db/schema.ts`)*

> Sua resposta:

**5.** Por que a senha é guardada como **hash** e não criptografada? O que acontece se o banco vazar?
*(consulte: `scripts/seed.ts`, procure `bcrypt`)*

> Sua resposta:

**6.** O que é o **JWT** guardado no cookie? Por que alguém não consegue trocar o `clienteId` dele para 2?
*(consulte: `src/lib/auth/token.ts`)*

> Sua resposta:

**7.** O `proxy.ts` e o `getSession()` parecem fazer a mesma coisa. Qual é a diferença entre eles, e por que usamos os dois?
*(consulte: `src/proxy.ts` e `src/app/chat/page.tsx`)*

> Sua resposta:

**8.** Por que o login responde a **mesma mensagem** para "e-mail não existe" e "senha errada"?
*(consulte: `src/app/api/login/route.ts`)*

> Sua resposta:

**9.** O que é o `zod` e por que validamos o corpo da requisição se o formulário do navegador já valida?
*(consulte: `src/app/api/cadastro/route.ts`)*

> Sua resposta:

**10.** O cadastro não consulta "o e-mail já existe?" antes de inserir. Como o duplicado é impedido, e por que isso é mais seguro?

> Sua resposta:

---

## Parte 3 — Ler o código e prever (sem rodar)

**11.** Leia `src/lib/auth/token.ts`. O que `verifySession` devolve nestes casos?
(a) token válido; (b) token expirado; (c) token assinado com outra chave; (d) sem token.

> Sua resposta:

**12.** Leia `scripts/seed.ts`. Se eu rodar `npm run db:seed` duas vezes seguidas, o banco fica com 20 pedidos ou com 40? Por quê?

> Sua resposta:

**13.** No `src/lib/db/schema.ts`, o que impede de criar um pedido para um cliente que não existe?

> Sua resposta:

---

## Parte 4 — Escreva você mesmo (preparando a Fase 3)

Aqui não precisa estar certo. É para você pensar antes de eu mostrar a solução.

**14.** Escreva em português (ou em SQL, se preferir) a consulta da tool `listar_pedidos`: *"devolva os pedidos do
cliente logado, filtrando por status se ele pedir"*. Onde entra o `cliente_id` e de onde ele vem?

> Sua resposta:

**15.** A tool `detalhe_pedido` recebe um `pedido_id`. Um cliente mal-intencionado manda o id de um pedido que
**não é dele**. O que a tool deve responder? Como garantir isso na consulta?

> Sua resposta:

**16.** O modelo de IA decide quais tools chamar, mas **não** escreve SQL. Por que essa separação importa para a segurança?

> Sua resposta:

---

## Parte 5 — Pergunta de entrevista

**17.** Responda como se fosse a um recrutador, em até 6 linhas:
*"Como você garantiu que o seu assistente de IA não vaza dados de outros clientes?"*
(Ainda não construímos tudo, então responda com o que você já sabe e o que planeja fazer.)

> Sua resposta:

---

## Para você anotar

- Palavras que eu não conhecia:
- O que ainda está confuso:
- O que eu consegui explicar bem:
