import { spawnSync } from "node:child_process"
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync } from "node:fs"
import { tmpdir } from "node:os"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { planRepo, scaffoldRepo, type RepoSpec } from "../src/lib/scaffold.ts"
import { createWorktree } from "../src/lib/worktree.ts"
import { buildAboutArgs } from "../src/lib/about.ts"
import { buildProtectionPayload, buildRepoSettings } from "../src/lib/protection.ts"

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
    ".github/pull_request_template.md",
    "LICENSE",
    ".git/hooks/commit-msg",
  ]
  for (const file of files) {
    if (!existsSync(join(target, file))) throw new Error(`falta ${file}`)
  }

  const prTemplate = readFileSync(join(target, ".github/pull_request_template.md"), "utf8")
  if (!prTemplate.includes("## Co-autores")) throw new Error("PR template sin Co-autores")
  if (!prTemplate.includes("Co-authored-by")) throw new Error("PR template sin Co-authored-by")

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

  const payload = buildProtectionPayload({ approvals: 1 })
  const reviews = payload.required_pull_request_reviews as {
    required_approving_review_count: number
  }
  if (reviews.required_approving_review_count !== 1) {
    throw new Error("protection payload sin 1 approval")
  }
  if (payload.allow_force_pushes !== false || payload.allow_deletions !== false) {
    throw new Error("protection payload permite force push o borrado")
  }
  if (payload.required_linear_history !== true) {
    throw new Error("protection payload sin linear history")
  }

  const settings = buildRepoSettings()
  if (settings.allow_merge_commit !== false || settings.allow_rebase_merge !== false) {
    throw new Error("repo settings no es squash-only")
  }
  if (
    settings.squash_merge_commit_title !== "PR_TITLE" ||
    settings.squash_merge_commit_message !== "PR_BODY"
  ) {
    throw new Error("repo settings no usa PR title/body")
  }

  console.log("OK scaffold:", target)
  console.log("OK worktree:", worktree.directory, "->", worktree.branch)
  console.log("OK no-license:", noLicenseTarget)
  console.log("OK about args")
  console.log("OK protection")
  console.log(log.stdout.trim())
} finally {
  rmSync(root, { recursive: true, force: true })
}
