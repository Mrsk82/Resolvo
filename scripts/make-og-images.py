"""Makes the share pictures (1200x630) used when a Resolvo link is posted on WhatsApp, LinkedIn or X.
Run: python scripts/make-og-images.py   -> public/img/og-resolvo.png, og-blog.png, og-compare.png"""
import asyncio, base64, os
from playwright.async_api import async_playwright
ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
OUT = os.path.join(ROOT, "public", "img")
mark = base64.b64encode(open(os.path.join(ROOT, "public", "logo-mark.svg"), "rb").read()).decode()
CARDS = {
    "og-resolvo": ("Customer support for Indian brands", "Stop running support on <b>Gmail &amp; WhatsApp.</b>", "One shared inbox, SLA tracking, AI reply drafts and a phone app. One flat price per brand, not per agent."),
    "og-blog": ("The Resolvo blog", "Practical ideas for <b>small support teams.</b>", "Tickets, SLAs, WhatsApp, Shopify and running support without a big team."),
    "og-compare": ("Honest comparisons", "Resolvo, next to <b>the big helpdesks.</b>", "Freshdesk, Zendesk, Jira, Linear and SachDesk: what each costs and who each is for."),
}
def card(kicker, head, sub):
    return f"""<!doctype html><meta charset=utf-8><style>
*{{margin:0;box-sizing:border-box}}body{{width:1200px;height:630px;font-family:Inter,'Segoe UI',system-ui,sans-serif;color:#fff;background:linear-gradient(135deg,#0b1220 0%,#0b2a24 60%,#064e3b 100%);position:relative;overflow:hidden}}
.glow{{position:absolute;right:-160px;top:-160px;width:620px;height:620px;border-radius:50%;background:radial-gradient(circle,rgba(16,185,129,.38),transparent 65%)}}
.wrap{{position:absolute;inset:0;padding:64px 80px;display:flex;flex-direction:column}}
.brand{{display:flex;align-items:center;gap:16px;font-size:34px;font-weight:800;letter-spacing:-.02em}}.brand img{{width:56px;height:56px;border-radius:14px}}
.kick{{margin-top:auto;font-size:26px;font-weight:700;color:#6ee7b7;letter-spacing:.04em;text-transform:uppercase}}
h1{{font-size:78px;line-height:1.05;font-weight:800;letter-spacing:-.03em;margin-top:14px;max-width:1010px}}h1 b{{color:#34d399}}
p{{margin-top:22px;font-size:30px;line-height:1.4;color:#cbd5e1;max-width:960px}}
.url{{margin-top:34px;font-size:26px;font-weight:600;color:#94a3b8}}
</style><div class=glow></div><div class=wrap><div class=brand><img src="data:image/svg+xml;base64,{mark}">resolvo</div><div class=kick>{kicker}</div><h1>{head}</h1><p>{sub}</p><div class=url>app.resolvogroup.com</div></div>"""
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(channel="chrome"); pg = await b.new_page(viewport={"width": 1200, "height": 630})
        for name, (k, h, s) in CARDS.items():
            await pg.set_content(card(k, h, s)); await pg.wait_for_timeout(400)
            await pg.screenshot(path=os.path.join(OUT, name + ".png")); print("wrote", name + ".png")
        await b.close()
asyncio.run(main())
