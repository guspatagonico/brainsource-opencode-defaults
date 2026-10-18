---
name: Pull Request
description: Prepare detailed PR notes and create or update a GitHub Pull Request using the Brainsource template, including co-authors for squash merges.
---

# Pull Request

Usá esta skill cuando el usuario pida abrir, preparar o actualizar un PR, o cuando
haya que mergear una branch a `main`.

## Flujo

1. Verificá que estás en una branch distinta de `main` y que el working tree está
   limpio.
2. Reuní evidencia real:
   ```bash
   git fetch origin main
   git log --oneline origin/main..HEAD
   git diff --stat origin/main...HEAD
   git diff origin/main...HEAD
   ```
3. Generá los co-autores desde los commits de la branch:
   ```bash
   git log --format='%an <%ae>' origin/main..HEAD | sort -u
   ```
   - El autor del PR será el autor principal del squash.
   - Excluí el email del autor principal (`git config user.email`) si corresponde.
   - Incluí a los demás como trailers:
     `Co-authored-by: Nombre Apellido <email@example.com>`
   - Deduplicá por email.
4. Escribí el body con la plantilla:
   - Si el repo tiene `.github/pull_request_template.md`, usala.
   - Si no, usá `templates/PULL_REQUEST_TEMPLATE.md` del plugin (relativo a esta
     skill: `../../templates/PULL_REQUEST_TEMPLATE.md`).
   - Sé específico: resumen, contexto, cambios, cómo probar, evidencia,
     impacto/riesgos, co-autores, issues, notas para el reviewer y checklist.
5. Título con Conventional Commits: `<type>(<scope>): <subject>`.
6. Mostrá el título y el body al usuario y pedí confirmación **antes** de crear o
   actualizar el PR.
7. Creá o actualizá:
   ```bash
   gh pr create --base main --head <branch> --title "<title>" --body-file <file>
   gh pr edit <number> --title "<title>" --body-file <file>
   ```
   Si es WIP, agregá `--draft`.
8. No mergees sin aprobación. Cuando el usuario lo pida y el PR esté aprobado y
   verde:
   ```bash
   gh pr merge <number> --squash --delete-branch
   ```
   El repo debe tener squash-only y:
   `squash_merge_commit_title=PR_TITLE`, `squash_merge_commit_message=PR_BODY`.

## Reglas

- Nunca push directo a `main`.
- Nunca mergear con checks rojos o sin aprobación.
- No inventar evidencia: si no corriste tests, decilo.
- PR chico y enfocado; si no, proponé partirlo.
- Si el repo no tiene branch protection, sugerí `brainsource_protect_main`.
