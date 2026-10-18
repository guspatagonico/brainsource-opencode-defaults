import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./paths"

/**
 * Inject the team defaults into every agent-loop model request.
 * Project AGENTS.md files still apply; these are the baseline.
 */
export async function registerRules(ctx: any): Promise<void> {
  let text: string
  try {
    text = readFileSync(join(ROOT, "rules.md"), "utf8")
  } catch (error) {
    console.error("[brainsource] no se pudo leer rules.md:", error)
    return
  }

  const rules = `# Brainsource defaults (team)\n\n${text}`
  await ctx.session.hook("context", (event: any) => {
    event.system.push({ type: "text", text: rules })
  })
}
