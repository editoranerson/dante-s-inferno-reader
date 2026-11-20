import { describe, expect, it } from "vitest";
import { COFFEE_RECEIPT_PREFIX, parseCoffeeReceipt } from "../lib/danteCoffee";

describe("Coffee receipt persistence", () => {
  it("keeps separate decisions when a mixed receipt is loaded again", () => {
    const receipt = parseCoffeeReceipt(COFFEE_RECEIPT_PREFIX + JSON.stringify({
      items: [
        { name: "Café Especial", quantity: 2, price: 110, accepted: true },
        { name: "Cafezinho", quantity: 1, price: 5, accepted: false },
      ],
      total: 115, caffeine_added: 25, bottle_added: 17.5, accepted: true,
    }));
    expect(receipt?.items.map((item) => item.accepted)).toEqual([true, false]);
    expect(receipt?.accepted).toBe(true);
    expect(receipt?.caffeine_added).toBe(25);
  });
});