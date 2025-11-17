#!/usr/bin/env bun

/**
 * rad-claude MCP Server
 *
 * Model Context Protocol server for auto-activating rad-claude skills
 * based on user prompts and file context.
 *
 * Phase 1: Basic skill discovery and keyword-based matching
 */

import { resolve } from 'node:path'
// Using low-level Server API (not McpServer) for custom response formatting
// McpServer forces standard MCP responses; we need compact formats for token efficiency
// Deprecation acknowledged: Server required for advanced use case (custom formatting)
import { Server } from '@modelcontextprotocol/sdk/server'
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js'
import {
	CallToolRequestSchema,
	ListToolsRequestSchema,
} from '@modelcontextprotocol/sdk/types.js'
import { SecurityError } from './services/security.ts'
import {
	createContinuationBrief,
	createContinuationBriefToolDef,
} from './tools/create-continuation-brief.ts'
import {
	getRelevantSkills,
	getRelevantSkillsToolDef,
} from './tools/get-relevant-skills.ts'
import {
	getSkillResources,
	getSkillResourcesToolDef,
} from './tools/get-skill-resources.ts'
import {
	checkShouldCreateCheckpoint,
	shouldCreateCheckpointToolDef,
} from './tools/should-create-checkpoint.ts'
import { suggestAgent, suggestAgentToolDef } from './tools/suggest-agent.ts'
import {
	updateSessionTracker,
	updateSessionTrackerToolDef,
} from './tools/update-session-tracker.ts'

/**
 * MCP Server Configuration
 */
const SERVER_NAME = 'rad-claude'
const SERVER_VERSION = '1.0.0'

/**
 * Path to skills/ directory
 * Project structure: src/ and skills/ are siblings at root
 *
 * Note: MCP servers should not implement file access restrictions.
 * The MCP client is responsible for sandboxing and permission controls.
 * See: https://modelcontextprotocol.io/specification/draft/basic/security_best_practices
 */
const SKILLS_DIR = resolve(import.meta.dir, '../skills')

/**
 * Sanitize error messages for client responses
 *
 * Security: Log full details server-side, return generic messages to prevent
 * information disclosure (paths, internal structure, enumeration).
 *
 * @param toolName - Name of the tool that failed
 * @param error - The error that occurred
 * @returns Sanitized error message safe for client
 */
