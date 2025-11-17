/**
 * update_session_tracker MCP Tool
 *
 * Records session progress at natural milestones (commits, file changes, phase completions).
 * Updates .claude/SESSION_TRACKER.json for checkpoint recommendations.
 *
 * Version: 2.0.0
 * - Exports output schema for modern MCP SDK
 */

import {
	calculateCheckpointStatus,
	loadSessionTracker,
	saveSessionTracker,
} from '../services/session-tracker.ts'
import type { Result } from '../types/schemas.ts'
import { updateSessionTrackerInputSchema } from '../types/session-schemas.ts'

// Re-export schemas for modern MCP SDK
export { updateSessionTrackerOutputSchema } from '../types/output-schemas.ts'
export { updateSessionTrackerInputSchema } from '../types/session-schemas.ts'

/**
 * Update session tracker with new progress
 *
 * @param input - Progress update (phase, completed work, files, commits)
 * @param projectRoot - Path to project root (for SESSION_TRACKER.json)
 * @returns Result with updated tracker or error
 */
export async function updateSessionTracker(
	input: unknown,
	projectRoot: string
): Promise<Result<{ message: string; checkpointStatus: string }>> {
	// Validate input
	const validation = updateSessionTrackerInputSchema.safeParse(input)
	if (!validation.success) {
		return {
			ok: false,
			error: new Error(`Invalid input: ${validation.error.message}`),
		}
	}

	const {
		currentPhase,
		completedWork,
		inProgress,
		filesModified,
		commitMade,
		lastCommit,
	} = validation.data

	// Load existing tracker
	const loadResult = await loadSessionTracker(projectRoot)
	if (!loadResult.ok) {
		return { ok: false, error: loadResult.error }
	}

	let tracker = loadResult.value

	// Update fields
	if (currentPhase) {
		tracker = { ...tracker, currentPhase }
	}

	if (completedWork) {
		tracker = {
			...tracker,
			completedSinceCheckpoint: [
				...tracker.completedSinceCheckpoint,
				completedWork,
			],
		}
	}

	if (inProgress) {
		tracker = { ...tracker, inProgress }
	}

	if (filesModified && filesModified.length > 0) {
		// Add new files, avoid duplicates
		const newFiles = filesModified.filter(
			(f) => !tracker.filesModified.includes(f)
		)
		tracker = {
			...tracker,
			filesModified: [...tracker.filesModified, ...newFiles],
		}
	}

	if (commitMade) {
		tracker = {
			...tracker,
			commitsSinceCheckpoint: tracker.commitsSinceCheckpoint + 1,
		}
	}

	if (lastCommit) {
		tracker = { ...tracker, lastCommit }
	}

	// Recalculate checkpoint status
	const status = calculateCheckpointStatus(tracker)
	tracker = { ...tracker, checkpointStatus: status }

	// Save updated tracker
	const saveResult = await saveSessionTracker(tracker, projectRoot)
	if (!saveResult.ok) {
		return { ok: false, error: saveResult.error }
	}

	return {
		ok: true,
		value: {
			message: 'Session tracker updated successfully',
			checkpointStatus: status,
		},
	}
}

/**
 * Tool definition for MCP server
 */
export const updateSessionTrackerToolDef = {
	name: 'update_session_tracker',
	description:
		'Record progress (commits, files, phases). Updates SESSION_TRACKER.json for checkpoint recommendations',
	inputSchema: {
		type: 'object',
		properties: {
			currentPhase: {
				type: 'string',
				description: 'Current phase',
			},
			completedWork: {
				type: 'string',
				description: 'Work completed',
			},
			inProgress: {
				type: 'string',
				description: 'Current task',
			},
			filesModified: {
				type: 'array',
				items: { type: 'string' },
				description: 'Modified files',
			},
			commitMade: {
				type: 'boolean',
				description: 'Commit made',
			},
			lastCommit: {
				type: 'string',
				description: 'Commit hash',
			},
		},
		required: [],
	},
} as const
