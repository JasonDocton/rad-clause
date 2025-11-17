

<div align="center">
  <img src="https://res.cloudinary.com/df23ubjbb/image/upload/v1635199620/Github/RAD_Logo.png" width="32" />
  <h1>RAD CLAUDE MCP</h1>
<h3>Model Context Protocol server for intelligent skill activation and context management</h3>
  
  <a href="https://claude.ai/">
    <img width="32px" alt="claude" src="https://upload.wikimedia.org/wikipedia/commons/thumb/b/b0/Claude_AI_symbol.svg/1200px-Claude_AI_symbol.svg.png">
  </a>
  <a href="https://modelcontextprotocol.io/docs/getting-started/intro">
    <img width="32px" alt="mcp" src="https://avatars.githubusercontent.com/u/182288589?s=48&v=4">
  </a>
  <a href="https://bun.com">
    <img width="32px" alt="bun" src="https://bun.sh/logo.svg"  />
  </a>
  <br />
  <br />

</div>


The rad-claude MCP server automatically discovers relevant skills, agents, and resources based on your prompts and file context, reducing token usage by 50-70% through progressive disclosure.

**Compatible with:** Claude Desktop, Zed, Cursor, VS Code (Continue), and any MCP-compatible client.


---

**Who is this for?**

This repository is designed for **developers who want to customize and extend** the rad-claude MCP server with their own skills, patterns, and rules. If you want to:
- Add your own skills and semantic patterns
- Modify confidence scoring algorithms
- Extend the agent recommendation system
- Contribute to the rad-claude methodology

Clone this repo and follow the installation instructions below.

