import { appendFileSync, mkdirSync } from "node:fs"
import { homedir } from "node:os"
import { dirname, join } from "node:path"

/**
 * context-budget — hybrid compaction summaries + proactive compaction for OpenCode V2.
 *
 * 1) Compaction summary (hybrid):
 *    Facts are extracted deterministically from the provider-style transcript
 *    ([{ role, content }]); a short narrative is generated with the default
 *    model (or an override). If the model call fails, facts-only is used.
 *
 * 2) Proactive compaction:
 *    Before each user prompt is admitted, estimate the session context size and
 *    request a compaction when it crosses `proactiveThreshold` of the model's
 *    context limit. A per-session cooldown prevents repeating it.
 *
 * 3) Calibration log:
 *    On each user prompt, if the last assistant message has token usage, append
 *    one JSON line with the measured chars and the provider's real token counts.
 *    `calibrate.ts` turns that log into `charsPerToken` + `overheadTokens`.
 *
 * Estimation model:
 *    estimatedTokens = chars / charsPerToken + overheadTokens
 * where `chars` is `JSON.stringify(context())`. The overhead absorbs what is not
 * in the context messages (system prompt, tool schemas, framing).
 */

type Json = Record<string, any>

interface Options {
  maxFiles: number
  maxCommands: number
  maxErrors: number
  maxAssistantChars: number
  maxNarrativeChars: number
  proactive: boolean
  proactiveThreshold: number
  proactiveCooldownMs: number
  charsPerToken: number
  overheadTokens: number
  autoOverhead: boolean
  overheadSmoothing: number
  overheadMax: number
  calibrationLog: boolean | string
}

const DEFAULTS: Options = {
  maxFiles: 20,
  maxCommands: 12,
  maxErrors: 8,
  maxAssistantChars: 12_000,
  maxNarrativeChars: 1_200,
  proactive: true,
  proactiveThreshold: 0.65,
  proactiveCooldownMs: 120_000,
  charsPerToken: 4,
  overheadTokens: 0,
  autoOverhead: true,
  overheadSmoothing: 0.35,
  overheadMax: 200_000,
  calibrationLog: true,
}

const FILE_TOOLS = /edit|write|patch|multiedit/i
const SHELL_TOOLS = /bash|shell/i
const SHELL_CMD = /<shell\b[^>]*\bcommand="([^"]*)"/g

function oneLine(value: unknown, max = 220): string {
  const raw = typeof value === "string" ? value : JSON.stringify(value)
  const text = String(raw ?? "").replace(/\s+/g, " ").trim()
  return text.length > max ? `${text.slice(0, max)}…` : text
}

