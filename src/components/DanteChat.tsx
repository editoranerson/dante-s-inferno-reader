import { useState, useRef, useEffect, useCallback } from "react";
import danteAvatar from "@/assets/dante-avatar.webp";
import {
  X,
  Rocket,
  LogIn,
  UserPlus,
  Coins,
  Zap,
  Moon,
  Power,
  Copy,
  Check,
  Coffee,
  Clock,
  Flag,
} from "lucide-react";
import ReactMarkdown from "react-markdown";
import { useAuth } from "@/lib/auth";
import { useToast } from "@/components/Toast";
import { navigateTo } from "@/lib/router";
import { supabase, SUPABASE_URL } from "@/lib/supabase";
import type { ChatMessage } from "@/lib/supabase";
import { fetchDanteBreaks, findActiveBreak, type DanteBreak } from "@/lib/danteBreaks";
import { fetchDantePower, type DantePowerState } from "@/lib/dantePower";
import { DanteProfileModal } from "@/components/DanteProfileModal";
import { CoffeeReceiptCard } from "@/components/CoffeeReceiptCard";
import { DanteReportDialog, type DanteReportTarget } from "@/components/DanteReportDialog";
import { findReportUserMessage } from "@/lib/danteReports";
import { getSelectedWallpaper } from "@/lib/wallpapers";
import {
  formatBlockCountdown,
  getActiveDanteBlock,
  parseCoffeeReceipt,
  type CoffeeDonationEvent,
  type CoffeeReceipt,
  type DanteBlock,
} from "@/lib/danteCoffee";
import { EmbedFrame } from "@/components/showcase/EmbedFrame";
import {
  CHAT_AD_INTERVAL,
  drawBanner,
  fetchActiveBanners,
  getLastShown,
  resolveUserPlan,
  setLastShown,
  type AdBanner,
} from "@/lib/showcase";

interface UIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  receipt?: CoffeeReceipt;
}

const DANTE_GRADIENT = "linear-gradient(135deg, #7F00FF, #FF007F)";

