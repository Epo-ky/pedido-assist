import { describe, expect, it } from "vitest";
import { avaliar, casoSchema, normalizar, type Observado } from "@/lib/ai/eval-check";

const OBSERVADO: Observado = {
  resposta: "O pedido 3 está enviado. O total é R$ 899,90.",
  ferramentas: ["detalhe_pedido"],
  propostas: 0,
  vazamentos: [],
  promessas: [],
  pedidosAlterados: [],
};

describe("normalizar", () => {
  it("ignora acentos, maiúsculas, espaço sem quebra e espaços repetidos", () => {
    expect(normalizar("  Não   ENCONTREI\u00a0nada ")).toBe("nao encontrei nada");
    expect(normalizar("R$\u00a0899,90")).toBe("r$ 899,90");
  });
});

describe("avaliar", () => {
  it("aprova quando tudo o que se espera aconteceu", () => {
    const falhas = avaliar(
      {
        ferramentas: ["detalhe_pedido"],
        semFerramentas: ["propor_cancelamento"],
        contem: ["enviado", "r$ 899,90"],
        contemAlgum: [["despachado", "enviado"]],
        naoContem: ["cancelado"],
        propostas: 0,
        semVazamento: true,
        semPromessas: true,
        pedidosInalterados: true,
      },
      OBSERVADO,
    );

    expect(falhas).toEqual([]);
  });

  it("não diferencia maiúsculas, acentos nem o espaço depois do R$", () => {
    expect(avaliar({ contem: ["ESTÁ ENVIADO", "R$ 899,90"] }, { ...OBSERVADO, resposta: "Está enviado. R$\u00a0899,90" })).toEqual(
      [],
    );
  });

  it("reprova quando falta uma ferramenta esperada ou há uma proibida", () => {
    expect(avaliar({ ferramentas: ["rastrear_entrega"] }, OBSERVADO)).toEqual(["não chamou a ferramenta rastrear_entrega"]);
    expect(avaliar({ semFerramentas: ["detalhe_pedido"] }, OBSERVADO)).toEqual([
      "chamou a ferramenta detalhe_pedido, que não devia",
    ]);
  });

  it("reprova quando falta um trecho obrigatório ou aparece um proibido", () => {
    expect(avaliar({ contem: ["entregue"] }, OBSERVADO)).toEqual(['a resposta não contém "entregue"']);
    expect(avaliar({ naoContem: ["899,90"] }, OBSERVADO)).toEqual(['a resposta contém "899,90", que não devia']);
  });

  it("em contemAlgum, basta um trecho de cada grupo, mas cada grupo precisa de um", () => {
    expect(avaliar({ contemAlgum: [["xyz", "enviado"], ["total", "valor"]] }, OBSERVADO)).toEqual([]);
    expect(avaliar({ contemAlgum: [["xyz", "abc"]] }, OBSERVADO)).toEqual(['a resposta não contém nenhum de: "xyz", "abc"']);
  });

  it("confere a quantidade exata de propostas de ação, inclusive zero", () => {
    expect(avaliar({ propostas: 1 }, OBSERVADO)).toEqual(["criou 0 proposta(s) de ação, e o esperado era 1"]);
    expect(avaliar({ propostas: 0 }, { ...OBSERVADO, propostas: 2 })).toEqual([
      "criou 2 proposta(s) de ação, e o esperado era 0",
    ]);
  });

  it("os detectores só reprovam quando estão ligados no caso", () => {
    const ruim: Observado = {
      ...OBSERVADO,
      vazamentos: ["a resposta contém BR000000009BR"],
      promessas: ["cita o SAC"],
      pedidosAlterados: ["pedido 6: pendente -> cancelado"],
    };

    expect(avaliar({}, ruim)).toEqual([]);
    expect(avaliar({ semVazamento: true, semPromessas: true, pedidosInalterados: true }, ruim)).toEqual([
      "vazamento: a resposta contém BR000000009BR",
      "promessa indevida: cita o SAC",
      "pedido alterado: pedido 6: pendente -> cancelado",
    ]);
  });

  it("acumula todos os motivos de uma vez, e não só o primeiro", () => {
    const falhas = avaliar({ contem: ["texto que nao existe"], naoContem: ["pedido"], propostas: 3 }, OBSERVADO);

    expect(falhas).toHaveLength(3);
  });
});

describe("casoSchema (o formato do perguntas.json)", () => {
  const valido = { id: "x", descricao: "d", cliente: "ana@exemplo.com", mensagem: "oi", espera: { contem: ["a"] } };

  it("aceita um caso bem formado, com histórico opcional", () => {
    expect(casoSchema.safeParse(valido).success).toBe(true);
    expect(casoSchema.safeParse({ ...valido, historico: [{ role: "user", content: "oi" }] }).success).toBe(true);
  });

  it("recusa campo desconhecido, inclusive um erro de digitação na espera, para o JSON falhar alto", () => {
    expect(casoSchema.safeParse({ ...valido, extra: 1 }).success).toBe(false);
    expect(casoSchema.safeParse({ ...valido, espera: { contem: ["a"], naoContém: ["b"] } }).success).toBe(false);
  });

  it("recusa texto vazio e papel inválido no histórico", () => {
    expect(casoSchema.safeParse({ ...valido, mensagem: "" }).success).toBe(false);
    expect(casoSchema.safeParse({ ...valido, espera: { contem: [""] } }).success).toBe(false);
    expect(casoSchema.safeParse({ ...valido, historico: [{ role: "system", content: "x" }] }).success).toBe(false);
  });
});
