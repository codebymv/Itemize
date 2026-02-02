import React from 'react';
import { CheckCircle } from 'lucide-react';

interface FeatureRowProps {
  isLight: boolean;
  cardBgColor: string;
  cardBorderColor: string;
  textColor: string;
  secondaryTextColor: string;
  reverse: boolean;
  badge: { icon: any; label: string; color: string };
  title: string;
  description: string;
  features: string[];
  visual: React.ReactNode;
}

function FeatureRow({ isLight, cardBgColor, cardBorderColor, textColor, secondaryTextColor, reverse, badge, title, description, features, visual }: FeatureRowProps) {
  return (
    <div className={`grid lg:grid-cols-2 gap-12 items-center ${reverse ? 'lg:flex-row-reverse' : ''}`}>
      <div className={reverse ? 'lg:order-2' : 'lg:order-1'}>
        <div className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium mb-4 bg-gradient-to-r ${badge.color} text-white`}>
          <badge.icon className="h-4 w-4" />
          {badge.label}
        </div>
        <h3 className={`text-2xl md:text-3xl font-bold ${textColor} mb-4`}>{title}</h3>
        <p className={`text-lg ${secondaryTextColor} mb-6`}>{description}</p>
        <ul className="space-y-3">
          {features.map((feature, i) => (
            <li key={i} className="flex items-center gap-3">
              <CheckCircle className={`h-5 w-5 ${isLight ? 'text-green-500' : 'text-green-400'}`} />
              <span className={textColor}>{feature}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className={reverse ? 'lg:order-1' : 'lg:order-2'}>
        <div className={`${cardBgColor} rounded-2xl border ${cardBorderColor} p-6 shadow-lg`}>
          {visual}
        </div>
      </div>
    </div>
  );
}

export default FeatureRow;