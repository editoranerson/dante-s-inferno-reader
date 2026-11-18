import { createFileRoute } from '@tanstack/react-router';
import { createClient } from '@supabase/supabase-js';

const PRICE_IDS: Record<string, string> = {
  dante_plus: 'price_1UMDr6Qq48fWgxlHlz83LEuY',
  dante_premium: 'price_1UMDrdQq48fWgxlH3UJx3IUq',
  dante_premium_plus: 'price_1UMDsGQq48fWgxlHBP7vBht3',
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

export const Route = createFileRoute('/api/public/stripe-checkout')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['STRIPE_SECRET_KEY'];
        if (!secret) {
          console.error('[stripe-checkout] STRIPE_SECRET_KEY ausente');
          return json({ error: 'Pagamento não configurado.' }, 500);
        }

        const token = (request.headers.get('authorization') ?? '').replace('Bearer ', '');
        if (!token) return json({ error: 'Faça login para assinar.' }, 401);

        // Aceita qualquer nome que a integração Supabase/Vercel possa ter criado.
        const url =
          process.env['SUPABASE_URL'] ??
          process.env['VITE_SUPABASE_URL'] ??
          process.env['NEXT_PUBLIC_SUPABASE_URL'];
        const anon =
          process.env['SUPABASE_PUBLISHABLE_KEY'] ??
          process.env['SUPABASE_ANON_KEY'] ??
          process.env['VITE_SUPABASE_PUBLISHABLE_KEY'] ??
          process.env['VITE_SUPABASE_ANON_KEY'] ??
          process.env['NEXT_PUBLIC_SUPABASE_ANON_KEY'];
        if (!url || !anon) {
          console.error('[stripe-checkout] variáveis Supabase ausentes', {
            hasUrl: !!url,
            hasAnon: !!anon,
          });
          return json({ error: 'Configuração do servidor incompleta.' }, 500);
        }
        const sb = createClient(url, anon, { auth: { persistSession: false } });
        const { data: userData, error: userErr } = await sb.auth.getUser(token);
        if (userErr || !userData.user) return json({ error: 'Sessão inválida. Faça login novamente.' }, 401);
        const user = userData.user;

        const body = (await request.json().catch(() => ({}))) as { plan?: string };
        const plan = body.plan ?? '';
        const price = PRICE_IDS[plan];
        if (!price) return json({ error: 'Plano inválido.' }, 400);

        const origin = new URL(request.url).origin;
        const p = new URLSearchParams();
        p.set('mode', 'subscription');
        p.set('line_items[0][price]', price);
        p.set('line_items[0][quantity]', '1');
        p.set('success_url', `${origin}/pagamento-concluido`);
        p.set('cancel_url', `${origin}/planos`);
        p.set('client_reference_id', user.id);
        if (user.email) p.set('customer_email', user.email);
        p.set('metadata[user_id]', user.id);
        p.set('metadata[plan]', plan);
        p.set('subscription_data[metadata][user_id]', user.id);
        p.set('subscription_data[metadata][plan]', plan);
        p.set('allow_promotion_codes', 'true');
        p.set('billing_address_collection', 'auto');
        p.set('phone_number_collection[enabled]', 'false');
        p.set('payment_method_collection', 'always');
        p.set('submit_type', 'auto');
        p.set('saved_payment_method_options[payment_method_save]', 'enabled');

        const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
          method: 'POST',
          headers: {
            Authorization: `Bearer ${secret}`,
            'Content-Type': 'application/x-www-form-urlencoded',
          },
          body: p,
        });
        const data = (await res.json()) as { url?: string; error?: { message?: string } };
        if (!res.ok || !data.url) {
          console.error('[stripe-checkout] stripe error', res.status, data.error?.message);
          return json({ error: 'Não foi possível iniciar o pagamento.' }, 502);
        }
        return json({ url: data.url });
      },
    },
  },
});
