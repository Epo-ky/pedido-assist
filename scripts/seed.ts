import bcrypt from "bcryptjs";
import { sql } from "drizzle-orm";
import { dateInBrazil } from "../src/lib/dates";
import { db, pool } from "../src/lib/db";
import {
  clientes,
  entregas,
  itensPedido,
  pedidos,
  produtos,
} from "../src/lib/db/schema";

type StatusPedido = "pendente" | "pago" | "enviado" | "entregue" | "cancelado";

type PedidoSeed = {
  cliente: number;
  status: StatusPedido;
  diasAtras: number;
  itens: [produto: number, quantidade: number][];
  entrega?: { transportadora: string; previsaoEmDias: number };
};

// Senha de demonstração, só para o ambiente local.
const SENHA_DEMO = "senha123";

const CLIENTES = [
  { nome: "Ana Souza", email: "ana@exemplo.com" },
  { nome: "Bruno Lima", email: "bruno@exemplo.com" },
  { nome: "Carla Mendes", email: "carla@exemplo.com" },
];

// Preços em centavos para somar sem erro de ponto flutuante.
const PRODUTOS = [
  { nome: "Fone Bluetooth com cancelamento de ruído", centavos: 19990 },
  { nome: "Mouse sem fio", centavos: 8990 },
  { nome: "Teclado mecânico", centavos: 34990 },
  { nome: 'Monitor 24"', centavos: 89990 },
  { nome: "Webcam Full HD", centavos: 21990 },
  { nome: "Carregador USB-C 65W", centavos: 12990 },
  { nome: "Hub USB-C 7 em 1", centavos: 15990 },
  { nome: "Cabo HDMI 2 metros", centavos: 2990 },
];

// previsaoEmDias negativa = previsão no passado (se o status é "enviado", o pedido está atrasado).
const PEDIDOS: PedidoSeed[] = [
  // Ana
  { cliente: 0, status: "entregue", diasAtras: 40, itens: [[0, 1]], entrega: { transportadora: "Correios", previsaoEmDias: -30 } },
  { cliente: 0, status: "entregue", diasAtras: 25, itens: [[2, 1], [1, 1]], entrega: { transportadora: "Jadlog", previsaoEmDias: -15 } },
  { cliente: 0, status: "enviado", diasAtras: 6, itens: [[3, 1]], entrega: { transportadora: "Correios", previsaoEmDias: 2 } },
  { cliente: 0, status: "enviado", diasAtras: 12, itens: [[4, 1], [7, 2]], entrega: { transportadora: "Loggi", previsaoEmDias: -4 } },
  { cliente: 0, status: "pago", diasAtras: 2, itens: [[5, 1]] },
  { cliente: 0, status: "pendente", diasAtras: 1, itens: [[6, 1]] },
  { cliente: 0, status: "cancelado", diasAtras: 18, itens: [[0, 1], [7, 1]] },
  { cliente: 0, status: "entregue", diasAtras: 60, itens: [[1, 2]], entrega: { transportadora: "Correios", previsaoEmDias: -50 } },
  // Bruno
  { cliente: 1, status: "entregue", diasAtras: 35, itens: [[3, 1], [7, 1]], entrega: { transportadora: "Loggi", previsaoEmDias: -27 } },
  { cliente: 1, status: "enviado", diasAtras: 9, itens: [[2, 1]], entrega: { transportadora: "Jadlog", previsaoEmDias: -6 } },
  { cliente: 1, status: "enviado", diasAtras: 4, itens: [[0, 1]], entrega: { transportadora: "Correios", previsaoEmDias: 4 } },
  { cliente: 1, status: "pago", diasAtras: 3, itens: [[4, 1], [5, 1]] },
  { cliente: 1, status: "cancelado", diasAtras: 22, itens: [[6, 1], [1, 1]] },
  { cliente: 1, status: "entregue", diasAtras: 50, itens: [[5, 2]], entrega: { transportadora: "Correios", previsaoEmDias: -42 } },
  { cliente: 1, status: "pendente", diasAtras: 0, itens: [[7, 3]] },
  // Carla
  { cliente: 2, status: "enviado", diasAtras: 5, itens: [[2, 1], [0, 1]], entrega: { transportadora: "Loggi", previsaoEmDias: 3 } },
  { cliente: 2, status: "entregue", diasAtras: 30, itens: [[4, 1]], entrega: { transportadora: "Jadlog", previsaoEmDias: -20 } },
  { cliente: 2, status: "pago", diasAtras: 1, itens: [[3, 1]] },
  { cliente: 2, status: "cancelado", diasAtras: 14, itens: [[2, 1]] },
  { cliente: 2, status: "pendente", diasAtras: 2, itens: [[6, 2], [7, 1]] },
];

const DIA_EM_MS = 24 * 60 * 60 * 1000;

function diasAPartirDeHoje(dias: number): Date {
  return new Date(Date.now() + dias * DIA_EM_MS);
}

function paraReais(centavos: number): string {
  return (centavos / 100).toFixed(2);
}

async function main() {
  try {
    await db.transaction(async (tx) => {
      // Limpa tudo e reinicia os ids, para o seed poder rodar quantas vezes quiser.
      await tx.execute(
        sql`truncate table entregas, itens_pedido, pedidos, produtos, clientes restart identity cascade`,
      );

      const senhaHash = bcrypt.hashSync(SENHA_DEMO, 10);
      const clientesCriados = await tx
        .insert(clientes)
        .values(CLIENTES.map((c) => ({ ...c, senhaHash })))
        .returning({ id: clientes.id });

      const produtosCriados = await tx
        .insert(produtos)
        .values(
          PRODUTOS.map((p) => ({ nome: p.nome, preco: paraReais(p.centavos) })),
        )
        .returning({ id: produtos.id });

      for (const [indice, pedido] of PEDIDOS.entries()) {
        const totalCentavos = pedido.itens.reduce(
          (soma, [produto, quantidade]) =>
            soma + PRODUTOS[produto].centavos * quantidade,
          0,
        );
        const criadoEm = diasAPartirDeHoje(-pedido.diasAtras);

        const [pedidoCriado] = await tx
          .insert(pedidos)
          .values({
            clienteId: clientesCriados[pedido.cliente].id,
            status: pedido.status,
            total: paraReais(totalCentavos),
            criadoEm,
          })
          .returning({ id: pedidos.id });

        await tx.insert(itensPedido).values(
          pedido.itens.map(([produto, quantidade]) => ({
            pedidoId: pedidoCriado.id,
            produtoId: produtosCriados[produto].id,
            quantidade,
            precoUnitario: paraReais(PRODUTOS[produto].centavos),
          })),
        );

        if (pedido.entrega) {
          await tx.insert(entregas).values({
            pedidoId: pedidoCriado.id,
            transportadora: pedido.entrega.transportadora,
            codigoRastreio: `BR${String(indice + 1).padStart(9, "0")}BR`,
            previsao: dateInBrazil(
              diasAPartirDeHoje(pedido.entrega.previsaoEmDias),
            ),
            atualizadoEm: new Date(criadoEm.getTime() + DIA_EM_MS),
          });
        }
      }
    });

    console.log(
      `Seed concluído: ${CLIENTES.length} clientes, ${PRODUTOS.length} produtos, ${PEDIDOS.length} pedidos.`,
    );
    console.log(`Login de demonstração: ana@exemplo.com / ${SENHA_DEMO}`);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error("Falha ao popular o banco:", error);
  process.exit(1);
});
