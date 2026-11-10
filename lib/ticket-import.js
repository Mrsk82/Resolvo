'use strict';
// Reading a CSV exported from another help desk (Zendesk, Freshdesk, Help Scout, or any file with similar columns) and turning each row into a Resolvo ticket.
// Pure functions only: no database, no network. The server (server.js, "Import tickets") saves what this produces.
const crypto = require('crypto');

const SOURCES = { zendesk: 'Zendesk', freshdesk: 'Freshdesk', helpscout: 'Help Scout', other: 'another help desk' };
const FIELDS = ['externalId', 'subject', 'email', 'name', 'body', 'status', 'priority', 'created', 'updated', 'resolved', 'assignee', 'tags'];
// Column names each field is usually exported under (compared after lower-casing and turning _ and - into spaces). First match in this order wins.
const SYN = {
  externalId: ['ticket id', 'id', 'ticket', 'ticket number', 'ticket #', 'ticket no', 'number', 'conversation id', 'conversation number', 'case id', 'case number', 'reference', '#'],
  subject: ['subject', 'ticket subject', 'title', 'conversation subject', 'case subject', 'summary'],
  email: ['requester email', 'requester e mail', 'requester email address', 'customer email', 'customer e mail', 'contact email', 'from email', 'email', 'e mail', 'email address', 'from'],
  name: ['requester name', 'customer name', 'contact name', 'requester', 'full name', 'customer', 'from name', 'name'],
  body: ['description', 'ticket description', 'body', 'message', 'first message', 'initial message', 'first comment', 'content', 'details', 'comment', 'text'],
  status: ['status', 'ticket status', 'conversation status', 'state'],
  priority: ['priority', 'ticket priority', 'urgency'],
  created: ['created at', 'created time', 'created', 'created date', 'date created', 'creation date', 'created on', 'requested', 'opened at', 'date'],
  updated: ['updated at', 'last update time', 'last updated', 'updated', 'updated time', 'updated date', 'last activity', 'last update', 'modified at', 'last modified'],
  resolved: ['solved at', 'resolved time', 'resolved at', 'solved', 'resolved', 'solved date', 'resolved date', 'closed time', 'closed at', 'closed date', 'date closed'],
  assignee: ['assignee', 'assignee email', 'agent', 'agent email', 'assigned to', 'assigned agent', 'assignee name', 'owner'],
  tags: ['tags', 'labels', 'tag']
};
const norm = (h) => String(h == null ? '' : h).toLowerCase().replace(/[_\-]+/g, ' ').replace(/\s+/g, ' ').trim();

// Which help desk the file looks like, from its column names. Only used to pre-select the label; the mapping is what matters.
function detectSource(headers) {
  const h = new Set((headers || []).map(norm));
  if (h.has('requester email') || h.has('solved at') || (h.has('requester') && h.has('assignee') && h.has('requested'))) return 'zendesk';
  if (h.has('created time') || h.has('resolved time') || (h.has('ticket id') && h.has('agent')) || h.has('first response time')) return 'freshdesk';
  if (h.has('customer email') || h.has('conversation number') || h.has('customer name')) return 'helpscout';
  return 'other';
}

// Best guess of which column holds each field: { subject: 'subject', email: 'requester email', ... } ('' when none found). Each column is used once.
function autoMap(headers) {
  const hs = (headers || []).map((h) => ({ raw: h, n: norm(h) })), used = new Set(), map = {};
  for (const f of FIELDS) {
    map[f] = '';
    for (const s of SYN[f]) { const hit = hs.find((x) => x.n === s && !used.has(x.raw)); if (hit) { map[f] = hit.raw; used.add(hit.raw); break; } }
  }
  return map;
}

const STATUS = { 'new': 'new', open: 'open', opened: 'open', active: 'open', 'in progress': 'open', 'work in progress': 'open', assigned: 'open', reopened: 'open',
  pending: 'pending', 'waiting on customer': 'pending', 'waiting for customer': 'pending', 'awaiting customer': 'pending', 'awaiting reply': 'pending',
  hold: 'on-hold', 'on hold': 'on-hold', 'on-hold': 'on-hold', 'waiting on third party': 'on-hold', 'waiting for third party': 'on-hold', 'waiting on 3rd party': 'on-hold',
  solved: 'resolved', resolved: 'resolved', completed: 'resolved', done: 'resolved', closed: 'closed', escalated: 'escalated', spam: '__skip', deleted: '__skip', trash: '__skip' };
