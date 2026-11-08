"""Builds the Features, Integrations, Security, Customers and Changelog pages into public/.
Run: python scripts/build-site-pages.py   (safe to run again; it overwrites those five files)
Every claim on these pages must be true of the product today: check the code or the live app before adding one."""
import html, json, os
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public")
SITE = "https://app.resolvogroup.com"
E = html.escape

NAV = [("/features", "Features"), ("/integrations", "Integrations"), ("/security", "Security"), ("/pitch#pricing", "Pricing"), ("/customers", "Customers"), ("/blog", "Blog")]
FOOT = [("/pitch", "Home"), ("/features", "Features"), ("/integrations", "Integrations"), ("/security", "Security"), ("/customers", "Customers"), ("/changelog", "What's new"), ("/partners", "Design partners"),
        ("/app", "Android app"), ("/demo", "Book a demo"), ("/blog", "Blog"), ("/privacy", "Privacy"), ("/terms", "Terms"), ("/refund", "Refunds"), ("/status", "Status")]

def page(slug, title, desc, tag, h1, sub, body, extra_ld=None, toc=None, cta=True):
    url = f"{SITE}/{slug}"
    crumbs = {"@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/pitch"}, {"@type": "ListItem", "position": 2, "name": h1.split(":")[0] if len(h1) < 40 else tag, "item": url}]}
    ld = [{"@context": "https://schema.org", "@type": "WebPage", "name": title, "description": desc, "url": url, "isPartOf": {"@type": "WebSite", "name": "Resolvo", "url": SITE}}, dict(crumbs, **{"@context": "https://schema.org"})]
    if extra_ld: ld.append(dict(extra_ld, **{"@context": "https://schema.org"}))
    nav = "".join(f'<a href="{h}"{" aria-current=\"page\"" if h.strip("/") == slug else ""}>{n}</a>' for h, n in NAV)
    foot = " &middot; ".join(f'<a href="{h}">{n}</a>' for h, n in FOOT)
    tocs = ('<div class="toc">' + "".join(f'<a href="#{i}">{E(t)}</a>' for i, t in toc) + "</div>") if toc else ""
    ctab = ('<div class="cta"><div><h2>Try it on your own tickets</h2><p>14 days free, no card. After that you keep the Free plan or choose Pro or Enterprise.</p></div>'
            '<div class="row"><a class="btn" href="/signup">Start free</a><a class="btn ghost" href="/demo">Book a demo</a></div></div>') if cta else ""
    return f'''<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>{E(title)}</title>
<meta name="description" content="{E(desc)}">
<link rel="canonical" href="{url}">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<meta property="og:type" content="website"><meta property="og:site_name" content="Resolvo"><meta property="og:url" content="{url}">
<meta property="og:title" content="{E(title)}"><meta property="og:description" content="{E(desc)}">
<meta property="og:image" content="{SITE}/img/og-resolvo.png"><meta property="og:image:width" content="1200"><meta property="og:image:height" content="630"><meta property="og:image:alt" content="Resolvo: customer support for Indian brands">
<meta name="twitter:card" content="summary_large_image"><meta name="twitter:title" content="{E(title)}"><meta name="twitter:description" content="{E(desc)}"><meta name="twitter:image" content="{SITE}/img/og-resolvo.png">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/css/site-pages.css?v=1">
<script type="application/ld+json">{json.dumps(ld, ensure_ascii=False)}</script>
</head>
<body>
<nav>
  <a href="/pitch" class="logo"><img src="/logo-mark.svg" alt="Resolvo" width="26" height="26" style="border-radius:6px"><span class="logo-name">resolvo</span></a>
  <div class="nav-links">{nav}<a href="/signup" class="nav-cta">Start free</a></div>
</nav>
<header class="hero"><div class="wrap">
  <div class="tag">{E(tag)}</div>
  <h1>{h1}</h1>
  <p class="sub">{sub}</p>
  {tocs}
</div></header>
<main class="wrap">
{body}
{ctab}
</main>
<footer>&copy; 2026 Resolvo<br>{foot}<br><a href="mailto:contact@resolvogroup.com">contact@resolvogroup.com</a></footer>
<script src="/js/site.js" defer data-wa="1"></script>
</body>
</html>
'''

