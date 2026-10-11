import { inArray } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/lib/db";
import { itensPedido, pedidos, produtos } from "@/lib/db/schema";

export const MAX_QUANTIDADE_POR_ITEM = 5;
const MAX_ITENS_DIFERENTES = 8;

// O que o navegador pode mandar: QUAIS produtos e QUANTAS unidades. Nunca preço, total, status nem cliente:
// qualquer campo a mais (preco, total, clienteId...) é descartado pelo zod e não chega a lugar nenhum.
export const novoPedidoSchema = z
  .object({
    itens: z
      .array(
        z.object({
          produtoId: z.number().int().positive(),
          quantidade: z.number().int().min(1).max(MAX_QUANTIDADE_POR_ITEM),
        }),
      )
      .min(1)
      .max(MAX_ITENS_DIFERENTES),
  })
  .refine(({ itens }) => new Set(itens.map((item) => item.produtoId)).size === itens.length, {
    message: "O mesmo produto não pode aparecer duas vezes.",
  });

export type NovoPedido = z.infer<typeof novoPedidoSchema>;

export class ProdutoInexistenteError extends Error {
  constructor(readonly produtoId: number) {
    super(`O produto ${produtoId} não existe.`);
    this.name = "ProdutoInexistenteError";
  }
}

// Dinheiro em centavos inteiros para somar sem erro de ponto flutuante (0.1 + 0.2 em número dá 0.30000000000000004).
// O banco guarda numeric(10,2), então Number(preco) * 100 é exato depois do arredondamento.
const paraCentavos = (preco: string) => Math.round(Number(preco) * 100);
const paraReais = (centavos: number) => (centavos / 100).toFixed(2);

export type PedidoCriado = {
  id: number;
  total: string;
  itens: { produto: string; quantidade: number; precoUnitario: string }[];
};

// Cria um pedido PENDENTE para o cliente. O clienteId vem da SESSÃO (parâmetro à parte), os preços vêm do BANCO
// e tudo acontece numa transação: se qualquer parte falhar, nada fica gravado.
export async function createOrder(clienteId: number, entrada: unknown): Promise<PedidoCriado> {
  // Defesa em profundidade: valida de novo mesmo que quem chamou já tenha validado.
  const { itens } = novoPedidoSchema.parse(entrada);

  return db.transaction(async (tx) => {
    const catalogo = await tx
      .select({ id: produtos.id, nome: produtos.nome, preco: produtos.preco })
      .from(produtos)
      .where(inArray(produtos.id, itens.map((item) => item.produtoId)));

    const porId = new Map(catalogo.map((produto) => [produto.id, produto]));

    const linhas = itens.map((item) => {
      const produto = porId.get(item.produtoId);
      if (!produto) throw new ProdutoInexistenteError(item.produtoId);
      return { ...item, produto };
    });

    const totalCentavos = linhas.reduce(
      (soma, { produto, quantidade }) => soma + paraCentavos(produto.preco) * quantidade,
      0,
    );

    const [pedido] = await tx
      .insert(pedidos)
      .values({ clienteId, status: "pendente", total: paraReais(totalCentavos) })
      .returning({ id: pedidos.id });

    await tx.insert(itensPedido).values(
      linhas.map(({ produtoId, quantidade, produto }) => ({
        pedidoId: pedido.id,
        produtoId,
        quantidade,
        // Foto do preço no momento da compra: se o preço do produto mudar depois, o pedido antigo não muda.
        precoUnitario: produto.preco,
      })),
    );

    return {
      id: pedido.id,
      total: paraReais(totalCentavos),
      itens: linhas.map(({ quantidade, produto }) => ({
        produto: produto.nome,
        quantidade,
        precoUnitario: produto.preco,
      })),
    };
  });
}
