# Sui DeepBook Course

Interactive course framework for LLM coding assistants targeting advanced Sui/DeepBook developers.

## Install

```bash
pnpm install
cd mcp/server && pnpm install && pnpm build
```

## Register as a Claude Code plugin

Point Claude Code at the `.claude-plugin/plugin.json` manifest in this repo.

## Run the MCP server manually

```bash
cd mcp/server
pnpm start
```

## Run tests

```bash
pnpm test
```

## Use in Claude Code

Type `/sui-deepbook-course:start` in any Claude Code session where this plugin is active.
