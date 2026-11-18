import { createFileRoute } from '@tanstack/react-router';

const VALID_PLANS = ['dante_plus', 'dante_premium', 'dante_premium_plus'];

async function verifySignature(payload: string, header: string, secret: string) {
  const parts = Object.fromEntries(
    header.split(',').map((kv) => {
      const [k, ...v] = kv.split('=');
      return [k, v.join('=')];
    }),
  );
  const t = parts['t'];
  const sigs = header
    .split(',')
    .filter((kv) => kv.startsWith('v1='))
    .map((kv) => kv.slice(3));
  if (!t || sigs.length === 0) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const key = await crypto.subtle.importKey(
    'raw',
    new TextEncoder().encode(secret),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const mac = await crypto.subtle.sign('HMAC', key, new TextEncoder().encode(`${t}.${payload}`));
  const hex = Array.from(new Uint8Array(mac))
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
  return sigs.some((s) => s.length === hex.length && s === hex);
}

async function stripeGet(path: string, secret: string) {
  const res = await fetch(`https://api.stripe.com/v1/${path}`, {
    headers: { Authorization: `Bearer ${secret}` },
  });
  return res.ok ? res.json() : null;
}

export const Route = createFileRoute('/api/public/stripe-webhook')({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const secret = process.env['STRIPE_SECRET_KEY'];
        const whSecret = process.env['STRIPE_WEBHOOK_SECRET'];
        if (!secret || !whSecret) return new Response('not configured', { status: 400 });

        const payload = await request.text();
        const sig = request.headers.get('stripe-signature') ?? '';
        if (!(await verifySignature(payload, sig, whSecret))) {
          return new Response('invalid signature', { status: 400 });
        }

        const event = JSON.parse(payload) as { type: string; data: { object: any } };
        const { supabaseAdmin } = await import('@/integrations/supabase/client.server');
        const admin = supabaseAdmin as any;

        let subscriptionId: string | null = null;
        let isFirstPayment = false;

        if (event.type === 'checkout.session.completed') {
          const s = event.data.object;
          if (s.mode === 'subscription' && s.payment_status === 'paid') {
            subscriptionId = s.subscription;
            isFirstPayment = true;
          }
        } else if (event.type === 'invoice.paid') {
          const inv = event.data.object;
          if (inv.billing_reason !== 'subscription_create') {
            subscriptionId =
              inv.subscription ?? inv.parent?.subscription_details?.subscription ?? null;
          }
        }
        // Cancelamento: o plano expira sozinho no fim do período já pago.

        if (!subscriptionId) return new Response('ok');

        const sub = await stripeGet(`subscriptions/${subscriptionId}`, secret);
        const userId = sub?.metadata?.user_id;
        const plan = sub?.metadata?.plan;
        if (!userId || !VALID_PLANS.includes(plan)) return new Response('ok');

        const periodEnd =
          sub.current_period_end ?? sub.items?.data?.[0]?.current_period_end ?? null;
        const expiresAt = periodEnd
          ? new Date(periodEnd * 1000 + 24 * 3600 * 1000)
          : new Date(Date.now() + 31 * 24 * 3600 * 1000);

        const { error } = await admin.rpc('activate_subscription_plan', {
          p_user_id: userId,
          p_plan: plan,
          p_expires_at: expiresAt.toISOString(),
        });
        if (error) {
          console.error('[stripe-webhook] activate', error.message);
          return new Response('db error', { status: 500 });
        }

        if (isFirstPayment) {
          const { error: refErr } = await admin.rpc('award_referral_subscription', {
            p_referred_id: userId,
            p_plan: plan,
          });
          if (refErr) console.error('[stripe-webhook] referral', refErr.message);
        }
        return new Response('ok');
      },
    },
  },
});