const PRIORITY = { low: 'Low', minor: 'Low', p4: 'Low', normal: 'Medium', medium: 'Medium', moderate: 'Medium', p3: 'Medium', high: 'High', major: 'High', p2: 'High', urgent: 'Critical', critical: 'Critical', emergency: 'Critical', blocker: 'Critical', p1: 'Critical' };
function statusFrom(v) { const k = norm(v); if (!k) return { id: 'open', known: true, empty: true }; return STATUS[k] ? { id: STATUS[k], known: true } : { id: 'open', known: false, raw: String(v).trim().slice(0, 40) }; }
function priorityFrom(v) { const k = norm(v); return PRIORITY[k] || 'Medium'; }

const IST = 5.5 * 3600000;
const toIST = (ms) => new Date(ms + IST).toISOString().replace('Z', '+05:30');
const MONTHS = { jan: 0, feb: 1, mar: 2, apr: 3, may: 4, jun: 5, jul: 6, aug: 7, sep: 8, sept: 8, oct: 9, nov: 10, dec: 11 };
const ok = (ms) => (isFinite(ms) && ms > Date.UTC(1995, 0, 1) && ms < Date.now() + 366 * 86400000 ? ms : null);
// Reads the many date styles help desks export. A date with no time zone is read as India time (IST), the same as the rest of Resolvo.
// order: 'dmy' (day first, 15/01/2024) or 'mdy' (month first). A first number above 12 is always the day, a second above 12 always the day of a month-first date.
function parseDate(s, order) {
  let v = String(s == null ? '' : s).trim(); if (!v) return null;
  if (/^\d{13}$/.test(v)) return ok(+v); if (/^\d{10}$/.test(v)) return ok(+v * 1000);
  const tz = '(?:\\s*(Z|[+-]\\d{2}:?\\d{2}|GMT[+-]?\\d{0,4}|UTC[+-]?\\d{0,4}))?';
  let m = v.match(new RegExp('^(\\d{4})[-/.](\\d{1,2})[-/.](\\d{1,2})(?:[T\\s,]+(\\d{1,2}):(\\d{2})(?::(\\d{2})(?:\\.\\d+)?)?\\s*(am|pm)?)?' + tz + '$', 'i'));
  if (m) return build(+m[1], +m[2] - 1, +m[3], m[4], m[5], m[6], m[7], m[8]);
  m = v.match(new RegExp('^(\\d{1,2})[/.\\-](\\d{1,2})[/.\\-](\\d{2,4})(?:[T\\s,]+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(am|pm)?)?' + tz + '$', 'i'));
  if (m) {
    let a = +m[1], b = +m[2], y = +m[3]; if (y < 100) y += 2000;
    let day, mon;
    if (a > 12) { day = a; mon = b; } else if (b > 12) { mon = a; day = b; } else if (order === 'mdy') { mon = a; day = b; } else { day = a; mon = b; }
    return build(y, mon - 1, day, m[4], m[5], m[6], m[7], m[8]);
  }
  // "Mon, 15 Jan, 2024 at 10:30 AM", "Jan 15, 2024 10:30 AM", "15 January 2024 10:30"
  v = v.replace(/^(mon|tue|wed|thu|fri|sat|sun)[a-z]*\.?,?\s+/i, '').replace(/\s+at\s+/i, ' ').replace(/,/g, ' ').replace(/\s+/g, ' ').trim();
  m = v.match(new RegExp('^(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]{3,9})\\.?\\s+(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(am|pm)?)?' + tz + '$', 'i'));
  if (m && MONTHS[m[2].slice(0, 4).toLowerCase()] != null || m && MONTHS[m[2].slice(0, 3).toLowerCase()] != null) return build(+m[3], MONTHS[m[2].slice(0, 3).toLowerCase()], +m[1], m[4], m[5], m[6], m[7], m[8]);
  m = v.match(new RegExp('^([A-Za-z]{3,9})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\s+(\\d{4})(?:\\s+(\\d{1,2}):(\\d{2})(?::(\\d{2}))?\\s*(am|pm)?)?' + tz + '$', 'i'));
  if (m && MONTHS[m[1].slice(0, 3).toLowerCase()] != null) return build(+m[3], MONTHS[m[1].slice(0, 3).toLowerCase()], +m[2], m[4], m[5], m[6], m[7], m[8]);
  return null;
}
function build(y, mon, d, hh, mm, ss, ap, zone) {
  if (mon < 0 || mon > 11 || d < 1 || d > 31) return null;
  let h = hh == null ? 0 : +hh; const mi = mm == null ? 0 : +mm, se = ss == null ? 0 : +ss;
  if (ap) { const pm = /pm/i.test(ap); if (h === 12) h = pm ? 12 : 0; else if (pm) h += 12; }
  if (h > 23 || mi > 59 || se > 59) return null;
  let offMin = 330;   // India time unless the file says otherwise
  if (zone) {
    if (/^z$/i.test(zone)) offMin = 0;
    else { const z = zone.match(/([+-])(\d{2}):?(\d{2})/) || zone.match(/(GMT|UTC)([+-])(\d{1,2})(?::?(\d{2}))?/i); if (z && z.length === 4) offMin = (z[1] === '-' ? -1 : 1) * (+z[2] * 60 + +z[3]); else if (z) offMin = (z[2] === '-' ? -1 : 1) * (+z[3] * 60 + (+z[4] || 0)); else offMin = 0; }
  }
  const ms = Date.UTC(y, mon, d, h, mi, se) - offMin * 60000;
  return ok(ms);
}

