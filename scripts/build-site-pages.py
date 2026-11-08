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
        ("/shopify-customer-support-india", "For Shopify stores"), ("/tools/whatsapp-templates", "WhatsApp templates"), ("/tools/sla-calculator", "SLA calculator"), ("/app", "Android app"), ("/site-map", "Site map"), ("/demo", "Book a demo"), ("/blog", "Blog"), ("/privacy", "Privacy"), ("/terms", "Terms"), ("/refund", "Refunds"), ("/status", "Status")]

def page(slug, title, desc, tag, h1, sub, body, extra_ld=None, toc=None, cta=True, script="", head="", file=None):
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
{head}
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
{("<script>" + script + "</script>") if script else ""}
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

# ---------------------------------------------------------------- free tools and the Shopify page
WA_JS = r"""
(function(){
  var NL=String.fromCharCode(10);
  var S=[
   ['Order confirmed','Utility','Hi {{name}}, thank you for your order {{order}} from {{brand}}. We are getting it ready and will message you when it ships.'],
   ['Order shipped','Utility','Hi {{name}}, your order {{order}} from {{brand}} has shipped. Track it here: {{link}}'],
   ['Out for delivery','Utility','Hi {{name}}, your order {{order}} is out for delivery today. Please keep your phone nearby.'],
   ['Delivered','Utility','Hi {{name}}, your order {{order}} was delivered. If anything is not right, just reply to this message and we will help.'],
   ['Delivery delayed','Utility','Hi {{name}}, your order {{order}} is running late and should reach you by {{eta}}. Sorry for the wait. Reply here if you need anything.'],
   ['Cash on delivery check','Utility','Hi {{name}}, please confirm your cash on delivery order {{order}} from {{brand}} by replying YES. We will ship it once you confirm.'],
   ['Refund processed','Utility','Hi {{name}}, your refund of {{amount}} for order {{order}} has been processed. It can take 5 to 7 working days to show in your account.'],
   ['Payment pending','Utility','Hi {{name}}, we have not received the payment for order {{order}} yet. You can complete it here: {{link}}'],
   ['Support follow-up','Utility','Hi {{name}}, this is {{brand}} following up on your request. Did the solution work for you? Reply here if you still need help.']
  ];
  var $=function(id){return document.getElementById(id);};
  $('wtScn').innerHTML=S.map(function(s,i){return '<option value="'+i+'">'+s[0]+'</option>';}).join('');
  var KEYS=['name','order','brand','link','eta','amount'];
  function fill(t){var v={name:$('wtName').value||'Asha',order:$('wtOrder').value||'#1042',brand:$('wtBrand').value||'Your brand',link:$('wtLink').value||'https://example.com/track/123',eta:$('wtEta').value||'Friday',amount:$('wtAmt').value||'Rs 499'};return t.replace(/\{\{(\w+)\}\}/g,function(m,k){return v[k]!=null?v[k]:m;});}
  function render(){
    var s=S[+$('wtScn').value],t=s[2],used=[];
    t.replace(/\{\{(\w+)\}\}/g,function(m,k){if(used.indexOf(k)<0)used.push(k);return m;});
    $('wtPrev').textContent=fill(t);
    var num=t,ex=[];used.forEach(function(k,i){num=num.split('{{'+k+'}}').join('{{'+(i+1)+'}}');ex.push('{{'+(i+1)+'}} = '+fill('{{'+k+'}}'));});
    $('wtTpl').textContent=num;$('wtEx').textContent=ex.join(NL);$('wtCat').textContent=s[1];
  }
  document.getElementById('wtForm').addEventListener('input',render);document.getElementById('wtForm').addEventListener('change',render);
  function cp(id,btn){var t=$(id).textContent;(navigator.clipboard?navigator.clipboard.writeText(t):Promise.reject()).then(function(){btn.textContent='Copied';setTimeout(function(){btn.textContent=btn.getAttribute('data-l');},1500);}).catch(function(){var r=document.createRange();r.selectNodeContents($(id));var sel=getSelection();sel.removeAllRanges();sel.addRange(r);});}
  [['wtCopyPrev','wtPrev'],['wtCopyTpl','wtTpl']].forEach(function(p){var b=$(p[0]);b.setAttribute('data-l',b.textContent);b.addEventListener('click',function(){cp(p[1],b);if(window.gtag)gtag('event','tool_copy',{tool:'whatsapp_templates'});});});
  render();
})();
"""
wa_form = '''<section class="block"><h2>Pick a message and fill in your details</h2><p class="lead">Nothing you type leaves your browser.</p>
<form id="wtForm" class="tool" onsubmit="return false"><div class="tgrid">
<label>Message<select id="wtScn"></select></label><label>Your brand<input id="wtBrand" placeholder="Your brand" autocomplete="off"></label>
<label>Customer name<input id="wtName" placeholder="Asha" autocomplete="off"></label><label>Order number<input id="wtOrder" placeholder="#1042" autocomplete="off"></label>
<label>Tracking or payment link<input id="wtLink" placeholder="https://..." autocomplete="off"></label><label>Expected by (for delays)<input id="wtEta" placeholder="Friday" autocomplete="off"></label>
<label>Refund amount<input id="wtAmt" placeholder="Rs 499" autocomplete="off"></label></div></form></section>
<section class="block"><div class="grid">
<div class="card"><h3>What your customer sees</h3><pre id="wtPrev" style="white-space:pre-wrap"></pre><div class="row" style="margin-top:12px"><button type="button" class="btn small" id="wtCopyPrev">Copy message</button></div></div>
<div class="card"><h3>Text for WhatsApp Manager <span class="badge free" id="wtCat"></span></h3><pre id="wtTpl" style="white-space:pre-wrap"></pre><p style="margin-top:10px"><b>Example values to give Meta</b></p><pre id="wtEx" style="white-space:pre-wrap"></pre><div class="row" style="margin-top:12px"><button type="button" class="btn small" id="wtCopyTpl">Copy template</button></div></div></div></section>
<section class="block"><h2>Before you submit a template</h2><ul class="tick">
<li>A message you start yourself, outside the 24 hours after a customer last wrote, must use a <b>template that WhatsApp has approved</b>. Inside those 24 hours you can write freely.</li>
<li>Order updates belong in the <b>Utility</b> category. If a Utility template reads like a promotion, WhatsApp can move it to Marketing, which is priced differently.</li>
<li>Keep variables in order ({{1}}, {{2}}...), give an example for each, and keep the text short and plain.</li>
<li>You submit templates in Meta's WhatsApp Manager, or in your Twilio console if you use Twilio. Approval can take minutes or a day. WhatsApp's rules change, so read their current guidance before you submit.</li>
<li>Resolvo answers customer messages in the shared inbox and tells you when the 24-hour window has closed. <a href="/whatsapp-helpdesk-india">How WhatsApp works in Resolvo</a>.</li></ul></section>'''

