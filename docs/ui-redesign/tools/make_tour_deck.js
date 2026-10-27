// Resolvo product tour deck (Oct 2026). Screenshots come from the fictional "Brightkart Support" workspace (public/img/app-*.jpg).
// Usage: node make_tour_deck.js   ->  docs/Resolvo-Product-Tour-Oct-2026.pptx
const path = require("path");
const pptxgen = require("pptxgenjs");
const { applyTheme } = require("C:\\Users\\Asif\\AppData\\Roaming\\Claude\\local-agent-mode-sessions\\skills-plugin\\dcf77443-e6f4-442b-aab3-f0b83d184b8d\\bb9c1724-1cd6-4afc-95d8-883c6ec15fa0\\skills\\pptx\\scripts\\apply_theme.js");

const IMG = f => path.join(__dirname, "..", "..", "..", "public", "img", f);
const OUT = path.join(__dirname, "..", "..", "Resolvo-Product-Tour-Oct-2026.pptx");
const THEME = { name: "Resolvo", headFontFace: "Calibri", bodyFontFace: "Calibri",
  colors: { dk1: "0A0F1E", lt1: "FFFFFF", dk2: "1E293B", lt2: "F4F6FA", accent1: "10B981", accent2: "6366F1", accent3: "F59E0B", accent4: "E5484D", accent5: "0EA5A4", accent6: "64748B", hlink: "059669", folHlink: "64748B" } };

const pres = new pptxgen();
pres.layout = "LAYOUT_WIDE";   // 13.33 x 7.5
pres.author = "Resolvo"; pres.title = "Resolvo product tour, October 2026"; pres.theme = { headFontFace: THEME.headFontFace, bodyFontFace: THEME.bodyFontFace };
const C = pres.SchemeColor, W = 13.33, H = 7.5, M = 0.7;

pres.defineSlideMaster({ title: "TOUR_DARK", background: { color: "0A0F1E" }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: M, y: 0.7, w: 5.6, h: 1.7, fontSize: 40, bold: true, color: C.background1, align: "left", valign: "top", margin: 0 }, text: "" } }],
  slideNumber: { x: W - 1.0, y: H - 0.5, w: 0.5, h: 0.3, fontSize: 10, color: "64748B", align: "right" } });
pres.defineSlideMaster({ title: "TOUR_LIGHT", background: { color: "F4F6FA" }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: M, y: 0.55, w: 5.6, h: 1.5, fontSize: 34, bold: true, color: C.text1, align: "left", valign: "top", margin: 0 }, text: "" } }],
  slideNumber: { x: W - 1.0, y: H - 0.5, w: 0.5, h: 0.3, fontSize: 10, color: "64748B", align: "right" } });
pres.defineSlideMaster({ title: "TOUR_LIGHT_WIDE", background: { color: "F4F6FA" }, objects: [
  { placeholder: { options: { name: "title", type: "title", x: M, y: 0.5, w: W - 2 * M, h: 0.9, fontSize: 36, bold: true, color: C.text1, align: "left", valign: "top", margin: 0 }, text: "" } }],
  slideNumber: { x: W - 1.0, y: H - 0.5, w: 0.5, h: 0.3, fontSize: 10, color: "64748B", align: "right" } });

const shadow = () => ({ type: "outer", color: "0A0F1E", opacity: 0.18, blur: 14, offset: 4, angle: 90 });
// a screenshot with a soft frame; the picture keeps its own proportions
function shot(s, file, x, y, w, ratio, name) {
  const h = w * ratio;
  s.addShape(pres.shapes.RECTANGLE, { x: x - 0.06, y: y - 0.06, w: w + 0.12, h: h + 0.12, fill: { color: C.background1 }, line: { color: "E2E8F0", width: 0.75 }, shadow: shadow(), objectName: name + " frame" });
  s.addImage({ path: IMG(file), x, y, w, h, altText: name, objectName: name });
  return h;
}
// a short list with real bullets
function bullets(s, items, x, y, w, color, size) {
  s.addText(items.map((t, i) => ({ text: t, options: { bullet: { indent: 18 }, breakLine: i < items.length - 1, paraSpaceAfter: 12 } })),
    { x, y, w, h: items.length * 0.78, fontSize: size || 16, color, valign: "top", margin: 0, isTextBox: true, objectName: "Bullets" });
}
function kicker(s, text, x, y, dark) { s.addText(text.toUpperCase(), { x, y, w: 5.5, h: 0.3, fontSize: 12, bold: true, charSpacing: 3, color: dark ? "34D399" : "059669", margin: 0, isTextBox: true, objectName: "Kicker" }); }

