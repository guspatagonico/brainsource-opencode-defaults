---
name: New GitHub Repo
description: Create a GitHub repository with private-by-default visibility, MIT license, a safe .gitignore, docs scaffolding, and a Conventional Commits hook.
---

# New GitHub Repo

Usá esta skill cuando el usuario quiera crear un repositorio nuevo (local y/o en
GitHub) con los defaults de Brainsource.

## Defaults

- **Privado** salvo pedido explícito de público.
- **Descripción breve obligatoria** en el About de GitHub (≤160 chars). Si no la da el
  usuario, proponela a partir del propósito/README y confirmala.
- **MIT** salvo que se indique otra licencia (`license: "none"` para ninguna).
- `.gitignore` completo: Node/npm/pnpm/bun, Python, artefactos, secretos, OS/editor.
- Scaffolding: `README.md`, `AGENTS.md`, `ARCHITECTURE.md`, `docs/README.md`.
- Hook `commit-msg` con Conventional Commits.
- Commit inicial: `chore: initial commit`.
- `gh repo create` con visibilidad explícita y `--push`.

## Flujo

1. Confirmar **nombre**, **descripción**, visibilidad y owner (personal u org).
2. Llamar al tool `brainsource_new_repo` en **dry-run** (`apply: false`) y mostrar
   el plan.
3. Pedir aprobación.
4. Aplicar con `apply: true`. Para solo scaffolding local, `local: true`.
5. Verificar: `gh repo view <owner>/<name>`, `git remote -v`, `git log --oneline -1`.
6. Si es público, revisar secretos antes de publicar; si hay dudas, dejarlo privado
   y preguntar.

## Inputs del tool

| Campo | Tipo | Default | Qué hace |
|---|---|---|---|
| `name` | string | — | Nombre del repo (kebab-case) |
| `public` | boolean | `false` | Crea el repo público (opt-in explícito) |
| `description` | string | — (obligatoria) | Descripción breve del About (≤160 chars) |
| `owner` | string | cuenta autenticada | Owner personal u org |
| `dir` | string | `<workspace>/<name>` | Directorio destino |
| `license` | `MIT` \| `none` | `MIT` | Licencia |
| `local` | boolean | `false` | Solo scaffolding, sin GitHub |
| `apply` | boolean | `false` | Ejecuta de verdad |

## Seguridad

- Nunca sobreescribir un directorio o repo existente.
- `gh auth status` antes de crear el remoto.
- No crear repos públicos por accidente: la visibilidad siempre es explícita.
- No agregar credenciales a los templates ni al repo.

## About en repos existentes

Si el repo ya existe y no tiene descripción (o quedó vieja), usá
`brainsource_set_repo_about` con una descripción breve y los topics relevantes. No
esperes a que el usuario lo pida.