SLA_JS = r"""
(function(){
  var $=function(id){return document.getElementById(id);};
  var T={s:[['Critical','4 hours'],['High','12 hours'],['Medium','48 hours'],['Low','72 hours']],m:[['Critical','2 hours'],['High','8 hours'],['Medium','24 hours'],['Low','72 hours']],l:[['Critical','1 hour'],['High','4 hours'],['Medium','12 hours'],['Low','48 hours']]};
  function run(){
    var a=Math.max(1,+$('slAg').value||1),t=Math.max(0,+$('slTk').value||0),m=Math.max(1,+$('slMn').value||1),h=Math.max(1,Math.min(10,+$('slHr').value||6));
    var work=t*m,cap=a*h*60,u=cap?work/cap:0,pct=Math.round(u*100),k=a<=3?'s':a<=10?'m':'l';
    var msg=u<0.6?'Comfortable. You have room for spikes, so aggressive targets are realistic.':u<0.8?'Busy but workable. Keep targets as below and watch the queue on Mondays.':u<=1?'Tight. Any bad day will create a backlog. Use the relaxed end of each target or add capacity.':'Overloaded. About '+Math.ceil((work-cap)/m)+' tickets a day will be left over, so no target will hold until capacity or the ticket count changes.';
    $('slUse').textContent=pct+'%';$('slMsg').textContent=msg;$('slWork').textContent=Math.round(work/60*10)/10+' hours of work a day for '+a+' '+(a===1?'agent':'agents')+' with '+h+' productive hours each ('+Math.round(cap/60)+' hours capacity)';
    $('slBar').style.width=Math.min(100,pct)+'%';$('slBar').style.background=u<0.6?'#10b981':u<0.8?'#f59e0b':'#ef4444';
    $('slTbl').innerHTML=T[k].map(function(r){return '<tr><td>'+r[0]+'</td><td>'+r[1]+'</td></tr>';}).join('');
    $('slTeam').textContent=a<=3?'a team of 1 to 3':a<=10?'a team of 4 to 10':'a team of more than 10';
  }
  $('slForm').addEventListener('input',run);run();
})();
"""
sla_body = '''<section class="block"><h2>Your team</h2><p class="lead">Nothing you type leaves your browser.</p>
<form id="slForm" class="tool" onsubmit="return false"><div class="tgrid">
<label>Agents answering customers<input id="slAg" type="number" min="1" value="3" inputmode="numeric"></label><label>Tickets a day<input id="slTk" type="number" min="0" value="40" inputmode="numeric"></label>
<label>Minutes of work per ticket<input id="slMn" type="number" min="1" value="12" inputmode="numeric"></label><label>Productive hours per agent a day<input id="slHr" type="number" min="1" max="10" value="6" step="0.5" inputmode="decimal"></label></div></form></section>
<section class="block"><div class="grid"><div class="card"><h3>How full your team is</h3><div style="font-size:40px;font-weight:800;margin:6px 0" id="slUse"></div><div style="height:12px;border-radius:6px;background:#E5E7EB;overflow:hidden"><div id="slBar" style="height:100%;width:0"></div></div><p style="margin-top:10px" id="slMsg"></p><p style="margin-top:6px;font-size:13px" id="slWork"></p></div>
<div class="card"><h3>Suggested first-response targets</h3><p>For <span id="slTeam"></span>:</p><div class="tablewrap"><table><thead><tr><th>Priority</th><th>First reply within</th></tr></thead><tbody id="slTbl"></tbody></table></div><p style="margin-top:10px;font-size:13px">Starting points, not promises. Set the ones you can keep, then tighten them as you learn your real numbers.</p></div></div>
<p class="note">Resolvo starts a clock on every ticket from these targets and shows what is Overdue or Due soon. Set them in Settings, then SLA. More in our <a href="/blog/sla-management-guide">guide to SLAs</a> and <a href="/tools/support-calculator">support team calculator</a>.</p></section>'''

