# EISAX Studio | OpenCode Build Brief

## Your role
You are the principal engineer, product designer, security engineer, and QA lead responsible for building **EISAX Studio**, a lightweight local alternative for common everyday Word and PowerPoint work, with an optional AI assistant and a separate hosted account mode. Work as an autonomous coding agent, but never confuse a mock/demo with working product functionality.

**Project:** EISAX Studio  
**Tagline:** Describe it. Create it. Own it.  
**Brand:** EISAX  
**Repository suggestion:** `eisax-studio`  
**Primary language:** English and Arabic, with true RTL/LTR and mixed-direction support.  
**Initial market:** Global, including UAE and GCC.  
**Delivery:** Responsive web application, deployable independently on EISAX-managed infrastructure.

## Product thesis
Help users handle the everyday 80/20 of Word and PowerPoint in a lightweight workspace. The primary journey is opening an existing `.docx` or `.pptx`, making common edits, and saving it. Creating a new document or presentation is also supported. AI is an optional assistant for drafting and editing; it must never be required for opening, editing, or saving files. Do not claim full Office fidelity, complete format coverage, native desktop behavior, or a complete offline PWA.

Target users: students, professionals, founders, small businesses, educators, and teams. The experience should be accessible to nontechnical users.

## Non-negotiable product principles
1. **Functional before flashy:** Never present fake functionality, hard-coded success notifications, placeholder charts, or nonworking buttons as complete features.
2. **Editable artifacts:** Generated output is stored as structured content, not as a flattened image, single HTML blob, or screenshots of slides.
3. **Reliable export:** PPTX must contain editable text and shapes wherever feasible; DOCX must contain semantic paragraphs, headings, and tables. PDF should preserve the intended layout. Clearly document any unsupported feature.
4. **AI optional at runtime:** Support a local/demo provider with sample output for development. A provider using real credentials should be configurable through environment variables. No secret in browser bundles or the repository.
5. **Provider-agnostic AI:** Define an AI provider interface and allow future model routing by cost, quality, and availability. Do not assume access to paid models or unlimited free quotas.
6. **Privacy & isolation:** Every query and artifact must enforce ownership / workspace permissions on the server; no cross-tenant data exposure.
7. **Internationalization from day one:** English and Arabic UI; correct RTL layout, font handling, and bilingual content.
8. **Portable infrastructure:** Avoid proprietary lock-in. Prefer self-hostable or standard services, Docker, PostgreSQL, and S3-compatible storage.
9. **Measured delivery:** Typecheck, lint, tests, build, and end-to-end smoke tests are required at every milestone. Never claim passing tests without running them.
10. **No paid purchases or production changes without explicit approval.** Do not connect to EISAX production databases or systems.

## Scope and sequencing

### Core local product (must ship first)
- `npm run local` starts Next.js bound to `127.0.0.1` with `EISAX_LOCAL_MODE=true`, using a personal local profile without login and a workspace separate from hosted accounts. `npm run dev` retains hosted-style accounts.
- Open existing DOCX/PPTX, edit common content, and save back to Office formats. Preserve imported originals separately from working copies; serialize writes and flush pending saves on Ctrl+S.
- Everyday document and slide editing, plus optional AI assistance. Clearly surface unsupported content and fidelity warnings.

### Hosted product (separate mode)
- Landing page with value proposition, transparent pricing, demo examples, FAQ, and sign-in buttons.
- Authentication: email/password or a suitable secure auth library; email verification and password reset when the email provider is configured.
- Responsive dashboard with recent projects, templates, create, rename, duplicate, delete, search, and simple folders (folders can be deferred if necessary).
- AI-first creation flow: choose `Presentation` or `Document`, enter prompt, language, audience, tone, length, and optional brand preferences.
- Structured generation pipeline: prompt -> validated outline -> editable content model -> rendered editor -> export. Provide progress feedback and recoverable errors.
- Presentation editor: slide thumbnails, add/delete/reorder/duplicate, edit text, basic shape/image placement, theme, font, colors, layout presets, speaker notes if straightforward, undo/redo, autosave.
- Document editor: headings, paragraphs, lists, emphasis, links, tables, images, page preview where practical, undo/redo, autosave.
- AI edit commands for selected blocks/slide: rewrite, shorten, expand, translate, change tone. Show preview / undo.
- Robust export: PPTX for presentations; DOCX for documents; PDF for both. Exported files should remain editable where the format allows.
- Project persistence in PostgreSQL; server-side access control; version or revision recovery for accidental edits.
- Usage tracking for AI operations and export; plan entitlements checked server-side.
- English/Arabic UI and generated content; RTL test cases.

