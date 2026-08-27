import React from 'react';
import { Link, useLocation } from 'react-router-dom';

type LegalKind = 'terms' | 'privacy';

const TERMS_SECTIONS = [
  {
    heading: '1. Acceptance of Terms',
    body: 'By accessing and using Itemize.cloud (the "Service"), you accept and agree to be bound by these Terms of Service. If you do not agree, do not use the Service.',
  },
  {
    heading: '2. Service Description',
    body: 'Itemize.cloud provides workspace, CRM, invoicing, scheduling, and related business tools. The Service is provided "AS-IS". We do not guarantee uninterrupted availability or that stored content will never be delayed, deleted, or undelivered.',
  },
  {
    heading: '3. User Conduct',
    body: 'You are responsible for content you post or otherwise make available via the Service. You agree not to use the Service to upload, post, email, transmit, or otherwise make available any content that is unlawful, harmful, threatening, abusive, harassing, tortious, defamatory, vulgar, obscene, libelous, invasive of another\'s privacy, hateful, or otherwise objectionable.',
  },
  {
    heading: '4. Accounts and Security',
    body: 'You must provide accurate account information and keep your credentials confidential. You are responsible for activity under your account. Notify us promptly at support@itemize.cloud if you suspect unauthorized access.',
  },
  {
    heading: '5. Changes to Terms',
    body: 'We may update these Terms of Service from time to time. Continued use of the Service after changes take effect constitutes acceptance of the updated terms.',
  },
  {
    heading: '6. Contact',
    body: 'Questions about these Terms can be sent to support@itemize.cloud.',
  },
];

const PRIVACY_SECTIONS = [
  {
    heading: '1. Information we collect',
    body: 'We collect account details you provide (such as name, email, and organization), workspace content you create (notes, lists, files, contacts, invoices, and similar records), usage data needed to operate the Service, and payment information processed by our payment providers. We do not store full payment card numbers on Itemize servers.',
  },
  {
    heading: '2. How we use information',
    body: 'We use this information to provide, secure, and improve the Service; authenticate users; process billing; send transactional email; and comply with law. We do not sell personal information.',
  },
  {
    heading: '3. Cookies',
    body: 'We use essential cookies for authentication and session security, and optional cookies for preferences such as theme. You can manage non-essential cookies through the cookie banner and your browser settings.',
  },
  {
    heading: '4. Processors and sharing',
    body: 'We share data with service providers that help us operate Itemize, including hosting, email, error monitoring, file storage, and payment processing. Those providers may only use the data to perform services for us.',
  },
  {
    heading: '5. Retention and security',
    body: 'We retain account and workspace data while your account is active and as needed for legal, billing, and security purposes. We use industry-standard safeguards, but no method of transmission or storage is completely secure.',
  },
  {
    heading: '6. Your choices',
    body: 'You may access, export, update, or schedule deletion of account information from Settings, or request help from support@itemize.cloud. A scheduled deletion locks the account immediately and includes a seven-day email recovery window. Some records may be retained where required by law or legitimate business needs such as fraud prevention, payment records, signing evidence, security audits, and time-limited backups.',
  },
  {
    heading: '7. Contact',
    body: 'Privacy questions can be sent to support@itemize.cloud.',
  },
];

function LegalDocumentPage({ kind }: { kind: LegalKind }) {
  const location = useLocation();
  const isTerms = kind === 'terms';
  const title = isTerms ? 'Terms of Service' : 'Privacy Policy';
  const updated = 'August 18, 2026';
  const sections = isTerms ? TERMS_SECTIONS : PRIVACY_SECTIONS;

  return (
    <div className="bg-background text-foreground">
      <main className="mx-auto max-w-3xl px-4 py-10 sm:px-6">
        <p className="text-sm text-muted-foreground">Last updated: {updated}</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-tight">{title}</h1>
        <p className="mt-4 text-muted-foreground">
          {isTerms
            ? 'These terms govern use of Itemize.cloud.'
            : 'This policy explains how Itemize.cloud handles personal information.'}
        </p>
        <div className="mt-8 space-y-8">
          {sections.map((section) => (
            <section key={section.heading}>
              <h2 className="text-xl font-semibold">{section.heading}</h2>
              <p className="mt-2 leading-relaxed text-foreground/90">{section.body}</p>
            </section>
          ))}
        </div>
        <p className="mt-10 text-sm text-muted-foreground">
          {location.pathname === '/legal/terms' ? (
            <Link className="text-blue-600 underline dark:text-blue-400" to="/legal/privacy">
              Privacy Policy
            </Link>
          ) : (
            <Link className="text-blue-600 underline dark:text-blue-400" to="/legal/terms">
              Terms of Service
            </Link>
          )}
        </p>
      </main>
    </div>
  );
}

export function TermsOfServicePage() {
  return <LegalDocumentPage kind="terms" />;
}

export function PrivacyPolicyPage() {
  return <LegalDocumentPage kind="privacy" />;
}
