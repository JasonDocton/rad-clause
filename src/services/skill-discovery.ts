/**
 * Skill Discovery Service
 *
 * Scans skills/ directory, parses SKILL.md frontmatter,
 * and extracts keywords for pattern matching.
 *
 * Phase 1: Basic frontmatter parsing + keyword extraction
 * Phase 2: Extract file patterns from frontmatter triggers
 * Phase 3: Security validation, path checking, graceful error handling
 */

import { join, resolve } from 'node:path'
import yaml from 'js-yaml'
import type { DiscoveredSkill, Result } from '../types/schemas.ts'
import { skillFrontmatterSchema } from '../types/schemas.ts'

/**
 * Regex patterns defined at top-level for performance
 */
const FRONTMATTER_REGEX = /^---\n([\s\S]*?)\n---/
const FRONTMATTER_REMOVE_REGEX = /^---\n[\s\S]*?\n---\n/
const KEYWORDS_REGEX = /Keywords?:\s*([^\n]+)/i

/**
 * Parse YAML frontmatter from markdown content
 *
 * Frontmatter format:
 * ---
 * name: skill-name
 * triggers:
 *   files:
 *     include: ["pattern1", "pattern2"]
 * ---
 */
function parseFrontmatter(content: string): Result<Record<string, unknown>> {
	const frontmatterMatch = content.match(FRONTMATTER_REGEX)

	if (!frontmatterMatch) {
		return { ok: false, error: new Error('No frontmatter found') }
	}

	const frontmatterContent = frontmatterMatch[1]
	if (!frontmatterContent) {
		return { ok: false, error: new Error('Empty frontmatter') }
	}

	try {
		const parsed = yaml.load(frontmatterContent) as Record<string, unknown>
		return { ok: true, value: parsed }
	} catch (error) {
		return { ok: false, error: error as Error }
	}
}

/**
 * Extract file patterns from frontmatter
 * Phase 2: Parse triggers.files.include from YAML frontmatter
 */
function extractFilePatterns(
	frontmatter: Record<string, unknown>
): readonly string[] {
	try {
		const triggers = frontmatter.triggers as Record<string, unknown> | undefined
		if (!triggers) return []

		const files = triggers.files as Record<string, unknown> | undefined
		if (!files) return []

		const include = files.include as string[] | undefined
		if (!include || !Array.isArray(include)) return []

		return include.filter((p) => typeof p === 'string' && p.length > 0)
	} catch {
		return []
	}
}

/**
 * Extract keywords from SKILL.md content
 *
 * Looks for "Keywords:" section in the content (not frontmatter)
 * Format: "Keywords: word1, word2, word3" or "- Keywords: word1, word2"
 */
function extractKeywords(content: string): readonly string[] {
	// Remove frontmatter first (everything before second ---)
	const contentWithoutFrontmatter = content.replace(
		FRONTMATTER_REMOVE_REGEX,
		''
	)

	// Look for Keywords: line in content
	const keywordMatch = contentWithoutFrontmatter.match(KEYWORDS_REGEX)

	if (!keywordMatch) {
		return []
	}

	const keywordsStr = keywordMatch[1]
	if (!keywordsStr) {
		return []
	}

	return keywordsStr
		.split(',')
		.map((k) => k.trim().toLowerCase())
		.filter((k) => k.length > 0)
}

/**
 * Discover all skills in the skills/ directory
 *
 * @param skillsDir - Absolute path to skills/ directory
 * @returns Array of discovered skills with metadata
 */
export async function discoverSkills(
	skillsDir: string
): Promise<Result<readonly DiscoveredSkill[]>> {
	const resolvedSkillsDir = resolve(skillsDir)

	// Basic existence check
	const dirFile = Bun.file(resolvedSkillsDir)
	if (!(await dirFile.exists())) {
		return {
			ok: false,
			error: new Error(`Skills directory not found: ${resolvedSkillsDir}`),
		}
	}

	const skills: DiscoveredSkill[] = []

	// Use Bun.Glob to efficiently find all SKILL.md files
	const glob = new Bun.Glob('*/SKILL.md')
	const skillFiles = glob.scanSync({ cwd: resolvedSkillsDir })

	for (const skillMdRelative of skillFiles) {
		const skillMdPath = join(resolvedSkillsDir, skillMdRelative)
		const entry = skillMdRelative.split('/')[0]

		// Skip if path parsing failed
		if (!entry) {
			continue
		}

		const skillPath = join(resolvedSkillsDir, entry)

		// Skip hidden directories
		if (entry.startsWith('.')) {
			continue
		}

		// Read and parse SKILL.md (with error handling)
		let content: string
		try {
			const file = Bun.file(skillMdPath)
			content = await file.text()
		} catch (error) {
			console.warn(`[Warning] Cannot read SKILL.md for ${entry}: ${error}`)
			continue
		}

		// Parse frontmatter (graceful failure)
		const frontmatterResult = parseFrontmatter(content)
		if (!frontmatterResult.ok) {
			console.warn(
				`[Warning] Skipping skill ${entry}: Invalid frontmatter (${frontmatterResult.error.message})`
			)
			continue
		}

		// Validate frontmatter structure (graceful failure)
		const validation = skillFrontmatterSchema.safeParse(frontmatterResult.value)
		if (!validation.success) {
			console.warn(
				`[Warning] Skipping skill ${entry}: Frontmatter validation failed (${validation.error.message})`
			)
			continue
		}

		const { name, description } = validation.data

		// Extract keywords and file patterns
		const keywords = extractKeywords(content)
		const filePatterns = extractFilePatterns(frontmatterResult.value)

		skills.push({
			name,
			description,
			keywords: [...keywords],
			filePatterns: [...filePatterns],
			skillPath,
			skillMdPath,
		})
	}

	return { ok: true, value: skills }
}

/**
 * Cached skill discovery
 * Scans skills directory once on first call, returns cached results thereafter
 */
let cachedSkills: readonly DiscoveredSkill[] | null = null

export async function discoverSkillsCached(
	skillsDir: string
): Promise<Result<readonly DiscoveredSkill[]>> {
	if (cachedSkills !== null) {
		return { ok: true, value: cachedSkills }
	}

	const result = await discoverSkills(skillsDir)
	if (result.ok) {
		cachedSkills = result.value
	}

	return result
}