### V1.1 / after core quality gate
- Stripe subscription integration with webhook verification, billing portal, idempotency, and plan changes. Keep billing behind a feature flag until configured and approved.
- Teams and workspace invitations, roles, shared brand kit, shared assets.
- More templates, stronger formatting fidelity, imported PDF/DOCX/PPTX where feasible and clearly scoped.
- Analytics, support portal, admin operations tools.

### Explicitly out of scope
- Full spreadsheet editor, macro/VBA support, complex Office parity, real-time multiplayer co-editing, cloud marketplace, native mobile apps, unlimited AI generations, unbounded file storage, automated publishing to social platforms.
- Full Microsoft Office fidelity, guaranteed preservation of every DOCX/PPTX feature, native desktop application behavior, and a complete offline PWA.

## Draft subscription model (configurable; NOT final pricing)
- **Free:** $0. Limited AI projects per month, basic templates, PDF export, storage limit.
- **Personal:** $5/month or $48/year. Higher AI allowance, DOCX/PPTX exports, no watermark.
- **Pro:** $10/month or $96/year. Higher allowances, advanced templates, brand kit, priority tasks.
- **Teams:** $18/user/month or $168/user/year. Workspace management and permissions, after team features exist.

Pricing is a business hypothesis, not a confirmed market rate. Never imply AI is unlimited. Implement entitlements as configuration, including credit budgets, per-model costs, concurrency limits, rate limits, and quota reset logic. Free plan must have hard limits and abuse protection. No actual charges until billing is explicitly approved and configured.

## Suggested technical architecture
Use these as defaults, adapting only with clear written rationale.

- **Framework:** Next.js App Router + TypeScript (strict).
- **Styling/UI:** Tailwind CSS, accessible reusable components, design tokens.
- **Database:** PostgreSQL with Prisma or Drizzle; migrations and seed scripts.
- **Auth:** well-maintained compatible auth solution with server-side sessions and CSRF protection where relevant.
- **Document editor:** Tiptap / ProseMirror with a structured JSON document model.
- **Slide editor:** React DOM/SVG-based editable canvas or compatible open-source editor primitives. Keep slide model independent of renderer.
- **Export:** PptxGenJS for native PPTX, docx for DOCX, and browser/server PDF rendering after verifying output quality. Use measured layout, correct text fitting, image dimensions, and font fallback.
- **File storage:** S3-compatible abstraction with a local development adapter.
- **AI:** abstract interface with a configurable OpenAI-compatible endpoint adapter where appropriate, plus deterministic fake provider for tests. Validate and sanitize model output with Zod.
- **Testing:** Vitest / Playwright or equivalent, focused on user workflows.
- **Deployment:** Dockerfile, Docker Compose for local dev, `.env.example`, health/readiness checks, basic logging.

Favor well-supported dependencies. Check licenses before adopting any editor or template library for commercial SaaS. Avoid services or packages that impose incompatible commercial restrictions.

## Data model (initial proposal)
- `User`, `Session`, `Workspace`, `WorkspaceMember`
- `Project` (type: presentation | document, owner, workspace, title, language, content JSON, updatedAt)
- `ProjectRevision` (project, revision number, content JSON, createdBy)
- `Asset` (owner/workspace, storage key, MIME, size, metadata)
- `GenerationJob` (project, operation type, provider/model, status, error, tokens, estimated cost)
- `UsageLedger` (user/workspace, type, billable units, month, idempotency key)
- `Subscription` (workspace, plan, status, provider ids; only used when billing enabled)

Implement indices, foreign keys, reasonable retention behavior, and soft deletion or recovery where needed. Define and validate content JSON schemas with versioning for future migrations.

## UI / art direction
Premium, calm, modern, institutional-grade yet friendly. Align with EISAX visual language, without copying Microsoft, Canva, Gamma, or other proprietary designs.

Suggested palette: deep obsidian `#060B14`, turquoise `#00D4C8`, sky `#0EA5E9`, warm gold `#D4AF37` used sparingly. Keep the editor content surface light for legibility even if the application shell uses a dark theme. Beautiful typography with a licensed Arabic typeface and excellent mixed Arabic-English line breaks. Accessible focus states, keyboard shortcuts, empty/loading/error states. Avoid glassmorphism when it harms readability.

Core layout:
1. Landing page -> `Create with AI`.
2. Auth / onboarding -> dashboard.
3. Create wizard -> type, prompt, language, optional parameters.
4. Generation progress -> outline review optional, then editor.
5. Editor -> content controls, AI assistant, export, project revisions.

## Security and operational constraints
- Server-enforced permission checks for **all** project, asset, job, export, and billing routes.
- Input validation and output sanitation; protect against stored XSS and prompt injection within imported material.
- Secure upload policies: MIME sniffing, maximum sizes, random object keys, no executable uploads, signed URLs as appropriate.
- Rate limits for auth, AI jobs, exports and uploads; prevent free-tier abuse.
- Secrets only in environment/server vaults, no credentials in client-side code, Git, logs, or screenshots.
- Avoid logging raw user prompts/document content by default. Minimal PII; privacy and deletion paths.
- Basic audit logs for plan changes, security-critical actions, and project sharing.
- Database backup/restore instructions, migration rollback notes, failure handling, and sensible timeouts.
- No external analytics, AI API calls, transactional emails, payments, or other chargeable services unless user configures and approves them.

