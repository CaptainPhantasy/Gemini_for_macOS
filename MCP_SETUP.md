# GEMINI Desktop Commander MCP Integration

**Status**: ✅ Complete — Desktop Commander MCP is now integrated as the primary agent tool interface.

## What's New

The GEMINI agent now has **real, persistent access to your local file system** through the Desktop Commander MCP (Model Context Protocol) integration.

### Agent Capabilities

The GEMINI agent can now:

- **Read any file** on your local system
- **Write and create files** in permitted directories
- **Execute shell commands** with explicit permission
- **List and browse directories**
- **Delete files and directories** (with confirmation)
- **Get file metadata** (size, modification time, etc.)
- **All operations are local** — nothing leaves your machine

## Architecture

```
┌─────────────────────────────────────────────────────────┐
│                    GEMINI Web Interface                 │
│              (React, port 13000)                        │
└───────────────────────┬─────────────────────────────────┘
                        │
                        │ WebSocket
                        │ JSON-RPC
                        ▼
┌─────────────────────────────────────────────────────────┐
│           MCP Backend Server                            │
│         (Node.js Express, port 13001)                   │
│    • Desktop Commander tools                           │
│    • File system access                                 │
│    • Command execution                                  │
│    • Permission handling                               │
└──────────────────────────────────────────────────────────┘
                        │
                        ▼
                  Local File System
```

## Getting Started

### 1. Install Dependencies

```bash
npm install
```

This installs:
- `ws` — WebSocket server for MCP
- `concurrently` — Run frontend and backend simultaneously
- All other project dependencies

### 2. Start GEMINI with MCP

```bash
npm run dev
```

This command:
- Starts the MCP backend on **port 13001**
- Starts the GEMINI frontend on **port 13000**
- Both services run concurrently

You should see:
```
✓ GEMINI MCP Server running on port 13001
✓ Vite dev server running at http://localhost:13000
```

### 3. Configure Your API Key

1. Open GEMINI at `http://localhost:13000`
2. Click **Settings** (⚙️ icon in the sidebar)
3. Paste your Google AI Studio API key in the **API Key** field
4. Save settings

### 4. Start Using Agent Tools

In the chat, ask GEMINI to:

- **"Read the README file"** → Agent reads `/Volumes/SanDisk1Tb/GEMINI for MacOS/README.md`
- **"Create a file called test.txt with hello world"** → Agent creates and writes to file
- **"List all files in the src directory"** → Agent browses the directory
- **"Execute `npm list | head -5`"** → Agent runs shell commands

## Available Tools

### read_file
Read the contents of a file.
```
Tool: read_file
Args: {"path": "/path/to/file.txt"}
```