def cards(items):
    out = []
    for it in items:
        t, p = it[0], it[1]; badge = it[2] if len(it) > 2 else ""
        b = {"Free": '<span class="badge free">Free</span>', "Pro": '<span class="badge pro">Pro</span>', "Enterprise": '<span class="badge ent">Enterprise</span>', "": ""}.get(badge, f'<span class="badge">{E(badge)}</span>')
        out.append(f'<div class="card"><h3>{E(t)} {b}</h3><p>{p}</p></div>')
    return '<div class="grid">' + "".join(out) + "</div>"

def block(i, h, lead, inner):
    return f'<section class="block" id="{i}"><h2>{E(h)}</h2><p class="lead">{lead}</p>{inner}</section>'

# ---------------------------------------------------------------- features
features = [
 ("inbox", "One inbox for every conversation", "Email, WhatsApp and your website chat land in one queue, sorted by who has waited longest.", [
   ("Shared inbox with Focus mode", "A calm queue that shows what needs you now. Open a ticket, answer it, move to the next. Overdue and Due soon are one tap away."),
   ("Email ticketing", "Connect the Gmail or support address you already use. Customer emails become tickets with an owner, a priority and an SLA clock.", "Pro"),
   ("WhatsApp Business", "Reply to WhatsApp customers from the same inbox, through the official WhatsApp Business API (Twilio or Meta Cloud API)."),
   ("Website chat widget", "Add one line to your site and visitors can write to you. Their messages arrive as tickets.", "Enterprise"),
   ("Instagram, Facebook and Telegram", "Messages and comments from these channels can arrive in the same inbox. Meta channels need your Meta business verification and app review."),
   ("Customer self-service portal", "Customers log in to see their tickets and answers without emailing you.", "Enterprise")]),
 ("answer", "Answer faster, with less typing", "Everything that saves a minute on a reply, when you write a hundred a day.", [
   ("AI reply drafts", "Open a ticket and get a draft in your brand's tone. Your agent edits and sends. Nothing is ever sent without a person clicking send.", "Pro"),
   ("Saved replies and replies for the moment", "Order status, refund, delay, follow-up and thanks. Pick one and the customer's name, order number and your name are filled in."),
   ("Smart queue assignment", "New tickets go to the right person, so agents stop stepping on each other.", "Pro"),
   ("Internal notes, snooze and bulk actions", "Leave notes only your team sees, snooze a ticket until it matters again, and act on many tickets at once."),
   ("Automatic acknowledgements", "Customers get an instant \"we have your message\" email. It is marked as an automatic reply so it never starts an email loop."),
   ("Knowledge base", "Write help articles once and reuse them in replies and for your customers.", "Pro")]),
 ("promises", "Keep your promises", "Know which customer is about to wait too long, before they ask.", [
   ("SLA clocks and alerts", "Every ticket has a target time. Overdue and Due soon tickets are counted on your Today cards and can buzz your phone."),
   ("Escalation rules", "When a ticket sits too long or is marked critical, the right people hear about it."),
   ("CSAT and NPS", "Ask customers how it went and see the scores next to your ticket numbers."),
   ("Audit trail", "A record of who changed what: tickets, users, roles and passwords.", "Free")]),
 ("customers", "Know who you are talking to", "A customer record that shows the whole story next to the ticket.", [
   ("Customer record", "Every email, WhatsApp number and ticket of one person in one place, with badges for VIP, at risk and happy."),
   ("Shopify orders next to the ticket", "See the customer's order, its status and tracking number beside the conversation. Read-only: Resolvo never changes your store. One tap writes a reply from the order's real status."),
   ("Duplicate customers", "When the same person writes from email and WhatsApp, Resolvo offers to join the two records."),
   ("Sales pipeline", "Track deals for the customers who are also leads, without another tool.")]),
 ("insights", "See how the team is doing", "Plain answers instead of a wall of charts.", [
   ("Insights", "An overview, plain-language questions (\"who is slowest this week?\") and a team scorecard.", "Pro"),
   ("SLA, workload and response-time reports", "Where tickets wait, who is overloaded and how fast you answer first.", "Pro"),
   ("Multiple brands, one dashboard", "Give each brand its own inbox, portal and SLA policy and watch all of them from one place.")]),
 ("phone", "Built for the phone", "Most support happens away from a desk. The Android app and the website work the same way.", [
   ("Swipe to take, resolve or snooze", "Swipe a ticket right to take it and all the way to resolve it, with an Undo."),
   ("Write with no signal", "Replies and new tickets written offline are saved and sent by themselves when you are back online. Unsent drafts are kept."),
   ("Dictate, photos and files", "Speak your reply in English, Hindi and other Indian languages, or add a photo from the camera."),
   ("App lock and widget", "Lock the app with a PIN, fingerprint or face (Android app). Add a home-screen widget with your open and overdue tickets."),
   ("Alerts with buttons", "Alerts about a ticket come with Reply, Assign to me and Resolve (Chrome on Android and installed web app)."),
   ("Android app and iPhone", "Download the Android app, or open Resolvo in Safari on iPhone and add it to the home screen. <a href=\"/app\">Get the app</a>.")]),
 ("admin", "Run it safely", "Controls and safety nets for the person in charge.", [
   ("Roles and permissions", "Admins decide who can add people and change settings."),
   ("Two-factor sign-in", "A second step keeps an account safe if a password leaks.", "Pro"),
   ("Nightly backups", "Every workspace is backed up every night and the backup is checked. <a href=\"/security\">How we protect your data</a>."),
   ("Data export and erasure tools", "Export your data, and use the erasure and retention tools when a customer asks.", "Enterprise")]),
]
body = "".join(block(i, h, l, cards(c)) for i, h, l, c in features)
body += '<p class="note">Plan tags show where a feature starts. Features without a tag are available on the plan you choose when your 14-day trial ends: see <a href="/pitch#pricing">pricing</a> for the full list. Something missing? <a href="mailto:contact@resolvogroup.com">Tell us</a>: design partners decide what we build next.</p>'
P_FEATURES = page("features", "Features: shared inbox, WhatsApp, SLA and AI | Resolvo", "Everything Resolvo does for a small support team: shared inbox, email and WhatsApp, SLA tracking, AI reply drafts, Shopify orders, insights and a phone app.",
    "Features", "Everything your support team needs, in one calm inbox.", "Resolvo is a helpdesk for small teams in India. Here is what it does today, in plain words, and what you need for each part.", body,
    toc=[(i, h.split(",")[0]) for i, h, _, _ in features])