// 1. title
pres.addSection({ title: "Intro" });
{ const s = pres.addSlide({ masterName: "TOUR_DARK", sectionTitle: "Intro" });
  kicker(s, "Product tour · October 2026", M, 0.45, true);
  s.addText("Support that stays calm", { placeholder: "title" });
  s.addText("One shared inbox for email, WhatsApp and your website. See what needs you, answer it, move on.", { x: M, y: 2.7, w: 5.3, h: 1.4, fontSize: 18, color: "CBD5E1", valign: "top", margin: 0, isTextBox: true, objectName: "Subtitle" });
  s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: M, y: 4.7, w: 3.4, h: 0.62, fill: { color: C.accent1 }, rectRadius: 0.12, objectName: "Button" });
  s.addText("Try the live demo", { x: M, y: 4.7, w: 3.4, h: 0.62, fontSize: 16, bold: true, color: C.text1, align: "center", valign: "middle", margin: 0, isTextBox: true, hyperlink: { url: "https://app.resolvogroup.com/demo" }, objectName: "Button label" });
  s.addText("app.resolvogroup.com/demo", { x: M, y: 5.5, w: 4, h: 0.3, fontSize: 12, color: "94A3B8", margin: 0, isTextBox: true, objectName: "Demo address" });
  shot(s, "app-focus-reading.jpg", 6.6, 1.15, 6.0, 900 / 1440, "Focus mode screenshot");
  s.addNotes("Open with the problem in one sentence: small teams answer customers from three places and lose track. This tour is four minutes. Everything shown comes from a made-up store called Brightkart.");
}

// 2. problem
pres.addSection({ title: "What it fixes" });
{ const s = pres.addSlide({ masterName: "TOUR_LIGHT_WIDE", sectionTitle: "What it fixes" });
  s.addText("Small support teams drown in noise", { placeholder: "title" });
  const cards = [["Messages everywhere", "Email, WhatsApp and web chat in three places. Two people answer one customer, or nobody does.", C.accent2], ["Noise in the queue", "Newsletters and system alerts become tickets, so the counts stop meaning anything.", C.accent3], ["No clear next step", "Everything looks equally urgent. Tickets near their target time hide among the rest.", C.accent4]];
  cards.forEach((c, i) => { const x = M + i * 4.1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.9, w: 3.8, h: 4.2, fill: { color: C.background1 }, rectRadius: 0.15, shadow: shadow(), objectName: `Card ${i + 1}` });
    s.addShape(pres.shapes.OVAL, { x: x + 0.35, y: 2.25, w: 0.8, h: 0.8, fill: { color: c[2], transparency: 85 }, objectName: `Number badge ${i + 1}` });
    s.addText(String(i + 1), { x: x + 0.35, y: 2.25, w: 0.8, h: 0.8, fontSize: 24, bold: true, color: c[2], align: "center", valign: "middle", margin: 0, isTextBox: true, objectName: `Number ${i + 1}` });
    s.addText(c[0], { x: x + 0.35, y: 3.3, w: 3.1, h: 0.5, fontSize: 22, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `Card title ${i + 1}` });
    s.addText(c[1], { x: x + 0.35, y: 3.9, w: 3.1, h: 1.9, fontSize: 15, color: "475569", valign: "top", margin: 0, isTextBox: true, objectName: `Card text ${i + 1}` });
  });
  s.addNotes("These are the three things we hear from founders and small teams. The rest of the deck shows how each is handled.");
}

