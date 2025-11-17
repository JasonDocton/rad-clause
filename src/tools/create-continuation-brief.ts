/**
 * create_continuation_brief MCP Tool
 *
 * Generates AI-optimized, hyper-compressed continuation brief for next session.
 * Format designed for LLM parsing, not human readability.
 *
 * Version: 2.0.0
 * - Exports output schema for modern MCP SDK
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import {
	loadSessionTracker,
	resetCheckpoint,
	saveSessionTracker,
} from '../services/session-tracker.ts'
import type { Result } from '../types/schemas.ts'
import {
	createContinuationBriefInputSchema,
	type SessionTracker,
} from '../types/session-schemas.ts'

// Re-export schemas for modern MCP SDK
export { createContinuationBriefOutputSchema } from '../types/output-schemas.ts'
export { createContinuationBriefInputSchema } from '../types/session-schemas.ts'

/**
 * Generate AI-optimized continuation brief
 *
 * Format: Dense, structured, scannable by LLMs
 * - No prose, just structured data
 * - Prioritized load order
 * - Clear state snapshot
 * - Resumption instructions
 *
 * @param input - Brief parameters
 * @param projectRoot - Path to project root
 * @returns Result with brief file path or error
 */
export async function createContinuationBrief(
	input: unknown,
	projectRoot: string
): Promise<Result<{ briefPath: string; message: string }>> {
	// Validate input
	const validation = createContinuationBriefInputSchema.safeParse(input)
	if (!validation.success) {
		return {
			ok: false,
			error: new Error(`Invalid input: ${validation.error.message}`),
		}
	}

	const {
		reason,
		contextToLoad,
		completedWork,
		inProgressFile,
		inProgressDescription,
		nextSteps,
		estimatedCompletion,
	} = validation.data

	// Load session tracker for stats
	const trackerResult = await loadSessionTracker(projectRoot)
	if (!trackerResult.ok) {
		return { ok: false, error: trackerResult.error }
	}

	const tracker = trackerResult.value

	// Generate timestamp for filename
	const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19)
	const briefFilename = `continuation-brief-${timestamp}.md`
	const briefPath = resolve(projectRoot, 'archive', briefFilename)

	// Ensure archive directory exists
	const archiveDir = dirname(briefPath)
	if (!existsSync(archiveDir)) {
		mkdirSync(archiveDir, { recursive: true })
	}

	// Generate AI-optimized brief content
	const brief = generateBriefContent({
		timestamp,
		briefFilename,
		reason,
		tracker,
		contextToLoad,
		completedWork,
		inProgressFile,
		inProgressDescription,
		nextSteps,
		estimatedCompletion,
	})

	try {
		// Write brief file
		await Bun.write(briefPath, brief)

		// Reset checkpoint in tracker
		const resetTracker = resetCheckpoint(tracker)
		const saveResult = await saveSessionTracker(resetTracker, projectRoot)
		if (!saveResult.ok) {
			console.error(
				'[Warning] Failed to reset checkpoint:',
				saveResult.error.message
			)
			// Don't fail the operation, brief was saved successfully
		}

		return {
			ok: true,
			value: {
				briefPath,
				message: `Continuation brief created: ${briefFilename}`,
			},
		}
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}

/**
 * Generate AI-optimized brief content
 *
 * Format designed for LLM parsing:
 * - Sections use SCREAMING_SNAKE_CASE headers
 * - Dense, structured data (no prose)
 * - Load priority order
 * - State snapshot
 */
