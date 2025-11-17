/**
 * should_create_checkpoint MCP Tool
 *
 * Checks current session state and recommends if a context save checkpoint
 * should be created. Based on natural milestones (commits, files, completions).
 *
 * Version: 2.0.0
 * - Exports output schema for modern MCP SDK
 */

import {
	loadSessionTracker,
	shouldCreateCheckpoint,
} from '../services/session-tracker.ts'
import type { Result } from '../types/schemas.ts'
import type { ShouldCreateCheckpointOutput } from '../types/session-schemas.ts'

// Re-export output schema for modern MCP SDK
export { shouldCreateCheckpointOutputSchema } from '../types/output-schemas.ts'

/**
 * Check if checkpoint should be created
 *
 * @param projectRoot - Path to project root (for SESSION_TRACKER.json)
 * @returns Result with checkpoint recommendation or error
 */
export async function checkShouldCreateCheckpoint(
	projectRoot: string
): Promise<Result<ShouldCreateCheckpointOutput>> {
	// Load session tracker
	const loadResult = await loadSessionTracker(projectRoot)
	if (!loadResult.ok) {
		return { ok: false, error: loadResult.error }
	}

	const tracker = loadResult.value

	// Calculate checkpoint recommendation
	const result = shouldCreateCheckpoint(tracker)

	return { ok: true, value: result }
}

/**
 * Tool definition for MCP server
 */
export const shouldCreateCheckpointToolDef = {
	name: 'should_create_checkpoint',
	description:
		'Check if checkpoint recommended. Returns status (none/suggested/recommended/urgent) based on commits/files/work',
	inputSchema: {
		type: 'object',
		properties: {},
		required: [],
	},
} as const
