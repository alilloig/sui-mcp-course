# Report: create-mastra Architecture and Interactive Course Framework for Sui/DeepBook

## Context

The goal is to create a comprehensive report documenting how the `create-mastra` npx command works, then extrapolate those patterns to design an interactive course framework for LLM coding assistants — specifically targeting advanced Sui developers learning DeepBook DeFi development using the deepbook-sandbox.

**User requirements:**
- Target audience: Advanced builders using DeepBook for DeFi products
- Delivery format: npx CLI (similar to create-mastra)
- Scope: Report only (no implementation)
- Starting point: deepbook-sandbox repository

---

## Part 1: create-mastra Architecture Analysis

### 1.1 Entry Point and Delegation Pattern

**Key file:** `packages/create-mastra/src/index.ts`

The create-mastra package is a **thin wrapper** that:
- Uses Commander.js for CLI parsing
- Delegates all logic to `packages/cli/src/commands/create/create.ts`
- Integrates PostHog analytics from the start
- Handles version tag resolution via `utils.ts`

```
npx create-mastra → packages/create-mastra/src/index.ts → packages/cli/src/commands/create/create.ts
```

### 1.2 Three Execution Paths

| Path | Trigger | Behavior |
|------|---------|----------|
| **DEFAULT** | `--default` flag | Skip prompts, use presets (OpenAI, all components, examples) |
| **INTERACTIVE** | No flags | 5-step prompt sequence via @clack/prompts |
| **TEMPLATE** | `--template [name]` | Clone from template registry or GitHub URL |

### 1.3 Interactive Prompt Sequence

**File:** `packages/cli/src/commands/init/utils.ts` (lines 685-933)
**Library:** `@clack/prompts` (^1.1.0)

1. **Directory selection** — Where to create Mastra files (default: `src/`)
2. **LLM Provider** — openai, anthropic, groq, google, cerebras, mistral
3. **API Key** — Skip or enter (stored in `.env`)
4. **Tooling configuration** — Skills or MCP Docs Server
5. **Git initialization** — Optional git init

**Key pattern:** Questions are conditionally skipped based on CLI flags (progressive disclosure).

### 1.4 Template System

**Key files:**
- `packages/cli/src/utils/template-utils.ts` — Template loading/selection
- `packages/cli/src/utils/clone-template.ts` — Clone/install logic

**Mechanics:**
- Templates fetched from API (`https://mastra.ai/api/templates.json`)
- Clone strategy: degit (primary) → git clone (fallback), both strip `.git`
- Three-tier lookup: exact slug → slug with prefix → case-insensitive title
- Post-clone: Update package.json name, copy .env.example → .env

### 1.5 Scaffolding Breakdown

| Category | What |
|----------|------|
| **Generated from code** | Component dirs, index.ts, examples, tsconfig, .gitignore, README, AGENTS.md |
| **Cloned from remote** | Template repos (via degit), skills from GitHub |
| **Fetched via API** | Template list, GitHub validation |
| **Configured dynamically** | .env, package.json name, npm scripts, model provider |

### 1.6 Edge Case Handling

- **Existing directory:** Validation prompt prevents creation
- **Invalid template:** Shows available templates with usage instructions
- **Install failures:** Retry with @latest fallback
- **Network issues:** Generic user message + console debug log
- **Cleanup on failure:** Directory removed if creation fails

---

## Part 2: Transferable Patterns for Interactive Courses

### Pattern 1: Progressive Prompting → Lesson Checkpoints
Questions skipped based on CLI flags and prior answers → Lessons completed unlock next lessons

### Pattern 2: Opinionated Defaults → Guided Learning Path
Sensible presets reduce decision fatigue → Recommended course paths for different goals

### Pattern 3: Template Selection → Module/Course Selection
API-fetched templates with interactive selection → Course catalog with difficulty levels

### Pattern 4: Dynamic Code Generation → Exercise Scaffolding
Code generated based on user choices → Starter code with TODOs for learner to complete

### Pattern 5: Validation Gates → Exercise Verification
Directory/repo validation before proceeding → Move compile/test verification before advancing

### Pattern 6: Post-Step Setup → Environment Preparation
Dependency installation, git init, env config → Sui CLI setup, devnet config, wallet creation

### Pattern 7: Graceful Degradation → Hint System
Degit → git clone fallback → Progressive hints when learner is stuck

### Pattern 8: Cleanup on Failure → Safe Reset
Directory removal if creation fails → Clean workspace reset for retry

---

## Part 3: Sui/DeepBook Course Framework Design

### 3.1 Target Audience Profile

**Who:** Advanced Sui developers building DeFi products on DeepBook
**Prerequisites:** 
- Familiarity with Sui/Move fundamentals
- Understanding of DeFi concepts (order books, liquidity, trading)
- Experience with sui client and Move package development

**Goal:** Learn to use deepbook-sandbox for testing custom DeFi integrations

### 3.2 Proposed CLI Experience

```bash
$ npx create-deepbook-course

  DeepBook Learning Framework

  What do you want to learn?
  > Testing with deepbook-sandbox
    Building custom pools
    Advanced order management
    Price oracle integration

  Select your starting point:
  > I have an existing DeFi project
    Start from scratch
    Clone example project

  Creating course workspace...
  Setting up deepbook-sandbox...
  
  Course started: Testing DeFi with DeepBook Sandbox
  Current lesson: Understanding the Sandbox Architecture
  
  Open Claude Code and say:
  "Start my DeepBook course"
```

### 3.3 Course Definition Schema