shop_body = block("problem", "The tab you keep switching to", "A customer writes on WhatsApp: where is my order? You open Shopify, search the order, copy the status, go back, and type it. Multiply by every customer, every day.",
    '<ul class="tick"><li>Orders are in Shopify. Conversations are in Gmail, WhatsApp and Instagram.</li><li>Agents lose minutes on every ticket just finding the order.</li><li>Nobody can see which conversations are about to wait too long.</li></ul>')
shop_body += block("what", "What Resolvo does for a Shopify store", "The order sits next to the conversation, and one tap turns it into a reply.", cards([
    ("The order beside the ticket", "Status, items, shipping address and tracking number appear next to the customer's message, found by order number, email or phone."),
    ("A reply written from the order", "Tap Write the reply and get a full answer from the order's real status: shipped with the courier and tracking link, not shipped yet, partly shipped, cancelled or refunded. You edit it, then send."),
    ("WhatsApp and email in one inbox", "Customers write wherever they like. You answer from one queue, sorted by who has waited longest."),
    ("A clock on every ticket", "Overdue and Due soon tickets are counted and can buzz your phone, so no customer is forgotten."),
    ("On your phone", "The Android app swipes tickets to take, resolve or snooze, works offline, and takes a photo of a damaged parcel in one tap."),
    ("One price per brand", "Not per agent. Add your whole team at the same price.")]))
