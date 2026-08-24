# Itemize.cloud Content Security Policy (CSP)

## Overview

Content Security Policy (CSP) is a security standard that helps prevent Cross-Site Scripting (XSS) and other code injection attacks by specifying which content sources the browser should trust and load. Itemize.cloud leverages `helmet` in the backend to apply default CSP headers.

## Implementation Details

### Backend (Node.js/Express with Helmet)

The backend uses the `helmet` middleware, which includes a default CSP. This default CSP is quite restrictive and can be customized to allow specific sources.

```javascript
const helmet = require('helmet');
app.use(helmet());
```

By default, Helmet's CSP will set the following directives (among others):

*   `default-src 'self'`
*   `script-src 'self'`
*   `style-src 'self'`

This means that by default, the application will only load resources (scripts, styles, images, etc.) from its own origin.

### Frontend (Vite/React)

The frontend does not explicitly define a CSP via meta tags in `index.html` or through Vite configuration. The CSP is primarily enforced by the backend's Helmet middleware.

## Customization (Future)

To allow content from specific external sources (e.g., Google Fonts, analytics scripts, or external image hosts), the CSP directives in the backend's Helmet configuration would need to be explicitly defined. For example:

```javascript
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "https://www.googletagmanager.com"], // Example for Google Analytics
      styleSrc: ["'self'", "https://fonts.googleapis.com", "'unsafe-inline'"], // Example for Google Fonts and inline styles
      imgSrc: ["'self'", "data:", "https://example.com"], // Example for external images
      connectSrc: ["'self'", "https://api.example.com"], // Example for external APIs
    },
  },
}));
```

## Security Benefits

- **XSS Prevention**: By restricting the sources from which scripts can be loaded.
- **Data Exfiltration Prevention**: By controlling where data can be sent.
- **Clickjacking Protection**: (Provided by other Helmet headers like `X-Frame-Options`).

## Monitoring and Troubleshooting

- **Browser Developer Tools**: Check the Console for CSP violation reports.
- **Report-Only Mode**: In a production environment, CSP can be deployed in `Report-Only` mode first to identify violations without blocking content.

## Best Practices

- **Be Specific**: Define directives as narrowly as possible.
- **Avoid `unsafe-inline` and `unsafe-eval`**: Use these sparingly and only when absolutely necessary, as they can weaken CSP protection.
- **Regularly Review**: Update CSP as the application evolves and integrates new third-party services.
