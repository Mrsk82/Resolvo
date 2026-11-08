"""One-time pass over the public website pages (safe to run again):
  - analytics moves behind the cookie choice (js/site.js) and the WhatsApp button is added to public pages
  - shorter page titles and descriptions, a correct canonical address on every page, a share picture on every page
  - structured data for the home page (organisation, software, prices, FAQ) and every blog post
  - pages that fade in with JavaScript become readable even if the script is slow or blocked
  - /pro stays out of search, the home page tells the pricing story clearly, links to the new pages
Run: python scripts/seo-pass.py"""
import glob, html, json, os, re
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
PUB = os.path.join(ROOT, "public")
SITE = "https://app.resolvogroup.com"
NEW = {"features", "integrations", "security", "customers", "changelog", "tool-whatsapp-templates", "tool-sla-calculator", "seo-shopify-support", "site-map"}                      # built by build-site-pages.py
APP_PAGES = {"index", "portal", "dashboard", "crm", "owner-console", "offline", "404", "500", "styleguide", "architecture", "marketing-content", "blog-TEMPLATE"}
esc = lambda s: html.escape(s, quote=True)

BLOG_TITLES = {
 "ai-customer-support-india": "AI in Customer Support: What Works in India", "ai-reply-suggestions-support": "AI Reply Suggestions: Cut Support Response Time",
 "ai-summarise-email-threads": "AI Email Thread Summaries: Catch Up in 10 Seconds", "appointment-reminder-email-templates": "7 Appointment Reminder Email Templates",
 "auto-replies-customer-support": "Auto-Replies for Support That Don't Feel Robotic", "automate-ticket-routing": "Auto-Route Support Tickets to the Right Agent",
 "calendly-vs-resolvo": "Calendly vs Resolvo for Indian Businesses", "choosing-helpdesk-small-team": "Choosing a Helpdesk for a 2-5 Person Team",
 "client-history-tracking": "Why Tracking Client History Pays Off", "client-onboarding": "Client Onboarding Checklist for Service Businesses",
 "clients-prefer-online-booking": "Why Clients Prefer Online Booking", "customer-follow-up-system": "Build a Customer Follow-Up System That Works",
 "customer-support-email-templates": "20 Customer Support Email Templates for India", "daily-digest-automation": "Daily Digest Automation for Aligned Teams",
 "dentists-online-booking": "Online Booking for Dentists in India: Setup Guide", "engineering-issue-tracking-sla": "Engineering Issue Tracking with SLA: The Guide",
 "first-response-time": "First Response Time: Your Key Support Metric", "free-appointment-software-clinics-india": "Best Free Appointment Software for Indian Clinics",
 "free-crm-small-business-india": "Free CRM for Small Business in India", "gmail-vs-helpdesk": "Gmail vs Helpdesk Software: When to Switch",
 "handle-angry-customers-email": "Handle Angry Customers by Email (With Templates)", "how-to-set-up-email-ticketing": "Set Up Email Ticketing for Your Engineering Team",
 "intercom-vs-resolvo": "Intercom vs Resolvo for Indian Startups", "jira-free-tier-3-agents": "Jira Service Management Free Tier Caps at 3 Agents",
 "knowledge-base-setup": "Build a Knowledge Base That Cuts Support Tickets", "lawyers-automate-client-scheduling": "Automate Client Scheduling for Law Firms",
 "multi-brand-support-operations": "Run Support for Many Brands from One Dashboard", "notion-vs-resolvo-issue-tracking": "Notion vs Resolvo for Issue Tracking",
 "on-call-schedule-small-team": "On-Call Schedule for a Small Tech Team", "onboard-support-agent": "Onboard a New Support Agent: A 30-Day Plan",
 "online-booking-small-business-india": "Set Up Online Booking for Your Business in India", "patient-management-small-clinic": "Patient Management for Small Clinics",
 "post-mortem-template": "Post-Mortem Template for Engineering Teams", "priority-vs-severity-bugs": "Priority vs Severity in Bug Tracking Explained",
 "reduce-engineering-backlog": "Reduce Your Engineering Backlog Without Burnout", "segment-customers": "Segment Your Customers for Better Support",
 "sentiment-analysis-support": "Sentiment Analysis in Support: Catch Problems Early", "share-booking-link-social": "Where to Share Your Booking Link for More Bookings",
 "shared-inbox-vs-helpdesk": "Shared Inbox vs Helpdesk Software: Which to Pick", "sla-management-guide": "SLA in Customer Support: How to Set One Up",
 "sprint-planning-small-team": "Sprint Planning for Small Engineering Teams", "support-runbook": "How to Write a Support Runbook Your Team Uses",
 "tutors-manage-students": "How Tutors and Coaches Manage Students Better", "client-retention-support": "How Great Support Drives Client Retention", "measure-agent-performance": "How to Measure Support Agent Performance", "whats-new-october-2026": "What's New in Resolvo: Focus Mode and Insights",
 "whatsapp-pricing-compared": "WhatsApp Support Pricing: Freshdesk vs Zendesk", "write-good-bug-report": "How to Write a Good Bug Report (With Template)",
}
TITLES = {"blog-" + k: v + " | Resolvo" for k, v in BLOG_TITLES.items()}
TITLES.update({"vs-jira": "Resolvo vs Jira: Which Fits a Small Support Team? | Resolvo", "vs-zendesk": "Resolvo vs Zendesk: Cost and Fit for Small Teams | Resolvo", "vs-linear": "Resolvo vs Linear: Bugs Plus Customer Support | Resolvo", "partners": "Design Partners: 60 Days Free for 5 Small Teams | Resolvo", "blog-index": "Resolvo Blog: Support, Tickets and Operations", "seo-shared-inbox": "Shared Inbox for Customer Support | Resolvo", "seo-whatsapp-helpdesk": "WhatsApp Customer Support Software for India | Resolvo",
               "tool-support-calculator": "Support Team Calculator: Workload and Cost | Resolvo", "vs-freshdesk": "Resolvo vs Freshdesk: Support Plus Issue Tracking | Resolvo"})
