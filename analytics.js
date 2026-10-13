// Google Analytics 4 with Consent Mode v2.
// Visitors in the EU/EEA, UK and Switzerland default to no analytics cookies (cookieless pings only);
// everyone else is measured normally. Ad storage is off for everyone: this site runs no ads.
window.dataLayer = window.dataLayer || [];
function gtag() { dataLayer.push(arguments); }

const optInRegions = ['AT', 'BE', 'BG', 'HR', 'CY', 'CZ', 'DK', 'EE', 'FI', 'FR', 'DE', 'GR', 'HU', 'IE', 'IT', 'LV',
  'LT', 'LU', 'MT', 'NL', 'PL', 'PT', 'RO', 'SK', 'SI', 'ES', 'SE', 'IS', 'LI', 'NO', 'GB', 'CH'];
const noAds = { ad_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' };
gtag('consent', 'default', { ...noAds, analytics_storage: 'denied', region: optInRegions });
gtag('consent', 'default', { ...noAds, analytics_storage: 'granted' });

gtag('js', new Date());
gtag('config', 'G-P1TN0Q1EMW');

// Every email link is a lead: "Start a project", the contact heading, the intro call button
document.addEventListener('click', (e) => {
  const link = e.target.closest?.('a[href^="mailto:"]');
  if (!link) return;
  gtag('event', 'generate_lead', { link_text: link.textContent.trim().slice(0, 60), link_location: link.closest('section, header, footer')?.id || link.closest('header, footer')?.tagName.toLowerCase() || 'page' });
});