**For production use across multiple projects:** Point your MCP clients to `bun run /path/to/rad-claude/src/index.ts`. Only build a [standalone binary](#building-a-standalone-binary) if distributing to users without Bun installed.

## Features

### 1. Intelligent Skill Matching (`get_relevant_skills`)
Analyzes your prompts and open files to recommend the most relevant rad-claude skills with confidence scoring.

**Capabilities:**
- **Weighted confidence scoring** (Keywords 40%, Files 30%, Content 30%)
- **Semantic understanding** - Detects intent beyond keywords (e.g., "webhook" → suggests HTTP actions)
- **File pattern matching** (e.g., open `convex/users.ts` → suggests `convex-patterns`)
- **Context-aware recommendations** (considers working directory, open files)
- **Dynamic weight redistribution** (adapts when signals are missing)

### 2. Agent Recommendations (`suggest_agent`)
Detects when complex tasks need specialized expertise and recommends appropriate agents.

**Available agents:**
- `task-spec-creator` - Multi-step features, architectural changes (>4 hours)
- `convex-architect` - Convex backend work (mutations, queries, schemas)
- `security-auditor` - Security reviews, vulnerability assessments
- `plan-reviewer` - Plan/specification reviews, feasibility checks

### 3. Progressive Resource Loading (`get_skill_resources`)
Discovers and filters resource files within skills based on topic/keywords.

**Benefits:**
- **50-70% token reduction** - Load only relevant resources, not everything
- **Topic-based filtering** - Find specific content (e.g., "react 19", "forms")
- **Relevance scoring** - Resources ranked by match quality
- **Scales with growth** - Efficient as more resources are added

### 4. Session Management (Phase 9)
Intelligent context preservation to prevent work loss before auto-compact.

**Tools:**
- `update_session_tracker` - Records progress at milestones (commits, files, phases)
- `should_create_checkpoint` - Recommends when to save based on natural breakpoints
- `create_continuation_brief` - Generates AI-optimized continuation briefs

**How it works:**
- Tracks commits, files modified, work completed (not token estimation)
- Checkpoint levels: `none` → `suggested` (2+ commits) → `recommended` (3+) → `urgent` (5+)
- Creates hyper-compressed briefs for seamless session resumption

## Token Efficiency

**Zero overhead when not triggered:**
- MCP tool definitions live in system context (one-time ~500 token cost at connection)
- **0 tokens added to your prompts** unless tools are actively called
- Skills only load when relevant (automatic detection)

**When tools are triggered:**
- Compact responses optimized for minimal token usage
- `get_relevant_skills`: ~50-100 tokens (e.g., `2/8:\nconvex-patterns:87% [kw40%,file30%]\nsecurity-patterns:72% [kw40%]`)
- `suggest_agent`: ~30-80 tokens (e.g., `task-spec-creator:85% [multi-step,build,auth]`)
- `get_skill_resources`: ~50-200 tokens (depends on matches)
- Session tools: ~20-60 tokens (minimal status updates)

**Why this matters:**
- Alternative: Loading all 8 skills = **thousands of tokens** every time
- Our approach: **0 tokens baseline**, only pay for what you use
- 50-70% token reduction through progressive disclosure

## Installation

### Prerequisites

- [Bun](https://bun.sh) 1.2+ (recommended) or Node.js 18+
- An MCP-compatible client (Claude Desktop, Zed, Cursor, etc.)

### Step 1: Clone and Install

```bash
git clone https://github.com/youarerad/rad-claude.git
cd rad-claude
bun install
```

Or with npm:
```bash
npm install
```

### Step 2: Find Your Paths

You'll need two absolute paths:

**1. Path to bun executable:**
```bash
which bun
```
Example output: `/Users/username/.bun/bin/bun` (macOS/Linux) or `C:\Users\username\.bun\bin\bun.exe` (Windows)

**2. Path to rad-claude project:**
```bash
pwd
```
Example output: `/Users/username/projects/rad-claude` (macOS/Linux) or `C:\Users\username\projects\rad-claude` (Windows)

### Step 3: Configure Your MCP Client

Choose your client:

#### Claude Desktop

Add to `claude_desktop_config.json`:

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`

```json
{
  "mcpServers": {
    "rad-claude": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/Users/username/projects/rad-claude/src/index.ts"],
      "env": {}
    }
  }
}
```

**Important:**
- Replace `/Users/username/.bun/bin/bun` with your actual bun path from `which bun`
- Replace `/Users/username/projects/rad-claude` with your actual project path from `pwd`
- Use **full absolute paths**, not `~` or relative paths
- On Windows, use backslashes: `C:\\Users\\username\\...`

**Restart:** Quit and relaunch Claude Desktop.

#### Zed

Add to Zed settings (`~/.config/zed/settings.json` or via Settings → Assistant → Edit Context Servers):

```json
{
  "context_servers": {
    "rad-claude": {
      "source": "custom",
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/Users/username/projects/rad-claude/src/index.ts"],
      "env": {}
    }
  }
}
```

Replace paths with your actual bun and project paths.

**Restart:** Reload Zed or restart the editor.

#### Cursor

Add to Cursor MCP settings (`.cursor/mcp.json` in your project or global settings):

```json
{
  "mcpServers": {
    "rad-claude": {
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/Users/username/projects/rad-claude/src/index.ts"]
    }
  }
}
```

Replace paths with your actual bun and project paths.

**Restart:** Restart Cursor.

#### VS Code (with Continue extension)

Add to Continue config (`~/.continue/config.json`):

```json
{
  "mcpServers": [
    {
      "name": "rad-claude",
      "command": "/Users/username/.bun/bin/bun",
      "args": ["run", "/Users/username/projects/rad-claude/src/index.ts"]
    }
  ]
}
```

Replace paths with your actual bun and project paths.

**Restart:** Reload VS Code window.

#### Other MCP Clients

Most MCP clients support stdio transport servers. Add the MCP server with:
- **Command:** Full path to bun (get with `which bun`)
- **Args:** `["run", "/full/path/to/rad-claude/src/index.ts"]`
- **Transport:** stdio (standard input/output)

### Step 4: Verify Installation

After restarting your MCP client, verify the server is connected:

**Claude Desktop:** Settings → Developer → MCP Servers → Look for "rad-claude" with ✓ Connected status

**Test with:**
```
Use get_relevant_skills to find skills for: "implement a new React form with validation"
```

Expected: `react-patterns` and `security-patterns` recommended.

## Building a Standalone Binary

**⚠️ Only needed if you don't have Bun installed**

If you already have Bun installed, **use the source-based approach** from the installation instructions above (point MCP clients to `bun run src/index.ts`). This avoids the 59MB binary overhead.

**When to use the binary:**
- Distributing to users without Bun installed
- Need to lock to a specific Bun runtime version
- Running on machines where you can't install Bun

### Building

```bash
bun run build:binary
```

This creates `dist/rad-claude` - a 59MB standalone executable that includes the Bun runtime and all dependencies.

### Using the Binary in MCP Clients

#### Claude Desktop

```json
{
  "mcpServers": {
    "rad-claude": {
      "command": "/Users/username/projects/rad-claude/dist/rad-claude",
      "args": []
    }
  }
}
```

#### Zed

```json
{
  "context_servers": {
    "rad-claude": {
      "command": {
        "path": "/Users/username/projects/rad-claude/dist/rad-claude",
        "args": []
      }
    }
  }
}
```

#### Cursor / VS Code / Other Clients

Use the same pattern - point to the binary path with no args needed.

Replace `/Users/username/projects/rad-claude` with your actual project path.

**Benefits (when Bun isn't installed):**
- ✅ No Bun runtime installation required
- ✅ Single file deployment (59MB)
- ✅ Version lock (Bun runtime + dependencies bundled)

**Trade-offs:**
- ❌ 59MB file size (vs ~9MB source code)
- ❌ Must rebuild after any source changes
- ❌ Bundles entire Bun runtime (unnecessary if Bun already installed)

**Recommendation:** If you have Bun installed, use the source-based approach instead.

## Usage Examples

### Example 1: Find Relevant Skills

**Prompt:**
```
I need to create a Convex mutation for user authentication
```

**Tool called automatically:** `get_relevant_skills`

**Response:**
```
2/10:
convex-patterns:87% [kw40%,file30%]
security-patterns:72% [kw40%]
```

Compact format: `skill:confidence% [breakdown]` - optimized for token efficiency.

### Example 2: Agent Recommendations

**Prompt:**
```
I want to build a complete multi-step authentication system with OAuth, sessions, and role-based access control
```

**Tool called automatically:** `suggest_agent`

**Response:**
```
task-spec-creator:85% [multi-step,build,authentication,system]
security-auditor:75% [authentication,oauth]
```

Compact format: `agent:confidence% [matched-signals]` - load `agents/{name}.md` for details.

### Example 3: Progressive Resource Loading

**Prompt:**
```
Show me resources about React 19 features
```

**Tool called:** `get_skill_resources`

**Response:**
```
2/4:
react-19-2-features.md:90% skills/react-patterns/resources/react-19-2-features.md
react-19-use-hook.md:80% skills/react-patterns/resources/react-19-use-hook.md
```

Compact format: `filename:relevance% path` - read the path for full content.

## Architecture

### Project Structure

```
rad-claude/
├── src/
│   ├── index.ts                      # Main MCP server (stdio transport)
│   ├── tools/
│   │   ├── get-relevant-skills.ts    # Skill matching with confidence scoring
│   │   ├── suggest-agent.ts          # Agent recommendations
│   │   ├── get-skill-resources.ts    # Progressive resource discovery
│   │   ├── update-session-tracker.ts # Session progress tracking
│   │   ├── should-create-checkpoint.ts # Checkpoint recommendations
│   │   └── create-continuation-brief.ts # Continuation brief generation
│   ├── services/
│   │   ├── skill-discovery.ts        # YAML frontmatter parsing, file scanning
│   │   ├── pattern-matcher.ts        # Multi-signal matching (keywords/files/content)
│   │   ├── confidence-scorer.ts      # Weighted scoring algorithm (semantic patterns)
│   │   ├── session-tracker.ts        # Session state management
│   │   └── security.ts               # Path validation, sandboxing
│   └── types/
│       └── schemas.ts                # Zod validation schemas
├── skills/                           # 8 rad-claude skills
├── agents/                           # Specialized agents (task-spec-creator)
├── archive/                          # Historical docs, reports, tests
├── package.json
├── tsconfig.json
└── README.md
```

### Technology Stack

- **Runtime:** Bun 1.2+ (2-5x faster than Node.js)
- **Language:** TypeScript 5.9+ (strict mode)
- **SDK:** @modelcontextprotocol/sdk v1.22+ (modern McpServer API)
- **Validation:** Zod 3.1+ (runtime + compile-time)
- **Transport:** stdio (Claude Desktop native)
- **Architecture:** Modern MCP SDK with structured content + compact text responses

### Performance Targets

- Pattern matching: <100ms
- Memory usage: <50MB
- Skill discovery: Cached after first scan

### Security

- **File access:** Restricted to project directory and subdirectories (allowlist)
- **Validation:** Multi-layer (Zod → path normalization → symlink resolution → allowlist)
- **Symlinks:** Resolved before validation to prevent directory escape
- **Errors:** Graceful error handling, never crashes

## Development

### Run Tests

Tests are available to verify functionality. The MCP server has been tested for:
- Semantic skill detection and confidence scoring
- Pattern matching and file analysis
- Security validation and path restrictions
- Agent recommendations
- Resource discovery and filtering
- Session management

### Type Checking

```bash
bun run typecheck
```

### Development Mode (Hot Reload)

```bash
bun run dev
```

## Troubleshooting

### "spawn bun ENOENT" or "server disconnected"

**Error:** `MCP rad-claude: spawn bun ENOENT` or `server disconnected`

**Cause:** GUI apps (Claude Desktop, Zed, etc.) can't find `bun` in their PATH.

**Fix:** Use the **full path** to bun instead of just `bun`:

1. Find bun path: `which bun` → `/Users/username/.bun/bin/bun`
2. Update config to use full path:
   ```json
   {
     "mcpServers": {
       "rad-claude": {
         "command": "/Users/username/.bun/bin/bun",
         "args": ["run", "/Users/username/projects/rad-claude/src/index.ts"]
       }
     }
   }
   ```
3. Replace `/Users/username/.bun/bin/bun` with your actual path
4. Fully quit and restart your MCP client

**On Windows:** Use `where bun` to find the path, then use backslashes: `C:\\Users\\username\\.bun\\bin\\bun.exe`

### MCP server not appearing

1. **Check config path:** Verify your MCP client's config file location
2. **Check absolute paths:** Both bun and project paths must be absolute (no `~` or `./`)
3. **Restart client:** Fully quit and relaunch your MCP client (Cmd+Q on macOS)
4. **Check logs:** Most MCP clients have logs (Claude Desktop: Settings → Developer → MCP Servers)
5. **Test command manually:** Run `<your-bun-path> run <your-project-path>/src/index.ts` to verify it works

### "Skill not found" errors

1. **Verify directory structure:** Ensure `skills/` exists with SKILL.md files
2. **Check SKILL.md format:** Validate YAML frontmatter syntax
3. **Check logs:** Review MCP client logs for error details

### Low confidence scores

This is often expected:
- **<70% confidence:** Skill not auto-loaded (correct behavior for weak matches)
- **70-89% confidence:** Skill suggested but not auto-loaded
- **90%+ confidence:** Skill auto-loaded

If you expect higher confidence:
1. **Add keywords:** Update skill SKILL.md frontmatter with relevant keywords
2. **Add file patterns:** Include glob patterns in `triggers.files.include`
3. **Check prompt clarity:** More specific prompts yield better matches

### Performance issues

1. **First run is slower:** Skill discovery caches after initial scan
2. **Check skill count:** >20 skills may impact scan performance
3. **Profile with:** `bun run dev` and monitor console output

## Related Documentation

- **Skills:** `skills/*/SKILL.md` - 8 rad-claude skills with semantic keyword coverage
  - `bun-patterns` - Bun runtime best practices
  - `convex-patterns` - Convex backend with HTTP actions, webhooks
  - `framework-patterns` - Next.js and TanStack framework detection
  - `naming-conventions` - File and variable naming standards
  - `react-patterns` - Modern React 19+ with TypeScript
  - `security-patterns` - Validation, authentication, encryption
  - `tailwind-patterns` - Tailwind CSS styling patterns
  - `typescript-patterns` - Type safety and utility types
- **Agents:** `agents/task-spec-creator/` - Task specification creator for complex features
- **Optimization:** `OPTIMIZATION_SUMMARY.md` - Token efficiency lessons and best practices

## Implementation History

This MCP server was built and refined through multiple phases:

**Core Implementation (Phases 1-5):**
1. ✅ **Foundation** - Skill discovery, keyword matching, basic MCP server
2. ✅ **Intelligence Layer** - Weighted confidence scoring, file pattern matching
3. ✅ **Security Layer** - Path validation, symlink resolution, sandboxing
4. ✅ **Agent Intelligence** - Agent recommendations with reasoning
5. ✅ **Progressive Disclosure** - Resource file suggestions with relevance scoring

**Session Management (Phase 9):**
6. ✅ **Context Preservation** - Session tracking, checkpoint recommendations, continuation briefs

**Optimization & Semantic Detection:**
7. ✅ **Token Optimization** - 27% reduction in skill content while maintaining clarity
8. ✅ **Content Scoring** - Semantic pattern matching for intelligent skill detection
9. ✅ **Semantic Keywords** - 41 keywords added across 4 skills for intent understanding

**Modern Architecture (v2.0.0):**
10. ✅ **MCP SDK Migration** - Modern McpServer API with tool annotations
11. ✅ **Structured Content** - Dual response format (compact text + structured data)
12. ✅ **Output Schemas** - Zod schemas for runtime validation and type safety
13. ✅ **Code Quality** - Following internal typescript-patterns and naming-conventions skills

See `OPTIMIZATION_SUMMARY.md` for optimization lessons and best practices.

## Support

- **Issues**: [GitHub Issues](https://github.com/JasonDocton/rad-discord-bot/issues)
- **Discord**: jasondocton

- **[Consider Sponsoring YouAreRAD](https://github.com/sponsors/youarerad)**: Just $30 helps our non-profit cover the cost of mental health care for someone in need.

---

<div align="center"><img src="https://res.cloudinary.com/df23ubjbb/image/upload/v1635199620/Github/RAD_Logo.png" width="32" /> </div>

[⬆ Back to Top](#RAD-CLAUDE-MCP)