# ---------------------------------------------------------------- integrations
ints = [
 ("Gmail and other email", "Connect your support address (Gmail, Google Workspace or any IMAP mailbox). Customer emails become tickets and your replies go out from your own address.", "Pro"),
 ("WhatsApp Business", "Use the official WhatsApp Business API. Connect through Twilio or directly through Meta Cloud API. You need a verified WhatsApp Business number. Replies follow WhatsApp's 24-hour window and Resolvo tells you when it has closed."),
 ("Shopify", "See the customer's orders, status and tracking inside the ticket and on the customer profile. Connect with your store address and a Client ID and secret (or an access token). Resolvo only reads orders, it never changes them."),
 ("Google Calendar", "Show and book appointments against your calendar."),
 ("Slack alerts", "Send new and overdue ticket alerts to a Slack channel with a webhook URL."),
 ("Website chat widget", "Put a chat button on your site with one line of code. Messages arrive as tickets.", "Enterprise"),
 ("Instagram, Facebook Pages and Telegram", "Bring messages and comments into the inbox. Instagram and Facebook need a verified Meta business and Meta's app review before real customers can use them."),
 ("Alerts on your phone", "Browser and app alerts for new, assigned and overdue tickets. In Chrome on Android they carry Reply, Assign and Resolve buttons."),
 ("Zapier and your own tools", "Create tickets from a web form, Zapier or your own system through the ticket API (see below).", "Enterprise"),
]
widget = '<pre>&lt;script src="https://app.resolvogroup.com/widget/YOUR-WORKSPACE/widget.js"&gt;&lt;/script&gt;</pre>'
api = ('<pre>curl -X POST https://app.resolvogroup.com/api/tickets/public/create \\\n  -H "Content-Type: application/json" \\\n  -H "x-api-token: YOUR_API_TOKEN" \\\n'
       '  -d \'{"subject":"Refund not received","email":"customer@example.com","name":"Asha","body":"I returned the order 7 days ago.","priority":"High"}\'</pre>'
       '<p class="note">The answer is <code>{"success":true,"ticketId":"TKT-..."}</code>. <code>priority</code> can be Critical, High, Medium or Low. Create an API token in Settings, then API.</p>')
