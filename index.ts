import { Plugin } from "@opencode/plugin"
import { registerContextBudget } from "./packages/context-budget/src/register"
import { registerRules } from "./src/rules"
import { registerSkills } from "./src/skills"
import { registerCommands } from "./src/commands"
import { registerTools } from "./src/tools"

export default Plugin.define({
  id: "brainsource.defaults",
  async setup(ctx) {
    const options = (((ctx as any).options ?? {}) as Record<string, any>)

    if (options.contextBudget !== false) {
      await registerContextBudget(
        ctx,
        (options.contextBudget ?? {}) as Record<string, any>,
      )
    }
    if (options.rules !== false) await registerRules(ctx)
    if (options.skills !== false) await registerSkills(ctx)
    if (options.commands !== false) await registerCommands(ctx)
    if (options.tools !== false) await registerTools(ctx, options)
  },
})
