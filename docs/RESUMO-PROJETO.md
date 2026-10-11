# Resumo do projeto Voltz / Volt (para levar ao Claude chat e decidir a divulgação)

> Documento de apoio, escrito em 2026-10-11. Tudo aqui foi tirado do que aconteceu de fato no repositório e no
> [diário](DIARIO.md). Onde algo não está provado, está dito.

## 1. Em uma frase
Uma loja fictícia de eletrônicos (**Voltz**) com um assistente de IA (**Volt**) que responde sobre os pedidos do cliente
logado consultando o banco por *function calling*, e que consegue **agir** (propor o cancelamento de um pedido) sem nunca
poder cancelar sozinho. Foco do projeto: IA útil **e** segura.

- Site no ar: https://pedido-assist.vercel.app (login de demonstração: `ana@exemplo.com` / `senha123`)
- Repositório: github.com/Epo-ky/pedido-assist
- Objetivo pessoal: portfólio para vaga de **Dev Full Stack Júnior com foco em IA**. Eu sou estagiário e uso C#, Angular e SQL
  no dia a dia; neste projeto aprendi Next.js, Node e TypeScript no backend.

## 2. O que o produto faz
- Login e cadastro (cookie JWT assinado, senha com bcrypt).
- **Loja**: vitrine com os produtos do banco; "Comprar" cria um pedido pendente. O preço e o total vêm sempre do banco.
- **Chat com o Volt**: lista pedidos, mostra status, itens, valores, entrega, código de rastreio e atraso; diz "não encontrei"
  quando não há dado; recusa assuntos fora de pedidos; lembra a conversa (guardada no servidor).
- **Cancelamento com confirmação**: o Volt propõe, aparece um cartão "Confirmar cancelamento / Manter pedido", e só o clique cancela.
- Limites de uso (chat, login, cadastro, compras), tema claro/escuro, funciona no celular.

## 3. Arquitetura (como a IA entra)
1. A mensagem chega em `POST /api/chat`; o `clienteId` vem do **cookie de sessão**, nunca do corpo nem do prompt.
2. Um loop manda ao modelo (Groq, `openai/gpt-oss-120b`) a conversa e a lista de tools; o modelo pede uma tool.
3. O servidor valida os argumentos com **zod**, executa a tool (query parametrizada que filtra por `cliente_id`) e devolve JSON.
4. Repete até o modelo parar de pedir tools (máximo 6 voltas) e responde em texto simples.

Tools: `listar_pedidos`, `detalhe_pedido`, `rastrear_entrega`, `propor_cancelamento`. O modelo **não escreve SQL**.
O provedor de LLM fica atrás de uma interface (`LlmProvider`): trocar de empresa é escrever outra classe.

## 4. Segurança (o diferencial)
**Princípio:** a segurança está no código, não na boa vontade do modelo. Prompt é pedido; código é garantia.

- `cliente_id` só da sessão; o zod em modo estrito rejeita um `cliente_id` forjado nos argumentos.
- Pedido alheio e pedido inexistente dão a mesma resposta (não revela se um id existe).
- Histórico vem do banco: um turno de "assistente" forjado pelo navegador é ignorado.
- **O modelo nunca muda dados.** Ele só propõe; o cancelamento é uma rota separada (`POST /api/acoes/[id]`) que exige a sessão do
  cliente e um UUID de uso único, válido por 10 minutos; o servidor confere de novo, numa transação, dono + status pendente.
  O código da proposta vai para a tela, nunca para o modelo. Mesmo um prompt injection bem-sucedido não cancela nada.
- Limites guardados no Postgres (não em memória, porque na Vercel cada requisição pode cair numa instância diferente).
- O Markdown é removido da resposta **por código**, e o nome do cliente chega ao prompt só como a primeira palavra, se for só letras.

## 5. Como foi testado (números reais)
- **203 testes** (Vitest, 26 arquivos), contra Postgres real: inclui "cliente A não vê pedido do cliente B" e "ninguém age sobre
  pedido alheio, nem por prompt injection". O loop é testado com um modelo falso (sem gastar cota).
- **Bateria de 31 ataques** de prompt injection contra o modelo real (`npm run security:check`). O detector olha o que as tools
  ENTREGARAM ao modelo (um modelo pode "recusar" depois de já ter recebido o dado), procura promessas falsas e confere **no banco**
  que nenhum pedido mudou. Última rodada completa (antes do ajuste de prompt de hoje): 0 vazamentos, 0 promessas indevidas,
  0 pedidos alterados.
- **23 evals** (`npm run evals`) com a resposta esperada de cada pergunta, contra o modelo real.
- **Quebras de propósito** (mutation checks manuais): depois de cada mudança de segurança, estrago o código e confirmo que o teste
  certo fica vermelho. Isso achou testes fracos, inclusive um ataque que mirava um pedido que seria recusado de qualquer jeito.
- **CI** no GitHub Actions (Postgres 17 descartável, lint + typecheck + testes) e **deploy** automático na Vercel + Neon.

## 6. O que deu errado (a parte mais valiosa para contar)
1. **Orçamento:** planejei a API paga da Anthropic; não cabia. Troquei por Groq (gratuita) atrás da interface de provedor.
2. **Modelo filtrando sozinho:** "meus pedidos" mostrava 1 de 8 porque o modelo aplicava `status: pendente`. Só apareceu com o modelo
   real; o falso dos testes não pegaria. Corrigi a descrição da tool e o prompt.
