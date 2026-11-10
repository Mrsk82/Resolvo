# Resolvo Inbox 2.0: Phase 0 audit and implementation plan

Status: written 9 Nov 2026 against `main` (commit 8b8e709) as an audit only. **Corrections after building (10 Nov 2026):** finding 5 (no role checks) turned out to be a non-issue, because no read-only role exists; incoming duplicate ingestion is atomic (the ingest path is synchronous); list speed is fine (about 70 ms at 5,000 tickets, about 0.3 to 1.2 s at 25,000), so no database work was needed. See `release-notes.md` for what was built.

## 1. The most important finding

The brief describes a redesign "from scratch", but Resolvo already has a three-panel inbox (`public/js/rv-inbox.js`, 884 lines, `public/css/rv-inbox.css`) with
views, filters, saved views, bulk actions, a focus mode, snooze, merge/split, watchers, CC, canned replies, slash commands, Shopify orders and a phone layout.
About 60 to 70% of the brief already exists. A full redesign would rebuild working code and risk breaking it. **Recommendation: close the gaps and fix the
reliability problems, do not rebuild.** The brief's own rules ("do not rebuild", "reuse working functions") point the same way.

## 2. How the inbox works today

| Area | Where | Notes |
|---|---|---|
| Client | `public/js/rv-inbox.js`, `rv-ui.js`, ticket detail and AI buttons in `public/js/app-core.js` (~8290 to 9260) | Vanilla JS. No Tailwind. Design tokens `--rv-*` in `rv-ui.css`. |
| API | `POST /api/call` with a function map (`aH` in `server.js`) | Same call style for every feature, no REST routes per ticket. |
| Storage | per-brand SQLite `data/brands/<slug>/db.sqlite`, tickets as JSON rows `tickets(id, data)` | Indexes exist only on status, priority, assignedTo (JSON expressions). `processed_email_ids` table. |
| List | `getTickets(filters)` (`server.js` ~2486) | Reads the whole brand DB, filters in JavaScript, then pages. Counts are recomputed over all tickets on every call. |
| Email in | IMAP poll (~8359, 8413) and Gmail push (~9039 to 9083), both end in `createTicketFromEmail` (~7940) | De-duplicates by Message-ID (`processedEmailIds`), threads by `inReplyTo`/`messageIds`, spam and bulk filters, HTML sanitised by `_sanitizeEmailHtml`. |
| Email out | `replyToTicket` (~2091), `sendGmailApiReply` (~9132), `sendBrandEmail` (~714) | Gmail API first, SMTP fallback. WhatsApp, SMS and social go through their own adapters. |
| AI | `callGemini` (~11553): local Ollama first, then Gemini with the brand key, **then the platform's `GEMINI_API_KEY`** | Functions: `getAISuggestedReply`, `getSmartReplyDrafts`, `summarizeTicket`, `detectDuplicateTickets`, `getPossibleDuplicateTickets`, `suggestKBArticles`, `autoClassifyTicket`, `getConversationIntelligence`, keyword-based `_analyzeSentimentNLP`. |
| Assignment | `autoAssignAgent` (~7677): routing rules, priority routing, capacity (`maxTickets`), away status, queue config | Used on ingest and rebalancing. No "recommend with reason" for manual assignment. |
| Flags | `TIER_FEATURES`, `FEATURE_META`, `resolveFeatureFlags(brand, db.featureFlags)` | A per-brand pilot flag is easy and the owner can override per brand. |
| Tests | `docs/ui-redesign/tools/` (about 35 suites, e.g. `inbox_focus_test.py` 72 checks, `reply_helpers_test.py`, `phone_*`, `first_customers_test.py`) | No test covers email sending failure, duplicate ingestion or concurrent agents. |

## 3. Gap analysis against the brief

Legend: **Done** = exists and works. **Partial** = exists, needs work. **Missing** = does not exist.