DESCS = {"vs-jira": "Jira is built for large teams. See how Resolvo compares for small Indian support teams: setup, pricing and what you actually use.",
         "vs-zendesk": "Zendesk pricing and complexity suit large enterprises. See how Resolvo compares for small Indian teams: cost, setup and fit.",
         "vs-linear": "Linear tracks bugs; Resolvo tracks bugs and handles customer conversations too. Compare the two for small teams in India."}
SPECIAL_PATH = {"pro-signup": "/pro", "pitch": "/pitch", "blog-index": "/blog", "seo-shared-inbox": "/shared-inbox-for-small-teams", "seo-whatsapp-helpdesk": "/whatsapp-helpdesk-india", "seo-helpdesk-pricing": "/helpdesk-pricing-india",
                "tool-support-calculator": "/tools/support-calculator"}
def canon_path(stem):
    if stem in SPECIAL_PATH: return SPECIAL_PATH[stem]
    if stem.startswith("blog-"): return "/blog/" + stem[5:]
    if stem.startswith("vs-"): return "/vs/" + stem[3:]
    return "/" + stem
def og_image(stem): return "/img/og-blog.png" if stem.startswith("blog-") else "/img/og-compare.png" if stem.startswith("vs-") else "/img/og-resolvo.png"

def trim_desc(d):
    if len(d) <= 160: return d
    cut = d[:158]
    i = max(cut.rfind(". "), cut.rfind("? "), cut.rfind("! "))
    if i >= 90: return d[:i + 1]
    j = max(cut.rfind(" — "), cut.rfind(": "), cut.rfind(", "), cut.rfind("; "))
    if j >= 90: return d[:j].rstrip(" ,;:—") + "."
    k = cut[:155].rfind(" ")
    return d[:k].rstrip(" ,;:—") + "…"

MONTHS = {m: i + 1 for i, m in enumerate("January February March April May June July August September October November December".split())}
GA_RE = re.compile(r'<script async src="https://www\.googletagmanager\.com/gtag/js\?id=G-27BVPWPG8N"></script>\s*<script>.*?</script>', re.S)
STUB = '<script>window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){};</script>'
report = {"titles": [], "descs": [], "canon": [], "og": 0, "ga": 0, "ld": 0, "reveal": 0}

def meta_content(s, attr, name):
    m = re.search(r'<meta\s+%s="%s"\s+content="(.*?)"\s*/?>' % (attr, re.escape(name)), s, re.S | re.I)
    return m