// 3-6 what's new
pres.addSection({ title: "How it works" });
{ const s = pres.addSlide({ masterName: "TOUR_LIGHT", sectionTitle: "How it works" });
  kicker(s, "Today", M, 0.3);
  s.addText("Start with what needs you", { placeholder: "title" });
  bullets(s, ["A short list of the tickets waiting on you, closest to their target time first", "One click opens the ticket; one more starts Focus mode", "Numbers match the inbox exactly, with newsletters and alerts left out"], M, 2.5, 5.2, "334155");
  shot(s, "app-today.jpg", 6.6, 1.05, 6.0, 900 / 1440, "Today dashboard screenshot");
  s.addNotes("Click Needs you now to show the list. The count at the top equals the inbox count, which is deliberate."); }
{ const s = pres.addSlide({ masterName: "TOUR_DARK", sectionTitle: "How it works" });
  kicker(s, "Focus mode", M, 0.3, true);
  s.addText("One ticket at a time", { placeholder: "title" });
  bullets(s, ["One calm queue, one conversation at full width", "Send & resolve, then next: it only moves on after the reply really sent", "J and K to move, R to reply, E to resolve, Esc to go back"], M, 2.5, 5.2, "E2E8F0");
  shot(s, "app-focus-queue.jpg", 6.6, 1.05, 6.0, 900 / 1440, "Focus mode queue screenshot");
  s.addNotes("This is the default on phones. If a send fails, the text stays and nothing is resolved."); }
{ const s = pres.addSlide({ masterName: "TOUR_LIGHT", sectionTitle: "How it works" });
  kicker(s, "A clean inbox", M, 0.3);
  s.addText("Newsletters and alerts stay out of your queue", { placeholder: "title" });
  bullets(s, ["Spotted automatically and kept in their own view", "Close them all in one click, or close and block the senders", "A real customer caught by mistake moves back for good"], M, 2.75, 5.2, "334155");
  shot(s, "app-promotions.jpg", 6.6, 1.05, 6.0, 900 / 1440, "Promotions and alerts screenshot");
  s.addNotes("Nothing is deleted and nobody is emailed when you close them."); }
{ const s = pres.addSlide({ masterName: "TOUR_DARK", sectionTitle: "How it works" });
  kicker(s, "Insights", M, 0.3, true);
  s.addText("Answers, not just charts", { placeholder: "title" });
  bullets(s, ["Plain answers: are we answering fast enough, who needs help", "Overview with compare-to-previous, and a team scorecard", "Reports and customer health under the same tab bar"], M, 2.5, 5.2, "E2E8F0");
  shot(s, "app-insights-questions.jpg", 6.6, 1.05, 6.0, 900 / 1440, "Insights questions screenshot");
  s.addNotes("The sentences are generated from the numbers, so they are always current."); }

// 7. customers + settings
{ const s = pres.addSlide({ masterName: "TOUR_LIGHT_WIDE", sectionTitle: "How it works" });
  s.addText("Know your customers, know your setup", { placeholder: "title" });
  const colW = 5.7;
  shot(s, "app-customers.jpg", M, 1.75, colW, 900 / 1440, "Customers screenshot");
  shot(s, "app-settings.jpg", M + colW + 0.5, 1.75, colW, 900 / 1440, "Settings screenshot");
  s.addText("Customers: health badges, last contact, and one-click merging of the same person on email and WhatsApp", { x: M, y: 5.5, w: colW, h: 1.1, fontSize: 15, color: "334155", valign: "top", margin: 0, isTextBox: true, objectName: "Customers caption" });
  s.addText("Settings: what is on, off or needs attention, with search and a side list inside every section", { x: M + colW + 0.5, y: 5.5, w: colW, h: 1.1, fontSize: 15, color: "334155", valign: "top", margin: 0, isTextBox: true, objectName: "Settings caption" });
  s.addNotes("Merging keeps every address, ticket and deal. Settings opens on a list of what needs attention, such as email not connected."); }

// 8. phone
{ const s = pres.addSlide({ masterName: "TOUR_DARK", sectionTitle: "How it works" });
  kicker(s, "On your phone", M, 0.3, true);
  s.addText("Runs in your pocket", { placeholder: "title" });
  bullets(s, ["Install it from the browser. No app store", "Alerts when a ticket is yours, or close to or past its target time", "Swipe right to take a ticket, left to snooze it until tomorrow"], M, 2.5, 5.2, "E2E8F0");
  const pw = 2.55, ph = pw * 1688 / 780;
  [["app-phone-queue.jpg", 7.1], ["app-phone-reading.jpg", 10.0]].forEach((p, i) => {
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x: p[1] - 0.08, y: 0.55 - 0.08, w: pw + 0.16, h: ph + 0.16, fill: { color: "1E293B" }, rectRadius: 0.2, objectName: `Phone frame ${i + 1}` });
    s.addImage({ path: IMG(p[0]), x: p[1], y: 0.55, w: pw, h: ph, altText: i ? "Conversation on a phone" : "Queue on a phone", objectName: `Phone screenshot ${i + 1}` });
  });
  s.addNotes("On iPhone, add it to the Home Screen first; alerts need the installed app."); }

