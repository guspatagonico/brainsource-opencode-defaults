import { spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

function tryRun(cmd: string, args: string[], cwd: string): string | undefined {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (result.error) throw result.error
  return result.status === 0 ? result.stdout.trim() : undefined
}

export interface HookInstallInput {
  baseDir: string
  source: string
  force?: boolean
}

export interface HookInstallResult {
  path: string
  hooksPath: string | null
}

export function installCommitHook(input: HookInstallInput): HookInstallResult {
  const repoRoot = tryRun("git", ["rev-parse", "--show-toplevel"], input.baseDir)
  if (!repoRoot) throw new Error("No estoy dentro de un repositorio git.")

  const configured = tryRun("git", ["config", "--get", "core.hooksPath"], repoRoot)
  let hooksDir: string
  if (configured) {
    hooksDir = isAbsolute(configured) ? configured : resolve(repoRoot, configured)
  } else {
    const gitPath = tryRun("git", ["rev-parse", "--git-path", "hooks"], repoRoot)
    if (!gitPath) throw new Error("No pude resolver el directorio de hooks.")
    hooksDir = isAbsolute(gitPath) ? gitPath : resolve(repoRoot, gitPath)
  }

  mkdirSync(hooksDir, { recursive: true })
  const target = join(hooksDir, "commit-msg")

  if (existsSync(target) && !input.force) {
    const current = readFileSync(target, "utf8")
    const next = readFileSync(input.source, "utf8")
    if (current !== next) {
      throw new Error(
        `Ya existe un hook distinto en ${target}. Usá force: true para reemplazarlo.`,
      )
    }
  }

  copyFileSync(input.source, target)
  chmodSync(target, 0o755)
  return { path: target, hooksPath: configured ?? null }
}