function getSanitizedErrorMessage(toolName: string, error: Error): string {
	// Log full error details server-side for debugging
	console.error('[MCP Error]', {
		tool: toolName,
		error: error.message,
		type: error.constructor.name,
		timestamp: new Date().toISOString(),
	})

	// Return generic error to client (prevents information disclosure)
	if (error instanceof SecurityError) {
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

	// Generic fallback (safe default)
	return `${toolName} failed: Please check your input and try again`
}

/**
 * Main server setup
 */
async function main(): Promise<void> {
	// Create MCP server
	const server = new Server(
		{
			name: SERVER_NAME,
			version: SERVER_VERSION,
		},
		{
			capabilities: {
				tools: {},
			},
		}
	)

	// Register tools/list handler
	server.setRequestHandler(ListToolsRequestSchema, async () => ({
		tools: [
			getRelevantSkillsToolDef,
			suggestAgentToolDef,
			getSkillResourcesToolDef,
			updateSessionTrackerToolDef,
			shouldCreateCheckpointToolDef,
			createContinuationBriefToolDef,
		],
	}))

	// Register tools/call handler
	server.setRequestHandler(CallToolRequestSchema, async (request) => {
		const { name, arguments: args } = request.params

		if (name === 'get_relevant_skills') {
			const result = await getRelevantSkills(args, SKILLS_DIR)

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage(
								'get_relevant_skills',
								result.error
							),
						},
					],
					isError: true,
				}
			}

			const { matches, totalSkillsScanned } = result.value

			// Format response (compact)
			const responseText =
				matches.length === 0
					? `0/${totalSkillsScanned} skills`
					: `${matches.length}/${totalSkillsScanned}:\n` +
						matches
							.map((m) => {
								const parts: string[] = []
								if (m.details) {
									if (m.details.keywordScore > 0) {
										parts.push(`kw${m.details.keywordScore}%`)
									}
									if (m.details.fileScore > 0) {
										parts.push(`file${m.details.fileScore}%`)
									}
									if (m.details.contentScore > 0) {
										parts.push(`ct${m.details.contentScore}%`)
									}
								}
								const match = parts.length > 0 ? ` [${parts.join(',')}]` : ''
								return `${m.skill.name}:${m.confidence}%${match}`
							})
							.join('\n')

			return {
				content: [
					{
						type: 'text',
						text: responseText,
					},
				],
			}
		}

		if (name === 'suggest_agent') {
			const result = suggestAgent(args)

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage('suggest_agent', result.error),
						},
					],
					isError: true,
				}
			}

			const { recommendations } = result.value

			// Format response (compact)
			const responseText =
				recommendations.length === 0
					? '0 agents'
					: recommendations
							.map(
								(r) =>
									`${r.agent.name}:${r.confidence}% [${r.matchedSignals.join(',')}]`
							)
							.join('\n')

			return {
				content: [
					{
						type: 'text',
						text: responseText,
					},
				],
			}
		}

		if (name === 'get_skill_resources') {
			const result = getSkillResources(args, SKILLS_DIR)

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage(
								'get_skill_resources',
								result.error
							),
						},
					],
					isError: true,
				}
			}

			const { recommendations, totalResources } = result.value

			// Format response (compact)
			const responseText =
				recommendations.length === 0
					? `0/${totalResources} resources`
					: `${recommendations.length}/${totalResources}:\n` +
						recommendations
							.map(
								(r) =>
									`${r.resource.fileName}:${r.relevance}% ${r.resource.filePath}`
							)
							.join('\n')

			return {
				content: [
					{
						type: 'text',
						text: responseText,
					},
				],
			}
		}

		if (name === 'update_session_tracker') {
			const result = await updateSessionTracker(args, process.cwd())

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage(
								'update_session_tracker',
								result.error
							),
						},
					],
					isError: true,
				}
			}

			return {
				content: [
					{
						type: 'text',
						text: `tracker:${result.value.checkpointStatus}`,
					},
				],
			}
		}

		if (name === 'should_create_checkpoint') {
			const result = await checkShouldCreateCheckpoint(process.cwd())

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage(
								'should_create_checkpoint',
								result.error
							),
						},
					],
					isError: true,
				}
			}

			const { status, shouldSave, stats } = result.value

			const responseText = `${status}:${shouldSave ? 'SAVE' : 'OK'} c${stats.commitsSinceCheckpoint} f${stats.filesModified} w${stats.workCompleted} ${stats.sessionDuration}`

			return {
				content: [
					{
						type: 'text',
						text: responseText,
					},
				],
			}
		}

		if (name === 'create_continuation_brief') {
			const result = await createContinuationBrief(args, process.cwd())

			if (!result.ok) {
				return {
					content: [
						{
							type: 'text',
							text: getSanitizedErrorMessage(
								'create_continuation_brief',
								result.error
							),
						},
					],
					isError: true,
				}
			}

			return {
				content: [
					{
						type: 'text',
						text: `brief:${result.value.briefPath}`,
					},
				],
			}
		}

		return {
			content: [
				{
					type: 'text',
					text: `Unknown tool: ${name}`,
				},
			],
			isError: true,
		}
	})

	// Connect to stdio transport
	const transport = new StdioServerTransport()
	await server.connect(transport)

	console.error(`rad-claude MCP server v${SERVER_VERSION} started`)
	console.error(`Skills directory: ${SKILLS_DIR}`)
}

// Run server
main().catch((error) => {
	console.error('Fatal error:', error)
	process.exit(1)
})
