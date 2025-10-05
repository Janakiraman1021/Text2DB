import { NeoHeader } from "@/components/aether/neo-header"
import { AetherBackground } from "@/components/aether/background"

export default function WorkingPage() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      <AetherBackground />
      <div className="relative z-10 aether-bg text-foreground">
        <NeoHeader />
        <section className="mx-auto max-w-4xl p-6 md:p-10">
          <h2 className="heading-font text-3xl mb-4">How it works</h2>
          <ol className="list-decimal pl-5 text-white/80 space-y-3">
            <li>
              User types a natural language query and collection name in the UI.
            </li>
            <li>
              Backend builds a strict JSON prompt and sends it to Ollama (LLM).
            </li>
            <li>
              Ollama may stream NDJSON chunks. The backend reconstructs the stream by concatenating the
              per-chunk "response" fields and then extracts the first JSON object from the reconstructed text.
            </li>
            <li>
              The backend normalizes wrapper shapes (e.g., <code>{`{"find":"users","filter":{...}}`}</code>) and executes the
              resulting Mongo filter with optional projection/limit/sort.
            </li>
            <li>
              The frontend displays the executed filter, options, raw LLM output, tokens, and results — allowing
              full visibility and debugging.
            </li>
          </ol>

          <h3 className="mt-6 text-xl">Developer notes</h3>
          <p className="text-white/80">
            The repo uses Next.js (app router) + Tailwind for the frontend and FastAPI for the backend. The
            LLM integration is configurable via `OLLAMA_API` for local Ollama instances.
          </p>
        </section>
      </div>
    </main>
  )
}
