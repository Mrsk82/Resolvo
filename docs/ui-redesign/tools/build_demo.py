"""Rebuilds public/demo.html from demo_src/ (shared styles and example-data helpers, plus demo_app.js).
Usage: python build_demo.py   (then python demo_test.py against the local server to check it)"""
import os
HERE = os.path.join(os.path.dirname(os.path.abspath(__file__)), "demo_src")
OUT = os.path.join(HERE, "..", "..", "..", "..", "public", "demo.html")
rd = lambda n: open(os.path.join(HERE, n), encoding="utf-8").read()
common, common2, js2, app = rd("common.css"), rd("common2.css"), rd("common2.js"), rd("demo_app.js")
# the inbox reading state is part of the render
app = app.replace("<div class=\"inb ${D.inbox.cust ? 'cust' : ''}\">", "<div class=\"inb ${D.inbox.cust ? 'cust' : ''} ${selT ? 'reading' : ''}\">")
app = app.replace("draw(); $('.inb').classList.add('reading'); return; }", "draw(); return; }")

css = """
html,body{height:auto} body{overflow:auto}
#demo-bar{position:sticky;top:0;z-index:60;background:linear-gradient(90deg,#059669,#10B981 50%,#059669);color:#fff;padding:9px 18px;display:flex;align-items:center;justify-content:space-between;gap:12px;font-size:13px;font-weight:600;flex-wrap:wrap}
#demo-bar a{color:#fff;background:rgba(0,0,0,.25);border-radius:7px;padding:5px 14px;text-decoration:none;font-weight:700;font-size:12.5px;white-space:nowrap}
.app{display:grid;grid-template-columns:232px minmax(0,1fr);min-height:calc(100vh - 40px)}
.side{background:var(--surface);border-right:1px solid var(--border);padding:14px 10px;display:flex;flex-direction:column;gap:4px;position:sticky;top:40px;height:calc(100vh - 40px)}
.side .brand{padding:6px 8px 14px;font-size:18px}
.nv{display:flex;align-items:center;gap:10px;width:100%;border:0;background:none;border-radius:var(--r);padding:10px 12px;text-align:left;color:var(--text2);font-weight:500}
.nv:hover{background:var(--hover)} .nv[aria-current=true]{background:var(--selected);color:var(--accent-strong);font-weight:700} .nv b{font-weight:inherit;flex:1} .nv em{font-style:normal;font-size:11px;font-weight:800;background:var(--danger);color:#fff;border-radius:99px;padding:0 7px}
.who{margin-top:auto;padding:10px;border:1px solid var(--border);border-radius:var(--rl);display:flex;gap:10px;align-items:center;font-size:12px}
.mainc{min-width:0;display:flex;flex-direction:column}
.tb{display:flex;align-items:center;gap:10px;padding:10px 20px;background:var(--surface);border-bottom:1px solid var(--border);position:sticky;top:40px;z-index:30}
#main{padding:20px;max-width:1240px;width:100%;margin:0 auto}
#tip{margin:0 20px;margin-top:12px;display:flex;gap:10px;align-items:center;background:var(--accent-soft);border-radius:var(--r);padding:8px 8px 8px 14px;font-size:13px;color:var(--text2)} #tip b{color:var(--accent-strong)} #tip .btn{margin-left:auto}
.dtoast{position:fixed;top:56px;right:16px;background:var(--text);color:var(--surface);padding:10px 16px;border-radius:10px;box-shadow:var(--shadow3);z-index:90;font-weight:600;font-size:13px;max-width:min(380px,90vw)}
.nowl .now{display:flex;align-items:center;gap:12px;width:100%;text-align:left;border:0;border-top:1px solid var(--soft);background:none;padding:12px 16px}
.now:hover{background:var(--hover)} .now .m{flex:1;min-width:0;display:flex;flex-direction:column} .now .m span{color:var(--muted);font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis} .now em{font-style:normal;font-size:12px;color:var(--faint);min-width:50px;text-align:right}
.attn2{margin-top:12px;background:var(--warning-soft);border-radius:var(--r);padding:10px 14px;font-size:14px}
.inb{display:grid;grid-template-columns:370px minmax(0,1fr);height:calc(100vh - 150px);min-height:520px;background:var(--surface);border:1px solid var(--border);border-radius:var(--rl);overflow:hidden;box-shadow:var(--shadow);position:relative}
.inb.cust{grid-template-columns:370px minmax(0,1fr) 270px}
.il{display:flex;flex-direction:column;border-right:1px solid var(--border);min-height:0} .ilh{display:flex;align-items:center;gap:8px;padding:12px}
.il .tabs{padding:0 10px 8px;border-bottom:1px solid var(--border)} .irows{overflow:auto;flex:1}
.row-i{display:grid;grid-template-columns:36px 1fr auto;gap:10px;width:100%;text-align:left;border:0;border-bottom:1px solid var(--soft);background:none;padding:12px;align-items:start;position:relative}
.row-i:hover{background:var(--hover)} .row-i.sel{background:var(--selected)} .row-i.sel::before{content:"";position:absolute;left:0;top:0;bottom:0;width:4px;background:var(--accent)}
.row-i .nm{display:flex;gap:6px;align-items:center} .row-i.un .nm b,.row-i.un .sj{font-weight:800} .sj{font-size:13px} .pv{font-size:13px;color:var(--muted)} .tg{display:flex;gap:4px;flex-wrap:wrap;margin-top:6px;align-items:center}
.chip2{font-size:11px;color:var(--muted);background:var(--surface2);border:1px solid var(--soft);border-radius:99px;padding:0 8px;line-height:18px;flex:none}
.own{display:inline-flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)} .own.none{color:var(--danger);font-weight:700}
.promo{display:flex;flex-direction:column;gap:6px;margin:10px;padding:10px 12px;background:var(--warning-soft);border-radius:var(--r);font-size:13px}
.ic{display:flex;flex-direction:column;min-width:0;min-height:0} .ic>.empty{flex:1} .ic>*{flex:none} .ic>.thread{flex:1 1 auto}
.icu{border-left:1px solid var(--border);background:var(--surface2);padding:14px;overflow:auto}
.ic .ch-head{padding:12px 16px;border-bottom:1px solid var(--border);display:flex;gap:10px;align-items:center} .ch-head h2{margin:0;font-size:17px} .back{display:none}
.cbar{display:flex;gap:8px;flex-wrap:wrap;align-items:center;padding:8px 16px;background:var(--surface2);border-bottom:1px solid var(--border)}
select{height:32px;border:1px solid var(--border);border-radius:var(--r);background:var(--surface);color:var(--text);padding:0 8px;font:inherit;font-weight:600;font-size:13px}
.nudge{padding:8px 16px;background:var(--warning-soft);font-size:13px}
.thread{flex:1;overflow:auto;padding:16px;display:flex;flex-direction:column;gap:14px;min-height:120px}
.comp{border-top:1px solid var(--border);padding:12px 16px;display:flex;flex-direction:column;gap:8px;position:relative}
.slash{position:absolute;left:16px;right:16px;bottom:calc(100% - 52px);background:var(--surface);border:1px solid var(--border);border-radius:var(--r);box-shadow:var(--shadow3);padding:4px;z-index:5}
.slash button{display:flex;flex-direction:column;gap:1px;width:100%;text-align:left;border:0;background:none;padding:8px 10px;border-radius:8px} .slash button:hover{background:var(--selected)} .slash span{font-size:12px;color:var(--muted)}
.kpi{display:grid;grid-template-columns:repeat(3,1fr);gap:8px} .kpi div{background:var(--surface);border:1px solid var(--border);border-radius:var(--r);padding:8px;text-align:center} .kpi b{display:block;font-size:17px}
.fwrap{max-width:820px;margin:0 auto}
.fstats{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:16px 0}
.stat{display:flex;flex-direction:column;gap:2px;text-align:left;padding:12px 16px;border-radius:var(--rl);background:var(--surface);border:1px solid var(--border);font-size:13px} .stat b{font-size:24px;letter-spacing:-.03em} .stat.hot b{color:var(--danger)} .stat[aria-pressed=true]{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)}
.fq{display:flex;flex-direction:column;gap:8px;margin-top:12px}
.fitem{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:12px;align-items:center;width:100%;text-align:left;padding:12px 16px;border-radius:var(--rl);background:var(--surface);border:1px solid var(--border)}
.fitem:hover,.fitem.foc{border-color:var(--accent);box-shadow:0 0 0 3px var(--accent-soft)} .fitem .rt{display:flex;flex-direction:column;align-items:flex-end;gap:6px} .fitem .nm{display:flex;gap:6px;align-items:center}
.rhead{display:flex;align-items:center;gap:10px;margin-bottom:12px}
.qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,380px),1fr));gap:14px} .q{padding:18px;display:flex;flex-direction:column;gap:10px} .q .a{font-size:18px;font-weight:700;letter-spacing:-.02em;line-height:1.35;margin:0} .q .a em{font-style:normal;color:var(--accent-strong)} .q .a em.bad{color:var(--danger)}
.alerts{display:grid;grid-template-columns:repeat(auto-fit,minmax(250px,1fr));gap:10px} .al{display:flex;gap:10px;padding:12px 14px;border-radius:var(--rl)} .al.w{background:var(--warning-soft)} .al.d{background:var(--danger-soft)} .al.g{background:var(--success-soft)} .al b{display:block} .al span:last-child{font-size:12px;color:var(--text2)}
th.s{cursor:pointer;user-select:none} th.s[aria-sort]::after{content:" ▾";color:var(--accent-strong)} th.s[aria-sort=ascending]::after{content:" ▴"}
.load{display:flex;align-items:center;gap:8px;min-width:130px} .bar2{flex:1;height:8px;border-radius:99px;background:var(--surface2);overflow:hidden} .bar2>i{display:block;height:100%;border-radius:99px}
.banner{display:flex;align-items:center;gap:12px;background:var(--info-soft);border-radius:var(--r);padding:10px 14px} .banner span{flex:1}
.hb{display:inline-block;font-size:10px;font-weight:800;padding:1px 7px;border-radius:99px;margin-left:6px;vertical-align:1px;background:var(--surface2);color:var(--muted)} .hb-vip{background:var(--warning-soft);color:var(--warning)} .hb-risk{background:var(--danger-soft);color:var(--danger)} .hb-happy{background:var(--success-soft);color:var(--success)} .hb-active{background:var(--info-soft);color:var(--info)}
.hub{display:grid;grid-template-columns:repeat(auto-fill,minmax(min(100%,300px),1fr));gap:14px;margin-top:16px} .gcard{padding:16px} .gcard h3{margin:0 0 2px;font-size:16px}
.glink{display:flex;justify-content:space-between;align-items:center;gap:8px;border:0;background:none;text-align:left;padding:7px 8px;margin:0 -8px;border-radius:8px;color:var(--text2);font-weight:500;width:calc(100% + 16px)} .glink:hover{background:var(--hover)} .glink small{color:var(--muted);font-weight:400;white-space:nowrap}
.attn{display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px;margin-top:8px} .acard{display:flex;gap:10px;align-items:center;padding:12px 14px;border-radius:var(--rl);background:var(--warning-soft);text-align:left;width:100%;border:1px solid transparent} .acard:hover{border-color:var(--warning)} .acard b{display:block} .acard span:last-child{font-size:12px;color:var(--text2)}
#modal{position:fixed;inset:0;background:rgba(15,23,42,.45);display:none;align-items:center;justify-content:center;z-index:100;padding:16px} #modal.on{display:flex} .mcard{background:var(--surface);border-radius:var(--rl);padding:20px;max-width:460px;width:100%;box-shadow:var(--shadow3)}
@media (max-width:1000px){.inb{grid-template-columns:330px minmax(0,1fr)} .inb.cust{grid-template-columns:330px minmax(0,1fr)} .icu{position:absolute;right:0;top:0;bottom:0;width:min(300px,92%);box-shadow:var(--shadow3);z-index:5}}
@media (max-width:860px){.app{grid-template-columns:1fr} .side{position:fixed;top:auto;bottom:0;left:0;right:0;height:auto;flex-direction:row;justify-content:space-around;padding:6px;z-index:70;border-right:0;border-top:1px solid var(--border)} .side .brand,.who{display:none} .nv{flex-direction:column;gap:2px;padding:6px 8px;font-size:11px;position:relative;width:auto} .nv em{position:absolute;top:2px;right:6px} #main{padding:14px 12px 90px} .tb{top:40px;padding:8px 12px} .fstats{gap:8px}}
@media (max-width:720px){.inb,.inb.cust{grid-template-columns:minmax(0,1fr);height:auto;min-height:0} .inb .ic{display:none} .inb.reading .il{display:none} .inb.reading .ic{display:flex} .inb.reading .icu{display:none} .back{display:inline-flex} .inb .il{min-height:60vh} .thread{max-height:none}}
"""

