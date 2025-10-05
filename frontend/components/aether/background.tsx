"use client"

import { useEffect, useMemo, useState } from "react"

const GLYPHS = "∆ ∑ Ω λ ψ ζ φ π σ τ Ϟ ϟ ≈ ≡ ⌁ ⌁ ⌁ ⌁ ⌁ ⌁ ⌁ ⌁ ⌁ ⌁ # / \\ * + = < > { } [ ] | ~ § © ® ¶".split(" ")

export function AetherBackground() {
  const [reduced, setReduced] = useState(false)
  const [isMobile, setIsMobile] = useState(false)

  useEffect(() => {
    setReduced(window.matchMedia("(prefers-reduced-motion: reduce)").matches)
    const onResize = () => setIsMobile(window.matchMedia("(max-width: 768px)").matches)
    onResize()
    window.addEventListener("resize", onResize)
    return () => window.removeEventListener("resize", onResize)
  }, [])

  const particleCount = reduced ? 0 : isMobile ? 18 : 50
  const glyphCols = reduced ? 0 : isMobile ? 6 : 12

  const particles = useMemo(
    () =>
      Array.from({ length: particleCount }).map((_, i) => ({
        id: i,
        left: Math.random() * 100,
        top: Math.random() * 100,
        size: 2 + Math.random() * 3,
        delay: Math.random() * 5,
        dur: 6 + Math.random() * 6,
        hue: 180 + Math.floor(Math.random() * 160),
      })),
    [particleCount],
  )

  const glyphs = useMemo(
    () =>
      Array.from({ length: glyphCols }).map((_, col) => ({
        id: col,
        delay: Math.random() * 10,
        dur: 10 + Math.random() * 12,
        content: Array.from({ length: 24 })
          .map(() => GLYPHS[Math.floor(Math.random() * GLYPHS.length)])
          .join(" "),
      })),
    [glyphCols],
  )

  return (
    <div className="pointer-events-none absolute inset-0 -z-0">
      {/* Pure black base + orbital gradient field */}
      <div className="absolute inset-0 bg-black/100">
        <div className="absolute inset-0 opacity-40 mix-blend-screen aether-orbit-gradient" />
      </div>

      {/* Morphing luminous blobs (layered depth) */}
      <div className="absolute inset-0">
        {[0, 1, 2, 3, 4].map((i) => (
          <div
            key={i}
            className={`synth-blob synth-blob-${i + 1}`}
            style={{
              animationDelay: `${i * 0.8}s`,
              filter: "blur(40px)",
              opacity: 0.35 - i * 0.03,
            }}
          />
        ))}
      </div>

      {/* Photon particles with subtle trails */}
      <div className="absolute inset-0 overflow-hidden">
        {particles.map((p) => (
          <span
            key={p.id}
            className="photon-particle"
            style={{
              left: `${p.left}%`,
              top: `${p.top}%`,
              width: p.size,
              height: p.size,
              animationDelay: `${p.delay}s`,
              animationDuration: `${p.dur}s`,
              boxShadow: `0 0 12px hsla(${p.hue}, 100%, 60%, 0.9)`,
              background: `hsla(${p.hue}, 100%, 60%, 0.95)`,
            }}
          />
        ))}
      </div>

      {/* Holographic grid with scanning beam */}
      <div className="absolute inset-0 aether-grid">
        <div className="absolute inset-0 scanline" />
      </div>

      {/* Luminous filaments (decorative SVG) */}
      <svg className="absolute inset-0 size-full opacity-30 mix-blend-screen" aria-hidden="true">
        <defs>
          <linearGradient id="filament" x1="0" x2="1" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--brand-cyan)" />
            <stop offset="50%" stopColor="var(--brand-purple)" />
            <stop offset="100%" stopColor="var(--brand-pink)" />
          </linearGradient>
        </defs>
        {Array.from({ length: 6 }).map((_, i) => (
          <g key={i}>
            <path
              d={`M ${5 + i * 16} ${15 + (i % 3) * 8} C ${15 + i * 18} ${20 + i * 5}, ${35 + i * 12} ${
                10 + i * 7
              }, ${50 + i * 8} ${22 + i * 9}`}
              fill="none"
              stroke="url(#filament)"
              strokeWidth="0.75"
              className="animate-filament"
              vectorEffect="non-scaling-stroke"
            />
            <circle r="1.2" cx={50 + i * 8} cy={22 + i * 9} fill="url(#filament)" className="animate-node" />
          </g>
        ))}
      </svg>

      {/* Digital glyph streams */}
      <div className="absolute inset-0 px-4 md:px-8">
        <div className="relative h-full grid" style={{ gridTemplateColumns: `repeat(${Math.max(glyphCols, 1)}, 1fr)` }}>
          {glyphs.map((g) => (
            <div
              key={g.id}
              className="glyph-stream"
              style={{ animationDelay: `${g.delay}s`, animationDuration: `${g.dur}s` }}
              aria-hidden="true"
            >
              {g.content}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
