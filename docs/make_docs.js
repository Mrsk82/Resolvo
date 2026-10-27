const {
  Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
  Header, Footer, AlignmentType, HeadingLevel, BorderStyle, WidthType,
  ShadingType, PageNumber, PageBreak, LevelFormat
} = require('docx');
const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname);
const ACCENT = "1E3A5F";
const ACCENT2 = "F59E0B";
const LIGHT = "EFF4FB";
const DATE = "June 2026";

const border = { style: BorderStyle.SINGLE, size: 1, color: "CCCCCC" };
const borders = { top: border, bottom: border, left: border, right: border };
const hdrBorder = { style: BorderStyle.SINGLE, size: 1, color: ACCENT };
const hdrBorders = { top: hdrBorder, bottom: hdrBorder, left: hdrBorder, right: hdrBorder };

function pageProps() {
  return {
    page: {
      size: { width: 12240, height: 15840 },
      margin: { top: 1080, right: 1080, bottom: 1080, left: 1260 }
    }
  };
}

function docStyles() {
  return {
    default: { document: { run: { font: "Arial", size: 22 } } },
    paragraphStyles: [
      { id: "Heading1", name: "Heading 1", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 36, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 360, after: 180 }, outlineLevel: 0,
          border: { bottom: { style: BorderStyle.SINGLE, size: 4, color: ACCENT, space: 4 } } } },
      { id: "Heading2", name: "Heading 2", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 28, bold: true, font: "Arial", color: ACCENT },
        paragraph: { spacing: { before: 300, after: 120 }, outlineLevel: 1 } },
      { id: "Heading3", name: "Heading 3", basedOn: "Normal", next: "Normal", quickFormat: true,
        run: { size: 24, bold: true, font: "Arial", color: "374151" },
        paragraph: { spacing: { before: 200, after: 80 }, outlineLevel: 2 } },
    ]
  };
}

function numbering() {
  return {
    config: [
      { reference: "bullets", levels: [
        { level: 0, format: LevelFormat.BULLET, text: "•", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 60 } } } },
        { level: 1, format: LevelFormat.BULLET, text: "◦", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 1080, hanging: 360 }, spacing: { after: 40 } } } },
      ]},
      { reference: "numbers", levels: [
        { level: 0, format: LevelFormat.DECIMAL, text: "%1.", alignment: AlignmentType.LEFT,
          style: { paragraph: { indent: { left: 720, hanging: 360 }, spacing: { after: 60 } } } },
      ]},
    ]
  };
}

function hdr(text) {
  return new Header({ children: [new Paragraph({
    children: [
      new TextRun({ text: "RESOLVO", bold: true, color: ACCENT, font: "Arial", size: 18 }),
      new TextRun({ text: "  |  " + text, color: "6B7280", font: "Arial", size: 18 }),
      new TextRun({ text: "\t" + DATE, color: "9CA3AF", font: "Arial", size: 16 }),
    ],
    tabStops: [{ type: "right", position: 9000 }],
    border: { bottom: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB", space: 4 } },
  })] });
}

function ftr() {
  return new Footer({ children: [new Paragraph({
    children: [
      new TextRun({ text: "Confidential — Resolvo Group  |  app.resolvogroup.com", color: "9CA3AF", font: "Arial", size: 16 }),
      new TextRun({ text: "\tPage ", color: "9CA3AF", font: "Arial", size: 16 }),
      new TextRun({ children: [PageNumber.CURRENT], color: "9CA3AF", font: "Arial", size: 16 }),
    ],
    tabStops: [{ type: "right", position: 9000 }],
    border: { top: { style: BorderStyle.SINGLE, size: 2, color: "E5E7EB", space: 4 } },
  })] });
}

function titlePage(title, subtitle, docType) {
  return [
    new Paragraph({ spacing: { before: 1440, after: 0 }, children: [
      new TextRun({ text: "RESOLVO", bold: true, font: "Arial", size: 64, color: ACCENT }),
    ]}),
    new Paragraph({ spacing: { before: 120, after: 480 }, children: [
      new TextRun({ text: "Customer Support & Operations Platform", font: "Arial", size: 26, color: "6B7280" }),
    ]}),
    new Paragraph({ border: { bottom: { style: BorderStyle.SINGLE, size: 8, color: ACCENT2, space: 8 } }, spacing: { after: 480 }, children: [] }),
    new Paragraph({ spacing: { before: 480, after: 160 }, children: [
      new TextRun({ text: docType, font: "Arial", size: 22, color: ACCENT2, bold: true, allCaps: true }),
    ]}),
    new Paragraph({ spacing: { before: 0, after: 240 }, children: [
      new TextRun({ text: title, font: "Arial", size: 48, bold: true, color: ACCENT }),
    ]}),
    new Paragraph({ spacing: { before: 0, after: 960 }, children: [
      new TextRun({ text: subtitle, font: "Arial", size: 26, color: "374151" }),
    ]}),
    new Table({
      width: { size: 9000, type: WidthType.DXA },
      columnWidths: [2200, 6800],
      rows: [
        row2("Version", "1.0", true),
        row2("Date", DATE, false),
        row2("Status", "Draft", true),
        row2("Owner", "contact@resolvogroup.com", false),
        row2("Platform", "https://app.resolvogroup.com", true),
      ]
    }),
    new Paragraph({ children: [new PageBreak()] }),
  ];
}

function row2(label, value, shaded) {
  return new TableRow({ children: [
    new TableCell({
      width: { size: 2200, type: WidthType.DXA },
      borders: hdrBorders,
      shading: { fill: LIGHT, type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: label, bold: true, font: "Arial", size: 20, color: ACCENT })] })]
    }),
    new TableCell({
      width: { size: 6800, type: WidthType.DXA },
      borders,
      shading: { fill: shaded ? "F9FAFB" : "FFFFFF", type: ShadingType.CLEAR },
      margins: { top: 80, bottom: 80, left: 120, right: 120 },
      children: [new Paragraph({ children: [new TextRun({ text: value, font: "Arial", size: 20 })] })]
    }),
  ]});
}

