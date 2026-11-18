import { useEffect, useMemo, useState } from 'react';
import { ExternalLink, Loader2, ShieldCheck } from 'lucide-react';
import { Modal } from '@/components/Modal';
import { supabase, type PlanType } from '@/lib/supabase';
import { getPlanInfo } from '@/lib/plans';
import { useAuth } from '@/lib/auth';

interface SubscribeModalProps {
  open: boolean;
  plan: PlanType | null;
  onClose: () => void;
}

export function SubscribeModal({ open, plan, onClose }: SubscribeModalProps) {
  const { user } = useAuth();

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const planInfo = useMemo(() => (plan ? getPlanInfo(plan) : null), [plan]);

  useEffect(() => {
    if (!open) return;
    setError(null);
    setSubmitting(false);
  }, [open]);

  const goToCheckout = async () => {
    if (!plan || !planInfo || submitting) return;

    setError(null);
    setSubmitting(true);
    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        setError('Sessão expirada. Faça login novamente.');
        return;
      }

      const res = await fetch('/api/public/stripe-checkout', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({ plan }),
      });

      const data = (await res.json().catch(() => ({}))) as { url?: string; error?: string };

      if (!res.ok || !data.url) {
        setError(data.error || `Não foi possível iniciar o pagamento (${res.status}).`);
        return;
      }

      // Redireciona para a página segura da Stripe (100% web).
      window.location.href = data.url;
    } catch {
      setError('Erro de conexão. Verifique sua internet e tente novamente.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={planInfo ? `Assinar ${planInfo.name}` : 'Assinar'}
      maxWidth="max-w-md"
    >
      <div className="space-y-4">
        <div className="flex items-center justify-between rounded-xl border border-white/10 bg-white/5 px-4 py-3">
          <span className="text-sm text-grape-200/70">Cobrança mensal</span>
          <span className="font-display text-lg font-bold text-grape-50">
            {planInfo?.priceLabel}
          </span>
        </div>

        <p className="text-sm text-grape-200/70">
          Você será redirecionado para a página segura da Stripe para escolher como pagar (cartão,
          Apple Pay ou Google Pay). A renovação é automática e você pode cancelar quando quiser.
        </p>

        {error && (
          <p className="rounded-xl border border-rose-400/30 bg-rose-400/10 px-3 py-2 text-xs text-rose-200">
            {error}
          </p>
        )}

        <button
          type="button"
          onClick={goToCheckout}
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-sky2-400 to-rose-400 py-3 text-sm font-semibold text-white transition hover:brightness-110 active:scale-[0.98] disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 size={16} className="animate-spin" /> Gerando link de pagamento...
            </>
          ) : (
            <>
              <ExternalLink size={16} /> Ir para o pagamento
            </>
          )}
        </button>

        <p className="flex items-center justify-center gap-1.5 text-center text-[11px] text-grape-200/50">
          <ShieldCheck size={13} /> Pagamento seguro processado pela Stripe. Seu plano é liberado
          automaticamente após a confirmação.
        </p>
      </div>
    </Modal>
  );
}