body = block("connect", "What Resolvo connects to", "Set up each one from Settings in a few minutes. Plan tags show where a feature starts.", cards(ints))
body += block("widget", "Website chat widget", "Replace YOUR-WORKSPACE with your workspace name (its short address in Resolvo) and paste this before the closing body tag of your site.", widget)
body += block("api", "Create tickets from your own tools", "One call creates a ticket. Use it from a form, a script or Zapier's webhook step.", api)
body += block("channels", "Honest notes", "So there are no surprises.", '<ul class="tick"><li>Meta channels (Instagram, Facebook, WhatsApp Cloud API) need verification and review by Meta. We guide you, but the approval is Meta\'s.</li><li>Shopify support is read-only today. Refunds and edits stay in Shopify.</li><li>Need something else? Tell us at <a href="mailto:contact@resolvogroup.com">contact@resolvogroup.com</a>. Design partners shape the list.</li></ul>')
P_INTEGRATIONS = page("integrations", "Integrations: Gmail, WhatsApp, Shopify and Slack | Resolvo", "Connect Resolvo to Gmail or IMAP, WhatsApp Business, Shopify, Google Calendar, Slack and your own tools. Set up in minutes from Settings.",
    "Integrations", "Connect the tools you already use.", "Email, WhatsApp, Shopify and more feed one inbox. Here is what connects, how, and what each one needs.", body,
    toc=[("connect", "What connects"), ("widget", "Chat widget"), ("api", "Ticket API"), ("channels", "Honest notes")])

# ---------------------------------------------------------------- security
sec = [
 ("hosting", "Where your data lives", "Plain facts about the servers.", '<ul class="tick"><li>Each brand has its <b>own database</b>. One brand\'s tickets and customers are never stored in another brand\'s database.</li><li>Resolvo runs on a dedicated server from Contabo in a data centre in the European Union.</li><li>Everything travels over <b>HTTPS</b>.</li><li>Access tokens for WhatsApp (Meta) and social channels are stored <b>encrypted</b> (AES-256-GCM).</li></ul>'),
 ("access", "Who can get in", "Sign-in and permissions.", '<ul class="tick"><li>Passwords are stored as one-way hashes (bcrypt). We cannot read them.</li><li>Too many wrong passwords and sign-in is paused for 15 minutes.</li><li>Optional <b>two-factor sign-in</b> on Pro and above.</li><li>On the phone, an <b>app lock</b> with PIN, fingerprint or face. The PIN is kept only on your phone, as a salted hash, and too many wrong tries sign you out.</li><li>Admins decide who can add people and change settings. Sessions expire (8 hours, or 30 days if you choose to stay signed in).</li><li>When our team opens your workspace to help you, it is written to a log.</li></ul>'),
 ("backups", "Backups and recovery", "So a mistake or a failure is never the end.", '<ul class="tick"><li>Every night, every workspace and all settings are backed up and the backup is <b>checked</b> straight after. If a backup fails, we are alerted.</li><li>We keep the last 14 days, then one a week for 8 weeks.</li><li>Anything our team deletes (a workspace, a user, a ticket) goes into a <b>30-day recycle bin</b> first, so it can be restored.</li></ul>'),
 ("audit", "A record of changes", "Know who did what.", '<ul class="tick"><li>The audit trail records users added, roles and status changed, password changes and imports, with who did them and when.</li><li>Ticket activity is recorded on each ticket.</li></ul>'),
 ("data-rights", "Your data and your rights", "You stay in charge of your customers' data.", '<ul class="tick"><li>You own the data you put into Resolvo. We use it only to run your helpdesk. We do not sell it and we do not use it for advertising.</li><li><b>Export</b> your data as CSV whenever you like.</li><li>Ask us to <b>delete</b> your data at <a href="mailto:contact@resolvogroup.com">contact@resolvogroup.com</a>. Account data is deleted within 30 days of a closure request. Copies in our nightly backups age out within about 10 weeks.</li><li>The Enterprise plan adds erasure and retention tools for answering your own customers\' requests.</li><li>Read the full <a href="/privacy">privacy policy</a>.</li></ul>'),
 ("services", "Services your data may pass through", "Only when you turn the feature on.", '<div class="tablewrap"><table><thead><tr><th>Service</th><th>Used for</th></tr></thead><tbody><tr><td>Contabo</td><td>Hosting the servers</td></tr><tr><td>Google (Gmail, Calendar, Gemini)</td><td>Email, calendar, and AI reply drafts</td></tr><tr><td>Twilio or Meta</td><td>WhatsApp and social messages</td></tr><tr><td>Shopify</td><td>Reading orders (read-only)</td></tr><tr><td>Slack</td><td>Alerts you choose to send</td></tr><tr><td>Google Analytics</td><td>Website visits, only if you accept the cookie choice</td></tr></tbody></table></div>'),
 ("reporting", "Found a security problem?", "We want to hear about it first.", '<p class="lead">Email <a href="mailto:contact@resolvogroup.com?subject=Security">contact@resolvogroup.com</a> with the word Security in the subject. Tell us what you found and how to reproduce it. We reply within one working day. Please give us a reasonable time to fix a problem before you share it publicly.</p>'),
 ("certifications", "What we have not done yet", "We would rather be honest than impressive.", '<p class="note warn">Resolvo has <b>not</b> completed a SOC 2 or ISO 27001 audit. We are a new product, and we will say so here when that changes. If your company needs a security questionnaire answered, send it to us and we will fill it in honestly.</p>'),
]
body = "".join(block(i, h, l, inner) for i, h, l, inner in sec)
faq = {"@type": "FAQPage", "mainEntity": [
    {"@type": "Question", "name": "Where is my data stored?", "acceptedAnswer": {"@type": "Answer", "text": "Each brand has its own database on a dedicated server from Contabo in a data centre in the European Union. Everything travels over HTTPS."}},
    {"@type": "Question", "name": "Does Resolvo make backups?", "acceptedAnswer": {"@type": "Answer", "text": "Yes. Every workspace is backed up every night and the backup is checked. We keep 14 days of backups and then one a week for 8 weeks."}},
    {"@type": "Question", "name": "Can I export or delete my data?", "acceptedAnswer": {"@type": "Answer", "text": "You can export your data as CSV at any time and ask us to delete it by email. Account data is deleted within 30 days of a closure request."}},
    {"@type": "Question", "name": "Is Resolvo SOC 2 or ISO 27001 certified?", "acceptedAnswer": {"@type": "Answer", "text": "Not yet. Resolvo is a new product and has not completed either audit. We will say so on the security page when that changes."}}]}