shop_body += block("connect", "Connect your store in five minutes", "You decide what Resolvo can see, and it can only read.", '<ol class="tick" style="list-style:decimal;padding-left:22px"><li>In Shopify, create a custom app and turn on <code>read_orders</code> and <code>read_customers</code>.</li><li>Install the app and copy its Client ID and secret (or its Admin API access token).</li><li>In Resolvo open Settings, then Integrations, then Shopify.</li><li>Enter your store address (<code>your-store.myshopify.com</code>) and paste the keys, then press Test.</li><li>Open any ticket from a customer who ordered: their order appears beside it.</li></ol>')
shop_body += block("limits", "What it does not do", "So you know before you start.", '<ul class="tick"><li>It is <b>read-only</b>. Refunds, cancellations and edits stay in Shopify.</li><li>It does not send WhatsApp promotions. Business-started WhatsApp messages need templates approved by WhatsApp: <a href="/tools/whatsapp-templates">free template generator</a>.</li><li>It does not replace your Shopify admin. It saves the trips there.</li></ul>')
shop_faq = {"@type": "FAQPage", "mainEntity": [
    {"@type": "Question", "name": "Can Resolvo change or refund my Shopify orders?", "acceptedAnswer": {"@type": "Answer", "text": "No. The connection is read-only: Resolvo reads orders and customers so agents can see them beside a ticket. Refunds, cancellations and edits stay in Shopify."}},
    {"@type": "Question", "name": "Which Shopify permissions does Resolvo need?", "acceptedAnswer": {"@type": "Answer", "text": "A custom app with read_orders and read_customers. You paste its Client ID and secret, or its Admin API access token, into Resolvo."}},
    {"@type": "Question", "name": "How does Resolvo find the right order?", "acceptedAnswer": {"@type": "Answer", "text": "By the order number the customer mentions, or by their email address or phone number."}},
    {"@type": "Question", "name": "Does Resolvo price per agent?", "acceptedAnswer": {"@type": "Answer", "text": "No. Resolvo is priced per brand, so you can add your whole team at the same price."}}]}

TOOL_CSS = '<style>.tool .tgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(220px,1fr));gap:14px}.tool label{display:block;font-size:13px;font-weight:600;color:#374151}.tool input,.tool select{display:block;width:100%;margin-top:5px;min-height:44px;padding:9px 12px;border:1px solid #D1D5DB;border-radius:9px;font:inherit;font-size:15px;background:#fff}.tool input:focus,.tool select:focus{outline:2px solid #10B981;outline-offset:1px}.btn.small{min-height:38px;padding:6px 16px;font-size:14px;border:0;cursor:pointer}pre{white-space:pre-wrap}</style>'
P_WA = page("tools/whatsapp-templates", "WhatsApp Order Update Templates, Free Generator | Resolvo", "Free generator for WhatsApp order-update templates: shipped, delayed, refund, cash on delivery. Copy the text ready for WhatsApp Manager.",
    "Free tool", "WhatsApp message templates for your store.", "Pick a situation, fill in your details and copy a message that is clear, short and ready to submit for approval.", wa_form, script=WA_JS, head=TOOL_CSS, file="tool-whatsapp-templates")
P_SLA = page("tools/sla-calculator", "SLA Calculator for Small Support Teams | Resolvo", "Free SLA calculator: enter your team size and ticket volume to see how full your team is and realistic first-response targets by priority.",
    "Free tool", "Set response targets you can actually keep.", "Tell us how many people answer customers and how many tickets arrive. We show how full your team is and suggest first-response targets.", sla_body, script=SLA_JS, head=TOOL_CSS, file="tool-sla-calculator")
