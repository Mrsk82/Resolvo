# Import tickets from another help desk

**Where:** Ticket Inbox, the **...** menu (Inbox actions), **Import tickets from another help desk**. Admins only.

## What it does
You upload a CSV exported from Zendesk, Freshdesk, Help Scout or any help desk. Resolvo recognises the columns, you check them, you see a preview, then it imports.

Imported tickets are **history only**:
- no email is sent to any customer, no alert goes off, no response-time clock starts;
- nothing is assigned automatically (an agent named in the file is kept only if it matches someone on your team);
- they are tagged `imported`, marked "Imported" in the list, and never show as unread;
- open ones stay open (so you see what was still pending), solved and closed ones stay finished;
- old-ticket automations are skipped for them: escalation rules, "ticket age" automations, customer satisfaction surveys, the assignment queue and daily digests.

## Limits and honest notes
- Up to 20,000 tickets per import (split bigger files). Up to 25 MB per file.
- **CSV exports often carry no message text.** Zendesk's CSV export never includes messages or comments, so those tickets import with subject, customer, status, priority and dates only (each gets a note saying so). Freshdesk can include a Description column. The full conversation needs a live connection (not built).
- Dates without a time zone are read as India time (IST). If your dates look like `03/04/2024`, choose day-first or month-first on the column step. A first number above 12 is always read as the day.
- Column names were matched against what these help desks usually export; the exact headers could not be checked against a live export, so **always check the column step** before importing.
- A row with no customer email is skipped. Statuses Resolvo does not know import as Open (the preview tells you which).
- Importing the same file twice creates no duplicates (matched on the old ticket number, or on the content when there is none).

## Undo
The same screen lists earlier imports with **Remove**. It deletes what that import created, except tickets your team has already replied to or added notes on (those are kept).

## Try it
`sample-zendesk-export.csv` in this folder has 15 made-up tickets (example.org addresses, no real customers).

## Where the code is
`lib/ticket-import.js` (reading the file), the "Import tickets" block in `server.js`, `public/js/rv-import.js` (the screen). Tests: `ticket_import_unit_test.js`, `ticket_import_test.js`, `ticket_import_ui_test.py` in `docs/ui-redesign/tools/`.
