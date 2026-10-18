import { spawnSync } from "node:child_process"
import { chmodSync, copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type Visibility = "private" | "public"

export interface RepoSpec {
  name: string
  target: string
  visibility: Visibility
  description: string
  owner?: string
  license: "MIT" | "none"
  local: boolean
  templatesDir: string
  baseDir: string
}

export interface RepoPlan {
  fullName: string
  target: string
  files: string[]
  commands: string[]
  warnings: string[]
}

function run(
  cmd: string,
  args: string[],
  cwd: string,
  opts: { allowFail?: boolean } = {},
): string | undefined {
  const result = spawnSync(cmd, args, { cwd, encoding: "utf8" })
  if (result.error) throw result.error
  if (result.status !== 0) {
    if (opts.allowFail) return undefined
    const detail = (result.stderr || result.stdout || "").trim()
    throw new Error(`${cmd} ${args.join(" ")} falló (${result.status}): ${detail}`)
  }
  return result.stdout.trim()
}

function render(text: string, vars: Record<string, string>): string {
  return text.replace(/\{\{(\w+)\}\}/g, (_, key: string) => vars[key] ?? "")
}

export function fullNameOf(spec: Pick<RepoSpec, "name" | "owner">): string {
  return spec.owner ? `${spec.owner}/${spec.name}` : spec.name
}

export function planRepo(spec: RepoSpec): RepoPlan {
  const fullName = fullNameOf(spec)
  const files = [".gitignore", "README.md", "AGENTS.md", "ARCHITECTURE.md", "docs/README.md", ".github/pull_request_template.md"]
  if (spec.license === "MIT") files.push("LICENSE")
  files.push(".git/hooks/commit-msg")

  const commands = [
    "git init -b main",
    "git add -A",
    'git commit -m "chore: initial commit"',
  ]
  if (!spec.local) {
    commands.push(
      `gh repo create ${fullName} --${spec.visibility} --source=. --remote=origin --push --description ${JSON.stringify(spec.description)}`,
    )
  }

  const warnings: string[] = []
  if (existsSync(spec.target)) warnings.push(`El destino ya existe: ${spec.target}`)
  if (!spec.description.trim()) {
    warnings.push("Falta una descripción breve para el About de GitHub.")
  } else if (spec.description.length > 160) {
    warnings.push("La descripción supera 160 chars; considerá acortarla para el About.")
  }

  return { fullName, target: spec.target, files, commands, warnings }
}

export function scaffoldRepo(spec: RepoSpec): RepoPlan {
  const plan = planRepo(spec)
  const description = spec.description.trim()
  if (!description) {
    throw new Error("Falta una descripción breve para el About de GitHub.")
  }
  if (description.length > 350) {
    throw new Error("La descripción del About no puede superar 350 caracteres.")
  }
  if (existsSync(spec.target)) throw new Error(`Ya existe el destino: ${spec.target}`)

  const email = run("git", ["config", "user.email"], spec.baseDir, { allowFail: true })
  const userName = run("git", ["config", "user.name"], spec.baseDir, { allowFail: true })
  if (!email || !userName) {
    throw new Error("Configurá git user.name y user.email antes de crear el commit inicial.")
  }

  if (!spec.local) {
    if (!run("gh", ["auth", "status"], spec.baseDir, { allowFail: true })) {
      throw new Error("gh no está autenticado. Corré: gh auth login")
    }
    if (run("gh", ["repo", "view", plan.fullName], spec.baseDir, { allowFail: true })) {
      throw new Error(`El repo ya existe en GitHub: ${plan.fullName}`)
    }
  }

  mkdirSync(spec.target, { recursive: true })

  copyFileSync(join(spec.templatesDir, "gitignore"), join(spec.target, ".gitignore"))
  const vars = { PROJECT: spec.name, DESCRIPTION: spec.description || spec.name }
  for (const file of ["README.md", "AGENTS.md", "ARCHITECTURE.md"]) {
    let content = render(readFileSync(join(spec.templatesDir, file), "utf8"), vars)
    if (file === "README.md" && spec.license === "none") {
      content = content.replace(/\n## Licencia[\s\S]*$/, "\n")
    }
    writeFileSync(join(spec.target, file), content)
  }
  mkdirSync(join(spec.target, "docs"), { recursive: true })
  writeFileSync(
    join(spec.target, "docs", "README.md"),
    render(readFileSync(join(spec.templatesDir, "docs", "README.md"), "utf8"), vars),
  )
  mkdirSync(join(spec.target, ".github"), { recursive: true })
  copyFileSync(
    join(spec.templatesDir, "PULL_REQUEST_TEMPLATE.md"),
    join(spec.target, ".github", "pull_request_template.md"),
  )

  if (spec.license === "MIT") {
    writeFileSync(
      join(spec.target, "LICENSE"),
      render(readFileSync(join(spec.templatesDir, "LICENSE-MIT"), "utf8"), {
        YEAR: String(new Date().getFullYear()),
        AUTHOR: userName,
      }),
    )
  }

  run("git", ["init", "-b", "main"], spec.target)
  mkdirSync(join(spec.target, ".git", "hooks"), { recursive: true })
  copyFileSync(
    join(spec.templatesDir, "commit-msg"),
    join(spec.target, ".git", "hooks", "commit-msg"),
  )
  chmodSync(join(spec.target, ".git", "hooks", "commit-msg"), 0o755)

  const hooksPath = run("git", ["config", "--get", "core.hooksPath"], spec.target, {
    allowFail: true,
  })
  if (hooksPath) {
    plan.warnings.push(`core.hooksPath=${hooksPath}: el hook en .git/hooks podría no ejecutarse.`)
  }

  run("git", ["add", "-A"], spec.target)
  run("git", ["commit", "-m", "chore: initial commit"], spec.target)

  if (!spec.local) {
    run(
      "gh",
      [
        "repo",
        "create",
        plan.fullName,
        `--${spec.visibility}`,
        "--source=.",
        "--remote=origin",
        "--push",
        "--description",
        description,
      ],
      spec.target,
    )
  }

  return plan
}