P_SHOP = page("shopify-customer-support-india", "Shopify Customer Support Software for Indian Stores | Resolvo", "See the Shopify order next to every WhatsApp or email ticket, and reply in one tap. Read-only connection, priced per brand in rupees.",
    "For Shopify stores", "Customer support software for Shopify stores in India.", "Answer \"where is my order?\" without leaving the conversation. Resolvo shows the order beside the ticket and writes the reply from its real status.", shop_body, extra_ld=shop_faq,
    toc=[("problem", "The problem"), ("what", "What it does"), ("connect", "Connect"), ("limits", "Limits")], file="seo-shopify-support")


# ---------------------------------------------------------------- site map: every public page, built from sitemap.xml so nothing can be left out
def _site_map_body():
    import glob, re
    titles = {}
    for f in glob.glob(os.path.join(OUT, "*.html")):
        t = open(f, encoding="utf-8", errors="replace").read()
        c = re.search(r'rel="canonical" href="([^"]+)"', t); h = re.search(r"<title>(.*?)</title>", t, re.S)
        if c and h: titles[c.group(1)] = html.unescape(h.group(1)).replace(" | Resolvo", "").strip()
    xml = open(os.path.join(OUT, "sitemap.xml"), encoding="utf-8").read()
    names = {"Core pages": "Main pages", "Product pages": "Product, plans, guides and free tools", "Blog index": "Blog", "Tool Comparisons": "Comparisons with other helpdesks"}
    groups, order, cur = {}, [], "Main pages"
    for line in xml.splitlines():
        m = re.search(r"<!--\s*(.*?)\s*-->", line)
        if m: cur = names.get(m.group(1), "Blog: " + m.group(1))
        m = re.search(r"<loc>(.*?)</loc>", line)
        if not m: continue
        loc = m.group(1); path = loc.replace(SITE, "") or "/"
        if cur not in groups: groups[cur] = []; order.append(cur)
        label = titles.get(loc) or path.strip("/").split("/")[-1].replace("-", " ").capitalize()
        groups[cur].append((path, label))
    out = []
    for g in order:
        out.append(f'<section class="block"><h2>{E(g)} <span class="pill-n">{len(groups[g])}</span></h2><ul class="maplist">' + "".join(f'<li><a href="{E(pa)}">{E(la)}</a></li>' for pa, la in groups[g]) + "</ul></section>")
    total = sum(len(v) for v in groups.values())
    return "".join(out), total

_map_body, _map_total = _site_map_body()
P_MAP = page("site-map", "Site map | Resolvo", "Every public page on the Resolvo website in one list: product, plans, free tools, comparisons, guides and blog articles.",
    "Site map", "Every page on this website.", f"{_map_total} pages, nothing hidden. This list is built from the same file search engines read, so a new page cannot be forgotten.", _map_body,
    cta=False, head="<style>.maplist{list-style:none;margin:0;padding:0;columns:2 300px;column-gap:32px}.maplist li{break-inside:avoid;padding:5px 0;line-height:1.4}.pill-n{font-size:12px;font-weight:600;color:var(--muted,#667);margin-left:6px}</style>")

for slug, content in [("features", P_FEATURES), ("integrations", P_INTEGRATIONS), ("security", P_SECURITY), ("customers", P_CUSTOMERS), ("changelog", P_CHANGELOG),
                      ("tool-whatsapp-templates", P_WA), ("tool-sla-calculator", P_SLA), ("seo-shopify-support", P_SHOP), ("site-map", P_MAP)]:
    with open(os.path.join(OUT, slug + ".html"), "w", encoding="utf-8", newline=chr(10)) as f: f.write(content)
    print("wrote", slug + ".html", len(content))