### write_file
Write content to a file (creates if doesn't exist).
```
Tool: write_file
Args: {"path": "/path/to/file.txt", "content": "file content here"}
```

### list_directory
List files and directories.
```
Tool: list_directory
Args: {"path": "/path/to/directory"}
```

### execute_command
Execute a shell command.
```
Tool: execute_command
Args: {"command": "ls -la ~/.ssh"}
```

### delete_file
Delete a file.
```
Tool: delete_file
Args: {"path": "/path/to/file.txt"}
```

### create_directory
Create a directory.
```
Tool: create_directory
Args: {"path": "/path/to/new/directory"}
```

### file_info
Get file metadata.
```
Tool: file_info
Args: {"path": "/path/to/file"}
```

## Permission Model

GEMINI uses a permission system with different autonomy modes:

### Autonomy Modes

**YOLO** (Current default)
- All file operations auto-approved
- No confirmation dialogs
- Use only if you trust the agent prompts

**risk-based**
- READ operations auto-approved
- WRITE and EXECUTE require confirmation
- Balanced safety/usability

**scoped**
- Only operations on specified paths are auto-approved
- Other operations require confirmation
- Configure scoped paths in Settings

**locked**
- All operations require explicit confirmation
- Most restrictive mode
- Safest for exploration

### Change Autonomy Mode

1. Settings (⚙️) → Autonomy Mode
2. Select desired mode
3. Save

## Security Considerations

### ✅ What's Safe

- Agent cannot run code it didn't write
- All operations are explicit tool calls
- Permission system prevents accidental changes
- No automatic code execution from chat text

### ⚠️ What to Watch

- Agent has access to your entire file system
- Command execution runs with your user permissions
- Don't run malicious prompts or untrusted chat content
- Review generated code before approving execution

### 🛡️ Best Practices

1. **Start with risk-based mode** until you trust the agent
2. **Use scoped paths** for sensitive work
3. **Review tool calls** before approving execution
4. **Keep API key secure** — never share it
5. **Monitor command execution** for unintended operations

## Troubleshooting

### MCP Server won't start

```bash
# Check if port 13001 is in use
lsof -i :13001

# Kill any process using the port
kill -9 <PID>

# Try running again
npm run dev
```

### "MCP Server not connected" error

1. Check that `npm run dev` is running both processes
2. Verify port 13001 is open
3. Check browser console for WebSocket errors
4. Restart: `npm run dev`

### Tools not showing up

1. Ensure MCP server is running (check console)
2. Refresh the page (⌘R)
3. Wait 2-3 seconds for tools to load
4. Check browser console for errors

### Permission denied errors

1. Check file/directory permissions: `ls -l /path/to/file`
2. Make sure you're not trying to write to protected areas (`/System`, `/Applications`)
3. Change autonomy mode in Settings
4. Create files in `/tmp` or your home directory first

## Advanced Usage

### Custom MCP Servers

The Settings panel lets you add custom MCP servers:

1. Settings (⚙️) → MCP Servers
2. Click "+ Add MCP Server"
3. Configure server details:
   - **Type**: `stdio`, `websocket`, or `sse`
   - **Command/URL**: How to connect to the server
   - **Enable**: Toggle on/off
4. Save

### Running Commands

The agent can execute any shell command:

```
Tool: execute_command
Args: {"command": "find /src -name '*.ts' -type f | wc -l"}
```

Results return `stdout` and `stderr`.

### Working with Large Files

For large files:
- Use `list_directory` to browse first
- Read specific files with `read_file`
- Don't try to read entire GB-sized files at once
- Consider using `execute_command` for efficient filtering: `head -100 /large/file.log`

## Integration with GEMINI

### Agent Tools in Chat

The agent automatically has access to all MCP tools in the chat:

```
User: "Create a test file with 100 random lines"

Agent: I'll create a test file with random content.

Tool: execute_command
Args: {"command": "seq 1 100 | shuf > /tmp/test.txt"}

Tool: read_file
Args: {"path": "/tmp/test.txt"}

[Agent reads back 10 lines of the file to verify]

User sees: "Created /tmp/test.txt with 100 random lines"
```

### Multi-step Workflows

The agent can chain tools:

1. Read configuration
2. Modify it
3. Write it back
4. Execute a command that uses the config
5. Read output and report results

Example:

```
User: "Update all .env files with new API key and restart services"

Agent performs:
1. list_directory .env files
2. read_file each .env
3. write_file with new key
4. execute_command to restart
5. execute_command to verify
```

## Monitoring and Logging

### Browser Console

Chrome DevTools (⌘Option+J) shows:
- WebSocket connection status
- Tool execution logs
- Error messages
- Timing information

Example:
```
✓ Loaded 7 MCP tools
Tool executed: read_file
Result: [file content]
```

### MCP Server Logs

The backend logs to stdout when running:
```
✓ MCP Client connected
Tool call: read_file → /path/to/file
✓ MCP Client disconnected
```

## Future Enhancements

Planned additions:

- **File watchers** — Monitor directories for changes
- **Scheduled file operations** — Run tasks on a schedule
- **File sync** — Sync directories to remote storage
- **Version control** — Git integration for file changes
- **Collaborative editing** — Multiple users on shared files
- **Advanced permissions** — Role-based access control

## Support

Issues or questions?

1. Check the **Troubleshooting** section above
2. Review browser console errors
3. Verify MCP server is running: `lsof -i :13001`
4. Restart everything: `npm run dev`

---

**GEMINI Desktop Commander MCP Integration v1.0**
*Real file system access for local-first AI agents*
