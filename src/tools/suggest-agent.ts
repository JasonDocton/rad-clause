/**
 * suggest_agent MCP Tool
 *
 * Analyzes user prompts and recommends appropriate rad-claude agents
 * for complex tasks that benefit from specialized expertise.
 *
 * Version: 2.0.0
 * - Exports output schema for modern MCP SDK
 */

import { z } from 'zod'
import type { SuggestAgentOutput } from '../types/output-schemas.ts'
import type { Result } from '../types/schemas.ts'

export type { SuggestAgentOutput } from '../types/output-schemas.ts'
// Re-export schemas and types for modern MCP SDK
export { suggestAgentOutputSchema } from '../types/output-schemas.ts'

/**
 * Agent metadata and matching patterns
 */
interface AgentMetadata {
	readonly name: string
	readonly description: string
	readonly whenToUse: string
	readonly complexitySignals: readonly string[]
	readonly domainSignals: readonly string[]
	readonly estimatedDuration: string
}

/**
 * Agent recommendation with reasoning
 */
export interface AgentRecommendation {
	readonly agent: AgentMetadata
	readonly confidence: number
	readonly reasoning: string
	readonly matchedSignals: readonly string[]
}

/**
 * Available rad-claude agents
 */
const AGENTS: readonly AgentMetadata[] = [
	{
		name: 'task-spec-creator',
		description: 'Creates detailed task specifications for complex features',
		whenToUse: 'Multi-step features, architectural changes, tasks >4 hours',
		complexitySignals: [
			'multi-step',
			'architecture',
			'refactor entire',
			'redesign',
			'rebuild',
			'major feature',
			'complex',
			'system',
			'build',
			'implement new',
			'add feature',
		],
		domainSignals: ['feature', 'system', 'workflow', 'integration'],
		estimatedDuration: '>4 hours',
	},
	{
		name: 'convex-architect',
		description:
			'Expert in Convex backend implementation with security best practices',
		whenToUse:
			'Convex backend work, mutations, queries, schemas, database design',
		complexitySignals: ['implement', 'create', 'build', 'design', 'refactor'],
		domainSignals: [
			'convex',
			'mutation',
			'query',
			'action',
			'schema',
			'database',
			'backend',
			'api',
			'server',
		],
		estimatedDuration: '1-4 hours',
	},
	{
		name: 'security-auditor',
		description: 'Reviews code for security vulnerabilities and best practices',
		whenToUse:
			'Security reviews, auth implementation, vulnerability assessment',
		complexitySignals: [
			'audit',
			'review',
			'check',
			'verify',
			'assess',
			'analyze',
		],
		domainSignals: [
			'security',
			'auth',
			'authentication',
			'authorization',
			'validation',
			'sanitize',
			'vulnerability',
			'exploit',
			'xss',
			'sql injection',
			'csrf',
		],
		estimatedDuration: '1-2 hours',
	},
	{
		name: 'plan-reviewer',
		description: 'Reviews task specifications and implementation plans',
		whenToUse: 'Reviewing plans, assessing feasibility, catching issues early',
		complexitySignals: ['review', 'assess', 'evaluate', 'check', 'validate'],
		domainSignals: [
			'plan',
			'specification',
			'task spec',
			'design',
			'approach',
			'strategy',
		],
		estimatedDuration: '30 minutes - 1 hour',
	},
] as const

/**
 * Input schema for suggest_agent tool
 * Phase 8: Added .trim() for security (prevent whitespace-only inputs)
 */
export const suggestAgentInputSchema = z.object({
	prompt: z.string().trim().min(1).max(10000),
})

export type SuggestAgentInput = z.infer<typeof suggestAgentInputSchema>

/**
 * Match a prompt against an agent's patterns
 */