function createClientDateTime(now = new Date()) {
  const date = new Intl.DateTimeFormat("pt-BR", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  }).format(now);
  const time = new Intl.DateTimeFormat("pt-BR", {
    hour: "2-digit",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(now);
  const weekday = new Intl.DateTimeFormat("pt-BR", { weekday: "long" }).format(now);
  const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;

  return {
    iso: now.toISOString(),
    date,
    time,
    weekday,
    timezone,
    context: `Hoje é ${date} (${weekday}), horário local: ${time} (fuso ${timezone}).`,
  };
}

function Sarcasmometer({ score }: { score: number }) {
  const clamped = Math.max(0, Math.min(100, score));
  const gradient = "linear-gradient(to right, #38BDF8, #B5E853, #FFC226, #FF8C42, #EF4444)";
  return (
    <div className="mt-1.5 flex items-center gap-1.5" aria-hidden="true">
      <div
        className="relative h-2 flex-1 overflow-hidden rounded-full"
        style={{ background: gradient }}
      >
        <div
          className="absolute top-1/2 -translate-y-1/2 text-xs leading-none transition-all duration-500 ease-out"
          style={{ left: `calc(${clamped}% - 8px)` }}
        >
          ⚡
        </div>
      </div>
    </div>
  );
}

export function DanteChat() {
  const { user, profile, isAdmin, refreshProfile } = useAuth();
  const [showProfile, setShowProfile] = useState(false);
  const [wallpaper, setWallpaper] = useState("");
  useEffect(() => {
    const sync = () => setWallpaper(getSelectedWallpaper());
    sync();
    window.addEventListener("dante-wallpaper", sync);
    return () => window.removeEventListener("dante-wallpaper", sync);
  }, []);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [showLoginPrompt, setShowLoginPrompt] = useState(false);
  const [messages, setMessages] = useState<UIMessage[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [evaluatingCoffee, setEvaluatingCoffee] = useState(false);
  const [credits, setCredits] = useState<number>(0);
  const [breaks, setBreaks] = useState<DanteBreak[]>([]);
  const [activeBreak, setActiveBreak] = useState<DanteBreak | null>(null);
  const [powerState, setPowerState] = useState<DantePowerState>({ enabled: true, message: "" });
  const [sarcasmScore, setSarcasmScore] = useState<number | null>(null);
  const [energySpent, setEnergySpent] = useState<number | null>(null);
  const [danteBlock, setDanteBlock] = useState<DanteBlock | null>(null);
  const [blockNow, setBlockNow] = useState(Date.now());
  const [chatInserts, setChatInserts] = useState<Record<string, AdBanner>>({});
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [reportTarget, setReportTarget] = useState<DanteReportTarget | null>(null);
  const interactionsRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const handleCopyMessage = async (id: string, text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(id);
      toast("Mensagem copiada para a área de transferência!", "info");
      setTimeout(() => setCopiedId(null), 2000);
    } catch {
      toast("Não foi possível copiar a mensagem.", "error");
    }
  };

  const openReportDialog = (message: UIMessage) => {
    setReportTarget({
      id: message.id,
      userMessage: findReportUserMessage(messages, message.id),
      danteResponse: message.content,
    });
  };

  const handleCoffeeDonated = async ({ receipt }: CoffeeDonationEvent) => {
    setShowProfile(false);
    const receiptId = `coffee-${Date.now()}`;
    setMessages((prev) => [
      ...prev,
      {
        id: receiptId,
        role: "user",
        content: "",
        receipt,
      },
    ]);
    setLoading(true);
    setEvaluatingCoffee(true);
    setSarcasmScore(null);
    setEnergySpent(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast(
          "Sessão expirada. O recibo foi salvo; faça login novamente para ouvir o Dante.",
          "error",
        );
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-dante`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          event_type: "coffee_donation",
          client_datetime: createClientDateTime(),
        }),
      });
      const data = (await res.json().catch(() => null)) as {
        reply?: string;
        error?: string;
        coffee_accepted?: boolean;
        coffee_receipt?: CoffeeReceipt;
      } | null;

      if (!res.ok || !data || data.error || typeof data.reply !== "string") {
        console.error(
          "[DanteChat] Coffee donation acknowledgement error:",
          res.status,
          data?.error,
        );
        toast("Café entregue e recibo salvo, mas o Dante não conseguiu agradecer agora.", "error");
        return;
      }

      const confirmedReply = data.reply;
      const confirmedReceipt = data.coffee_receipt ?? {
        ...receipt,
        accepted: data.coffee_accepted,
        caffeine_added: data.coffee_accepted === false ? 0 : receipt.caffeine_added,
        bottle_added: data.coffee_accepted === false ? 0 : receipt.bottle_added,
      };
      setMessages((prev) => [
        ...prev.map((message) => message.id === receiptId ? { ...message, receipt: confirmedReceipt } : message),
        {
          id: `coffee-ai-${Date.now()}`,
          role: "assistant",
          content: confirmedReply,
        },
      ]);
    } catch (error) {
      console.error("[DanteChat] Coffee donation connection error:", error);
      toast("Café entregue e recibo salvo, mas a conexão caiu antes do agradecimento.", "error");
    } finally {
      setLoading(false);
      setEvaluatingCoffee(false);
      setSarcasmScore(null);
      setEnergySpent(null);
      await refreshProfile();
    }
  };

  const loadHistory = useCallback(async () => {
    if (!user) return;
    const { data } = await supabase
      .from("chat_messages")
      .select("*")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(20);
    if (data) {
      const rows = (data as ChatMessage[]).reverse();
      rows.sort((a, b) => {
        const ta = new Date(a.created_at).getTime();
        const tb = new Date(b.created_at).getTime();
        if (ta !== tb) return ta - tb;
        return a.role === "user" ? -1 : 1;
      });
      setMessages(
        rows.map((m) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          receipt: parseCoffeeReceipt(m.content) ?? undefined,
        })),
      );
    }
  }, [user]);

  const historyLoadedRef = useRef(false);

  useEffect(() => {
    if (open && user) {
      if (!historyLoadedRef.current) {
        loadHistory();
        historyLoadedRef.current = true;
      }
      if (profile) setCredits(profile.credits ?? 0);
    }
    if (!open) {
      historyLoadedRef.current = false;
    }
  }, [open, user, profile, loadHistory]);

  useEffect(() => {
    if (!open) return;
    setDanteBlock(isAdmin ? null : getActiveDanteBlock(profile));
    setBlockNow(Date.now());
  }, [open, profile, isAdmin]);

  useEffect(() => {
    if (!danteBlock) return;
    const tick = () => {
      const now = Date.now();
      setBlockNow(now);
      if (new Date(danteBlock.until).getTime() <= now) setDanteBlock(null);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [danteBlock]);

  useEffect(() => {
    if (!open || isAdmin) return;
    let cancelled = false;
    fetchDanteBreaks(true).then((rows) => {
      if (!cancelled) setBreaks(rows);
    });
    fetchDantePower().then((s) => {
      if (!cancelled) setPowerState(s);
    });
    return () => {
      cancelled = true;
    };
  }, [open, isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      setActiveBreak(null);
      return;
    }
    const update = () => setActiveBreak(findActiveBreak(breaks));
    update();
    const id = setInterval(update, 30000);
    return () => clearInterval(id);
  }, [breaks, isAdmin]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, loading]);

  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const powerOff = !isAdmin && !powerState.enabled;

  const maybeShowChatAd = async (anchorId: string) => {
    interactionsRef.current += 1;
    const plan = resolveUserPlan(profile);
    const interval = CHAT_AD_INTERVAL[plan] ?? 2;
    if (interactionsRef.current % interval !== 0) return;
    const rows = await fetchActiveBanners();
    const pool = rows.filter((b) => b.placement === "html");
    const banner = drawBanner(pool, plan, "chat", getLastShown("dante-conversa"));
    if (!banner) return;
    setLastShown("dante-conversa", banner.id);
    setChatInserts((prev) => ({ ...prev, [anchorId]: banner }));
  };

  const sendMessage = async () => {
    if (!input.trim() || loading || !user || activeBreak || powerOff || danteBlock) return;

    const userMsg: UIMessage = {
      id: `temp-${Date.now()}`,
      role: "user",
      content: input.trim(),
    };
    setMessages((prev) => [...prev, userMsg]);
    setInput("");
    setLoading(true);
    setSarcasmScore(null);
    setEnergySpent(null);

    try {
      const { data: session } = await supabase.auth.getSession();
      if (!session.session) {
        toast("Sessão expirada. Faça login novamente.", "error");
        return;
      }

      const res = await fetch(`${SUPABASE_URL}/functions/v1/chat-dante`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.session.access_token}`,
        },
        body: JSON.stringify({
          message: userMsg.content,
          client_datetime: createClientDateTime(),
        }),
      });

      if (!res.ok) {
        const errText = await res.text().catch(() => "");
        console.error("[DanteChat] Edge function error:", res.status, errText);
        let friendly: string;
        if (res.status === 401) {
          friendly =
            errText.includes("inválida") || errText.includes("invalid")
              ? "[D-097] Alguém aí? Acho que você precisa logar de novo 🔍"
              : "[D-096] Quem é você? Faça login por favor 🤨";
        } else if (res.status === 404) {
          friendly =
            "[D-098] Eu existo (eu acho) e você? Será que existe? Não te encontrei aqui nos registros 🗃️";
        } else if (res.status === 429) {
          friendly =
            "[D-E-S-C-A-N-Ç-O] Cansei, vou dormir um pouco, volto algum dia 😴 ou não. Isso não é um erro, é saúde 😉";
        } else if (res.status === 504) {
          friendly =
            "[D-101] Ops, tô devagar, vou tomar um cafezinho virtual, tente de novo em 1 minuto ☕";
        } else if (res.status === 502) {
          if (errText.includes("Limite de uso")) {
            friendly =
              "[D-103] Sei que sou incrível, mas sou um só. Tô recebendo uma chuva de mensagem agora, tente já já 🕖";
          } else if (errText.includes("Resposta vazia")) {
            friendly = "[D-105] Acho que desaprendi a escrever 😅 tenta de novo.";
          } else if (errText.includes("Falha ao conectar")) {
            friendly = "[D-102] Acho que a mensagem se perdeu no caminho, pode tentar de novo? 📩";
          } else {
            friendly = "[D-104] Erro desconhecido... Será que tô vivo? 😵";
          }
        } else if (res.status === 500 && errText.includes("GEMINI_API_KEY")) {
          friendly = "[D-201] Me perdi 😁 por favor, pode avisar ao meu criador 🥹";
        } else {
          friendly = "[D-500] Minha casa tá uma bagunça, vou limpar, tente de novo em 5 minutos 🧹";
        }
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== userMsg.id),
          { id: `err-${Date.now()}`, role: "assistant", content: friendly },
        ]);
        return;
      }

      const data = await res.json();

      if (data.blocked && data.blocked_until && !data.reply?.includes("[DOAÇÃO]")) {
        setDanteBlock({
          until: data.blocked_until,
          reason:
            data.reason === "violation" || data.block_reason === "violation"
              ? "violation"
              : "tired",
        });
        setBlockNow(Date.now());
        if (!data.energy_spent) {
          setMessages((prev) => [
            ...prev.filter((m) => m.id !== userMsg.id),
            { id: `blocked-${Date.now()}`, role: "assistant", content: data.reply },
          ]);
          return;
        }
      }

      if (data.error === "no_credits") {
        setMessages((prev) => prev.filter((m) => m.id !== userMsg.id));
        toast(
          "Você não tem Créditos suficientes. Visite a Loja de Recompensas para comprar mais!",
          "error",
        );
        setCredits(0);
        return;
      }

      if (data.error) {
        console.error("[DanteChat] API error:", data.error);
        setMessages((prev) => [
          ...prev.filter((m) => m.id !== userMsg.id),
          {
            id: `err-${Date.now()}`,
            role: "assistant",
            content: "[D-201] Fui pego no flagra, revisa essa mensagem aí 😅",
          },
        ]);
        return;
      }

      const aiMsg: UIMessage = {
        id: `ai-${Date.now()}`,
        role: "assistant",
        content: data.reply,
      };
      setMessages((prev) => [...prev, aiMsg]);
      void maybeShowChatAd(aiMsg.id);

      if (typeof data.sarcasm_score === "number" && !Number.isNaN(data.sarcasm_score)) {
        setSarcasmScore(Math.max(0, Math.min(100, Math.round(data.sarcasm_score))));
      } else {
        setSarcasmScore(0);
      }

      if (typeof data.energy_spent === "number") {
        setEnergySpent(Math.max(1, Math.min(7, Math.round(data.energy_spent))));
      }

      if (typeof data.credits === "number") {
        setCredits(data.credits);
        await refreshProfile();
      }
    } catch (error) {
      console.error("[DanteChat] Connection error:", error);
      const errMsg = error instanceof Error ? error.message : String(error);
      setMessages((prev) => [
        ...prev.filter((m) => m.id !== userMsg.id),
        {
          id: `err-${Date.now()}`,
          role: "assistant",
          content: "[D-NET] Nossa conexão caiu, verifique sua internet 🛜",
        },
      ]);
    } finally {
      setLoading(false);
      setTimeout(() => textareaRef.current?.focus(), 100);
    }
  };

  const handleButtonClick = () => {
    if (user) {
      setOpen(true);
    } else {
      setShowLoginPrompt(true);
    }
  };

  const creditsLabel = isAdmin
    ? "Ilimitado (Admin)"
    : `${credits} Crédito${credits === 1 ? "" : "s"}`;

  return (
    <>
      {!open && (
        <button
          onClick={handleButtonClick}
          className="group fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full shadow-xl transition-transform hover:scale-110 active:scale-95"
          aria-label="Conversar com o Dante"
        >
          <span className="absolute inset-0 rounded-full dante-avatar-ring" />
          <img
            src={danteAvatar}
            alt="Dante"
            className="relative z-10 h-[calc(100%-6px)] w-[calc(100%-6px)] rounded-full object-cover"
          />
        </button>
      )}

      {showLoginPrompt && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-sm animate-fade-in"
            onClick={() => setShowLoginPrompt(false)}
          />
          <div className="relative z-10 w-full max-w-sm card bg-ink-800/95 p-6 animate-scale-in text-center">
            <img
              src={danteAvatar}
              alt="Dante"
              className="mx-auto mb-4 h-16 w-16 rounded-full object-cover flex-shrink-0"
            />
            <h3 className="mb-2 font-display text-xl font-semibold text-grape-50">
              Converse com o Dante
            </h3>
            <p className="mb-6 text-sm text-grape-200/70">
              O Dante está esperando para conversar com você! Faça login ou crie uma conta para
              começar.
            </p>
            <div className="flex flex-col gap-3">
              <button
                onClick={() => {
                  setShowLoginPrompt(false);
                  navigateTo({ name: "login" });
                }}
                className="btn-primary w-full"
              >
                <LogIn size={18} /> Fazer Login
              </button>
              <button
                onClick={() => {
                  setShowLoginPrompt(false);
                  navigateTo({ name: "signup" });
                }}
                className="btn-ghost w-full"
              >
                <UserPlus size={18} /> Criar Conta
              </button>
              <button
                onClick={() => setShowLoginPrompt(false)}
                className="text-sm text-grape-200/50 hover:text-grape-200"
              >
                Agora não
              </button>
            </div>
          </div>
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-end justify-end p-0 sm:p-6 sm:items-end">
          <div
            className="absolute inset-0 bg-ink-950/60 backdrop-blur-sm sm:hidden"
            onClick={() => setOpen(false)}
          />
          <div className="dante-chat-window relative z-10 flex h-[100dvh] w-full max-w-md flex-col overflow-hidden rounded-t-2xl border border-white/10 bg-ink-900/95 shadow-2xl animate-slide-up sm:h-auto sm:rounded-2xl">
            {showProfile && (
              <DanteProfileModal
                onClose={() => setShowProfile(false)}
                onCoffeeDonated={handleCoffeeDonated}
              />
            )}
            <DanteReportDialog target={reportTarget} onClose={() => setReportTarget(null)} />
            {/* Header */}
            <div className="dante-chat-bar flex items-center justify-between border-b border-white/10 bg-ink-800/80 px-4 py-3">
              <button
                type="button"
                onClick={() => setShowProfile(true)}
                className="flex items-center gap-3 text-left"
                aria-label="Abrir perfil do Dante"
              >
                <img
                  src={danteAvatar}
                  alt="Dante"
                  className="h-10 w-10 rounded-full object-cover flex-shrink-0"
                />
                <div>
                  <h3 className="flex items-center gap-2 font-dante text-lg font-semibold text-grape-50">
                    Dante
                    <span
                      title="Dante 3.0"
                      className="inline-flex items-center gap-1 rounded-full border border-fuchsia-400/30 bg-fuchsia-500/10 px-2 py-0.5 text-[10px] font-semibold text-fuchsia-200"
                    >
                      <Zap size={11} className="text-fuchsia-300" /> 3.0
                    </span>
                  </h3>
                  <p className="flex items-center gap-1 text-xs text-grape-200/60">
                    <Coins size={12} className="text-gold-400" />
                    {creditsLabel}
                  </p>
                </div>
              </button>
              <button
                onClick={() => setOpen(false)}
                className="rounded-full p-2 text-grape-200/70 hover:bg-white/10 hover:text-grape-50"
                aria-label="Fechar"
              >
                <X size={20} />
              </button>
            </div>

            {/* Messages */}
            <div
              ref={scrollRef}
              className="flex-1 overflow-y-auto px-4 py-4 space-y-3 bg-cover bg-center"
              style={wallpaper ? { backgroundImage: `url(${wallpaper})` } : undefined}
            >
              {danteBlock && (
                <div
                  className={`mb-2 flex flex-col items-center rounded-2xl border px-4 py-5 text-center ${danteBlock.reason === "tired" ? "border-gold-400/20 bg-gold-400/5" : "border-rose-400/20 bg-rose-500/10"}`}
                >
                  {danteBlock.reason === "tired" ? (
                    <Coffee size={22} className="mb-2 text-gold-400" />
                  ) : (
                    <Clock size={22} className="mb-2 text-rose-300" />
                  )}
                  <p className="text-sm font-semibold text-grape-50">
                    {danteBlock.reason === "tired"
                      ? "Dante tirou uma folga"
                      : "Conversa temporariamente suspensa"}
                  </p>
                  <p className="mt-1 text-xs text-grape-200/70">
                    {danteBlock.reason === "tired"
                      ? "Ele foi esfriar os circuitos e olhar para o teto. A cafeteira continua aberta no perfil."
                      : "O Dante exigiu respeito. Você ainda pode visitar o perfil e doar um café."}
                  </p>
                  <p className="mt-3 font-dante text-2xl font-semibold text-grape-50" role="timer">
                    {formatBlockCountdown(danteBlock.until, blockNow)}
                  </p>
                  <p className="text-[10px] uppercase tracking-wider text-grape-200/50">
                    para liberar a conversa
                  </p>
                </div>
              )}
              {activeBreak && (
                <div className="mb-2 flex flex-col items-center rounded-2xl border border-white/10 bg-ink-700/50 px-4 py-5 text-center">
                  <Moon size={22} className="mb-2 text-grape-300" />
                  <p className="text-sm text-grape-200/80">{activeBreak.message}</p>
                </div>
              )}
              {powerOff && (
                <div className="mb-2 flex flex-col items-center rounded-2xl border border-rose-400/20 bg-rose-500/10 px-4 py-5 text-center">
                  {powerState.image_url ? (
                    <img
                      src={powerState.image_url}
                      alt="Dante indisponível"
                      className={`mb-3 w-full max-w-[320px] rounded-xl object-cover ${powerState.image_ratio === "1:1" ? "aspect-square" : "aspect-[4/5]"}`}
                    />
                  ) : (
                    <Power size={22} className="mb-2 text-rose-300" />
                  )}
                  {powerState.message ? (
                    <ReactMarkdown
                      components={{
                        p: ({ node, ...props }) => (
                          <p className="m-0 text-sm text-rose-100/90" {...props} />
                        ),
                      }}
                    >
                      {powerState.message}
                    </ReactMarkdown>
                  ) : (
                    <p className="text-sm text-rose-100/90">O Dante está offline no momento.</p>
                  )}
                </div>
              )}

              {messages.length === 0 && !loading && !activeBreak && !danteBlock && (
                <div className="flex flex-col items-center justify-center py-12 text-center">
                  <img
                    src={danteAvatar}
                    alt="Dante"
                    className="mb-3 h-14 w-14 mx-auto rounded-full object-cover flex-shrink-0"
                  />
                  <p className="text-sm text-grape-200/60">
                    Olá! Sou o Dante. Como posso te ajudar hoje?
                  </p>
                </div>
              )}

              {messages.map((msg) => {
                if (msg.receipt) {
                  return (
                    <div key={msg.id} className="flex justify-center">
                      <CoffeeReceiptCard receipt={msg.receipt} />
                    </div>
                  );
                }
                if (msg.role === "system") {
                  return (
                    <div key={msg.id} className="flex justify-center" role="status">
                      <div className="flex max-w-[92%] items-start gap-2 rounded-xl border border-gold-400/20 bg-gold-400/5 px-3 py-2 text-xs text-gold-400">
                        <Coffee size={15} className="mt-0.5 flex-shrink-0" />
                        <span>{msg.content}</span>
                      </div>
                    </div>
                  );
                }
                return (
                  <div key={`w-${msg.id}`}>
                    <div
                      className={`flex gap-2.5 ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                    >
                      {msg.role === "assistant" && (
                        <img
                          src={danteAvatar}
                          alt="Dante"
                          className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                        />
                      )}
                      <div
                        className={`max-w-[75%] whitespace-pre-wrap rounded-2xl px-4 py-2.5 text-sm leading-relaxed ${
                          msg.role === "user"
                            ? "bg-gradient-to-r from-grape-500 to-rose-500 text-white"
                            : "dante-chat-bubble dante-bubble-border bg-ink-700/60 text-grape-50"
                        }`}
                      >
                        {msg.role === "assistant" ? (
                          <>
                            <ReactMarkdown
                              components={{
                                p: ({ node, ...props }) => (
                                  <p className="mb-2 last:mb-0 whitespace-pre-wrap" {...props} />
                                ),
                              }}
                            >
                              {msg.content}
                            </ReactMarkdown>

                            <div className="mt-1.5 flex justify-end">
                              {isAdmin ? (
                                <button
                                  type="button"
                                  onClick={() => handleCopyMessage(msg.id, msg.content)}
                                  title="Copiar mensagem do Dante (Admin)"
                                  className="flex items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] text-grape-300/60 hover:bg-ink-600/40 hover:text-grape-100 transition-colors"
                                >
                                  {copiedId === msg.id ? (
                                    <>
                                      <Check className="h-3 w-3 text-emerald-400" />
                                      <span className="text-emerald-400 font-medium">Copiado!</span>
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="h-3 w-3" />
                                      <span>Copiar</span>
                                    </>
                                  )}
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => openReportDialog(msg)}
                                  title="Denunciar resposta do Dante"
                                  aria-label="Denunciar resposta do Dante"
                                  className="rounded-md p-1 text-grape-300/45 transition-colors hover:bg-rose-500/10 hover:text-rose-300"
                                >
                                  <Flag className="h-3.5 w-3.5" />
                                </button>
                              )}
                            </div>
                          </>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </div>
                    {chatInserts[msg.id] && (
                      <div className="my-3 w-full">
                        <p className="mb-1 text-center">
                          <span className="inline-block rounded-full bg-background/80 px-2.5 py-0.5 text-[10px] uppercase tracking-widest text-foreground/80 shadow-sm backdrop-blur-sm">
                            Publicidade
                          </span>
                        </p>
                        <EmbedFrame html={chatInserts[msg.id].codigo_html_mobile} />
                      </div>
                    )}
                  </div>
                );
              })}

              {loading && (
                <div className="flex gap-2.5 justify-start">
                  <img
                    src={danteAvatar}
                    alt="Dante"
                    className="h-8 w-8 rounded-full object-cover flex-shrink-0"
                  />
                  <div className="dante-bubble-border flex flex-col gap-1 rounded-2xl bg-ink-700/60 px-4 py-2.5">
                    <div className="flex items-center">
                      <span className="text-sm text-grape-200/60">{evaluatingCoffee ? "Avaliando café..." : "Dante está pensando"}</span>
                      {!evaluatingCoffee && <span className="ml-1 flex gap-0.5">
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-grape-300 [animation-delay:0ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-grape-300 [animation-delay:150ms]" />
                        <span className="h-1.5 w-1.5 animate-bounce rounded-full bg-grape-300 [animation-delay:300ms]" />
                      </span>}
                    </div>
                    {sarcasmScore !== null && <Sarcasmometer score={sarcasmScore} />}
                  </div>
                </div>
              )}

              {!loading &&
                sarcasmScore !== null &&
                messages.length > 0 &&
                messages[messages.length - 1].role === "assistant" && (
                  <div className="flex gap-2.5 justify-start">
                    <div className="w-8 flex-shrink-0" />
                    <div className="max-w-[75%] flex-1">
                      <Sarcasmometer score={sarcasmScore} />
                      {energySpent !== null && (
                        <span
                          className="mt-1 inline-flex items-center gap-1 rounded-full border border-gold-400/20 bg-gold-400/5 px-2 py-0.5 text-[10px] text-gold-400"
                          title="Cafeína consumida nesta resposta"
                        >
                          <Zap size={10} /> −{energySpent}% de cafeína
                        </span>
                      )}
                    </div>
                  </div>
                )}
            </div>

            {/* Input */}
            <div className="dante-chat-bar border-t border-white/10 bg-ink-800/80 p-3">
              {activeBreak && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-white/10 bg-ink-700/50 px-3 py-2 text-xs text-grape-200/70">
                  <Moon size={14} className="mt-0.5 flex-shrink-0" />
                  <span>{activeBreak.message}</span>
                </div>
              )}
              {powerOff && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-rose-400/20 bg-rose-500/10 px-3 py-2 text-xs text-rose-200/80">
                  <Power size={14} className="mt-0.5 flex-shrink-0" />
                  <span>
                    {powerState.message
                      ? powerState.message
                          .replace(/\*\*(.+?)\*\*/g, "$1")
                          .replace(/\[(.+?)\]\((.+?)\)/g, "$1")
                      : "O Dante está offline no momento."}
                  </span>
                </div>
              )}
              {danteBlock && (
                <div className="mb-2 flex items-start gap-2 rounded-xl border border-gold-400/20 bg-gold-400/5 px-3 py-2 text-xs text-grape-200/70">
                  <Clock size={14} className="mt-0.5 flex-shrink-0 text-gold-400" />
                  <span>
                    {danteBlock.reason === "tired"
                      ? "Descanso espontâneo do Dante"
                      : "Suspensão por violação"}{" "}
                    · libera em {formatBlockCountdown(danteBlock.until, blockNow)}. O perfil e as
                    doações continuam abertos.
                  </span>
                </div>
              )}
              <div className="flex items-end gap-2">
                <textarea
                  ref={textareaRef}
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  onKeyDown={(e) => {
                    const isTouch =
                      typeof window !== "undefined" &&
                      window.matchMedia("(pointer: coarse)").matches;
                    if (e.key === "Enter" && !e.shiftKey && !isTouch) {
                      e.preventDefault();
                      sendMessage();
                    }
                  }}
                  disabled={loading || !!activeBreak || powerOff || !!danteBlock}
                  placeholder={
                    danteBlock
                      ? `Conversa liberada em ${formatBlockCountdown(danteBlock.until, blockNow)}...`
                      : activeBreak || powerOff
                        ? "Dante indisponível no momento..."
                        : "Escreva sua mensagem..."
                  }
                  rows={1}
                  className={`dante-chat-input flex-1 resize-none rounded-2xl border border-white/10 bg-ink-700/60 px-4 py-2.5 text-sm text-grape-50 placeholder:text-grape-200/40 outline-none transition ${activeBreak || powerOff || danteBlock ? "cursor-not-allowed opacity-50" : ""}`}
                  style={{ maxHeight: "120px" }}
                />
                <button
                  onClick={sendMessage}
                  disabled={loading || !input.trim() || !!activeBreak || powerOff || !!danteBlock}
                  className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-full text-white transition disabled:opacity-50"
                  style={{ background: DANTE_GRADIENT }}
                  aria-label="Enviar"
                >
                  <Rocket size={18} />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
