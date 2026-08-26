import { useEffect, useState } from 'react';
import { useOrganization } from '@/hooks/useOrganization';
import { getPaymentSettings } from '@/services/invoicesApi';

interface PaymentLinkAvailability {
  paymentLinksAvailable: boolean;
  checkingPaymentLinks: boolean;
  paymentLinkCheckFailed: boolean;
}

export const usePaymentLinkAvailability = (
  open: boolean,
  initialAvailability?: boolean,
): PaymentLinkAvailability => {
  const { organizationId } = useOrganization();
  const [paymentLinksAvailable, setPaymentLinksAvailable] = useState(
    Boolean(initialAvailability),
  );
  const [checkingPaymentLinks, setCheckingPaymentLinks] = useState(
    open && initialAvailability === undefined,
  );
  const [paymentLinkCheckFailed, setPaymentLinkCheckFailed] = useState(false);

  useEffect(() => {
    if (!open) return;

    let active = true;
    setPaymentLinksAvailable(Boolean(initialAvailability));
    setPaymentLinkCheckFailed(false);

    if (!organizationId) {
      setCheckingPaymentLinks(false);
      return;
    }

    setCheckingPaymentLinks(true);
    void getPaymentSettings(organizationId)
      .then((settings) => {
        if (!active) return;
        setPaymentLinksAvailable(Boolean(settings.stripe_connected));
      })
      .catch(() => {
        if (!active) return;
        setPaymentLinksAvailable(false);
        setPaymentLinkCheckFailed(true);
      })
      .finally(() => {
        if (active) setCheckingPaymentLinks(false);
      });

    return () => {
      active = false;
    };
  }, [initialAvailability, open, organizationId]);

  return {
    paymentLinksAvailable,
    checkingPaymentLinks,
    paymentLinkCheckFailed,
  };
};
