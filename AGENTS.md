# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

This is a **pnpm repo** containing the backend of an agent platform. The front-end at `packages/ui` is initial mvp front-end not used in practice.

In the subfolder `sphere/`, there is another git repo with the real front-end. Totether, a Web3 crypto application with wallet and blockchain integration


## Development Commands

### Agentic Chatbot (packages/)

```bash
# Run all packages in development mode (parallel)
pnpm dev

# Build all packages
pnpm build

# Run specific package
pnpm --filter agent-server dev
pnpm --filter ui dev
pnpm --filter mcp-trivia dev

# Docker (recommended)
docker-compose up --build
docker-compose logs -f agent-server
```

### Sphere

```bash
cd sphere
pnpm dev         # Vite dev server
pnpm build       # Production build
pnpm lint        # ESLint
pnpm test        # Run tests
```

## Architecture

### Core Agent System Flow

```
User Message
    ↓
Frontend (React/Zustand)
    ↓ HTTP POST /api/chat/stream
Agent Server (Hono)
    ├─ Activity Config (system prompt, LLM, tools)
    ├─ Agent Loop (runAgentStream in loop.ts)
    │   ├─ LLM Provider (Gemini or OpenAI-compatible)
    │   ├─ Tool Execution
    │   │   ├─ MCP Manager (global singleton, persistent connections)
    │   │   └─ Local Tools (memory)
    │   └─ Reference Processing (【ref:id】→ clickable links)
    └─ SSE Stream → Frontend
```

### Key Architectural Patterns

**1. Activity System**

Activities are complete AI agent configurations located in `packages/agent-server/src/config/activities/`. Each activity defines:
- System prompt (with template variable support: `{{userId}}`, `{{serverTime}}`, etc.)
- LLM provider and model
- MCP server list
- Local tools
- Theme and persistence settings

**2. MCP Manager Pattern**

- **Global singleton** at `packages/agent-server/src/agent/mcp/manager.ts`
- Maintains persistent HTTP connections to all MCP servers
- Automatic session regeneration on connection failure
- Converts MCP tools to AI SDK `CoreTool` format
- Passes user metadata (userId, userIp, userCountry, **turnNumber**) to tools

**3. Agent Loop**

Main execution logic in `packages/agent-server/src/agent/loop.ts`:
- Streams LLM responses using AI SDK
- Executes tools via MCP or local handlers
- Implements error recovery: tool failures returned as text observations to LLM, allowing retry with corrected arguments
- Message history truncation (character and message count limits)
- Reference processing for citations

**4. Tool Result Reference System**

Tool results get unique IDs prefixed with turn number (`t1_search_1`, `t2_search_1`) to avoid collisions across conversation turns.

- **ID Generation**: MCP manager adds turn prefix to all tool result IDs (`manager.ts:251-284`)
- **Storage**: In-memory session store (`tool-results-store.ts`) keyed by `userId:activityId`
- **Cleanup**: Sessions expire after 1 hour of inactivity
- **Processing**: LLM references sources as `【ref:id】`, converted to markdown links by `references.ts`
- **Title Sanitization**: Removes quotes, brackets, and special chars that break formatting

**5. Error Recovery Pattern**

Controlled by environment variables:
- `ENABLE_TOOL_RETRY=true` (default)
- `MAX_TOOL_RETRIES=2` (default)

When tools fail:
- Validation/argument errors → returned as instructive text to LLM
- LLM reads error, understands problem, retries with corrections
- Hallucination detection prevents infinite loops by tracking identical tool calls

## Important Files

### Core Logic
- `packages/agent-server/src/agent/loop.ts` - Main agent loop, streaming, tool execution
- `packages/agent-server/src/agent/mcp/manager.ts` - MCP connection management, tool wrapping
- `packages/agent-server/src/agent/references.ts` - Reference marker processing
- `packages/agent-server/src/agent/tool-results-store.ts` - Session-based tool result storage
- `packages/agent-server/src/routes/chat.ts` - SSE streaming endpoint

### Configuration
- `packages/agent-server/src/config/activities/index.ts` - Activity registry
- `packages/agent-server/src/agent/llm/providers.ts` - LLM provider factory
- `packages/shared/src/types/activities.ts` - Activity config schemas

### Frontend
- `packages/ui/src/stores/chatStore.ts` - Zustand state (per-activity message history)
- `packages/ui/src/hooks/useChat.ts` - SSE streaming hook

## Environment Variables

