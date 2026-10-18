/**
 * Calibra `charsPerToken` y `overheadTokens` del plugin context-budget.
 *
 * Lee el log JSONL que escribe el plugin y compara:
 *   charsBefore  = tamaño (en caracteres) del contexto que produjo un paso
 *   promptTokens = tokens reales que el proveedor reportó para ese paso
 *
 * Modelo de estimación:
 *   estimatedTokens = chars / charsPerToken + overheadTokens
 *
 * Uso:
 *   node --experimental-strip-types calibrate.ts
 *   node --experimental-strip-types calibrate.ts --write
 *   node --experimental-strip-types calibrate.ts --agent build --provider deepseek --model deepseek-flash
 *   node --experimental-strip-types calibrate.ts --log /ruta/calibration.jsonl --json
 *
 * Opciones:
 *   --write            aplica el resultado a opencode.json (hace backup)
 *   --json             salida machine-readable
 *   --log <ruta>       log del plugin (default: ~/.local/share/opencode/context-budget/calibration.jsonl)
 *   --config <ruta>    opencode.json (default: ~/.config/opencode/opencode.json)
 *   --provider <id>    filtra por proveedor (ej. deepseek)
 *   --model <id>       filtra por modelo (ej. deepseek-flash)
 *   --agent <id>       filtra por agente (ej. build)
 *   --prompt-mode <m>  sum (default: input + cache.read + cache.write) | input (solo input)
 *   --min-samples <n>  mínimo de muestras (default: 5)
 *   --min-chars <n>    chars del contexto más grande (default: 200000)
 *   --min-span <n>     relación max/min de chars (default: 10)
 *   --force            aplica aunque no haya datos suficientes
 */

import { existsSync, readFileSync, writeFileSync } from "node:fs"
import { homedir } from "node:os"
import { join } from "node:path"

type Row = {
  v?: number
  ts?: string
  sessionID?: string
  model?: string
  agent?: string
  chars?: number
  charsBefore?: number
  input?: number
  cacheRead?: number
  cacheWrite?: number
  promptTokens?: number
  output?: number
  reasoning?: number
}

type Point = { chars: number; tokens: number }

type Args = {
  write: boolean
  json: boolean
  force: boolean
  log: string
  config: string
  provider: string
  model: string
  agent: string
  promptMode: "sum" | "input"
  minSamples: number
  minChars: number
  minSpan: number
}

const dataHome = process.env.XDG_DATA_HOME || join(homedir(), ".local", "share")
const configHome = process.env.XDG_CONFIG_HOME || join(homedir(), ".config")

const DEFAULTS = {
  log: join(dataHome, "opencode", "context-budget", "calibration.jsonl"),
  config: join(configHome, "opencode", "opencode.json"),
  pluginPath: join(configHome, "opencode", "plugins", "context-budget"),
}

const HELP = `Calibra charsPerToken y overheadTokens del plugin context-budget.

Uso:
  node --experimental-strip-types calibrate.ts [opciones]

Opciones:
  --write            aplica el resultado a opencode.json (hace backup)
  --json             salida machine-readable
  --force            aplica aunque no haya datos suficientes
  --log <ruta>       log del plugin (default: ${DEFAULTS.log})
  --config <ruta>    opencode.json (default: ${DEFAULTS.config})
  --provider <id>    filtra por proveedor (ej. deepseek)
  --model <id>       filtra por modelo (ej. deepseek-flash)
  --agent <id>       filtra por agente (ej. build)
  --prompt-mode <m>  sum (default) | input
  --min-samples <n>  mínimo de muestras (default: 5)
  --min-chars <n>    chars del contexto más grande (default: 200000)
  --min-span <n>     relación max/min de chars (default: 10)
  --help             esta ayuda
`

function parseArgs(argv: string[]): Args {
  const args: Args = {
    write: false,
    json: false,
    force: false,
    log: DEFAULTS.log,
    config: DEFAULTS.config,
    provider: "",
    model: "",
    agent: "",
    promptMode: "sum",
    minSamples: 5,
    minChars: 200_000,
    minSpan: 10,
  }

  for (let i = 0; i < argv.length; i++) {
    const raw = argv[i]
    if (!raw.startsWith("--")) continue
    const eq = raw.indexOf("=")
    const key = eq >= 0 ? raw.slice(2, eq) : raw.slice(2)
    const take = () => (eq >= 0 ? raw.slice(eq + 1) : argv[++i])

    switch (key) {
      case "write":
        args.write = true
        break
      case "json":
        args.json = true
        break
      case "force":
        args.force = true
        break
      case "log":
        args.log = take()
        break
      case "config":
        args.config = take()
        break
      case "provider":
        args.provider = take()
        break
      case "model":
        args.model = take()
        break
      case "agent":
        args.agent = take()
        break
      case "prompt-mode": {
        const value = take()
        if (value === "input" || value === "sum") args.promptMode = value
        break
      }
      case "min-samples":
        args.minSamples = Math.max(1, Number(take()) || 5)
        break
      case "min-chars":
        args.minChars = Math.max(0, Number(take()) || 200_000)
        break
      case "min-span":
        args.minSpan = Math.max(1, Number(take()) || 10)
        break
      case "help":
        console.log(HELP)
        process.exit(0)
    }
  }

  return args
}

