---
name: quality-gate
description: Use before handoff, commit, PR creation, or any claim that work is complete, fixed, verified, or passing; requires fresh verification evidence and Chinese Conventional Commit messages.
---

# Quality Gate

## When To Use

Use before handoff, commit, PR creation, or any completion claim.

## Read First

- `docs/QUALITY_SCORE.md`
- `docs/RELIABILITY.md`
- `docs/SECURITY.md`
- The current `docs/active/{slug}/plan.md`, if one exists.

## Workflow

1. List the domains and risks touched by the change.
2. Select the smallest sufficient verification commands from reliability docs and the task plan.
3. Run the full commands and read exit codes and output.
4. Report failures as failures. Do not claim completion when verification fails.
5. Record remaining debt in `docs/active/tech-debt-tracker.md`.

## Commit Message Rule

- Commit messages must follow Conventional Commits.
- Use standard type prefixes such as `feat:`, `fix:`, `docs:`, or `chore:`.
- The message text must describe the change in Chinese.
- Example: `docs: 更新项目内基础 skills 模板`.

## Done When

- Fresh verification evidence exists.
- Handoff notes include verification and residual risk.
- Commit messages follow Conventional Commits and use Chinese message text.