P_SECURITY = page("security", "Security and data protection | Resolvo", "How Resolvo protects support data: a separate database per brand, HTTPS, hashed passwords, nightly checked backups and an audit trail.",
    "Security", "How we protect your support data.", "Customer conversations are sensitive. This page says what we do, in plain words, and what we have not done yet.", body, extra_ld=faq,
    toc=[(i, h) for i, h, _, _ in sec])

# ---------------------------------------------------------------- customers
body = block("honest", "We are new, and we say so", "Resolvo is a young product. We do not show made-up logos, quotes or numbers. When a customer agrees to be quoted, in writing, their words will appear here.",
    '<ul class="tick"><li>No invented customer counts or results anywhere on this site.</li><li>The numbers on the home page dashboard picture are an example, not real data.</li><li>A testimonial is only ever published with the customer\'s written OK.</li></ul>')
body += block("partners", "Our first five brands", "We are working closely with a small group of design partners.", cards([
    ("60 days of Pro, free", "No card. Use Resolvo on your real customer tickets."), ("A hands-on setup", "A 20-minute call where we connect your support inbox with you and answer a first ticket together."),
    ("A direct line to the founder", "Questions and fixes go straight to the person who builds it. Your feature requests come first."), ("No lock-in", "After 60 days you choose Free or Pro, and your data stays.")]) +
    '<div class="row" style="margin-top:20px"><a class="btn" href="/partners#apply">Apply for a spot</a></div>')
body += block("check", "Check it yourself", "You do not have to take our word for it.", cards([
    ("Try the live demo", "Click around a sample workspace. Nothing is saved. <a href=\"/demo\">Open the demo</a>."), ("Start free", "Connect your own inbox and see your own tickets in 5 minutes. <a href=\"/signup\">Start free</a>."),
    ("Read how we protect data", "Including what we have not certified. <a href=\"/security\">Security</a>."), ("Watch it improve", "Every change is listed with its date. <a href=\"/changelog\">What's new</a>."),
    ("See if we are up", "Live status of the service. <a href=\"/status\">Status</a>.")]))
P_CUSTOMERS = page("customers", "Customers and design partners | Resolvo", "Resolvo is a new helpdesk working with its first five brands. No invented logos or quotes: see what design partners get, and how to check the product yourself.",
    "Customers", "Built with our first customers, in the open.", "We are early, and we would rather be honest about it than fill this page with logos that are not real.", body, cta=False)

