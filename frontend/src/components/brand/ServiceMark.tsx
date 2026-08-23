import postgresqlMark from '@/assets/service-marks/postgresql.svg';
import resendMark from '@/assets/service-marks/resend.svg';
import resendDarkMark from '@/assets/service-marks/resend-dark.svg';
import stripeMark from '@/assets/service-marks/stripe.svg';
import amazonS3Mark from '@/assets/service-marks/amazon-s3.svg';
import twilioMark from '@/assets/service-marks/twilio.svg';
import clamavMark from '@/assets/service-marks/clamav.svg';
import geminiMark from '@/assets/service-marks/gemini.svg';
import gleamMark from '@/assets/service-marks/gleam.svg';
import { cn } from '@/lib/utils';

export type ServiceMarkName =
  | 'postgresql'
  | 'resend'
  | 'stripe'
  | 'amazon-s3'
  | 'twilio'
  | 'clamav'
  | 'gemini'
  | 'gleam';

const marks: Exclude<ServiceMarkName, 'resend'>[] = [
  'postgresql',
  'stripe',
  'amazon-s3',
  'twilio',
  'clamav',
  'gemini',
  'gleam',
];

const markSources: Record<(typeof marks)[number], string> = {
  postgresql: postgresqlMark,
  stripe: stripeMark,
  'amazon-s3': amazonS3Mark,
  twilio: twilioMark,
  clamav: clamavMark,
  gemini: geminiMark,
  gleam: gleamMark,
};

interface ServiceMarkProps {
  service: ServiceMarkName;
  className?: string;
}

export function ServiceMark({ service, className }: ServiceMarkProps) {
  const imageClassName = 'h-full w-full object-contain';

  return (
    <span
      aria-hidden="true"
      className={cn('inline-flex h-10 w-10 shrink-0 items-center justify-center', className)}
    >
      {service === 'resend' ? (
        <>
          <img src={resendMark} alt="" className={cn(imageClassName, 'dark:hidden')} />
          <img src={resendDarkMark} alt="" className={cn(imageClassName, 'hidden dark:block')} />
        </>
      ) : (
        <img src={markSources[service]} alt="" className={imageClassName} />
      )}
    </span>
  );
}
