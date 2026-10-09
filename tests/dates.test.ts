import { describe, expect, it } from "vitest";
import { dateInBrazil, formatDateTimeInBrazil } from "@/lib/dates";
import { isDeliveryLate } from "@/lib/tools/track-delivery";

// 2026-10-09T01:30Z = 22h30 do dia 08/10 em Brasília (UTC-3). Em UTC, o dia já é 09.
const NOITE_DE_08_OUT = new Date("2026-10-09T01:30:00Z");
// 2026-10-09T03:30Z = 00h30 do dia 09/10 em Brasília.
const MADRUGADA_DE_09_OUT = new Date("2026-10-09T03:30:00Z");

describe("dateInBrazil", () => {
  it("usa o dia de Brasília, e não o dia em UTC", () => {
    expect(dateInBrazil(NOITE_DE_08_OUT)).toBe("2026-10-08");
    expect(dateInBrazil(MADRUGADA_DE_09_OUT)).toBe("2026-10-09");
  });
});

describe("formatDateTimeInBrazil", () => {
  it("mostra a data e a hora de Brasília no formato dd/mm/aaaa hh:mm", () => {
    expect(formatDateTimeInBrazil(NOITE_DE_08_OUT)).toBe("08/10/2026 22:30");
    expect(formatDateTimeInBrazil(MADRUGADA_DE_09_OUT)).toBe("09/10/2026 00:30");
  });
});

describe("isDeliveryLate", () => {
  it("não marca como atrasada a entrega com previsão para hoje, nem à noite", () => {
    expect(isDeliveryLate("enviado", "2026-10-08", NOITE_DE_08_OUT)).toBe(false);
  });

  it("marca como atrasada quando a previsão foi ontem, em horário de Brasília", () => {
    expect(isDeliveryLate("enviado", "2026-10-08", MADRUGADA_DE_09_OUT)).toBe(true);
  });

  it("não marca como atrasada a entrega com previsão futura", () => {
    expect(isDeliveryLate("enviado", "2026-10-12", NOITE_DE_08_OUT)).toBe(false);
  });

  it("nunca marca como atrasado um pedido entregue ou cancelado", () => {
    expect(isDeliveryLate("entregue", "2026-09-01", NOITE_DE_08_OUT)).toBe(false);
    expect(isDeliveryLate("cancelado", "2026-09-01", NOITE_DE_08_OUT)).toBe(false);
  });
});