function clip(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max)}… [${text.length - max} chars trimmed]`
}

function textOf(content: unknown): string {
  if (typeof content === "string") return content
  if (!Array.isArray(content)) return ""
  return content
    .filter((part: Json) => part?.type === "text" && typeof part.text === "string")
    .map((part: Json) => part.text as string)
    .join("\n")
}

function collect(messages: Json[], options: Options) {
  const files = new Set<string>()
  const commands: string[] = []
  const errors: string[] = []
  const assistantText: string[] = []
  let goal = ""
  let lastAsk = ""

  const addTool = (name: unknown, rawInput: unknown) => {
    if (typeof name !== "string") return
    let input: Json = {}
    if (typeof rawInput === "string") {
      try {
        input = JSON.parse(rawInput)
      } catch {
        input = {}
      }
    } else if (rawInput && typeof rawInput === "object") {
      input = rawInput as Json
    }
    const file = input.filePath ?? input.file_path ?? input.path
    if (typeof file === "string" && FILE_TOOLS.test(name)) files.add(file)
    if (typeof input.command === "string" && SHELL_TOOLS.test(name)) commands.push(oneLine(input.command))
  }

  for (const message of messages) {
    const role = message?.role

    if (role === "user") {
      const text = textOf(message.content)
      // A previous compaction checkpoint is history, not the user's objective.
      if (/<conversation-checkpoint>|<summary>/i.test(text)) continue
      const isShell = /<shell\b/.test(text)
      if (isShell) {
        for (const match of text.matchAll(SHELL_CMD)) commands.push(oneLine(match[1]))
      } else if (text.trim()) {
        const line = oneLine(text)
        if (!goal) goal = line
        lastAsk = line
      }
      continue
    }

    if (role === "tool") {
      const text = textOf(message.content)
      if (/error|failed|exception|runtimeexception/i.test(text)) errors.push(oneLine(text))
      continue
    }

    if (role !== "assistant") continue

    if (Array.isArray(message.content)) {
      for (const part of message.content) {
        if (part?.type === "text" && typeof part.text === "string" && part.text.trim()) {
          assistantText.push(clip(part.text.trim(), 800))
          continue
        }
        // Provider-agnostic tool part shapes.
        addTool(part?.toolName ?? part?.name ?? part?.tool, part?.input ?? part?.args ?? part?.arguments)
        if (part?.isError === true || part?.status === "error" || part?.error) {
          const detail = part?.error?.message ?? part?.error ?? "tool error"
          errors.push(oneLine(detail))
        }
      }
    }

    // OpenAI-style tool calls.
    if (Array.isArray(message.tool_calls)) {
      for (const call of message.tool_calls) {
        addTool(call?.function?.name ?? call?.name, call?.function?.arguments ?? call?.args ?? call?.input)
      }
    }
  }

  return {
    goal,
    lastAsk,
    files: [...files].slice(0, options.maxFiles),
    commands: commands.slice(-options.maxCommands),
    errors: [...new Set(errors)].slice(0, options.maxErrors),
    assistantText,
  }
}

function buildPrompt(facts: ReturnType<typeof collect>, options: Options): string {
  return [
    "Resumí esta sesión de desarrollo para que otro agente pueda retomarla.",
    "Escribí 3 a 5 líneas en español, en prosa, cubriendo: estado actual, decisiones tomadas y próximo paso.",
    "No inventes datos que no aparezcan abajo. No uses listas largas.",
    "",
    `Objetivo: ${facts.goal || "(desconocido)"}`,
    `Archivos tocados: ${facts.files.join(", ") || "(ninguno)"}`,
    `Comandos: ${facts.commands.join(" | ") || "(ninguno)"}`,
    `Errores: ${facts.errors.join(" | ") || "(ninguno)"}`,
    "Últimos textos del asistente:",
    facts.assistantText.slice(-8).join("\n---\n").slice(0, options.maxAssistantChars),
  ].join("\n")
}

function render(facts: ReturnType<typeof collect>, narrative: string): string {
  const lines: string[] = []
  lines.push("## Objetivo", facts.goal || "(no capturado)")
  lines.push("", "## Archivos tocados")
  lines.push(...(facts.files.length ? facts.files.map((file) => `- ${file}`) : ["- (ninguno)"]))
  lines.push("", "## Comandos clave")
  lines.push(...(facts.commands.length ? facts.commands.map((cmd) => `- \`${cmd}\``) : ["- (ninguno)"]))
  lines.push("", "## Errores / bloqueos")
  lines.push(...(facts.errors.length ? facts.errors.map((err) => `- ${err}`) : ["- (ninguno)"]))
  if (narrative) lines.push("", "## Estado", narrative)
  lines.push("", "## Próximo pedido", facts.lastAsk || "(no capturado)")
  return lines.join("\n")
}

/** `ctx.session.context()` may return the array directly or wrapped as `{ data }`. */
function asMessages(value: unknown): Json[] {
  if (Array.isArray(value)) return value as Json[]
  const wrapper = value as Json
  if (Array.isArray(wrapper?.data)) return wrapper.data as Json[]
  if (Array.isArray(wrapper?.messages)) return wrapper.messages as Json[]
  return []
}

