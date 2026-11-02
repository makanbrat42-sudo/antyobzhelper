"use client";

import * as React from "react";
import { motion } from "framer-motion";
import { ShieldCheck } from "lucide-react";

export function AuthLayout({ children, title, subtitle }: { children: React.ReactNode; title: string; subtitle?: React.ReactNode }) {
  return (
    <div className="app-glow relative flex min-h-screen items-center justify-center overflow-hidden px-4 py-10">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(255,255,255,0.025)_1px,transparent_1px),linear-gradient(90deg,rgba(255,255,255,0.025)_1px,transparent_1px)] bg-[size:48px_48px] [mask-image:radial-gradient(ellipse_at_center,black_30%,transparent_75%)]" />
      <motion.div
        initial={{ opacity: 0, y: 16, scale: 0.98 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        transition={{ type: "spring", stiffness: 260, damping: 26 }}
        className="relative w-full max-w-md rounded-2xl border border-border bg-card/90 p-8 shadow-2xl shadow-primary/10 backdrop-blur"
      >
        <div className="mb-6 flex flex-col items-center text-center">
          <span className="mb-4 flex size-14 items-center justify-center rounded-2xl bg-brand shadow-xl shadow-primary/30">
            <ShieldCheck className="size-7 text-white" />
          </span>
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          {subtitle && <p className="mt-2 text-sm text-muted">{subtitle}</p>}
        </div>
        {children}
      </motion.div>
    </div>
  );
}

export function VkIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} fill="currentColor" aria-hidden>
      <path d="M12.785 16.241s.288-.032.436-.194c.136-.148.132-.427.132-.427s-.02-1.304.576-1.496c.588-.19 1.341 1.26 2.14 1.818.605.422 1.064.33 1.064.33l2.137-.03s1.117-.071.587-.964c-.043-.073-.308-.661-1.588-1.87-1.34-1.264-1.16-1.059.453-3.246.983-1.332 1.376-2.145 1.253-2.493-.117-.332-.84-.244-.84-.244l-2.406.015s-.178-.025-.31.056c-.13.079-.212.262-.212.262s-.382 1.03-.89 1.907c-1.07 1.85-1.499 1.948-1.674 1.832-.407-.267-.305-1.075-.305-1.648 0-1.793.267-2.54-.521-2.733-.262-.065-.454-.107-1.123-.114-.858-.009-1.585.003-1.996.208-.274.136-.485.44-.356.457.159.022.519.099.71.363.246.341.237 1.107.237 1.107s.142 2.11-.33 2.371c-.325.18-.77-.187-1.725-1.865-.489-.859-.859-1.81-.859-1.81s-.07-.176-.198-.272c-.154-.115-.37-.151-.37-.151l-2.286.015s-.343.01-.469.161C3.94 7.721 4.043 8 4.043 8s1.79 4.258 3.817 6.403c1.858 1.967 3.968 1.838 3.968 1.838h.957z" />
    </svg>
  );
}
