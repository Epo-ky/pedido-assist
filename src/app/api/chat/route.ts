import { NextResponse } from "next/server";
import { z } from "zod";
import { MAX_MESSAGE_LENGTH, runChat } from "@/lib/ai/chat-loop";
import { groqProvider } from "@/lib/ai/groq-provider";
import { LlmProviderError } from "@/lib/ai/provider";
import { getSession } from "@/lib/auth/session";

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