def set_or_add_meta(s, attr, name, value, add_before="</head>"):
    m = meta_content(s, attr, name)
    tag = '<meta %s="%s" content="%s">' % (attr, name, esc(value))
    if m: return s[:m.start()] + tag + s[m.end():]
    return s.replace(add_before, tag + "\n" + add_before, 1)

def process(path):
    stem = os.path.basename(path)[:-5]
    if stem in NEW: return
    with open(path, encoding="utf-8", newline="") as f: s = f.read()
    o = s
    app_only = stem in APP_PAGES
    # 1. analytics behind the cookie choice
    if GA_RE.search(s):
        s = GA_RE.sub(STUB + '<script src="/js/site.js" defer' + (' data-banner="0"' if app_only else ' data-wa="1"') + '></script>', s, count=1); report["ga"] += 1
    if app_only:
        if s != o:
            with open(path, "w", encoding="utf-8", newline="") as f: f.write(s)
        return
    if "resolvo.app" in s:   # an older copy of these pages pointed at a domain that is not ours
        s = re.sub(r"https://resolvo\.app/blog/([\w-]+)", lambda m: SITE + "/blog/" + m.group(1), s)
        s = re.sub(r"https://resolvo\.app/og-[\w-]+\.png", SITE + og_image(stem), s)
        s = s.replace("https://resolvo.app/logo.png", SITE + "/icons/icon-192.png").replace("https://resolvo.app", SITE)
    if "/js/site.js" not in s and "</body>" in s:
        s = s.replace("</body>", STUB + '<script src="/js/site.js" defer data-wa="1"></script></body>', 1); report["ga"] += 1
    # 2. title
    tm = re.search(r"<title>(.*?)</title>", s, re.S)
    old_title = html.unescape(tm.group(1)).strip()
    new_title = TITLES.get(stem, old_title)
    if new_title != old_title:
        s = s[:tm.start()] + "<title>" + html.escape(new_title, quote=False) + "</title>" + s[tm.end():]
        report["titles"].append((stem, len(old_title), len(new_title)))
    elif len(old_title) > 62: report["titles"].append((stem, len(old_title), "STILL LONG"))
    # 3. description
    dm = meta_content(s, "name", "description")
    desc = html.unescape(dm.group(1)) if dm else ""
    new_desc = DESCS.get(stem) or (trim_desc(desc) if desc else desc)
    if desc and new_desc != desc:
        s = s[:dm.start()] + '<meta name="description" content="%s">' % esc(new_desc) + s[dm.end():]; report["descs"].append((stem, desc[-60:], new_desc[-60:]))
    # 4. canonical
    url = SITE + canon_path(stem)
    cm = re.search(r'<link\s+rel="canonical"\s+href="(.*?)"\s*/?>', s)
    tag = '<link rel="canonical" href="%s">' % url
    if cm:
        if cm.group(1) != url: report["canon"].append((stem, cm.group(1), url))
        s = s[:cm.start()] + tag + s[cm.end():]
    else:
        s = s.replace("</head>", tag + "\n</head>", 1); report["canon"].append((stem, "(none)", url))
    # 5. share tags
    final_title = html.unescape(re.search(r"<title>(.*?)</title>", s, re.S).group(1)).strip()
    final_desc = new_desc or final_title
    img = SITE + og_image(stem)
    had_img = bool(meta_content(s, "property", "og:image"))
    for attr, name, val in [("property", "og:type", "article" if stem.startswith("blog-") and stem != "blog-index" else "website"), ("property", "og:site_name", "Resolvo"), ("property", "og:url", url),
                            ("property", "og:title", final_title), ("property", "og:description", final_desc), ("property", "og:image", img), ("property", "og:image:width", "1200"), ("property", "og:image:height", "630"),
                            ("property", "og:image:alt", "Resolvo: customer support for Indian brands"), ("name", "twitter:card", "summary_large_image"), ("name", "twitter:title", final_title),
                            ("name", "twitter:description", final_desc), ("name", "twitter:image", img)]:
        if name in ("og:title", "og:description", "twitter:title", "twitter:description", "og:url") or not meta_content(s, attr, name) or (name == "og:image" and not had_img):
            s = set_or_add_meta(s, attr, name, val)
        elif name == "twitter:card":
            s = set_or_add_meta(s, attr, name, val)
    if not had_img: report["og"] += 1
    # 6. structured data
    if "application/ld+json" not in s and stem not in ("pitch",):
        ld = None
        if stem.startswith("blog-") and stem not in ("blog-index",):
            h1 = re.search(r"<h1[^>]*>(.*?)</h1>", s, re.S); h1 = html.unescape(re.sub(r"<[^>]+>", "", h1.group(1))).strip() if h1 else final_title
            dm2 = re.search(r"([A-Z][a-z]+) (20\d\d)", (re.search(r'class="article-meta"[^>]*>(.*?)<', s, re.S) or [0, ""])[1])
            date = "%s-%02d-01" % (dm2.group(2), MONTHS.get(dm2.group(1), 10)) if dm2 else None
            post = {"@context": "https://schema.org", "@type": "BlogPosting", "headline": h1[:110], "description": final_desc, "image": img, "author": {"@type": "Organization", "name": "Resolvo Team"},
                    "publisher": {"@type": "Organization", "name": "Resolvo", "logo": {"@type": "ImageObject", "url": SITE + "/icons/icon-192.png"}}, "mainEntityOfPage": {"@type": "WebPage", "@id": url}}
            if date: post["datePublished"] = date; post["dateModified"] = date
            crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [{"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/pitch"}, {"@type": "ListItem", "position": 2, "name": "Blog", "item": SITE + "/blog"}, {"@type": "ListItem", "position": 3, "name": h1[:110], "item": url}]}
            ld = [post, crumbs]
        if ld:
            s = s.replace("</head>", '<script type="application/ld+json">%s</script>\n</head>' % json.dumps(ld, ensure_ascii=False), 1); report["ld"] += 1
    # 7. noindex for the thin /pro page
    if stem == "pro-signup" and "noindex" not in s:
        s = s.replace("</head>", '<meta name="robots" content="noindex,follow">\n</head>', 1)
    # 8. fade-in sections stay readable if the script is slow or blocked
    if re.search(r"\.reveal\s*\{", s) and "rv-fadein" not in s:
        s = s.replace("</head>", '<style id="rv-fadein">html:not(.js) .reveal{opacity:1!important;transform:none!important}</style>\n<script>(function(){var d=document.documentElement;d.className+=" js";setTimeout(function(){if(!document.querySelector(".reveal.in"))d.className=d.className.replace(/\\bjs\\b/,"")},6000)})();</script>\n</head>', 1); report["reveal"] += 1
    # every public page ends with a link to the full list of pages, so nothing is hidden
    if "</footer>" in s and 'href="/site-map"' not in s:
        i = s.rfind("</footer>"); s = s[:i] + ' <a href="/site-map" class="rv-sitemap-link" style="margin-left:12px">Site map</a>' + s[i:]
    if s != o:
        with open(path, "w", encoding="utf-8", newline="") as f: f.write(s)