/** Token usage lives on the assistant message (top level), possibly nested. */
function tokenUsageOf(message: Json): Json | undefined {
  const candidates = [message?.tokens, message?.message?.tokens]
  if (Array.isArray(message?.parts)) candidates.push(message.parts.map?.((part: Json) => part?.tokens))
  for (const candidate of candidates) {
    if (Array.isArray(candidate)) {
      for (const entry of candidate) {
        if (entry && typeof entry.input === "number") return entry
      }
      continue
    }
    if (candidate && typeof candidate === "object" && typeof candidate.input === "number") return candidate
  }
  return undefined
}

function promptTokensOf(tokens: Json): number {
  return (
    Number(tokens.input ?? 0) + Number(tokens.cache?.read ?? 0) + Number(tokens.cache?.write ?? 0)
  )
}

function modelLabelOf(message: Json): string {
  const model = message?.model
  if (!model || typeof model !== "object") return ""
  const provider = model.providerID ?? ""
  const id = model.modelID ?? model.id ?? ""
  return provider && id ? `${provider}/${id}` : provider || id
}

function resolveLogPath(value: Options["calibrationLog"]): string | undefined {
  if (value === false) return undefined
  if (typeof value === "string" && value.trim()) {
    const raw = value.trim()
    return raw.startsWith("~") ? join(homedir(), raw.slice(1)) : raw
  }
  const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
  return join(dataHome, "opencode", "context-budget", "calibration.jsonl")
}

