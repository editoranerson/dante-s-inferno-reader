import { COFFEE_RECEIPT_PREFIX } from "@/lib/danteCoffee";

export const DANTE_REPORT_REASON_OPTIONS = [
  {
    value: "insult",
    label: "Ofensa",
    description: "A resposta contém ofensa ou hostilidade inadequada.",
  },
  {
    value: "threat_violence",
    label: "Ameaça",
    description: "A resposta contém ameaça ou incentivo à violência.",
  },
  {
    value: "jailbreak",
    label: "Tentativa de jailbreak",
    description: "A resposta parece contornar as regras ou a personalidade do Dante.",
  },
  { value: "other", label: "Outro", description: "Outro conteúdo inadequado que merece revisão." },
] as const;

export type DanteReportReason = (typeof DANTE_REPORT_REASON_OPTIONS)[number]["value"];

interface ReportMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  receipt?: unknown;
}

export function findReportUserMessage(messages: ReportMessage[], assistantId: string): string {
  const assistantIndex = messages.findIndex((message) => message.id === assistantId);
  if (assistantIndex < 0) return "Mensagem do usuário não disponível no histórico recente.";

  const previousUserMessage = messages
    .slice(0, assistantIndex)
    .reverse()
    .find(
      (message) =>
        message.role === "user" &&
        !message.receipt &&
        !message.content.startsWith(COFFEE_RECEIPT_PREFIX),
    );

  return (
    previousUserMessage?.content.trim() ||
    "Mensagem do usuário não disponível no histórico recente."
  );
}

export function createDanteReportPayload(input: {
  userId: string;
  userMessage: string;
  danteResponse: string;
  reason: DanteReportReason;
  sessionId?: string | null;
}) {
  return {
    user_id: input.userId,
    user_message: input.userMessage,
    dante_response: input.danteResponse,
    reason_type: input.reason,
    severity: "medium",
    status: "pending",
    ...(input.sessionId ? { session_id: input.sessionId } : {}),
  };
}
