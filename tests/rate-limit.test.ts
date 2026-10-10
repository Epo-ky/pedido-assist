import { like } from "drizzle-orm";
import { afterAll, describe, expect, it } from "vitest";
import { db, pool } from "@/lib/db";
import { limitesUso } from "@/lib/db/schema";
import { consumeRateLimit } from "@/lib/rate-limit";

const PREFIXO = "teste:";
let contador = 0;

// Cada teste usa a sua própria chave, para não interferir nos outros nem em dados reais.
const novaChave = () => `${PREFIXO}${Date.now()}-${contador++}`;

const REGRA = { max: 3, janelaSegundos: 60 };
// Um instante fixo, no início de uma janela de 60 s, para os testes não dependerem do relógio.
const INICIO = new Date("2026-10-09T12:00:00Z");

afterAll(async () => {
  await db.delete(limitesUso).where(like(limitesUso.chave, `${PREFIXO}%`));
  await pool.end();
});

describe("consumeRateLimit", () => {
  it("permite até o máximo e bloqueia a partir da tentativa seguinte", async () => {
    const chave = novaChave();

    const resultados = [];
    for (let i = 0; i < 5; i++) {
      resultados.push(await consumeRateLimit(chave, REGRA, INICIO));
    }

    expect(resultados.map((r) => r.allowed)).toEqual([true, true, true, false, false]);
    expect(resultados.map((r) => r.contagem)).toEqual([1, 2, 3, 4, 5]);
  });

  it("mantém um contador separado para cada chave", async () => {
    const ana = novaChave();
    const bruno = novaChave();

    for (let i = 0; i < 4; i++) await consumeRateLimit(ana, REGRA, INICIO);

    expect((await consumeRateLimit(ana, REGRA, INICIO)).allowed).toBe(false);
    expect((await consumeRateLimit(bruno, REGRA, INICIO)).allowed).toBe(true);
  });

  it("zera o contador quando começa uma nova janela", async () => {
    const chave = novaChave();
    for (let i = 0; i < 4; i++) await consumeRateLimit(chave, REGRA, INICIO);
    expect((await consumeRateLimit(chave, REGRA, INICIO)).allowed).toBe(false);

    const depoisDaJanela = new Date(INICIO.getTime() + 60_000);
    const resultado = await consumeRateLimit(chave, REGRA, depoisDaJanela);

    expect(resultado).toMatchObject({ allowed: true, contagem: 1 });
  });

  it("informa quantos segundos faltam para a janela acabar", async () => {
    const chave = novaChave();

    const noInicio = await consumeRateLimit(chave, REGRA, INICIO);
    const aos45s = await consumeRateLimit(chave, REGRA, new Date(INICIO.getTime() + 45_000));

    expect(noInicio.retryAfterSeconds).toBe(60);
    expect(aos45s.retryAfterSeconds).toBe(15);
  });

  it("conta certo com requisições simultâneas: nenhuma passa do limite", async () => {
    const chave = novaChave();

    const resultados = await Promise.all(
      Array.from({ length: 10 }, () => consumeRateLimit(chave, { max: 5, janelaSegundos: 60 }, INICIO)),
    );

    expect(resultados.filter((r) => r.allowed)).toHaveLength(5);
    expect(resultados.map((r) => r.contagem).sort((a, b) => a - b)).toEqual([
      1, 2, 3, 4, 5, 6, 7, 8, 9, 10,
    ]);
  });
});
