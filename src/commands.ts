type CommandSpec = {
  name: string
  description: string
  template: string
}

const COMMANDS: CommandSpec[] = [
  {
    name: "new-repo",
    description: "Crear un repo GitHub con los defaults (privado, MIT, docs, gitignore)",
    template: [
      "Usá el tool `brainsource_new_repo` para crear el repositorio indicado abajo.",
      "Reglas: privado por defecto; público solo si el usuario lo pidió explícitamente; licencia MIT.",
      "Primero llamá al tool con `apply: false` (dry-run), mostrá el plan y esperá confirmación.",
      "Después llamá con `apply: true`. No crees el repo remoto ni hagas push sin aprobación explícita.",
    ].join("\n"),
  },
  {
    name: "release",
    description: "Preparar un release SemVer (bump, tag, push, GitHub Release)",
    template: [
      "Cargá la skill `semver-release-automation` y prepará un release para lo indicado abajo.",
      "Default dry-run: mostrá bump recomendado, versión siguiente, changelog y comandos exactos.",
      "No apliques ni pushees sin pedido explícito. Confirmá siempre un bump major.",
      "Si el usuario pide aplicar: bump + commit `chore(release): vX.Y.Z` + tag `vX.Y.Z`.",
    ].join("\n"),
  },
  {
    name: "docs-sync",
    description: "Auditar y actualizar README, AGENTS, ARCHITECTURE y docs/",
    template: [
      "Cargá la skill `project-docs` y auditá la documentación del proyecto actual.",
      "Revisá `README.md`, `AGENTS.md`, `ARCHITECTURE.md` y `docs/` (índice en `docs/README.md`).",
      "Reportá primero qué falta o está desactualizado; después actualizá, sin inventar.",
    ].join("\n"),
  },
  {
    name: "worktree",
    description: "Crear un worktree para una feature branch",
    template: [
      "Usá el tool `brainsource_worktree_create` para crear el worktree indicado abajo.",
      "Por defecto va a `.worktrees/<name>` (configurable con `dir`).",
      "No cambies la rama del checkout principal. Mostrá el path resultante.",
    ].join("\n"),
  },
  {
    name: "install-hooks",
    description: "Instalar el hook de Conventional Commits en el repo actual",
    template: [
      "Usá el tool `brainsource_install_commit_hook` en el repo actual.",
      "Si ya existe un hook distinto, mostralo y pedí confirmación antes de reemplazarlo (`force: true`).",
      "Si `core.hooksPath` está configurado, advertí que Git ignora `.git/hooks`.",
    ].join("\n"),
  },
]

export async function registerCommands(ctx: any): Promise<void> {
  await ctx.command.transform((editor: any) => {
    for (const command of COMMANDS) {
      editor.add({
        name: command.name,
        description: command.description,
        execute: async ({ sessionID, prompt, delivery }: any) => {
          const extra = typeof prompt?.text === "string" ? prompt.text.trim() : ""
          const text = [command.template, extra].filter(Boolean).join("\n\n")
          await ctx.session.prompt({ ...prompt, sessionID, text, delivery })
        },
      })
    }
  })
}