## Definition of done (for each phase)
A phase is complete only if:
- The application runs from a clean checkout using documented setup.
- Types, linter, unit/integration tests, production build all pass.
- Representative end-to-end workflow passes in a real browser.
- No mock functionality is mislabeled as production-ready.
- Any problems or incomplete features are disclosed in `STATUS.md`.
- Screenshots and test logs are recorded where available.

Minimum browser test scenarios:
1. Sign up/sign in/sign out; unauthorized users cannot read another user's projects.
2. Create presentation from demo/real AI adapter, edit a slide, save, reload, re-open.
3. Create document, edit headings/table, save, reload, re-open.
4. Export PPTX then inspect its OOXML structure: multiple slides, editable text, correct basic ordering.
5. Export DOCX then inspect OOXML paragraphs/table; open with a compatible Office viewer if available.
6. Export both to PDF and inspect page count and nonblank content.
7. Arabic RTL presentation and Arabic-English mixed document.
8. Hit free-plan quota and verify server rejects the next AI call.
9. Recover from AI failure without losing the current editor content.
10. Mobile viewport smoke test and keyboard accessibility in main flows.

## Build phases

### Phase 0: Repo audit and plan
- Inspect the filesystem, tools, versions, package manager, and existing Git repository **before changing anything**.
- If this is a fresh directory, initialize the project and a local Git repo if appropriate. Do not create a remote repository without permission.
- Create `ARCHITECTURE.md`, `ROADMAP.md`, `STATUS.md`, `.env.example`, `README.md`.
- Make a task checklist with realistic dependency order and acceptance tests.
- Identify packages and their commercial license implications.

### Phase 1: Functional shell and persistence
- Implement design system, landing page, i18n/RTL, auth, dashboard, data model, migrations, project CRUD.
- Deliver complete flow: sign in -> create empty project -> edit metadata -> save -> reload.
- Run checks and record results.

### Phase 2: Presentation editor & export
- Implement structured slide schema, editor, slide operations, themes, autosave, undo/redo.
- Export PPTX with editable text/shapes and PDF.
- Add browser tests and inspect actual exported files.

### Phase 3: AI creation
- Implement robust prompts and schema-validated outline/content pipeline, provider adapters, usage limits, streaming/progress if practical, error recovery.
- Add demo adapter so tests work without API keys.
- Verify prompt -> real editable slides -> successful export.

### Phase 4: Documents
- Implement structured document editor, AI generation, DOCX and PDF exports, RTL and mixed-language cases.
- Verify editable native document elements.

### Phase 5: SaaS hardening & billing readiness
- Enforce entitlements, quotas, asset access, security tests, usage ledger, deployment artifacts, observability.
- Prepare Stripe integration behind a **disabled** feature flag; do not enable paid billing without explicit approval.
- Produce staging deployment instructions; **do not deploy to production without approval**.

## How to work in OpenCode
1. Read this file, inspect the repository, and summarize the initial technical choices in `ARCHITECTURE.md`.
2. Work in small, testable increments. Avoid editing unrelated projects or shared EISAX server services.
3. After each phase, update `STATUS.md` with completed items, exact commands run and results, unresolved issues, and next actions.
4. Prefer free/local tooling. If AI provider quota is exceeded, continue non-AI engineering or use deterministic fixtures; **never bypass service restrictions or rotate accounts to evade quotas**.
5. Record practical metrics in `STATUS.md`: model, date, task, approximate requests/tokens or credit usage if the tool exposes them, errors and retries. Do not invent metrics not exposed by the provider.
6. Don't stop after delivering static mockups; create working code and run tests.
7. Ask only when blocked by an actual external decision: API secrets, paid subscriptions, production access, branding assets, or irreversible operations. Otherwise choose conservative defaults, document them, and proceed.
8. Do not claim that a test passed, a service connected, an export is editable, or a feature is complete unless verified.

## Your first task
**Execute Phase 0, then start Phase 1 immediately.** Start by inspecting the current directory, proposing a minimal architecture, and scaffolding a clean, runnable Next.js application. Implement real foundational screens and persistence. Test the current milestone, update `STATUS.md`, and continue through the roadmap as time and free model availability allow. Prioritize working software over screenshots.

When reporting, use the following format:
- **Built:** features implemented (real vs mocked clearly marked)
- **Verified:** exact checks and test results
- **Open issues:** failures and limitations
- **Cost / quota:** only observed usage
- **Next:** the immediately actionable milestone
