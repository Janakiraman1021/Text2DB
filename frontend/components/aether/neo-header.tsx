"use client"

import Link from "next/link"
import { useMemo } from "react"
import { cn } from "@/lib/utils"

export function NeoHeader() {
  const leds = useMemo(() => ["#ef4444", "#f59e0b", "#10b981"], [])

  return (
    <header className="relative px-6 md:px-10 pt-8 pb-6">
      {/* Photon emblem */}
      <div className="mx-auto max-w-6xl flex items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          <div
            className={cn(
              "size-12 md:size-14 rounded-full relative",
              "bg-[radial-gradient(closest-side,rgba(6,182,212,0.9),rgba(139,92,246,0.25)_60%,transparent_70%)]",
              "ring-1 ring-white/10 backdrop-blur-sm",
              'before:content-[""] before:absolute before:inset-0 before:rounded-full before:bg-[conic-gradient(from_0deg,rgba(6,182,212,0.65),rgba(236,72,153,0.35),rgba(139,92,246,0.5),rgba(6,182,212,0.65))] before:mix-blend-screen before:animate-spin-slow',
            )}
            aria-hidden="true"
          >
            <div className="absolute inset-0 m-1 rounded-full bg-white/5 blur-[2px]" />
            <div className="absolute inset-0 scanline" />
          </div>
          <div>
            <div className="text-balance heading-font text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)] drop-shadow-[0_0_10px_rgba(6,182,212,0.6)] tracking-[0.25em] text-2xl md:text-3xl">
              t2d
            </div>
            <div className="mt-1 flex items-center gap-3">
              <span
                className="status-led bg-emerald-400/90 shadow-[0_0_10px_rgba(16,185,129,0.8)]"
                aria-hidden="true"
              />
              <span className="text-xs md:text-sm text-white/70 tracking-[0.35em]">SYSTEM AI ONLINE</span>
            </div>
          </div>
        </div>
        {/* Floating status LEDs */}
        <div className="flex items-center gap-2">
          {leds.map((c, i) => (
            <span
              key={i}
              className="status-led"
              style={{ backgroundColor: c, boxShadow: `0 0 12px ${c}` }}
              aria-hidden="true"
            />
          ))}
        </div>
      </div>

      {/* Simple navigation */}
      <nav className="mt-6 flex justify-center gap-4">
        <Link href="/" className="nav-link">
          Home
        </Link>
        <Link href="/working" className="nav-link">
          Working
        </Link>
        <Link href="/features" className="nav-link">
          Features
        </Link>
        <Link href="/about" className="nav-link">
          About
        </Link>
      </nav>

      {/* Title */}
      <div className="mt-8 md:mt-10 text-center">
        <h1 className="heading-font text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)] text-5xl md:text-7xl lg:text-8xl tracking-[0.25em] leading-tight glow-text">
          AETHER SYNTH QUERY
        </h1>
      </div>
    </header>
  )
}
