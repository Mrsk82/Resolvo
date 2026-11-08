# Topics (public listening): set-up for the platform owner

Topics watch the public web for a brand's keywords and turn every mention into a ticket on the **Listening** channel. Brands set topics up themselves (sidebar, Inbox, Topics). You switch on the places by adding keys on the server. A place without its key shows as "not set up" and is skipped. You can see which are ready on the Architecture page (Topics section).

## The quickest way to add keys (nothing typed into chat)
Run this once to see what it would do (it sends nothing):

    powershell -ExecutionPolicy Bypass -File C:\Users\Asif\Desktop\New\TechTrack\scripts\add-listening-keys.ps1

It asks for each key (typing is hidden; press Enter to skip any you do not have). When the summary looks right, run the same command with `-Apply` on the end. It adds only those lines to the server settings, keeps a backup copy (`/opt/resolvo/.env.bak-keys`) and restarts Resolvo.

## Your own feeds (RSS): free, no key, works for any brand
Every brand can paste feed links into a topic (tick **Your own feeds** in the topic form). The best free one is **Google Alerts**:
1. Open google.com/alerts and sign in. Type the keyword, for example "Indian Idol", then click **Show options**.
2. Set **Deliver to** to **RSS feed**, then click **Create Alert**.
3. Click the orange RSS icon next to the alert and copy the link from the address bar. Paste it into the topic.

Reddit searches, Mastodon, blogs and forums also have feeds. By default a feed is trusted (it already searched for the keyword), so every item becomes a ticket except those with a "does not contain" word. Untick "Trust these feeds" to check the keywords again. Links are checked for safety: only public https addresses are read.

## What works with no key
| Place | Notes |
|---|---|
| News (GDELT) | Free, open data. One search every 5 seconds is its rule, so searches are queued. |
| Hacker News | Free, no key. |
| Your own feeds (RSS) | Free, no key, added per topic (see above). |

## Free, needs a key or login
| Place | Add to the server `.env` | Notes |
|---|---|---|
| Bluesky | `BSKY_HANDLE`, `BSKY_APP_PASSWORD` | Make a free Bluesky account, then Settings, Privacy and security, App passwords. Bluesky does not allow search without signing in. Use an app password, never the main one. |
| YouTube | `YOUTUBE_API_KEY` | Google Cloud, enable YouTube Data API v3, create an API key. Free quota allows about 100 searches a day for everyone together. |

## Paid
| Place | Add to the server `.env` | Cost (check the provider's own page before relying on these) |
|---|---|---|
| Web (Brave search) | `BRAVE_API_KEY` | About $5 per 1,000 searches. Plans cap each brand: Pro 300 a month, Enterprise 1,500. |
| X (Twitter) | `X_BEARER_TOKEN` | Pay per post read. Recent 7 days only. Plans cap each brand: Pro 1,000 posts a month, Enterprise 5,000. |

## Not offered, and why
- **Instagram and Facebook keyword search:** the official APIs only show a brand's own accounts. Public keyword search comes only from paid data resellers. The slot is ready if you choose one.
- **Google News feed:** its terms say personal, non-commercial use only, so it is not used.
- **Reddit:** commercial use needs a separate agreement with Reddit.

## After adding a key
1. Edit `/opt/resolvo/.env` on the server and add the lines.
2. `pm2 restart resolvo`.
3. Open the Architecture page: the place shows **ready**.

## What each plan gets
| Plan | Topics | Checked | Paid places |
|---|---|---|---|
| Free | not included | | |
| Trial | 3 | every 6 hours | off |
| Pro | 10 | every 3 hours | 300 web searches, 1,000 X posts a month |
| Enterprise | 50 | every hour | 1,500 web searches, 5,000 X posts a month |

## Good to know
- Every result is checked again against the keywords, because the places only roughly match.
- Mentions have **no SLA clock** and are left out of support numbers (first reply time, backlog, dashboard, Insights).
- Resolvo cannot reply to a public post. The team adds notes and opens the post to answer.
- A daily limit per topic (default 30) stops a busy topic flooding the inbox. A sudden jump (at least 5 mentions and 3 times the usual) alerts the team in the bell.
- Repeats are skipped. Deleting a topic keeps the tickets it made.
- To test without the internet, set `LISTENING_MOCK=<json file>`; every place then answers from the file.