function matchAgent(
	prompt: string,
	agent: AgentMetadata
): {
	confidence: number
	matchedSignals: readonly string[]
	reasoning: string
} {
	const normalizedPrompt = prompt.toLowerCase()
	const matchedSignals: string[] = []

	// Check complexity signals
	for (const signal of agent.complexitySignals) {
		if (normalizedPrompt.includes(signal)) {
			matchedSignals.push(signal)
		}
	}

	// Check domain signals
	for (const signal of agent.domainSignals) {
		if (normalizedPrompt.includes(signal)) {
			matchedSignals.push(signal)
		}
	}

	if (matchedSignals.length === 0) {
		return { confidence: 0, matchedSignals: [], reasoning: '' }
	}

	// Calculate confidence
	// Base: 60% for first match
	// +10% for each additional match (capped at 95%)
	const baseConfidence = 60
	const bonusPerMatch = 10
	const confidence = Math.min(
		95,
		baseConfidence + (matchedSignals.length - 1) * bonusPerMatch
	)

	// Generate reasoning
	const reasoning = generateReasoning(agent, matchedSignals)

	return { confidence, matchedSignals, reasoning }
}

/**
 * Generate human-readable reasoning for agent recommendation
 */
function generateReasoning(
	agent: AgentMetadata,
	matchedSignals: readonly string[]
): string {
	const reasons: string[] = []

	// Check for complexity indicators
	const complexityMatches = matchedSignals.filter((s) =>
		agent.complexitySignals.includes(s)
	)
	const domainMatches = matchedSignals.filter((s) =>
		agent.domainSignals.includes(s)
	)

	// Agent-specific reasoning
	if (agent.name === 'task-spec-creator') {
		if (
			complexityMatches.some((s) =>
				['multi-step', 'architecture', 'complex', 'major feature'].includes(s)
			)
		) {
			reasons.push('This appears to be a complex, multi-step task')
		}
		if (matchedSignals.length >= 3) {
			reasons.push(`Estimated as a ${agent.estimatedDuration} task`)
		}
		reasons.push(
			'task-spec-creator will create a detailed specification with phases, context strategy, and success criteria'
		)
	} else if (agent.name === 'convex-architect') {
		if (domainMatches.length > 0) {
			reasons.push(
				`Convex-specific work detected: ${domainMatches.slice(0, 3).join(', ')}`
			)
		}
		reasons.push(
			'convex-architect specializes in backend implementation with security best practices'
		)
	} else if (agent.name === 'security-auditor') {
		if (domainMatches.length > 0) {
			reasons.push(`Security concerns: ${domainMatches.slice(0, 3).join(', ')}`)
		}
		reasons.push(
			'security-auditor will review for vulnerabilities and recommend mitigations'
		)
	} else if (agent.name === 'plan-reviewer') {
		if (domainMatches.some((s) => ['plan', 'specification'].includes(s))) {
			reasons.push('Plan or specification review requested')
		}
		reasons.push(
			'plan-reviewer will assess feasibility and catch potential issues early'
		)
	}

	return reasons.join('. ')
}

/**
 * Suggest agents for a given prompt
 *
 * @param input - User's prompt describing the task
 * @returns Agent recommendations sorted by confidence
 */
export function suggestAgent(
	input: unknown
): Result<SuggestAgentOutput, Error> {
	// Validate input
	const validation = suggestAgentInputSchema.safeParse(input)
	if (!validation.success) {
		return {
			ok: false,
			error: new Error(`Invalid input: ${validation.error.message}`),
		}
	}

	const { prompt } = validation.data

	// Match against all agents
	const recommendations: AgentRecommendation[] = []

	for (const agent of AGENTS) {
		const { confidence, matchedSignals, reasoning } = matchAgent(prompt, agent)

		// Only include recommendations with >50% confidence
		if (confidence >= 50) {
			recommendations.push({
				agent,
				confidence,
				reasoning,
				matchedSignals: [...matchedSignals],
			})
		}
	}

	// Sort by confidence (highest first)
	recommendations.sort((a, b) => b.confidence - a.confidence)

	return {
		ok: true,
		value: {
			recommendations: recommendations.map((r) => ({
				agent: {
					name: r.agent.name,
					description: r.agent.description,
					whenToUse: r.agent.whenToUse,
					estimatedDuration: r.agent.estimatedDuration,
				},
				confidence: r.confidence,
				reasoning: r.reasoning,
				matchedSignals: [...r.matchedSignals],
			})),
		},
	}
}

/**
 * Tool definition for MCP server
 */
export const suggestAgentToolDef = {
	name: 'suggest_agent',
	description:
		'Recommend agents for complex tasks: task-spec, convex, security, plan review',
	inputSchema: {
		type: 'object',
		properties: {
			prompt: {
				type: 'string',
				description: 'Task description',
			},
		},
		required: ['prompt'],
	},
} as const
