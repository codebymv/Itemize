import React, { memo } from 'react';
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
const FeatureShowcase = memo(function FeatureShowcase({
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
        {/* Category Header */}
        <div className="flex items-center gap-4 mb-6">
          <div className={`flex flex-shrink-0 items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br ${badge.color} shadow-lg shadow-blue-500/20`}>
            <badge.icon className="h-6 w-6 text-white" />
          </div>
          <h2 className={`text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${badge.color}`}>
            {badge.label}
          </h2>
        </div>

        {/* Title - uses display font */}
        <h3 className={`landing-heading text-3xl md:text-4xl font-extrabold ${textColor} mb-6 leading-tight`}>
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
});

export default FeatureShowcase;