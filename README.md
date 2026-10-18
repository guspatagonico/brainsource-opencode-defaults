# brainsource-opencode-defaults

Defaults globales de Brainsource para **OpenCode V2**: reglas de equipo, scaffolding
de repos, documentación, worktrees, releases SemVer y context budgeting — todo en un
plugin que se instala una vez y se comparte desde GitHub.

## Qué incluye

- **Reglas globales** inyectadas en cada request con el hook `context`
  (`rules.md`).
- **Skills**: `new-repo`, `project-docs`, `semver-release-automation`, `pull-request`.
- **Commands**: `/new-repo`, `/release`, `/docs-sync`, `/worktree`, `/install-hooks`,
  `/repo-about`, `/pr`.
- **Tools**:
  - `brainsource_new_repo`
  - `brainsource_install_commit_hook`
  - `brainsource_worktree_create`
  - `brainsource_set_repo_about`
  - `brainsource_protect_main`
- **Context budget** (subpaquete `packages/context-budget`): resumen híbrido de
  compactación + compactación proactiva + log de calibración.
- **Templates**: `.gitignore`, `README.md`, `AGENTS.md`, `ARCHITECTURE.md`,
  `docs/README.md`, `LICENSE-MIT`, hook `commit-msg`.

## GitHub About

Todo repo creado o adoptado debe tener una **descripción breve** en el About de GitHub.
`brainsource_new_repo` la exige (≤160 chars recomendados) y `brainsource_set_repo_about`
la actualiza en repos existentes. La regla inyectada también le indica al agente
agregarla o corregirla **proactivamente** cuando falte o esté desactualizada.

## Pull Requests y merge

- `main` solo se actualiza por **PR**; nunca push directo.
- **Squash-only**: el título del PR es el commit en `main` y el body del PR es el body
  del commit.
- PR notes obligatorias con `.github/pull_request_template.md`.
- Co-autores: el autor del PR es el autor principal; los demás van como
  `Co-authored-by` en el body. La skill `/pr` los genera desde los commits de la branch.
- `brainsource_protect_main` configura PR obligatorio, 1 aprobación, linear history,
  sin force push ni borrado, y squash-only con PR title/body.
- `new_repo` aplica esa protección por defecto (`protectMain: true`).
- CI: los checks requeridos se configuran en branch protection cuando exista CI. No se
  scaffoldea un workflow genérico porque el stack varía por proyecto.

## Instalación

```bash
opencode plugin add github:guspatagonico/brainsource-opencode-defaults#main
opencode plugin list
```

El comando instala el plugin **globalmente**. Para fijar una versión o un commit:

```bash
opencode plugin add github:guspatagonico/brainsource-opencode-defaults#v0.1.0
opencode plugin add github:guspatagonico/brainsource-opencode-defaults#<commit>
```

Para desarrollo local:

```bash
opencode plugin add /home/gustavo/dev/brainsource-opencode-defaults
# o, en un proyecto, agregarlo a opencode.json
```

> El plugin ya incluye `context-budget`. **No instales también** el subpaquete por
> separado, salvo que quieras solo el context budget:
> `opencode plugin add 'github:guspatagonico/brainsource-opencode-defaults#main::path:packages/context-budget'`.

## Opciones

Con `plugin add` la entrada queda como string. Para pasar opciones, editá
`~/.config/opencode/opencode.json` y usá la forma objeto:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "brainsource-opencode-defaults",
      "options": {
        "worktreeDirectory": ".worktrees",
        "contextBudget": {
          "proactiveThreshold": 0.5,
          "charsPerToken": 4
        }
      }
    }
  ]
}
```

| Opción | Default | Qué hace |
|---|---|---|
| `worktreeDirectory` | `.worktrees` | Base para `brainsource_worktree_create` |
| `contextBudget` | `{}` | Opciones del subpaquete de compaction |
| `contextBudget: false` | — | Desactiva el context budget |
| `rules` | `true` | Inyecta `rules.md` |
| `skills` | `true` | Registra las skills |
| `commands` | `true` | Registra los commands |
| `tools` | `true` | Registra los tools |

### Worktrees

- El tool usa `worktreeDirectory` (default `.worktrees`) y acepta `dir` por llamada.
- Si además usás la función nativa de worktrees de OpenCode, agregá en tu config
  global:

```jsonc
{
  "worktree": { "directory": ".worktrees" }
}
```

Son mecanismos independientes: el plugin no puede cambiar la config de OpenCode.

## Uso rápido

```text
/new-repo mi-proyecto
/release
/docs-sync
/worktree mi-feature
/install-hooks
/repo-about
/pr
```

`/new-repo` hace dry-run primero y pide confirmación. El tool
`brainsource_new_repo` crea el repo privado por defecto, con una descripción breve
obligatoria, MIT, `.gitignore`, docs y hook; para público hay que pasar `public: true`
explícitamente.

## Migración desde el setup manual

Si antes usabas los archivos globales sueltos:

1. Quitá de `~/.config/opencode/opencode.json` la entrada del plugin local
   `context-budget` (el paquete ya lo incluye).
2. Mové/eliminá `~/.config/opencode/AGENTS.md` si no querés reglas duplicadas (el
   plugin inyecta `rules.md`).
3. Quitá los commands/skills globales que el plugin ya registra, si los tenías.
4. `opencode reload`.

## Desarrollo

```bash
pnpm install
pnpm typecheck
pnpm test:scaffold
```

El entrypoint es `index.ts` (TypeScript; OpenCode lo carga con Bun). El subpaquete
está en `packages/context-budget/`.

## Estructura

```text
index.ts                     # plugin principal (compone todo)
rules.md                     # reglas inyectadas
src/
  rules.ts                   # hook context
  skills.ts                  # registra skills
  commands.ts                # registra commands
  tools.ts                   # registra tools
  lib/scaffold.ts            # scaffolding + gh
  lib/worktree.ts            # git worktree
  lib/hooks.ts               # commit-msg
skills/                      # contenido de las skills
templates/                   # archivos para repos nuevos
packages/context-budget/     # plugin de compaction (subpaquete)
scripts/test-scaffold.ts     # test del scaffolding
```

## Licencia

MIT. Ver [LICENSE](./LICENSE).
