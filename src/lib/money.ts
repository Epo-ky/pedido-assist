// SÓ para exibir. O banco guarda dinheiro como numeric(10,2) e o Drizzle devolve texto ("199.90"); cálculos de
// total nunca devem usar number com vírgula flutuante (somar em centavos inteiros, como no seed).
export function formatBRL(valor: string | number): string {
  return Number(valor).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}
