import { describe, expect, it } from "vitest";
import {
  COFFEE_RECEIPT_PREFIX,
  formatBlockCountdown,
  getActiveDanteBlock,
  getCaffeineMode,
  parseCoffeeReceipt,
} from "./danteCoffee";

describe("caffeine personality modes", () => {
  it("keeps 0–20% in abstinence mode", () => {
    expect(getCaffeineMode(0).label).toBe("Abstinência");
    expect(getCaffeineMode(20).label).toBe("Abstinência");
  });

  it("uses functional grumpiness from 21–50%", () => {
    expect(getCaffeineMode(20.01).label).toBe("Ranzinza Funcional");
    expect(getCaffeineMode(50).label).toBe("Ranzinza Funcional");
  });

  it("uses casual Dante from 51–80%", () => {
    expect(getCaffeineMode(50.01).label).toBe("Dante Casual");
    expect(getCaffeineMode(80).label).toBe("Dante Casual");
  });

  it("uses Silicon Valley mode above 80%", () => {
    expect(getCaffeineMode(80.01).label).toBe("O Cara do Vale do Silício");
    expect(getCaffeineMode(100).label).toBe("O Cara do Vale do Silício");
  });
});

describe("Dante blocks", () => {
  const now = new Date("2026-11-18T13:00:00Z").getTime();

  it("expires a tired block without turning zero caffeine into a block", () => {
    expect(
      getActiveDanteBlock({ dante_blocked_until: null, dante_block_reason: null }, now),
    ).toBeNull();
    expect(
      getActiveDanteBlock(
        { dante_blocked_until: "2026-11-18T12:59:59Z", dante_block_reason: "tired" },
        now,
      ),
    ).toBeNull();
  });

  it("preserves violation and tired reasons while active", () => {
    expect(
      getActiveDanteBlock(
        { dante_blocked_until: "2026-11-18T13:10:00Z", dante_block_reason: "violation" },
        now,
      )?.reason,
    ).toBe("violation");
    expect(
      getActiveDanteBlock(
        { dante_blocked_until: "2026-11-18T13:10:00Z", dante_block_reason: "tired" },
        now,
      )?.reason,
    ).toBe("tired");
  });

  it("shows a live minute and second countdown", () => {
    expect(formatBlockCountdown("2026-11-18T13:10:00Z", now)).toBe("10:00");
    expect(formatBlockCountdown("2026-11-18T15:00:00Z", now)).toBe("2:00:00");
  });
});

describe("coffee receipt history parsing", () => {
  it("restores all receipt values persisted by the Edge Function", () => {
    const content = `${COFFEE_RECEIPT_PREFIX}${JSON.stringify({
      items: [{ name: "Cafeteira Inteira", icon: "coffee", quantity: 2, price: 80 }],
      total: 80,
      caffeine_added: 130,
      bottle_added: 15,
      text: "Texto usado apenas no contexto da IA",
    })}`;

    expect(parseCoffeeReceipt(content)).toEqual({
      items: [{ name: "Cafeteira Inteira", icon: "coffee", quantity: 2, price: 80 }],
      total: 80,
      caffeine_added: 130,
      bottle_added: 15,
    });
  });

  it("ignores ordinary messages and malformed receipts", () => {
    expect(parseCoffeeReceipt("Mensagem comum")).toBeNull();
    expect(parseCoffeeReceipt(`${COFFEE_RECEIPT_PREFIX}{invalido`)).toBeNull();
    expect(
      parseCoffeeReceipt(`${COFFEE_RECEIPT_PREFIX}${JSON.stringify({ items: [] })}`),
    ).toBeNull();
    expect(
      parseCoffeeReceipt(
        `${COFFEE_RECEIPT_PREFIX}${JSON.stringify({
          items: [{ name: "Espresso", quantity: -1, price: 10 }],
          total: 10,
          caffeine_added: 20,
          bottle_added: 0,
        })}`,
      ),
    ).toBeNull();
  });
});
