import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH, runChat } from "@/lib/ai/chat-loop";
import { groqProvider } from "@/lib/ai/groq-provider";
import { LlmProviderError } from "@/lib/ai/provider";
import { getSession } from "@/lib/auth/session";
import { esperaEmMinutos, tooManyRequests } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { CHAT_GLOBAL, CHAT_POR_CLIENTE } from "@/lib/rate-rules";

// Só a mensagem e o histórico vêm do navegador. O cliente NÃO: ele vem da sessão.
// O zod remove campos desconhecidos, então um "clienteId" no corpo é simplesmente ignorado.
const bodySchema = z.object({
  message: z.string().trim().min(1).max(MAX_MESSAGE_LENGTH),
  history: z.array(z.unknown()).max(100).optional(),
});

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

    const resultado = await runChat({
      provider: groqProvider,
      clienteId: sessao.clienteId,
      history: dados.data.history ?? [],
      message: dados.data.message,
    });

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
