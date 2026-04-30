# Course Engine Skill

## Protocol

When the user runs `/sui-deepbook-course:start`, follow these steps:

1. Call the `start` MCP tool with `projectRoot` set to the current workspace root.

2. Render the result as follows:

   - **Output Style**: If `outputStyleOk` is `true`, confirm the learning output style plugin is enabled. If `false`, advise the user to enable the `learning-output-style@claude-plugins-official` plugin for the best experience.

   - **Available Paths**: List each entry in the `paths` array, showing `slug` and `title`. If `paths` is empty, tell the user no learning paths are installed.

   - **Warnings**: If `warnings` is non-empty, display each warning's `kind` and `message` so the user knows about any configuration issues.

3. Do not run preflight checks or select a path in cycle 1. The `preflight` field will be `{ skipped: true, reason: "cycle-1" }` and `state` will be `null`.
