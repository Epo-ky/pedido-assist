import { eq } from "drizzle-orm";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { clientes } from "@/lib/db/schema";
import { executeTool, toolDefinitions } from "@/lib/tools";
import { listOrders } from "@/lib/tools/list-orders";

let anaId: number;
let brunoId: number;

async function idPorEmail(email: string) {
  const [linha] = await db
    .select({ id: clientes.id })
    .from(clientes)
    .where(eq(clientes.email, email));
  return linha.id;
}

beforeAll(async () => {
  anaId = await idPorEmail("ana@exemplo.com");
  brunoId = await idPorEmail("bruno@exemplo.com");
});

afterAll(async () => {
  await pool.end();
});

describe("definições das tools enviadas ao modelo", () => {
  it("expõe as três tools com descrição", () => {
    expect(toolDefinitions.map((t) => t.name).sort()).toEqual([
      "detalhe_pedido",
      "listar_pedidos",
      "rastrear_entrega",
    ]);
    for (const tool of toolDefinitions) expect(tool.description.length).toBeGreaterThan(20);
  });

  it("nenhuma tool deixa o modelo informar cliente_id", () => {
    for (const tool of toolDefinitions) {
      expect(JSON.stringify(tool.parameters)).not.toMatch(/cliente/i);
    }
  });

  it("envia ao modelo só um guia: sem regras de validação que o provedor aplicaria antes do servidor", () => {
    for (const tool of toolDefinitions) {
      const schema = JSON.stringify(tool.parameters);
      expect(tool.parameters).not.toHaveProperty("$schema");
      for (const palavra of ["pattern", "format", "minimum", "exclusiveMinimum", "additionalProperties"]) {
        expect(schema).not.toContain(`"${palavra}"`);
      }
    }
  });
});

describe("executeTool", () => {
  it("executa uma tool válida com o cliente da sessão", async () => {
    const resultado = await executeTool(anaId, "listar_pedidos", "{}");
    const pedidos = JSON.parse(resultado.content);

    expect(resultado.isError).toBe(false);
    expect(pedidos.length).toBeGreaterThan(0);
  });

  it("aceita argumentos vazios em texto", async () => {
    expect((await executeTool(anaId, "listar_pedidos", "")).isError).toBe(false);
  });

  it("devolve erro (sem lançar) para tool inexistente", async () => {
    const resultado = await executeTool(anaId, "apagar_tudo", "{}");

    expect(resultado.isError).toBe(true);
    expect(JSON.parse(resultado.content).erro).toContain("não existe");
  });

  it("devolve erro (sem lançar) para JSON quebrado", async () => {
    const resultado = await executeTool(anaId, "listar_pedidos", "{quebrado");

    expect(resultado.isError).toBe(true);
  });

  it("o servidor continua recusando o que o schema do modelo deixa passar (pedido_id 0, campo extra)", async () => {
    const zero = await executeTool(anaId, "detalhe_pedido", '{"pedido_id":0}');
    const negativo = await executeTool(anaId, "rastrear_entrega", '{"pedido_id":-1}');
    const extra = await executeTool(anaId, "detalhe_pedido", '{"pedido_id":1,"cliente_id":2}');
    const dataRuim = await executeTool(anaId, "listar_pedidos", '{"desde":"ontem"}');

    for (const resultado of [zero, negativo, extra, dataRuim]) {
      expect(resultado.isError).toBe(true);
      expect(JSON.parse(resultado.content)).toHaveProperty("erro");
    }
  });

  it("devolve erro legível para argumento inválido, apontando o campo", async () => {
    const resultado = await executeTool(anaId, "detalhe_pedido", '{"pedido_id":"abc"}');
    const corpo = JSON.parse(resultado.content);

    expect(resultado.isError).toBe(true);
    expect(corpo.detalhes[0].campo).toBe("pedido_id");
  });

  it("recusa cliente_id forjado pelo modelo e não devolve dado nenhum", async () => {
    const resultado = await executeTool(
      anaId,
      "listar_pedidos",
      JSON.stringify({ cliente_id: brunoId }),
    );

    expect(resultado.isError).toBe(true);
    expect(resultado.content).not.toContain("total");
  });

  it("cliente A não vê pedido do cliente B pelo executor: devolve encontrado: false", async () => {
    const [pedidoDoBruno] = await listOrders(brunoId, {});
    const args = JSON.stringify({ pedido_id: pedidoDoBruno.id });

    expect(JSON.parse((await executeTool(brunoId, "detalhe_pedido", args)).content).id).toBe(
      pedidoDoBruno.id,
    );
    const alheio = await executeTool(anaId, "detalhe_pedido", args);
    expect(alheio.isError).toBe(false);
    expect(JSON.parse(alheio.content)).toEqual({ encontrado: false });

    const entregaAlheia = await executeTool(anaId, "rastrear_entrega", args);
    expect(JSON.parse(entregaAlheia.content)).toEqual({ encontrado: false });
  });

  it("devolve as datas já no horário de Brasília, como texto legível", async () => {
    const [pedido] = await listOrders(anaId, {});
    const detalhe = JSON.parse(
      (await executeTool(anaId, "detalhe_pedido", JSON.stringify({ pedido_id: pedido.id }))).content,
    );

    expect(detalhe.criadoEm).toMatch(/^\d{2}\/\d{2}\/\d{4} \d{2}:\d{2}$/);
  });

  it("aceita null nos filtros como 'sem filtro', do jeito que os modelos costumam mandar", async () => {
    const comNulls = await executeTool(
      anaId,
      "listar_pedidos",
      JSON.stringify({ status: null, desde: null, ate: null }),
    );
    const semArgs = await executeTool(anaId, "listar_pedidos", "{}");

    expect(comNulls.isError).toBe(false);
    expect(comNulls.content).toBe(semArgs.content);
  });

  it("lista vazia vira encontrado: false, para o modelo não inventar", async () => {
    const resultado = await executeTool(
      anaId,
      "listar_pedidos",
      JSON.stringify({ desde: "2000-01-01", ate: "2000-01-31" }),
    );

    expect(JSON.parse(resultado.content)).toEqual({ encontrado: false });
  });
});
