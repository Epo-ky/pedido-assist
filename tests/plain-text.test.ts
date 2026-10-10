import { describe, expect, it } from "vitest";
import { toPlainText } from "@/lib/ai/plain-text";

describe("toPlainText", () => {
  it("tira o negrito, como no caso real (**R$ 179,80**)", () => {
    expect(toPlainText("o valor total foi de **R$ 179,80** (dois mouses)")).toBe(
      "o valor total foi de R$ 179,80 (dois mouses)",
    );
    expect(toPlainText("status __cancelado__")).toBe("status cancelado");
  });

  it("tira títulos e transforma marcadores em hífen", () => {
    const resposta = "## Seus pedidos\n* Pedido 6\n+ Pedido 5\n- Pedido 3";

    expect(toPlainText(resposta)).toBe("Seus pedidos\n- Pedido 6\n- Pedido 5\n- Pedido 3");
  });

  it("tira as crases de código", () => {
    expect(toPlainText("o código é `BR000000004BR`")).toBe("o código é BR000000004BR");
  });

  it("não mexe em texto normal, em valores nem em multiplicações", () => {
    const normal = "- Pedido 4: R$ 279,70\n2 x 29,90 = 59,80 (previsão: 05/10/2026)";

    expect(toPlainText(normal)).toBe(normal);
  });

  it("aceita negrito que atravessa linhas e vários trechos na mesma resposta", () => {
    expect(toPlainText("**a** e **b**")).toBe("a e b");
    expect(toPlainText("**linha um\nlinha dois**")).toBe("linha um\nlinha dois");
  });
});
