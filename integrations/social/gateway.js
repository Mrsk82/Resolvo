// The Social Gateway — the one place a normalized social event turns into a
// ticket. Adapters never touch db.tickets directly; they only produce
// UniversalSocialMessage objects and hand them to processEvent(). This is
// what keeps platform-specific logic out of the ticketing engine (Section 4).
//
// Dependency-injected rather than require()-ing server.js directly, to avoid
// a circular require (server.js requires this module) and to make it
// explicit that the gateway reuses Resolvo's EXISTING ticket/automation
// engine rather than re-implementing it.

function createSocialGateway(deps) {
  const { readBrandDB, writeBrandDB, generateId, nowIST, runAutomationRules } = deps;

  // In-memory recent-event dedup (per process). Combined with the persisted
  // check against db.socialEvents below, this catches redelivery within the
  // same request burst before it ever touches the DB.
  const recentlySeen = new Map(); // key: tenant+channel+message_id -> timestamp
  const DEDUP_WINDOW_MS = 5 * 60 * 1000;

  function dedupKey(msg) {
    return `${msg.tenant_id}:${msg.channel}:${msg.message_id}`;
  }

  function isDuplicate(db, msg) {
    const key = dedupKey(msg);
    const seenAt = recentlySeen.get(key);
    if (seenAt && Date.now() - seenAt < DEDUP_WINDOW_MS) return true;
    // Persisted check survives process restarts — db.socialEvents is an
    // append-only log of processed message_ids, capped to the last 5000.
    const log = db.socialEvents || [];
    return log.some(e => e.channel === msg.channel && e.message_id === msg.message_id);
  }

  function markSeen(db, msg, ticketId, status) {
    recentlySeen.set(dedupKey(msg), Date.now());
    db.socialEvents = db.socialEvents || [];
    db.socialEvents.push({
      channel: msg.channel, message_id: msg.message_id, event_type: msg.event_type,
      ticketId, status, processedAt: nowIST(), processing_delay_ms: msg.processing_delay_ms,
    });
    if (db.socialEvents.length > 5000) db.socialEvents = db.socialEvents.slice(-5000);
  }

  // The customer-facing identifier used as ticket.from for social channels:
  // "<platform>:<sender_id>" — kept out of email/phone normalization entirely
  // (see the server.js _normalizeIdentifier extension) since platform user
  // IDs are neither.
  function socialIdentifier(msg) {
    return `${msg.channel}:${msg.sender_id}`;
  }

  // One UniversalSocialMessage in → ticket created or updated. This mirrors
  // the exact pattern already used for WhatsApp/SMS webhooks in server.js
  // (find open ticket for this identifier, append or create) — Section 12.
  function processEvent(slug, msg) {
    const db = readBrandDB(slug);

    if (isDuplicate(db, msg)) {
      return { duplicate: true, ticketId: null };
    }

    const from = socialIdentifier(msg);
    db.tickets = db.tickets || [];
    const existingIdx = db.tickets.findIndex(t =>
      t.channel === msg.channel && t.from === from && !['resolved', 'closed'].includes(t.status)
    );

    const threadEntry = {
      id: generateId('MSG'),
      type: 'incoming',
      from,
      fromName: msg.sender_name || msg.sender_username || from,
      body: msg.message_text || '(media message)',
      timestamp: nowIST(),
      channel: msg.channel,
      social: {
        event_type: msg.event_type,
        message_id: msg.message_id,
        post_id: msg.post_id,
        media: msg.media || [],
        platform_created_at: msg.platform_created_at,
        platform_received_at: msg.platform_received_at,
        resolvio_processed_at: msg.resolvio_processed_at,
        processing_delay_ms: msg.processing_delay_ms,
      },
    };

    let ticketId;
    if (existingIdx >= 0) {
      ticketId = db.tickets[existingIdx].id;
      db.tickets[existingIdx].thread = db.tickets[existingIdx].thread || [];
      db.tickets[existingIdx].thread.push(threadEntry);
      db.tickets[existingIdx].lastActivity = nowIST();
      // A closed/resolved conversation getting a new inbound message re-opens it
      if (['resolved', 'closed'].includes(db.tickets[existingIdx].status)) {
        db.tickets[existingIdx].status = 'open';
      }
    } else {
      ticketId = generateId('TKT');
      const subject = `${capabilityLabel(msg.channel)}: ${(msg.message_text || msg.event_type).substring(0, 60)}`;
      const newTicket = {
        id: ticketId, subject, from, fromName: msg.sender_name || msg.sender_username || from,
        channel: msg.channel, channelAccountId: msg.channel_account_id,
        status: 'new', priority: 'Medium',
        createdDate: nowIST(), lastActivity: nowIST(),
        tags: [msg.channel],
        thread: [threadEntry],
      };
      // Same lexicon-based analyzer every other channel uses — one sentiment
      // engine for the whole app, not a social-specific reimplementation.
      const { analyzeSentiment } = require('../sentiment');
      const s = analyzeSentiment(msg.message_text || '');
      newTicket.sentimentScore = s.score;
      newTicket.sentimentLevel = s.level;
      if (s.level === 'negative' && s.score <= 15) newTicket.priority = 'Critical';
      db.tickets.unshift(newTicket);
    }

    writeBrandDB(slug, db);
    markSeen(db, msg, ticketId, existingIdx >= 0 ? 'appended' : 'created');
    writeBrandDB(slug, db); // persist the dedup log entry too

    if (existingIdx < 0) {
      // Same automation hook every other channel already fires on new-ticket —
      // channel/sentiment/messageContains conditions all work with zero
      // gateway-side special-casing (Section 18).
      runAutomationRules(slug, ticketId, 'ticket_created').catch(() => {});
    }

    return { duplicate: false, ticketId, isNew: existingIdx < 0 };
  }

  function capabilityLabel(channel) {
    const { getCapabilities } = require('./capability-matrix');
    const cap = getCapabilities(channel);
    return cap ? cap.label : channel;
  }

  return { processEvent, socialIdentifier, isDuplicate };
}

module.exports = { createSocialGateway };
