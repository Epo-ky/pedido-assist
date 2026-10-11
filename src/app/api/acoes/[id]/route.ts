import { NextResponse } from "next/server";
import { z } from "zod";
import { AcaoInvalidaError, confirmAction, declineAction } from "@/lib/actions";
import { getSession } from "@/lib/auth/session";
import { esperaEmMinutos, tooManyRequests } from "@/lib/http";
import { consumeRateLimit } from "@/lib/rate-limit";
import { ACAO_POR_CLIENTE } from "@/lib/rate-rules";

const corpoSchema = z.object({ decisao: z.enum(["confirmar", "recusar"]) });
const idSchema = z.string().uuid();

// É AQUI que o cancelamento acontece de verdade, e só chega aqui o clique do cliente (com a sessão dele).
// O modelo não tem como chamar esta rota: ele só tem as ferramentas listadas em /lib/tools.
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para continuar." }, { status: 401 });
  }

  const { id } = await params;
  const corpo = await request.json().catch(() => null);
  const decisao = corpoSchema.safeParse(corpo);
  if (!decisao.success) {
    return NextResponse.json({ erro: "Escolha confirmar ou recusar." }, { status: 400 });
  }

  // Um código que nem tem o formato certo recebe a mesma resposta de um código que não existe.
  if (!idSchema.safeParse(id).success) {
    return NextResponse.json({ erro: "Essa confirmação não existe mais ou já expirou. Peça de novo ao Volt." }, { status: 404 });
  }

  try {
    const limite = await consumeRateLimit(`acao:cliente:${sessao.clienteId}`, ACAO_POR_CLIENTE);
    if (!limite.allowed) {
      return tooManyRequests(
        `Muitas tentativas seguidas. Tente de novo em ${esperaEmMinutos(limite.retryAfterSeconds)}.`,
        limite.retryAfterSeconds,
      );
    }

    if (decisao.data.decisao === "recusar") {
      await declineAction(sessao.clienteId, id);
      return NextResponse.json({ ok: true, mensagem: "Tudo certo: o pedido foi mantido." });
    }

    const { pedidoId } = await confirmAction(sessao.clienteId, id);
    return NextResponse.json({ ok: true, pedidoId, mensagem: `Pedido nº ${pedidoId} cancelado.` });
  } catch (error) {
    if (error instanceof AcaoInvalidaError) {
      const status = error.codigo === "pedido_nao_cancelavel" ? 409 : 404;
      return NextResponse.json({ erro: error.message }, { status });
    }

    // Detalhes técnicos ficam só no log do servidor.
    console.error("Falha no /api/acoes", error);
    return NextResponse.json({ erro: "Não foi possível concluir agora. Tente novamente em instantes." }, { status: 503 });
  }
}