function htmlToText(s) {
  return String(s == null ? '' : s).replace(/<style[\s\S]*?<\/style>/gi, '').replace(/<br\s*\/?>/gi, '\n').replace(/<\/(p|div|li|tr|h\d)>/gi, '\n').replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&amp;/g, '&')
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/\n{3,}/g, '\n\n').trim();
}
const cleanTag = (t) => String(t).toLowerCase().replace(/[^a-z0-9 _:.\-]/g, '').trim().slice(0, 30);
function splitTags(v) {
  const s = String(v == null ? '' : v).trim(); if (!s) return [];
  const parts = /[,;|\n]/.test(s) ? s.split(/[,;|\n]+/) : s.split(/\s+/);
  return parts.map(cleanTag).filter(Boolean).filter((t, i, a) => a.indexOf(t) === i).slice(0, 10);
}
const EMAIL = /^[^\s@<>",;]+@[^\s@<>",;]+\.[^\s@<>",;]{2,}$/;
const pickEmail = (s) => { const m = String(s || '').match(/[^\s@<>",;()]+@[^\s@<>",;()]+\.[^\s@<>",;()]{2,}/); return m ? m[0].toLowerCase() : ''; };

// One CSV row -> { skip:'reason' } or { ticket:{...fields} }. `raw` is the row as an object keyed by (lower-cased) column name; `map` is { field: column }.
function normalizeRow(raw, map, opts) {
  opts = opts || {}; const get = (f) => (map && map[f] && raw[map[f]] != null ? String(raw[map[f]]).trim() : '');
  const source = SOURCES[opts.source] ? opts.source : 'other';
  let email = pickEmail(get('email')) || pickEmail(get('name'));
  if (!email || !EMAIL.test(email)) return { skip: 'no customer email' };
  const st = statusFrom(get('status')); if (st.id === '__skip') return { skip: 'spam or deleted' };
  const subject = htmlToText(get('subject')).replace(/\s+/g, ' ').slice(0, 300) || '(No subject)';
  let name = htmlToText(get('name')); if (!name || name.includes('@')) name = email.split('@')[0]; name = name.slice(0, 80);
  const body = htmlToText(get('body')).slice(0, 20000);
  const created = parseDate(get('created'), opts.dateOrder), updated = parseDate(get('updated'), opts.dateOrder), resolved = parseDate(get('resolved'), opts.dateOrder);
  const createdMs = created || updated || resolved || null;
  const externalId = get('externalId').replace(/[^\w#.\-]/g, '').slice(0, 40);
  const key = externalId ? source + ':' + externalId : source + ':h:' + crypto.createHash('sha1').update(email + '|' + subject + '|' + (createdMs || '') + '|' + body.slice(0, 80)).digest('hex').slice(0, 16);
  return { ticket: { externalId, externalKey: key, subject, email, name, body, status: st.id, statusUnknown: st.known ? '' : st.raw, priority: priorityFrom(get('priority')), createdMs, updatedMs: updated, resolvedMs: resolved, assignee: get('assignee').slice(0, 120), tags: splitTags(get('tags')), noDate: !createdMs } };
}

module.exports = { SOURCES, FIELDS, detectSource, autoMap, normalizeRow, parseDate, statusFrom, priorityFrom, htmlToText, splitTags, toIST, EMAIL };
