import { spawnSync } from "node:child_process"
import { existsSync } from "node:fs"
import { isAbsolute, join, resolve } from "node:path"

function run(cmd: string, args: string[], cwd: string): string {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim()
    throw new Error(`${cmd} ${args.join(" ")} falló (${result.status}): ${detail}`)
  }
  return result.stdout.trim()
}

function tryRun(cmd: string, args: string[], cwd: string): string | undefined {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (result.error) throw result.error
  return result.status === 0 ? result.stdout.trim() : undefined
}

export interface WorktreeInput {
  name: string
  branch?: string
  /** Base directory for the worktree. Defaults to the plugin's worktreeDirectory option. */
  dir?: string
  defaultDir: string
  baseDir: string
}

export interface WorktreeResult {
  directory: string
  branch: string
  repoRoot: string
  createdBranch: boolean
}

export function createWorktree(input: WorktreeInput): WorktreeResult {
  if (!/^[a-z0-9][a-z0-9._-]*$/.test(input.name)) {
    throw new Error("Nombre inválido. Usá minúsculas, números, '.', '_' o '-'.")
  }

  const repoRoot = tryRun("git", ["rev-parse", "--show-toplevel"], input.baseDir)
  if (!repoRoot) throw new Error("No estoy dentro de un repositorio git.")

  const base = input.dir ?? input.defaultDir
  const baseDir = isAbsolute(base) ? base : resolve(repoRoot, base)
  const target = join(baseDir, input.name)
  if (existsSync(target)) throw new Error(`Ya existe el worktree: ${target}`)

  const branch = input.branch ?? `feat/${input.name}`
  const branchExists = Boolean(
    tryRun("git", ["rev-parse", "--verify", `refs/heads/${branch}`], repoRoot),
  )

  if (branchExists) {
    run("git", ["worktree", "add", target, branch], repoRoot)
  } else {
    run("git", ["worktree", "add", "-b", branch, target, "HEAD"], repoRoot)
  }

  return { directory: target, branch, repoRoot, createdBranch: !branchExists }
}