### Required
```bash
GOOGLE_API_KEY=...              # Gemini API key
VITE_API_URL=http://localhost:3000  # Frontend build-time only
CORS_ORIGIN=http://localhost:5173   # Comma-separated origins
```

### MCP Servers
```bash
MCP_TRIVIA_URL=http://mcp-trivia:3001/mcp
MCP_WEB_URL=http://mcp-web:3002/mcp
```

### Optional
```bash
AMA_API_KEY=...                 # Alternative LLM provider
AMA_API_URL=...                 # Alternative LLM base URL
DEBUG_PROMPTS=true              # Log full prompts and messages
DEBUG_MCP=true                  # Log MCP tool calls and results
ENABLE_TOOL_RETRY=true          # Enable error recovery
MAX_TOOL_RETRIES=2              # Max identical tool retries
```

## Adding Activities

1. Create config in `packages/agent-server/src/config/activities/my-activity.ts`
2. Register in `packages/agent-server/src/config/activities/index.ts`
3. Define system prompt with template variables if needed
4. Specify LLM provider, MCP servers, local tools
5. Rebuild: `docker-compose build agent-server`

## Creating MCP Servers

MCP servers are standalone services exposing tools to agents.

**Structure:**
```typescript
// packages/mcp-myservice/src/server.ts
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';

const server = new McpServer({ name: 'myservice', version: '1.0.0' });

server.tool('tool_name', 'Description', schema, async (args, extra) => {
    const userId = extra?.meta?.userId;  // Access user metadata
    const turnNumber = extra?.meta?.turnNumber;  // For unique IDs

    return {
        content: [{
            type: 'text',
            text: JSON.stringify(result)
        }]
    };
});
```

**Tool Results with IDs:**

If your tool returns results that should be referenceable:
```typescript
// Single result
return {
    content: [{
        type: 'text',
        text: JSON.stringify({
            id: 'unique_id',      // Will be prefixed with turn number automatically
            url: 'https://...',
            title: 'Display Title',
            // ... other data
        })
    }]
};

// Multiple results (e.g., search)
return {
    content: [{
        type: 'text',
        text: JSON.stringify({
            results: [
                { id: 'result_1', url: '...', title: '...' },
                { id: 'result_2', url: '...', title: '...' }
            ]
        })
    }]
};
```

The MCP manager will automatically prefix IDs with turn number (e.g., `result_1` → `t1_result_1`).

## Template Variables in System Prompts

Activities support dynamic variable injection:

```typescript
systemPrompt: `You are an assistant.

User Context:
- User ID: {{userId}}
- Server Time: {{serverTime}}
{{#if userTimezone}}- Timezone: {{userTimezone}}
- Local Time: {{localTime}}
{{/if}}{{#if userCountry}}- Country: {{userCountry}}
{{/if}}
`
```

Available variables: `{{userId}}`, `{{serverTime}}`, `{{userIp}}`, `{{userCountry}}`, `{{userTimezone}}`, `{{userLocale}}`, `{{userLanguage}}`, `{{userRegion}}`, `{{localTime}}`

## Common Pitfalls

1. **VITE_API_URL is build-time**: Must rebuild UI after changing
2. **MCP connections are persistent**: Restart agent-server if connection issues
3. **CORS must be explicit**: No wildcards, comma-separate multiple origins
4. **Tool result IDs are auto-prefixed**: Don't manually add turn prefixes
5. **Reference markers use special brackets**: `【ref:id】` not `[ref:id]`
6. **Memory tool uses client localStorage**: Not server-side database
7. **Turn number is 1-indexed**: First assistant message is turn 1

## Docker Setup

All services run as containers via `docker-compose.yml`:
- `agent-server` - Main backend (port 3000)
- `mcp-trivia` - Trivia MCP server (port 3001)
- `mcp-web` - Web fetch MCP server (port 3002)
- `ui` - React frontend (port 5173, commented out mvp code)

Internal networking: MCP servers communicate via service names (`http://mcp-trivia:3001/mcp`).

## Testing

Currently minimal test coverage. MCP servers can have Vitest tests:

```bash
cd packages/mcp-trivia
pnpm test          # Run once
pnpm test:watch    # Watch mode
```

## Sphere Integration Notes

The `sphere/` directory is a **separate React 19 application** with no integration to the agentic-chatbot packages. It features:
- Crypto wallet with seed phrase management
- Nostr protocol for decentralized messaging
- Multi-blockchain support (L1 + L3 rollup)
- Sports betting, gaming, P2P trading modules

Develop sphere independently with its own commands.
