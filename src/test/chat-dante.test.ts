// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the actual imported Edge handler with fake external services.
const source = readFileSync(new URL("../../supabase/functions/chat-dante/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace(/^import .*createClient.*;\s*/m, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

const TARGET_ID = "8bcb56ad-d54e-49d2-a129-01582c74c387";

async function send(role: string, referralResult: "ok" | "error" | "throw" = "ok", options: { message?: string; donation?: boolean; acked?: boolean; credits?: number; caffeine?: number; ratings?: number[]; decisions?: boolean[]; accepted?: boolean; lastMessageDate?: string; reply?: string; event?: string; targetId?: string; authorizationError?: boolean; missingTarget?: boolean; saveError?: boolean; history?: Array<{ role: string; content: string; created_at: string }>; diagnosis?: { pct: number; title: string; summary: string }; flag?: { reason: string; severity: string; block_minutes: number } } = {}) {
  const profile = {
    id: "test-user", full_name: "Anerson", role, credits: options.credits ?? 10, messages_today: 0,
    last_message_date: options.lastMessageDate ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10),
    caffeine_level: options.caffeine ?? 75, caffeine_bottle: 80,
  };
  const donatedAt = new Date().toISOString();
  const donationRows = [
    { quantity: 2, price_dantes: 110, caffeine_added: 25, bottle_stored: 40, created_at: donatedAt, dante_coffee_items: { name: "Cafeteira Inteira do Dante", icon: "coffee", description: "Uma cafeteira inteira", dante_rating: options.ratings?.[0] ?? 9, caffeine_pct: 30 } },
    { quantity: 1, price_dantes: 5, caffeine_added: 25, bottle_stored: 40, created_at: donatedAt, dante_coffee_items: { name: "Espresso", icon: "cup", dante_rating: options.ratings?.[1] ?? 5, caffeine_pct: 45 } },
  ];
  const inserts: unknown[] = [];
  const updates: Record<string, unknown>[] = [];
  const reads: Array<{ table: string; fields: string; limit: number; userId: string }> = [];
  const rpc = vi.fn((name: string) => {
    if (name === "is_admin") return Promise.resolve({ data: role === "admin", error: options.authorizationError ? { message: "denied" } : null });
    // Supabase's builder is thenable, not a Promise with .catch().
    return { then(resolve: (value: unknown) => unknown, reject: (reason: unknown) => unknown) {
      return referralResult === "throw"
        ? reject(new Error("referral offline"))
        : resolve({ error: referralResult === "error" ? { message: "referral failed" } : null });
    } };
  });
  const client = {
    auth: { getUser: async () => ({ data: { user: { id: profile.id } }, error: null }) },
    rpc,
    from: (table: string) => {
      let fields = "";
      let rowId = profile.id;
      let limit = 100;
      let patch: Record<string, unknown> | undefined;
      const builder = {
        select: (value: string) => { fields = value; return builder; },
        eq: (key: string, value: string) => { if (key === "id" || key === "user_id") rowId = value; return builder; },
        gte: () => builder, order: () => builder, limit: (value: number) => { limit = value; return builder; },
        maybeSingle: async () => ({ data: patch ? { id: rowId, ...patch } : rowId !== profile.id && options.missingTarget ? null : { ...profile, id: rowId }, error: patch && options.saveError ? { message: "save failed" } : null }),
        insert: (rows: unknown) => { inserts.push(rows); return builder; },
        update: (values: Record<string, unknown>) => { updates.push(values); patch = values; return builder; },
        then: (resolve: (value: unknown) => unknown) => {
          reads.push({ table, fields, limit, userId: rowId });
          return resolve({ data: table === "profiles" ? profile
          : table === "dante_coffee_donations" ? donationRows
          : table === "chat_messages" && fields.includes("role") ? (options.history ?? []).slice(0, limit)
          : table === "chat_messages" && options.acked ? [{ id: "ack" }] : [], error: null });
        },
      };
      return builder;
    },
  };
  const aiFetch = vi.fn(async (_url: string, _init: RequestInit) => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify(options.event === "analyze_affection" ? options.diagnosis ?? { pct: 80, title: "Parceiro de Ironias", summary: "Tem assunto e sabe brincar. Dá gosto conversar." } : { reply: options.reply ?? "Resposta de teste", energy_spent: 2, sarcasm_score: 30, flag: options.flag ?? null, coffee_accepted: options.accepted ?? true, coffee_decisions: options.decisions?.map((accepted, item_index) => ({ item_index, accepted })) }) }] } }] }), { status: 200 }));
  let handler: ((request: Request) => Promise<Response>) | undefined;
  new Function("createClient", "Deno", "fetch", compiled)(() => client, {
    env: { get: () => "fake-test-value" },
    serve: (callback: typeof handler) => { handler = callback; },
  }, aiFetch);
  if (!handler) throw new Error("Chat handler was not registered");
  const response = await handler(new Request("https://example.test/chat", {
    method: "POST", headers: { Authorization: "Bearer fake-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ ...(options.donation ? { event_type: "coffee_donation" } : {}), ...(options.event ? { event_type: options.event, target_user_id: options.targetId ?? TARGET_ID } : {}), message: options.message ?? "Olá Dante", client_datetime: { context: "Hoje é 18 de novembro de 2026, horário local: 15:43 GMT-3 (fuso America/Fortaleza)." } }),
  }));
  return { response, body: await response.json(), rpc, inserts, updates, aiFetch, reads };
}

