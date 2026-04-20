import { useState, useEffect, useRef, useCallback } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "wouter";
import { useAuth } from "@/context/auth-context";
import { useStore } from "@/context/store-context";
import { useToast } from "@/hooks/use-toast";
import {
  motion, AnimatePresence, useInView, useScroll, useTransform,
  type Variants,
} from "framer-motion";
import {
  ArrowRight, BarChart3, Zap, Shield, Brain, TrendingUp,
  ChevronRight, Target, GitBranch, Package, Layers, Menu, X,
  Activity, AlertTriangle, Sparkles, Bot, ChevronDown, Check,
} from "lucide-react";
import { cn } from "@/lib/utils";

const API_BASE = `${import.meta.env.BASE_URL?.replace(/\/$/, "") ?? ""}/api`;

// ─── Animation Variants ───────────────────────────────────────────────────────

const fadeUp: Variants = {
  hidden: { opacity: 0, y: 24 },
  visible: (i = 0) => ({
    opacity: 1, y: 0,
    transition: { duration: 0.55, ease: [0.22, 1, 0.36, 1], delay: i * 0.08 },
  }),
};

const stagger: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.05 } },
};

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
          ? "bg-white/96 backdrop-blur-xl border-b border-slate-100 shadow-[0_1px_16px_rgba(0,0,0,0.07)]"
          : "bg-transparent",
      )}
    >
      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
        <span className="text-xl font-bold text-slate-900 tracking-tight select-none">Kasparro</span>

        <div className="hidden md:flex items-center gap-8">
          {[
            { label: "Features", href: "#features" },
            { label: "How it works", href: "#how-it-works" },
            { label: "FAQ", href: "#faq" },
          ].map(({ label, href }) => (
            <a key={label} href={href}
              className="text-sm font-medium text-slate-500 hover:text-slate-900 transition-colors duration-200">
              {label}
            </a>
          ))}
        </div>

        <div className="flex items-center gap-2">
          <motion.button
            whileHover={{ scale: 1.02 }} whileTap={{ scale: 0.98 }}
            onClick={onLogin}
            className="hidden sm:block text-sm font-medium text-slate-600 hover:text-slate-900 px-3 py-2 rounded-lg hover:bg-slate-50 transition-colors">
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
            className="md:hidden p-2 text-slate-600 rounded-lg hover:bg-slate-50 transition-colors">
            {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>
      </div>

      <AnimatePresence>
        {mobileOpen && (
          <motion.div
            initial={{ opacity: 0, height: 0 }} animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }} transition={{ duration: 0.25, ease: "easeInOut" }}
            className="md:hidden bg-white border-t border-slate-100 overflow-hidden">
            <div className="px-6 py-4 space-y-1">
              {["Features", "How it works", "FAQ"].map(link => (
                <a key={link} href={`#${link.toLowerCase().replace(/ /g, "-")}`}
                  className="block text-sm font-medium text-slate-600 hover:text-slate-900 py-2.5 border-b border-slate-50 last:border-0 transition-colors"
                  onClick={() => setMobileOpen(false)}>
                  {link}
                </a>
              ))}
              <button onClick={() => { setMobileOpen(false); onLogin(); }}
                className="block w-full text-left text-sm font-medium text-slate-600 py-2.5">
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
        <div className="bg-[#ececec] border-b border-slate-200/60 px-4 py-3 flex items-center gap-3">
          <div className="flex gap-1.5">
            {["#ff5f57", "#febc2e", "#28c840"].map(c => (
              <div key={c} className="w-3 h-3 rounded-full" style={{ backgroundColor: c }} />
            ))}
          </div>
          <div className="flex-1 bg-white rounded-md text-[11px] text-slate-400 px-3 py-1 text-center border border-slate-200/80 max-w-xs mx-auto">
            app.kasparro.io/dashboard
          </div>
        </div>

        <div className="bg-[#f8f8f8] flex" style={{ height: 380 }}>
          {/* Sidebar */}
          <div className="hidden md:flex w-44 bg-white border-r border-slate-100/80 flex-col p-3 gap-0.5 flex-shrink-0">
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
                active ? "bg-emerald-50 text-emerald-700" : "text-slate-400",
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
                  <p className="text-[10px] text-slate-400 mb-0.5 font-medium">{label}</p>
                  <p className={cn("text-xl font-bold tabular-nums leading-none", color)}>
                    {value}<span className="text-[10px] font-normal text-slate-400">{sub}</span>
                  </p>
                </div>
              ))}
            </div>

            <div className="bg-white rounded-xl ring-1 ring-slate-100 p-4 mb-3">
              <p className="text-[11px] font-semibold text-slate-600 mb-3">Score Breakdown</p>
              <div className="space-y-2.5">
                {[
                  { label: "Clarity", val: 78 },
                  { label: "Completeness", val: 64 },
                  { label: "Trust Signals", val: 43 },
                  { label: "Tags & SEO", val: 85 },
                ].map(({ label, val }) => (
                  <div key={label} className="flex items-center gap-3">
                    <span className="text-[10px] text-slate-400 w-24 flex-shrink-0 font-medium">{label}</span>
                    <div className="flex-1 h-1.5 bg-slate-100 rounded-full overflow-hidden">
                      <div
                        className={cn("h-full rounded-full", val >= 70 ? "bg-emerald-500" : val >= 50 ? "bg-amber-400" : "bg-red-400")}
                        style={{ width: `${val}%` }}
                      />
                    </div>
                    <span className="text-[10px] font-bold w-5 text-right tabular-nums text-slate-600">{val}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="bg-white rounded-xl ring-1 ring-slate-100 p-4">
              <p className="text-[11px] font-semibold text-slate-600 mb-2.5">Quick Wins</p>
              <div className="space-y-2">
                {[
                  { text: "Add size guide to Merino Wool Sweater", tag: "Easy" },
                  { text: "Missing return policy affects 3 products", tag: "Easy" },
                  { text: "Product descriptions lack material info", tag: "Medium" },
                ].map(({ text, tag }) => (
                  <div key={text} className="flex items-center gap-2">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 flex-shrink-0" />
                    <span className="text-[10px] text-slate-500 flex-1 truncate">{text}</span>
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
            <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-slate-100 p-4 w-40">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-emerald-100 flex items-center justify-center">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-600" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500">AI Score</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 leading-none">73<span className="text-sm font-normal text-slate-300">/100</span></div>
              <div className="text-[10px] text-emerald-600 font-semibold mt-1.5">↑ +12 this week</div>
            </div>
          ),
        },
        {
          delay: 1.2,
          className: "absolute -right-8 top-12 hidden lg:block",
          style: { animation: "kasFloat 5s ease-in-out infinite 1.2s" },
          content: (
            <div className="bg-white rounded-2xl shadow-[0_8px_32px_rgba(0,0,0,0.12)] ring-1 ring-slate-100 p-4 w-44">
              <div className="flex items-center gap-2 mb-2">
                <div className="w-7 h-7 rounded-lg bg-amber-100 flex items-center justify-center">
                  <AlertTriangle className="w-3.5 h-3.5 text-amber-600" />
                </div>
                <span className="text-[10px] font-semibold text-slate-500">Gaps Found</span>
              </div>
              <div className="text-3xl font-bold text-slate-900 leading-none">12</div>
              <div className="text-[10px] text-slate-400 mt-1.5">8 easy to fix now</div>
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
    <section className="relative min-h-screen flex flex-col items-center pt-28 pb-0 overflow-hidden">
      {/* Layered background */}
      <div className="absolute inset-0 bg-gradient-to-b from-emerald-50/80 via-white/60 to-white pointer-events-none" />
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[900px] h-[700px] pointer-events-none"
        style={{ background: "radial-gradient(ellipse at 50% 20%, rgba(16,185,129,0.13) 0%, transparent 70%)" }} />
      <div className="absolute top-32 left-1/4 w-72 h-72 bg-emerald-300/8 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute top-48 right-1/4 w-64 h-64 bg-emerald-400/6 rounded-full blur-[80px] pointer-events-none" />
      <div className="absolute inset-0 pointer-events-none" style={{
        backgroundImage: "radial-gradient(circle, rgba(16,185,129,0.18) 1px, transparent 1px)",
        backgroundSize: "28px 28px",
        maskImage: "radial-gradient(ellipse at 50% 40%, black 0%, transparent 70%)",
      }} />

      <motion.div
        className="relative z-10 w-full max-w-4xl mx-auto px-6 text-center"
        variants={stagger} initial="hidden" animate="visible"
      >
        {/* Badge */}
        <motion.div variants={fadeUp} custom={0}>
          <div className="inline-flex items-center gap-2 bg-white/90 backdrop-blur-sm border border-emerald-200/80 text-emerald-700 text-xs font-semibold px-4 py-2 rounded-full mb-8 shadow-sm shadow-emerald-100/50">
            <Sparkles className="w-3.5 h-3.5" />
            AI-Powered Store Optimization · Get recommended more often
          </div>
        </motion.div>

        {/* Headline */}
        <motion.h1
          variants={fadeUp} custom={1}
          className="text-[56px] md:text-[68px] lg:text-[80px] font-bold text-slate-900 leading-none tracking-tighter mb-6"
        >
          Know exactly how<br />
          <span className="relative">
            AI agents{" "}
            <em className="not-italic italic text-emerald-600">see</em>
            {" "}your store
          </span>
        </motion.h1>

        {/* Subtext */}
        <motion.p
          variants={fadeUp} custom={2}
          className="text-lg md:text-xl text-slate-500 max-w-2xl mx-auto mb-10 leading-[1.7] font-normal"
        >
          Analyze how AI shopping assistants perceive your products. Get evidence-backed gap reports and one-click fixes pushed directly to Shopify.
        </motion.p>

        {/* Input + CTA */}
        <motion.div variants={fadeUp} custom={3} id="get-started">
          <form
            onSubmit={e => { e.preventDefault(); onAnalyze(url.trim()); }}
            className="flex flex-col sm:flex-row gap-2.5 max-w-[480px] mx-auto mb-5"
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
                    ? "0 0 0 2px rgba(16,185,129,0.2), 0 1px 4px rgba(0,0,0,0.04)"
                    : "0 1px 4px rgba(0,0,0,0.04)",
                }}
                transition={{ duration: 0.2 }}
                className="w-full h-12 px-4 rounded-xl border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 transition-all duration-200"
              />
            </div>
            <motion.button
              type="submit"
              whileHover={{ scale: 1.025, boxShadow: "0 6px 24px rgba(5,150,105,0.35)" }}
              whileTap={{ scale: 0.97 }}
              className="h-12 px-7 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold rounded-xl flex items-center justify-center gap-2 text-sm transition-colors shadow-sm whitespace-nowrap"
            >
              Analyze Store
              <ArrowRight className="w-4 h-4" />
            </motion.button>
          </form>
          <div className="flex items-center justify-center gap-5">
            {[
              { icon: Shield, text: "No credit card" },
              { icon: Zap, text: "60-second analysis" },
              { icon: Check, text: "Free to start" },
            ].map(({ icon: Icon, text }) => (
              <div key={text} className="flex items-center gap-1.5 text-[11px] text-slate-400 font-medium">
                <Icon className="w-3 h-3 text-emerald-500" />
                {text}
              </div>
            ))}
          </div>
        </motion.div>
      </motion.div>

      <div className="relative z-10 w-full max-w-5xl mx-auto px-6 mt-16 pb-0">
        <DashboardMockup />
      </div>
      <div className="absolute bottom-0 left-0 right-0 h-36 bg-gradient-to-t from-white to-transparent pointer-events-none" />
    </section>
  );
}

// ─── Social Proof ─────────────────────────────────────────────────────────────

const BRANDS = ["Cipher Demo", "EasyTax", "CoreOS", "Peregrin", "Foresight", "Leapyear", "NovaBrand", "PulseKit", "Storefront"];

function SocialProof() {
  return (
    <section className="py-16 bg-white border-y border-slate-100/60">
      <div className="max-w-6xl mx-auto px-6">
        <p className="text-center text-[11px] text-slate-400 font-bold uppercase tracking-[0.12em] mb-8">
          Trusted by 500+ Shopify merchants worldwide
        </p>
        <div className="relative overflow-hidden">
          <div className="flex gap-14 items-center" style={{ animation: "kasMarquee 28s linear infinite" }}>
            {[...BRANDS, ...BRANDS].map((brand, i) => (
              <span key={i} className="text-slate-300 font-bold text-sm tracking-wider whitespace-nowrap select-none">{brand}</span>
            ))}
          </div>
          <div className="absolute inset-y-0 left-0 w-28 bg-gradient-to-r from-white to-transparent pointer-events-none" />
          <div className="absolute inset-y-0 right-0 w-28 bg-gradient-to-l from-white to-transparent pointer-events-none" />
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
       variants={fadeUp}
      whileHover={{ y: -4, boxShadow: "0 12px 32px rgba(0,0,0,0.04), 0 4px 12px rgba(0,0,0,0.02)" }}
      transition={{ type: "spring", stiffness: 400, damping: 25 }}
      className="group bg-white rounded-2xl border border-slate-200/60 p-6 xl:p-8 cursor-default transition-all duration-300 relative overflow-hidden"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-slate-50/50 to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
      <div className="relative z-10">
        <motion.div
           className="w-10 h-10 rounded-xl bg-slate-50 border border-slate-200/60 flex items-center justify-center mb-6 shadow-sm"
          whileHover={{ scale: 1.05, rotate: 2 }}
          transition={{ type: "spring", stiffness: 400, damping: 20 }}
        >
          <Icon className="w-4 h-4 text-slate-700" />
        </motion.div>
        <h3 className="text-[15px] font-bold text-slate-900 mb-2.5 leading-snug tracking-tight">{title}</h3>
        <p className="text-[13.5px] text-slate-500 leading-relaxed font-medium">{description}</p>
      </div>
    </motion.div>
  );
}

function Features() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-80px" });

  return (
    <section id="features" className="py-28 bg-slate-50/40">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-16"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white border border-slate-200/80 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 shadow-sm">
            <Package className="w-3.5 h-3.5 text-emerald-500" />
            Everything you need
          </div>
          <h2 className="text-4xl md:text-[52px] font-bold text-slate-900 mb-4 leading-tight tracking-tighter">
            Built for the age of<br />
            <span className="italic text-emerald-600">AI commerce</span>
          </h2>
          <p className="text-slate-500 max-w-xl mx-auto text-base leading-relaxed">
            Traditional SEO tools don't understand how AI agents evaluate stores. Kasparro is built for what comes next.
          </p>
        </motion.div>

        <motion.div
          ref={ref}
          variants={stagger} initial="hidden" animate={inView ? "visible" : "hidden"}
          className="grid md:grid-cols-2 lg:grid-cols-3 gap-5"
        >
          {FEATURES.map(f => <FeatureCard key={f.title} {...f} />)}
        </motion.div>
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
    <section id="how-it-works" className="py-28 bg-white border-t border-slate-100/60 relative overflow-hidden">
      <div className="max-w-6xl mx-auto px-6">
        <motion.div
          className="text-center mb-20"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-slate-50 border border-slate-200/60 text-slate-600 text-xs font-semibold px-3 py-1.5 rounded-full mb-5 shadow-sm">
            <Layers className="w-3.5 h-3.5 text-slate-500" />
            Simple workflow
          </div>
          <h2 className="text-4xl md:text-[52px] font-bold text-slate-900 mb-4 leading-tight tracking-tighter">
            From zero to optimized<br />
            <span className="italic text-emerald-600">in under 5 minutes</span>
          </h2>
        </motion.div>

        <div className="max-w-4xl mx-auto relative pl-6 md:pl-0" ref={ref}>
          {/* Vertical connector line */}
          <motion.div
            className="absolute top-4 bottom-8 left-[39px] md:left-1/2 md:-ml-[1.5px] w-[3px] bg-gradient-to-b from-slate-200 via-slate-200 to-transparent rounded-full origin-top"
            initial={{ scaleY: 0 }}
            animate={inView ? { scaleY: 1 } : {}}
            transition={{ duration: 1.2, ease: [0.22, 1, 0.36, 1] }}
          />

          <div className="space-y-20">
            {STEPS.map(({ num, title, desc }, i) => (
              <motion.div
                key={num}
                className={cn("relative flex flex-col md:flex-row gap-6 md:gap-16 items-start md:items-center", i % 2 !== 0 && "md:flex-row-reverse")}
                initial={{ opacity: 0, y: 24 }}
                animate={inView ? { opacity: 1, y: 0 } : {}}
                transition={{ duration: 0.6, delay: i * 0.2, ease: [0.22, 1, 0.36, 1] }}
              >
                {/* Node */}
                <div className="absolute left-[-11px] md:left-1/2 md:-translate-x-1/2 top-1 md:top-1/2 md:-translate-y-1/2 flex items-center justify-center w-8 h-8 rounded-full bg-white border-[3px] border-slate-300 shadow-[0_0_0_6px_white] z-10 transition-colors duration-300 hover:border-slate-400">
                  <div className="w-2.5 h-2.5 rounded-full bg-slate-300" />
                </div>

                <div className={cn("flex-1 pt-0.5 md:pt-0 pl-10 md:pl-0 w-full", i % 2 !== 0 ? "md:text-left" : "md:text-right")}>
                  <div className={cn("inline-flex items-center justify-center w-11 h-11 rounded-xl bg-white border border-slate-200/80 text-slate-900 font-bold mb-5 shadow-[0_4px_12px_rgba(0,0,0,0.03)]", i % 2 !== 0 ? "" : "md:ml-auto")}>
                    {num}
                  </div>
                  <h3 className="text-xl font-bold text-slate-900 mb-2.5 leading-tight tracking-tight">{title}</h3>
                  <p className={cn("text-[14.5px] text-slate-500 leading-relaxed font-medium block max-w-sm", i % 2 !== 0 ? "mr-auto" : "md:ml-auto")}>
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
  { end: 500, suffix: "+", label: "Merchants using Kasparro", sub: "and growing" },
  { end: 15, suffix: "", label: "Diagnostic rules", sub: "across 6 gap categories" },
  { end: 98, suffix: "%", label: "Report accuracy", sub: "evidence-backed every time" },
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
      <div className="text-5xl md:text-6xl font-bold text-slate-900 mb-2 tabular-nums tracking-tight leading-none">
        {count}{suffix}
      </div>
      <div className="text-sm font-semibold text-slate-700 mb-0.5">{label}</div>
      <div className="text-xs text-slate-400">{sub}</div>
    </motion.div>
  );
}

function Stats() {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref as React.RefObject<Element>, { once: true, margin: "-100px" });

  return (
    <section className="py-24 bg-white border-t border-slate-100/60">
      <div className="max-w-5xl mx-auto px-6">
        <div ref={ref} className="grid grid-cols-2 md:grid-cols-4 gap-10 md:divide-x divide-slate-100">
          {STATS_DATA.map(s => <StatItem key={s.label} {...s} active={inView} />)}
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
      className="border-b border-slate-100 last:border-0"
    >
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between py-5 text-left group"
      >
        <span className="text-sm font-semibold text-slate-900 pr-4 group-hover:text-emerald-700 transition-colors duration-200">{q}</span>
        <motion.div
          animate={{ rotate: open ? 180 : 0 }}
          transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
          className="flex-shrink-0 w-5 h-5 rounded-full bg-slate-100 group-hover:bg-emerald-50 flex items-center justify-center transition-colors duration-200"
        >
          <ChevronDown className="w-3 h-3 text-slate-500 group-hover:text-emerald-600 transition-colors duration-200" />
        </motion.div>
      </button>
      <AnimatePresence initial={false}>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <p className="text-sm text-slate-500 leading-relaxed pb-5">{a}</p>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

function FAQ() {
  return (
    <section id="faq" className="py-28 bg-slate-50/40">
      <div className="max-w-2xl mx-auto px-6">
        <motion.div
          className="text-center mb-14"
          initial={{ opacity: 0, y: 24 }} whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-60px" }}
          transition={{ duration: 0.55, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-4xl md:text-[48px] font-bold text-slate-900 mb-4 leading-tight tracking-tighter">
            Common questions
          </h2>
          <p className="text-slate-500 text-base leading-relaxed">
            Everything you need to know before you connect.
          </p>
        </motion.div>

        <div className="bg-white rounded-2xl border border-slate-100 shadow-sm px-8">
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
  Company: ["About", "Blog", "Careers", "Press"],
  Resources: ["Documentation", "API Reference", "Status", "Community"],
  Legal: ["Privacy Policy", "Terms of Service", "Cookie Policy", "GDPR"],
};

function Footer() {
  return (
    <footer className="bg-white border-t border-slate-200/80 pt-20 pb-10">
      <div className="max-w-6xl mx-auto px-6">
        <div className="grid md:grid-cols-5 gap-10 mb-14">
          <div className="md:col-span-2">
            <span className="text-base font-bold text-slate-900 mb-3 block tracking-tight">Kasparro</span>
            <p className="text-[13px] text-slate-500 leading-relaxed max-w-xs">
              AI readiness analysis and optimization for modern Shopify stores. Know exactly what AI agents think of your products.
            </p>
          </div>
          {Object.entries(FOOTER_LINKS).map(([section, links]) => (
            <div key={section}>
              <p className="text-xs font-semibold text-slate-900 mb-4 tracking-tight">{section}</p>
              <ul className="space-y-3">
                {links.map(link => (
                  <li key={link}>
                    <a href="#" className="text-[13px] text-slate-500 hover:text-slate-900 transition-colors duration-200">
                      {link}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="border-t border-slate-200 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
          <p className="text-[13px] text-slate-500">© 2025 Kasparro. All rights reserved.</p>
          <div className="flex items-center gap-6">
            {["Privacy", "Terms", "Cookies"].map(link => (
              <a key={link} href="#" className="text-[13px] text-slate-500 hover:text-slate-900 transition-colors">
                {link}
              </a>
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
        <div className="fixed inset-0 z-[200] flex items-center justify-center p-4">
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-[4px]"
            initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}
            transition={{ duration: 0.22 }}
            onClick={() => state !== "loading" && onClose()}
          />

          {/* Dialog */}
          <motion.div
            className="relative z-10 w-full max-w-[440px] overflow-hidden rounded-[24px] bg-white shadow-[0_24px_80px_rgba(0,0,0,0.12)] border border-slate-200/60"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ type: "spring", damping: 25, stiffness: 400 }}
          >
            {/* Close button */}
            {state === "idle" && (
              <button
                onClick={onClose}
                className="absolute top-5 right-5 w-8 h-8 rounded-full text-slate-400 hover:text-slate-600 hover:bg-slate-100 flex items-center justify-center transition-colors z-10"
              >
                <X className="w-5 h-5" />
              </button>
            )}

            <div className="px-10 pt-12 pb-10 text-center">
              <motion.div
                className="w-16 h-16 rounded-2xl bg-white shadow-sm border border-slate-200/80 flex items-center justify-center mx-auto mb-6"
                animate={state === "loading" ? { rotate: [0, 360] } : {}}
                transition={{ repeat: Infinity, duration: 2, ease: "linear" }}
              >
                {state === "loading" ? (
                  <motion.div
                    className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full"
                    animate={{ rotate: 360 }}
                    transition={{ repeat: Infinity, duration: 0.8, ease: "linear" }}
                  />
                ) : (
                  <BarChart3 className="w-7 h-7 text-emerald-600" />
                )}
              </motion.div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2.5 leading-tight tracking-tight">
                {state === "loading" ? "Connecting to Shopify…" : "Analyze your store"}
              </h2>
              {storeUrl && state === "idle" ? (
                <div className="inline-flex items-center gap-2 bg-slate-50 text-slate-600 text-sm font-medium px-3 py-1.5 rounded-lg border border-slate-200 mt-1">
                  <div className="w-2 h-2 rounded-full bg-emerald-500 shadow-[0_0_8px_rgba(16,185,129,0.4)]" />
                  {storeUrl}
                </div>
              ) : (
                <p className="text-slate-500 text-[14.5px] leading-relaxed max-w-[280px] mx-auto">
                  {state === "loading" ? "Redirecting to Google securely…" : "Log in to view exactly how AI shopping assistants perceive your catalog."}
                </p>
              )}

              <div className="mt-10">
                <motion.button
                  onClick={handleGoogle}
                  disabled={state === "loading"}
                  whileHover={state === "idle" ? { y: -1, boxShadow: "0 6px 16px rgba(0,0,0,0.06)" } : {}}
                  whileTap={state === "idle" ? { y: 0, scale: 0.98 } : {}}
                  className={cn(
                    "w-full h-14 rounded-xl flex items-center justify-center gap-3 text-[14.5px] font-semibold transition-all duration-200 border",
                    state === "loading"
                      ? "bg-slate-50 text-slate-400 border-slate-200 cursor-not-allowed"
                      : "bg-white hover:bg-slate-50 text-slate-900 border-slate-200 shadow-sm",
                  )}
                >
                  {!state && null}
                  <svg className="w-5 h-5 flex-shrink-0" viewBox="0 0 24 24">
                    <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                    <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                    <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
                    <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                  </svg>
                  Continue with Google
                </motion.button>
              </div>

              <div className="mt-8 flex justify-center">
                <div className="flex items-center gap-2 text-slate-400">
                  <Shield className="w-4 h-4" />
                  <span className="text-[13px] font-medium tracking-wide">Secure Authentication</span>
                </div>
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
      <div className="min-h-screen flex items-center justify-center bg-white">
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

      <div className="min-h-screen bg-white overflow-x-hidden">
        <Navbar
          onLogin={() => { setPendingUrl(""); setModalOpen(true); }}
          onGetStarted={() => document.getElementById("get-started")?.scrollIntoView({ behavior: "smooth", block: "center" })}
        />
        <Hero onAnalyze={handleAnalyze} />
        <SocialProof />
        <Features />
        <HowItWorks />
        <Stats />
        <FAQ />
        <Footer />
        <ConnectModal open={modalOpen} storeUrl={pendingUrl} onClose={() => setModalOpen(false)} />
      </div>
    </>
  );
}
