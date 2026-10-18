# SemVer Release Automation

Skill para OpenCode que automatiza releases semánticos desde el último tag de git.
Decide `patch`/`minor`/`major`, genera changelog completo, y opcionalmente ejecuta commit + tag con Conventional Commits.

## Instalación

Copiar la carpeta completa en `.agents/skills/` de cualquier repositorio:

```bash
cp -r semver-release-automation/ <otro-repo>/.agents/skills/
```

**Requisitos del proyecto destino:**
- Node.js (para leer `package.json`)
- Git
- Scripts `pnpm release:patch|minor|major` (o equivalentes con `npm version`)
- Conventional Commits en los mensajes
- `gh` CLI (para GitHub Release) — `brew install gh && gh auth login`

## Uso

### Disparadores (lenguaje natural)

| Frase | Modo |
|---|---|
| "prepará release semver" | Dry-run: analiza + recomienda + changelog |
| "decidí semver según cambios desde último tag" | Dry-run con análisis detallado |
| "aplicá release semver" | Ejecuta commit + tag local |
| "aplicá release semver y hacé push" | Release completo + push |
| "aplicá release semver con github release" | Release + push + GitHub Release con release notes |
| "simulá release" / "mostrame qué haría" | Forzar dry-run explícito |

### Modos

| Modo | Flag | Comportamiento |
|---|---|---|
| Dry-run | (default) | Analiza, recomienda, genera changelog. No muta git. |
| Apply | `--apply` | Ejecuta `pnpm release:patch\|minor\|major`, crea tag. |
| Push manual | (default) | Muestra `git push --follow-tags` como recordatorio. |
| Push dry-run | `--push=dry-run` | Muestra comando exacto de push. |
| Push apply | `--push=apply` | Ejecuta `git push --follow-tags`. |
| GitHub Release | `--github` | Crea GitHub Release con release notes auto-generadas. |

### Confirmación de major

El skill **solo pide confirmación** cuando detecta breaking changes (bump `major`).
Patch y minor se aplican automáticamente en modo `--apply`.

## Características

### Decisión SemVer automática

Analiza commits desde el último tag y clasifica:

- **Major**: breaking changes (`!`, `BREAKING CHANGE:`, APIs removidas)
- **Minor**: nuevos features backward-compatible (`feat:`)
- **Patch**: fixes, refactors, chores, docs (`fix:`, `chore:`, etc.)

### Changelog completo

Genera release notes estructuradas por sección, optimizadas para GitHub Release:

```
## What's Changed

### 🚀 Features
- **add analytics export** ([`d4e5f6a`](https://github.com/.../commit/d4e5f6a))
  - CSV export with date range filter
  - Download button in analytics dashboard

### 🐛 Fixes
- **fix redirect loop on expired token** ([`f7g8h9b`](https://github.com/.../commit/f7g8h9b))

### 🧹 Chores
- **bump react to 18.5.0** ([`j0k1l2c`](https://github.com/.../commit/j0k1l2c))

**Full Changelog**: https://github.com/owner/repo/compare/v0.9.1...v0.10.0
```

### Safety gates

- Dry-run por defecto (nunca muta sin pedirlo)
- Confirma explícitamente antes de bump `major`
- Bloquea si git state está roto (merge conflicts, rebase)
- Nunca hace force-push
- Push manual por defecto
- Valida sincronización tag ↔ `package.json`

### Script bash standalone

El archivo `scripts/release-semver.sh` funciona independiente del skill:

```bash
# Análisis JSON
bash scripts/release-semver.sh --json

# Análisis human-readable
bash scripts/release-semver.sh

# Aplicar release
bash scripts/release-semver.sh --apply
```

## Estructura

```
semver-release-automation/
├── README.md                              ← Este archivo
├── SKILL.md                               ← Hub del skill (triggers, workflow, safety)
├── references/
│   ├── semver-rules.md                    ← Matriz de decisión completa
│   └── release-message-template.md        ← Plantilla de changelog con ejemplos
└── scripts/
    └── release-semver.sh                  ← Bash helper standalone
```

## Ejemplo de flujo completo

```bash
# 1. Ver estado actual
git status --short
git describe --tags --abbrev=0
# → v0.9.1

# 2. Simular release (dry-run)
bash scripts/release-semver.sh
# → recommendedBump: patch
# → nextVersion: 0.9.2
# → [changelog completo]

# 3. Aplicar release local
bash scripts/release-semver.sh --apply
# → commit: chore(release): bump to v0.9.2
# → tag: v0.9.2

# 4. Push (manual, recordado por el skill)
git push --follow-tags
```

## Personalización para otros proyectos

1. Ajustar `references/semver-rules.md` si el proyecto tiene reglas de API contract distintas.
2. Modificar `scripts/release-semver.sh` si se usa `yarn` o `npm` en vez de `pnpm`.
3. Actualizar los triggers en `SKILL.md` si se prefiere otro idioma.

## Autor

Gustavo Adrián Salvini — [gsalvini@ecimtech.com](mailto:gsalvini@ecimtech.com) — [github.com/guspatagonico](https://github.com/guspatagonico) — [@guspatagonico](https://github.com/guspatagonico)

## Licencia

MIT — libre uso, modificación y distribución.
