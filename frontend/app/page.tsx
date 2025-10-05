import { NeoHeader } from "@/components/aether/neo-header"
import { AetherBackground } from "@/components/aether/background"
import { QueryConsole } from "@/components/aether/query-console"

export default function Page() {
  return (
    <main className="relative min-h-dvh overflow-hidden">
      {/* Ambient cinematic background */}
      <AetherBackground />
      {/* Foreground glass UI */}
      <div className="relative z-10 aether-bg text-foreground">
        <NeoHeader />
        <QueryConsole />
        {/* Home contains only the query console; About/Features/Working are separate pages */}
      </div>
    </main>
  )
}
