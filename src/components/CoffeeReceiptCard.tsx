import { Coffee, Coins, CupSoda, Zap, Ban } from "lucide-react";
import { formatCaffeine, type CoffeeReceipt } from "@/lib/danteCoffee";

export function CoffeeReceiptCard({ receipt }: { receipt: CoffeeReceipt }) {
  const isRejected = receipt.accepted === false;

  return (
    <article
      className={`dante-coffee-receipt w-[92%] overflow-hidden rounded-2xl bg-ink-900/90 px-4 py-3.5 text-grape-50 shadow-xl border ${
        isRejected ? "border-rose-500/30" : "border-gold-400/15"
      }`}
      role="status"
      aria-label="Recibo de Café"
    >
      <header className="flex items-center gap-2 border-b border-white/10 pb-2.5">
        <span
          className={`flex h-8 w-8 items-center justify-center rounded-xl ${
            isRejected
              ? "bg-rose-500/15 text-rose-400"
              : "bg-gold-400/10 text-gold-400"
          }`}
        >
          {isRejected ? <Ban size={18} aria-hidden="true" /> : <Coffee size={18} aria-hidden="true" />}
        </span>
        <div>
          <h4 className="font-display text-sm font-semibold">
            {isRejected ? "Recibo de Café (Recusado)" : "Recibo de Café"}
          </h4>
          <p
            className={`text-[10px] uppercase tracking-widest ${
              isRejected ? "text-rose-400/80 font-medium" : "text-grape-200/45"
            }`}
          >
            {isRejected ? "Dante rejeitou a xícara" : "Doação confirmada"}
          </p>
        </div>
      </header>

      <ul className="mt-3 space-y-1.5">
        {receipt.items.map((item, index) => (
          <li
            key={`${item.name}-${index}`}
            className="flex items-center justify-between gap-3 text-xs"
          >
            <span className="text-grape-100/85">
              <strong className={isRejected ? "font-semibold text-rose-300" : "font-semibold text-gold-300"}>
                {item.quantity}x
              </strong>{" "}
              {item.name}
            </span>
            <span className="whitespace-nowrap text-[11px] text-grape-200/50">
              {item.price.toLocaleString("pt-BR")} Dantes
            </span>
          </li>
        ))}
      </ul>

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-white/10 pt-2.5 text-xs">
        <span className="flex items-center gap-1.5 font-semibold text-gold-300">
          <Coins size={13} aria-hidden="true" /> {receipt.total.toLocaleString("pt-BR")} Dantes
        </span>
        {isRejected ? (
          <span className="flex items-center gap-1.5 font-semibold text-rose-400">
            <Ban size={13} aria-hidden="true" /> Cafeína absorvida: 0%
          </span>
        ) : (
          <span className="flex items-center gap-1.5 font-semibold text-gold-400">
            <Zap size={13} aria-hidden="true" /> +{formatCaffeine(receipt.caffeine_added)} de cafeína
          </span>
        )}
      </div>

      {isRejected ? (
        <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-rose-500/10 px-2.5 py-2 text-[11px] leading-relaxed text-rose-300">
          <Ban size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
          "Café toma quem quer..." O Dante não encostou na xícara. Os Dantes não são reembolsáveis.
        </p>
      ) : (
        receipt.bottle_added > 0 && (
          <p className="mt-2.5 flex items-start gap-1.5 rounded-lg bg-sky2-400/5 px-2.5 py-2 text-[11px] leading-relaxed text-sky2-300">
            <CupSoda size={13} className="mt-0.5 flex-shrink-0" aria-hidden="true" />
            {formatCaffeine(receipt.bottle_added)} do excedente foram guardados na sua Garrafa Térmica.
          </p>
        )
      )}
    </article>
  );
}
