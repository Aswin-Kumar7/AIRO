import { Link } from "wouter";
import { Button } from "@/components/ui/button";
import { ArrowLeft, Home, Search, Compass, AlertCircle } from "lucide-react";
import { motion } from "framer-motion";

export default function NotFound() {
  return (
    <div className="min-h-screen w-full flex flex-col items-center justify-center bg-white dark:bg-black p-6 overflow-hidden relative">
      {/* ── Background Aesthetics ── */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-emerald-500/5 dark:bg-emerald-500/[0.03] rounded-full blur-[120px]" />
        <div className="absolute top-0 left-0 w-full h-full bg-[radial-gradient(#e5e7eb_1px,transparent_1px)] dark:bg-[radial-gradient(#1f2937_1px,transparent_1px)] [background-size:40px_40px] [mask-image:radial-gradient(ellipse_50%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-20" />
      </div>

      {/* ── Content ── */}
      <div className="relative z-10 flex flex-col items-center text-center max-w-lg">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={{ opacity: 1, scale: 1 }}
          transition={{ duration: 0.5, ease: [0.23, 1, 0.32, 1] }}
          className="mb-8"
        >
          <div className="w-20 h-20 rounded-3xl bg-slate-50 dark:bg-zinc-950 border border-slate-100 dark:border-white/10 flex items-center justify-center shadow-2xl relative group">
            <div className="absolute inset-0 bg-emerald-500/10 rounded-3xl blur-xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />
            <Compass className="w-10 h-10 text-slate-900 dark:text-white relative z-10" />
          </div>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.1, duration: 0.5 }}
        >
          <h1 className="text-[120px] font-black text-slate-900 dark:text-white leading-none tracking-tighter mb-4 select-none opacity-[0.03] absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-[-1]">
            404
          </h1>
          <h2 className="text-[32px] sm:text-[42px] font-black text-slate-900 dark:text-white tracking-tight mb-4">
            Lost in the Intelligence.
          </h2>
          <p className="text-[15px] sm:text-[17px] text-slate-500 dark:text-zinc-400 font-medium leading-relaxed mb-10 max-w-[380px] mx-auto">
            The page you are looking for has been moved, deleted, or never existed in this dimension.
          </p>
        </motion.div>

        <motion.div
          initial={{ opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.2, duration: 0.5 }}
          className="flex flex-col sm:flex-row items-center gap-4 w-full"
        >
          <Link href="/dashboard" className="w-full sm:flex-1">
            <Button className="w-full h-14 rounded-2xl bg-slate-900 dark:bg-white text-white dark:text-black font-bold text-[15px] shadow-2xl hover:opacity-90 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
              <Home className="w-4.5 h-4.5" />
              Return to Dashboard
            </Button>
          </Link>
          <button 
            onClick={() => window.history.back()}
            className="w-full sm:w-auto h-14 px-8 rounded-2xl border border-slate-200 dark:border-white/10 text-slate-600 dark:text-zinc-300 font-bold text-[15px] hover:bg-slate-50 dark:hover:bg-white/5 transition-all flex items-center justify-center gap-2"
          >
            <ArrowLeft className="w-4.5 h-4.5" />
            Go Back
          </button>
        </motion.div>

        {/* ── Help Links ── */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4, duration: 1 }}
          className="mt-16 flex items-center gap-8"
        >
          <a href="#" className="text-[12px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors">Documentation</a>
          <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-zinc-800" />
          <a href="#" className="text-[12px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors">Support</a>
          <div className="w-1 h-1 rounded-full bg-slate-200 dark:bg-zinc-800" />
          <a href="#" className="text-[12px] font-bold text-slate-400 dark:text-zinc-500 uppercase tracking-widest hover:text-slate-900 dark:hover:text-white transition-colors">Status</a>
        </motion.div>
      </div>

      {/* ── Footer Branding ── */}
      <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex items-center gap-2 opacity-20">
         <div className="w-5 h-5 rounded-md bg-slate-900 dark:bg-white flex items-center justify-center">
            <Search className="w-3 h-3 text-white dark:text-black" />
         </div>
         <span className="text-[13px] font-black tracking-tight text-slate-900 dark:text-white">Kasparro</span>
      </div>
    </div>
  );
}
