# Growth set-up guide

What is already built into Resolvo, and the few things only you can do (they need your Google or Bing login).

## What Resolvo counts by itself (no set-up)

- **Visits:** every public page view is counted without cookies and without storing IP addresses. See Owner Console, Growth tab: visits per day, top pages, where visitors came from, phone versus computer.
- **Where leads come from:** every sign-up, demo request, design-partner application and contact message is saved with its source, medium and campaign.
- **Funnel:** signed up, activated, email or WhatsApp connected, first reply sent, still using it a week later. Test and demo workspaces are left out. People who are stuck are listed so you can message them personally.
- **Monday email:** a weekly summary sent to the owner email at 09:00. Switch it off or send one now from the Growth tab.
- **Tagged links:** the link builder at the bottom of the Growth tab produces links like `https://app.resolvogroup.com/?utm_source=linkedin&utm_medium=social&utm_campaign=nov-launch`.

Visitors who decline the cookie choice are still counted by the cookie-free counter, but not by Google Analytics.

## One-time set-up you do

### 1. Google Search Console (search visibility)
1. Open https://search.google.com/search-console and add the property `https://app.resolvogroup.com` (URL prefix).
2. Verify with the **HTML tag** method. Send the tag to Claude and it will be placed in the site head. Or use DNS verification at your domain provider.
3. Under **Sitemaps** add `sitemap.xml`. It lists every public page.
4. After a week open **Performance** and note which searches show impressions. Pages with impressions but few clicks need a better title or description.

### 2. Bing Webmaster Tools
1. Open https://www.bing.com/webmasters and choose **Import from Google Search Console**. It copies the property and sitemap.

### 3. Google Analytics 4 (only if you want it besides the built-in counter)
Resolvo already loads Google Analytics, but only after a visitor accepts the cookie choice. In GA4:
1. Admin, Events: mark `generate_lead` and `sign_up` as **key events**. Resolvo sends these when a form is submitted.
2. Other events Resolvo sends: `cta_signup`, `cta_demo`, `cta_partners`, `click_email`, `whatsapp_click`, `download_android_app`, `form_start`, `view_pricing`. Each carries a `location` (where on the page) or `form` name.
3. Do not add Google Signals or ad personalisation unless the privacy page is updated first.

### 4. Business profiles
Fill in the details from `listings-copy.md` on LinkedIn company page, Google Business Profile (if you have a registered address), and the software directories listed there. Always use tagged links so visits are attributed.

## Naming rules for tagged links (keep it boring)

| Part | Rule | Examples |
|---|---|---|
| `utm_source` | where the link is posted | `linkedin`, `whatsapp`, `cold-email`, `partner-name`, `directory-name` |
| `utm_medium` | kind of channel | `social`, `email`, `referral`, `directory`, `dm` |
| `utm_campaign` | what it is for, lowercase, dashes | `nov-launch`, `oct-2026-50`, `design-partners` |

Never put a person's name, email or phone number in a link.

## Reading the numbers honestly
- Fewer than about 30 visits per source in a week is noise. Look for direction, not precision.
- One visitor on two devices is counted twice, and visitors are counted once per day, never across days.
- A source with sign-ups is more useful than a source with visits.
