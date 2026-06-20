# Integration Recovery Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Restore a green main checkout, then rebase, verify, and integrate the completed portfolio-proof and Studio-boundary deliverables in sequence.

**Architecture:** Keep the existing uncommitted Studio and core work intact, making only the mechanical lint-preserving change required for the current checkout. Treat the portfolio and Studio-boundary branches as independently verified deliverables: rebase each onto the newly advanced `main`, run the repository gate in its own worktree, then fast-forward merge it only after that verification succeeds.

**Tech Stack:** Node.js, pnpm, TypeScript, React 19, Vitest, ESLint, Prettier, Git worktrees.

## Global Constraints

- Preserve all existing user changes in the main checkout.
- Do not alter production architecture while resolving lint-only failures.
- Run `pnpm -s verify` after each integration step; it is the repository gate.
- Integrate in this order: quality gate (already merged) → portfolio proof → Studio-boundary design.
- Do not push, force-push, or remove the user-requested sibling worktrees.

---

### Task 1: Make the current StartupPanel lint-compliant without changing behavior

**Files:**

- Modify: `apps/studio/web/src/components/StartupPanel.tsx:61-77`
- Test: `apps/studio/web/src/components/__tests__/StartupPanel.test.tsx`

**Interfaces:**

- Consumes: `StartupPanel` props `{ projectsLoading, hasProjects, onCreate, creating }`.
- Produces: The same loading, existing-project, and new-project UI states without nested conditional expressions.

- [x] **Step 1: Run the focused existing component test**

Run: `pnpm --filter @lvstudio/studio test:web -- StartupPanel`
Expected: Existing loading, create-project, and narration-engine assertions pass.

- [x] **Step 2: Replace the nested heading/body conditionals with an ordered helper**

```ts
function startupCopy(projectsLoading: boolean, hasProjects: boolean) {
  if (projectsLoading) {
    return { heading: "Starting Studio", body: "Loading your projects…" };
  }
  if (hasProjects) {
    return {
      heading: "Pick up where you left off",
      body: "Choose a project from the sidebar to open its story, plan, and render output.",
    };
  }
  return {
    heading: "Turn a story into a narrated video",
    body: "Create a project to draft a script, generate narration, and render a video — all locally.",
  };
}
```

Add the helper above `StartupPanel`, then replace both conditional declarations with:

```ts
const { heading, body } = startupCopy(projectsLoading, hasProjects);
```

This preserves every existing string while satisfying ESLint's `no-nested-ternary` rule.

- [x] **Step 3: Run focused test and lint**

Run: `pnpm --filter @lvstudio/studio test:web -- StartupPanel && pnpm -s lint`
Expected: StartupPanel tests pass and lint has no errors.

### Task 2: Verify the current main checkout

**Files:**

- No source changes expected.

**Interfaces:**

- Consumes: Current `main` at `2da7881`, including preserved user work.
- Produces: A green repository verification result before any additional branch is integrated.

- [x] **Step 1: Run the full gate**

Run: `pnpm -s verify`
Expected: exit code 0; the lint warning baseline remains at 87 unless the preserved user changes legitimately reduce it.

- [x] **Step 2: Record the preserved working-tree state**

Run: `git status --short`
Expected: only the pre-existing Studio/core work plus this plan file; no generated output files are tracked.

### Task 3: Rebase and integrate portfolio proof

**Files:**

- Rebase worktree: `../scriptorium-portfolio-proof`
- Integration result: `README.md`, `docs/portfolio-demo.sh`, `docs/portfolio-demo.test.mjs`, `docs/portfolio-demo-workflow.svg`, and `docs/portfolio-demo-output.txt` as introduced by portfolio commit `c7093fa`.

**Interfaces:**

- Consumes: portfolio commit `c7093fa` and current green `main`.
- Produces: `main` containing the rebased portfolio proof commit and passing verification.

- [x] **Step 1: Rebase the portfolio branch onto main**

Run from `../scriptorium-portfolio-proof`: `git rebase main`
Expected: no conflicts; a rebased portfolio commit atop current `main`.

- [x] **Step 2: Verify the rebased portfolio worktree**

Run: `pnpm -s verify && node --test docs/portfolio-demo.test.mjs && bash -n docs/portfolio-demo.sh`
Expected: all commands exit 0.

- [x] **Step 3: Fast-forward main to the rebased portfolio branch**

Run from the main checkout: `git merge --ff-only feat/portfolio-proof`
Expected: only the portfolio proof files are added or changed.

- [x] **Step 4: Verify the merged main checkout**

Run: `pnpm -s verify`
Expected: exit code 0.

### Task 4: Rebase and integrate the Studio-boundary migration design

**Files:**

- Rebase worktree: `../scriptorium-studio-boundary`
- Integration result: `docs/plans/2026-06-20-studio-boundary-migration-design.md` from Studio-boundary commit `3ec44ac`.

**Interfaces:**

- Consumes: migration-design commit `3ec44ac` and main after portfolio integration.
- Produces: `main` with the source-backed migration design and a green verification result.

- [x] **Step 1: Rebase the Studio-boundary branch onto main**

Run from `../scriptorium-studio-boundary`: `git rebase main`
Expected: no conflicts; the design commit is replayed atop the portfolio-integrated `main`.

- [x] **Step 2: Verify the rebased design worktree**

Run: `pnpm -s verify`
Expected: exit code 0.

- [x] **Step 3: Fast-forward main to the rebased Studio-boundary branch**

Run from the main checkout: `git merge --ff-only refactor/studio-boundary`
Expected: only the migration design document is added.

- [x] **Step 4: Run final repository verification**

Run: `pnpm -s verify`
Expected: exit code 0.

### Task 5: Review and hand off

**Files:**

- Review: `git diff main@{1}..main`, `git status --short`, and integrated commit log.

**Interfaces:**

- Consumes: integrated main history and preserved user working-tree changes.
- Produces: a handoff that distinguishes merged commits from uncommitted user work and names the migration design as the next implementation input.

- [x] **Step 1: Inspect integration history and working-tree boundaries**

Run: `git log --oneline -5 && git status --short`
Expected: quality, portfolio, and Studio-boundary commits appear in history; only the pre-existing user work and this plan remain uncommitted.

- [x] **Step 2: Report verification evidence and next implementation boundary**

Report each integrated commit SHA, the final `pnpm -s verify` result, any preserved uncommitted files, and that the next task is the first small TypeScript seam from `docs/plans/2026-06-20-studio-boundary-migration-design.md`.