function h1(text) { return new Paragraph({ heading: HeadingLevel.HEADING_1, children: [new TextRun(text)] }); }
function h2(text) { return new Paragraph({ heading: HeadingLevel.HEADING_2, children: [new TextRun(text)] }); }
function h3(text) { return new Paragraph({ heading: HeadingLevel.HEADING_3, children: [new TextRun(text)] }); }
function p(text, opts = {}) {
  return new Paragraph({ spacing: { after: 120 }, children: [
    new TextRun({ text, font: "Arial", size: 22, ...opts })
  ]});
}
function b(text) { return new Paragraph({ numbering: { reference: "bullets", level: 0 }, children: [new TextRun({ text, font: "Arial", size: 22 })] }); }
function b2(text) { return new Paragraph({ numbering: { reference: "bullets", level: 1 }, children: [new TextRun({ text, font: "Arial", size: 22 })] }); }
function n(text) { return new Paragraph({ numbering: { reference: "numbers", level: 0 }, children: [new TextRun({ text, font: "Arial", size: 22 })] }); }
function gap() { return new Paragraph({ spacing: { before: 120, after: 120 }, children: [] }); }
function pb() { return new Paragraph({ children: [new PageBreak()] }); }

function tbl(headers, rows, colWidths) {
  const total = colWidths.reduce((a, b) => a + b, 0);
  return new Table({
    width: { size: total, type: WidthType.DXA },
    columnWidths: colWidths,
    rows: [
      new TableRow({
        tableHeader: true,
        children: headers.map((h, i) => new TableCell({
          width: { size: colWidths[i], type: WidthType.DXA },
          borders: hdrBorders,
          shading: { fill: ACCENT, type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true, font: "Arial", size: 20, color: "FFFFFF" })] })]
        }))
      }),
      ...rows.map((row, ri) => new TableRow({
        children: row.map((cell, ci) => new TableCell({
          width: { size: colWidths[ci], type: WidthType.DXA },
          borders,
          shading: { fill: ri % 2 === 0 ? "FFFFFF" : "F9FAFB", type: ShadingType.CLEAR },
          margins: { top: 80, bottom: 80, left: 120, right: 120 },
          children: [new Paragraph({ children: [new TextRun({ text: cell, font: "Arial", size: 20 })] })]
        }))
      }))
    ]
  });
}

// ═══════════════════════════════════════════════════════════════
// 1. BRD
// ═══════════════════════════════════════════════════════════════
async function makeBRD() {
  const children = [
    ...titlePage("Business Requirements Document", "Resolvo — Multi-Brand Support Platform", "BRD"),
    h1("1. Executive Summary"),
    p("Resolvo is a multi-brand SaaS customer support and operations platform designed for organisations managing multiple client brands from a single interface. It unifies ticketing, CRM, project management, and real-time email processing under one roof, enabling support teams to deliver fast, consistent, and measurable customer experiences."),
    gap(),
    h1("2. Business Objectives"),
    h2("2.1 Primary Goals"),
    b("Reduce average ticket resolution time by 40% through intelligent routing and AI-assisted responses."),
    b("Eliminate email-to-ticket gaps — zero missed customer emails via real-time IMAP IDLE integration."),
    b("Provide management with real-time visibility into support health via a customisable dashboard."),
    b("Enable a single team to manage multiple client brands without context switching between tools."),
    b("Capture and act on CSAT data to continuously improve service quality."),
    gap(),
    h2("2.2 Business Problems Solved"),
    tbl(
      ["Problem", "Business Impact", "Resolvo Solution"],
      [
        ["Missed customer emails", "Lost revenue, churn", "IMAP IDLE + 5-min fallback cron"],
        ["Duplicate tickets on reply", "Agent confusion, wasted effort", "3-method email threading dedup"],
        ["No SLA visibility", "Breach risk, compliance failure", "Real-time SLA tracking + alerts"],
        ["Siloed brand management", "Inefficiency, errors", "Multi-brand architecture with isolated DBs"],
        ["Manual workload balancing", "Agent burnout, poor CSAT", "Team workload widget + auto-assign"],
        ["No customer history view", "Repeated questions, poor CX", "CRM with contact/company timeline"],
      ],
      [3000, 2400, 3600]
    ),
    gap(),
    h1("3. Stakeholders"),
    tbl(
      ["Stakeholder", "Role", "Interest"],
      [
        ["Platform Owner", "contact@resolvogroup.com", "Platform reliability, revenue, SLA compliance"],
        ["Brand Admins", "Per-brand administrators", "Brand configuration, team management, reporting"],
        ["Support Agents", "Frontline ticket handlers", "Efficient ticket processing, AI assistance"],
        ["End Customers", "Ticket submitters (via email)", "Fast, accurate responses"],
        ["Management", "Executives reviewing dashboards", "KPIs, CSAT trends, team performance"],
      ],
      [2500, 3000, 3500]
    ),
    gap(),
    h1("4. Scope"),
    h2("4.1 In Scope"),
    b("Multi-brand ticketing with email-to-ticket conversion (IMAP IDLE)"),
    b("SLA definition, tracking, and breach alerting"),
    b("CSAT collection and reporting"),
    b("Customisable real-time dashboard with 12+ widget types"),
    b("CRM: contacts, companies, deal pipeline"),
    b("Issue tracker with sprint/kanban boards"),
    b("Appointment/calendar management"),
    b("AI agent assistant for response suggestions"),
    b("Role-based access: Owner / Admin / Agent"),
    b("Monitor and alert system (crash, memory, slow request)"),
    gap(),
    h2("4.2 Out of Scope"),
    b("Native mobile apps (web-responsive only)"),
    b("Telephony/voice support integration"),
    b("Payment processing"),
    b("Public-facing customer portal (future roadmap)"),
    gap(),
    h1("5. Functional Requirements"),
    h2("5.1 Email & Ticketing"),
    n("System must monitor brand inbox in real-time via IMAP IDLE and convert inbound emails to tickets within 5 seconds."),
    n("System must deduplicate tickets using message-ID headers, body reference codes (Ref: TKT-XXXXXXXX), and subject+sender matching."),
    n("Closed/resolved tickets must automatically re-open when a customer replies."),
    n("Agents must be able to reply to tickets via the platform; reply is sent as an email from the brand inbox."),
    n("Tickets must support statuses: New, Open, Pending, Resolved, Closed."),
    n("Tickets must support priorities: Critical, High, Medium, Low."),
    gap(),
    h2("5.2 SLA Management"),
    n("Admins must be able to define SLA policies per priority level (first response time, resolution time)."),
    n("System must calculate SLA breach in real time and send alert emails to the owner on breach."),
    n("Dashboard SLA widget must display within-SLA vs breached counts with breach list."),
    gap(),
    h2("5.3 Dashboard"),
    n("Dashboard must support drag-and-drop widget layout with per-user persistence."),
    n("Minimum 12 widget types covering support, engineering, CRM, appointments, and team modules."),
    n("Date range filter (7/14/30/90 days) must update all widgets simultaneously."),
    gap(),
    h2("5.4 CRM"),
    n("System must maintain contact and company records linked to ticket history."),
    n("Deal pipeline must support custom stages and deal value tracking."),
    gap(),
    h2("5.5 Issue Tracker"),
    n("Issues must support kanban workflow: Open, WIP, Testing, Resolved."),
    n("Sprint management with start/end dates, goals, and burndown progress."),
    gap(),
    h1("6. Non-Functional Requirements"),
    tbl(
      ["Requirement", "Target"],
      [
        ["Email delivery latency", "< 5 seconds (IMAP IDLE)"],
        ["API response time (non-AI)", "< 4 seconds (alert threshold)"],
        ["API response time (AI route)", "< 15 seconds (alert threshold)"],
        ["Uptime", "> 99.5% (PM2 auto-restart + crash alerting)"],
        ["Data isolation", "Complete — each brand has its own SQLite DB"],
        ["Security", "Session tokens, role-based access, no customer data in git"],
      ],
      [4500, 4500]
    ),
    gap(),
    h1("7. Assumptions & Constraints"),
    b("Each brand has a dedicated Gmail inbox configured for IMAP access."),
    b("VPS (Ubuntu) is provisioned with Node.js 20 and PM2."),
    b("Customer data must never be committed to git — data/ directory is gitignored."),
    b("Platform is accessed via web browser only (no native app)."),
    b("All credentials (IMAP, SMTP, OAuth) are stored in environment variables, never in code."),
    gap(),
    h1("8. Success Metrics"),
    tbl(
      ["Metric", "Target", "Measurement"],
      [
        ["Missed emails", "0 per day", "Email gap audit log"],
        ["Duplicate tickets", "< 1 per week", "Processed email IDs table"],
        ["Avg resolution time", "< 4 hours", "Dashboard widget"],
        ["CSAT average", "> 4.2 / 5", "CSAT score widget"],
        ["SLA compliance", "> 90%", "SLA status widget"],
        ["Dashboard load time", "< 2 seconds", "Browser performance"],
      ],
      [3000, 2200, 4000]
    ),
  ];

  const doc = new Document({
    numbering: numbering(),
    styles: docStyles(),
    sections: [{ properties: pageProps(), headers: { default: hdr("Business Requirements Document") }, footers: { default: ftr() }, children }]
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, 'Resolvo_BRD.docx'), buf);
  console.log('BRD done');
}

