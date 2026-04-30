# Sui MCP Course

Interactive course framework for LLM coding assistants, targeting advanced Sui/DeepBook developers.

## Project Vision

CLI-based interactive courses where LLM assistants guide learners through Sui development exercises, using patterns extracted from Mastra's `create-mastra` CLI.

## Target Audience

Advanced Sui builders working with DeepBook for DeFi products. Prerequisites:
- Sui/Move fundamentals
- DeFi concepts (order books, liquidity, trading)
- Experience with `sui client` and Move packages

## Architecture Reference

See `create-mastra-architecture-report.md` for:
- create-mastra patterns to replicate
- Course definition schema
- MCP tools design
- Sample course structure

## Planned Structure

```
packages/
  create-deepbook-course/     # CLI entry (thin wrapper, Commander.js)
  deepbook-course-cli/        # Core logic (@clack/prompts)
  deepbook-mcp-server/        # MCP tools for LLM integration
courses/
  testing-with-sandbox/       # First course: deepbook-sandbox
templates/
  defi-starter/               # Starter template
```

## Key Patterns to Follow

1. **Thin wrapper**: Entry package delegates to CLI package
2. **Progressive prompts**: @clack/prompts with conditional skipping
3. **Template + generation hybrid**: Clone repos + generate based on choices
4. **Verification gates**: `sui move build` / `sui move test` before advancing
5. **AGENTS.md injection**: Course-specific LLM instructions per lesson

## Tech Stack

- TypeScript
- Commander.js (CLI parsing)
- @clack/prompts (interactive prompts)
- degit (template cloning)
- MCP SDK (LLM tool integration)

## First Milestone: Thin-Slice MVP

Single lesson from "Testing DeFi with DeepBook Sandbox":
1. Scaffold CLI with course selection
2. One working lesson with exercise + verification
3. Basic MCP tools (startCourse, verifyExercise, getHint)

## Related Resources

- [create-mastra source](https://github.com/mastra-ai/mastra/tree/main/packages/create-mastra)
- [deepbook-sandbox](https://github.com/deepbook/deepbook-sandbox)
- [@clack/prompts docs](https://github.com/natemoo-re/clack)