function generateBriefContent(params: {
	timestamp: string
	briefFilename: string
	reason: string
	tracker: SessionTracker
	contextToLoad: readonly string[]
	completedWork: readonly string[]
	inProgressFile?: string
	inProgressDescription?: string
	nextSteps: readonly string[]
	estimatedCompletion?: string
}): string {
	const {
		timestamp,
		briefFilename,
		reason,
		tracker,
		contextToLoad,
		completedWork,
		inProgressFile,
		inProgressDescription,
		nextSteps,
		estimatedCompletion,
	} = params

	const lines: string[] = []

	// Header
	lines.push(`# SESSION_CONTINUATION_BRIEF_${timestamp}`)
	lines.push('')
	lines.push(`**SAVE_REASON:** ${reason}`)
	lines.push(`**SESSION_START:** ${tracker.sessionStart}`)
	lines.push(`**CHECKPOINT_TIME:** ${new Date().toISOString()}`)
	lines.push(`**CURRENT_PHASE:** ${tracker.currentPhase}`)
	lines.push('')

	// Priority load order (AI loads these first)
	lines.push('## CONTEXT_LOAD_PRIORITY')
	lines.push('')
	contextToLoad.forEach((file, idx) => {
		lines.push(`${idx + 1}. ${file}`)
	})
	lines.push('')

	// Completed work (AI knows what's done)
	lines.push('## COMPLETED_WORK')
	lines.push('')
	completedWork.forEach((work) => {
		lines.push(`- ✅ ${work}`)
	})
	lines.push('')

	// In-progress state (AI knows current task)
	lines.push('## IN_PROGRESS')
	lines.push('')
	if (inProgressFile) {
		lines.push(`**File:** ${inProgressFile}`)
	}
	if (inProgressDescription) {
		lines.push(`**Status:** ${inProgressDescription}`)
	}
	if (!inProgressFile && !inProgressDescription) {
		lines.push('None (checkpoint at clean breakpoint)')
	}
	lines.push('')

	// Next steps (AI knows how to resume)
	lines.push('## NEXT_STEPS')
	lines.push('')
	nextSteps.forEach((step, idx) => {
		lines.push(`${idx + 1}. ${step}`)
	})
	lines.push('')

	// State snapshot (AI knows session metrics)
	lines.push('## STATE_SNAPSHOT')
	lines.push('')
	lines.push(`commits_made=${tracker.commitsSinceCheckpoint}`)
	lines.push(`files_modified=${tracker.filesModified.length}`)
	lines.push(`work_completed=${completedWork.length}`)
	if (tracker.lastCommit) {
		lines.push(`last_commit=${tracker.lastCommit}`)
	}
	if (estimatedCompletion) {
		lines.push(`estimated_completion=${estimatedCompletion}`)
	}
	lines.push('')

	// Files modified (AI knows what changed)
	if (tracker.filesModified.length > 0) {
		lines.push('## FILES_MODIFIED')
		lines.push('')
		tracker.filesModified.forEach((file: string) => {
			lines.push(`- ${file}`)
		})
		lines.push('')
	}

	// Resume command (AI knows exact command to run)
	lines.push('## RESUME_COMMAND')
	lines.push('')
	lines.push('```')
	lines.push(`Read archive/${briefFilename.replace('.md', '')}.md`)
	if (contextToLoad.length > 0) {
		lines.push(`Then load: ${contextToLoad[0]}`)
	}
	lines.push('```')
	lines.push('')

	// Footer
	lines.push('---')
	lines.push('')
	lines.push('**Format:** AI-optimized continuation brief')
	lines.push('**Purpose:** Seamless session resumption without context loss')
	lines.push('**Next Session:** Load this brief first, then resume work')

	return lines.join('\n')
}

/**
 * Tool definition for MCP server
 */
export const createContinuationBriefToolDef = {
	name: 'create_continuation_brief',
	description:
		'Create AI-optimized continuation brief. Saves to archive/continuation-brief-{timestamp}.md. Resets checkpoint',
	inputSchema: {
		type: 'object',
		properties: {
			reason: {
				type: 'string',
				description: 'Save reason',
			},
			contextToLoad: {
				type: 'array',
				items: { type: 'string' },
				description: 'Priority files',
			},
			completedWork: {
				type: 'array',
				items: { type: 'string' },
				description: 'Completed work',
			},
			inProgressFile: {
				type: 'string',
				description: 'Current file',
			},
			inProgressDescription: {
				type: 'string',
				description: 'Current state',
			},
			nextSteps: {
				type: 'array',
				items: { type: 'string' },
				description: 'Next steps',
			},
			estimatedCompletion: {
				type: 'string',
				description: 'Time estimate',
			},
		},
		required: ['reason', 'contextToLoad', 'completedWork', 'nextSteps'],
	},
} as const
