// Single import point for the Social Gateway feature — server.js requires
// this one file rather than reaching into integrations/social/* directly.

const { createSocialGateway } = require('./gateway');
const { CAPABILITIES, EVENT_TYPES, getCapabilities } = require('./capability-matrix');
const { encryptSecret, decryptSecret, maskSecret } = require('./crypto');

const adapters = {
  instagram: require('./instagram-adapter'),
  facebook: require('./facebook-adapter'),
  whatsapp: require('./whatsapp-adapter'),
  'whatsapp-cloud': require('./whatsapp-cloud-adapter'),
  telegram: require('./telegram-adapter'),
  youtube: require('./youtube-adapter'),
  linkedin: require('./linkedin-adapter'),
  x: require('./x-adapter'),
};

module.exports = {
  createSocialGateway,
  CAPABILITIES, EVENT_TYPES, getCapabilities,
  encryptSecret, decryptSecret, maskSecret,
  adapters,
};
