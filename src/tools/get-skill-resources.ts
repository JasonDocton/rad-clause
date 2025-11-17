/**
 * get_skill_resources MCP Tool
 *
 * Discovers and recommends resource files within a skill's resources/ directory.
 * Enables progressive disclosure - load only relevant resources instead of everything.
 *
 * Phase 5: Progressive Disclosure
 */

import { existsSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'
import { z } from 'zod'

import type { Result } from '../types/schemas.ts'

/**
 * Resource file metadata
 */
export interface ResourceFile {
	readonly fileName: string
	readonly filePath: string
	readonly topic: string
	readonly skillName: string
}

/**
 * Resource recommendation with relevance score
 */
export interface ResourceRecommendation {
	readonly resource: ResourceFile
	readonly relevance: number
	readonly reasoning: string
}

/**
 * Input schema for get_skill_resources tool
 * Phase 8: Added .trim() for security (prevent whitespace-only inputs)
 */
export const getSkillResourcesInputSchema = z.object({
	skillName: z.string().trim().min(1),
	topic: z.string().trim().optional(),
	keywords: z.array(z.string()).optional(),
})

export type GetSkillResourcesInput = z.infer<
	typeof getSkillResourcesInputSchema
>

/**
 * Output schema for get_skill_resources tool
 */
export const getSkillResourcesOutputSchema = z.object({
	recommendations: z.array(
		z.object({
			resource: z.object({
				fileName: z.string(),
				filePath: z.string(),
				topic: z.string(),
				skillName: z.string(),
			}),
			relevance: z.number().min(0).max(100),
			reasoning: z.string(),
		})
	),
	totalResources: z.number().int().nonnegative(),
})

export type GetSkillResourcesOutput = z.infer<
	typeof getSkillResourcesOutputSchema
>

/**
 * Regex patterns defined at top-level for performance
 */
const MD_EXTENSION_REGEX = /\.md$/
const DASH_REGEX = /-/g
const DIGIT_REGEX = /\d+/g

/**
 * Extract topic from resource filename
 * e.g., "react-19-2-features.md" → "react 19.2 features"
 */
function extractTopic(fileName: string): string {
	return fileName
		.replace(MD_EXTENSION_REGEX, '')
		.replace(DASH_REGEX, ' ')
		.replace(DIGIT_REGEX, (match) => match) // Keep numbers
}

/**
 * Calculate relevance score for a resource
 */
function calculateRelevance(
	resource: ResourceFile,
	topic?: string,
	keywords?: readonly string[]
): { relevance: number; reasoning: string } {
	const normalizedTopic = resource.topic.toLowerCase()
	const matchedTerms: string[] = []

	let relevance = 50 // Base relevance (resource exists)

	// Topic matching (if provided)
	if (topic) {
		const normalizedSearchTopic = topic.toLowerCase()
		if (normalizedTopic.includes(normalizedSearchTopic)) {
			relevance += 40
			matchedTerms.push(`topic: "${topic}"`)
		}
	}

	// Keyword matching (if provided)
	if (keywords && keywords.length > 0) {
		for (const keyword of keywords) {
			const normalizedKeyword = keyword.toLowerCase()
			if (normalizedTopic.includes(normalizedKeyword)) {
				relevance += 10
				matchedTerms.push(`keyword: "${keyword}"`)
			}
		}
	}

	// Cap at 100%
	relevance = Math.min(100, relevance)

	// Generate reasoning
	const reasoning =
		matchedTerms.length > 0
			? `Matches ${matchedTerms.join(', ')}`
			: 'General resource for this skill'

	return { relevance, reasoning }
}

/**
 * Discover resource files in a skill's resources/ directory
 */
function discoverResources(
	skillPath: string,
	skillName: string
): Result<readonly ResourceFile[]> {
	const resourcesDir = join(skillPath, 'resources')

	// Check if resources directory exists
	if (!existsSync(resourcesDir)) {
		return { ok: true, value: [] } // No resources is OK
	}

	const resources: ResourceFile[] = []

	try {
		const entries = readdirSync(resourcesDir)

		for (const entry of entries) {
			const filePath = join(resourcesDir, entry)

			// Skip non-files and hidden files
			try {
				if (!statSync(filePath).isFile() || entry.startsWith('.')) {
					continue
				}
			} catch {
				continue
			}

			// Only include markdown files
			if (!entry.endsWith('.md')) {
				continue
			}

			resources.push({
				fileName: entry,
				filePath,
				topic: extractTopic(entry),
				skillName,
			})
		}
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}

	return { ok: true, value: resources }
}

/**
 * Get skill resource recommendations
 *
 * @param input - Skill name and optional topic/keywords
 * @param skillsDir - Path to skills/ directory
 * @returns Resource recommendations sorted by relevance
 */
export function getSkillResources(
	input: unknown,
	skillsDir: string
): Result<GetSkillResourcesOutput, Error> {
	// Validate input
	const validation = getSkillResourcesInputSchema.safeParse(input)
	if (!validation.success) {
		return {
			ok: false,
			error: new Error(`Invalid input: ${validation.error.message}`),
		}
	}

	const { skillName, topic, keywords } = validation.data

	// Find skill directory
	const skillPath = join(skillsDir, skillName)

	if (!existsSync(skillPath)) {
		return {
			ok: false,
			error: new Error(`Skill not found: ${skillName}`),
		}
	}

	// Discover resources
	const resourcesResult = discoverResources(skillPath, skillName)
	if (!resourcesResult.ok) {
		return { ok: false, error: resourcesResult.error }
	}

	const resources = resourcesResult.value

	// Calculate relevance for each resource
	const recommendations: ResourceRecommendation[] = resources.map(
		(resource) => {
			const { relevance, reasoning } = calculateRelevance(
				resource,
				topic,
				keywords
			)
			return { resource, relevance, reasoning }
		}
	)

	// Sort by relevance (highest first)
	recommendations.sort((a, b) => b.relevance - a.relevance)

	// Filter to only show resources with >40% relevance
	const filteredRecommendations = recommendations.filter(
		(r) => r.relevance > 40
	)

	return {
		ok: true,
		value: {
			recommendations: filteredRecommendations.map((r) => ({
				resource: {
					fileName: r.resource.fileName,
					filePath: r.resource.filePath,
					topic: r.resource.topic,
					skillName: r.resource.skillName,
				},
				relevance: r.relevance,
				reasoning: r.reasoning,
			})),
			totalResources: resources.length,
		},
	}
}

/**
 * Tool definition for MCP server
 */
export const getSkillResourcesToolDef = {
	name: 'get_skill_resources',
	description:
		'Find relevant resources in skill/resources/. Progressive disclosure via topic/keywords',
	inputSchema: {
		type: 'object',
		properties: {
			skillName: {
				type: 'string',
				description: 'Skill name',
			},
			topic: {
				type: 'string',
				description: 'Topic filter',
			},
			keywords: {
				type: 'array',
				items: { type: 'string' },
				description: 'Keyword filters',
			},
		},
		required: ['skillName'],
	},
} as const
