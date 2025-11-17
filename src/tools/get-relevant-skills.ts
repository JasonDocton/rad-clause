/**
 * get_relevant_skills MCP Tool
 *
 * Analyzes user prompts and returns relevant rad-claude skills
 * with confidence scores.
 *
 * Version: 2.0.0
 * - Exports output schema for modern MCP SDK
 * - Maintains backward-compatible response format
 */

import { matchPromptToSkills } from '../services/pattern-matcher.ts'
import { discoverSkillsCached } from '../services/skill-discovery.ts'
import type { Result } from '../types/schemas.ts'
import {
	type GetRelevantSkillsOutput,
	getRelevantSkillsInputSchema,
} from '../types/schemas.ts'

// Re-export schemas for modern MCP SDK
export { getRelevantSkillsOutputSchema } from '../types/output-schemas.ts'
export { getRelevantSkillsInputSchema }

/**
 * get_relevant_skills tool handler
 *
 * @param input - Tool input (prompt)
 * @param skillsDir - Path to skills/ directory
 * @returns Skill matches with confidence scores
 */
export async function getRelevantSkills(
	input: unknown,
	skillsDir: string
): Promise<Result<GetRelevantSkillsOutput>> {
	// Validate input
	const validation = getRelevantSkillsInputSchema.safeParse(input)
	if (!validation.success) {
		return {
			ok: false,
			error: new Error(`Invalid input: ${validation.error.message}`),
		}
	}

	const { prompt, openFiles, workingDirectory } = validation.data

	// Discover skills (cached)
	const skillsResult = await discoverSkillsCached(skillsDir)
	if (!skillsResult.ok) {
		return { ok: false, error: skillsResult.error }
	}

	const skills = skillsResult.value

	// Match prompt to skills with context
	const matches = matchPromptToSkills(prompt, skills, {
		openFiles,
		workingDirectory,
	})

	return {
		ok: true,
		value: {
			matches: [...matches],
			totalSkillsScanned: skills.length,
		},
	}
}

/**
 * Tool definition for MCP server
 * Phase 2: Added optional context parameters
 */
export const getRelevantSkillsToolDef = {
	name: 'get_relevant_skills',
	description:
		'Match skills to prompt. Weighted scoring: keywords 40%, files 30%, content 30%',
	inputSchema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description: 'Prompt to analyze',
			},
			openFiles: {
				type: 'array',
				items: { type: 'string' },
				description: 'Open file paths',
			},
			workingDirectory: {
				type: 'string',
				description: 'Working directory',
			},
		},
		required: ['prompt'],
	},
} as const
