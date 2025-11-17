#!/usr/bin/env bun

import { resolve } from 'node:path'
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import { z } from 'zod'
import { createContinuationBrief } from './tools/create-continuation-brief.ts'
import { getRelevantSkills } from './tools/get-relevant-skills.ts'
import { getSkillResources } from './tools/get-skill-resources.ts'
import { checkShouldCreateCheckpoint } from './tools/should-create-checkpoint.ts'
import { suggestAgent } from './tools/suggest-agent.ts'
import { updateSessionTracker } from './tools/update-session-tracker.ts'

const serverName = 'rad-claude'
const serverVersion = '2.0.0'
const skillsDir = resolve(import.meta.dir, '../skills')

interface CompactMatch {
	readonly skill: { readonly name: string }
	readonly confidence: number
	readonly details?: {
		readonly keywordScore?: number
		readonly fileScore?: number
		readonly contentScore?: number
	}
}

interface CompactRecommendation {
	readonly agent: { readonly name: string }
	readonly confidence: number
	readonly matchedSignals: readonly string[]
}

interface CompactResource {
	readonly resource: {
		readonly fileName: string
		readonly filePath: string
	}
	readonly relevance: number
}

interface CompactCheckpoint {
	readonly status: string
	readonly shouldSave: boolean
	readonly stats: {
		readonly commitsSinceCheckpoint: number
		readonly filesModified: number
		readonly workCompleted: number
		readonly sessionDuration: string
	}
}

function formatSkillMatches(
	matches: readonly CompactMatch[],
	total: number
): string {
	if (matches.length === 0) return `0/${total} skills`

	const formatted = matches
		.map((m) => {
			const parts: string[] = []
			if (m.details) {
				if ((m.details.keywordScore ?? 0) > 0)
					parts.push(`kw${m.details.keywordScore}%`)
				if ((m.details.fileScore ?? 0) > 0)
					parts.push(`file${m.details.fileScore}%`)
				if ((m.details.contentScore ?? 0) > 0)
					parts.push(`ct${m.details.contentScore}%`)
			}
			const match = parts.length > 0 ? ` [${parts.join(',')}]` : ''
			return `${m.skill.name}:${m.confidence}%${match}`
		})
		.join('\n')

	return `${matches.length}/${total}:\n${formatted}`
}

function formatAgentRecommendations(
	recommendations: readonly CompactRecommendation[]
): string {
	if (recommendations.length === 0) return '0 agents'

	return recommendations
		.map(
			(r) => `${r.agent.name}:${r.confidence}% [${r.matchedSignals.join(',')}]`
		)
		.join('\n')
}

function formatResourceRecommendations(
	recommendations: readonly CompactResource[],
	total: number
): string {
	if (recommendations.length === 0) return `0/${total} resources`

	const formatted = recommendations
		.map((r) => `${r.resource.fileName}:${r.relevance}% ${r.resource.filePath}`)
		.join('\n')

	return `${recommendations.length}/${total}:\n${formatted}`
}

function formatCheckpointStatus(checkpoint: CompactCheckpoint): string {
	const { status, shouldSave, stats } = checkpoint
	return `${status}:${shouldSave ? 'SAVE' : 'OK'} c${stats.commitsSinceCheckpoint} f${stats.filesModified} w${stats.workCompleted} ${stats.sessionDuration}`
}

function sanitizeErrorMessage(toolName: string, error: Error): string {
	console.error('[MCP Error]', {
		tool: toolName,
		error: error.message,
		type: error.constructor.name,
		timestamp: new Date().toISOString(),
	})

	if (error.constructor.name === 'SecurityError') {
		return 'Access denied: Invalid path or permission error'
	}

	if (
		error.message.includes('not found') ||
		error.message.includes('does not exist')
	) {
		return `${toolName} failed: Resource not found`
	}

	if (error.message.includes('Invalid input')) {
		return `${toolName} failed: Invalid input format`
	}

	return `${toolName} failed: Please check your input and try again`
}