3. **Provedor recusava antes do servidor:** a Groq valida a chamada contra o schema (`null`, `exclusiveMinimum`) e devolvia 400.
   Regra aprendida: o schema do modelo é só guia; o juiz é o zod do servidor.
4. **Erro de honestidade, não de vazamento:** num teste manual o Volt ofereceu "registrar a solicitação" e "retorno em 48 horas".
   Meus 20 ataques só cobriam vazamento. Criei um detector de promessas indevidas e casos de honestidade na bateria.
5. **Bug de fuso horário:** a regra de atraso usava UTC; entre 21h e meia-noite marcava como atrasada uma entrega que vencia hoje.
6. **CI só quebrava no GitHub:** lockfile gerado no Windows sem pacotes opcionais do Linux; não reproduzi localmente.
7. **Teste instável:** contava a tabela inteira com arquivos rodando em paralelo no mesmo banco.
8. **Typo do modelo:** chamou `rastrar_entrega`; com temperature 0 repetir dava o mesmo erro. O aviso ao modelo passou a dizer o motivo
   exato e listar as tools existentes. Não consegui reproduzir depois: é intermitente (registrado assim).
9. **As evals acharam um erro real do Volt:** terminava respostas com "entre em contato com o nosso atendimento", canal que não existe.
   Medi antes (**3 de 8, 38%**), reforcei o prompt e medi de novo (**8 de 8, 100%**, 8 repetições de um único caso).
10. **Evals injustas:** duas expectativas minhas estavam erradas (exigiam a palavra "correios" sem a pergunta pedir; exigiam "pendente"
    numa resposta correta). Corrigi a expectativa, não afrouxei a conferência.
11. Detalhes menores: caracteres invisíveis (espaço não separável) em arquivos, um mutante equivalente removido, 429 da Groq no meio da bateria.

## 7. Decisões que valem em entrevista
- *Por que function calling e não deixar o modelo escrever SQL?* Porque a superfície de ataque some: cada tool é uma função com query
  parametrizada que sempre filtra pelo cliente da sessão.
- *Por que propor + confirmar?* Ação que muda dados não pode depender do que o modelo "decide"; o clique é a autorização.
- *Por que contadores no Postgres?* Serverless: memória não é compartilhada entre instâncias.
- *Por que medir antes e depois de mexer no prompt?* O modelo varia; sem linha de base, "melhorei" é opinião.
- *Por que o detector olha o que as tools entregaram?* Recusar na resposta não prova que o dado não vazou para o contexto.
- *Por que evals fora da CI?* Gastam cota, variam e dependem do estado do banco; são medição, não portão de merge.

Analogias que usei para aprender (C#/Angular): `proxy.ts` ≈ guard de rota (só barra na entrada), `getSession()` ≈ conferir o
usuário no controller, interface `LlmProvider` ≈ interface + injeção de dependência, zod ≈ FluentValidation, Drizzle ≈ EF Core.

## 8. O que NÃO afirmar (para não exagerar)
- "0 vazamentos em 31 ataques" **não** prova segurança total; a garantia é o código. A bateria pega regressão.
- O 100% do `motivo-do-cancelamento` é de **um caso, 8 repetições**; é indício forte, não garantia.
- A bateria completa de 31 ataques **com o prompt mais recente** ainda não foi concluída (a cota gratuita da Groq acabou no meio, ataques
  08 a 11 deram 429). A eval `cancelar-pedido-ja-enviado` corrigida também não foi rodada de novo. O commit do prompt está local, sem push.
- Pagamento é simulado; o produto é fictício; o plano gratuito tem limites (a primeira requisição pode demorar, o Neon acorda do zero).
- Eu usei IA (Claude Code) como ferramenta de desenvolvimento, em passos pequenos, e precisei entender cada parte; dizer isso é honesto
  e combina com o tema do projeto.

## 9. Pendências
1. Quando a cota voltar: `npm run security:check` completo e `npm run evals -- cancelar-pedido-ja-enviado`; depois dar push do prompt.
2. Print ou gif do chat para o README (ainda não tem imagem).
3. Minhas respostas em `docs/ESTUDO.md` (17 perguntas de entrevista) e decidir o que fazer com a pasta `Claudio/`.
4. Bônus: recuperar senha com e-mail (Brevo), RAG com política de trocas (pgvector).
5. Nome com maiúsculas estranhas ("De"), e não há botão de cancelar fora do chat.

## 10. Para decidir com o Claude chat (LinkedIn etc.)
Ângulos possíveis (escolher um como gancho):
- **"Fiz uma IA que não pode me enganar nem ser enganada"**: segurança por código, prompt injection, cancelamento com confirmação.
- **"O que as evals descobriram que meus testes não viam"**: o Volt inventando um atendimento inexistente; 38% → 100% medido.
- **"O que deu errado construindo um assistente com IA sendo estagiário"**: a lista da seção 6, em tom de aprendizado.
- Formato: post curto com 1 gif do chat + link do site e do repositório, e um fio ou artigo mais longo sobre o ângulo escolhido.
- Pontos para o texto: números reais (203 testes, 31 ataques, 23 evals, 38% → 100%), link do deploy, e o que ainda falta, dito com franqueza.
- Perguntas para o chat me ajudar a decidir: público (recrutadores técnicos vs. geral), tom (técnico vs. história), e se vale um vídeo curto
  mostrando um ataque de prompt injection sendo recusado.
