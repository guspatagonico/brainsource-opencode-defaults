import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { planRepo, scaffoldRepo, type RepoSpec } from "../src/lib/scaffold.ts"
import { createWorktree } from "../src/lib/worktree.ts"
import { buildAboutArgs } from "../src/lib/about.ts"

const here = dirname(fileURLToPath(import.meta.url))
const templatesDir = join(here, "..", "templates")
const root = mkdtempSync(join(tmpdir(), "brainsource-defaults-"))
const target = join(root, "demo-repo")

const spec: RepoSpec = {
  name: "demo-repo",
  target,
  visibility: "private",
  description: "Demo repo",
  license: "MIT",
  local: true,
  templatesDir,
  baseDir: root,
}

try {
  const plan = planRepo(spec)
  if (plan.fullName !== "demo-repo") throw new Error("fullName inesperado")
  if (plan.warnings.some((warning) => warning.includes("ya existe"))) {
    throw new Error("el plan no debería avisar que existe")
  }

  scaffoldRepo(spec)

  const files = [
    ".gitignore",
    "README.md",
    "AGENTS.md",
    "ARCHITECTURE.md",
    "docs/README.md",
    "LICENSE",
    ".git/hooks/commit-msg",
  ]
  for (const file of files) {
    if (!existsSync(join(target, file))) throw new Error(`falta ${file}`)
  }

  const readme = readFileSync(join(target, "README.md"), "utf8")
  if (!readme.includes("demo-repo")) throw new Error("README sin nombre del proyecto")
  if (!readme.includes("Demo repo")) throw new Error("README sin descripción")

  const mode = statSync(join(target, ".git/hooks/commit-msg")).mode
  if (!(mode & 0o111)) throw new Error("commit-msg no es ejecutable")

  const log = spawnSync("git", ["log", "--oneline"], { cwd: target, encoding: "utf8" })
  if (log.status !== 0 || !log.stdout.includes("chore: initial commit")) {
    throw new Error(`commit inicial ausente: ${log.stdout} ${log.stderr}`)
  }

  const worktree = createWorktree({
    name: "demo-feature",
    defaultDir: ".worktrees",
    baseDir: target,
  })
  if (!existsSync(worktree.directory)) throw new Error("worktree no creado")
  const branch = spawnSync("git", ["branch", "--show-current"], {
    cwd: worktree.directory,
    encoding: "utf8",
  })
  if (branch.stdout.trim() !== "feat/demo-feature") {
    throw new Error(`rama inesperada en el worktree: ${branch.stdout.trim()}`)
  }

  const noLicenseTarget = join(root, "no-license-repo")
  scaffoldRepo({ ...spec, name: "no-license-repo", target: noLicenseTarget, license: "none" })
  if (existsSync(join(noLicenseTarget, "LICENSE"))) {
    throw new Error("LICENSE no debería existir con license: none")
  }
  const noLicenseReadme = readFileSync(join(noLicenseTarget, "README.md"), "utf8")
  if (noLicenseReadme.includes("## Licencia")) {
    throw new Error("README sin licencia no debería tener sección Licencia")
  }

  const emptyPlan = planRepo({ ...spec, description: "", target: join(root, "empty-plan") })
  if (!emptyPlan.warnings.some((warning) => warning.toLowerCase().includes("descripción"))) {
    throw new Error("el plan sin descripción debería advertirlo")
  }

  let emptyThrew = false
  try {
    scaffoldRepo({ ...spec, description: "", target: join(root, "empty-desc") })
  } catch {
    emptyThrew = true
  }
  if (!emptyThrew) throw new Error("scaffoldRepo debería fallar sin descripción")
  if (existsSync(join(root, "empty-desc"))) {
    throw new Error("no debería crear el destino sin descripción")
  }

  const aboutArgs = buildAboutArgs("owner/repo", {
    description: "Demo",
    topics: ["opencode", "semver"],
    homepage: "https://example.com",
  })
  for (const expected of ["--description", "owner/repo", "--add-topic", "--homepage"]) {
    if (!aboutArgs.includes(expected)) throw new Error(`aboutArgs sin ${expected}`)
  }

  console.log("OK scaffold:", target)
  console.log("OK worktree:", worktree.directory, "->", worktree.branch)
  console.log("OK no-license:", noLicenseTarget)
  console.log("OK about args")
  console.log(log.stdout.trim())
} finally {
  rmSync(root, { recursive: true, force: true })
}
