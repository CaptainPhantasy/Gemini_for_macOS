# GEMINI for MacOS API Contract

## FLUM-Compliant LLM-First Interface Design

**Version:** 1.0.0
**Last Updated:** 2026-04-18
**Base URL:** `http://localhost:13001`

---

## Design Principles (FLUM Standard)

This API follows Floyd's Labs Unified Methodology (FLUM) for LLM-First interface design:

1. **One Door In** - Action is a parameter, not endpoint selection
2. **Floor-Level Simplicity** - 3 or fewer required fields per operation
3. **Progressive Disclosure** - Optional fields for advanced controls
4. **Self-Documenting Responses** - status, result, hint, actions_available
5. **Server Does the Thinking** - Atomic protocol with pending status
6. **Plain Language Over Jargon** - No technical jargon
7. **Error Messages are Instructions** - what + how + next steps
8. **Diagnostic-First Capability** - diagnostic_dump parameter
9. **Contextual Teaching** - tip field for inefficient behavior
10. **Human-User Robustness** - Clarity forced by SLM optimization

---

## Response Structure

All API responses follow this FLUM-compliant structure:

```json
{
  {
    status: 'success' | 'failure' | 'pending',
    result: string,           // What happened (human-readable)
    hint: string,             // What to do next (instruction)
    actions_available: string[],  // Available next actions
    tip?: string,             // Contextual teaching (optional)
    metadata: {
      latency_ms: number,     // Server processing time
      trace_id: string,       // Unique request ID for debugging
      tool?: string,          // Tool that was executed
      error?: string          // Error details if failure
    },
    advanced: object | null   // Detailed data if requested
  }
}
```

---

## Endpoints

### 1. GET /api/health

**Purpose:** Quick system health check

**Response Example:**
```json
{
  status: 'success',
  result: 'System healthy. 26 tools available.',
  hint: 'Ready for operations.',
  actions_available: ['GET /api/tools', 'GET /api/diagnostic'],
  metadata: {
    latency_ms: 0,
    trace_id: 'flum_mo47uhp9_ppx6wo',
    tool: 'health'
  },
  advanced: {
    status: 'healthy',
    tools: 26
  }
}
```

---

### 2. GET /api/diagnostic

**Purpose:** Full system state for troubleshooting

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| include_advanced | boolean | No | Include full diagnostic data |

**Response Example:**
```json
{
  status: 'success',
  result: 'System diagnostic complete. MCP connected with 26 tools.',
  hint: 'Use /api/tools to list operations, or /api/execute to perform an action.',
  actions_available: ['GET /api/tools', 'GET /api/execute'],
  metadata: {
    latency_ms: 1,
    trace_id: 'flum_mo47uhpf_qyttx2',
    tool: 'diagnostic'
  },
  advanced: {
    mcp_server: {
      status: 'connected',
      url: 'ws://localhost:13001/mcp',
      tools_available: 26,
      desktop_commander_tools: 26
    },
    environment: {
      platform: 'darwin',
      node_version: 'v25.9.0',
      uptime_seconds: 12345
    },
    timestamp: '2026-04-18T10:50:29.000Z'
  }
}
```

---

### 3. GET /api/tools

**Purpose:** List all available tools with FLUM-compliant descriptions

**Response Example:**
```json
{
  status: 'success',
  result: '26 tools available for file system and process operations.',
  hint: 'Choose a tool and call POST /api/execute with action={tool_name}',
  actions_available: [
    'POST /api/execute?action=get_config',
    'POST /api/execute?action=set_config_value',
    'POST /api/execute?action=read_file',
    ... (all 26 tools)
  ],
  tip: 'For file operations: read_file, write_file, list_directory. For processes: start_process, list_processes.',
  metadata: {
    latency_ms: 0,
    trace_id: 'flum_mo47uhpg_dfola4',
    tool: 'list_tools',
    tool_count: 26
  },
  advanced: {
    tools: [
      {
        name: 'get_config',
        description: 'Get the complete settings',
        parameters: [],
        required: []
      },
      ... (all tools with their parameters)
    ]
  }
}
```

---

### 4. POST /api/execute (One Door In)

**Purpose:** Single entry point for all tool operations

**Query Parameters:**
| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| action | string | Yes | Tool to execute (e.g., read_file, write_file) |
| path | string | No | File/directory path |
| content | string | No | Content for write operations |
| command | string | No | Command for execute operations |
| sessionId | string | No | Session ID for process operations |
| pid | number | No | Process ID for kill operations |
| destination | string | No | Destination for move operations |
| input | string | No | Input for interactive processes |

**Success Response Example:**
```json
{
  status: 'success',
  result: 'Directory listed successfully. 15 items found.',
  hint: 'Read the content above. Use write_file to modify.',
  actions_available: ['GET /api/tools', 'GET /api/diagnostic', 'POST /api/execute?action=read_file'],
  metadata: {
    latency_ms: 54,
    trace_id: 'flum_mo47uhpk_rzt8h',
    tool: 'list_directory'
  }
}
```