for p in sorted(glob.glob(os.path.join(PUB, "*.html"))): process(p)

# ------------------------------------------------------------------ home page
pp = os.path.join(PUB, "pitch.html")
with open(pp, encoding="utf-8", newline="") as f: s = f.read()
def sub1(old, new, must=True):
    global s
    NL = "(?:" + chr(13) + "?" + chr(10) + ")"   # the file mixes CRLF and LF line endings
    pat = re.compile(NL.join(re.escape(part) for part in old.split(chr(10))))
    if not pat.search(s):
        if must: raise SystemExit("pitch.html: text not found: " + old[:70])
        return
    s = pat.sub(lambda m: new, s, count=1)
if "rv-home-pass" not in s:
    # pricing story: one clear sentence, and no claim that every plan has every feature
    sub1("16 powerful features. One flat price.", "16 powerful features. Priced per brand, not per agent.")
    sub1("No add-ons. No per-seat pricing surprises. No feature gating. Everything your support team needs is in every plan.", "No add-ons and no per-seat surprises. Every new workspace starts with all of this free for 14 days. After that you keep the Free plan, or choose Pro or Enterprise to keep the rest.")
    sub1("Per brand, not per seat — add your whole team at the same price. No add-ons you didn't ask for.", "Per brand, not per seat — add your whole team at the same price. Every new workspace starts with a 14-day trial of everything, then moves to Free unless you choose Pro or Enterprise.")
    # the dashboard picture is an example
    sub1("app.resolvogroup.com/tickets", "Example data: app.resolvogroup.com/tickets", must=False)
    # Android banner without "beta"
    sub1("New · Android app (beta)", "New · Android app", must=False)
    sub1("New: Resolvo for Android (beta) —", "New: Resolvo for Android with fingerprint lock, dictation and widget —", must=False)
    # navigation: new pages
    sub1('<li><a href="#features">Features</a></li>', '<li><a href="/features">Features</a></li>\n      <li><a href="/integrations">Integrations</a></li>\n      <li><a href="/security">Security</a></li>')
    sub1('<a href="#features">Features</a>\n    <a href="/app">Mobile app</a>', '<a href="/features">Features</a>\n    <a href="/integrations">Integrations</a>\n    <a href="/security">Security</a>\n    <a href="/app">Mobile app</a>')
    sub1('<a href="/about">About</a>\n        <a href="/use-cases">Use Cases</a>', '<a href="/about">About</a>\n        <a href="/features">Features</a> <a href="/integrations">Integrations</a> <a href="/security">Security</a> <a href="/customers">Customers</a> <a href="/changelog">What\'s new</a>\n        <a href="/use-cases">Use Cases</a>')
    sub1('<a href="/contact">Contact</a>\n        <a href="/privacy">Privacy</a>', '<a href="/contact">Contact</a>\n        <a href="/partners">Design partners</a> <a href="/status">Status</a>\n        <a href="/privacy">Privacy</a> <a href="/terms">Terms</a>')
    # honest proof band before the FAQ
    band = ('<!-- rv-home-pass -->\n<section class="s-soft" id="customers"><div class="w"><div class="section-head center reveal"><div class="section-chip">Our first customers</div>'
            '<h2 class="section-h">New product. Honest about it.</h2><p class="section-sub">We are working with our first five brands as design partners, with 60 days of Pro free, a hands-on setup and a direct line to the founder. '
            'We do not show made-up logos or quotes. When a customer agrees to be quoted, their words will be here.</p></div>'
            '<div class="hero-ctas reveal" style="justify-content:center"><a href="/partners" class="btn-hero">Become a design partner <span class="arr">→</span></a><a href="/customers" class="btn-outline-hero">How we handle proof</a></div></div></section>\n')
    sub1("<!-- FAQ -->", band + "<!-- FAQ -->")
    # structured data: organisation, software with prices, FAQ taken from the visible questions
    faqs = [(html.unescape(re.sub(r"<[^>]+>", "", q)).replace("+", "").strip(), html.unescape(re.sub(r"<[^>]+>", "", a)).strip())
            for q, a in re.findall(r'<button class="faq-q">(.*?)</button>\s*<div class="faq-a"><div class="faq-a-inner">(.*?)</div></div>', s, re.S)]
    offers = [{"@type": "Offer", "name": n, "price": str(p), "priceCurrency": "INR", "url": SITE + "/pitch#pricing", "description": d} for n, p, d in
              [("Free", 0, "Per brand per month. Issue and ticket tracking for your team."), ("Pro", 999, "Per brand per month. Email inbox, queue assignment, AI reply drafts, analytics and more."), ("Enterprise", 2499, "Per brand per month. Customer portal, integrations and compliance tools.")]]
    ld = [{"@context": "https://schema.org", "@type": "Organization", "name": "Resolvo", "url": SITE + "/pitch", "logo": SITE + "/icons/icon-192.png", "email": "contact@resolvogroup.com"},
          {"@context": "https://schema.org", "@type": "WebSite", "name": "Resolvo", "url": SITE + "/pitch"},
          {"@context": "https://schema.org", "@type": "SoftwareApplication", "name": "Resolvo", "applicationCategory": "BusinessApplication", "operatingSystem": "Web, Android", "description": "Customer support platform for Indian brands: shared inbox, SLA tracking, AI reply drafts, WhatsApp and a phone app.", "offers": offers},
          {"@context": "https://schema.org", "@type": "FAQPage", "mainEntity": [{"@type": "Question", "name": q, "acceptedAnswer": {"@type": "Answer", "text": a}} for q, a in faqs]}]
    s = s.replace("</head>", '<script type="application/ld+json">%s</script>\n</head>' % json.dumps(ld, ensure_ascii=False), 1)
    report["faq_in_ld"] = len(faqs)