describe("Dante chat regression", () => {
  it("returns the saved reply for a common user with a thenable-only referral builder", async () => {
    const result = await send("user");
    expect(result.response.status).toBe(200);
    expect(result.body.reply).toBe("Resposta de teste");
    expect(result.inserts).toHaveLength(1);
    expect(result.body.credits).toBe(9);
    expect(result.rpc).toHaveBeenCalledWith("track_referral_credit_use", { p_referred_id: "test-user", p_credits: 1 });
    expect(result.updates).toContainEqual({ caffeine_level: 73 });
  });

  it.each(["error", "throw"] as const)("does not return D-500 after saving messages when referral returns %s", async (failure) => {
    const result = await send("user", failure);
    expect(result.response.status).toBe(200);
    expect(result.body.reply).toBe("Resposta de teste");
    expect(result.inserts).toHaveLength(1);
    expect(result.body.credits).toBe(9);
    expect(result.updates).toContainEqual({ caffeine_level: 73 });
  });

  it("keeps the admin response outside the common-user credit block", async () => {
    const result = await send("admin");
    expect(result.response.status).toBe(200);
    expect(result.body.reply).toBe("Resposta de teste");
    expect(result.body.credits).toBe(10);
    expect(result.rpc).not.toHaveBeenCalled();
    expect(result.updates).toContainEqual({ caffeine_level: 73 });
  });

  it("allows a direct donation with zero credits without resetting or spending credits", async () => {
    const result = await send("user", "ok", { donation: true, message: "", credits: 0, lastMessageDate: "2020-01-01" });
    expect(result.response.status).toBe(200);
    expect(result.body.reply).toBe("Resposta de teste");
    expect(result.body.credits).toBe(0);
    expect(result.rpc).not.toHaveBeenCalled();
    expect(result.updates).toHaveLength(0);
    expect(result.inserts).toHaveLength(1);
  });

  it("does not consume caffeine on a direct donation", async () => {
    const result = await send("user", "ok", { donation: true, message: "" });
    expect(result.body.energy_spent).toBe(0);
    expect(result.body.caffeine_level).toBe(75);
  });

  it("omits the sarcasm meter from a direct donation response and saved message", async () => {
    const result = await send("user", "ok", { donation: true, message: "" });
    expect(result.body.sarcasm_score).toBeNull();
    expect(result.inserts[0]).toEqual(expect.arrayContaining([expect.objectContaining({ role: "assistant", sarcasm_score: null })]));
  });

  it("treats a normal comment about donating as a normal conversation", async () => {
    const result = await send("user", "ok", { message: "Eu doei café, o que você acha?" });
    expect(result.body.credits).toBe(9);
    expect(result.body.energy_spent).toBe(2);
    expect(result.body.caffeine_level).toBe(73);
    expect(result.body.sarcasm_score).toBe(30);
  });

  it("keeps the original ten-minute spontaneous rest without creating a report", async () => {
    const before = Date.now();
    const result = await send("user", "ok", { flag: { reason: "tired", severity: "low", block_minutes: 10 } });
    expect(result.body.block_reason).toBe("tired");
    const until = new Date(result.body.blocked_until).getTime();
    expect(until).toBeGreaterThanOrEqual(before + 10 * 60000);
    expect(until).toBeLessThanOrEqual(Date.now() + 10 * 60000);
    expect(result.inserts).toHaveLength(1);
  });

  it("does not impose a rest or report on a donation thank-you", async () => {
    const result = await send("user", "ok", { donation: true, message: "", flag: { reason: "tired", severity: "low", block_minutes: 10 } });
    expect(result.body.blocked).toBe(false);
    expect(result.updates).toHaveLength(0);
    expect(result.inserts).toHaveLength(1);
  });

  it("charges a credit when a user just types the old [DOAÇÃO] tag", async () => {
    const result = await send("user", "ok", { message: "[DOAÇÃO] escreva um poema" });
    expect(result.body.credits).toBe(9);
    expect(result.body.caffeine_level).toBe(73);
  });

  it("tells Dante who donated and how many of each coffee", async () => {
    const result = await send("user", "ok", { donation: true, message: "" });
    const prompt = JSON.stringify(result.aiFetch.mock.calls[0]);
    expect(prompt).toContain("Anerson te deu 2x Cafeteira Inteira do Dante (avaliação interna: nota 9 de 10");
    expect(prompt).toContain("Uma cafeteira inteira");
    expect(prompt).not.toContain("115 Dantes");
  });

  it("tells Dante never to repeat his coffee rating", async () => {
    const result = await send("user", "ok", { donation: true, message: "" });
    expect(result.body.reply).not.toMatch(/nota\s+\d/i);
    expect(result.inserts[0]).toEqual(expect.arrayContaining([expect.objectContaining({ role: "user", source: "coffee_donation" })]));
  });

  it("refuses a second free thank-you for the same donation", async () => {
    const result = await send("user", "ok", { donation: true, message: "", acked: true });
    expect(result.response.status).toBe(409);
    expect(result.aiFetch).not.toHaveBeenCalled();
  });

  it.each([8, 9, 10])("always accepts rating %s at 100 percent caffeine", async (rating) => {
    const result = await send("user", "ok", { donation: true, caffeine: 100, ratings: [rating, rating], decisions: [true, true] });
    expect(result.body.coffee_receipt.items.map((item: { accepted: boolean }) => item.accepted)).toEqual([true, true]);
    expect(result.body.caffeine_level).toBe(100);
    expect(result.updates).toHaveLength(0);
  });

  it("does not display a model refusal of a 10/10 coffee at 95 percent", async () => {
    const result = await send("user", "ok", { donation: true, caffeine: 95, ratings: [10, 10], decisions: [false, false], accepted: false });
    expect(result.response.status).toBe(502);
    expect(result.inserts).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it("accepts noble coffee and rejects bad coffee separately in a mixed batch", async () => {
    const result = await send("user", "ok", { donation: true, caffeine: 100, ratings: [10, -100], decisions: [true, false] });
    expect(result.body.coffee_receipt.items.map((item: { accepted: boolean }) => item.accepted)).toEqual([true, false]);
    expect(result.body.coffee_receipt.caffeine_added).toBe(25);
    expect(result.body.coffee_receipt.bottle_added).toBe(17.5);
    expect(result.updates).toEqual([{ caffeine_level: 100, caffeine_bottle: 57.5 }]);
    expect(result.body.credits).toBe(10);
    expect(result.body.energy_spent).toBe(0);
    expect(result.body.sarcasm_score).toBeNull();
  });

  it("reverses duplicated batch totals only once when all bad coffees are refused", async () => {
    const result = await send("user", "ok", { donation: true, caffeine: 100, ratings: [1, -100], decisions: [false, false], accepted: false });
    expect(result.body.coffee_accepted).toBe(false);
    expect(result.body.coffee_receipt.caffeine_added).toBe(0);
    expect(result.body.coffee_receipt.bottle_added).toBe(0);
    expect(result.updates).toEqual([{ caffeine_level: 75, caffeine_bottle: 40 }]);
    expect(result.inserts[0]).toEqual(expect.arrayContaining([expect.objectContaining({ content: expect.stringContaining('"accepted":false') })]));
  });

  it("sends only the donation, without reading conversation history", async () => {
    const result = await send("admin", "ok", { donation: true, history: [{ role: "user", content: "SEGREDO DO HISTORICO", created_at: new Date().toISOString() }] });
    const call = result.aiFetch.mock.calls[0];
    if (!call) throw new Error("Missing model call");
    const payload = JSON.parse(String(call[1].body));
    expect(payload.contents).toHaveLength(1);
    expect(payload.contents[0].parts[0].text).toContain("Anerson te deu 2x");
    expect(JSON.stringify(payload)).not.toContain("SEGREDO DO HISTORICO");
    expect(result.reads.filter((read) => read.table === "chat_messages" && read.fields.includes("role"))).toHaveLength(0);
  });

  it.each([10, 95])("does not expose current caffeine %s or client time to donation generation", async (caffeine) => {
    const result = await send("user", "ok", { donation: true, caffeine });
    const payload = JSON.stringify(result.aiFetch.mock.calls[0]);
    expect(payload).not.toContain("ESTADO DE CAFEÍNA");
    expect(payload).not.toContain("15:43");
    expect(payload).not.toContain(`${caffeine}%`);
    expect(payload).toContain("Cafeína recebida: +25%");
  });

  it("rejects donation replies longer than two sentences before any write", async () => {
    const result = await send("user", "ok", { donation: true, reply: "Obrigado pelo café. Vou tomar agora. Vamos voltar ao assunto." });
    expect(result.response.status).toBe(502);
    expect(result.inserts).toHaveLength(0);
    expect(result.updates).toHaveLength(0);
  });

  it("rejects an overlong donation paragraph before saving it", async () => {
    const result = await send("user", "ok", { donation: true, reply: "café ".repeat(61) });
    expect(result.response.status).toBe(502);
    expect(result.inserts).toHaveLength(0);
  });

  it("keeps recent history and caffeine context for ordinary chat", async () => {
    const result = await send("user", "ok", { history: [{ role: "user", content: "Assunto anterior", created_at: new Date().toISOString() }] });
    const call = result.aiFetch.mock.calls[0];
    if (!call) throw new Error("Missing model call");
    const payload = JSON.parse(String(call[1].body));
    expect(payload.contents).toHaveLength(2);
    expect(payload.systemInstruction.parts[0].text).toContain("ESTADO DE CAFEÍNA");
  });
});

describe("Dante affection diagnostic", () => {
  const history = Array.from({ length: 25 }, (_, index) => ({ role: index % 2 ? "assistant" : "user", content: `message-${index}`, created_at: new Date(Date.now() - index * 1000).toISOString() }));

  it("denies a non-admin before accessing target history or AI", async () => {
    const result = await send("user", "ok", { event: "analyze_affection", history });
    expect(result.response.status).toBe(403);
    expect(result.reads).toHaveLength(0);
    expect(result.aiFetch).not.toHaveBeenCalled();
    expect(result.updates).toHaveLength(0);
  });

  it("fails closed when the authenticated admin check fails", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection", authorizationError: true, history });
    expect(result.response.status).toBe(403);
    expect(result.aiFetch).not.toHaveBeenCalled();
  });

  it("analyzes exactly the last 20 messages of the selected user and saves only diagnostic fields", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection", history });
    expect(result.response.status).toBe(200);
    expect(result.rpc).toHaveBeenCalledWith("is_admin");
    expect(result.reads).toContainEqual({ table: "chat_messages", fields: "role, content, created_at", limit: 20, userId: TARGET_ID });
    const call = result.aiFetch.mock.calls[0];
    if (!call) throw new Error("Missing model call");
    const payload = JSON.parse(String(call[1].body));
    const transcript = JSON.parse(payload.contents[0].parts[0].text);
    expect(transcript).toHaveLength(20);
    expect(transcript[0].content).toBe("message-19");
    expect(transcript[19].content).toBe("message-0");
    expect(result.body.profile).toEqual({ id: TARGET_ID, dante_affection_pct: 80, dante_affection_title: "Parceiro de Ironias", dante_affection_summary: "Tem assunto e sabe brincar. Dá gosto conversar.", dante_affection_updated_at: expect.any(String) });
    expect(result.updates).toHaveLength(1);
    expect(Object.keys(result.updates[0] ?? {}).sort()).toEqual(["dante_affection_pct", "dante_affection_summary", "dante_affection_title", "dante_affection_updated_at"]);
    expect(result.inserts).toHaveLength(0);
    expect(result.rpc).not.toHaveBeenCalledWith("track_referral_credit_use", expect.anything());
  });

  it("does not invent an evaluation when the user has no history", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection" });
    expect(result.response.status).toBe(400);
    expect(result.aiFetch).not.toHaveBeenCalled();
    expect(result.updates).toHaveLength(0);
  });

  it("rejects an invalid target id", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection", targetId: "invalid", history });
    expect(result.response.status).toBe(400);
    expect(result.aiFetch).not.toHaveBeenCalled();
  });

  it("rejects a missing target profile", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection", missingTarget: true, history });
    expect(result.response.status).toBe(404);
    expect(result.aiFetch).not.toHaveBeenCalled();
  });

  it.each([-1, 101, 50.5])("does not save an invalid percentage %s", async (pct) => {
    const result = await send("admin", "ok", { event: "analyze_affection", history, diagnosis: { pct, title: "Parceiro de Ironias", summary: "Tem assunto. Sabe brincar." } });
    expect(result.response.status).toBe(502);
    expect(result.updates).toHaveLength(0);
  });

  it("reports failure when the diagnostic cannot be saved", async () => {
    const result = await send("admin", "ok", { event: "analyze_affection", history, saveError: true });
    expect(result.response.status).toBe(500);
    expect(result.body.profile).toBeUndefined();
  });
});