function readRows(path: string): Row[] {
  if (!existsSync(path)) return []
  const rows: Row[] = []
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const text = line.trim()
    if (!text) continue
    try {
      rows.push(JSON.parse(text) as Row)
    } catch {
      // ignore corrupted lines
    }
  }
  return rows
}

const mean = (values: number[]): number => values.reduce((sum, value) => sum + value, 0) / (values.length || 1)

const median = (values: number[]): number => {
  if (!values.length) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const mid = Math.floor(sorted.length / 2)
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2
}

const round = (value: number, digits = 2): number => Number(value.toFixed(digits))
const fmt = (value: number): string => Math.round(value).toLocaleString("es")

/** Least squares: tokens = slope * chars + intercept  →  chars/token = 1/slope, overhead = intercept */
function linearFit(points: Point[]): { charsPerToken: number; overheadTokens: number } | undefined {
  const mx = mean(points.map((point) => point.chars))
  const my = mean(points.map((point) => point.tokens))
  let sxx = 0
  let sxy = 0
  for (const point of points) {
    sxx += (point.chars - mx) ** 2
    sxy += (point.chars - mx) * (point.tokens - my)
  }
  if (sxx <= 0) return undefined
  const slope = sxy / sxx
  if (!(slope > 0)) return undefined
  return { charsPerToken: 1 / slope, overheadTokens: Math.max(0, Math.round(my - slope * mx)) }
}

function mape(points: Point[], estimate: (chars: number) => number): number {
  return median(points.map((point) => Math.abs(estimate(point.chars) - point.tokens) / point.tokens)) * 100
}

function applyToConfig(path: string, recommended: { charsPerToken: number; overheadTokens: number }): void {
  const raw = readFileSync(path, "utf8")
  const config = JSON.parse(raw) as Record<string, any>
  const plugins: any[] = Array.isArray(config.plugins) ? config.plugins : []

  let index = plugins.findIndex((entry) => {
    const name = typeof entry === "string" ? entry : String(entry?.package ?? "")
    return name.includes("context-budget")
  })

  if (index < 0) {
    plugins.push({ package: DEFAULTS.pluginPath, options: {} })
    index = plugins.length - 1
  }

  if (typeof plugins[index] === "string") {
    plugins[index] = { package: plugins[index], options: {} }
  }
  if (!plugins[index].options || typeof plugins[index].options !== "object") {
    plugins[index].options = {}
  }

  const before = {
    charsPerToken: plugins[index].options.charsPerToken,
    overheadTokens: plugins[index].options.overheadTokens,
  }

  plugins[index].options.charsPerToken = recommended.charsPerToken
  plugins[index].options.overheadTokens = recommended.overheadTokens
  config.plugins = plugins

  writeFileSync(`${path}.bak-${Date.now()}`, raw)
  writeFileSync(path, `${JSON.stringify(config, null, 2)}\n`)

  console.log("")
  console.log(`Config: ${path}`)
  console.log(`  antes:  charsPerToken=${before.charsPerToken ?? "(default 4)"}  overheadTokens=${before.overheadTokens ?? "(default 0)"}`)
  console.log(`  ahora:  charsPerToken=${recommended.charsPerToken}  overheadTokens=${recommended.overheadTokens}`)
  console.log(`  backup: ${path}.bak-*`)
  console.log("  aplicá los cambios con: opencode reload")
}

