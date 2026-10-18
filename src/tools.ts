import { isAbsolute, join, resolve } from "node:path"
import { ROOT } from "./paths"
import { planRepo, scaffoldRepo, type RepoSpec } from "./lib/scaffold"
import { createWorktree } from "./lib/worktree"
import { installCommitHook } from "./lib/hooks"
import { setRepoAbout } from "./lib/about"

function formatPlan(plan: ReturnType<typeof planRepo>, spec: RepoSpec): string {
  const lines = [
    "Plan (dry-run) — todavía no se creó nada",
    `  repo:     ${plan.fullName} (${spec.visibility})`,
    `  destino:  ${plan.target}`,
    `  descripción: ${spec.description || "(falta)"}`,
    `  licencia: ${spec.license}`,
    `  archivos: ${plan.files.join(" ")}`,
    "  comandos:",
    ...plan.commands.map((command) => `    - ${command}`),
  ]
  if (plan.warnings.length) {
    lines.push("  advertencias:", ...plan.warnings.map((warning) => `    - ${warning}`))
  }
  lines.push("", "Aplicá con apply: true.")
  return lines.join("\n")
}

export async function registerTools(ctx: any, options: Record<string, any>): Promise<void> {
  const templatesDir = join(ROOT, "templates")
  const hookSource = join(templatesDir, "commit-msg")
  const baseDir = ctx.location?.directory ?? process.cwd()
  const defaultWorktreeDir =
    typeof options.worktreeDirectory === "string" && options.worktreeDirectory.trim()
      ? options.worktreeDirectory
      : ".worktrees"

  await ctx.tool.transform((editor: any) => {
    editor.add({
      name: "brainsource_new_repo",
      description:
        "Create a GitHub repository with a required brief About description, private-by-default visibility, MIT license, a safe .gitignore, docs scaffolding, and a Conventional Commits hook. Dry-run by default; set apply=true to execute.",
      input: {
        type: "object",
        properties: {
          name: { type: "string", description: "Repo name (kebab-case)." },
          public: {
            type: "boolean",
            description: "Create a public repo. Default false (private).",
          },
          description: {
            type: "string",
            description:
              "Brief About description (<=160 chars recommended, max 350). Required.",
          },
          owner: {
            type: "string",
            description: "GitHub user or org. Default: authenticated account.",
          },
          dir: {
            type: "string",
            description: "Target directory. Default: <workspace>/<name>.",
          },
          license: {
            type: "string",
            enum: ["MIT", "none"],
            description: "License. Default MIT.",
          },
          local: {
            type: "boolean",
            description: "Scaffold locally only, without creating the GitHub repo.",
          },
          apply: {
            type: "boolean",
            description: "Execute. Default false (dry-run).",
          },
        },
        required: ["name", "description"],
        additionalProperties: false,
      },
      execute: async (input: any, context: any) => {
        const description = String(input.description ?? "").trim()
        if (!description) {
          throw new Error(
            "Falta una descripción breve para el About de GitHub. Proponé una (<=160 chars) y confirmala.",
          )
        }

        if (!/^[a-z0-9][a-z0-9._-]*$/.test(String(input.name ?? ""))) {
          throw new Error("Nombre inválido. Usá minúsculas, números, '.', '_' o '-'.")
        }

        const target = input.dir
          ? isAbsolute(input.dir)
            ? input.dir
            : resolve(baseDir, input.dir)
          : join(baseDir, input.name)

        const spec: RepoSpec = {
          name: input.name,
          target,
          visibility: input.public === true ? "public" : "private",
          description,
          owner: input.owner || undefined,
          license: input.license === "none" ? "none" : "MIT",
          local: input.local === true,
          templatesDir,
          baseDir,
        }

        const plan = planRepo(spec)
        if (input.apply !== true) {
          return { content: formatPlan(plan, spec) }
        }

        if (!spec.local) {
          await ctx.permission.assert({
            sessionID: context.sessionID,
            ...(context.agent ? { agent: context.agent } : {}),
            source: { type: "tool", messageID: context.messageID, id: context.id },
            action: "repo.create",
            resources: [plan.fullName],
            save: [plan.fullName],
          })
        }

        const result = scaffoldRepo(spec)
        const details = [
          `✔ Repo ${result.fullName} creado en ${result.target}`,
          `  visibilidad: ${spec.visibility}`,
          `  licencia:    ${spec.license}`,
          `  commit:      chore: initial commit`,
          spec.local ? "  remoto:      (local, sin GitHub)" : `  remoto:      ${result.fullName}`,
        ]
        if (result.warnings.length) {
          details.push("", "Advertencias:", ...result.warnings.map((warning) => `- ${warning}`))
        }
        return { content: details.join("\n") }
      },
    })

    editor.add({
      name: "brainsource_install_commit_hook",
      description:
        "Install the Conventional Commits commit-msg hook in the current repository. Refuses to overwrite a different hook unless force=true.",
      input: {
        type: "object",
        properties: {
          force: {
            type: "boolean",
            description: "Overwrite an existing different commit-msg hook.",
          },
        },
        additionalProperties: false,
      },
      execute: async (input: any) => {
        const result = installCommitHook({
          baseDir,
          source: hookSource,
          force: input.force === true,
        })
        const note = result.hooksPath
          ? `\n  core.hooksPath=${result.hooksPath} (se instaló ahí)`
          : ""
        return { content: `✔ Hook instalado en ${result.path}${note}` }
      },
    })

    editor.add({
      name: "brainsource_worktree_create",
      description:
        "Create a git worktree for a feature branch. Defaults to <repo>/.worktrees/<name>; override with dir or the plugin's worktreeDirectory option.",
      input: {
        type: "object",
        properties: {
          name: { type: "string", description: "Worktree name (kebab-case)." },
          branch: {
            type: "string",
            description: "Branch name. Default: feat/<name>.",
          },
          dir: {
            type: "string",
            description:
              "Base directory for the worktree. Default: .worktrees (or worktreeDirectory option).",
          },
        },
        required: ["name"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        const result = createWorktree({
          name: input.name,
          branch: input.branch,
          dir: input.dir,
          defaultDir: defaultWorktreeDir,
          baseDir,
        })
        return {
          content: [
            `✔ Worktree creado en ${result.directory}`,
            `  rama: ${result.branch} (${result.createdBranch ? "nueva" : "existente"})`,
            `  repo: ${result.repoRoot}`,
          ].join("\n"),
        }
      },
    })

    editor.add({
      name: "brainsource_set_repo_about",
      description:
        "Set or update the GitHub repository About description (and optional topics/homepage). Use it when a repo has no description or it is stale. Detects the current repo when repo is omitted.",
      input: {
        type: "object",
        properties: {
          description: {
            type: "string",
            description: "Brief About description (<=160 chars recommended, max 350).",
          },
          repo: { type: "string", description: "owner/name. Default: current repo." },
          topics: {
            type: "array",
            items: { type: "string" },
            description: "Topics to add.",
          },
          homepage: { type: "string", description: "Homepage URL." },
        },
        required: ["description"],
        additionalProperties: false,
      },
      execute: async (input: any) => {
        const result = setRepoAbout({
          description: input.description,
          repo: input.repo,
          topics: input.topics,
          homepage: input.homepage,
          baseDir,
        })
        const extras = [
          result.topics.length ? `  topics: ${result.topics.join(", ")}` : "",
          result.homepage ? `  homepage: ${result.homepage}` : "",
        ].filter(Boolean)
        return {
          content: [
            `✔ About actualizado en ${result.repo}`,
            `  descripción: ${result.description}`,
            ...extras,
          ].join("\n"),
        }
      },
    })
  })
}
