import { XCircle } from 'lucide-react';
import { BrandedPublicCard, type PublicContentType } from '@/components/public/BrandedPublicPage';
import { Button } from '@/components/ui/button';

interface NotAvailableCTAProps {
  contentType: PublicContentType;
  error?: string | null;
  onBackToHome: () => void;
}

export function NotAvailableCTA({
  contentType,
  error,
  onBackToHome,
}: NotAvailableCTAProps) {
  const fallback = `This shared ${contentType} is unavailable. The link may have expired or sharing may have been turned off.`;

  return (
    <BrandedPublicCard className="mx-auto w-full max-w-md">
      <div className="space-y-4 p-8 text-center">
        <div className="mx-auto grid h-12 w-12 place-items-center rounded-xl bg-destructive/10">
          <XCircle className="h-6 w-6 text-destructive" />
        </div>
        <div>
          <h1 className="text-xl font-semibold">Shared item unavailable</h1>
          <p className="mt-2 text-sm text-muted-foreground">{error || fallback}</p>
        </div>
        <Button type="button" onClick={onBackToHome}>Visit Itemize</Button>
      </div>
    </BrandedPublicCard>
  );
}
