# Sui DeepBook Course

Interactive course framework for advanced Sui/DeepBook developers.

## Install

```bash
pnpm install
cd mcp/server && pnpm install
```

## Build the MCP server

```bash
cd mcp/server
pnpm build
```

## Run tests

```bash
pnpm test
```

## Install as Claude Code plugin

Add the plugin to Claude Code:

```bash
claude plugin add /path/to/sui-mcp-course
```

Then run `/sui-deepbook-course:start` in any Claude Code session to begin.

## Development

The MCP server lives in `mcp/server/`. Source files are under `src/`.
Learning path definitions live under `paths/<slug>/`.
