import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "npm:@supabase/supabase-js@2.112.2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, X-Client-Info, Apikey",
};

const PLANS: Record<string, { title: string; price: number }> = {
  dante_plus: { title: "Dante Plus", price: 4.9 },
  dante_premium: { title: "Dante Premium", price: 9.9 },
  dante_premium_plus: { title: "Dante Premium+", price: 19.9 },
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

function mpError(raw: string, status: number): string {
  let msg = `Mercado Pago recusou a solicitação (${status}).`;
  try {
    const e = JSON.parse(raw) as {
      message?: string;
      error?: string;
      cause?: Array<{ description?: string }>;
    };
    if (e.cause?.[0]?.description) msg = e.cause[0].description;
    else if (e.message) msg = e.message;
    else if (e.error) msg = e.error;
  } catch {
    /* mantém mensagem padrão */
  }
  return msg;
}

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 200, headers: corsHeaders });
  }

  if (req.method !== "POST") return json({ error: "method_not_allowed" }, 405);

  try {
    const token = Deno.env.get("MERCADO_PAGO_ACCESS_TOKEN");
    if (!token) return json({ error: "Pagamento não configurado." }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) return json({ error: "Não autenticado." }, 401);

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabase = createClient(supabaseUrl, Deno.env.get("SUPABASE_ANON_KEY")!, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { data: userData, error: userErr } = await supabase.auth.getUser(
      authHeader.replace("Bearer ", ""),
    );
    if (userErr || !userData.user) {
      return json({ error: "Sessão inválida. Faça login novamente." }, 401);
    }

    const body = await req.json().catch(() => ({})) as {
      plan?: string;
      payer_email?: string;
      success_url?: string;
    };

    const planId = String(body.plan ?? "");
    const plan = PLANS[planId];
    if (!plan) return json({ error: `Plano inválido: ${planId}` }, 400);

    const payerEmail = String(body.payer_email ?? "").trim() || userData.user.email || "";
    if (!payerEmail) {
      return json({ error: "E-mail não encontrado. Atualize seu cadastro." }, 400);
    }

    // ===== Checkout Web (redirecionamento) =====
    // Cria a assinatura (preapproval) SEM card_token_id e SEM status "authorized".
    // O Mercado Pago retorna um init_point: página web de login/pagamento onde o
    // usuário escolhe como pagar (saldo, cartão salvo, novo cartão, Pix etc.).
    // O plano é liberado pelo webhook quando a assinatura ficar "authorized".
    const preapproval = {
      reason: `${plan.title} — assinatura mensal`,
      external_reference: `${userData.user.id}:${planId}`,
      payer_email: payerEmail,
      auto_recurring: {
        frequency: 1,
        frequency_type: "months",
        transaction_amount: plan.price,
        currency_id: "BRL",
      },
      back_url: /^https:\/\//.test(String(body.success_url ?? ""))
        ? String(body.success_url)
        : undefined,
      status: "pending",
    };

    const mpRes = await fetch("https://api.mercadopago.com/preapproval", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        "X-Idempotency-Key": `${userData.user.id}-${planId}-${Date.now()}`,
      },
      body: JSON.stringify(preapproval),
    });

    const raw = await mpRes.text();
    if (!mpRes.ok) return json({ error: mpError(raw, mpRes.status) }, 400);

    const data = JSON.parse(raw) as { id?: string; status?: string; init_point?: string };

    if (!data.init_point) {
      return json({ error: "Mercado Pago não retornou o link de pagamento." }, 502);
    }

    return json({ id: data.id, status: data.status ?? "pending", init_point: data.init_point });
  } catch {
    return json({ error: "Erro interno do servidor." }, 500);
  }
});