```typescript
interface DeepBookCourse {
  courseId: string;
  title: string;
  description: string;
  prerequisites: string[];
  suiVersion: string;
  deepbookVersion: string;
  modules: DeepBookModule[];
}

interface DeepBookModule {
  slug: string;
  title: string;
  lessons: DeepBookLesson[];
}

interface DeepBookLesson {
  slug: string;
  title: string;
  type: 'concept' | 'exercise' | 'challenge';
  objectives: string[];
  exercise?: {
    scaffold: ExerciseScaffold;
    verification: VerificationConfig;
    hints: string[];
  };
}

interface VerificationConfig {
  type: 'compile' | 'test' | 'simulate' | 'custom';
  command?: string;
  expectedOutput?: string;
  testModule?: string;
}
```

### 3.4 Sample Course Structure: "Testing DeFi with DeepBook Sandbox"

```
deepbook-sandbox-course/
  course.json                           # Course manifest
  01-sandbox-fundamentals/
    01-architecture-overview.md         # Concept: How sandbox works
    02-setup-environment.md             # Exercise: Clone + build sandbox
    03-understanding-test-coins.md      # Concept: SUI, DEEP, USDC test tokens
    04-first-pool-interaction.md        # Exercise: Create pool, add liquidity
  02-testing-strategies/
    01-unit-testing-patterns.md         # Concept: Move test patterns
    02-write-pool-tests.md              # Exercise: Test pool operations
    03-order-lifecycle-testing.md       # Exercise: Test order placement/fill/cancel
    04-edge-case-scenarios.md           # Challenge: Handle edge cases
  03-integrating-your-product/
    01-importing-sandbox.md             # Concept: Adding as dependency
    02-mock-vs-real-pools.md            # Concept: Testing strategies
    03-build-test-harness.md            # Exercise: Create test infrastructure
    04-continuous-testing.md            # Exercise: CI/CD integration
```

### 3.5 MCP Tools for LLM Integration

```typescript
// Course navigation
startDeepBookCourse()          // Initialize course workspace
getCourseProgress()            // Show completion status
nextLesson()                   // Advance to next lesson
jumpToLesson(slug)             // Skip to specific lesson

// Exercise tools
scaffoldExercise()             // Generate starter code with TODOs
verifyExercise()               // Run sui move test verification
getHint(level)                 // Progressive hints (1-3)
showSolution()                 // Reveal solution (marks as assisted)

// DeepBook-specific tools
setupSandbox()                 // Clone and build deepbook-sandbox
createTestPool()               // Scaffold pool creation code
simulateTrade()                // Run trade simulation
inspectPoolState()             // Debug pool state
```

### 3.6 LLM Instruction Injection (AGENTS.md)

```markdown
# AGENTS.md

You are guiding an advanced Sui developer through DeepBook DeFi testing.

## CRITICAL: Load `deepbook-course` skill FIRST

Before any course interaction, load the skill to access course tools.

## Current Lesson Context

Lesson: {current_lesson_title}
Objective: {lesson_objectives}
Exercise: {exercise_description}

## Guidance Rules

1. **Never write complete solutions immediately** — Ask guiding questions first
2. **Reference deepbook-sandbox patterns** — Point to existing code in the sandbox
3. **Verify understanding** — Ask learner to explain before moving forward
4. **Use progressive hints** — Level 1 → 2 → 3 before showing solution
5. **Encourage exploration** — Suggest reading sandbox source code
```

### 3.7 Verification Patterns

**Compile verification:**
```bash
sui move build --path ./exercises/lesson-04
```

**Test verification:**
```bash
sui move test --path ./exercises/lesson-04 --filter test_pool_creation
```

**Custom verification (for complex scenarios):**
```typescript
async function verifyExercise(lessonSlug: string): Promise<VerificationResult> {
  const lesson = await loadLesson(lessonSlug);
  const config = lesson.exercise?.verification;
  
  switch (config.type) {
    case 'compile':
      return await runSuiMoveBuild();
    case 'test':
      return await runSuiMoveTest(config.testModule);
    case 'simulate':
      return await runDeepBookSimulation(config.expectedOutput);
  }
}
```

---

## Part 4: Repository Strategy Recommendation

### Recommended: Standalone Repository

```
github.com/your-org/deepbook-learning/
  packages/
    create-deepbook-course/     # CLI entry point (thin wrapper)
    deepbook-course-cli/        # Core course logic
    deepbook-mcp-server/        # MCP tools for LLM integration
  courses/
    testing-with-sandbox/       # First course: deepbook-sandbox
    building-custom-pools/      # Future course
  templates/
    defi-starter/               # Starter template for learner projects
```

**Rationale:**
- Independent from Mastra release cycle
- Focused on Sui/DeepBook ecosystem
- Can reuse Mastra patterns without coupling
- Easier community contribution for Sui-specific content

---

## Deliverables Summary

This report provides:

1. **create-mastra Architecture Documentation**
   - Entry point and delegation pattern
   - Three execution paths (DEFAULT, INTERACTIVE, TEMPLATE)
   - Interactive prompt sequence and @clack/prompts usage
   - Template system mechanics
   - Scaffolding breakdown
   - Edge case handling

2. **Transferable Patterns**
   - 8 patterns mapped from create-mastra to course systems

3. **Sui/DeepBook Course Framework Design**
   - Target audience profile
   - Proposed CLI experience
   - Course definition schema
   - Sample course structure
   - MCP tools for LLM integration
   - AGENTS.md instruction injection
   - Verification patterns

4. **Repository Strategy**
   - Standalone repo recommendation with structure

---

## Next Steps (If Implementation Proceeds)

1. **Thin-slice MVP**: Single lesson from "Testing DeFi with DeepBook Sandbox"
2. **Scaffold CLI**: create-deepbook-course with course selection
3. **MCP server**: Basic course navigation + verification tools
4. **Content authoring**: First module with 4 lessons
5. **LLM integration**: AGENTS.md generation + skill loading
