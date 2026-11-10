// Ticket import, the file-reading logic on its own (lib/ticket-import.js): dates, column detection, status and priority, HTML clean-up, tags, duplicates.
// Run: node docs/ui-redesign/tools/ticket_import_unit_test.js
const path = require('path');
const L = require(path.join(__dirname, '..', '..', '..', 'lib', 'ticket-import.js'));
let pass = 0, fail = 0;
const check = (n, ok, d) => { ok ? pass++ : fail++; console.log((ok ? 'PASS  ' : 'FAIL  ') + n + (!ok && d !== undefined ? '  -> ' + JSON.stringify(d).slice(0, 300) : '')); };
const ist = (s, o) => { const m = L.parseDate(s, o); return m == null ? null : L.toIST(m).slice(0, 16); };

// ---- dates ----
check('date: plain date and time is read as India time', ist('2024-01-15 10:30:00') === '2024-01-15T10:30');
check('date: an explicit Z (UTC) is converted to India time', ist('2024-01-15T10:30:00Z') === '2024-01-15T16:00');
check('date: an explicit +05:30 stays as it is', ist('2024-01-15T10:30:00+05:30') === '2024-01-15T10:30');
check('date: a US offset is converted', ist('2024-01-15T10:30:00-05:00') === '2024-01-15T21:00');
check('date: day first by default (03/04/2024 is 3 April)', ist('03/04/2024') === '2024-04-03T00:00');
check('date: month first when asked (03/04/2024 is March 4)', ist('03/04/2024', 'mdy') === '2024-03-04T00:00');
check('date: a number above 12 settles which is the day, whatever the setting', ist('25/04/2024', 'mdy') === '2024-04-25T00:00' && ist('04/25/2024', 'dmy') === '2024-04-25T00:00');
check('date: 12-hour clock with PM and AM', ist('04/25/2024 09:05 PM') === '2024-04-25T21:05' && ist('15/01/2024 12:15 AM') === '2024-01-15T00:15' && ist('15/01/2024 12:15 PM') === '2024-01-15T12:15');
check('date: Freshdesk style "Mon, 15 Jan, 2024 at 10:30 AM"', ist('Mon, 15 Jan, 2024 at 10:30 AM') === '2024-01-15T10:30');
check('date: "Jan 15, 2024 10:30 AM" and "15 January 2024 10:30" and "15th Jan 2024"', ist('Jan 15, 2024 10:30 AM') === '2024-01-15T10:30' && ist('15 January 2024 10:30') === '2024-01-15T10:30' && ist('15th Jan 2024') === '2024-01-15T00:00');
check('date: long weekday and month names', ist('Tuesday, January 16, 2024 3:05 PM') === '2024-01-16T15:05');
check('date: seconds and milliseconds since 1970', ist('1705294800') === '2024-01-15T10:30' && ist('1705294800000') === '2024-01-15T10:30');
check('date: nonsense, impossible and empty values give nothing', ist('nonsense') === null && ist('2024-13-45') === null && ist('') === null && ist('31/02/2024 25:00') === null);
check('date: far-future and ancient dates are refused', ist('2099-01-01') === null && ist('1980-01-01') === null);

// ---- columns ----
check('source: Zendesk export', L.detectSource(['ID', 'Requester', 'Requester email', 'Subject', 'Status', 'Priority', 'Solved at']) === 'zendesk');
check('source: Freshdesk export', L.detectSource(['Ticket ID', 'Subject', 'Status', 'Priority', 'Created time', 'Agent', 'Resolved time']) === 'freshdesk');
check('source: Help Scout export', L.detectSource(['Conversation Number', 'Customer Email', 'Subject', 'Status']) === 'helpscout');
check('source: anything else', L.detectSource(['a', 'b']) === 'other');
const zm = L.autoMap(['ID', 'Requester', 'Requester email', 'Requested', 'Subject', 'Status', 'Priority', 'Assignee', 'Solved at', 'Tags']);
check('columns: Zendesk names are matched to the right fields', zm.email === 'Requester email' && zm.name === 'Requester' && zm.externalId === 'ID' && zm.created === 'Requested' && zm.resolved === 'Solved at' && zm.assignee === 'Assignee' && zm.tags === 'Tags' && zm.subject === 'Subject', zm);
const fm = L.autoMap(['Ticket ID', 'Subject', 'Description', 'Status', 'Priority', 'Created time', 'Last update time', 'Resolved time', 'Agent', 'Requester Email', 'Requester Name', 'Tags']);
check('columns: Freshdesk names are matched', fm.externalId === 'Ticket ID' && fm.body === 'Description' && fm.created === 'Created time' && fm.updated === 'Last update time' && fm.resolved === 'Resolved time' && fm.assignee === 'Agent' && fm.email === 'Requester Email' && fm.name === 'Requester Name', fm);
const lm = L.autoMap(['SUBJECT', 'customer_email', 'created_at']);
check('columns: upper case, underscores and dashes are fine, a column is used once', lm.subject === 'SUBJECT' && lm.email === 'customer_email' && lm.created === 'created_at' && Object.values(lm).filter(Boolean).length === 3, lm);
check('columns: no email column found gives an empty email mapping', L.autoMap(['Subject', 'Status']).email === '');

