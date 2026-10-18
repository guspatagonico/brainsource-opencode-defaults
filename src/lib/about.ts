import { spawnSync } from "node:child_process"

export interface AboutInput {
  description: string
  repo?: string
  topics?: string[]
  homepage?: string
  baseDir: string
}

export interface AboutResult {
  repo: string
  description: string
  topics: string[]
  homepage?: string
}

const TOPIC = /^[a-z0-9][a-z0-9-]*$/

export function buildAboutArgs(
  repo: string,
  input: Pick<AboutInput, "description" | "topics" | "homepage">,
): string[] {
  const args = ["repo", "edit", repo, "--description", input.description]
  if (input.homepage) args.push("--homepage", input.homepage)
  if (input.topics?.length) args.push("--add-topic", input.topics.join(","))
  return args
}

function normalize(input: AboutInput): AboutResult {
  const description = input.description.trim()
  if (!description) {
    throw new Error("La descripción del About no puede estar vacía.")
  }
  if (description.length > 350) {
    throw new Error("La descripción del About no puede superar 350 caracteres.")
  }

  const topics = [
    ...new Set((input.topics ?? []).map((topic) => topic.trim().toLowerCase()).filter(Boolean)),
  ]
  for (const topic of topics) {
    if (!TOPIC.test(topic)) {
      throw new Error(`Topic inválido: "${topic}". Usá minúsculas, números y guiones.`)
    }
  }

  return {
    repo: input.repo ?? "",
    description,
    topics,
    ...(input.homepage ? { homepage: input.homepage } : {}),
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

export function setRepoAbout(input: AboutInput): AboutResult {
  const normalized = normalize(input)
  const repo = normalized.repo || detectRepo(input.baseDir)
  const args = buildAboutArgs(repo, normalized)

  const result = spawnSync("gh", args, { cwd: input.baseDir, encoding: "utf8" })
  if (result.status !== 0) {
    const detail = (result.stderr || result.stdout || "").trim()
    throw new Error(`gh repo edit falló (${result.status}): ${detail}`)
  }

  return { ...normalized, repo }
}
