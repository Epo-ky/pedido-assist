import { NextResponse } from "next/server";
import { getSession } from "@/lib/auth/session";
import { esperaEmMinutos, tooManyRequests } from "@/lib/http";
import { createOrder, MAX_QUANTIDADE_POR_ITEM, novoPedidoSchema, ProdutoInexistenteError } from "@/lib/orders";
import { consumeRateLimit } from "@/lib/rate-limit";
import { COMPRA_POR_CLIENTE } from "@/lib/rate-rules";

// Da requisição vêm só QUAIS produtos e QUANTAS unidades. O cliente vem da sessão, e o preço e o total vêm do banco.
export async function POST(request: Request) {
  const sessao = await getSession();
  if (!sessao) {
    return NextResponse.json({ erro: "Faça login para comprar." }, { status: 401 });
  }

  const corpo = await request.json().catch(() => null);
  const dados = novoPedidoSchema.safeParse(corpo);
  if (!dados.success) {
    return NextResponse.json(
      { erro: `Escolha de 1 a ${MAX_QUANTIDADE_POR_ITEM} unidades de cada produto.` },
      { status: 400 },
    );
  }

  try {
    // Depois da validação: um pedido inválido não gasta o limite de compras.
    const limite = await consumeRateLimit(`compra:cliente:${sessao.clienteId}`, COMPRA_POR_CLIENTE);
    if (!limite.allowed) {
      return tooManyRequests(
        `Você já fez ${COMPRA_POR_CLIENTE.max} compras na última hora. Tente de novo em ${esperaEmMinutos(limite.retryAfterSeconds)}.`,
        limite.retryAfterSeconds,
      );
    }

    const pedido = await createOrder(sessao.clienteId, dados.data);
    return NextResponse.json({ pedido }, { status: 201 });
  } catch (error) {
    if (error instanceof ProdutoInexistenteError) {
      return NextResponse.json({ erro: "Esse produto não existe mais." }, { status: 404 });
    }

    // Detalhes técnicos ficam só no log do servidor.
    console.error("Falha no /api/pedidos", error);
    return NextResponse.json(
      { erro: "Não foi possível finalizar a compra agora. Tente novamente em instantes." },
      { status: 503 },
    );
  }
}