export async function registerContextBudget(
  ctx: any,
  overrides?: Record<string, any>,
): Promise<void> {
  const raw = { ...((ctx.options ?? {}) as Json), ...(overrides ?? {}) }
  const options: Options = { ...DEFAULTS, ...raw }

  // ── Narrative model: default model, or an explicit override ──
  let defaultModel: { providerID: string; id: string } | undefined
  let contextLimit = Number(raw.contextLimit ?? 0) || 0
    try {
      const selected: Json | undefined = await ctx.model.default()
      const info: Json | undefined = selected?.data ?? selected
      if (info?.providerID) {
        const id = info.modelID ?? info.id
        if (id) defaultModel = { providerID: info.providerID, id }
      }
      if (!contextLimit) contextLimit = Number(info?.limit?.context ?? 0)
    } catch {}

    const override = typeof raw.narrativeModel === "string" ? String(raw.narrativeModel) : ""
    const slash = override.indexOf("/")
    const overrideModel =
      slash > 0 ? { providerID: override.slice(0, slash), id: override.slice(slash + 1) } : undefined

    // ── Hybrid compaction summary ──
    await ctx.session.hook("compaction", async (event: any) => {
      const messages = Array.isArray(event.messages) ? (event.messages as Json[]) : []
      const facts = collect(messages, options)
      const model = overrideModel ?? defaultModel

      let narrative = ""
      if (model) {
        try {
          const result = await ctx.generate.text({ model, prompt: buildPrompt(facts, options) })
          narrative = clip(String(result?.text ?? "").trim(), options.maxNarrativeChars)
        } catch {
          narrative = "" // fall back to the deterministic summary
        }
      }

      event.result = { summary: render(facts, narrative) }
    })

    // ── Calibration log + per-session overhead ──
    let logPath = resolveLogPath(options.calibrationLog)
    if (logPath) {
      try {
        mkdirSync(dirname(logPath), { recursive: true })
      } catch {
        logPath = undefined // logging is best-effort
      }
    }

    const ratio = Math.max(options.charsPerToken, 0.5)
    const smoothing = Math.min(Math.max(options.overheadSmoothing, 0.05), 1)
    const overheadMax = Math.max(options.overheadMax, 0)
    const lastObserved = new Map<string, string>()
    const overheadBySession = new Map<string, number>()

    const clampOverhead = (value: number): number => Math.round(Math.min(Math.max(value, 0), overheadMax))
    const overheadFor = (sessionID: string): number =>
      overheadBySession.get(sessionID) ?? Math.max(options.overheadTokens, 0)

    type Observation = {
      message: Json
      charsBefore: number
      tokens: Json
      observedOverhead?: number
    }

    /** Measure the last completed step: real prompt tokens vs. chars of that prompt. */
    const observe = (sessionID: string, messages: Json[]): Observation | undefined => {
      let index = -1
      for (let i = messages.length - 1; i >= 0; i--) {
        if (messages[i]?.type === "assistant" && tokenUsageOf(messages[i])) {
          index = i
          break
        }
      }
      if (index < 0) return undefined

      const message = messages[index]
      const tokens = tokenUsageOf(message)!
      const signature = [
        message.id ?? "",
        tokens.input,
        tokens.output,
        tokens.cache?.read ?? 0,
        tokens.cache?.write ?? 0,
      ].join(":")

      // One observation per model step, even if several prompts see the same context.
      if (lastObserved.get(sessionID) === signature) return undefined
      lastObserved.set(sessionID, signature)

      // The prompt that produced this assistant message was built from
      // everything before it (system/tools are not in `context()`).
      const charsBefore = index > 0 ? JSON.stringify(messages.slice(0, index)).length : 0
      const promptTokens = promptTokensOf(tokens)

      let observedOverhead: number | undefined
      if (charsBefore > 0 && promptTokens > 0) {
        observedOverhead = promptTokens - charsBefore / ratio
        if (options.autoOverhead && Number.isFinite(observedOverhead)) {
          const current = overheadBySession.get(sessionID)
          const next =
            current === undefined ? observedOverhead : current + smoothing * (observedOverhead - current)
          overheadBySession.set(sessionID, clampOverhead(next))
        }
      }

      return { message, charsBefore, tokens, observedOverhead }
    }

    const logCalibration = (
      sessionID: string,
      chars: number,
      observation: Observation | undefined,
      overhead: number,
    ) => {
      if (!logPath || !observation) return

      const { message, charsBefore, tokens, observedOverhead } = observation
      const input = Number(tokens.input ?? 0)
      const cacheRead = Number(tokens.cache?.read ?? 0)
      const cacheWrite = Number(tokens.cache?.write ?? 0)

      try {
        appendFileSync(
          logPath,
          JSON.stringify({
            v: 1,
            ts: new Date().toISOString(),
            sessionID,
            model: modelLabelOf(message),
            agent: typeof message.agent === "string" ? message.agent : "",
            chars,
            charsBefore,
            input,
            cacheRead,
            cacheWrite,
            promptTokens: promptTokensOf(tokens),
            output: Number(tokens.output ?? 0),
            reasoning: Number(tokens.reasoning ?? 0),
            overheadObserved: observedOverhead === undefined ? null : Math.round(observedOverhead),
            overheadUsed: Math.round(overhead),
            estimated: Math.ceil(chars / ratio) + Math.round(overhead),
          }) + "\n",
        )
      } catch {
        // Logging must never break the prompt.
      }
    }

    // ── Proactive compaction (+ calibration) before a user prompt is admitted ──
    if (options.proactive || logPath) {
      const threshold = Math.min(Math.max(options.proactiveThreshold, 0), 0.95)
      const lastTrigger = new Map<string, number>()

      await ctx.session.hook("prompt", async (event: any) => {
        const sessionID = (event as Json).sessionID as string | undefined
        if (!sessionID) return

        let raw: unknown
        try {
          raw = await ctx.session.context({ sessionID })
        } catch {
          return
        }

        const messages = asMessages(raw)
        const chars = JSON.stringify(raw ?? []).length
        const observation = observe(sessionID, messages)
        const overhead = overheadFor(sessionID)
        logCalibration(sessionID, chars, observation, overhead)

        if (!options.proactive || contextLimit <= 0) return

        const now = Date.now()
        if (now - (lastTrigger.get(sessionID) ?? 0) < options.proactiveCooldownMs) return

        const estimated = Math.ceil(chars / ratio) + overhead
        if (estimated < contextLimit * threshold) return

        lastTrigger.set(sessionID, now)
        try {
          await ctx.session.compact({ sessionID, delivery: "queue" })
        } catch {
          // Compaction is best-effort; never block the prompt.
        }
      })
    }
}
