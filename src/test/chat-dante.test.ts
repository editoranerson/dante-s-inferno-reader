// @vitest-environment node
import { readFileSync } from "node:fs";
import ts from "typescript";
import { describe, expect, it, vi } from "vitest";

// Execute the actual imported Edge handler with fake external services.
const source = readFileSync(new URL("../../supabase/functions/chat-dante/index.ts", import.meta.url), "utf8");
const compiled = ts.transpileModule(source.replace(/^import .*createClient.*;\s*/m, ""), {
  compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.None },
}).outputText;

async function send(role: string, referralResult: "ok" | "error" | "throw" = "ok", options: { message?: string; credits?: number; lastMessageDate?: string; flag?: { reason: string; severity: string; block_minutes: number } } = {}) {
  const profile = {
    id: "test-user", role, credits: options.credits ?? 10, messages_today: 0,
    last_message_date: options.lastMessageDate ?? new Date(Date.now() - 3 * 60 * 60 * 1000).toISOString().slice(0, 10),
    caffeine_level: 75,
  };
  const inserts: unknown[] = [];
  const updates: Record<string, unknown>[] = [];
  const rpc = vi.fn(() => {
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
      const builder = {
        select: () => builder, eq: () => builder, order: () => builder, limit: () => builder,
        maybeSingle: async () => ({ data: profile, error: null }),
        insert: (rows: unknown) => { inserts.push(rows); return builder; },
        update: (values: Record<string, unknown>) => { updates.push(values); return builder; },
        then: (resolve: (value: unknown) => unknown) => resolve({ data: table === "profiles" ? profile : [], error: null }),
      };
      return builder;
    },
  };
  const aiFetch = vi.fn(async () => new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: JSON.stringify({ reply: "Resposta de teste", energy_spent: 2, sarcasm_score: 30, flag: options.flag ?? null }) }] } }] }), { status: 200 }));
  let handler: ((request: Request) => Promise<Response>) | undefined;
  new Function("createClient", "Deno", "fetch", compiled)(() => client, {
    env: { get: () => "fake-test-value" },
    serve: (callback: typeof handler) => { handler = callback; },
  }, aiFetch);
  if (!handler) throw new Error("Chat handler was not registered");
  const response = await handler(new Request("https://example.test/chat", {
    method: "POST", headers: { Authorization: "Bearer fake-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({ message: options.message ?? "Olá Dante", client_datetime: { context: "Hoje é 18 de novembro de 2026, horário local: 15:43 GMT-3 (fuso America/Fortaleza)." } }),
  }));
  return { response, body: await response.json(), rpc, inserts, updates, aiFetch };
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
    const result = await send("user", "ok", { message: "[DOAÇÃO] Café doado", credits: 0, lastMessageDate: "2020-01-01" });
    expect(result.response.status).toBe(200);
    expect(result.body.reply).toBe("Resposta de teste");
    expect(result.body.credits).toBe(0);
    expect(result.rpc).not.toHaveBeenCalled();
    expect(result.updates).toHaveLength(0);
    expect(result.inserts).toHaveLength(1);
  });

  it("does not consume caffeine on a direct donation", async () => {
    const result = await send("user", "ok", { message: "[DOAÇÃO] Café doado" });
    expect(result.body.energy_spent).toBe(0);
    expect(result.body.caffeine_level).toBe(75);
  });

  it("omits the sarcasm meter from a direct donation response and saved message", async () => {
    const result = await send("user", "ok", { message: "[DOAÇÃO] Café doado" });
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
    const result = await send("user", "ok", { message: "[DOAÇÃO] Café doado", flag: { reason: "tired", severity: "low", block_minutes: 10 } });
    expect(result.body.blocked).toBe(false);
    expect(result.updates).toHaveLength(0);
    expect(result.inserts).toHaveLength(1);
  });
});