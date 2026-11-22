import { describe, expect, it } from "vitest";
import { COFFEE_RECEIPT_PREFIX, parseCoffeeReceipt, receiptFromBatch } from "../lib/danteCoffee";

describe("Coffee receipt persistence", () => {
  it("preserves purchases but discards obsolete decisions and energy", () => {
    const receipt = parseCoffeeReceipt(COFFEE_RECEIPT_PREFIX + JSON.stringify({
      items: [
        { name: "Café Especial", quantity: 2, price: 110, accepted: true },
        { name: "Cafezinho", quantity: 1, price: 5, accepted: false },
      ],
      total: 115, caffeine_added: 25, bottle_added: 17.5, accepted: true,
    }));
    expect(receipt).toEqual({
      items: [
        { name: "Café Especial", icon: "coffee", quantity: 2, price: 110 },
        { name: "Cafezinho", icon: "coffee", quantity: 1, price: 5 },
      ],
      total: 115,
    });
  });

  it("uses the gift RPC total without energy accounting", () => {
    expect(receiptFromBatch({
      success: true,
      total_spent: 100,
      items_summary: [{ name: "Café Especial", icon: "coffee", quantity: 1, total_price: 100 }],
    })).toEqual({ items: [{ name: "Café Especial", icon: "coffee", quantity: 1, price: 100 }], total: 100 });
  });
});