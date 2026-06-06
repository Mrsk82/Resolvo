const fs = require('fs');
let html = fs.readFileSync('public/pitch.html', 'utf8');

// 1. Bigger nav logo: 34 → 46
html = html.replace(
  'viewBox="0 0 520 100" height="34" width="auto"',
  'viewBox="0 0 520 100" height="46" width="auto"'
);

// 2. Nav link → pitch page
html = html.replace(
  '<a href="#home" style="text-decoration:none;display:flex;align-items:center;">',
  '<a href="/pitch" style="text-decoration:none;display:flex;align-items:center;" title="Resolvo Home">'
);

// 3. Add BIG logo in hero before hero-badge
const heroBadge = '    <div class="hero-badge fade">⚡ AI-Powered Issue &amp; Support Platform</div>';
const bigLogoBlock = `    <!-- HERO BIG LOGO -->
    <div class="fade" style="margin-bottom:40px;">
      <a href="/pitch" style="display:inline-block;text-decoration:none;">
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 520 120" width="340" height="auto" style="display:block;">
          <rect width="100%" height="100%" rx="10" fill="#0B0F19"/>
          <g transform="translate(10, 0)">
            <path d="M 35,35 C 55,35 60,45 75,52" fill="none" stroke="#FF4B4B" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
            <circle cx="35" cy="35" r="3.5" fill="#FF4B4B"/>
            <path d="M 30,60 L 75,60" fill="none" stroke="#FF4B4B" stroke-width="2.5" stroke-linecap="round" stroke-dasharray="4 3" opacity="0.55"/>
            <circle cx="30" cy="60" r="3" fill="#FF4B4B" opacity="0.55"/>
            <path d="M 35,85 C 55,85 60,75 75,68" fill="none" stroke="#FF4B4B" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
            <circle cx="35" cy="85" r="3.5" fill="#FF4B4B"/>
            <polygon points="70,60 82,50 94,60 82,70" fill="url(#lg-ai)"/>
            <circle cx="82" cy="60" r="2" fill="#FFFFFF"/>
            <path d="M 94,60 L 104,70 L 124,42" fill="none" stroke="#10B981" stroke-width="8" stroke-linecap="round" stroke-linejoin="round"/>
          </g>
          <text x="160" y="68" font-family="JetBrains Mono,Courier New,monospace" font-size="42" font-weight="700" fill="#FFFFFF" letter-spacing="-1">resolv</text>
          <text x="312" y="68" font-family="JetBrains Mono,Courier New,monospace" font-size="42" font-weight="700" fill="#10B981" letter-spacing="-1">o</text>
          <text x="163" y="90" font-family="Inter,sans-serif" font-size="11" font-weight="500" fill="#64748B" letter-spacing="3">FROM CHAOS TO CLARITY</text>
        </svg>
      </a>
    </div>
    <div class="hero-badge fade">⚡ AI-Powered Issue &amp; Support Platform</div>`;

html = html.replace(heroBadge, bigLogoBlock);

// 4. Bigger footer logo 28 → 36
html = html.replace(
  'viewBox="0 0 200 40" height="28" width="auto"',
  'viewBox="0 0 200 40" height="36" width="auto"'
);

// 5. Wrap footer logo in link
html = html.replace(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" height="36" width="auto">',
  '<a href="/pitch" style="text-decoration:none;"><svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 40" height="36" width="auto">'
);
// Close the link after the footer SVG (find the </svg> after the footer logo and add </a>)
html = html.replace(
  '</svg>\n  <div style="font-size:12px;color:var(--dim);">AI-Powered',
  '</svg></a>\n  <div style="font-size:12px;color:var(--dim);">AI-Powered'
);

fs.writeFileSync('public/pitch.html', html);
console.log('Pitch logo updated — big hero logo + nav/footer links');
