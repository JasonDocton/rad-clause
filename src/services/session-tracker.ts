/**
 * Session Tracker Service
 *
 * Manages session state file and checkpoint recommendation logic.
 * Milestone-based approach for intelligent context management.
 *
 * Phase 9: Intelligent Context Management
 */

import { existsSync, mkdirSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import type { Result } from '../types/schemas.ts'
import {
	CHECKPOINT_THRESHOLDS,
	type CheckpointStatus,
	SESSION_STATE_FILE,
	type SessionTracker,
	type ShouldCreateCheckpointOutput,
	sessionTrackerSchema,
} from '../types/session-schemas.ts'

/**
 * Load session tracker from file
 *
 * Creates new tracker if file doesn't exist.
 */
export async function loadSessionTracker(
	projectRoot: string
): Promise<Result<SessionTracker>> {
	const statePath = resolve(projectRoot, SESSION_STATE_FILE)

	try {
		const file = Bun.file(statePath)

		if (!(await file.exists())) {
			// Create new session tracker
			const newTracker: SessionTracker = {
				sessionStart: new Date().toISOString(),
				lastCheckpoint: new Date().toISOString(),
				currentPhase: 'Unknown',
				completedSinceCheckpoint: [],
				inProgress: 'Session started',
				filesModified: [],
				commitsSinceCheckpoint: 0,
				checkpointStatus: 'none',
			}
			return { ok: true, value: newTracker }
		}

		const data = await file.json()

		// Validate with Zod
		const validation = sessionTrackerSchema.safeParse(data)
		if (!validation.success) {
			return {
				ok: false,
				error: new Error(
					`Invalid session tracker format: ${validation.error.message}`
				),
			}
		}

		return { ok: true, value: validation.data }
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}

/**
 * Save session tracker to file
 */
export async function saveSessionTracker(
	tracker: SessionTracker,
	projectRoot: string
): Promise<Result<void>> {
	const statePath = resolve(projectRoot, SESSION_STATE_FILE)

	try {
		// Ensure directory exists
		const dir = dirname(statePath)
		if (!existsSync(dir)) {
			mkdirSync(dir, { recursive: true })
		}

		// Write with pretty formatting for human readability
		const content = JSON.stringify(tracker, null, 2)
		await Bun.write(statePath, content)

		return { ok: true, value: undefined }
	} catch (error) {
		return {
			ok: false,
			error: error instanceof Error ? error : new Error(String(error)),
		}
	}
}

/**
 * Calculate checkpoint status based on milestones
 */
export function calculateCheckpointStatus(
	tracker: SessionTracker
): CheckpointStatus {
	const { commitsSinceCheckpoint, filesModified } = tracker

	// Urgent: 5+ commits OR 20+ files
	if (
		commitsSinceCheckpoint >= CHECKPOINT_THRESHOLDS.URGENT.commits ||
		filesModified.length >= CHECKPOINT_THRESHOLDS.URGENT.filesModified
	) {
		return 'urgent'
	}

	// Recommended: 3+ commits OR 10+ files
	if (
		commitsSinceCheckpoint >= CHECKPOINT_THRESHOLDS.RECOMMENDED.commits ||
		filesModified.length >= CHECKPOINT_THRESHOLDS.RECOMMENDED.filesModified
	) {
		return 'recommended'
	}

	// Suggested: 2+ commits OR 5+ files OR phase completion
	if (
		commitsSinceCheckpoint >= CHECKPOINT_THRESHOLDS.SUGGESTED.commits ||
		filesModified.length >= CHECKPOINT_THRESHOLDS.SUGGESTED.filesModified ||
		tracker.completedSinceCheckpoint.length > 0
	) {
		return 'suggested'
	}

	return 'none'
}

/**
 * Generate reasoning for checkpoint recommendation
 */
function generateCheckpointReasoning(
	status: CheckpointStatus,
	tracker: SessionTracker
): string {
	const { commitsSinceCheckpoint, filesModified, completedSinceCheckpoint } =
		tracker

	const reasons: string[] = []

	if (commitsSinceCheckpoint > 0) {
		reasons.push(`${commitsSinceCheckpoint} commit(s) made`)
	}

	if (filesModified.length > 0) {
		reasons.push(`${filesModified.length} file(s) modified`)
	}

	if (completedSinceCheckpoint.length > 0) {
		reasons.push(`${completedSinceCheckpoint.length} milestone(s) completed`)
	}

	const reasonText = reasons.join(', ')

	switch (status) {
		case 'urgent':
			return `URGENT: ${reasonText}. Save now to preserve significant work.`
		case 'recommended':
			return `Recommended: ${reasonText}. Good checkpoint for context save.`
		case 'suggested':
			return `Suggested: ${reasonText}. Consider saving at this natural breakpoint.`
		case 'none':
			return 'No checkpoint needed yet. Continue working.'
	}
}

/**
 * Calculate session duration
 */
function calculateSessionDuration(startTime: string): string {
	const start = new Date(startTime)
	const now = new Date()
	const diffMs = now.getTime() - start.getTime()

	const hours = Math.floor(diffMs / (1000 * 60 * 60))
	const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60))

	if (hours > 0) {
		return `${hours}h ${minutes}m`
	}
	return `${minutes}m`
}

/**
 * Check if checkpoint should be created
 */
export function shouldCreateCheckpoint(
	tracker: SessionTracker
): ShouldCreateCheckpointOutput {
	const status = calculateCheckpointStatus(tracker)
	const shouldSave = status === 'recommended' || status === 'urgent'
	const reasoning = generateCheckpointReasoning(status, tracker)
	const sessionDuration = calculateSessionDuration(tracker.sessionStart)

	return {
		status,
		shouldSave,
		reasoning,
		stats: {
			sessionDuration,
			commitsSinceCheckpoint: tracker.commitsSinceCheckpoint,
			filesModified: tracker.filesModified.length,
			workCompleted: tracker.completedSinceCheckpoint.length,
		},
	}
}

/**
 * Reset checkpoint counters (after successful save)
 */
export function resetCheckpoint(tracker: SessionTracker): SessionTracker {
	return {
		...tracker,
		lastCheckpoint: new Date().toISOString(),
		completedSinceCheckpoint: [],
		filesModified: [],
		commitsSinceCheckpoint: 0,
		checkpointStatus: 'none',
	}
}
