import { Plugin } from "@opencode/plugin"
import { registerContextBudget } from "./src/register"

export default Plugin.define({
  id: "context-budget",
  setup: (ctx) => registerContextBudget(ctx),
})