// ═══════════════════════════════════════════════════════════════
// 2. PRD
// ═══════════════════════════════════════════════════════════════
async function makePRD() {
  const children = [
    ...titlePage("Product Requirements Document", "Resolvo — Features, User Stories & Acceptance Criteria", "PRD"),
    h1("1. Product Overview"),
    p("Resolvo is a multi-brand customer support SaaS platform. It processes inbound customer emails in real time, converts them to structured tickets, routes them to agents, and provides management with live operational dashboards. It is the single operations tool for multi-brand support organisations."),
    gap(),
    h1("2. User Personas"),
    h2("2.1 Support Agent"),
    p("A customer-facing team member who handles 20-50 tickets per day. Needs quick access to customer history, AI response suggestions, and clear ticket priority ordering. Time-sensitive role — every second of friction matters."),
    gap(),
    h2("2.2 Brand Admin"),
    p("Configures brand settings, manages agents, defines SLA policies, and reviews team performance. Uses the dashboard daily. Sets up email integration and views CSAT trends weekly."),
    gap(),
    h2("2.3 Platform Owner"),
    p("Oversees the entire platform across all brands. Receives critical alerts (crashes, memory, slow requests, SLA breaches). Reviews platform health and customer satisfaction at a high level."),
    gap(),
    h1("3. Feature Modules"),
    h2("3.1 Email-to-Ticket Engine"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As an agent, I want inbound emails to become tickets automatically so I never miss a customer message.", "Ticket created within 5s of email arrival via IMAP IDLE.", "Critical"],
        ["As an agent, I want customer replies to be threaded to the existing ticket, not create duplicates.", "3-method matching: message-ID, Ref: TKT-XXXXXXXX, subject+sender.", "Critical"],
        ["As an agent, I want resolved tickets to re-open automatically when the customer replies.", "Status changes to 'open' on customer reply to resolved/closed ticket.", "High"],
        ["As an admin, I want the system to send from the brand email address when agents reply.", "SMTP sends from brand inbox; Reply-To set correctly.", "High"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h2("3.2 Ticket Management"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As an agent, I can set ticket status and priority.", "Status: New/Open/Pending/Resolved/Closed. Priority: Critical/High/Medium/Low.", "Critical"],
        ["As an agent, I can assign tickets to myself or another agent.", "Assignee field updates; notification sent.", "High"],
        ["As an agent, I can add internal notes visible only to the team.", "Notes flagged as internal; not sent to customer.", "High"],
        ["As an admin, I can view all tickets across all agents.", "Admin view shows full team inbox.", "High"],
        ["As an agent, I can search and filter tickets by status, priority, assignee, date.", "Filter UI with real-time results.", "Medium"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h2("3.3 SLA Tracking"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As an admin, I can define SLA targets per priority.", "SLA policy: first response + resolution time per priority.", "High"],
        ["As a manager, I can see which tickets are breaching SLA.", "Dashboard SLA widget shows within/breached counts + list.", "High"],
        ["As an owner, I receive an alert when SLA is breached.", "Alert email sent to owner on breach.", "High"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h2("3.4 Dashboard & Widgets"),
    p("The dashboard is a drag-and-drop interface powered by GridStack v10. Users can add, remove, resize, and rearrange widgets. Layout is saved per user per brand."),
    gap(),
    tbl(
      ["Widget", "Module", "Description"],
      [
        ["Ticket Overview", "Support", "Total tickets by status (all open, new, open, pending, resolved, closed)"],
        ["Open by Priority", "Support", "Bar chart of open tickets by Critical/High/Medium/Low"],
        ["SLA Status", "Support", "Doughnut chart of within-SLA vs breached + breach list"],
        ["Avg Resolution Time", "Support", "Average hours to resolve vs previous period"],
        ["CSAT Score", "Support", "Average rating (1-5), star display, distribution bars"],
        ["My Open Tickets", "Support", "Agent's own open tickets list"],
        ["Unassigned Tickets", "Support", "All unassigned tickets requiring action"],
        ["Issue Overview", "Engineering", "Issues by status: open/wip/testing/resolved"],
        ["Active Sprint", "Engineering", "Current sprint progress bar, goal, days remaining"],
        ["Team Workload", "Team", "Per-agent open ticket count vs capacity"],
        ["Agent Availability", "Team", "Agent online/offline status + open count"],
        ["Today's Appointments", "Appointments", "Calendar events for the current day"],
      ],
      [2500, 1800, 5000]
    ),
    gap(),
    h2("3.5 CRM"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As an agent, I can create and view contact records with ticket history.", "Contact record shows all linked tickets and communications.", "High"],
        ["As an agent, I can manage company accounts linked to contacts.", "Company record with contact list and deal pipeline.", "Medium"],
        ["As an admin, I can track deals through a pipeline.", "Deal stages, value, and close date tracking.", "Medium"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h2("3.6 Issue Tracker"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As a developer, I can manage issues in a kanban board.", "Columns: Open, WIP, Testing, Resolved. Drag to move.", "High"],
        ["As a team lead, I can create sprints with goals and timelines.", "Sprint: name, goal, start date, end date. Issues assignable to sprints.", "High"],
        ["As a manager, I can view sprint progress.", "Sprint widget shows % done, days left, total vs done.", "Medium"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h2("3.7 AI Assistant"),
    tbl(
      ["User Story", "Acceptance Criteria", "Priority"],
      [
        ["As an agent, I can get AI-suggested responses for a ticket.", "AI route (/api/call) returns response suggestion in < 15s.", "Medium"],
        ["As an admin, I know if the AI route is slow.", "Alert sent to owner if AI response > 15 seconds.", "Medium"],
      ],
      [3500, 3500, 2000]
    ),
    gap(),
    h1("4. Release Roadmap"),
    tbl(
      ["Phase", "Features", "Status"],
      [
        ["Phase 1 — Core", "Email-to-ticket, ticket management, IMAP IDLE, roles", "Complete"],
        ["Phase 2 — Operations", "SLA tracking, CSAT, dashboard widgets, alerts", "Complete"],
        ["Phase 3 — CRM & Projects", "CRM, issue tracker, sprints, appointments", "Complete"],
        ["Phase 4 — AI & Scale", "AI assistant, multi-brand scaling, advanced analytics", "In Progress"],
        ["Phase 5 — Portal", "Public-facing customer portal, self-service", "Roadmap"],
      ],
      [2000, 5000, 2000]
    ),
  ];

  const doc = new Document({
    numbering: numbering(),
    styles: docStyles(),
    sections: [{ properties: pageProps(), headers: { default: hdr("Product Requirements Document") }, footers: { default: ftr() }, children }]
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, 'Resolvo_PRD.docx'), buf);
  console.log('PRD done');
}

// ═══════════════════════════════════════════════════════════════
// 3. TRD
// ═══════════════════════════════════════════════════════════════
async function makeTRD() {
  const children = [
    ...titlePage("Technical Requirements Document", "Resolvo — Architecture, Infrastructure & Technical Specifications", "TRD"),
    h1("1. System Architecture"),
    h2("1.1 Overview"),
    p("Resolvo is a monolithic Node.js/Express application serving both API endpoints and static frontend files. Each brand has a fully isolated SQLite database. The architecture prioritises simplicity, reliability, and zero-dependency data isolation."),
    gap(),
    h2("1.2 Architecture Diagram (Text)"),
    tbl(
      ["Layer", "Technology", "Purpose"],
      [
        ["Web Server", "Express 4 (Node.js 20)", "HTTP API + static file serving"],
        ["Process Manager", "PM2", "Auto-restart, log rotation, startup on boot"],
        ["Database", "SQLite via better-sqlite3", "Per-brand isolated database"],
        ["Email Inbound", "node-imap + IMAP IDLE", "Real-time email monitoring"],
        ["Email Outbound", "nodemailer", "SMTP for agent replies and alerts"],
        ["Job Scheduler", "node-schedule", "Reminders, digest, follow-ups, 5-min fallback poll"],
        ["Frontend", "Vanilla JS + GridStack v10 + Chart.js 4", "SPA-style UI served as static HTML"],
        ["AI Route", "Express proxy to AI provider", "Agent response suggestions"],
        ["Version Control", "GitHub (private)", "Source code management"],
        ["Infrastructure", "Ubuntu VPS", "Single-server deployment"],
      ],
      [2500, 3500, 3000]
    ),
    gap(),
    h1("2. Technology Stack"),
    h2("2.1 Backend"),
    tbl(
      ["Package", "Version", "Purpose"],
      [
        ["Node.js", "20.x", "Runtime"],
        ["Express", "4.x", "HTTP framework"],
        ["better-sqlite3", "Latest", "Synchronous SQLite access"],
        ["node-imap", "Latest", "IMAP client for email monitoring"],
        ["nodemailer", "Latest", "SMTP email sending"],
        ["node-schedule", "Latest", "Cron-style job scheduling"],
        ["PM2", "Latest", "Production process management"],
      ],
      [2500, 1800, 4700]
    ),
    gap(),
    h2("2.2 Frontend"),
    tbl(
      ["Library", "Version", "Purpose"],
      [
        ["GridStack.js", "10.3.1", "Drag-and-drop dashboard widget grid"],
        ["Chart.js", "4.4.0", "Data visualisation (doughnut, bar charts)"],
        ["Vanilla JS", "ES6+", "All UI logic — no framework"],
      ],
      [2500, 1800, 4700]
    ),
    gap(),
    h1("3. Email Processing Architecture"),
    h2("3.1 IMAP IDLE Flow"),
    n("Server starts IMAP IDLE connection for each configured brand on startup."),
    n("Gmail pushes 'mail' event to the persistent connection within 1-3 seconds of email arrival."),
    n("On event: fetch new emails using UID cursor (lastUID stored in db.sqlite)."),
    n("UID range uses 4294967295 as upper bound to avoid IMAP normalization bug (UID n:* matches last message when n does not exist)."),
    n("5-minute safety cron runs as fallback in case IDLE connection drops."),
    n("Exponential backoff on reconnect: 10s → 20s → 40s → max 5 minutes."),
    gap(),
    h2("3.2 Email Threading Algorithm"),
    p("Three-method cascade to match inbound email to existing ticket:"),
    b("Method 1 — Message-ID: Check In-Reply-To header against stored message IDs on all tickets."),
    b("Method 2 — Body Reference: Scan email body for 'Ref: TKT-XXXXXXXX' pattern."),
    b("Method 3 — Subject + Sender: Strip Re:/Fwd: prefixes and match clean subject + from address against open tickets."),
    p("If no match found: create new ticket. If match found: add reply to existing ticket. If ticket was closed/resolved: re-open it."),
    gap(),
    h2("3.3 Deduplication"),
    p("processed_email_ids table in each brand's SQLite DB stores all processed IMAP message IDs. Before processing any email, system checks this table. Duplicate processing is impossible even if IDLE and cron both fire simultaneously."),
    gap(),
    h1("4. Database Architecture"),
    h2("4.1 File Structure"),
    p("data/", { bold: true }),
    p("  brands/", { color: "6B7280" }),
    p("    {slug}/", { color: "6B7280" }),
    p("      db.sqlite   ← Live data (tickets, contacts, sessions, etc.)", { color: "6B7280" }),
    p("      db.json     ← Brand config (email settings, IMAP credentials)", { color: "6B7280" }),
    gap(),
    h2("4.2 Isolation Guarantee"),
    b("Each brand has its own SQLite file — no shared tables between brands."),
    b("The data/ directory is gitignored — customer data never touches version control."),
    b("Brand config (db.json) holds IMAP/SMTP credentials — never hardcoded in server.js."),
    gap(),
    h1("5. Security Architecture"),
    tbl(
      ["Concern", "Implementation"],
      [
        ["Authentication", "Session tokens stored in-memory (Map); token passed in x-session-token header"],
        ["Authorisation", "Role check on every protected route (Owner / Admin / Agent)"],
        ["Data isolation", "All brand routes scoped to :slug; DB reads/writes use slug-scoped path"],
        ["Credentials", "IMAP/SMTP credentials in db.json (not in git); .env for global secrets"],
        ["Git safety", "data/, *.sqlite, .env*, public/uploads/ in .gitignore"],
        ["CORS", "Express CORS configured for app.resolvogroup.com only"],
        ["XSS", "All customer-supplied text escaped before rendering in UI (esc() helper)"],
      ],
      [3500, 5500]
    ),
    gap(),
    h1("6. Monitoring & Alerting"),
    tbl(
      ["Alert Type", "Threshold", "Action"],
      [
        ["Slow Request", "> 4s (general), > 15s (AI route)", "Email alert to owner"],
        ["High Memory", "> 500MB heap", "Email alert to owner"],
        ["Process Crash", "uncaughtException / unhandledRejection", "Email alert + PM2 auto-restart"],
        ["IMAP Failure", "Consecutive failures with backoff", "Logged; reconnect attempted"],
        ["Email Poll Timeout", "> 40 seconds", "Force disconnect; counted as failure"],
      ],
      [2800, 2800, 3400]
    ),
    gap(),
    h1("7. Deployment & Operations"),
    h2("7.1 Deployment Process"),
    n("Code changes committed and pushed to GitHub (private repo)."),
    n("On VPS: git fetch origin; git checkout origin/main -- server.js public/"),
    n("pm2 restart resolvo — zero-downtime restart."),
    n("Customer data in data/ is never touched by deploy process."),
    gap(),
    h2("7.2 Infrastructure Requirements"),
    tbl(
      ["Requirement", "Specification"],
      [
        ["OS", "Ubuntu 22.04 LTS"],
        ["Node.js", "v20.x LTS"],
        ["RAM", "Minimum 2GB (4GB recommended)"],
        ["Storage", "20GB SSD minimum"],
        ["Network", "Static IP; ports 80/443 open"],
        ["SSL", "Let's Encrypt via nginx reverse proxy"],
        ["PM2 startup", "pm2 startup && pm2 save — survives reboot"],
      ],
      [3000, 6000]
    ),
  ];

  const doc = new Document({
    numbering: numbering(),
    styles: docStyles(),
    sections: [{ properties: pageProps(), headers: { default: hdr("Technical Requirements Document") }, footers: { default: ftr() }, children }]
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, 'Resolvo_TRD.docx'), buf);
  console.log('TRD done');
}

// ═══════════════════════════════════════════════════════════════
// 4. BACKEND SCHEMA
// ═══════════════════════════════════════════════════════════════
async function makeSchema() {
  const children = [
    ...titlePage("Backend & Database Schema", "Resolvo — SQLite Tables, API Routes & Data Models", "Schema"),
    h1("1. Database Overview"),
    p("Resolvo uses SQLite (via better-sqlite3) with one database file per brand, located at data/brands/{slug}/db.sqlite. There are no cross-brand tables. All schema changes are applied programmatically on startup via CREATE TABLE IF NOT EXISTS statements."),
    gap(),
    h1("2. Core Tables"),
    h2("2.1 tickets"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "Unique ticket ID: TKT-XXXXXXXX (8 hex chars)"],
        ["subject", "TEXT", "Email subject line"],
        ["from", "TEXT", "Customer email address"],
        ["fromName", "TEXT", "Customer display name"],
        ["status", "TEXT", "new | open | pending | resolved | closed"],
        ["priority", "TEXT", "critical | high | medium | low"],
        ["assignedTo", "TEXT", "Agent email address (nullable)"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
        ["updatedAt", "TEXT", "ISO 8601 timestamp"],
        ["resolvedAt", "TEXT", "ISO 8601 timestamp (nullable)"],
        ["messages", "TEXT (JSON)", "Array of message objects (thread)"],
        ["messageIds", "TEXT (JSON)", "Array of IMAP message IDs for threading"],
        ["tags", "TEXT (JSON)", "Array of tag strings"],
        ["slaBreached", "INTEGER", "0 | 1 — SLA breach flag"],
        ["csatScore", "INTEGER", "1-5 customer rating (nullable)"],
        ["source", "TEXT", "email | chat | manual"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.2 processed_email_ids"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["message_id", "TEXT (PK)", "IMAP message-ID header value"],
        ["processed_at", "TEXT", "ISO 8601 timestamp"],
      ],
      [3000, 2000, 4000]
    ),
    p("Purpose: Prevents duplicate ticket creation when both IMAP IDLE and the 5-minute cron poll both receive the same email event."),
    gap(),
    h2("2.3 sessions"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["token", "TEXT (PK)", "Session token (random hex string)"],
        ["userEmail", "TEXT", "Agent email address"],
        ["role", "TEXT", "owner | admin | agent"],
        ["brandSlug", "TEXT", "Brand this session belongs to"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
        ["expiresAt", "TEXT", "ISO 8601 expiry timestamp"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.4 contacts (CRM)"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["name", "TEXT", "Full name"],
        ["email", "TEXT", "Email address"],
        ["phone", "TEXT", "Phone number (nullable)"],
        ["companyId", "TEXT", "FK to companies table (nullable)"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
        ["notes", "TEXT", "Free-text notes"],
        ["tags", "TEXT (JSON)", "Array of tags"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.5 companies (CRM)"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["name", "TEXT", "Company name"],
        ["website", "TEXT", "URL (nullable)"],
        ["industry", "TEXT", "Industry category (nullable)"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.6 deals (CRM)"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["title", "TEXT", "Deal name"],
        ["value", "REAL", "Deal value (currency)"],
        ["stage", "TEXT", "Pipeline stage"],
        ["companyId", "TEXT", "FK to companies"],
        ["contactId", "TEXT", "FK to contacts"],
        ["closeDate", "TEXT", "Expected close date"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.7 issues"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["title", "TEXT", "Issue title"],
        ["description", "TEXT", "Detailed description"],
        ["status", "TEXT", "open | wip | testing | resolved"],
        ["priority", "TEXT", "critical | high | medium | low"],
        ["assignedTo", "TEXT", "Agent email (nullable)"],
        ["sprintId", "TEXT", "FK to sprints (nullable)"],
        ["createdAt", "TEXT", "ISO 8601 timestamp"],
        ["resolvedAt", "TEXT", "ISO 8601 (nullable)"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.8 sprints"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["name", "TEXT", "Sprint name (e.g. Sprint 4)"],
        ["goal", "TEXT", "Sprint goal (nullable)"],
        ["startDate", "TEXT", "ISO 8601 date"],
        ["endDate", "TEXT", "ISO 8601 date"],
        ["status", "TEXT", "active | completed | planned"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.9 appointments"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["id", "TEXT (PK)", "UUID"],
        ["title", "TEXT", "Appointment title"],
        ["startTime", "TEXT", "ISO 8601 datetime"],
        ["endTime", "TEXT", "ISO 8601 datetime"],
        ["attendees", "TEXT (JSON)", "Array of email addresses"],
        ["notes", "TEXT", "Notes (nullable)"],
        ["createdBy", "TEXT", "Agent email"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h2("2.10 dashboard_config"),
    tbl(
      ["Column", "Type", "Description"],
      [
        ["userEmail", "TEXT (PK)", "Agent email — one row per user"],
        ["widgets", "TEXT (JSON)", "Array of widget config objects {id, type, x, y, w, h}"],
        ["globalRange", "TEXT", "Date range setting (7 | 14 | 30 | 90)"],
        ["updatedAt", "TEXT", "ISO 8601 timestamp"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h1("3. Brand Config Schema (db.json)"),
    p("Each brand has a db.json file (gitignored) with the following structure:"),
    tbl(
      ["Field", "Type", "Description"],
      [
        ["slug", "string", "Unique brand identifier (URL-safe)"],
        ["name", "string", "Display name"],
        ["email.user", "string", "Brand inbox email address"],
        ["email.host", "string", "IMAP host (e.g. imap.gmail.com)"],
        ["email.port", "number", "IMAP port (993)"],
        ["email.tls", "boolean", "TLS enabled"],
        ["email.password", "string", "App password (never committed to git)"],
        ["smtp.host", "string", "SMTP host"],
        ["smtp.port", "number", "SMTP port (587)"],
        ["smtp.user", "string", "SMTP username"],
        ["smtp.password", "string", "SMTP password"],
        ["sla.critical", "object", "{ firstResponse: mins, resolution: mins }"],
        ["sla.high", "object", "SLA policy for High priority"],
        ["sla.medium", "object", "SLA policy for Medium priority"],
        ["sla.low", "object", "SLA policy for Low priority"],
        ["agents", "array", "[ { email, name, role, passwordHash } ]"],
        ["intervalMinutes", "number", "Legacy fallback poll interval (now IDLE)"],
      ],
      [2500, 2000, 4500]
    ),
    gap(),
    h1("4. Key API Routes"),
    tbl(
      ["Method", "Route", "Auth", "Description"],
      [
        ["POST", "/api/:slug/login", "None", "Agent login, returns session token"],
        ["GET", "/api/:slug/tickets", "Agent+", "List all tickets with filters"],
        ["POST", "/api/:slug/tickets", "Agent+", "Create ticket manually"],
        ["GET", "/api/:slug/tickets/:id", "Agent+", "Get single ticket with messages"],
        ["PUT", "/api/:slug/tickets/:id", "Agent+", "Update ticket (status, priority, assignee)"],
        ["POST", "/api/:slug/tickets/:id/reply", "Agent+", "Send email reply, add to thread"],
        ["GET", "/api/:slug/dashboard/config", "Agent+", "Get saved dashboard layout"],
        ["POST", "/api/:slug/dashboard/config", "Admin+", "Save dashboard layout"],
        ["GET", "/api/:slug/dashboard/widget", "Agent+", "Get data for a specific widget type"],
        ["GET", "/api/:slug/contacts", "Agent+", "List CRM contacts"],
        ["POST", "/api/:slug/contacts", "Agent+", "Create contact"],
        ["GET", "/api/:slug/issues", "Agent+", "List issues"],
        ["GET", "/api/:slug/sprints", "Agent+", "List sprints"],
        ["GET", "/api/:slug/appointments", "Agent+", "List appointments"],
        ["POST", "/api/call", "Agent+", "AI assistant proxy route"],
        ["GET", "/api/owner/brands", "Owner", "List all brands"],
      ],
      [1000, 3500, 1200, 3300]
    ),
  ];

  const doc = new Document({
    numbering: numbering(),
    styles: docStyles(),
    sections: [{ properties: pageProps(), headers: { default: hdr("Backend & Database Schema") }, footers: { default: ftr() }, children }]
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, 'Resolvo_Backend_Schema.docx'), buf);
  console.log('Schema done');
}

// ═══════════════════════════════════════════════════════════════
// 5. IMPLEMENTATION PLAN
// ═══════════════════════════════════════════════════════════════
async function makeImplPlan() {
  const children = [
    ...titlePage("Implementation Plan", "Resolvo — Development Phases, Tasks & Milestones", "Implementation Plan"),
    h1("1. Overview"),
    p("This implementation plan covers the full development lifecycle of Resolvo from initial setup through production deployment and ongoing maintenance. It is structured into 5 phases with clear milestones, ownership, and acceptance criteria for each deliverable."),
    gap(),
    h1("2. Phase Summary"),
    tbl(
      ["Phase", "Name", "Duration", "Status"],
      [
        ["1", "Foundation & Core Ticketing", "4 weeks", "Complete"],
        ["2", "Email Engine & Real-Time Processing", "3 weeks", "Complete"],
        ["3", "Dashboard, SLA & CSAT", "3 weeks", "Complete"],
        ["4", "CRM, Issues & Appointments", "4 weeks", "Complete"],
        ["5", "AI Integration, Hardening & Scale", "Ongoing", "In Progress"],
      ],
      [1000, 3500, 2000, 2500]
    ),
    gap(),
    h1("3. Phase 1 — Foundation & Core Ticketing"),
    h2("3.1 Goals"),
    b("Set up Node.js/Express monolith with multi-brand routing."),
    b("Implement SQLite per-brand database with automated schema migration on startup."),
    b("Build role-based authentication (Owner / Admin / Agent)."),
    b("Create ticket CRUD: create, view, update status/priority/assignee."),
    b("Build frontend ticket inbox with filter and search."),
    gap(),
    h2("3.2 Tasks"),
    tbl(
      ["Task", "Details", "Owner", "Status"],
      [
        ["Project scaffold", "Express server, static file serving, .gitignore (data/, .env, *.sqlite)", "Backend", "Done"],
        ["Multi-brand routing", "/:slug route prefix; readBrandDB/writeBrandDB helpers", "Backend", "Done"],
        ["SQLite schema init", "CREATE TABLE IF NOT EXISTS on startup for all core tables", "Backend", "Done"],
        ["Auth system", "Login endpoint, session token map, getSessionUser middleware", "Backend", "Done"],
        ["Ticket model", "TKT-XXXXXXXX ID generation, full status/priority enum validation", "Backend", "Done"],
        ["Ticket API", "GET/POST/PUT routes with role checks", "Backend", "Done"],
        ["Frontend inbox", "Ticket list, filter bar, status badges, priority dots", "Frontend", "Done"],
        ["Ticket detail view", "Message thread, reply composer, status/priority controls", "Frontend", "Done"],
      ],
      [2500, 3000, 1500, 1500]
    ),
    gap(),
    h1("4. Phase 2 — Email Engine & Real-Time Processing"),
    h2("4.1 Goals"),
    b("Implement IMAP IDLE for real-time email-to-ticket conversion."),
    b("Build 3-method email threading to prevent duplicate tickets."),
    b("Add 5-minute safety cron as fallback."),
    b("Implement exponential backoff for IMAP reconnection."),
    b("Add auto-reopen on customer reply to closed/resolved ticket."),
    gap(),
    h2("4.2 Tasks"),
    tbl(
      ["Task", "Details", "Owner", "Status"],
      [
        ["IMAP IDLE connection", "Persistent imap connection per brand; 'mail' event handler", "Backend", "Done"],
        ["UID cursor tracking", "lastUID stored in db.sqlite; fetch only new emails", "Backend", "Done"],
        ["UID range fix", "Use 4294967295 as upper bound to fix IMAP normalization bug", "Backend", "Done"],
        ["Email dedup table", "processed_email_ids; check before processing", "Backend", "Done"],
        ["3-method threading", "inReplyTo → body ref → subject+sender cascade", "Backend", "Done"],
        ["Auto re-open", "Status set to 'open' when customer replies to resolved/closed", "Backend", "Done"],
        ["5-min safety cron", "node-schedule job as fallback if IDLE drops", "Backend", "Done"],
        ["Exponential backoff", "10s→20s→40s→max 5min on reconnect failure", "Backend", "Done"],
        ["_pollInProgress guard", "Set per brand prevents concurrent poll runs", "Backend", "Done"],
      ],
      [2500, 3000, 1500, 1500]
    ),
    gap(),
    h1("5. Phase 3 — Dashboard, SLA & CSAT"),
    h2("5.1 Goals"),
    b("Build customisable drag-and-drop dashboard with GridStack v10."),
    b("Implement 12+ widget types with real-time data from API."),
    b("SLA tracking per priority with breach alerting."),
    b("CSAT collection and score dashboard widget."),
    b("Monitor and alert system for crashes, memory, slow requests."),
    gap(),
    h2("5.2 Tasks"),
    tbl(
      ["Task", "Details", "Owner", "Status"],
      [
        ["GridStack dashboard", "dashboard.html with gs-* attribute API (v10)", "Frontend", "Done"],
        ["Widget API", "GET /api/:slug/dashboard/widget?type=X&range=Y", "Backend", "Done"],
        ["Dashboard save/load", "POST/GET /api/:slug/dashboard/config per user", "Backend", "Done"],
        ["12 widget types", "ticket_overview, sla_status, csat_score, team_workload, etc.", "Full Stack", "Done"],
        ["SLA engine", "Calculate breach per ticket; update slaBreached flag", "Backend", "Done"],
        ["SLA alerts", "Email to owner on breach via nodemailer", "Backend", "Done"],
        ["CSAT collection", "Rating prompt in ticket resolved email; 1-5 star input", "Full Stack", "Done"],
        ["Monitor system", "Slow request middleware, memory check interval, crash handler", "Backend", "Done"],
        ["Slow threshold", "15s for /api/call, 4s for all other routes", "Backend", "Done"],
      ],
      [2500, 3000, 1500, 1500]
    ),
    gap(),
    h1("6. Phase 4 — CRM, Issues & Appointments"),
    h2("6.1 Tasks"),
    tbl(
      ["Task", "Details", "Owner", "Status"],
      [
        ["CRM contacts", "Full CRUD for contacts; link to ticket history", "Full Stack", "Done"],
        ["CRM companies", "Company records; contacts linked to company", "Full Stack", "Done"],
        ["Deal pipeline", "Deals with stage, value, close date; pipeline view", "Full Stack", "Done"],
        ["Issue tracker", "Kanban board: open/wip/testing/resolved", "Full Stack", "Done"],
        ["Sprint management", "Create sprints; assign issues; progress tracking", "Full Stack", "Done"],
        ["Appointments", "Calendar events with attendees; today's view widget", "Full Stack", "Done"],
        ["Announcements", "Team announcements with info/warning/success types", "Full Stack", "Done"],
      ],
      [2500, 3000, 1500, 1500]
    ),
    gap(),
    h1("7. Phase 5 — AI Integration, Hardening & Scale"),
    h2("7.1 Current Status: In Progress"),
    h2("7.2 Tasks"),
    tbl(
      ["Task", "Details", "Priority", "Status"],
      [
        ["AI assistant route", "POST /api/call proxy to AI provider; 15s timeout alert", "High", "Done"],
        ["OAuth credential rotation", "Rotate any exposed OAuth client ID/secret", "Critical", "Pending"],
        ["Gmail Push Pub/Sub", "Replace IMAP IDLE with Gmail push for VPS-downtime resilience", "High", "Planned"],
        ["Public customer portal", "Self-service ticket submission and status page", "Medium", "Planned"],
        ["Advanced analytics", "Trend charts, agent leaderboard, response time histogram", "Medium", "Planned"],
        ["Webhook system", "Outbound webhooks on ticket events for integrations", "Low", "Planned"],
        ["Rate limiting", "Per-IP and per-session API rate limiting", "High", "Planned"],
        ["Automated tests", "Integration test suite for email threading and ticket API", "High", "Planned"],
      ],
      [2500, 3000, 1500, 1500]
    ),
    gap(),
    h1("8. Deployment Runbook"),
    h2("8.1 Local Development"),
    n("Clone repo: git clone https://github.com/Mrsk82/Resolvo.git"),
    n("Install dependencies: npm install"),
    n("Set up data/ directory with brand config (db.json) — not in git."),
    n("Start: node --max-old-space-size=4096 server.js"),
    gap(),
    h2("8.2 VPS Deployment"),
    n("SSH into VPS: ssh root@srv1737268"),
    n("Fetch latest code: git fetch origin"),
    n("Deploy code files only (never data/):"),
    p("    git checkout origin/main -- server.js public/", { color: "6B7280", size: 20 }),
    n("Restart: pm2 restart resolvo"),
    n("Verify: pm2 logs resolvo --lines 20"),
    gap(),
    h2("8.3 Rollback"),
    n("Identify last good commit: git log --oneline"),
    n("Checkout that commit: git checkout <hash> -- server.js public/"),
    n("Restart: pm2 restart resolvo"),
    gap(),
    h1("9. Risk Register"),
    tbl(
      ["Risk", "Likelihood", "Impact", "Mitigation"],
      [
        ["IMAP IDLE drops silently", "Medium", "High", "5-min safety cron + UIDVALIDITY check on reconnect"],
        ["Gmail blocks IMAP (rate limit)", "Low", "High", "Exponential backoff; migrate to Pub/Sub"],
        ["SQLite corruption", "Low", "Critical", "Daily backup of data/*.sqlite to offsite storage"],
        ["VPS crash / reboot", "Low", "High", "PM2 startup configured; auto-restart on boot"],
        ["Exposed credentials in git", "Low", "Critical", "data/ gitignored; .gitignore enforced; credential rotation scheduled"],
        ["Memory leak", "Medium", "Medium", "Memory alert at 500MB; PM2 max-memory-restart"],
      ],
      [2500, 1500, 1500, 4000]
    ),
    gap(),
    h1("10. Testing Checklist"),
    h2("10.1 Email Engine"),
    b("Send test email to brand inbox → ticket created within 5 seconds."),
    b("Reply to that email → reply threaded to existing ticket, no duplicate."),
    b("Reply to resolved ticket → ticket re-opened."),
    b("Send duplicate email (same message-ID) → only one ticket created."),
    gap(),
    h2("10.2 Dashboard"),
    b("Add widget → appears in grid with data loaded."),
    b("Drag/resize widget → layout saved; persists after refresh."),
    b("Reset layout → default widgets restored."),
    b("Change date range → all widgets refresh with new range."),
    gap(),
    h2("10.3 Authentication"),
    b("Invalid token → 401 Unauthorized returned."),
    b("Agent cannot access Admin-only routes."),
    b("Owner can access all brands; Agent can only access own brand."),
  ];

  const doc = new Document({
    numbering: numbering(),
    styles: docStyles(),
    sections: [{ properties: pageProps(), headers: { default: hdr("Implementation Plan") }, footers: { default: ftr() }, children }]
  });
  const buf = await Packer.toBuffer(doc);
  fs.writeFileSync(path.join(OUT, 'Resolvo_Implementation_Plan.docx'), buf);
  console.log('Implementation Plan done');
}

(async () => {
  await makeBRD();
  await makePRD();
  await makeTRD();
  await makeSchema();
  await makeImplPlan();
  console.log('\nAll 5 documents created in:', OUT);
})();
