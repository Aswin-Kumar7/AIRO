import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useStore } from "@/context/store-context";
import { useToast } from "@/hooks/use-toast";
import {
  motion, AnimatePresence, useInView, useScroll, useTransform,
} from "framer-motion";
import {
  ArrowRight, BarChart3, Zap, Cable, Brain, TrendingUp, Linkedin,
  Target, GitBranch, Package, Layers, Menu, X,
  Activity, AlertTriangle, ClockFading, Sparkles, Check, Gift,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${(import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "")}/api`;

// ─── Animation Variants ───────────────────────────────────────────────────────

// ─── Count-Up Hook ────────────────────────────────────────────────────────────

function useCountUp(target: number, active: boolean, duration = 1400) {
  const [count, setCount] = useState(0);
  useEffect(() => {
    if (!active) return;
    let raf: number;
    const start = performance.now();
    const tick = (now: number) => {
      const p = Math.min((now - start) / duration, 1);
      const eased = 1 - Math.pow(1 - p, 3);
      setCount(Math.round(eased * target));
      if (p < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, target, duration]);
  return count;
}

// ─── Navbar ───────────────────────────────────────────────────────────────────

function Navbar({ onLogin, onGetStarted }: { onLogin: () => void; onGetStarted: () => void }) {
  const [scrolled, setScrolled] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  useEffect(() => {
    const fn = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", fn, { passive: true });
    return () => window.removeEventListener("scroll", fn);
  }, []);

  return (
    <motion.nav
      initial={{ y: -16, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-500",
        scrolled
          ? "bg-white/96 backdrop-blur-xl border-b border-slate-100 dark:border-white/5 shadow-[0_1px_16px_rgba(0,0,0,0.07)]"
          : "bg-transparent",
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-900 dark:text-white tracking-tight select-none">Kasparro</span>

        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "Features", href: "#features" },
            { label: "How it works", href: "#how-it-works" },
            { label: "Pricing", href: "#pricing" },
            { label: "FAQ", href: "#faq" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="text-sm font-medium text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:text-white transition-colors duration-200">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={onLogin}
            className="hidden sm:block text-sm font-medium text-slate-600 dark:text-zinc-200 hover:text-slate-900 dark:text-white px-3 py-2 rounded-lg hover:bg-slate-50 dark:bg-white/5 transition-colors">
            Login
          </motion.button>
          <motion.button
            whileHover={{ scale: 1.02, boxShadow: "0 4px 20px rgba(5,150,105,0.3)" }}
            whileTap={{ scale: 0.97 }}
            onClick={onGetStarted}
            className="text-sm font-semibold bg-emerald-600 hover:bg-emerald-700 text-white px-4 py-2 rounded-lg transition-colors shadow-sm">
            Get Started
          </motion.button>
          <button onClick={() => setMobileOpen(!mobileOpen)}
            className="md:hidden p-2 text-slate-600 dark:text-zinc-200 rounded-lg hover:bg-slate-50 dark:bg-white/5 transition-colors">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden bg-white dark:bg-[#080808] border-t border-slate-100 dark:border-white/5 overflow-hidden">
            <div className="px-6 py-4 space-y-1">
              {["Features", "How it works", "Pricing", "FAQ"].map(link => (
                <a key={link} href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                  className="block text-sm font-medium text-slate-600 dark:text-zinc-200 hover:text-slate-900 dark:text-white py-2.5 border-b border-slate-50 dark:border-white/5 dark:border-white/5 last:border-0 transition-colors"
                  onClick={() => setMobileOpen(false)}>
                  {link}
                </a>
              ))}
              <button onClick={() => { setMobileOpen(false); onLogin(); }}
                className="block w-full text-left text-sm font-medium text-slate-600 dark:text-zinc-200 py-2.5">
                Login
              </button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.nav>
  );
}

// ─── Dashboard Mockup ─────────────────────────────────────────────────────────

function DashboardMockup() {
  const { scrollY } = useScroll();
  const y = useTransform(scrollY, [0, 400], [0, -24]);

  return (
    <motion.div className="relative mx-auto max-w-4xl" style={{ y }}>
      <div className="absolute -inset-8 bg-gradient-to-b from-emerald-400/12 via-emerald-200/6 to-transparent rounded-3xl blur-[60px] pointer-events-none" />

      <motion.div
        initial={{ opacity: 0, y: 40, scale: 0.97 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ duration: 0.8, delay: 0.4, ease: [0.22, 1, 0.36, 1] }}
        className="relative rounded-2xl overflow-hidden shadow-[0_24px_80px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/8"
      >
        {/* Browser chrome */}
        <div className="bg-[#ececec] border-b border-slate-200/60 dark:border-white/10 px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map(c => (
              <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex-1 bg-white dark:bg-[#080808] rounded-md text-[11px] text-slate-400 dark:text-zinc-400 px-3 py-1 text-center border border-slate-200/80 max-w-xs mx-auto">
            app.kasparro.io/dashboard
          </div>
        </div>

        <div className="bg-[#f8f8f8] flex" style={{ height: 380 }}>
          {/* Sidebar */}
          <div className="hidden md:flex w-44 bg-white dark:bg-[#080808] border-r border-slate-100/80 flex-col p-3 gap-0.5 flex-shrink-0">
            <div className="text-[9px] font-bold text-slate-300 uppercase tracking-widest mb-2 px-2 pt-1">Navigation</div>
            {[
              { label: "Dashboard", active: true },
              { label: "Products" },
              { label: "Issues" },
              { label: "Quick Fixes" },
              { label: "AI Readiness" },
              { label: "Content" },
            ].map(({ label, active }) => (
              <div key={label} className={cn(
                "text-[11px] px-2.5 py-1.5 rounded-lg font-medium",
                active ? "bg-emerald-50 text-emerald-700" : "text-slate-400 dark:text-zinc-400",
              )}>
                {label}
              </div>
            ))}
          </div>

          <div className="flex-1 p-5 overflow-hidden">
            <div className="grid grid-cols-3 gap-3 mb-4">
              {[
                { label: "AI Score", value: "73", sub: "/100", color: "text-emerald-600", bg: "bg-emerald-50 ring-emerald-100" },
                { label: "Issues", value: "12", sub: " gaps", color: "text-amber-600", bg: "bg-amber-50 ring-amber-100" },
                { label: "Fixes Ready", value: "8", sub: " pending", color: "text-indigo-600", bg: "bg-indigo-50 ring-indigo-100" },
              ].map(({ label, value, sub, color, bg }) => (
                <div key={label} className={cn("rounded-xl p-3 ring-1", bg)}>
                  <p className="text-[10px] text-slate-400 dark:text-zinc-400 mb-0.5 font-medium">{label}</p>
                  <p className={cn("text-xl font-bold tabular-nums leading-none", color)}>
                    {value}<span className="text-[10px] font-normal text-slate-400 dark:text-zinc-400">{sub}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white dark:bg-[#080808] rounded-xl ring-1 ring-slate-100 p-4 mb-3">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-200 mb-3">Score Breakdown</p>
              <div className="space-y-2.5">
                {[
                  { label: "Clarity", val: 78 },
                  { label: "Completeness", val: 64 },
                  { label: "Trust Signals", val: 43 },
                  { label: "Tags & SEO", val: 85 },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 dark:text-zinc-400 w-24 flex-shrink-0 font-medium">{label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", val >= 70 ? "bg-emerald-500" : val >= 50 ? "bg-amber-400" : "bg-red-400")}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold w-5 text-right tabular-nums text-slate-600 dark:text-zinc-200">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white dark:bg-[#080808] rounded-xl ring-1 ring-slate-100 p-4">
              <p className="text-[11px] font-semibold text-slate-600 dark:text-zinc-200 mb-2.5">Quick Wins</p>
              <div className="space-y-2">
                {[
                  { text: "Add size guide to Merino Wool Sweater", tag: "Easy" },
                  { text: "Missing return policy affects 3 products", tag: "Easy" },
                  { text: "Product descriptions lack material info", tag: "Medium" },
                ].map(({ text, tag }) => (
                  <div key={text} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-500 dark:text-zinc-300 flex-1 truncate">{text}</span>
                    <span className={cn(
                      "text-[9px] font-semibold px-1.5 py-0.5 rounded-full flex-shrink-0",
                      tag === "Easy" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700",
                    )}>{tag}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* Floating cards */}
      {[
        {
          delay: 0,
          className: "absolute -left-8 top-20 hidden lg:block",
          style: { animation: "kasFloat 4s ease-in-out infinite" },
          content: (
            <div className="bg-white dark:bg-[#080808] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-slate-100 p-4 w-40">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-300">AI Score</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white leading-none">73<span className="text-sm font-normal text-slate-300">/100</span></div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1.5">↑ +12 this week</div>
            </div>
          ),
        },
        {
          delay: 1.2,
          className: "absolute -right-8 top-12 hidden lg:block",
          style: { animation: "kasFloat 5s ease-in-out infinite 1.2s" },
          content: (
            <div className="bg-white dark:bg-[#080808] rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-slate-100 p-4 w-44">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500 dark:text-zinc-300">Gaps Found</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 dark:text-white leading-none">12</div>
              <div className="text-[10px] text-slate-400 dark:text-zinc-400 mt-1.5">8 easy to fix now</div>
            </div>
          ),
        },
        {
          delay: 0.6,
          className: "absolute -right-6 bottom-12 hidden lg:block",
          style: { animation: "kasFloat 3.8s ease-in-out infinite 0.6s" },
          content: (
            <div className="bg-emerald-600 rounded-2xl shadow-[0_8px_32px_rgba(5,150,105,0.35)] p-4 w-44">
              <div className="flex items-center gap-2 mb-1.5">
                <div className="w-1.5 h-1.5 rounded-full bg-emerald-300 animate-pulse" />
                <span className="text-[10px] font-semibold text-emerald-200">Fix Applied</span>
              </div>
              <div className="text-xs font-bold text-white leading-tight">Description updated ✓</div>
              <div className="text-[10px] text-emerald-300 mt-1">Synced to Shopify</div>
            </div>
          ),
        },
      ].map(({ className, style, content }, i) => (
        <motion.div
          key={i} className={className} style={style}
          initial={{ opacity: 0, scale: 0.85 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, delay: 0.7 + i * 0.15, ease: [0.22, 1, 0.36, 1] }}
        >
          {content}
        </motion.div>
      ))}
    </motion.div>
  );
}

// ─── Hero ─────────────────────────────────────────────────────────────────────

function Hero({ onAnalyze }: { onAnalyze: (url: string) => void }) {
  const [url, setUrl] = useState("");
  const [focused, setFocused] = useState(false);

  return (
    <section className="relative min-h-screen flex flex-col items-center pt-32 pb-0 overflow-hidden bg-[#e4efeb]">
      {/* Misty Layered Background */}
      <div className="absolute inset-0 bg-[#e4efeb] pointer-events-none" />
      <div className="absolute top-0 w-[1400px] h-[900px] opacity-60 mix-blend-overlay pointer-events-none left-1/2 -translate-x-1/2"
        style={{ background: "radial-gradient(ellipse at 50% 0%, #a2c2b3 0%, transparent 70%)" }} />
      <div className="absolute top-[10%] left-[20%] w-[600px] h-[600px] bg-[#f5fbf8] rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-[20%] right-[10%] w-[500px] h-[500px] bg-[#d3e3db] rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none opacity-40 uppercase" style={{
        backgroundImage: "radial-gradient(circle, rgba(17,24,39,0.06) 1px, transparent 1px)",
        backgroundSize: "24px 24px"
      }} />

      <motion.div className="relative z-10 w-full max-w-4xl mx-auto px-6 text-center">
        {/* Badge */}
        <motion.div
          initial={{ opacity: 0, y: 10, filter: "blur(10px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white/60 backdrop-blur-md border border-white/80 text-[#151e18] text-[11.5px] font-semibold px-4 py-1.5 rounded-full mb-8 shadow-[0_2px_8px_rgba(0,0,0,0.04)]">
            <Sparkles className="w-3.5 h-3.5 text-emerald-700" />
            Designed for AI-first commerce
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          initial={{ opacity: 0, y: 20, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.1, ease: [0.22, 1, 0.36, 1] }}
          className="text-[48px] md:text-[68px] lg:text-[76px] font-bold text-[#111827] leading-[1.05] tracking-tighter mb-7"
        >
          Smarter store optimization.<br />
          Powered by <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#047857]">real AI insights.</span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          initial={{ opacity: 0, y: 20, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.2, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg text-slate-600 dark:text-zinc-200 max-w-2xl mx-auto mb-10 leading-[1.65] font-medium"
        >
          Plan, optimize, and analyze exactly how AI agents perceive your catalog. Grow faster with evidence-backed gap reports and automated fixes synced directly to Shopify.
        </motion.p>

        {/* Input + CTA */}
        <motion.div initial={{ opacity: 0, y: 20, filter: "blur(12px)" }} animate={{ opacity: 1, y: 0, filter: "blur(0px)" }} transition={{ duration: 0.8, delay: 0.3, ease: [0.22, 1, 0.36, 1] }} id="get-started">
          <form
            onSubmit={e => { e.preventDefault(); onAnalyze(url.trim()); }}
            className="flex flex-col sm:flex-row gap-3 max-w-[500px] mx-auto mb-6"
          >
            <div className="flex-1 relative">
              <motion.input
                type="text"
                value={url}
                onChange={e => setUrl(e.target.value)}
                onFocus={() => setFocused(true)}
                onBlur={() => setFocused(false)}
                placeholder="my-store.myshopify.com"
                animate={{
                  boxShadow: focused
                    ? "0 0 0 2px rgba(17,24,39,0.1), 0 4px 12px rgba(0,0,0,0.05)"
                    : "0 2px 8px rgba(0,0,0,0.03)",
                }}
                className="w-full h-12 px-5 rounded-[14px] border border-white/80 bg-white/70 backdrop-blur-md text-sm text-slate-900 dark:text-white placeholder:text-slate-400 dark:text-zinc-400 focus:outline-none focus:bg-white dark:bg-[#080808] transition-all duration-300 shadow-inner shadow-white/50"
              />
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              className="h-12 px-8 bg-[#151e18] hover:bg-[#0d130f] text-white font-medium rounded-[14px] flex items-center justify-center gap-2.5 text-[14px] transition-colors shadow-[0_6px_20px_rgba(21,30,24,0.25)] whitespace-nowrap group"
            >
              Analyze Store
              <ArrowRight className="w-3.5 h-3.5 opacity-80 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform duration-200 -rotate-45" />
            </motion.button>
          </form>
          <div className="flex items-center justify-center gap-5">
            {[
              { icon: Cable, text: "Easy to connnect" },
              { icon: ClockFading, text: "60 sec analysis" },
              { icon: Check, text: "Quick fixes" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 text-[12px] text-slate-500 dark:text-zinc-300 font-medium">
                <Icon className="w-3 h-3 text-[#151e18]/50" />
                {text}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 mt-16 pb-0">
        <DashboardMockup />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-48 bg-gradient-to-t from-[#fafafa] via-white/80 to-transparent pointer-events-none z-20" />
    </section>
  );
}

// ─── Social Proof ─────────────────────────────────────────────────────────────

const BRANDS = [
  { name: "Shopify",      color: "#96BF48", letter: "S" },
  { name: "AWS Bedrock",  color: "#FF9900", letter: "⬡" },
  { name: "Anthropic",    color: "#C96442", letter: "A" },
  { name: "Gemini AI",    color: "#4285F4", letter: "G" },
  { name: "Tavily",       color: "#6366F1", letter: "T" },
  { name: "SerpAPI",      color: "#10B981", letter: "S" },
  { name: "Neon",         color: "#00E5A0", letter: "N" },
  { name: "React",        color: "#61DAFB", letter: "⚛" },
  { name: "TypeScript",   color: "#3178C6", letter: "TS" },
];

function SocialProof() {
  return (
    <section className="py-24 bg-[#fafafa]">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-[19px] text-[#222] font-semibold mb-12">
          Powered by the best AI &amp; commerce infrastructure
        </p>
        <div className="relative overflow-hidden">
          <div className="flex gap-6 items-center" style={{ animation: "kasMarquee 35s linear infinite" }}>
            {[...BRANDS, ...BRANDS, ...BRANDS].map((brand, i) => (
              <div key={i} className="flex items-center justify-center px-8 py-4 bg-white dark:bg-[#080808] border border-slate-200/50 rounded-2xl shadow-[0_2px_12px_rgba(0,0,0,0.02)]">
                <span className="text-slate-800 dark:text-slate-200 font-bold text-[15px] tracking-tight whitespace-nowrap select-none flex items-center gap-2">
                  <div className="w-5 h-5 rounded-md flex items-center justify-center text-white text-[9px] font-black" style={{ backgroundColor: brand.color }}>{brand.letter}</div>
                  {brand.name}
                </span>
              </div>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-48 bg-gradient-to-r from-[#fafafa] to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-48 bg-gradient-to-l from-[#fafafa] to-transparent pointer-events-none" />
        </div>
      </div>
    </section>
  );
}

// ─── Features ─────────────────────────────────────────────────────────────────

const FEATURES = [
  {
    icon: Brain, title: "AI Perception Analysis",
    description: "See your store as AI shopping agents do. Identify what they prioritize, what confuses them, and what gaps block recommendations.",
  },
  {
    icon: AlertTriangle, title: "Evidence-Backed Gap Detection",
    description: "15 deterministic rules surface specific violations with exact proof. Every issue links to the precise product and field.",
  },
  {
    icon: Zap, title: "One-Click Shopify Fixes",
    description: "AI-generated improvements pushed directly to Shopify. Fix descriptions, tags, titles, and structured data.",
  },
  {
    icon: Activity, title: "Query Simulation",
    description: "Test how AI agents respond to real buyer queries against your catalog. See exactly which products get recommended and why.",
  },
  {
    icon: Target, title: "Ranked Action Plan",
    description: "Every gap scored by conversion impact and fix effort. Your action plan always surfaces the highest-ROI change first.",
  },
  {
    icon: GitBranch, title: "Content Strategy",
    description: "Topical authority mapping, internal link opportunities, and FAQ schema generation — derived automatically from your catalog.",
  },
];

function FeatureCard({ icon: Icon, title, description }: typeof FEATURES[0]) {
  return (
    <motion.div
      whileHover={{ y: -4, scale: 1.01, boxShadow: "0 20px 40px rgba(17,24,39,0.06), 0 4px 12px rgba(17,24,39,0.04)" }}
      transition={{ duration: 0.15, ease: "easeOut" }}
      className="group bg-white dark:bg-[#080808] rounded-3xl border border-slate-200/50 p-8 xl:p-10 cursor-default transition-colors duration-150 relative overflow-hidden flex flex-col justify-start h-full"
    >
      <div className="absolute top-0 right-0 w-64 h-64 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-slate-100/60 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-200 pointer-events-none" />
      <div className="relative z-10">
        <div
          className="w-12 h-12 rounded-[18px] bg-[#fafafa] border border-slate-200/80 flex items-center justify-center shadow-[0_2px_8px_rgba(0,0,0,0.03)] mb-8 transition-transform duration-200 group-hover:scale-105 group-hover:rotate-2"
        >
          <Icon className="w-5 h-5 text-slate-800 dark:text-slate-200" />
        </div>
        <div>
          <h3 className="text-[17px] font-bold text-slate-900 dark:text-white mb-3.5 leading-snug tracking-tight">{title}</h3>
          <p className="text-[14px] text-slate-500 dark:text-zinc-300 leading-[1.65] font-medium">{description}</p>
        </div>
      </div>
    </motion.div>
  );
}

function Features() {
  return (
    <section id="features" className="py-32 bg-[#fafafa]">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 24, filter: "blur(10px)" }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)" }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white dark:bg-[#080808] border border-slate-200/80 text-slate-600 dark:text-zinc-200 text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 shadow-sm">
            <Package className="w-3.5 h-3.5 text-emerald-500" />
            Powerful Features
          </div>
          <h2 className="text-4xl md:text-[56px] font-bold text-[#111827] mb-5 leading-tight tracking-tighter">
            Built for the age of <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#047857]">AI commerce.</span>
          </h2>
          <p className="text-slate-500 dark:text-zinc-300 max-w-xl mx-auto text-[17px] leading-[1.7] font-medium">
            Traditional SEO tools don't understand how AI agents evaluate stores. Kasparro is built for what comes next.
          </p>
        </motion.div>

        <div
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-6"
        >
          {FEATURES.map((f, i) => (
            <motion.div key={f.title} initial={{ opacity: 0, y: 40, filter: "blur(12px)", scale: 0.95 }} whileInView={{ opacity: 1, y: 0, filter: "blur(0px)", scale: 1 }} viewport={{ once: true, margin: "-80px" }} transition={{ duration: 0.7, delay: i * 0.1, type: "spring", bounce: 0.3 }}>
              <FeatureCard {...f} />
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── How It Works ─────────────────────────────────────────────────────────────

const STEPS = [
  { num: "01", title: "Connect your store", desc: "Enter your Shopify domain and sign in with Google. We pull your products, policies, and tags in seconds without affecting live traffic." },
  { num: "02", title: "Run the analysis", desc: "Our engine applies deterministic rules and clarity scoring to every product. A complete catalog scan takes under 60 seconds." },
  { num: "03", title: "Fix and ship", desc: "Apply generated improvements directly to Shopify through the dashboard. Review each action before it merges — you maintain total control." },
];

function HowItWorks() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-80px" });

  return (
    <section id="how-it-works" className="py-32 bg-white dark:bg-[#080808] relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-28"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-white/5 border border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-zinc-200 text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6">
            <Layers className="w-3.5 h-3.5 text-emerald-500" />
            Simple workflow
          </div>
          <h2 className="text-4xl md:text-[56px] font-bold text-[#111827] mb-5 leading-tight tracking-tighter">
            From zero to optimized <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-[#10b981] to-[#047857]">in under 5 minutes.</span>
          </h2>
        </motion.div>

        <div className="max-w-4xl mx-auto relative pl-8 md:pl-0" ref={ref}>
          {/* Sleek Vertical Line */}
          <motion.div
            className="absolute top-4 bottom-8 left-[45px] md:left-1/2 md:-ml-px w-[2px] bg-slate-100 dark:bg-[#111214] border dark:border-white/5 rounded-full origin-top"
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />

          <div className="space-y-28">
            {STEPS.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                className={cn("relative flex flex-col md:flex-row gap-8 md:gap-24 items-start md:items-center group", i % 2 !== 0 && "md:flex-row-reverse")}
                initial={{ opacity: 0, y: 40, filter: "blur(8px)" }}
                animate={inView ? { opacity: 1, y: 0, filter: "blur(0px)" } : {}}
                transition={{ duration: 0.7, delay: 0.3 + (i * 0.2), type: "spring", bounce: 0.3 }}
              >
                {/* Node */}
                <motion.div
                  initial={{ scale: 0 }}
                  animate={inView ? { scale: 1 } : {}}
                  transition={{ duration: 0.6, delay: 0.4 + (i * 0.2), type: "spring", bounce: 0.6 }}
                  className="absolute left-[-15px] md:left-1/2 md:-translate-x-1/2 top-0 md:top-1/2 md:-translate-y-1/2 flex items-center justify-center w-10 h-10 rounded-full bg-white dark:bg-[#080808] border border-slate-200 dark:border-white/10 shadow-[0_0_0_8px_white] z-10 transition-transform duration-300 group-hover:scale-125 group-hover:border-slate-300 dark:hover:border-white/20"
                >
                  <motion.div
                    initial={{ scale: 0 }} animate={inView ? { scale: 1 } : {}} transition={{ delay: 0.6 + (i * 0.2), type: "spring" }}
                    className="w-2.5 h-2.5 rounded-full bg-slate-800 group-hover:bg-emerald-600 transition-colors duration-300"
                  />
                </motion.div>

                <div className={cn("flex-1 pt-0.5 md:pt-0 pl-10 md:pl-0 w-full", i % 2 !== 0 ? "md:text-left" : "md:text-right")}>
                  <div className={cn("inline-flex items-center justify-center px-4 h-9 rounded-full bg-white dark:bg-[#080808] border border-slate-200/80 text-slate-600 dark:text-zinc-200 text-[13px] font-bold mb-6 shadow-sm tracking-wide", i % 2 !== 0 ? "" : "md:ml-auto")}>
                    Step {num}
                  </div>
                  <h3 className="text-3xl font-bold text-[#111827] mb-4 leading-tight tracking-tight">{title}</h3>
                  <p className={cn("text-[16px] text-slate-500 dark:text-zinc-300 leading-relaxed font-medium block max-w-sm", i % 2 !== 0 ? "mr-auto" : "md:ml-auto")}>
                    {desc}
                  </p>
                </div>
                <div className="hidden md:block flex-1" />
              </motion.div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

// ─── Stats ────────────────────────────────────────────────────────────────────

const STATS_DATA = [
  { end: 1, suffix: "", label: "Active Hackathon Entry", sub: "April 2026 Submission" },
  { end: 15, suffix: "", label: "Diagnostic rules", sub: "across 6 gap categories" },
  { end: 100, suffix: "%", label: "Evidence-Backed", sub: "proven diagnostic models" },
  { end: 60, suffix: "s", label: "Analysis time", sub: "full catalog scan" },
];

function StatItem({ end, suffix, label, sub, active }: typeof STATS_DATA[0] & { active: boolean }) {
  const count = useCountUp(end, active, end > 100 ? 1600 : 1200);
  return (
    <motion.div
      className="text-center px-4"
      initial={{ opacity: 0, y: 16 }} whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true }} transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="text-5xl md:text-6xl font-bold text-slate-900 dark:text-white mb-2 tabular-nums tracking-tight leading-none">
        {count}{suffix}
      </div>
      <div className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-0.5">{label}</div>
      <div className="text-xs text-slate-400 dark:text-zinc-400">{sub}</div>
    </motion.div>
  );
}

function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-100px" });

  return (
    <section className="py-24 bg-white dark:bg-[#080808] border-t border-slate-100/60">
      <div className="max-w-5xl mx-auto px-6">
        <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-10 md:divide-x divide-slate-100 dark:divide-white/5">
          {STATS_DATA.map(s => <StatItem key={s.label} {...s} active={inView} />)}
        </div>
      </div>
    </section>
  );
}

// ─── Pricing ──────────────────────────────────────────────────────────────────

type Currency = "USD" | "GBP" | "INR";

const PRICING_TIERS = [
  {
    name: "Starter",
    desc: "Perfect for exploring AI perception on small catalogs.",
    prices: { USD: 29, GBP: 25, INR: 2400 },
    features: [
      "Up to 100 products",
      "Basic AI scoring",
      "Standard gap reports",
      "1 concurrent analysis",
      "Community support",
    ],
  },
  {
    name: "Growth",
    desc: "For scaling brands that need continuous optimization.",
    prices: { USD: 79, GBP: 65, INR: 6500 },
    isPopular: true,
    features: [
      "Up to 2,000 products",
      "Deep clarity scoring",
      "1-click Shopify fixes",
      "Query simulation",
      "Priority email support",
    ],
  },
  {
    name: "Scale",
    desc: "High-volume analysis and custom AI rulesets.",
    prices: { USD: 199, GBP: 160, INR: 16500 },
    features: [
      "Unlimited products",
      "Custom diagnostic rules",
      "Multi-store support",
      "API access",
      "Dedicated success manager",
    ],
  },
];

const CURRENCY_SYMBOLS = { USD: "$", GBP: "£", INR: "₹" };

function Pricing() {
  const [currency, setCurrency] = useState<Currency>("USD");
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-80px" });

  return (
    <section id="pricing" className="py-32 bg-slate-50 dark:bg-white/5 relative overflow-hidden">
      <div className="absolute inset-x-0 top-0 h-40 bg-gradient-to-b from-white to-transparent pointer-events-none" />
      <div className="max-w-6xl mx-auto px-6 relative z-10" ref={ref}>
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 24 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white dark:bg-[#080808] border border-slate-200/60 dark:border-white/10 text-slate-600 dark:text-zinc-200 text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full mb-6 shadow-sm">
            <Zap className="w-3.5 h-3.5 text-emerald-500" />
            Pricing Plans
          </div>
          <h2 className="text-4xl md:text-[56px] font-bold text-[#111827] mb-5 leading-tight tracking-tighter">
            Transparent pricing. <br className="md:hidden" />
            <span className="text-transparent bg-clip-text bg-gradient-to-r from-emerald-500 to-emerald-700">No surprises.</span>
          </h2>
          <p className="text-slate-500 dark:text-zinc-300 text-[17px] font-medium leading-relaxed max-w-2xl mx-auto">
            Choose the perfect plan for your catalog size. All plans include full access to discovery and automated Shopify sync.
          </p>

          <div className="mt-8 flex justify-center">
            <div className="inline-flex items-center p-1 bg-slate-200/50 rounded-[10px] border border-slate-200/80">
              {(["USD", "GBP", "INR"] as Currency[]).map((c) => (
                <button
                  key={c}
                  onClick={() => setCurrency(c)}
                  className={cn(
                    "px-4 py-1.5 rounded-md text-[13px] font-semibold transition-all duration-200",
                    currency === c
                      ? "bg-white dark:bg-[#080808] text-slate-900 dark:text-white shadow-sm ring-1 ring-slate-200/50 dark:ring-white/10"
                      : "text-slate-500 dark:text-zinc-300 hover:text-slate-800 dark:text-slate-200"
                  )}
                >
                  {c}
                </button>
              ))}
            </div>
          </div>
        </motion.div>

        <div className="grid md:grid-cols-3 gap-8 items-stretch max-w-5xl mx-auto">
          {PRICING_TIERS.map((tier, i) => (
            <motion.div
              key={tier.name}
              initial={{ opacity: 0, y: 30 }}
              animate={inView ? { opacity: 1, y: 0 } : {}}
              transition={{ duration: 0.6, delay: i * 0.15, type: "spring", bounce: 0.3 }}
              className={cn(
                "relative bg-white dark:bg-[#080808] rounded-3xl p-8 border transition-all duration-300 flex flex-col group",
                tier.isPopular ? "border-emerald-500 shadow-[0_20px_60px_rgba(16,185,129,0.12)] ring-1 ring-emerald-500/20 md:-mt-4 md:mb-4" : "border-slate-200/80 shadow-sm hover:shadow-md"
              )}
            >
              {tier.isPopular && (
                <div className="absolute -top-3 left-1/2 -translate-x-1/2 bg-emerald-500 text-white text-[11px] font-bold uppercase tracking-widest px-4 py-1.5 rounded-full shadow-sm">
                  Most Popular
                </div>
              )}
              <h3 className="text-[22px] font-bold text-slate-900 dark:text-white mb-2">{tier.name}</h3>
              <p className="text-[14px] text-slate-500 dark:text-zinc-300 font-medium mb-6 min-h-[42px] leading-relaxed">{tier.desc}</p>

              <div className="mb-6">
                <div className="flex items-end gap-1.5">
                  <span className="text-5xl font-bold text-slate-900 dark:text-white leading-none tracking-tighter">
                    {CURRENCY_SYMBOLS[currency]}{tier.prices[currency].toLocaleString()}
                  </span>
                  <span className="text-[15px] font-medium text-slate-500 dark:text-zinc-300 mb-1.5">/mo</span>
                </div>
              </div>

              <motion.button
                whileHover={{ scale: 1.02 }}
                onClick={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth", block: "center" })}
                className={cn(
                  "relative w-full h-[52px] rounded-xl font-semibold text-[15px] transition-all duration-300 mb-8 overflow-hidden group",
                  tier.isPopular
                    ? "bg-slate-900 dark:bg-white hover:shadow-emerald-500/20 text-white shadow-md shadow-slate-900/10 border border-slate-800"
                    : "bg-white dark:bg-[#080808] text-slate-900 dark:text-white border-2 border-slate-200/80"
                )}
              >
                <div className="absolute inset-0 flex items-center justify-center transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] group-hover:-translate-y-full">
                  Start free trial
                </div>
                <div className={cn(
                  "absolute inset-0 flex items-center justify-center gap-2 transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] translate-y-full group-hover:translate-y-0",
                  tier.isPopular ? "bg-emerald-500 text-white" : "bg-emerald-50 text-emerald-700"
                )}>
                  <Gift className="w-5 h-5" />
                  Free during Early Access
            </div>
              </motion.button>

              <div className="space-y-4 flex-1">
                <p className="text-[11px] font-bold text-slate-900 dark:text-white uppercase tracking-widest mb-4 border-b border-slate-100 dark:border-white/5 pb-2">What's included</p>
                {tier.features.map(f => (
                  <div key={f} className="flex items-start gap-3">
                    <div className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-50 flex items-center justify-center mt-0.5">
                      <Check className="w-3 h-3 text-emerald-600" />
                    </div>
                    <span className="text-[14.5px] text-slate-600 dark:text-zinc-200 font-medium leading-snug">{f}</span>
                  </div>
                ))}
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── FAQ ──────────────────────────────────────────────────────────────────────

const FAQ_ITEMS = [
  {
    q: "How does Kasparro analyze my store?",
    a: "We connect to your Shopify store and pull all product data including titles, descriptions, tags, images, and policies. Our engine applies 15 deterministic diagnostic rules — checking for missing materials, vague descriptions, weak trust signals, and more — then overlays AI scoring for nuanced clarity analysis. The result is a precise, evidence-backed score for every product.",
  },
  {
    q: "Is it safe to connect my Shopify store?",
    a: "Yes. We request read access by default and only write back to Shopify when you explicitly approve a fix. Every change is previewed before it's applied, and you can edit the AI-generated content before it goes live. We never modify your store without your confirmation.",
  },
  {
    q: "Do I need technical knowledge to use this?",
    a: "Not at all. Kasparro is designed for store owners and marketers, not developers. The dashboard explains every issue in plain language, each fix is presented clearly, and syncing to Shopify is a single button click. No code, no configuration.",
  },
  {
    q: "What changes does it make automatically?",
    a: "Nothing changes automatically. Every improvement — whether it's a rewritten product description, updated tags, or added JSON-LD schema — is presented for your review first. You can edit the suggestion, approve it as-is, or skip it entirely. You stay in control.",
  },
  {
    q: "How long does a full analysis take?",
    a: "Under 60 seconds for most stores. We process products concurrently using a multi-provider AI fallback (Gemini → Groq → Cerebras) so even large catalogs complete quickly. Your score is ready before you finish your coffee.",
  },
  {
    q: "What exactly is the AI Score?",
    a: "The AI Score (0–100) is a composite of four dimensions: Clarity (how well AI agents understand your product), Completeness (all key product attributes present), Trust Signals (reviews, brand info, policies), and Tag Quality (discoverability and specificity). Each dimension is calculated using deterministic rules, with AI adding a final clarity layer.",
  },
];

function FAQItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);

  return (
    <motion.div
      initial={{ opacity: 0, y: 16 }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-40px" }}
      transition={{ duration: 0.45, delay: index * 0.06, ease: [0.22, 1, 0.36, 1] }}
      className="border-b border-slate-200/60 dark:border-white/10"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-6 text-left group"
      >
        <span className="text-[17px] font-semibold text-slate-900 dark:text-white pr-6 group-hover:text-slate-600 dark:text-zinc-200 transition-colors duration-200 tracking-tight">{q}</span>
        <motion.div
          animate={{ rotate: open ? 45 : 0 }}
          transition={{ duration: 0.25, type: "spring", stiffness: 300, damping: 20 }}
          className="flex-shrink-0 w-8 h-8 rounded-full border border-slate-200/80 bg-white dark:bg-[#080808] flex items-center justify-center transition-colors duration-200 group-hover:border-slate-300 dark:hover:border-white/20 shadow-[0_2px_8px_rgba(0,0,0,0.02)]"
        >
          <svg className="w-3.5 h-3.5 text-slate-800 dark:text-slate-200" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M12 4v16m8-8H4" />
          </svg>
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.35, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="text-[15px] text-slate-500 dark:text-zinc-300 leading-[1.65] pb-8 pt-1 pr-12 font-medium">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FAQ() {
  return (
    <section id="faq" className="py-32 bg-[#fafafa]">
      <div className="max-w-3xl mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-4xl md:text-[56px] font-bold text-[#111827] mb-5 leading-tight tracking-tighter">
            Common questions
          </h2>
          <p className="text-slate-500 dark:text-zinc-300 text-[17px] font-medium leading-relaxed">
            Everything you need to know before joining.
          </p>
        </motion.div>

        <div className="space-y-0 border-t border-slate-200/60 dark:border-white/10 pt-4">
          {FAQ_ITEMS.map((item, i) => (
            <FAQItem key={item.q} q={item.q} a={item.a} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

// ─── Footer ───────────────────────────────────────────────────────────────────

const FOOTER_LINKS = {
  Product: ["Dashboard", "Features", "Pricing", "Changelog"],
  Resources: ["Documentation", "Status"],
  Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy"],
};

function Footer() {
  return (
    <footer className="bg-white dark:bg-[#080808] border-t border-slate-200/80 pt-20 pb-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-10 mb-14">
          <div className="md:col-span-2">
            <span className="text-base font-bold text-slate-900 dark:text-white mb-3 block tracking-tight">Kasparro</span>
            <p className="text-[13px] text-slate-500 dark:text-zinc-300 leading-relaxed max-w-xs">
              AI readiness analysis and optimization for modern Shopify stores. Know exactly what AI agents think of your products.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="text-xs font-semibold text-slate-900 dark:text-white mb-4 tracking-tight">{section}</p>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link}>
                    <a href="#" className="text-[13px] text-slate-500 dark:text-zinc-300 hover:text-slate-900 dark:text-white transition-colors duration-200">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 dark:border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-slate-500 dark:text-zinc-300">© 2025 Kasparro. All rights reserved.</p>
          <div className="flex items-center gap-2 text-[13px] text-slate-500 dark:text-zinc-300">
            <span>Developed by</span>
            {[
              {
                name: "Aswin Kumar",
                linkedin: "https://www.linkedin.com/in/aswinkumar7/"
              },
              {
                name: "Naveen D",
                linkedin: "https://www.linkedin.com/in/naveen-d-4356592a5/"
              }
            ].map((dev, index, arr) => (
              <span key={dev.name} className="flex items-center gap-1">
                <span>{dev.name}</span>

                <a
                  href={dev.linkedin}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="hover:text-slate-900 dark:hover:text-white transition"
                >
                  <Linkedin size={14} />
                </a>

                {index < arr.length - 1 && <span className="mx-1">&</span>}
              </span>
            ))}
          </div>
        </div>
      </div>
    </footer>
  );
}

// ─── Connect Modal ────────────────────────────────────────────────────────────

type ModalState = "idle" | "loading";

function ConnectModal({ open, storeUrl, onClose }: { open: boolean; storeUrl: string; onClose: () => void }) {
  const [state, setState] = useState<ModalState>("idle");

  useEffect(() => {
    if (!open) setState("idle");
  }, [open]);

  const handleGoogle = useCallback(() => {
    setState("loading");
    const cleaned = storeUrl.trim();
    if (cleaned) sessionStorage.setItem("pendingStoreUrl", cleaned);
    setTimeout(() => {
      window.location.assign(`${API_BASE}/auth/google`);
    }, 600);
  }, [storeUrl]);

  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="force-light fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[4px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => state !== "loading" && onClose()}
          />

          {/* Dialog */}
          <motion.div
            className="relative z-10 w-full max-w-[420px] overflow-hidden rounded-[24px] bg-white dark:bg-[#080808] shadow-2xl border border-slate-200/70"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
          >
            {/* Top glowing ambient background */}
            <div className="absolute inset-x-0 top-0 h-48 bg-gradient-to-b from-slate-50 to-transparent pointer-events-none" />
            <div className="absolute inset-x-0 top-0 h-48 bg-[url('data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iMjAiIGhlaWdodD0iMjAiIHhtbG5zPSJodHRwOi8vd3d3LnczLm9yZy8yMDAwL3N2ZyI+PGNpcmNsZSBjeD0iMiIgY3k9IjIiIHI9IjEiIGZpbGw9IiNlNGU0ZTciIC8+PC9zdmc+')] opacity-[0.35] [mask-image:linear-gradient(to_bottom,white,transparent_80%)] pointer-events-none" />

            {/* Close button */}
            {state === "idle" && (
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 rounded-full text-slate-400 dark:text-zinc-400 hover:text-slate-700 dark:text-slate-200 hover:bg-slate-100/80 flex items-center justify-center transition-colors z-20 backdrop-blur-sm"
              >
                <X className="w-4 h-4" />
              </button>
            )}

            <div className="relative z-10 px-8 pt-10 pb-8 text-center">
              <motion.div
                className="w-16 h-16 rounded-[18px] bg-white dark:bg-[#080808] shadow-sm border border-slate-200/80 flex items-center justify-center mx-auto mb-6 relative overflow-hidden group"
                animate={state === "loading" ? { rotate: [0, 360] } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                <div className="absolute inset-0 bg-emerald-500/5 group-hover:bg-emerald-500/10 transition-colors" />
                {state === "loading" ? (
                  <motion.div
                    className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full relative z-10"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  />
                ) : (
                  <BarChart3 className="w-7 h-7 text-emerald-600 relative z-10" />
                )}
              </motion.div>
              <h2 className="text-[22px] font-bold text-slate-900 dark:text-white mb-2 leading-tight tracking-tight">
                {state === "loading" ? "Redirecting to Google Oauth" : "Analyze your store"}
              </h2>
              {storeUrl && state === "idle" ? (
                <div className="inline-flex items-center gap-2 bg-slate-50 dark:bg-white/5 text-slate-600 dark:text-zinc-200 text-[13.5px] font-medium px-3 py-1.5 rounded-lg border border-slate-200 dark:border-white/10 mt-2 mb-4 shadow-sm">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  {storeUrl}
                </div>
              ) : (
                <p className="text-slate-500 dark:text-zinc-300 text-[14px] leading-[1.6] max-w-[280px] mx-auto mb-1">
                  {state === "loading" ? "Redirecting securely…" : "Log in to view exactly how AI shopping assistants perceive your catalog."}
                </p>
              )}

              <div className="mt-8">
                <motion.button
                  onClick={handleGoogle}
                  disabled={state === "loading"}
                  whileHover={state === "idle" ? { y: -1, boxShadow: "0 4px 12px rgba(0,0,0,0.05)" } : {}}
                  whileTap={state === "idle" ? { y: 0, scale: 0.98 } : {}}
                  className={cn(
                    "w-full h-11 rounded-[10px] flex items-center justify-center gap-2.5 text-[14px] font-semibold transition-all duration-200 border",
                    state === "loading"
                      ? "bg-slate-50 dark:bg-white/5 text-slate-400 dark:text-zinc-400 border-slate-200 dark:border-white/10 cursor-not-allowed"
                      : "bg-white dark:bg-[#080808] hover:bg-slate-50 dark:bg-white/5 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-white/10 shadow-[0_2px_4px_rgba(0,0,0,0.02)] hover:border-slate-300 dark:hover:border-white/20",
                  )}
                >
                  {state === "loading" ? null : (
                    <svg className="w-[18px] h-[18px] flex-shrink-0" viewBox="0 0 24 24">
                      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                      <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                    </svg>
                  )}
                  {state === "loading" ? "Securely redirecting..." : "Continue with Google"}
                </motion.button>
              </div>
            </div>

            <div className="border-t border-slate-100 dark:border-white/5 bg-slate-50/50 px-8 py-5 flex flex-col items-center justify-center relative z-10">
                <div className="flex items-center gap-1.5 text-slate-400 dark:text-zinc-400 mb-2.5 hover:text-slate-600 dark:text-zinc-200 transition-colors cursor-default">
                   <p className="text-[11.5px] text-slate-400 dark:text-zinc-400 text-center leading-relaxed">
                  By continuing, you agree to Kasparro's <a href="#" className="text-slate-500 dark:text-zinc-300 hover:text-slate-700 dark:text-slate-200 underline underline-offset-2 transition-colors">Terms of Service</a> & <a href="#" className="text-slate-500 dark:text-zinc-300 hover:text-slate-700 dark:text-slate-200 underline underline-offset-2 transition-colors">Privacy Policy</a>.
                </p>
                </div>
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

// ─── Landing Page ─────────────────────────────────────────────────────────────

export default function Landing() {
  const { user, isLoading } = useAuth();
  const { setActiveStoreId } = useStore();
  const [, navigate] = useLocation();
  const { toast } = useToast();
  const [modalOpen, setModalOpen] = useState(false);
  const [pendingUrl, setPendingUrl] = useState("");

  useEffect(() => {
    if (!isLoading && user) navigate("/dashboard");
  }, [user, isLoading, navigate]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const base = import.meta.env.BASE_URL?.replace(/\/$/, "") || "/";

    const shopifyStatus = params.get("shopify");
    if (shopifyStatus === "success") {
      const storeId = params.get("storeId");
      if (storeId) setActiveStoreId(storeId);
      window.history.replaceState({}, "", base);
      navigate("/dashboard");
      return;
    }
    if (shopifyStatus === "error") {
      window.history.replaceState({}, "", base);
      const msg = params.get("message") ?? "Shopify connection failed.";
      toast({ title: "Shopify connection failed", description: decodeURIComponent(msg), variant: "destructive" });
      return;
    }
    const authStatus = params.get("auth");
    if (!authStatus) return;
    window.history.replaceState({}, "", base);
    if (authStatus === "error") {
      const msg = params.get("message") ?? "Sign-in failed. Please try again.";
      toast({ title: "Sign-in failed", description: decodeURIComponent(msg), variant: "destructive" });
    }
  }, [toast, navigate, setActiveStoreId]);

  const handleAnalyze = useCallback((url: string) => {
    setPendingUrl(url);
    setModalOpen(true);
  }, []);

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-white dark:bg-[#080808]">
        <motion.div
          className="w-6 h-6 border-2 border-emerald-600 border-t-transparent rounded-full"
          animate={{ rotate: 360 }}
          transition={{ repeat: Infinity, duration: 0.75, ease: "linear" }}
        />
      </div>
    );
  }

  return (
    <>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Playfair+Display:ital,wght@0,400;0,500;1,400;1,500&display=swap');
        @keyframes kasFloat {
          0%, 100% { transform: translateY(0px); }
          33% { transform: translateY(-10px); }
          66% { transform: translateY(-5px); }
        }
        @keyframes kasMarquee {
          from { transform: translateX(0); }
          to { transform: translateX(-50%); }
        }
      `}</style>

      <div className="force-light min-h-screen bg-white overflow-x-hidden">
        <Navbar
          onLogin={() => { setPendingUrl(""); setModalOpen(true); }}
          onGetStarted={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
        <Hero onAnalyze={handleAnalyze} />
        <SocialProof />
        <Features />
        <HowItWorks />
        <Stats />
        <Pricing />
        <FAQ />
        <Footer />
        <ConnectModal open={modalOpen} storeUrl={pendingUrl} onClose={() => setModalOpen(false)} />
      </div>
    </>
  );
}