// ---- status and priority ----
const st = (v) => L.statusFrom(v).id;
check('status: Zendesk words', st('new') === 'new' && st('open') === 'open' && st('pending') === 'pending' && st('hold') === 'on-hold' && st('solved') === 'resolved' && st('closed') === 'closed');
check('status: Freshdesk and Help Scout words', st('Waiting on Customer') === 'pending' && st('Waiting on Third Party') === 'on-hold' && st('Resolved') === 'resolved' && st('active') === 'open');
check('status: unknown becomes Open and is reported', L.statusFrom('Weird state').id === 'open' && L.statusFrom('Weird state').known === false && L.statusFrom('Weird state').raw === 'Weird state');
check('status: spam and deleted are skipped', st('spam') === '__skip' && st('Deleted') === '__skip');
const pr = L.priorityFrom;
check('priority: low, normal, high, urgent and the others', pr('low') === 'Low' && pr('Normal') === 'Medium' && pr('High') === 'High' && pr('Urgent') === 'Critical' && pr('P1') === 'Critical' && pr('') === 'Medium' && pr('weird') === 'Medium');

// ---- rows ----
const map = { externalId: 'id', subject: 'subject', email: 'email', name: 'name', body: 'body', status: 'status', priority: 'priority', created: 'created', updated: 'updated', resolved: 'solved', assignee: 'agent', tags: 'tags' };
const row = (o) => ({ id: '42', subject: 'Order  not\n arrived', email: 'Asha <ASHA@Example.com>', name: 'Asha Rao', body: '<p>Hello&nbsp;team,</p><p>My order &amp; invoice are <b>missing</b></p><script>alert(1)</script>', status: 'Solved', priority: 'Urgent', created: '15/01/2024 10:30', updated: '16/01/2024 09:00', solved: '16/01/2024 09:00', agent: 'Sam', tags: 'refund vip,Late Order', ...o });
let r = L.normalizeRow(row(), map, { source: 'zendesk', dateOrder: 'dmy' }), t = r.ticket;
check('row: email is pulled out of "Name <email>" and lower-cased', t && t.email === 'asha@example.com', r);
check('row: subject is tidied to one line', t.subject === 'Order not arrived', t.subject);
check('row: HTML in the message becomes plain text, scripts removed', t.body === 'Hello team,\n\nMy order & invoice are missing\nalert(1)' || (!/<|>/.test(t.body) && /missing/.test(t.body) && !/script/i.test(t.body.replace('alert(1)', ''))), t.body);
check('row: status, priority and dates are converted', t.status === 'resolved' && t.priority === 'Critical' && L.toIST(t.createdMs).startsWith('2024-01-15T10:30') && L.toIST(t.resolvedMs).startsWith('2024-01-16T09:00'), [t.status, t.priority]);
check('row: tags are split, lower-cased and cleaned', JSON.stringify(t.tags) === JSON.stringify(['refund vip', 'late order']), t.tags);
check('row: comma-separated tags with spaces stay together', JSON.stringify(L.splitTags('Late Order, refund')) === JSON.stringify(['late order', 'refund']) && JSON.stringify(L.splitTags('a b c')) === JSON.stringify(['a', 'b', 'c']));
check('row: a stable key from the old ticket number', t.externalKey === 'zendesk:42' && t.externalId === '42');
const a1 = L.normalizeRow(row({ id: '' }), map, { source: 'zendesk' }).ticket, a2 = L.normalizeRow(row({ id: '' }), map, { source: 'zendesk' }).ticket, a3 = L.normalizeRow(row({ id: '', subject: 'Different' }), map, { source: 'zendesk' }).ticket;
check('row: without a ticket number the key comes from the content (same row = same key, different row = different key)', a1.externalKey === a2.externalKey && a1.externalKey !== a3.externalKey && /^zendesk:h:/.test(a1.externalKey));
check('row: a different help desk gives a different key for the same number', L.normalizeRow(row(), map, { source: 'freshdesk' }).ticket.externalKey === 'freshdesk:42');
check('row: no email means the row is skipped, with a reason', L.normalizeRow(row({ email: '', name: 'Asha' }), map, {}).skip === 'no customer email' && L.normalizeRow(row({ email: 'not an email', name: 'x' }), map, {}).skip === 'no customer email');
check('row: the email can be in the name column', L.normalizeRow(row({ email: '', name: 'bob@example.org' }), map, {}).ticket.email === 'bob@example.org');
check('row: spam and deleted rows are skipped', L.normalizeRow(row({ status: 'spam' }), map, {}).skip === 'spam or deleted');
const nd = L.normalizeRow(row({ created: '??', updated: '', solved: '' }), map, {}).ticket;
check('row: unreadable dates are flagged, not guessed', nd.noDate === true && nd.createdMs === null);
const nb = L.normalizeRow(row({ body: '' }), map, {}).ticket;
check('row: a missing message is an empty body (the server adds a note saying so)', nb.body === '');
const big = L.normalizeRow(row({ body: 'x'.repeat(50000), subject: 's'.repeat(900), name: 'n'.repeat(500) }), map, {}).ticket;
check('row: very long text is cut to safe sizes', big.body.length === 20000 && big.subject.length === 300 && big.name.length <= 80);
check('row: unknown source is treated as "other"', L.normalizeRow(row({ id: '7' }), map, { source: '<script>' }).ticket.externalKey === 'other:7');
check('row: control characters are removed from text', !/[\u0000-\u0008]/.test(L.normalizeRow(row({ body: 'a\u0001b\u0000c' }), map, {}).ticket.body));
const xs = L.normalizeRow(row({ subject: '<img src=x onerror=alert(1)>Help' }), map, {}).ticket;
check('row: markup in the subject is stripped', !/[<>]/.test(xs.subject) && /Help/.test(xs.subject), xs.subject);

console.log(`\n${pass} passed, ${fail} failed`); process.exit(fail ? 1 : 0);
