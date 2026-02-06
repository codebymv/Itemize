import React from 'react';
import { CheckCircle, type LucideIcon } from 'lucide-react';
import AppScreenshot from './AppScreenshot';
import { useRevealClass } from '@/hooks/useScrollReveal';

interface FeatureShowcaseProps {
  isLight: boolean;
  reverse?: boolean;
  badge: { icon: LucideIcon; label: string; color: string };
  title: string;
  description: string;
  features: string[];
  screenshot: {
    label: string;
    sublabel?: string;
    accentFrom: string;
    accentTo: string;
    src?: string;
  };
}

/**
 * A feature showcase section with scroll-reveal animation,
 * display typography, and a browser-chrome-framed screenshot placeholder.
 */
function FeatureShowcase({
  isLight,
  reverse = false,
  badge,
  title,
  description,
  features,
  screenshot,
}: FeatureShowcaseProps) {
  const textReveal = useRevealClass('fade-up', { delay: 0 });
  const imageReveal = useRevealClass(reverse ? 'fade-left' : 'fade-right', { delay: 150 });

  const textColor = isLight ? 'text-gray-900' : 'text-slate-100';
  const secondaryTextColor = isLight ? 'text-gray-600' : 'text-slate-400';

  return (
    <div className={`grid lg:grid-cols-2 gap-12 lg:gap-16 items-center`}>
      {/* Text side */}
      <div 
        ref={textReveal.ref} 
        className={`${textReveal.className} ${reverse ? 'lg:order-2' : 'lg:order-1'}`}
        style={textReveal.style}
      >
        {/* Badge */}
        <div className={`inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 bg-gradient-to-r ${badge.color} text-white shadow-lg shadow-blue-500/10`}>
          <badge.icon className="h-4 w-4" />
          {badge.label}
        </div>

        {/* Title - uses display font */}
        <h3 className={`landing-heading text-2xl md:text-3xl lg:text-4xl font-extrabold ${textColor} mb-5 leading-tight`}>
          {title}
        </h3>

        {/* Description */}
        <p className={`text-lg leading-relaxed ${secondaryTextColor} mb-8`}>
          {description}
        </p>

        {/* Feature checklist */}
        <ul className="space-y-4">
          {features.map((feature, i) => (
            <li key={i} className="flex items-start gap-3">
              <CheckCircle className={`h-5 w-5 mt-0.5 flex-shrink-0 ${isLight ? 'text-emerald-500' : 'text-emerald-400'}`} />
              <span className={`${textColor} font-medium`}>{feature}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Screenshot side */}
      <div 
        ref={imageReveal.ref}
        className={`${imageReveal.className} ${reverse ? 'lg:order-1' : 'lg:order-2'}`}
        style={imageReveal.style}
      >
        <div className="screenshot-perspective">
          <AppScreenshot
            label={screenshot.label}
            sublabel={screenshot.sublabel}
            accentFrom={screenshot.accentFrom}
            accentTo={screenshot.accentTo}
            src={screenshot.src}
            isLight={isLight}
            showChrome={true}
            className="screenshot-tilt"
          />
        </div>
      </div>
    </div>
  );
}

export default FeatureShowcase;