**Failure Response Example:**
```json
{
  status: 'failure',
  result: 'read_file failed: Path not allowed',
  hint: 'Path must be within allowed directories: /Volumes/Storage/',
  actions_available: ['GET /api/tools', 'GET /api/diagnostic'],
  metadata: {
    latency_ms: 39,
    trace_id: 'flum_mo47uhpl_s9kw3',
    tool: 'read_file',
    error: 'Path not allowed'
  }
}
```

---

### 5. GET /api/execute

**Purpose:** Read-only alternative for simple queries

Same parameters as POST, but returns cached or computed results without side effects.

---

## Available Tools (26 Desktop Commander Tools)

### File Operations

| Tool | Parameters | Description |
|------|------------|-------------|
| `read_file` | path (required) | Read file content |
| `read_multiple_files` | paths (required) | Read multiple files at once |
| `write_file` | path (required), content (required) | Write content to file |
| `write_pdf` | path (required), content (required) | Write PDF document |
| `create_directory` | path (required) | Create a new directory |
| `list_directory` | path (required), depth (optional) | List directory contents |
| `move_file` | source (required), destination (required) | Move or rename files |
| `delete_file` | path (required) | Delete a file |
| `file_info` | path (required) | Get file metadata |
| `edit_block` | path (required), old_string (required), new_string (required) | Edit specific text block |

### Search Operations

| Tool | Parameters | Description |
|------|------------|-------------|
| `start_search` | path (required), query (required) | Start file content search |
| `get_more_search_results` | searchId (required) | Get more search results |
| `stop_search` | searchId (required) | Stop an active search |
| `list_searches` | - | List all active searches |

### Process Management

| Tool | Parameters | Description |
|------|------------|-------------|
| `start_process` | command (required), cwd (optional) | Start interactive terminal process |
| `read_process_output` | sessionId (required), lines (optional) | Read process output |
| `interact_with_process` | sessionId (required), input (required) | Send input to process |
| `force_terminate` | sessionId (required) | Force terminate a session |
| `list_sessions` | - | List all active terminal sessions |
| `list_processes` | limit (optional) | List running system processes |
| `kill_process` | pid (required) | Terminate a process by PID |

### Configuration & Stats

| Tool | Parameters | Description |
|------|------------|-------------|
| `get_config` | - | Get Desktop Commander configuration |
| `set_config_value` | key (required), value (required) | Set configuration value |
| `get_usage_stats` | - | Get usage statistics |
| `get_recent_tool_calls` | limit (optional) | Get recent tool call history |
| `get_prompts` | - | Get available prompt templates |
| `give_feedback_to_desktop_commander` | message (required) | Send feedback |

---

## Error Codes

| Code | Meaning | Action |
|------|---------|--------|
| `ENOENT` | Path does not exist | Check path and try again |
| `EACCES` | Permission denied | Check file permissions |
| `ENOTDIR` | Path is not a directory | Verify path is correct |
| `EISDIR` | Path is a directory | Use list_directory instead |
| `Path not allowed` | Outside allowed paths | Use paths within /Volumes/Storage/ |

---

## Path Restrictions

Desktop Commander enforces path restrictions for security:

- **Allowed paths:** `/Volumes/Storage/` and its subdirectories
- **Blocked commands:** Dangerous system commands (mkfs, format, mount, sudo, etc.)

---

## Example Usage

### List Directory
```bash
curl 'http://localhost:13001/api/execute?action=list_directory&path=/Volumes/Storage'
```

### Read File
```bash
curl 'http://localhost:13001/api/execute?action=read_file&path=/Volumes/Storage/document.txt'
```

### Write File
```bash
curl -X POST 'http://localhost:13001/api/execute?action=write_file&path=/Volumes/Storage/output.txt&content=Hello%20World'
```

### Get System Health
```bash
curl 'http://localhost:13001/api/health'
```

### List All Tools
```bash
curl 'http://localhost:13001/api/tools'
```

---

## Technical Details

- **Server:** Express.js with WebSocket support
- **MCP Protocol:** JSON-RPC 2.0 over stdio
- **Desktop Commander:** Version 0.2.38
- **Protocol Version:** 2024-11-05
- **Port:** 13001

---

See [CHAT-ABORT.md](./CHAT-ABORT.md) for the abort-aware streaming generation contract (Chat barge-in and queue features).

## Changelog

### v1.0.0 (2026-04-18)
- Initial FLUM-compliant API implementation
- 26 Desktop Commander tools integrated
- One Door In architecture for all operations
- Self-documenting responses with hints and actions
- Full diagnostic capability with /api/diagnostic