# ---------------------------------------------------------------- changelog
LOG = [
 ("2026-11-08", "8 November 2026", "Phone: write offline, dictate, photos, lock, widget", [
   "<b>Write with no signal.</b> Replies and new tickets written offline are saved and sent by themselves when you are back. Unsent drafts are kept for each ticket.",
   "<b>Dictate</b> a reply in English, Hindi and other Indian languages. <b>Photos and files</b> can be added from the camera, shrunk first so they send fast.",
   "<b>Replies for the moment</b> (order status, refund, delay, follow-up, thanks) with the customer's name, order number and your name filled in. From a Shopify order, <b>Write the reply</b> drafts a full answer from its real status.",
   "<b>App lock</b> with PIN, plus fingerprint or face in the Android app. <b>Home-screen widget</b> with your open, overdue and due-soon tickets.",
   "<b>Today cards</b> in the inbox now include Overdue and Due soon. <b>Call</b> and <b>WhatsApp</b> buttons on every customer row on the phone.",
   "Alerts about a ticket come with <b>Reply, Assign to me and Resolve</b> buttons (Chrome on Android and the installed web app).",
   "<b>Android app 1.2</b> with fingerprint lock, dictation and the widget. <a href=\"/app\">Download</a>."]),
 ("2026-11-02", "2 November 2026", "Safer deletes", ["Anything removed by our team (a workspace, a user, a ticket or a lead) goes to a <b>30-day recycle bin</b> first, and can be restored with all its data."]),
 ("2026-10-31", "31 October 2026", "Backups and clearer emails", [
   "<b>Nightly backups</b> of every workspace, checked after they are made, kept for 14 days and then weekly for 8 weeks.",
   "<b>Password reset</b> works with capital letters and spaces in your address, says plainly when an email could not be sent, and sends from Resolvo when your own sending email is not set up.",
   "<b>Welcome emails</b> reach new team members the same way. If one cannot be sent, the admin sees a temporary password to pass on.",
   "The <b>audit trail</b> now shows users added, roles and passwords changed and imports, with who did them.",
   "Acknowledgement emails are marked as <b>automatic replies</b> so two helpdesks never answer each other in a loop."]),
 ("2026-10-29", "29 October 2026", "Android app and Shopify orders", [
   "<b>Resolvo for Android</b> and its download page.",
   "<b>Shopify orders next to the ticket</b> and on the customer profile: status, items and tracking number. Read-only."]),
 ("2026-10-28", "28 October 2026", "Phone gestures", [
   "<b>Swipe</b> a ticket right to take it and all the way to resolve it, with Undo. Swipe left to snooze. <b>Pull to refresh</b> the lists.",
   "A slim <b>reply bar</b> that opens the full composer when you need it, and <b>saved replies</b> as chips above the keyboard.",
   "<b>Call, WhatsApp and Email</b> buttons on a customer, and fixes for the login and admin screens on small phones."]),
 ("2026-10-27", "27 October 2026", "A calmer inbox and a new look", [
   "New <b>inbox</b> with Focus mode and two panels, a <b>Today</b> page, <b>Insights</b> with plain-language answers, and a <b>Settings</b> page that shows the real status of each section.",
   "<b>Customers</b> with health badges (VIP, at risk, happy), last contact and filters. A <b>command palette</b> that finds tickets and customers.",
   "<b>Installable app</b> for the phone with alerts on your device.",
   "Clear messages when connecting email goes wrong, a <b>WhatsApp setup guide</b>, and no more dead ends for agents.",
   "Three new guides and a free <a href=\"/tools/support-calculator\">support-team calculator</a>."]),
]
ent = "".join(f'<div class="entry" id="v{d}"><time datetime="{d}">{E(label)}</time><h3>{E(t)}</h3><ul>' + "".join(f"<li>{i}</li>" for i in items) + "</ul></div>" for d, label, t, items in LOG)
body = f'<section class="block"><div class="log">{ent}</div><p class="note">Want something added? <a href="mailto:contact@resolvogroup.com">Tell us</a>. This list is written in plain words and only includes what is live.</p></section>'
P_CHANGELOG = page("changelog", "What's new in Resolvo: product updates | Resolvo", "Every Resolvo update with its date, in plain words: phone app, offline replies, dictation, backups, Shopify orders, the new inbox and more.",
    "What's new", "What we shipped, week by week.", "Resolvo improves every week. Here is every change that is live, newest first.", body, cta=False)

for slug, content in [("features", P_FEATURES), ("integrations", P_INTEGRATIONS), ("security", P_SECURITY), ("customers", P_CUSTOMERS), ("changelog", P_CHANGELOG)]:
    with open(os.path.join(OUT, slug + ".html"), "w", encoding="utf-8", newline="\n") as f: f.write(content)
    print("wrote", slug + ".html", len(content))
