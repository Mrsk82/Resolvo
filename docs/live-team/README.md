# Live team (supervisor board)

**Who:** Admins and Managers. **Where:** sidebar, Inbox section, **Live team**. **Needs:** the Inbox 2.0 pilot switched on for the workspace (Owner dashboard, workspace menu, Feature Overrides, Support group).

## What it shows (refreshes itself every 15 seconds while the tab is open)
- **Six tiles:** customers waiting for a first reply, the longest wait (click it to open the ticket), tickets past or close to their SLA, tickets with no owner, new tickets in the last hour (against the same hour yesterday), and how many agents are available.
- **One card per person:** status, workload bar (open tickets against their limit), how many customers are waiting on them, their longest wait, when they last did something, and which ticket they are looking at right now. Flags: *Away with N open*, *At their limit*, *Quiet for X* (available, someone waiting on them, and nothing done for 30+ minutes). Buttons: **Their tickets** (opens the inbox filtered to them) and **Nudge**.
- **Needs a hand:** past SLA, close to SLA, waiting longer than your limit, an unhappy or VIP customer waiting. Pick a person in **Give to** to move a ticket (a normal assignment, so they are told in the usual ways).
- **History:** new tickets and team replies for each of the last 24 hours, and the last 7 days (new, solved, average first reply), plus the busiest hour.
- **Pause** stops the refreshing. Leaving the page stops it too.

## Alerts (Admin sets the limits with "Alert limits")
Defaults: a customer has waited more than **10 minutes**; alert when **10** customers are waiting that long; alert when **20** tickets have no owner; alert when nobody is available and customers are waiting. The alert bar shows on the page, in the Admins' and Managers' bell, and every 2 minutes the server tells them by **phone/browser alert** and, if chosen, **email**. The same alert is repeated at most every 30 minutes. **Send myself a test alert** checks that a device is registered.

## Nudge
A short message to one person: a phone alert (if they switched alerts on) and an item in their bell. At most 5 an hour to the same person.

## What is left out of every number
Imported history, public mentions (Topics), promotions and automated mail, archived tickets, and snoozed tickets.

## Not built
WhatsApp or SMS alerts (every message costs money). Slack. A per-agent report over longer periods.

## Where the code is
`server.js` (the "Live team" block: `_liveBuild`, `_liveHistory`, `runLiveAlerts`, and the calls `getLiveBoard`, `getLiveHistory`, `getLiveBoardConfig`, `saveLiveBoardConfig`, `liveBoardAssign`, `nudgeAgent`, `testLiveAlert`), `public/js/rv-live.js`, `public/css/rv-live.css`. Tests in `docs/ui-redesign/tools/`: `live_team_test.js` (61), `live_team_ui_test.py` (35).
