import { spawnSync } from "node:child_process"

export interface ProtectionInput {
  repo?: string
  approvals?: number
  checks?: string[]
  enforceAdmins?: boolean
  apply?: boolean
  baseDir: string
}

export interface ProtectionPlan {
  repo: string
  endpoint: string
  payload: Record<string, unknown>
  repoSettings: Record<string, unknown>
}

export function buildProtectionPayload(input: {
  approvals?: number
  checks?: string[]
  enforceAdmins?: boolean
}): Record<string, unknown> {
  const approvals = Math.max(1, Math.floor(input.approvals ?? 1))
  const checks = (input.checks ?? []).map((check) => check.trim()).filter(Boolean)

  return {
    required_status_checks: checks.length ? { strict: true, contexts: checks } : null,
    enforce_admins: input.enforceAdmins !== false,
    required_pull_request_reviews: {
      required_approving_review_count: approvals,
      dismiss_stale_reviews: true,
      require_code_owner_reviews: false,
    },
    restrictions: null,
    allow_force_pushes: false,
    allow_deletions: false,
    required_linear_history: true,
    required_conversation_resolution: true,
  }
}

export function buildRepoSettings(): Record<string, unknown> {
  return {
    allow_squash_merge: true,
    allow_merge_commit: false,
    allow_rebase_merge: false,
    squash_merge_commit_title: "PR_TITLE",
    squash_merge_commit_message: "PR_BODY",
    delete_branch_on_merge: true,
  }
}

function detectRepo(baseDir: string): string {
  const result = spawnSync(
    "gh",
    ["repo", "view", "--json", "nameWithOwner", "-q", ".nameWithOwner"],
    { cwd: baseDir, encoding: "utf8" },
  )
  if (result.status !== 0) {
    throw new Error(
      'No pude detectar el repo. Pasá `repo: "owner/name"` o ejecutá desde un repo con remote de GitHub.',
    )
  }
  return result.stdout.trim()
}

function ghApi(method: string, endpoint: string, payload: unknown, baseDir: string): void {
  const result = spawnSync("gh", ["api", "--method", method, endpoint, "--input", "-"], {
    cwd: baseDir,
    encoding: "utf8",
    input: JSON.stringify(payload),
  })

  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim()
    if (/403|upgrade|protected branch|not available/i.test(detail)) {
      throw new Error(
        `GitHub rechazó la protección (los repos privados pueden requerir un plan con branch protection): ${detail}`,
      )
    }
    throw new Error(`gh api ${method} ${endpoint} falló: ${detail}`)
  }
}

export function protectMain(input: ProtectionInput): ProtectionPlan {
  const repo = input.repo || detectRepo(input.baseDir)
  const payload = buildProtectionPayload(input)
  const repoSettings = buildRepoSettings()
  const plan: ProtectionPlan = {
    repo,
    endpoint: `repos/${repo}/branches/main/protection`,
    payload,
    repoSettings,
  }

  if (input.apply !== true) return plan

  // Merge settings work on every plan; branch protection may need a paid plan.
  ghApi("PATCH", `repos/${repo}`, repoSettings, input.baseDir)
  ghApi("PUT", plan.endpoint, payload, input.baseDir)

  return plan
}
