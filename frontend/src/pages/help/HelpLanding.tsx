import { Link } from 'react-router-dom';
import {
  Layout,
  FileText,
  PenLine,
  CreditCard,
  Share2,
  Code2,
} from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

const TOPICS = [
  {
    title: 'Workspace',
    description: 'Canvas, lists, notes, and whiteboards in one place.',
    href: '/help/help/workspace',
    icon: Layout,
  },
  {
    title: 'Invoices',
    description: 'Create, tax, send, and track invoices.',
    href: '/help/help/invoices',
    icon: FileText,
  },
  {
    title: 'Signatures',
    description: 'Send documents for e-signature and follow status.',
    href: '/help/help/signatures',
    icon: PenLine,
  },
  {
    title: 'Billing',
    description: 'Solo vs Studio, usage limits, and upgrades.',
    href: '/help/help/billing',
    icon: CreditCard,
  },
  {
    title: 'Sharing',
    description: 'Share lists, notes, and public links.',
    href: '/help/help/sharing',
    icon: Share2,
  },
];

export function HelpLanding() {
  return (
    <div className="px-4 sm:px-6 py-4 space-y-8" style={{ fontFamily: '"Raleway", sans-serif' }}>
      <div className="space-y-3 max-w-2xl">
        <h1 className="text-3xl font-bold tracking-tight text-foreground">How can we help?</h1>
        <p className="text-muted-foreground text-base leading-relaxed">
          Use Itemize to organize work, invoice clients, collect signatures, and keep your team
          in one workspace. Pick a topic below, or search the sidebar.
        </p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        {TOPICS.map((topic) => (
          <Link key={topic.href} to={topic.href} className="group">
            <Card className="h-full transition-colors group-hover:border-blue-600">
              <CardHeader>
                <div className="flex items-center gap-3">
                  <div className="rounded-lg bg-blue-50 dark:bg-blue-950 p-2">
                    <topic.icon className="h-5 w-5 text-blue-600" />
                  </div>
                  <CardTitle className="text-lg">{topic.title}</CardTitle>
                </div>
                <CardDescription className="pt-1">{topic.description}</CardDescription>
              </CardHeader>
            </Card>
          </Link>
        ))}
      </div>

      <p className="text-sm text-muted-foreground">
        Building on Itemize?{' '}
        <Link to="/help/API" className="text-blue-600 hover:underline font-medium">
          <Code2 className="h-4 w-4 inline-block mr-1 align-text-bottom" />
          Developer docs
        </Link>
      </p>
    </div>
  );
}