| Brief item | Status | Detail |
|---|---|---|
| Three-panel layout, responsive | Done | List, conversation, phone layout, focus mode. |
| Sidebar: Workspace (All, Mine, Unassigned, Following) | Partial | All, Mine, Unassigned exist. **Following missing** (watchers exist: `watchTicket`, `getTicketWatchers`). |
| Sidebar: Priority (Urgent, High, SLA risk, SLA breached) | Partial | Critical, SLA at risk, SLA breached exist. High has no view. |
| Sidebar: Status (Open, Pending, Waiting, Resolved, Closed, Archived) | Partial | Status filter lives in the filter panel, not the sidebar. "Waiting for customer" exists in focus mode. **Archived missing** (no archive status). |
| Sidebar collapse, persisted prefs, dynamic counts | Partial | Counts exist. Filters persist (`persist()`). **No sidebar collapse found in the inbox views panel** (it opens as a "Views" panel). |
| Row: name, email, subject, preview, time, avatar, priority, status, unread, SLA | Done | Needs a visual check; sentiment indicator missing from the row. |
| Search ticket id, name, email, subject | Done | Server-side, debounced. |
| **Search body and message content** | **Missing** | Server search ignores the message text. |
| Filters: status, priority, assignee, date, SLA, channel, team, tag | Done | |
| Filters: sentiment, unread/read, VIP | **Missing** | |
| Sort: newest, oldest, priority, SLA | Done | Unread-first is always on and cannot be chosen. |
| Bulk: assign, priority, status, read, archive | Partial | `bulkUpdateTickets`, `bulkAssignTickets` exist. Mark read/unread and archive missing. Confirmation dialogs need checking. |
| Saved views | Done | `getSavedViews`, `saveView`, `deleteView`. |
| Conversation header and actions | Done | Assign, priority, status, snooze, merge, split, close. |
| Timeline: incoming, reply, note, system | Partial | Incoming, reply and notes show. **Delivery status only exists for social channels.** System events live in `timeline[]` but are not shown inline. HTML emails are shown as plain text (safe). |
| Customer 360 | Partial | Customer pane and CRM exist (`rvfCust`). Verify fields shown are only real ones. |
| Reply composer, notes, attachments, drafts | Partial | Reply, note, canned replies, slash commands exist. **Drafts are kept in memory only (`S.drafts`), so a page reload loses them.** **Attachment sending not confirmed.** |
| Internal notes never sent to customers | Done | `type:'note'` is never emailed. |
| AI 1 Reply assistant | Partial | Shorter, more professional, more empathetic exist. Missing: friendly, technical, follow-up, knowledge-base grounding. |
| AI 2 Smart assignment (recommendation with reason) | Partial | Auto-assignment exists. No recommendation card, no reason, no continuity (same customer, same agent). |
| AI 3 Sentiment with confidence and explanation | Partial | Keyword sentiment (positive, neutral, negative) stored on the ticket. No "frustrated", no confidence, no explanation. |
| AI 4 Summary (structured) | Partial | `summarizeTicket` gives three bullets, not cached, regenerated each time. |
| AI 5 Duplicate detection | Partial | Same-customer subject match and an AI version exist, with link/merge. "Dismiss" not confirmed. |
| AI 6 Copilot | **Missing** | Only one-shot buttons exist. |
| Server pagination | Partial | Pages are sliced server-side but only after reading and filtering everything. |
| Lazy-load message history | Missing | `getTickets` strips `thread` (good), but the conversation loads the whole ticket. Fine until threads get long. |
| Feature-flagged pilot, rollback | Missing | Easy to add (one flag). |

## 4. Problems found that matter more than the redesign

These are real defects in current code, listed by severity. They are in scope because the brief calls email reliability critical.

1. **A failed email is shown as sent (High).** `replyToTicket` writes the reply into the ticket and marks it sent *before* the email goes out, and it ignores the
   result of `sendBrandEmail` / `sendGmailApiReply`. If SMTP rejects the message the agent sees "sent" and the customer never gets it. The brief says
   "do not show sent until the provider confirms".
2. **No protection against sending twice (High).** There is no idempotency key. A double click, a slow response plus retry, or the Gmail fallback after a Gmail
   timeout can send the same reply twice.
3. **Reply text goes into the email's HTML unescaped (Medium).** `${replyText}` is inserted into `replyHtml` (and the watcher email). Agent-typed or AI-drafted
   text containing `<` or HTML is sent as markup.
