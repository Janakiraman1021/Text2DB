"use client"

import type React from "react"

import { useCallback, useMemo, useRef, useState } from "react"
import axios from "axios"
import { cn } from "@/lib/utils"

type ApiResponse =
  | {
      query?: unknown
      results?: unknown
      count?: number
      error?: string
      original_text?: string
      tokens?: unknown
      raw_response?: unknown
      clean_output?: string
      message?: string
    }
  | any

export function QueryConsole() {
  const [collection, setCollection] = useState("")
  const [query, setQuery] = useState("")
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [mongoQuery, setMongoQuery] = useState<unknown>(null)
  const [results, setResults] = useState<unknown>(null)

  const [lastLatencyMs, setLastLatencyMs] = useState<number | null>(null)
  const [lastStatus, setLastStatus] = useState<string | null>(null)
  const [history, setHistory] = useState<Array<{ q: string; c: string; at: string; count?: number }>>([])

  // Debug/LLM fields returned by backend
  const [debugOriginal, setDebugOriginal] = useState<string | null>(null)
  const [debugTokens, setDebugTokens] = useState<unknown>(null)
  const [debugRaw, setDebugRaw] = useState<unknown>(null)
  const [debugClean, setDebugClean] = useState<string | null>(null)
  const [debugError, setDebugError] = useState<string | null>(null)
  const [debugDbName, setDebugDbName] = useState<string | null>(null)
  const [debugCollectionName, setDebugCollectionName] = useState<string | null>(null)
  const [debugWarning, setDebugWarning] = useState<string | null>(null)
  const [debugExecutedFilter, setDebugExecutedFilter] = useState<unknown>(null)
  const [debugExecutedOptions, setDebugExecutedOptions] = useState<unknown>(null)

  const btnRef = useRef<HTMLButtonElement>(null)
  const charCount = query.length

  const examples = useMemo(
    () => [
      {
        c: "users",
        q: "Return the 10 most recent users in Europe who purchased over $500.",
      },
      {
        c: "orders",
        q: "Top 5 orders by total over the last 30 days.",
      },
      {
        c: "sessions",
        q: "Active sessions from mobile devices in the past 2 hours.",
      },
      {
        c: "products",
        q: "List products tagged 'neon' with stock under 20.",
      },
    ],
    [],
  )

  const recordCount = useMemo(() => {
    if (Array.isArray(results)) return results.length
    if (results && typeof results === "object" && "length" in (results as any)) {
      try {
        return (results as any).length
      } catch {
        return undefined
      }
    }
    return undefined
  }, [results])

  const handleSubmit = useCallback(async () => {
    if (!query.trim() || !collection.trim()) {
      setError("Provide both a natural language query and collection name.")
      return
    }
    setLoading(true)
    setError(null)
    setMongoQuery(null)
    setResults(null)

    const started = performance.now()
    try {
      // backend expects { text, collection }
      const res = await axios.post<ApiResponse>("http://localhost:8000/query", {
        text: query,
        collection,
      })
      const elapsed = Math.max(0, Math.round(performance.now() - started))
      setLastLatencyMs(elapsed)
      setLastStatus(`${res.status} ${res.statusText || "OK"}`)

      const data = res.data
      if (data?.error) {
        setError(String(data.error))
      }
  // backend returns the generated Mongo query under `query`, but prefer the executed_filter
  // (the actual filter sent to MongoDB) when available
  setMongoQuery(data?.executed_filter ?? data?.query ?? null)
      setResults(data?.results ?? null)

      // set debug fields in state for rendering
  setDebugOriginal(data?.original_text ?? query)
  setDebugTokens(data?.tokens ?? null)
  setDebugRaw(data?.raw_response ?? null)
  setDebugClean(data?.clean_output ?? null)
  setDebugError(data?.error ?? null)
  setDebugDbName(data?.db_name ?? null)
  setDebugCollectionName(data?.collection_name ?? null)
  setDebugWarning(data?.warning ?? null)
    setDebugExecutedFilter(data?.executed_filter ?? null)
    setDebugExecutedOptions(data?.executed_options ?? null)
    } catch (e: any) {
      const elapsed = Math.max(0, Math.round(performance.now() - started))
      setLastLatencyMs(elapsed)
      setLastStatus(e?.response?.status ? `${e.response.status} Error` : "Request failed")
      setError(e?.message || "Request failed.")

      // try to extract debug envelope from backend error detail
      const detail = e?.response?.data?.detail ?? e?.response?.data ?? null
      if (detail && typeof detail === "object") {
        setDebugOriginal(detail.original_text ?? null)
        setDebugTokens(detail.tokens ?? null)
        setDebugRaw(detail.raw_response ?? null)
        setDebugClean(detail.clean_output ?? null)
        setDebugError(detail.error ? String(detail.error) : JSON.stringify(detail))
        setDebugDbName(detail.db_name ?? null)
        setDebugCollectionName(detail.collection_name ?? null)
        setDebugWarning(detail.warning ?? null)
        setDebugExecutedFilter(detail.executed_filter ?? null)
        setDebugExecutedOptions(detail.executed_options ?? null)
      } else if (typeof detail === "string") {
        setDebugError(detail)
      }
    } finally {
      setLoading(false)
    }
  }, [query, collection])

  const onTextAreaKey = useCallback(
    (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault()
        handleSubmit()
      }
    },
    [handleSubmit],
  )

  const copy = useCallback(async (value: unknown) => {
    try {
      const text = typeof value === "string" ? value : JSON.stringify(value, null, 2)
      await navigator.clipboard.writeText(text ?? "")
      btnRef.current?.animate([{ transform: "scale(1)" }, { transform: "scale(1.05)" }, { transform: "scale(1)" }], {
        duration: 300,
        easing: "cubic-bezier(.2,.8,.2,1)",
      })
    } catch {
      // ignore
    }
  }, [])

  const pretty = (v: unknown) => {
    try {
      return typeof v === "string" ? v : JSON.stringify(v, null, 2)
    } catch {
      return String(v)
    }
  }

  return (
    <section className="relative mx-auto max-w-6xl px-6 md:px-10 pb-16">
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Input panel */}
        <div className={cn("glass-panel p-5 md:p-6 relative")}>
          <div className="absolute inset-0 scanline pointer-events-none" />
          <div className="flex items-center justify-between mb-4">
            <h2 className="heading-font text-sm tracking-[0.45em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)]">
              SYNTH INTERFACE
            </h2>
            <span className="text-xs text-white/60 tracking-[0.3em]">{charCount} CH</span>
          </div>

          <div className="mb-3 flex flex-wrap items-center gap-2">
            {examples.map((ex, idx) => (
              <button
                key={idx}
                type="button"
                onClick={() => {
                  setCollection(ex.c)
                  setQuery(ex.q)
                }}
                className="copy-btn"
                title="Use example"
              >
                {ex.c.toUpperCase()}
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="collection">
            MongoDB Collection
          </label>
          <input
            id="collection"
            value={collection}
            onChange={(e) => setCollection(e.target.value)}
            placeholder="collection name"
            className={cn(
              "w-full mb-3 rounded-md bg-white/[0.02] text-white placeholder:text-white/35",
              "px-3 py-3 tracking-[0.2em]",
              "ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand-pink)]",
              "transition focus:outline-none",
            )}
          />

          <label className="sr-only" htmlFor="query">
            Natural language query
          </label>
          <div className="relative">
            <textarea
              id="query"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={onTextAreaKey}
              rows={8}
              placeholder="Describe your intent… e.g., 'Find the last 10 users from Europe who made a purchase over $500.'"
              className={cn(
                "w-full rounded-md bg-white/[0.02] text-white placeholder:text-white/35",
                "px-3 py-3 tracking-[0.02em] leading-relaxed",
                "ring-1 ring-white/10 focus:ring-2 focus:ring-[var(--brand-cyan)]",
                "transition focus:outline-none",
                "code-block-sci",
              )}
            />
            {/* Typing indicator */}
            <div className="pointer-events-none absolute bottom-2 right-3 flex gap-1">
              <span className="typing-dot" />
              <span className="typing-dot" style={{ animationDelay: "0.15s" }} />
              <span className="typing-dot" style={{ animationDelay: "0.3s" }} />
            </div>
          </div>

          {/* Controls */}
          <div className="mt-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="badge badge-cyan">CYAN</span>
              <span className="badge badge-purple">PURPLE</span>
              <span className="badge badge-pink">PINK</span>
            </div>
            <button
              ref={btnRef}
              type="button"
              onClick={handleSubmit}
              className={cn("energy-button", loading && "pointer-events-none opacity-80")}
              aria-busy={loading}
            >
              {loading ? (
                <span className="flex items-center gap-3">
                  <span className="spinner-dual" aria-hidden="true" />
                  <span>EXECUTING…</span>
                </span>
              ) : (
                "EXECUTE SYNTH QUERY"
              )}
            </button>
          </div>

          {/* Error */}
          {error && (
            <div className="mt-3 hologram-error" role="alert">
              <span className="mr-2">!</span>
              <span>{error}</span>
            </div>
          )}
        </div>

        {/* Result panels */}
        <div className="flex flex-col gap-6">
          {/* Mongo query */}
          <div className="glass-panel relative p-5 md:p-6 min-h-[220px]">
            <div className="absolute inset-0 scanline pointer-events-none" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="heading-font text-xs tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)]">
                SYNTH QUERY GRID
              </h3>
              <div className="flex items-center gap-2">
                <span className="record-badge">{mongoQuery ? "READY" : "EMPTY"}</span>
                <button
                  type="button"
                  onClick={() => copy(mongoQuery ?? "")}
                  className="copy-btn"
                  aria-label="Copy Mongo query"
                  title="Copy"
                >
                  COPY
                </button>
              </div>
            </div>
            <div className="relative max-h-[280px] overflow-auto custom-scroll">
                <pre className="code-block-sci select-text">{pretty(mongoQuery)}</pre>
                {(debugExecutedOptions as any) && (
                  <div className="mt-3 text-xs text-white/70">
                    <div className="text-white/60">Executed Options</div>
                    <pre className="code-block-sci mt-1">{pretty(debugExecutedOptions as any)}</pre>
                  </div>
                )}
            </div>
          </div>

          {/* Results */}
          <div className="glass-panel relative p-5 md:p-6 min-h-[260px]">
            <div className="absolute inset-0 scanline pointer-events-none" />
            <div className="mb-3 flex items-center justify-between">
              <h3 className="heading-font text-xs tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)]">
                SYNTH RESULTS DATA
              </h3>
              <div className="flex items-center gap-2">
                <span className="record-badge">{typeof recordCount === "number" ? `${recordCount} RECORDS` : "—"}</span>
                <button
                  type="button"
                  onClick={() => copy(results ?? "")}
                  className="copy-btn"
                  aria-label="Copy results"
                  title="Copy"
                >
                  COPY
                </button>
              </div>
            </div>
            <div className="relative max-h-[320px] overflow-auto custom-scroll">
              <pre className="code-block-sci select-text">{pretty(results)}</pre>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-6 grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* System Status */}
        <div className="glass-panel relative p-5 md:p-6">
          <div className="absolute inset-0 scanline pointer-events-none" />
          <div className="mb-3 flex items-center justify-between">
            <h3 className="heading-font text-xs tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)]">
              SYSTEM STATUS
            </h3>
            <span className="record-badge">{lastStatus ? "ACTIVE" : "IDLE"}</span>
          </div>
          <div className="text-sm text-white/80 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-white/60 tracking-widest">Endpoint</span>
              <span className="font-mono">http://localhost:8000/query</span>
            </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 tracking-widest">DB</span>
                <span className="font-mono">{debugDbName ?? "—"}</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-white/60 tracking-widest">Collection</span>
                <span className="font-mono">{(debugCollectionName ?? collection) || "—"}</span>
              </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 tracking-widest">Last Status</span>
              <span className="font-mono">{lastStatus ?? "—"}</span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-white/60 tracking-widest">Latency</span>
              <span className="font-mono">{lastLatencyMs != null ? `${lastLatencyMs} ms` : "—"}</span>
            </div>
            <div className="mt-3 flex items-center gap-2">
              <span className="status-led" style={{ backgroundColor: "#10b981", boxShadow: "0 0 10px #10b981" }} />
              <span className="text-xs text-white/70 tracking-[0.25em]">OK</span>
              <span className="status-led" style={{ backgroundColor: "#f59e0b", boxShadow: "0 0 10px #f59e0b" }} />
              <span className="text-xs text-white/70 tracking-[0.25em]">WARN</span>
              <span className="status-led" style={{ backgroundColor: "#ef4444", boxShadow: "0 0 10px #ef4444" }} />
              <span className="text-xs text-white/70 tracking-[0.25em]">ERR</span>
            </div>
            {debugWarning && (
              <div className="mt-3 text-xs text-yellow-300">Warning: {debugWarning}</div>
            )}
          </div>
        </div>

        {/* Session History */}
        <div className="glass-panel relative p-5 md:p-6">
          <div className="absolute inset-0 scanline pointer-events-none" />
          <div className="mb-3 flex items-center justify-between">
            <h3 className="heading-font text-xs tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)]">
              SESSION HISTORY
            </h3>
            <button type="button" className="copy-btn" onClick={() => setHistory([])} title="Clear history">
              CLEAR
            </button>
          </div>
          <div className="space-y-3 max-h-[220px] overflow-auto custom-scroll">
            {history.length === 0 ? (
              <div className="text-sm text-white/60">No queries yet.</div>
            ) : (
              history.map((h, i) => (
                <div
                  key={i}
                  className="flex items-start justify-between gap-4 border border-white/10 rounded-md p-3 bg-white/5/5"
                >
                  <div className="min-w-0">
                    <div className="text-xs text-white/50 tracking-widest">{h.at}</div>
                    <div className="font-mono text-sm text-white/90 mt-1 break-words">{h.q}</div>
                    <div className="mt-1 text-xs text-white/60 tracking-widest">
                      COL: <span className="font-mono">{h.c}</span>
                    </div>
                  </div>
                  <div className="shrink-0">
                    <span className="record-badge">{typeof h.count === "number" ? `${h.count} REC` : "—"}</span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
      
        {/* LLM Debug Panel */}
        <div className="mt-6">
          <div className="glass-panel p-5 md:p-6">
            <h3 className="heading-font text-xs tracking-[0.35em] text-transparent bg-clip-text bg-gradient-to-r from-[var(--brand-cyan)] via-[var(--brand-purple)] to-[var(--brand-pink)] mb-3">
              LLM DEBUG
            </h3>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <div className="text-xs text-white/60">Original Text</div>
                <pre className="code-block-sci mt-2">{pretty(debugOriginal)}</pre>
              </div>
              <div>
                <div className="text-xs text-white/60">Tokens</div>
                <pre className="code-block-sci mt-2 max-h-40 overflow-auto">{pretty(debugTokens)}</pre>
              </div>
              <div>
                <div className="text-xs text-white/60">Raw Response</div>
                <pre className="code-block-sci mt-2 max-h-40 overflow-auto">{pretty(debugRaw)}</pre>
              </div>
              <div>
                <div className="text-xs text-white/60">Cleaned Output</div>
                <pre className="code-block-sci mt-2 max-h-40 overflow-auto">{pretty(debugClean)}</pre>
              </div>
              <div>
                <div className="text-xs text-white/60">Executed Filter</div>
                <pre className="code-block-sci mt-2 max-h-40 overflow-auto">{pretty(debugExecutedFilter)}</pre>
              </div>
              <div>
                <div className="text-xs text-white/60">Executed Options</div>
                <pre className="code-block-sci mt-2 max-h-40 overflow-auto">{pretty(debugExecutedOptions)}</pre>
              </div>
            </div>
            {debugError && (
              <div className="mt-3 hologram-error" role="alert">
                <strong>LLM Error:</strong>
                <div className="mt-1">{pretty(debugError)}</div>
              </div>
            )}
          </div>
        </div>
    </section>
  )
}