// 9. pricing
pres.addSection({ title: "Plans" });
{ const s = pres.addSlide({ masterName: "TOUR_LIGHT_WIDE", sectionTitle: "Plans" });
  s.addText("One price per brand, not per seat", { placeholder: "title" });
  const tiers = [["Free", "₹0", "per brand / month", ["Issue and ticket tracking", "Search, watchers, audit trail", "1 brand, no per-seat fees"], C.accent6], ["Pro", "₹999", "per brand / month", ["Email ticketing inbox", "AI reply drafts and triage", "Insights, SLA and workload", "Knowledge base, Kanban, sprints"], C.accent1], ["Enterprise", "₹2,499", "per brand / month", ["Everything in Pro", "Customer portal and booking", "Jira / ServiceNow sync, API keys", "GDPR data tools"], C.accent2]];
  tiers.forEach((t, i) => { const x = M + i * 4.1, pop = i === 1;
    s.addShape(pres.shapes.ROUNDED_RECTANGLE, { x, y: 1.75, w: 3.8, h: 4.75, fill: { color: C.background1 }, line: { color: pop ? t[4] : "E2E8F0", width: pop ? 2.25 : 0.75 }, rectRadius: 0.15, shadow: shadow(), objectName: `${t[0]} card` });
    s.addText(t[0], { x: x + 0.35, y: 2.0, w: 3.1, h: 0.45, fontSize: 20, bold: true, color: t[4], margin: 0, isTextBox: true, objectName: `${t[0]} name` });
    s.addText(t[1], { x: x + 0.35, y: 2.55, w: 3.1, h: 0.85, fontSize: 44, bold: true, color: C.text1, margin: 0, isTextBox: true, objectName: `${t[0]} price` });
    s.addText(t[2], { x: x + 0.35, y: 3.4, w: 3.1, h: 0.3, fontSize: 12, color: "64748B", margin: 0, isTextBox: true, objectName: `${t[0]} period` });
    s.addText(t[3].map((f, j) => ({ text: f, options: { bullet: { indent: 16 }, breakLine: j < t[3].length - 1, paraSpaceAfter: 8 } })), { x: x + 0.35, y: 3.95, w: 3.15, h: 2.4, fontSize: 14, color: "334155", valign: "top", margin: 0, isTextBox: true, objectName: `${t[0]} features` });
  });
  s.addText("14-day free trial on Pro. No credit card. Prices in INR.", { x: M, y: 6.7, w: 9, h: 0.3, fontSize: 13, color: "475569", margin: 0, isTextBox: true, objectName: "Trial note" });
  s.addNotes("Pricing is per brand, so adding agents costs nothing extra. Always check the pricing page for the latest."); }

// 10. close
{ const s = pres.addSlide({ masterName: "TOUR_DARK", sectionTitle: "Plans" });
  s.addText("Try it on your own inbox", { placeholder: "title" });
  s.addText("14 days free. Connect your support email and be live in an afternoon. Tell us what is missing; we are building with our first teams.", { x: M, y: 2.5, w: 5.5, h: 1.6, fontSize: 18, color: "CBD5E1", valign: "top", margin: 0, isTextBox: true, objectName: "Closing text" });
  const links = [["Live demo", "app.resolvogroup.com/demo", "https://app.resolvogroup.com/demo"], ["Start free", "app.resolvogroup.com/signup", "https://app.resolvogroup.com/signup"], ["Talk to us", "contact@resolvogroup.com", "mailto:contact@resolvogroup.com"]];
  links.forEach((l, i) => { const y = 4.3 + i * 0.85;
    s.addShape(pres.shapes.OVAL, { x: M, y, w: 0.55, h: 0.55, fill: { color: C.accent1, transparency: 80 }, objectName: `Link dot ${i + 1}` });
    s.addText(l[0], { x: M + 0.8, y: y - 0.02, w: 4.5, h: 0.3, fontSize: 12, bold: true, color: "34D399", margin: 0, isTextBox: true, objectName: `Link label ${i + 1}` });
    s.addText(l[1], { x: M + 0.8, y: y + 0.25, w: 4.8, h: 0.35, fontSize: 16, color: C.background1, margin: 0, isTextBox: true, hyperlink: { url: l[2] }, objectName: `Link ${i + 1}` });
  });
  shot(s, "app-inbox.jpg", 6.8, 1.55, 5.8, 900 / 1440, "Inbox screenshot");
  s.addNotes("End on the demo. It needs no signup and uses made-up data."); }

(async () => { await pres.writeFile({ fileName: OUT }); await applyTheme(OUT, THEME); console.log("wrote", OUT); })();
