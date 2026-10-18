---
name: Project Docs
description: Audit and update project documentation (README, AGENTS, ARCHITECTURE, docs/) so it matches the code.
---

# Project Docs

Usá esta skill cuando el usuario pida documentar, actualizar docs, o cuando un
cambio estructural (módulo, endpoint, migración, comando, dependencia) deje la
documentación desactualizada.

## Qué revisar

| Archivo | Audiencia | Contenido mínimo |
|---|---|---|
| `README.md` | Humanos | Qué es, requisitos, instalación, scripts, estructura, configuración, deploy |
| `AGENTS.md` | Agentes | Comandos, convenciones, repo map, guardrails, verificación |
| `ARCHITECTURE.md` | Técnica | Componentes, flujos, datos, integraciones, decisiones, deploy |
| `docs/README.md` | Índice | Tabla de documentos por temática |
| `docs/*.md` | Temática | Un documento por tema; links relativos |

## Flujo

1. **Inventario**: listar los archivos existentes y leer los índices.
2. **Drift**: comparar con el código real (rutas, scripts, endpoints, migraciones,
   variables de entorno). No asumir: leer `package.json`, `composer.json`,
   `pyproject.toml`, `Makefile`, `api/migrations`, etc.
3. **Reporte**: decir qué falta, qué está viejo y qué se propone cambiar.
4. **Actualización**: edits chicos y verificables. No inventar features ni
   comandos. Mantener el estilo y el idioma del proyecto.
5. **Verificación**: links relativos válidos, comandos copiables, índice
   actualizado. Si hay `pnpm typecheck`/`lint`, correrlos solo si se tocó código.

## Reglas

- No dupliques el mismo contenido en README y ARCHITECTURE: README para onboarding,
  ARCHITECTURE para diseño técnico.
- `AGENTS.md` debe ser accionable: comandos exactos y verificaciones.
- Si un tema crece, movelo a `docs/<tema>.md` y dejá un link desde el índice.
- Si no podés verificar algo, marcalo como `TODO` y preguntá; no lo inventes.
