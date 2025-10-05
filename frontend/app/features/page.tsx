import { NeoHeader } from "@/components/aether/neo-header"
import { AetherBackground } from "@/components/aether/background"

export default function FeaturesPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <AetherBackground />
      <div className="relative z-10 aether-bg text-foreground">
        <NeoHeader />
        <section className="mx-auto max-w-4xl p-6 md:p-10">
          <h2 className="heading-font text-3xl mb-4">Features</h2>
          <ul className="list-disc pl-5 text-white/80">
            <li>Natural language → MongoDB query generation</li>
            <li>Streaming-safe LLM parsing (NDJSON)</li>
            <li>Executed filter & options visibility</li>
            <li>Token breakdown for the input text</li>
            <li>Robust error and debug panes</li>
            <li>Case-insensitive matching (toggleable) — optional</li>
          </ul>
        </section>
      </div>
    </main>
  )
}
