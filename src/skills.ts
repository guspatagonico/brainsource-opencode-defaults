import { readFileSync } from "node:fs"
import { join } from "node:path"
import { ROOT } from "./paths"

type SkillMeta = {
  id: string
  name: string
  description: string
}

const SKILLS: SkillMeta[] = [
  {
    id: "new-repo",
    name: "New GitHub Repo",
    description:
      "Create a GitHub repository with private-by-default visibility, MIT license, a safe .gitignore, docs scaffolding, and a Conventional Commits hook.",
  },
  {
    id: "project-docs",
    name: "Project Docs",
    description:
      "Audit and update project documentation (README, AGENTS, ARCHITECTURE, docs/) so it matches the code.",
  },
  {
    id: "semver-release-automation",
    name: "Semantic Release",
    description:
      "Automate SemVer releases from the previous git tag: decide patch/minor/major, bump, changelog, tag, push, and GitHub Release.",
  },
]

/** Drop the YAML frontmatter; the skill body is what gets injected on load. */
function body(text: string): string {
  return text.replace(/^---\r?\n[\s\S]*?\r?\n---\r?\n?/, "")
}

export async function registerSkills(ctx: any): Promise<void> {
  await ctx.skill.transform((editor: any) => {
    for (const skill of SKILLS) {
      const path = join(ROOT, "skills", skill.id, "SKILL.md")
      try {
        const content = body(readFileSync(path, "utf8"))
        editor.add({ ...skill, path, content, autoinvoke: true })
      } catch (error) {
        console.error(`[brainsource] no se pudo cargar la skill ${skill.id}:`, error)
      }
    }
  })
}
