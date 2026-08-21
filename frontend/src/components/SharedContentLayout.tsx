import type { ReactNode } from 'react';
import {
  BrandedPublicContainer,
  BrandedPublicPage,
  PublicPrivateLinkNotice,
  PublicProductCTA,
  type PublicContentType,
} from '@/components/public/BrandedPublicPage';

interface SharedContentLayoutProps {
  children: ReactNode;
  title: string;
  contentType: PublicContentType;
  onBackToHome?: () => void;
  showCTA?: boolean;
  isError?: boolean;
}

export function SharedContentLayout({
  children,
  contentType,
  showCTA = true,
  isError = false,
}: SharedContentLayoutProps) {
  return (
    <BrandedPublicPage>
      <style>{`
        .shared-content-container *, .shared-content-container *::before, .shared-content-container *::after {
          box-sizing: border-box;
        }
        .shared-content-container img, .shared-content-container pre, .shared-content-container code, .shared-content-container table {
          max-width: 100%;
          height: auto;
        }
        .shared-content-container video, .shared-content-container iframe {
          max-width: 100%;
        }
      `}</style>
      <BrandedPublicContainer className="shared-content-container">
        {children}
        {showCTA && <PublicProductCTA />}
        {!isError && (
          <PublicPrivateLinkNotice
            contentLabel={contentType}
            sensitive={contentType === 'vault'}
          />
        )}
      </BrandedPublicContainer>
    </BrandedPublicPage>
  );
}
