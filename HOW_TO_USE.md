# How to use with Claude Code

1. Put `CLAUDE.md` at the repository root.
2. Put the `phase-prompts` directory beside it.
3. Start Claude Code from the repository root.
4. Tell Claude to read `CLAUDE.md`.
5. Run Phase 1 only.
6. Verify the result before moving to Phase 2.
7. Continue one phase at a time.

Recommended opening message:

Read `CLAUDE.md` completely. Do not code yet.

Inspect the repository and current state. Then summarize:
- architecture;
- current files;
- requirements you will implement;
- assumptions you will NOT make;
- Phase 1 implementation plan.

Wait for my instruction before implementing Phase 1.

Then use the corresponding file in `phase-prompts/`.
