import { NeoHeader } from "@/components/aether/neo-header"
import { AetherBackground } from "@/components/aether/background"

export default function AboutPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <AetherBackground />
      <div className="relative z-10 aether-bg text-foreground">
        <NeoHeader />
        <section className="mx-auto max-w-4xl p-6 md:p-10">
          <h2 className="heading-font text-3xl mb-4">About Text2DB</h2>
          <p className="text-white/80 leading-relaxed">
            Text2DB (t2d) converts natural language into MongoDB queries using a local LLM via Ollama, and
            executes the generated queries against a MongoDB instance. The UI is designed to give visibility into
            every step: tokens, raw model output, cleaned JSON, executed filter, and results.
          </p>

          <h3 className="mt-6 text-xl">Design philosophy</h3>
          <p className="text-white/80 leading-relaxed">
            Provide developers a transparent, auditable, and fast way to build queries using natural language while
            surfacing everything the model did to avoid silent mistakes.
          </p>
        </section>
      </div>
    </main>
  )
}