async function main(): Promise<void> {
	const server = new McpServer({
		name: serverName,
		version: serverVersion,
	})

	server.registerTool(
		'get_relevant_skills',
		{
			title: 'Match Skills to Prompt',
			description:
				'Analyze prompts/files, return relevant skills with confidence scores (keywords 40%, files 30%, content 30%)',
			inputSchema: {
				prompt: z
					.string()
					.trim()
					.min(1)
					.max(10000)
					.describe('Prompt to analyze'),
				openFiles: z.array(z.string()).optional().describe('Open file paths'),
				workingDirectory: z.string().optional().describe('Working directory'),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: Handler params validated by Zod internally
		async (params: any) => {
			const result = await getRelevantSkills(params, skillsDir)

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage('get_relevant_skills', result.error),
						},
					],
				}
			}

			const { matches, totalSkillsScanned } = result.value
			return {
				content: [
					{
						type: 'text' as const,
						text: formatSkillMatches(matches, totalSkillsScanned),
					},
				],
				structuredContent: result.value,
			}
		}
	)
	server.registerTool(
		'suggest_agent',
		{
			title: 'Recommend Specialized Agents',
			description:
				'Recommend rad-claude agents for complex tasks (task-spec, convex, security, plan review)',
			inputSchema: {
				prompt: z
					.string()
					.trim()
					.min(1)
					.max(10000)
					.describe('User prompt to analyze'),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: Handler params validated by Zod internally
		(params: any) => {
			const result = suggestAgent(params)

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage('suggest_agent', result.error),
						},
					],
				}
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: formatAgentRecommendations(result.value.recommendations),
					},
				],
				structuredContent: result.value,
			}
		}
	)

	server.registerTool(
		'get_skill_resources',
		{
			title: 'Discover Skill Resources',
			description:
				'Find resources in skill/resources/ with progressive disclosure via topic/keywords',
			inputSchema: {
				skillName: z.string().trim().min(1).describe('Name of the skill'),
				topic: z.string().trim().optional().describe('Topic to filter by'),
				keywords: z
					.array(z.string())
					.optional()
					.describe('Keywords to search for'),
			},
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: Handler params validated by Zod internally
		(params: any) => {
			const result = getSkillResources(params, skillsDir)

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage('get_skill_resources', result.error),
						},
					],
				}
			}

			const { recommendations, totalResources } = result.value
			return {
				content: [
					{
						type: 'text' as const,
						text: formatResourceRecommendations(
							recommendations,
							totalResources
						),
					},
				],
				structuredContent: result.value,
			}
		}
	)

	server.registerTool(
		'update_session_tracker',
		{
			title: 'Record Session Progress',
			description:
				'Track session milestones (commits, files, work) for checkpoint recommendations',
			inputSchema: {
				currentPhase: z
					.string()
					.optional()
					.describe('Current phase or milestone'),
				completedWork: z
					.string()
					.optional()
					.describe('Work completed since last update'),
				inProgress: z.string().optional().describe('Current task in progress'),
				filesModified: z
					.array(z.string())
					.optional()
					.describe('Files modified'),
				commitMade: z
					.boolean()
					.optional()
					.describe('Whether a commit was made'),
				lastCommit: z.string().optional().describe('Last commit hash'),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: false,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: Handler params validated by Zod internally
		async (params: any) => {
			const result = await updateSessionTracker(params, process.cwd())

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage(
								'update_session_tracker',
								result.error
							),
						},
					],
				}
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: `tracker:${result.value.checkpointStatus}`,
					},
				],
				structuredContent: result.value,
			}
		}
	)

	server.registerTool(
		'should_create_checkpoint',
		{
			title: 'Check Checkpoint Recommendation',
			description:
				'Check if context checkpoint needed based on session milestones (commits, files, completions)',
			annotations: {
				readOnlyHint: true,
				destructiveHint: false,
				idempotentHint: true,
				openWorldHint: false,
			},
		},
		async () => {
			const result = await checkShouldCreateCheckpoint(process.cwd())

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage(
								'should_create_checkpoint',
								result.error
							),
						},
					],
				}
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: formatCheckpointStatus(result.value as CompactCheckpoint),
					},
				],
				structuredContent: result.value,
			}
		}
	)

	server.registerTool(
		'create_continuation_brief',
		{
			title: 'Create Continuation Brief',
			description:
				'Generate AI-optimized continuation brief to archive/, reset checkpoint counters',
			inputSchema: {
				reason: z.string().describe('Why saving now'),
				contextToLoad: z
					.array(z.string())
					.describe('Files to load first in next session'),
				completedWork: z.array(z.string()).describe('What was accomplished'),
				inProgressFile: z.string().optional().describe('File being worked on'),
				inProgressDescription: z.string().optional().describe('Current state'),
				nextSteps: z.array(z.string()).describe('How to resume'),
				estimatedCompletion: z
					.string()
					.optional()
					.describe('Time estimate to finish'),
			},
			annotations: {
				readOnlyHint: false,
				destructiveHint: true,
				idempotentHint: false,
				openWorldHint: false,
			},
		},
		// biome-ignore lint/suspicious/noExplicitAny: Handler params validated by Zod internally
		async (params: any) => {
			const result = await createContinuationBrief(params, process.cwd())

			if (!result.ok) {
				return {
					isError: true,
					content: [
						{
							type: 'text' as const,
							text: sanitizeErrorMessage(
								'create_continuation_brief',
								result.error
							),
						},
					],
				}
			}

			return {
				content: [
					{
						type: 'text' as const,
						text: `brief:${result.value.briefPath}`,
					},
				],
				structuredContent: result.value,
			}
		}
	)
	const transport = new StdioServerTransport()
	await server.connect(transport)

	console.error(`rad-claude MCP server v${serverVersion} started`)
	console.error(`Skills directory: ${skillsDir}`)
	console.error(`Using modern McpServer API with structured content support`)
}

main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
