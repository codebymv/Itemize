# Itemize.cloud Security Checklist Before Production

## Current status

Living checklist. Checked items are backed by the current NestJS production
runtime or release gate; unchecked items remain explicit release or
post-launch hardening work.

This checklist outlines essential security measures to be verified and implemented before deploying Itemize.cloud to a production environment.

### 1. Infrastructure Security
- [x] **Configure proper SSL/TLS**: Railway.app provides automatic SSL certificates.
- [ ] **Set up DDoS protection**: Consider adding Cloudflare or similar CDN/protection layer.
- [ ] **Implement proper logging and monitoring**: Centralized logging and monitoring for security events.
- [ ] **Set up automated security scanning**: Integrate tools for continuous vulnerability scanning of infrastructure.
- [x] **Secure database access**: PostgreSQL on Railway with connection string authentication.

### 2. Authentication & Authorization
- [ ] **Implement Multi-Factor Authentication (MFA)**: For all administrative and sensitive user accounts.
- [x] **Set up rate limiting**: 100 requests/hour on public endpoints (implemented in backend).
- [x] **Configure proper session timeouts**: JWT tokens have expiration times.
- [x] **Review JWT secret management**: Production startup requires a Railway-provided `JWT_SECRET` of at least 32 characters.
- [x] **Keep session JWTs out of browser storage**: Access and refresh tokens use secure HttpOnly cookies; protected mutations also require the CSRF cookie/header pair.
- [ ] **Implement IP-based restrictions**: For sensitive administrative routes or services.

### 3. Data Protection
- [ ] **Encrypt sensitive data at rest**: For any data stored in the database that requires encryption.
- [ ] **Set up proper backup and recovery procedures**: Regularly back up all critical data and test recovery processes.
- [ ] **Implement data retention policies**: Define and enforce policies for how long data is stored.
- [ ] **Configure proper access controls**: Implement granular access controls based on the principle of least privilege.
- [ ] **Set up audit logging**: Log all security-relevant events, including data access and modifications.

### 4. Application Security
- [ ] **Complete security code review**: Conduct a thorough review of the entire codebase for security vulnerabilities.
- [ ] **Run vulnerability scanners**: Use SAST (Static Application Security Testing) and DAST (Dynamic Application Security Testing) tools.
- [ ] **Perform penetration testing**: Engage security professionals to conduct simulated attacks.
- [x] **Review third-party dependencies**: npm audit shows no critical vulnerabilities (verify regularly).
- [x] **Implement secure error handling**: ErrorBoundary component catches React errors gracefully.
- [x] **Validate all inputs**: 
  - DOMPurify for HTML sanitization (backend)
  - Helmet.js for security headers (backend)
  - CORS configuration (backend)
  - Zod schemas available for frontend validation

### 5. API Security
- [x] **Rate limiting**: Implemented on public endpoints (100 req/hour).
- [x] **Authentication middleware**: JWT verification on protected routes.
- [x] **API retry with backoff**: Implemented in frontend API client.
- [x] **Request size limits**: JSON and URL-encoded application requests are bounded to 1 MB; specialized binary routes enforce their own contracts.
- [ ] **API versioning**: Consider implementing for future compatibility.

### 6. Frontend Security
- [x] **XSS Prevention**: DOMPurify sanitization on user content.
- [x] **Error Boundary**: Graceful error handling without exposing internals.
- [x] **Logger utility**: Debug logs stripped in production builds.
- [ ] **CSP Headers**: Public capability responses have restrictive policies, but the static application shell still needs one explicit tested production policy.
- [ ] **Subresource Integrity**: For external scripts/styles if any.

### 7. Compliance & Policies
- [ ] **Review privacy policy**: Ensure it accurately reflects data handling practices and complies with regulations.
- [ ] **Implement relevant regulatory requirements**: (e.g., GDPR, CCPA, HIPAA) if applicable.
- [ ] **Set up data breach response procedures**: A clear plan for identifying, containing, and responding to data breaches.
- [ ] **Document security processes**: Maintain up-to-date documentation of all security policies and procedures.
- [x] **Cookie consent**: The deferred consent control separates essential session cookies from optional preferences.

## Implemented Improvements (This Session)

1. **ErrorBoundary component** - Catches React errors gracefully
2. **Logger utility** - Strips debug logs in production
3. **API retry with exponential backoff** - Handles transient failures
4. **Zod validation schemas** - For API payload validation
5. **Testing infrastructure** - Vitest, RTL, MSW for security testing

## Dependency Audit — August 21, 2026

- Production dependency findings were reduced from three moderate advisories to zero.
- Development dependency findings were reduced from one critical, two high, and five moderate advisories to zero.
- Removed the unused Sequelize/pg-hstore model layer and its vulnerable UUID dependency.
- Upgraded direct UUID usage to 11.1.1; Itemize uses only `v4()` for correlation IDs.
- Upgraded Vite to 6.4.3 and the matched Vitest toolchain to 3.2.6.
- Pinned brace-expansion 1.1.18 for the legacy minimatch development path.
- Upgraded DOMPurify to the patched 3.4.14 release after confirming Itemize does not
  depend on the affected non-default `IN_PLACE` behavior.
- Added an independent frontend lockfile, pinned the safe PDF.js 5.4.624 release,
  moved Railway to Node 22, and changed production builds from `npm install` to
  reproducible `npm ci` installs.

## Priority Items for Next Phase

1. **High Priority**:
   - Set up centralized logging
   - Implement MFA for admin accounts
   - Add and regression-test the production application-shell CSP
   - Complete security code review

2. **Medium Priority**:
   - Set up automated dependency scanning (e.g., Dependabot)
   - Implement proper backup procedures
   - Add CSP headers verification
   - Document incident response procedures

3. **Lower Priority**:
   - Penetration testing
   - Compliance documentation
   - Data retention policies

## Next Steps

1. **Prioritize**: Focus on high-priority items first.
2. **Assign**: Assign ownership for each item to specific team members.
3. **Implement**: Begin implementing the necessary security controls.
4. **Verify**: Thoroughly test all implemented security measures.
5. **Monitor**: Continuously monitor the application for security threats post-deployment.
