import { eq } from "drizzle-orm";
import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_HISTORY_MESSAGES, MAX_MESSAGE_LENGTH, runChat } from "@/lib/ai/chat-loop";
import { groqProvider } from "@/lib/ai/groq-provider";
import { LlmProviderError } from "@/lib/ai/provider";
import { getSession } from "@/lib/auth/session";
import { clearHistory, loadHistory, saveExchange } from "@/lib/chat-history";
import { esperaEmMinutos, tooManyRequests } from "@/lib/http";
import { db } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";
import { CHAT_GLOBAL, CHAT_POR_CLIENTE } from "@/lib/rate-rules";

// Só a mensagem vem do navegador. O cliente NÃO (vem da sessão) e o histórico TAMBÉM NÃO (vem do banco): assim
// ninguém consegue forjar um turno do "assistente". O zod remove campos desconhecidos, então um "clienteId" ou
// um "history" no corpo são simplesmente ignorados.
const bodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
});

// Tempo máximo da função na Vercel (segundos). Uma pergunta pode fazer várias idas ao modelo e ao banco,
// e o primeiro acesso depois de um tempo parado ainda espera o Neon acordar.
export const maxDuration = 30;

export async function POST(request: Request) {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para conversar com o Volt." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const dados = bodySchema.safeParse(corpo);
  if (!dados.success) {
    return NextResponse.json(
      { erro: `Escreva uma mensagem de até ${MAX_MESSAGE_LENGTH} caracteres.` },
      { status: 400 },
    );
  }

  try {
    // Primeiro o limite do cliente, depois o global: assim quem já estourou o próprio limite é barrado
    // antes de consumir a cota de todos (as tentativas bloqueadas também contam).
    const doCliente = await consumeRateLimit(`chat:cliente:${sessao.clienteId}`, CHAT_POR_CLIENTE);
    if (!doCliente.allowed) {
      return tooManyRequests(
        `Você atingiu o limite de ${CHAT_POR_CLIENTE.max} mensagens por hora. Tente de novo em ${esperaEmMinutos(doCliente.retryAfterSeconds)}.`,
        doCliente.retryAfterSeconds,
      );
    }

    const global = await consumeRateLimit("chat:global", CHAT_GLOBAL);
    if (!global.allowed) {
      return tooManyRequests(
        "O Volt atingiu o limite de uso de hoje. Volte amanhã, ou tente de novo mais tarde.",
        global.retryAfterSeconds,
      );
    }

    // O nome vem do banco, a partir do cliente da sessão. Um "nome" enviado no corpo é ignorado.
    const [cliente] = await db
      .select({ nome: clientes.nome })
      .from(clientes)
      .where(eq(clientes.id, sessao.clienteId))
      .limit(1);

    const resultado = await runChat({
      provider: groqProvider,
      clienteId: sessao.clienteId,
      nomeCliente: cliente?.nome,
      history: await loadHistory(sessao.clienteId, MAX_HISTORY_MESSAGES),
      message: dados.data.message,
    });

    // Só guarda quando o modelo respondeu de verdade: uma desculpa nossa ("não consegui gerar uma resposta")
    // no histórico confundiria as próximas respostas. Se gravar falhar, o cliente ainda recebe a resposta.
    if (resultado.answered) {
      try {
        await saveExchange(sessao.clienteId, dados.data.message, resultado.reply);
      } catch (error) {
        console.error("Não foi possível guardar o histórico do chat", error);
      }
    }

    return NextResponse.json({ resposta: resultado.reply });
  } catch (error) {
    if (error instanceof LlmProviderError && error.kind === "rate_limit") {
      return NextResponse.json(
        { erro: "O Volt recebeu muitas perguntas agora. Tente de novo em alguns instantes." },
        { status: 429 },
      );
    }

    // Detalhes técnicos ficam só no log do servidor.
    console.error("Falha no /api/chat", error);
    return NextResponse.json(
      { erro: "O Volt está indisponível no momento. Tente novamente em instantes." },
      { status: 503 },
    );
  }
}

// O histórico do próprio cliente (usado ao abrir o chat e para conferência). Só devolve o da sessão.
export async function GET() {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para ver a conversa." }, { status: 401 });
  }

  return NextResponse.json({ mensagens: await loadHistory(sessao.clienteId) });
}

// "Limpar conversa": apaga só o histórico do cliente da sessão.
export async function DELETE() {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para limpar a conversa." }, { status: 401 });
  }

  await clearHistory(sessao.clienteId);
  return NextResponse.json({ ok: true });
}
