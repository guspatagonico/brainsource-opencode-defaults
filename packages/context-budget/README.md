# context-budget

> Este paquete está incluido en **`brainsource-opencode-defaults`**. Si instalás ese
> plugin, no instales este por separado: el principal ya registra estos hooks.

Resumen **híbrido** para la compactación de contexto:

- **Hechos duros por código** (determinístico): objetivo, archivos tocados, comandos y errores.
- **Un párrafo narrativo** generado con el modelo de la sesión (o uno que definas), para condensar estado/decisiones/próximo paso.

Si el modelo falla o no hay modelo disponible, se usa solo la parte determinística.

## Cómo carga

Con el paquete principal:

```jsonc
{
  "plugins": [
    {
      "package": "brainsource-opencode-defaults",
      "options": { "contextBudget": { "proactiveThreshold": 0.5 } }
    }
  ]
}
```

Standalone:

```bash
opencode plugin add 'github:guspatagonico/brainsource-opencode-defaults#main::path:packages/context-budget'
```

La calibración se corre desde el repo clonado:

```bash
node --experimental-strip-types packages/context-budget/calibrate.ts
```

## Qué genera

```md
## Objetivo
<primer mensaje de usuario>

## Archivos tocados
- <paths de tool calls edit/write/patch/multiedit>

## Comandos clave
- `<comandos bash / shell recientes>`

## Errores / bloqueos
- <tool calls con status = error>

## Estado
<párrafo de 3–5 líneas generado por el modelo>

## Próximo pedido
<último mensaje de usuario>
```

## Opciones

| Opción | Default | Qué hace |
|---|---:|---|
| `maxFiles` | 20 | Máximo de archivos listados |
| `maxCommands` | 12 | Máximo de comandos (los más recientes) |
| `maxErrors` | 8 | Máximo de errores únicos |
| `maxAssistantChars` | 12000 | Tope de transcript enviado al modelo para la narrativa |
| `maxNarrativeChars` | 1200 | Tope del párrafo resultante |
| `narrativeModel` | (sesión) | Override `"providerID/modelID"` para la narrativa |
| `proactive` | `true` | Activa la compactación proactiva por umbral |
| `proactiveThreshold` | `0.65` | Fracción del límite de contexto que dispara compactar |
| `proactiveCooldownMs` | `120000` | Espera mínima entre disparos, por sesión |
| `charsPerToken` | `4` | Chars por token (parte variable del contexto) |
| `overheadTokens` | `0` | Tokens fijos que no están en `context()` (seed/fallback) |
| `autoOverhead` | `true` | Estima el overhead por sesión con el uso real (EMA) |
| `overheadSmoothing` | `0.35` | Peso de la última observación en la EMA |
| `overheadMax` | `200000` | Tope del overhead automático |
| `contextLimit` | (modelo) | Override del límite de contexto del modelo |
| `calibrationLog` | `true` | `true` = log por defecto; `false` = apagado; string = ruta custom |

### Compactación proactiva

Antes de admitir cada mensaje del usuario, el plugin estima el tamaño del contexto:

```
estimatedTokens = chars / charsPerToken + overhead
```

donde `chars = JSON.stringify(ctx.session.context()).length`. Con `autoOverhead: true`
(default), `overhead` se estima **por sesión** a partir del último paso real
(`promptTokens - charsBefore / charsPerToken`) y se suaviza con `overheadSmoothing`;
`overheadTokens` es el valor inicial/fallback (y el que se usa con `autoOverhead: false`).
Si supera `proactiveThreshold × contextLimit`, encola
`ctx.session.compact({ delivery: "queue" })`. Hay un cooldown por sesión
(`proactiveCooldownMs`) para no repetirlo. Nunca bloquea el prompt: si falla, se ignora.

Para pasar opciones, usá la forma objeto en el `plugins` de la config global:

```jsonc
{
  "plugins": [
    {
      "package": "/home/gustavo/.config/opencode/plugins/context-budget",
      "options": { "narrativeModel": "deepseek/deepseek-flash", "maxFiles": 30 }
    }
  ]
}
```

Sin ese bloque, usa el **modelo default de OpenCode** (`ctx.model.default()`) y los
defaults. `narrativeModel` permite forzar otro modelo solo para el párrafo.

## Calibración

El plugin escribe **una línea JSONL por paso del asistente** (deduplicada por mensaje)
cuando hay uso real de tokens, en:

```
~/.local/share/opencode/context-budget/calibration.jsonl
```

```json
{"v":1,"ts":"2026-10-18T…","sessionID":"ses_…","model":"deepseek/deepseek-flash","agent":"build",
 "chars":1234567,"charsBefore":987654,"input":120,"cacheRead":10400,"cacheWrite":0,
 "promptTokens":10520,"output":180,"reasoning":0,
 "overheadObserved":11473,"overheadUsed":11473,"estimated":12990}
```

- `charsBefore`: chars del contexto **que produjo** ese mensaje (todo lo anterior).
- `promptTokens`: tokens reales del prompt (`input + cache.read + cache.write`).
- `chars`: contexto actual (incluye la respuesta), el que usa el disparador proactivo.
- `estimated`: lo que estimó el plugin con la config vigente (para ver el error a ojo).

Para calibrar:

```bash
node --experimental-strip-types ~/.config/opencode/plugins/context-budget/calibrate.ts
```

Reporta la mediana y el ajuste lineal, con el error mediano de cada uno, y sugiere
`charsPerToken` + `overheadTokens`. Para aplicarlo:

```bash
node --experimental-strip-types ~/.config/opencode/plugins/context-budget/calibrate.ts --write
opencode reload
```

`--write` hace backup de `opencode.json` (`.bak-<timestamp>`), preserva el resto de las
opciones y convierte la entrada del plugin a la forma objeto si hacía falta.

Notas:

- El log es **por proveedor/tokenizer y por agente**: si cambiás de modelo o de agente,
  calibrá de nuevo (filtrá con `--provider` / `--model` / `--agent`).
- El overhead estático (system prompt + tools) depende del **agente**; por eso el log
  guarda `agent` y el ajuste lineal lo estima como intercept.
- `overheadTokens` ya no es imprescindible: con `autoOverhead` el plugin lo estima por
  sesión. El valor calibrado sirve como seed/fallback (útil si usás `autoOverhead: false`).
- El script exige **suficiencia de datos**: ≥5 muestras, contexto máximo ≥200k chars,
  rango max/min ≥10×, y un solo modelo/agente en la muestra. Ajustable con
  `--min-samples`, `--min-chars`, `--min-span`; `--force` lo saltea (no recomendado).
- `--prompt-mode sum` (default) asume `input + cache.read + cache.write`
  (DeepSeek/Anthropic). Si tu proveedor ya incluye el cache dentro de `input`,
  usá `--prompt-mode input`.
- Con pocas muestras (`--min-samples`, default 5) usa la mediana y
  `overheadTokens: 0`. El ajuste lineal es el que separa el ratio variable del
  overhead fijo (system prompt + tools), y suele dar bastante menos error.
- `calibrationLog: false` apaga el log; si además `proactive: false`, el hook de
  `prompt` no se registra.

## Costo / privacidad

- Hace **una llamada extra al modelo** por compactación (solo para el párrafo).
- El transcript **no sale** a ningún proveedor distinto del modelo elegido.
- La parte determinística no llama a ningún modelo.

## Desactivar

Quitar la entrada de `plugins` en `~/.config/opencode/opencode.json` (o borrar/mover
`~/.config/opencode/plugins/context-budget/`).