function main(): void {
  const args = parseArgs(process.argv.slice(2))
  const all = readRows(args.log)

  let rows = all
  if (args.provider) {
    rows = rows.filter((row) => String(row.model ?? "").split("/")[0] === args.provider)
  }
  if (args.model) {
    rows = rows.filter((row) => {
      const label = String(row.model ?? "")
      return label === args.model || label.split("/")[1] === args.model
    })
  }
  if (args.agent) {
    rows = rows.filter((row) => String(row.agent ?? "") === args.agent)
  }

  const points: Point[] = rows
    .map((row) => ({
      chars: Number(row.charsBefore ?? 0),
      tokens: args.promptMode === "input" ? Number(row.input ?? 0) : Number(row.promptTokens ?? 0),
    }))
    .filter((point) => point.chars > 0 && point.tokens > 0)

  const models = [...new Set(rows.map((row) => row.model).filter(Boolean))] as string[]
  const agents = [...new Set(rows.map((row) => row.agent).filter(Boolean))] as string[]

  if (!points.length) {
    console.log(`Sin muestras utilizables en ${args.log}`)
    console.log("Generá actividad con el plugin habilitado (varias respuestas del asistente) y volvé a intentar.")
    if (all.length) console.log(`Hay ${all.length} líneas en el log, pero ninguna con charsBefore/promptTokens válidos.`)
    process.exit(all.length ? 1 : 0)
  }

  const chars = points.map((point) => point.chars)
  const tokens = points.map((point) => point.tokens)
  const maxChars = Math.max(...chars)
  const minChars = Math.min(...chars)
  const span = maxChars / Math.max(minChars, 1)

  const ratios = points.map((point) => point.chars / point.tokens)
  const medianRatio = median(ratios)
  const fit = linearFit(points)
  const fitSane = Boolean(fit) && fit!.charsPerToken >= 1.5 && fit!.charsPerToken <= 12

  const reasons: string[] = []
  if (points.length < args.minSamples) reasons.push(`${points.length} muestras < ${args.minSamples}`)
  if (maxChars < args.minChars) reasons.push(`contexto máximo ${fmt(maxChars)} chars < ${fmt(args.minChars)}`)
  if (span < args.minSpan) reasons.push(`rango ${round(span, 1)}× < ${args.minSpan}×`)
  if (models.length > 1) reasons.push(`hay ${models.length} modelos; filtrá con --provider/--model`)
  if (agents.length > 1) reasons.push(`hay ${agents.length} agentes; filtrá con --agent`)
  if (fit && !fitSane) reasons.push(`ratio ajustado ${round(fit.charsPerToken)} fuera de [1.5, 12]`)

  const sufficient = args.force || reasons.length === 0
  const recommended = sufficient
    ? fitSane
      ? { charsPerToken: round(fit!.charsPerToken), overheadTokens: fit!.overheadTokens, method: "fit" as const }
      : { charsPerToken: round(medianRatio), overheadTokens: 0, method: "median" as const }
    : null

  const errorMedian = mape(points, (value) => value / medianRatio)
  const errorFit = fit ? mape(points, (value) => value / fit.charsPerToken + fit.overheadTokens) : undefined

  if (args.json) {
    console.log(
      JSON.stringify(
        {
          log: args.log,
          lines: all.length,
          samples: points.length,
          models,
          agents,
          promptMode: args.promptMode,
          ranges: { chars: [minChars, maxChars], tokens: [Math.min(...tokens), Math.max(...tokens)], span },
          median: { charsPerToken: round(medianRatio), errorPct: round(errorMedian) },
          fit: fit
            ? { charsPerToken: round(fit.charsPerToken), overheadTokens: fit.overheadTokens, errorPct: round(errorFit ?? 0), sane: fitSane }
            : null,
          sufficient,
          reasons,
          recommended,
        },
        null,
        2,
      ),
    )
  } else {
    console.log("Context-budget — calibración")
    console.log(`Log: ${args.log}`)
    console.log(`Muestras: ${points.length} / ${all.length} líneas`)
    console.log(`Modelos: ${models.length ? models.join(", ") : "(sin dato)"}`)
    console.log(`Agentes: ${agents.length ? agents.join(", ") : "(sin dato)"}`)
    console.log(`Rango: ${fmt(minChars)}–${fmt(maxChars)} chars (${round(span, 1)}×) · ${fmt(Math.min(...tokens))}–${fmt(Math.max(...tokens))} tokens`)
    console.log("")
    console.log(`Mediana (chars/token): ${round(medianRatio)}   error mediano: ${round(errorMedian, 1)}%`)
    if (fit) {
      const sane = fitSane ? "" : "  ⚠ fuera de rango"
      console.log(
        `Ajuste lineal:         ${round(fit.charsPerToken)} + ${fmt(fit.overheadTokens)} tokens   error mediano: ${round(errorFit ?? 0, 1)}%${sane}`,
      )
    } else {
      console.log("Ajuste lineal:         (no aplicable: hace falta variación en chars)")
    }
    console.log("")

    if (recommended) {
      console.log(`Recomendado (${recommended.method}): ${JSON.stringify({ charsPerToken: recommended.charsPerToken, overheadTokens: recommended.overheadTokens })}`)
    } else {
      console.log("⚠ Datos insuficientes para calibrar:")
      for (const reason of reasons) console.log(`  - ${reason}`)
      console.log("  Seguí usando los valores actuales, o forzá con --force (no recomendado).")
    }

    if (args.promptMode === "sum") {
      console.log("")
      console.log("Nota: prompt-mode=sum asume input + cache.read + cache.write (DeepSeek/Anthropic).")
      console.log("      Si tu proveedor ya incluye el cache dentro de input, usá --prompt-mode input.")
    }
  }

  if (args.write) {
    if (!recommended) {
      console.error("\nNo se aplicó nada: hacen falta más datos (o --force).")
      process.exit(2)
    }
    applyToConfig(args.config, recommended)
  }
}

main()