head = """<!DOCTYPE html>
<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Live Demo — Resolvo</title>
<meta name="description" content="Try Resolvo in your browser: Focus mode, a clean inbox, Insights, customers and settings. No signup, made-up data.">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="icon" type="image/svg+xml" href="/favicon.svg">
<script async src="https://www.googletagmanager.com/gtag/js?id=G-27BVPWPG8N"></script>
<script>window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments);}gtag('js',new Date());gtag('config','G-27BVPWPG8N');</script>
<style>
"""
body = """
</style></head>
<body>
<div id="demo-bar"><span>● Interactive demo: click around, nothing is saved, the data is made up</span><span style="display:flex;gap:8px;align-items:center"><button class="btn sm" id="reset" style="background:rgba(0,0,0,.25);border-color:transparent;color:#fff">Reset demo</button><a href="/signup">Start your 14-day free trial →</a></span></div>
<div class="app">
  <aside class="side"><div class="brand"><b></b>Brightkart Support</div><nav id="nav" style="display:contents" aria-label="Main"></nav><div class="who"><span class="av sm">R</span><span><b>Rahul Mehta</b><br><span class="muted">Admin · Support lead</span></span></div></aside>
  <div class="mainc"><div class="tb"><label class="search" style="max-width:380px"><span>⌕</span><input placeholder="Search tickets, customers…" aria-label="Search" disabled></label><span style="flex:1"></span><button class="btn ghost theme" id="theme" aria-label="Toggle dark mode">◐</button></div><div id="tip"></div><main id="main"></main></div>
</div>
<div id="modal" role="dialog" aria-modal="true"></div>
<script>
"""
out = head + common + "\n" + common2 + css + body + js2 + "\n" + app + "\n</script>\n</body></html>\n"
open(OUT, "w", encoding="utf-8").write(out)
print("demo.html written,", len(out), "bytes")
