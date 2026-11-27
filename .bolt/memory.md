# Project memory

## Product intent & audience

- Project uses **vite-react** framework
- Specific product purpose and target audience not yet established

## Brand personality & voice

- No brand or voice direction inferred yet

## Visual design & UX direction

- User accesses Bolt from an **iPad** — mobile/tablet context may influence testing and feedback workflow
- No project-specific visual or UX decisions captured yet

## Decisions, constraints & rationale

- **iPad workflow constraint:** Desktop-only Bolt features (code view, terminal, preview controls) are unavailable; user relies on in-chat preview cards and the Publish menu for feedback
- **Likely root issue:** App may be built as **server-rendered**, which Bolt's publishing frequently rejects — this is the suspected shared cause of both broken preview and failing publish
- **Blocked on diagnostics:** Without terminal access on iPad, exact error text must be pasted manually from the Publish menu or preview card to proceed with the fix
- Fix should be applied in **Build mode**

## Open questions & assumptions

- Is the app intentionally server-rendered, or should it be client-rendered for Bolt compatibility?
- What is the exact error text from the failed publish / broken preview?
- Does the user have access to a desktop machine if deeper debugging is needed, or is iPad the only environment?
- What is the actual product being built (purpose, features, audience)?