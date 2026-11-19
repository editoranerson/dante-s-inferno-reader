import { describe, expect, it } from "vitest";
import { COFFEE_RECEIPT_PREFIX } from "./danteCoffee";
import { createDanteReportPayload, findReportUserMessage } from "./danteReports";

describe("Dante user reports", () => {
  it("always creates a pending medium-severity report owned by the signed-in user", () => {
    expect(
      createDanteReportPayload({
        userId: "user-123",
        userMessage: "Pergunta original",
        danteResponse: "Resposta do Dante",
        reason: "other",
      }),
    ).toEqual({
      user_id: "user-123",
      user_message: "Pergunta original",
      dante_response: "Resposta do Dante",
      reason_type: "other",
      severity: "medium",
      status: "pending",
    });
  });

  it("links the response to the preceding user message and skips coffee receipts", () => {
    const messages = [
      { id: "u1", role: "user" as const, content: "Primeira pergunta" },
      { id: "a1", role: "assistant" as const, content: "Primeira resposta" },
      { id: "r1", role: "user" as const, content: `${COFFEE_RECEIPT_PREFIX}{}`, receipt: {} },
      { id: "a2", role: "assistant" as const, content: "Resposta denunciada" },
    ];

    expect(findReportUserMessage(messages, "a2")).toBe("Primeira pergunta");
  });

  it("uses an explicit fallback when there is no preceding user message", () => {
    expect(
      findReportUserMessage(
        [{ id: "a1", role: "assistant" as const, content: "Resposta isolada" }],
        "a1",
      ),
    ).toBe("Mensagem do usuário não disponível no histórico recente.");
  });
});
