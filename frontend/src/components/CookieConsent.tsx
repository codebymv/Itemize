import { useState, useEffect } from 'react';
import { Cookie, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { storage } from '@/lib/storage';

// Cookie consent categories
type CookieCategory = 'essential' | 'analytics' | 'marketing';

interface CookiePreferences {
  essential: boolean; // Always true, cannot be disabled
  analytics: boolean;
  marketing: boolean;
  consentGiven: boolean;
  consentDate?: string;
}

const COOKIE_CONSENT_KEY = 'itemize_cookie_consent';
const COOKIE_CONSENT_VERSION = '1.0';

const DEFAULT_PREFERENCES: CookiePreferences = {
  essential: true,
  analytics: false,
  marketing: false,
  consentGiven: false,
};

const COOKIE_CATEGORIES = [
  {
    id: 'essential' as CookieCategory,
    name: 'Essential',
    description: 'Required for the website to function properly.',
    required: true,
  },
  {
    id: 'analytics' as CookieCategory,
    name: 'Analytics',
    description: 'Help us understand how you use our site.',
    required: false,
  },
  {
    id: 'marketing' as CookieCategory,
    name: 'Marketing',
    description: 'Used to deliver relevant advertisements.',
    required: false,
  },
];

/**
 * Get current cookie preferences from localStorage
 */
export function getCookiePreferences(): CookiePreferences {
  if (typeof window === 'undefined') return DEFAULT_PREFERENCES;
  
  try {
    const stored = storage.getItem(COOKIE_CONSENT_KEY);
    if (stored) {
      const parsed = JSON.parse(stored);
      if (parsed.version === COOKIE_CONSENT_VERSION) {
        return parsed.preferences;
      }
    }
  } catch (e) {
    console.error('Failed to parse cookie preferences:', e);
  }
  
  return DEFAULT_PREFERENCES;
}

/**
 * Check if a specific cookie category is allowed
 */
export function isCookieCategoryAllowed(category: CookieCategory): boolean {
  const preferences = getCookiePreferences();
  return preferences[category] ?? false;
}

/**
 * Compact Cookie Consent Banner
 * GDPR/CCPA compliant, minimal footprint design
 */
export function CookieConsent() {
  const [isVisible, setIsVisible] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [preferences, setPreferences] = useState<CookiePreferences>(DEFAULT_PREFERENCES);
  const [isClosing, setIsClosing] = useState(false);

  useEffect(() => {
    const stored = getCookiePreferences();
    if (!stored.consentGiven) {
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
    setPreferences(stored);
  }, []);

  const savePreferences = (prefs: CookiePreferences) => {
    const data = {
      version: COOKIE_CONSENT_VERSION,
      preferences: {
        ...prefs,
        consentGiven: true,
        consentDate: new Date().toISOString(),
      },
    };
    storage.setItem(COOKIE_CONSENT_KEY, JSON.stringify(data));
    setPreferences(data.preferences);
    window.dispatchEvent(new CustomEvent('cookieConsentUpdated', { 
      detail: data.preferences 
    }));
  };

  const handleClose = (prefs: CookiePreferences) => {
    setIsClosing(true);
    setTimeout(() => {
      savePreferences(prefs);
      setIsVisible(false);
      setIsClosing(false);
    }, 150);
  };

  const handleAcceptAll = () => {
    handleClose({ essential: true, analytics: true, marketing: true, consentGiven: true });
  };

  const handleEssentialOnly = () => {
    handleClose({ essential: true, analytics: false, marketing: false, consentGiven: true });
  };

  const handleSavePreferences = () => {
    handleClose(preferences);
  };

  const toggleCategory = (category: CookieCategory) => {
    if (category === 'essential') return;
    setPreferences(prev => ({ ...prev, [category]: !prev[category] }));
  };

  if (!isVisible) return null;

  return (
    <>
      {/* Compact Banner */}
      <div
        className={cn(
          "fixed bottom-0 left-0 right-0 z-50 transition-transform duration-150",
          isClosing ? "translate-y-full" : "translate-y-0"
        )}
      >
        <div className="bg-gradient-to-r from-blue-600 to-indigo-600 shadow-lg">
          <div className="max-w-7xl mx-auto px-4 py-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              {/* Text */}
              <p className="text-sm text-white/90 flex-1">
                <Cookie className="h-4 w-4 inline mr-1.5 text-white" />
                We use cookies to enhance your experience.{' '}
                <a href="/legal/privacy" className="text-white underline hover:text-white/80">
                  Learn more
                </a>
              </p>

              {/* Buttons */}
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  onClick={() => setShowSettings(true)}
                  className="text-sm text-white/80 hover:text-white px-2 py-1"
                >
                  Settings
                </button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleEssentialOnly}
                  className="bg-transparent text-white border-white/40 hover:bg-white/10 hover:border-white/60 h-8"
                >
                  Reject
                </Button>
                <Button
                  size="sm"
                  onClick={handleAcceptAll}
                  className="bg-white text-blue-700 hover:bg-white/90 h-8 font-medium"
                >
                  Accept
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4">
          {/* Backdrop */}
          <div 
            className="absolute inset-0 bg-black/50"
            onClick={() => setShowSettings(false)}
          />
          
          {/* Modal */}
          <div className="relative bg-white dark:bg-slate-800 rounded-lg shadow-xl max-w-md w-full max-h-[80vh] overflow-auto">
            {/* Header */}
            <div className="flex items-center justify-between p-4 border-b dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-200">Cookie Settings</h3>
              <button
                onClick={() => setShowSettings(false)}
                className="p-1 rounded hover:bg-slate-100 dark:hover:bg-slate-700"
              >
                <X className="h-5 w-5 text-slate-500" />
              </button>
            </div>

            {/* Categories */}
            <div className="p-4 space-y-3">
              {COOKIE_CATEGORIES.map((category) => (
                <div
                  key={category.id}
                  className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700/50 rounded-lg"
                >
                  <div className="flex-1 mr-3">
                    <div className="flex items-center gap-2">
                      <span className="font-medium text-sm text-slate-700 dark:text-slate-200">{category.name}</span>
                      {category.required && (
                        <span className="text-xs text-slate-400">Required</span>
                      )}
                    </div>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                      {category.description}
                    </p>
                  </div>
                  <button
                    onClick={() => toggleCategory(category.id)}
                    disabled={category.required}
                    className={cn(
                      "relative w-10 h-5 rounded-full transition-colors flex-shrink-0",
                      category.required || preferences[category.id]
                        ? "bg-blue-500"
                        : "bg-slate-300 dark:bg-slate-600",
                      !category.required && "cursor-pointer"
                    )}
                  >
                    <span
                      className={cn(
                        "absolute top-0.5 left-0.5 w-4 h-4 bg-white rounded-full shadow transition-transform",
                        (category.required || preferences[category.id]) && "translate-x-5"
                      )}
                    />
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div className="p-4 border-t dark:border-slate-700 bg-slate-50 dark:bg-slate-700/30 flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowSettings(false)}
                className="flex-1"
              >
                Cancel
              </Button>
              <Button
                size="sm"
                onClick={handleSavePreferences}
                className="flex-1 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white"
              >
                Save
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Button to re-open cookie preferences (for footer/settings)
 */
export function CookiePreferencesButton({ className }: { className?: string }) {
  const openPreferences = () => {
    storage.removeItem(COOKIE_CONSENT_KEY);
    window.location.reload();
  };

  return (
    <button
      onClick={openPreferences}
      className={cn(
        "text-sm text-muted-foreground hover:text-blue-600 dark:hover:text-blue-400 hover:underline",
        className
      )}
    >
      Cookie Preferences
    </button>
  );
}
