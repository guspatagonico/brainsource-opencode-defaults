# Defaults de Brainsource

Estas reglas aplican a **todos** los proyectos. El `AGENTS.md` de cada proyecto
puede agregar o especializar; si hay conflicto, gana el del proyecto.

## GitHub

- Crear repositorios **privados** por defecto. Solo crear uno público si el usuario
  lo pide explícitamente al crearlo.
- Licencia **MIT** por defecto (públicos y privados), salvo que se indique otra.
- Antes del primer commit: `.gitignore` completo (Node/npm/pnpm/bun, Python,
  artefactos, credenciales, OS/editor), `.env.example` si hay variables, y verificar
  que no haya secretos en el árbol.
- Si el repo va a ser público, revisar el historial y el árbol antes de publicar.
- Agregar descripción corta y topics al crear el repo.
- Usar `gh` (cuenta autenticada) con visibilidad explícita; nunca el default
  interactivo.

### About del repo

- Todo repo debe tener una **descripción breve** en el About de GitHub (≤160 chars).
- Al crear un repo es **obligatoria**: si el usuario no la da, proponela a partir del
  propósito/README y confirmala.
- Si un repo existente no tiene descripción o está desactualizada, agregala/actualizala
  **proactivamente** con `brainsource_set_repo_about` (o `gh repo edit`), sin esperar a
  que el usuario lo pida.
- Mantené también topics relevantes.

## Git y worktrees

- Trabajar features en **git worktrees**, no cambiando la rama del checkout principal.
  Usá el tool `brainsource_worktree_create`.
  - Default: `.worktrees/<name>` y rama `feat/<name>`.
  - Configurable por llamada con `dir`, o globalmente con la opción
    `worktreeDirectory` del plugin.
  - La función nativa de worktrees de OpenCode usa `worktree.directory` en
    `opencode.json`; son mecanismos separados.
- Ramas: `feat/<slug>`, `fix/<slug>`, `docs/<slug>`, `chore/<slug>`,
  `refactor/<slug>`, `test/<slug>`.
- Commits con **Conventional Commits**: `<type>(<scope>): <subject>`.
  - Tipos: `feat`, `fix`, `docs`, `style`, `refactor`, `perf`, `test`, `build`,
    `ci`, `chore`, `revert`.
  - Scope: módulo o área (`auth`, `bundles`, `api`, `docs`, ...). Usarlo cuando el
    cambio esté localizado; incluir `!` o `BREAKING CHANGE:` para breaking changes.
  - Subject en imperativo, ≤72 caracteres. Body con bullets cuando aporte.
- Instalá el hook con `brainsource_install_commit_hook` (o `/install-hooks`).
- Nunca `git commit` ni `git push` sin pedido explícito.
- Operaciones destructivas (force push, reescritura de historia, `rm -rf`, deploy a
  producción): pedir confirmación explícita.

## Releases (SemVer)

- Usar la skill `semver-release-automation` (o `/release`).
- Cuando el usuario lo pida (o lo sugiera y lo apruebe): bump de versión, commit
  `chore(release): vX.Y.Z`, tag `vX.Y.Z`, push y **GitHub Release** con release
  notes.
- Default **dry-run**; confirmar siempre un bump **major**.
- Regla de bump: breaking → major; `feat` → minor; solo `fix`/`chore`/`docs`/
  `refactor`/`test`/`style` → patch.
- No publicar paquetes ni crear releases sin pedido explícito.

## Documentación del proyecto

Todo proyecto debe tener en la raíz:

- `README.md` — para humanos: qué es, requisitos, instalación, scripts, estructura,
  configuración y deploy.
- `AGENTS.md` — para agentes: comandos, convenciones, repo map, guardrails y
  verificación.
- `ARCHITECTURE.md` — arquitectura técnica: componentes, flujos, datos,
  integraciones, decisiones y deploy.
- `docs/` — markdown por temática, con `docs/README.md` como índice.

Mantenerlos sincronizados cuando cambien módulos, endpoints, migraciones, comandos
o dependencias. Si detectás drift, actualizá o proponé la actualización; usá la
skill `project-docs` (o `/docs-sync`).

## Herramientas del plugin

- `brainsource_new_repo` — scaffolding + creación del repo en GitHub (dry-run por
  defecto, `apply: true` para ejecutar).
- `brainsource_install_commit_hook` — instala el hook de Conventional Commits.
- `brainsource_worktree_create` — crea el worktree de una feature.
- `brainsource_set_repo_about` — crea/actualiza la descripción del About en GitHub.
- Atajos: `/new-repo`, `/release`, `/docs-sync`, `/worktree`, `/install-hooks`,
  `/repo-about`.

## Seguridad

- Nunca commitear `.env`, credenciales, claves ni secretos.
- No imprimir ni pedir secretos en el chat.
- Antes de un push a un repo público, revisar secretos y `.gitignore`.
- No cambiar la visibilidad de un repo sin confirmación.