with open(pp, "w", encoding="utf-8", newline="") as f: f.write(s)

# ------------------------------------------------------------------ privacy page: bring it up to date
pv = os.path.join(PUB, "privacy.html")
with open(pv, encoding="utf-8", newline="") as f: s = f.read()
def pv_sub(old, new):
    global s
    if old in s: s = s.replace(old, new, 1)
    else: print("PRIVACY: not found ->", old[:70])
if True:   # each replacement only fires while its old sentence is still there
    pv_sub("Last updated: June 25, 2025", "Last updated: November 8, 2026 <!-- rv-privacy-2026 -->")
    pv_sub("provides appointment management and support ticketing services", "provides customer support (shared inbox, ticketing, WhatsApp and email) and appointment management services")
    pv_sub("<strong>Cookies:</strong> We use cookies and similar tracking technologies to maintain your session and improve the service.", "<strong>Cookies:</strong> We use cookies to keep you signed in. Google Analytics cookies are only set if you accept them in the cookie choice on our website, and you can change that choice at any time with the &ldquo;Cookie settings&rdquo; link at the bottom of a page.")
    pv_sub("<strong>Google Analytics</strong> — for website traffic analysis (anonymised)", "<strong>Google Analytics</strong> — website traffic analysis, only if you accept the cookie choice")
    pv_sub("<strong>Gmail / Google Workspace</strong> — for sending email notifications and confirmations</li>", "<strong>Gmail / Google Workspace and Google Calendar</strong> — email and appointments you connect</li><li><strong>Google Gemini</strong> — AI reply drafts, when that feature is on</li><li><strong>Twilio and Meta</strong> — WhatsApp and social messages you connect</li><li><strong>Shopify</strong> — reading orders (read-only), when you connect a store</li><li><strong>Slack</strong> — alerts you choose to send</li><li><strong>Contabo</strong> — server hosting in the European Union</li>")
    pv_sub("Appointment and ticket history may be retained for up to 90 days after account closure for legal and audit purposes.", "Appointment and ticket history may be retained for up to 90 days after account closure for legal and audit purposes. Copies in our nightly backups (kept for 14 days, then one a week for 8 weeks) age out within about 10 weeks. See our <a href=\"/security\">security page</a> for how backups work.")
    pv_sub("&copy; 2025 Resolvo", "&copy; 2026 Resolvo")
