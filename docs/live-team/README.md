# Live team (supervisor board)

**Who:** Admins and Managers. **Where:** sidebar, Inbox section, **Live team**. **Needs:** the Inbox 2.0 pilot switched on for the workspace (Owner dashboard, workspace menu, Feature Overrides, Support group).

## What it shows (refreshes itself every 15 seconds while the tab is open)
- **Six tiles:** customers waiting for a first reply, the longest wait (click it to open the ticket), tickets past or close to their SLA, tickets with no owner, new tickets in the last hour (against the same hour yesterday), and how many agents are available.
- **One card per person:** status, workload bar (open tickets against their limit), how many customers are waiting on them, their longest wait, when they last did something, and which ticket they are looking at right now. Flags: *Away with N open*, *At their limit*, *Quiet for X* (available, someone waiting on them, and nothing done for 30+ minutes). Buttons: **Their tickets** (opens the inbox filtered to them) and **Nudge**.
- **Needs a hand:** past SLA, close to SLA, waiting longer than your limit, an unhappy or VIP customer waiting. Pick a person in **Give to** to move a ticket (a normal assignment, so they are told in the usual ways).
- **History:** new tickets and team replies for each of the last 24 hours, and the last 7 days (new, solved, average first reply), plus the busiest hour.
- **Pause** stops the refreshing. Leaving the page stops it too.

## Version 2: tabs and new pages
The page now has six tabs (Board, Incidents, SLA countdown, Channels, Activity, Forecast) and there is a separate **My day** page for every agent.
- **Incidents:** when 5 or more different customers (Admin can change this from 3 to 100) write about the same thing within about 90 minutes and far more than usual, they are grouped into one card with a small bar chart. Imported history, newsletters and the same customer writing many times are left out. Buttons: **I have seen this**, **Message these customers** (shows who gets it, an editable draft with the customer's first name filled in, a tick box to confirm, then sends in steps of 20, at most 100 customers, and reports how many were delivered; each message is a normal reply on the ticket, and failures show a Retry button there) and **Mark as over**. Nothing is sent to customers unless you do this.
- **SLA countdown:** every open ticket with a response-time target, soonest first, with a timer that counts down (or up, when late) every second.
- **Channels:** for email, WhatsApp and the other ways customers reach you: last message, last hour, last 24 hours, and the usual number per hour. A channel that is much quieter than normal at this time of day is flagged and an alert is raised.
- **Activity:** a live list of what is happening (new tickets, replies, assignments, SLA breaches, nudges, incidents), newest first, adds new items by itself.
- **Forecast:** the expected new tickets for each of the next 8 hours (from the same hour on the same weekday in earlier weeks) and how many agents that needs (tickets one agent handles in an hour is set in Alert limits), with a warning if too few are available. It says so when there is not enough history yet.
- **My day (all agents):** my customers waiting, replies and solved today, my first-reply average against the target, a countdown to each response target, and a way to the tickets nobody owns.
- **Board additions:** tiles open the matching inbox view when clicked; trend lines on the tiles; a bar of how long customers have waited (0 to 5, 5 to 15, 15 to 60, over 60 minutes); a team picker when there is more than one team; **Auto-balance** (shows the plan first, hands the oldest unassigned tickets to available agents within their limits); **Details** on each person (replies, solved, open, first reply today, who is waiting); **Sound** and **Desktop alerts** switches for this browser.
- **Wallboard (Admin):** a private link for a TV, a big-number page that needs no sign-in and shows counts and first names only (no ticket subjects, customers or addresses). The link is shown once when made, can be removed at any time (the screen then stops working), is rate limited, and its opened time is listed.

## Alerts (Admin sets the limits with "Alert limits")
Defaults: a customer has waited more than **10 minutes**; alert when **10** customers are waiting that long; alert when **20** tickets have no owner; alert when nobody is available and customers are waiting. The alert bar shows on the page, in the Admins' and Managers' bell, and every 2 minutes the server tells them by **phone/browser alert** and, if chosen, **email**. The same alert is repeated at most every 30 minutes. **Send myself a test alert** checks that a device is registered.

## Nudge
A short message to one person: a phone alert (if they switched alerts on) and an item in their bell. At most 5 an hour to the same person.

## What is left out of every number
Imported history, public mentions (Topics), promotions and automated mail, archived tickets, and snoozed tickets.

## Not built
WhatsApp or SMS alerts (every message costs money). Slack. A per-agent report over longer periods.

## Where the code is
`server.js` (the "Live team" block: `_liveBuild`, `_liveHistory`, `runLiveAlerts`, and the calls `getLiveBoard`, `getLiveHistory`, `getLiveBoardConfig`, `saveLiveBoardConfig`, `liveBoardAssign`, `nudgeAgent`, `testLiveAlert`, plus the v2 calls for incidents, SLA, channels, activity, forecast, My day, auto-balance, agent details and wallboard links, and the public routes `/wall/:slug/:token` and `/api/wall/:slug/:token`), `public/js/rv-live.js`, `public/js/wallboard.js`, `public/wallboard.html`, `public/css/rv-live.css`, `public/css/wallboard.css`. Tests in `docs/ui-redesign/tools/`: `live_team_test.js` (61), `live_team_ui_test.py` (35), `live_more_test.js` (85), `live_more_ui_test.py` (60).
