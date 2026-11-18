import { useEffect, useState } from 'react';
import { Cookie } from 'lucide-react';
import { navigateTo } from '@/lib/router';
import { applyConsent, getConsent, setConsent } from '@/lib/consent';

export function CookieBanner() {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const consent = getConsent();
    if (consent) {
      applyConsent(consent);
      return;
    }
    const timer = setTimeout(() => setVisible(true), 800);
    return () => clearTimeout(timer);
  }, []);

  const choose = (value: 'accepted' | 'rejected') => {
    setConsent(value);
    setVisible(false);
  };

  if (!visible) return null;

  return (
    <div className="animate-slide-up fixed bottom-0 left-0 right-0 z-50 p-4 sm:p-6">
      <div className="mx-auto flex max-w-3xl flex-col gap-4 rounded-2xl border border-grape-500/30 bg-ink-950 p-4 shadow-2xl backdrop-blur-md sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:p-5">
        <div className="flex items-start gap-3 sm:items-center">
          <div className="flex h-11 w-11 flex-shrink-0 items-center justify-center rounded-xl bg-rose-500/15 text-rose-400">
            <Cookie size={22} />
          </div>
          <p className="text-sm leading-relaxed text-grape-100">
            Utilizamos cookies para aprimorar sua navegação e personalizar conteúdos. Você pode recusar e continuar normalmente. Saiba mais na nossa{' '}
            <button
              onClick={() => navigateTo({ name: 'privacy' })}
              className="font-medium text-rose-300 underline hover:text-rose-200"
            >
              Política de Privacidade
            </button>
            .
          </p>
        </div>
        <div className="flex items-center gap-2.5 sm:flex-shrink-0">
          <button
            onClick={() => choose('accepted')}
            className="btn-primary min-w-[100px] py-2.5 text-sm font-semibold shadow-lg"
          >
            Aceitar
          </button>
          <button
            onClick={() => choose('rejected')}
            className="btn-ghost min-w-[90px] py-2.5 text-sm font-medium hover:bg-white/10"
          >
            Recusar
          </button>
        </div>
      </div>
    </div>
  );
}
