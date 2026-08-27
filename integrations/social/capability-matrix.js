// Platform capability matrix — the single source of truth for what each
// adapter can actually do. Nothing here is hardcoded into the gateway or the
// ticket engine; UI and gateway logic both read from this file so a platform
// limitation shows up as "unsupported" in the product instead of a silent
// failure or a workaround that violates a platform's terms of service.
//
// IMPORTANT: platform APIs change. This reflects official documentation as
// of this writing (Aug 2026) to the best available knowledge. Before
// enabling any "true" capability in production, re-check that platform's
// current developer docs per your own Section 32 rule — rate limits,
// required scopes, and app-review requirements shift over time, and this
// file is the one place to update when they do.

const CAPABILITIES = {
  instagram: {
    label: 'Instagram Professional/Business',
    phase: 1,
    authType: 'oauth', // Meta OAuth (Facebook Login for Business), account must be linked to a Facebook Page
    capturePosts: true,
    captureComments: true,
    captureCommentReplies: true,
    captureMentions: 'supported', // @mentions in comments/stories, requires instagram_manage_comments + additional review
    captureDMs: true, // Instagram Messaging API
    replyToComments: true,
    replyToDMs: true,
    webhooks: true, // via Meta App webhooks (comments, mentions, messages)
    pollingRequired: false,
    requiredScopes: ['instagram_basic', 'instagram_manage_comments', 'instagram_manage_messages', 'pages_show_list', 'pages_read_engagement'],
    requiresBusinessVerification: true,
    requiresAppReview: true, // Advanced Access for most scopes above development mode
    rateLimits: 'Platform rate limit (calls per hour scales with app usage tier) — confirm current tier limits in Meta App Dashboard before high-volume use.',
    costNotes: 'Free via Meta Graph API. No official Meta fee for messaging; infra/hosting cost only.',
    knownRestrictions: [
      'Requires a Facebook Page linked to the Instagram professional account — cannot connect an Instagram account with no linked Page.',
      'DM access requires the business to respond within Meta\'s messaging window rules (24-hour standard reply window, with tagged exceptions).',
      'Only comments/DMs on the connected account\'s own content are receivable — no public search.',
    ],
  },
  facebook: {
    label: 'Facebook Page',
    phase: 1,
    authType: 'oauth', // Facebook Login for Business
    capturePosts: true,
    captureComments: true,
    captureCommentReplies: true,
    captureMentions: 'supported',
    captureDMs: true, // Messenger Platform
    replyToComments: true,
    replyToDMs: true,
    webhooks: true,
    pollingRequired: false,
    requiredScopes: ['pages_show_list', 'pages_read_engagement', 'pages_manage_metadata', 'pages_messaging'],
    requiresBusinessVerification: true,
    requiresAppReview: true,
    rateLimits: 'Platform rate limit tied to Page engagement volume — confirm in Meta App Dashboard.',
    costNotes: 'Free via Graph API / Messenger Platform.',
    knownRestrictions: [
      'Messenger 24-hour standard messaging window applies to page replies outside of tagged exceptions.',
      'Page must be verified/owned by the connecting business, not a personal profile.',
    ],
  },
  whatsapp: {
    label: 'WhatsApp Business',
    phase: 1,
    authType: 'reuse-existing', // Resolvo already has a working Twilio-based WhatsApp integration (whatsappConfig) — the social adapter wraps it rather than building a second, competing WhatsApp integration.
    capturePosts: false,
    captureComments: false,
    captureCommentReplies: false,
    captureMentions: false,
    captureDMs: true, // messages
    replyToComments: false,
    replyToDMs: true,
    webhooks: true,
    pollingRequired: false,
    requiredScopes: ['N/A — uses existing Twilio Account SID/Auth Token/WhatsApp number already configured under Settings → Email & Ticketing → WhatsApp'],
    requiresBusinessVerification: true, // required by Meta/Twilio for a production WhatsApp Business number, already satisfied by the existing integration
    requiresAppReview: false,
    rateLimits: 'Twilio + Meta conversation-based pricing tiers; see existing WhatsApp settings notes.',
    costNotes: 'Per-conversation pricing via Twilio/Meta — same as the existing WhatsApp integration, no new cost from this feature.',
    knownRestrictions: [
      'This adapter intentionally reuses the existing whatsappConfig/Twilio integration rather than adding a second WhatsApp connection path.',
      '24-hour customer service window for free-form replies; template messages required outside that window (same Meta policy as before).',
    ],
  },
  youtube: {
    label: 'YouTube',
    phase: 2,
    authType: 'oauth', // Google OAuth
    capturePosts: false, // videos are not "captured" as conversations
    captureComments: true, // YouTube Data API v3 CommentThreads
    captureCommentReplies: true,
    captureMentions: false,
    captureDMs: false, // YouTube has no general-purpose DM API for business accounts
    replyToComments: true,
    replyToDMs: false,
    webhooks: false, // YouTube Data API has no push webhook for comments — polling required
    pollingRequired: true,
    requiredScopes: ['https://www.googleapis.com/auth/youtube.force-ssl'],
    requiresBusinessVerification: false,
    requiresAppReview: true, // OAuth verification for sensitive scopes if app is public
    rateLimits: 'YouTube Data API v3 daily quota (default 10,000 units/day; comment list/insert cost a few units each) — request a quota increase for high-volume use.',
    costNotes: 'Free within quota; quota increase requests reviewed by Google, no direct monetary cost.',
    knownRestrictions: [
      'No webhook support — this adapter must poll comments periodically, unlike the other Phase 1/2 platforms.',
      'No native DM capability for channel-to-viewer messaging.',
    ],
  },
  telegram: {
    label: 'Telegram',
    phase: 2,
    authType: 'bot-token', // No OAuth, no app review — a bot token from @BotFather is sufficient
    capturePosts: false,
    captureComments: true, // comments on a linked Discussion Group
    captureCommentReplies: true,
    captureMentions: true,
    captureDMs: true, // direct messages to the bot
    replyToComments: true,
    replyToDMs: true,
    webhooks: true, // setWebhook — real, simple, no review process
    pollingRequired: false,
    requiredScopes: ['N/A — bot token only'],
    requiresBusinessVerification: false,
    requiresAppReview: false,
    rateLimits: '~30 messages/second broadcast limit, 1 message/second per chat recommended by Telegram Bot API docs.',
    costNotes: 'Free — Telegram Bot API has no official fee.',
    knownRestrictions: [
      'A customer must message the bot first (or the bot must be added to a group/channel) — Telegram does not allow unsolicited outbound messages to arbitrary users.',
    ],
  },
  linkedin: {
    label: 'LinkedIn Company Page',
    phase: 3,
    authType: 'oauth',
    capturePosts: true,
    captureComments: true,
    captureCommentReplies: 'supported', // via Social Actions API, restricted access tier
    captureMentions: false,
    captureDMs: false, // LinkedIn Messaging API is not generally available to third-party business apps
    replyToComments: true,
    replyToDMs: false,
    webhooks: false, // LinkedIn does not offer webhooks for organic comment events on standard API access
    pollingRequired: true,
    requiredScopes: ['r_organization_social', 'w_organization_social', 'rw_organization_admin'],
    requiresBusinessVerification: true, // LinkedIn Marketing Developer Platform program approval required
    requiresAppReview: true,
    rateLimits: 'Application-level daily throttle set per LinkedIn Developer Program tier — historically restrictive for non-partner apps.',
    costNotes: 'Free API access, but the Marketing Developer Platform approval process can take weeks and is not guaranteed.',
    knownRestrictions: [
      'DM capture/reply is marked unsupported — LinkedIn Messaging API access is not realistically available to a general SaaS integration today.',
      'Requires LinkedIn Developer Program partner approval before organization social endpoints activate — this is a real, possibly weeks-long external dependency.',
    ],
  },
  x: {
    label: 'X (Twitter)',
    phase: 3,
    authType: 'oauth2',
    capturePosts: true,
    captureComments: true, // replies to the connected account's posts
    captureCommentReplies: true,
    captureMentions: true,
    captureDMs: true, // Direct Message API, requires paid API tier
    replyToComments: true,
    replyToDMs: true,
    webhooks: false, // Account Activity API (webhook-based) was deprecated for most tiers; current X API v2 requires polling for most endpoints
    pollingRequired: true,
    requiredScopes: ['tweet.read', 'tweet.write', 'users.read', 'dm.read', 'dm.write', 'offline.access'],
    requiresBusinessVerification: false,
    requiresAppReview: false,
    rateLimits: 'Tiered paid API (Free/Basic/Pro/Enterprise) — mention/reply/DM volume is gated by paid tier, not just app review.',
    costNotes: 'X API pricing is a real, material monthly cost at the tiers needed for mentions + DMs (Basic tier and above) — this is a budget decision, not just a technical integration.',
    knownRestrictions: [
      'Free tier does not include the endpoints this feature needs (mentions, DMs) — a paid API plan is a hard requirement, not optional.',
      'No webhook/push option at accessible tiers — this adapter must poll.',
    ],
  },
};

// Event types every adapter maps its native events into (Section 8).
const EVENT_TYPES = ['POST', 'COMMENT', 'COMMENT_REPLY', 'MENTION', 'DM', 'DM_REPLY', 'MESSAGE', 'REACTION', 'OTHER'];

function getCapabilities(platform) {
  return CAPABILITIES[platform] || null;
}

module.exports = { CAPABILITIES, EVENT_TYPES, getCapabilities };