with open(pv, "w", encoding="utf-8", newline="") as f: f.write(s)

# ------------------------------------------------------------------ sitemap
sm = os.path.join(PUB, "sitemap.xml")
with open(sm, encoding="utf-8", newline="") as f: x = f.read()
seen, out = set(), []
for line in x.split("\n"):
    m = re.search(r"<loc>(.*?)</loc>", line)
    if m:
        loc = m.group(1)
        if loc in seen or loc.endswith("/pro"): continue
        seen.add(loc)
    out.append(line)
x = "\n".join(out)
add = "".join('  <url><loc>%s%s</loc><lastmod>2026-11-08</lastmod><changefreq>%s</changefreq><priority>%s</priority></url>\n' % (SITE, p, c, pr) for p, c, pr in
              [("/features", "monthly", "0.9"), ("/integrations", "monthly", "0.8"), ("/security", "monthly", "0.8"), ("/customers", "monthly", "0.6"), ("/changelog", "weekly", "0.6"), ("/shopify-customer-support-india", "monthly", "0.7"), ("/tools/whatsapp-templates", "monthly", "0.7"), ("/tools/sla-calculator", "monthly", "0.7"), ("/site-map", "monthly", "0.4")] if SITE + p not in seen)
x = x.replace("  <!-- Blog index -->", "  <!-- Product pages -->\n" + add + "\n  <!-- Blog index -->", 1)
with open(sm, "w", encoding="utf-8", newline="") as f: f.write(x)
report["sitemap_urls"] = len(re.findall(r"<url>", x))

print(json.dumps({k: (v if not isinstance(v, list) else len(v)) for k, v in report.items()}))
print("TITLES still long:", [t for t in report["titles"] if t[2] == "STILL LONG"])
for c in report["canon"]: print("canonical:", c)
for d in report["descs"]: print("desc:", d[0], "|", d[1], "=>", d[2])