4. **Lost updates (Medium).** Every handler reads the whole brand DB and writes it back (`writeBrandDB` rewrites every ticket row). `replyToTicket` for
   WhatsApp, SMS and social reads the DB, then waits for the provider, then writes the stale copy. Anything saved in between (a new customer email, another
   agent's change) is overwritten. Two agents editing one ticket: last writer wins.
5. **No role checks on ticket changes (Medium).** `assignTicket`, `updateTicketPriority`, `bulkUpdateTickets` and similar do not check the user's role. To be confirmed against each role
   before anything is built.
6. **Internal notes can reach the AI (Medium).** `getSmartReplyDrafts` and `summarizeTicket` put internal notes in the prompt. Only `getAISuggestedReply` filters them out. A draft could quote a private note.
7. **AI cost falls on the platform (Medium, given the cost concern).** `callGemini` falls back to the platform's own key when a brand has none. Nothing is
   cached or capped, so every click is a paid call.
8. **List speed (Low now, High later).** Every inbox refresh reads all tables and recomputes SLA for every ticket. Fine for hundreds of tickets, slow for tens of thousands.
9. **Known open issue:** Gmail push errors "message not found" in live logs, not yet investigated. Needs a look before a pilot.

## 5. Proposed plan (changed from the brief)

The brief's order is Audit, UI, Conversation, AI, Testing. Because of section 4, I recommend putting reliability first. Each phase is feature-flagged and
ends with a test report. Nothing is deployed without your word.

**Phase 0 (this document).** Create branch `inbox-2` and a rollback tag before the first edit (done at the start of Phase 1, no change was made in Phase 0).

**Phase 1: Reliable sending and safe saving (before any new look).**
- Add a message state `pending`, `sent`, `failed` with the provider's answer; set `sent` only when the provider accepts. Show "Failed. Retry" in the timeline.
- Idempotency key per reply so retry and double click never send twice.
- Escape reply text in outgoing HTML.
- Re-read the ticket just before writing (after any `await`), so a slow send cannot overwrite newer changes.
- Role checks on ticket changes, using existing roles.
- Filter internal notes out of every AI prompt.
- New tests: failed send, retry without duplicate, duplicate ingestion (IMAP and Gmail push for one message), two agents on one ticket.
- Investigate the Gmail "message not found" log lines.

**Phase 2: Close the inbox gaps (small, on the existing screen).**
- Sidebar groups as in the brief (Workspace, Priority, Status incl. Following and Archived), collapsible and remembered.
- Search inside message text. Filters for sentiment, unread/read and VIP. Sort picker incl. unread-first.
- Bulk mark read/unread and archive, with confirmation.
- Faster list: read only tickets, cache counts for a few seconds, no change to the database engine.
- Row polish: sentiment marker, clearer metadata.

**Phase 3: Conversation polish.**
- Delivery state and system events in the timeline, expand/collapse older messages, attachment check, Customer 360 shows real fields only.

**Phase 4: AI, one feature at a time, each behind its own switch.**
1. Reply assistant: add friendly, technical, follow-up; ground in published knowledge-base articles; agent always edits and sends.
2. Summary: structured fields, cached until the conversation changes.
3. Sentiment: add "frustrated", confidence and a one-line reason; run once per new message and store the result.
4. Smart assignment: recommendation card with reason and workload; nothing assigned silently.
5. Duplicates: keep current logic, add similarity reason and Dismiss; never auto-merge.
6. Copilot: a chat panel that answers only from the ticket and knowledge base and says when it does not know.
- Cost controls: per-plan monthly AI limit, caching, **stop falling back to the platform key** unless you choose otherwise.

**Phase 5: Release.** Pilot flag `INBOX2_ENABLED` on the demo brand first, performance check with a large ticket set, rollback test, deployment and rollback notes.

## 6. Decisions needed from you

1. **Approve the changed order** (reliability first, then gaps, then AI), instead of the brief's order.
2. **Keep the current stack** (vanilla JS, no Tailwind, no database change). Switching styling or storage is a rebuild and is not recommended.
3. **AI cost:** may a brand without its own Gemini key use the platform key, within a small monthly limit, or should AI be off until the brand adds a key? (Recommended: limited free use on Pro and Enterprise, then the brand's own key.)
4. **Archive:** add a real "Archived" status (hidden from normal views, still searchable). Agree?
5. **Pilot:** which brand pilots first? (Recommended: demo, then showcase.)

## 7. Not changed

IMAP and Gmail push intervals, ticket ids, existing API names and responses, the database engine, other modules. Any new API is additive.
