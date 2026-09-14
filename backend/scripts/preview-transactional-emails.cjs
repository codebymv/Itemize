// Build first: npm run build:graphql. Then run this script with Node.
// Synthetic fixtures only: no database connection and no outbound email.
const http = require('node:http');
const { brandedTransactionalEmail } = require('../dist/common/branded-transactional-email.js');
const { enqueueBookingNotification } = require('../dist/bookings/booking-notification.js');

function renderPreviews(cases) {
  const results = [];
  for (const [name, html] of Object.entries(cases)) {
    for (const width of [320, 375, 390, 600]) {
      const section = document.createElement('section');
      const heading = document.createElement('h2');
      heading.textContent = `${name} ${width}px`;
      const frame = document.createElement('iframe');
      frame.width = width;
      frame.title = `${name} ${width}`;
      frame.srcdoc = html;
      frame.onload = () => {
        const document = frame.contentDocument;
        const actual = document.documentElement.scrollWidth;
        results.push({ name, width, actual, overflow: actual > width });
        window.document.querySelector('#results').textContent = JSON.stringify({
          total: results.length,
          expected: Object.keys(cases).length * 4,
          failures: results.filter(result => result.overflow),
        }, null, 2);
      };
      section.append(heading, frame);
      document.querySelector('#frames').append(section);
    }
  }
}

async function main() {
  const cases = {};
  for (const stress of [false, true]) {
    const row = {
      attendee_email: 'qa@example.com', contact_id: null,
      start_time: new Date('2026-09-17T18:00:00Z'),
      end_time: new Date('2026-09-17T18:30:00Z'),
      timezone: 'America/Phoenix',
      calendar_name: stress ? 'CustomerWorkshop'.repeat(6) : 'QA booking journey',
      organization_name: stress ? 'CreativeStudio'.repeat(6) : 'Itemize QA',
      organizer_email: stress
        ? 'customer.support.and.scheduling.for.our.studio@example.com'
        : 'qa@example.com',
    };
    for (const event of ['confirmed', 'rescheduled', 'cancelled']) {
      const client = {
        query: async (sql, args) => {
          if (sql.startsWith('SELECT')) return { rows: [row] };
          cases[event + (stress ? '-long' : '')] = JSON.parse(args[2]).bodyHtml;
          return { rows: [] };
        },
      };
      await enqueueBookingNotification(client, 1, 1, event, 'preview');
    }
  }
  cases.cta = brandedTransactionalEmail({
    assetOrigin: 'https://itemize.cloud', previewText: 'QA preview',
    heading: 'Your invoice is ready',
    bodyHtml: '<p>Hello QA customer, your invoice is ready for review.</p>',
    cta: { label: 'View invoice', url: 'https://example.com/qa' },
  });
  cases['cta-long'] = brandedTransactionalEmail({
    assetOrigin: 'https://itemize.cloud', previewText: 'QA preview',
    heading: 'CreativeStudio'.repeat(6),
    bodyHtml: `<p>${'DocumentReference'.repeat(10)}</p>`,
    cta: {
      label: 'Review your estimate and supporting project details',
      url: 'https://example.com/qa',
    },
  });
  // Exercises loss of body-level CSS; this is not an email-client emulator.
  for (const [name, html] of Object.entries(cases)) {
    cases[name + '-body-stripped'] = '<!doctype html><meta charset="utf-8">'
      + html.match(/<body[^>]*>([\s\S]*)<\/body>/)[1];
  }
  const fixtureJson = JSON.stringify(cases).replace(/</g, '\\u003c');
  const page = `<!doctype html><meta charset="utf-8"><title>Email width audit</title>
    <style>
      body { font: 14px Arial; }
      section { display: inline-block; vertical-align: top; margin: 8px; }
      iframe { border: 1px solid #888; height: 750px; }
      pre { white-space: pre-wrap; }
    </style>
    <h1>Email width audit - browser previews</h1>
    <p>Synthetic fixtures; no email sent. This does not emulate Gmail iOS or Outlook.</p>
    <pre id="results">Measuring</pre><div id="frames"></div>
    <script>(${renderPreviews.toString()})(${fixtureJson})</script>`;
  http.createServer((_request, response) => {
    response.setHeader('Content-Type', 'text/html; charset=utf-8');
    response.end(page);
  }).listen(5188, '127.0.0.1', () => {
    console.log('Email preview http://127.0.0.1:5188 - stop with Ctrl+C');
  });
}

main().catch(error => {
  console.error(error.message);
  process.exitCode = 1;
});
