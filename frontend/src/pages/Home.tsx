import React, { useEffect, useMemo, lazy, Suspense } from 'react';
import { Button } from "@/components/ui/button";
import { useAuthState } from '@/contexts/AuthContext';
import { LandingNav } from '@/components/LandingNav';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import {
  ArrowRight,
  CheckCircle,
  Users,
  TrendingUp,
  Calendar,
  Zap,
  Layers,
  Shield,
  Lock,
  Cloud,
  Key,
  Sparkles,
  CheckSquare,
  StickyNote,
  Palette,
  Map,
} from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import Footer from '@/components/Footer';
import AppScreenshot from './home/components/AppScreenshot';
import { useRevealClass } from '@/hooks/useScrollReveal';

const FeatureShowcase = lazy(() => import('./home/components/FeatureShowcase'));
const IntegrationGrid = lazy(() =>
  import('./home/components/IntegrationLogos').then(m => ({ default: m.IntegrationGrid }))
);
const PricingCards = lazy(() =>
  import('@/components/subscription').then(m => ({ default: m.PricingCards }))
);

/* ═══════════════════════════════════════════════════════════════ */
/* Reusable reveal wrapper for sections                           */
/* ═══════════════════════════════════════════════════════════════ */
const RevealSection = React.memo(function RevealSection({
  children,
  variant = 'fade-up' as const,
  delay = 0,
  className = '',
}: {
  children: React.ReactNode;
  variant?: 'fade-up' | 'fade' | 'scale';
  delay?: number;
  className?: string;
}) {
  const reveal = useRevealClass(variant, { delay });
  return (
    <div ref={reveal.ref} className={`${reveal.className} ${className}`} style={reveal.style}>
      {children}
    </div>
  );
});

const Home: React.FC = () => {
  const { isAuthenticated, token, currentUser } = useAuthState();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const navigatedRef = React.useRef(false);

  // Theme-aware base colors - memoized to prevent recalculation
  const themeColors = useMemo(() => {
    const isLight = theme === 'light';
    return {
      isLight,
      textColor: isLight ? 'text-gray-900' : 'text-slate-100',
      secondaryTextColor: isLight ? 'text-gray-600' : 'text-slate-400',
      mutedTextColor: isLight ? 'text-gray-400' : 'text-slate-500',
      cardBgColor: isLight ? 'bg-white' : 'bg-slate-800',
      cardBorderColor: isLight ? 'border-gray-200' : 'border-slate-700',
      accentGradient: 'bg-gradient-to-r from-blue-600 to-indigo-600',
      accentGradientHover: 'hover:from-blue-700 hover:to-indigo-700',
    };
  }, [theme]);

  const { isLight, textColor, secondaryTextColor, mutedTextColor, cardBgColor, cardBorderColor, accentGradient, accentGradientHover } = themeColors;

  // Auth redirect
  useEffect(() => {
    if (isAuthenticated && !navigatedRef.current) {
      navigatedRef.current = true;
      setTimeout(() => navigate('/dashboard'), 0);
    }
  }, [currentUser, navigate, isAuthenticated, token]);

  const handleGetStarted = () => navigate('/register');
  const handleSignIn = () => navigate('/login');
  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={`min-h-screen ${isLight ? 'bg-[#fafbfe]' : 'bg-slate-900'} overflow-hidden relative`}>
      {/* Background effects */}
      <BackgroundClouds opacity={isLight ? 0.12 : 0.08} cloudCount={10} isLight={isLight} />

      {/* Ambient gradient orbs - fixed positions, no Math.random */}
      <div className="absolute inset-0 z-0 pointer-events-none overflow-hidden">
        <div className={`absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full ${isLight ? 'bg-blue-400' : 'bg-blue-600'} opacity-[0.04] blur-[100px]`} />
        <div className={`absolute top-[40%] -left-40 w-[500px] h-[500px] rounded-full ${isLight ? 'bg-indigo-400' : 'bg-indigo-600'} opacity-[0.04] blur-[100px]`} />
        <div className={`absolute bottom-20 right-[20%] w-[400px] h-[400px] rounded-full ${isLight ? 'bg-violet-300' : 'bg-violet-600'} opacity-[0.03] blur-[100px]`} />
      </div>

      {/* Noise texture */}
      <div className="noise-overlay absolute inset-0 pointer-events-none z-0" />

      <LandingNav />

      <div className="relative z-10">

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: HERO                                                */}
        {/* Centered headline with full-width screenshot below             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="hero" className="pt-28 md:pt-40 pb-4 md:pb-8 contain-layout" style={{ contain: 'layout' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            {/* Centered text block */}
            <div className="text-center max-w-3xl mx-auto mb-12 md:mb-16">
              <h1 className={`animate-fade-in-up landing-heading text-4xl md:text-5xl lg:text-[3.5rem] xl:text-6xl font-extrabold tracking-tight leading-[1.1] ${textColor} mb-6`}>
                The CRM that works{' '}
                <span className={isLight ? 'text-blue-600' : 'text-blue-400'}>for you</span>
                <br />
                not against you
              </h1>

              <p className={`animate-fade-in-up animation-delay-100 text-lg md:text-xl leading-relaxed ${secondaryTextColor} mb-10 max-w-2xl mx-auto`}>
                Stop juggling spreadsheets and disconnected tools. Itemize brings your contacts,
                deals, and workflows together with beautiful workspaces.
              </p>

              <div className="animate-fade-in-up animation-delay-200 flex flex-col sm:flex-row gap-4 justify-center mb-8">
                <Button
                  onClick={handleGetStarted}
                  className={`rounded-xl px-8 py-6 ${accentGradient} ${accentGradientHover} text-white text-lg font-semibold shadow-xl shadow-blue-500/20 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-0.5`}
                  size="lg"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
              </div>

              <div className="animate-fade-in animation-delay-300 flex flex-wrap gap-6 justify-center">
                {['14-day free trial', 'No credit card required', 'Cancel anytime'].map((text) => (
                  <span key={text} className={`flex items-center gap-2 text-sm font-medium ${mutedTextColor}`}>
                    <CheckCircle className="h-4 w-4 text-emerald-500" />
                    {text}
                  </span>
                ))}
              </div>
            </div>

            {/* Full-width hero screenshot with perspective */}
            <div className="animate-scale-in animation-delay-400 screenshot-perspective max-w-5xl mx-auto" style={{ willChange: 'transform, opacity' }}>
              <AppScreenshot
                label="Dashboard"
                sublabel="Dashboard view"
                accentFrom="from-blue-500"
                accentTo="to-indigo-600"
                isLight={isLight}
                showChrome={true}
                aspectRatio="aspect-[16/10]"
                className="screenshot-tilt"
                src="/screenshots/dashboard.png"
                priority={true}
                alt="Itemize Dashboard Screenshot"
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: PROBLEM STATEMENT                                   */}
        {/* Asymmetric cards with stronger visual hierarchy                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="problem" className="py-20 md:py-32" style={{ contain: 'layout style' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="text-center mb-16">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-red-500' : 'text-red-400'} mb-4`}>
                  Sound familiar?
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor}`}>
                  Stop juggling disconnected tools
                </h2>
              </div>
            </RevealSection>

            {/* 
              On mobile: horizontal scroll-snap carousel (single card visible at a time).
              On md+: standard 3-column grid.
            */}
            <div className="relative mb-16">
              {/* Scroll track */}
              <div
                id="pain-carousel"
                className="flex md:grid md:grid-cols-3 gap-5 md:gap-8
                           overflow-x-auto md:overflow-x-visible
                           scroll-snap-x mandatory md:scroll-snap-type-none
                           pb-4 md:pb-0
                           -mx-4 px-4 md:mx-0 md:px-0"
                style={{
                  scrollSnapType: 'x mandatory',
                  WebkitOverflowScrolling: 'touch',
                  scrollbarWidth: 'none',
                  msOverflowStyle: 'none',
                }}
              >
                {[
                  {
                    title: 'Scattered Data',
                    desc: 'Customer info spread across spreadsheets, emails, and sticky notes. Nothing connects.',
                    gradient: 'from-red-500 to-orange-500',
                    image: '/illustrations/scattered-data.png',
                  },
                  {
                    title: 'Tool Overload',
                    desc: 'Paying for CRM + calendar + forms + automation separately. Stitching them together is a nightmare.',
                    gradient: 'from-orange-500 to-amber-500',
                    image: '/illustrations/tool-overload.png',
                  },
                  {
                    title: 'No Clear Picture',
                    desc: "Can't see your pipeline, contacts, and tasks in one view. Decisions are based on gut, not data.",
                    gradient: 'from-amber-500 to-yellow-500',
                    image: '/illustrations/no-clear-picture.png',
                  },
                ].map((pain, i) => (
                  <div
                    key={i}
                    className={`
                      flex-shrink-0 w-[82vw] sm:w-[72vw] md:w-auto
                      relative ${cardBgColor} rounded-3xl border ${cardBorderColor}
                      overflow-hidden h-full group
                      hover:shadow-xl hover:-translate-y-1 transition-[transform,box-shadow] duration-300
                      flex flex-col
                    `}
                    style={{ scrollSnapAlign: 'center' }}
                  >
                    <div className="relative h-48 sm:h-56 w-full overflow-hidden bg-slate-900 border-b border-black/5 dark:border-white/5">
                      <img
                        src={pain.image}
                        alt={pain.title}
                        className="w-full h-full object-cover grayscale contrast-125 brightness-90 transition-transform duration-700 group-hover:scale-105 opacity-95 group-hover:opacity-100 mix-blend-luminosity"
                        loading="lazy"
                      />
                      <div className="absolute inset-0 bg-slate-500/30 mix-blend-multiply pointer-events-none" />
                      <div className={`absolute inset-0 bg-gradient-to-t ${isLight ? 'from-white via-white/40 to-transparent' : 'from-slate-800 via-slate-800/40 to-transparent'}`} />
                    </div>
                    <div className="p-8 pt-6 flex-1 relative z-10 flex flex-col">
                      <div className={`w-12 h-1 rounded-full bg-gradient-to-r ${pain.gradient} mb-6`} />
                      <h3 className={`landing-heading text-xl font-bold ${textColor} mb-3`}>{pain.title}</h3>
                      <p className={`${secondaryTextColor} leading-relaxed flex-1`}>{pain.desc}</p>
                    </div>
                  </div>
                ))}
              </div>

              {/* Mobile-only dot indicators */}
              <div className="flex justify-center gap-2 mt-4 md:hidden">
                {[0, 1, 2].map((i) => (
                  <button
                    key={i}
                    aria-label={`Go to slide ${i + 1}`}
                    onClick={() => {
                      const el = document.getElementById('pain-carousel');
                      if (el) el.scrollTo({ left: i * el.offsetWidth * 0.82, behavior: 'smooth' });
                    }}
                    className={`w-2 h-2 rounded-full transition-all duration-300 ${
                      isLight ? 'bg-gray-300 hover:bg-blue-500' : 'bg-slate-600 hover:bg-blue-400'
                    }`}
                  />
                ))}
              </div>
            </div>

            <RevealSection>
              <div className="text-center">
                <p className={`text-xl font-semibold ${textColor}`}>
                  There's a better way <span className="landing-gradient-text font-bold">↓</span>
                </p>
              </div>
            </RevealSection>
          </div>
        </section>



        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 4: WORKSPACES DIFFERENTIATOR                           */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="workspaces" className={`py-20 md:py-32 ${isLight ? 'bg-gradient-to-br from-blue-50/80 to-indigo-50/80' : 'bg-gradient-to-br from-blue-950/30 to-slate-900'}`} style={{ contain: 'layout style' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="grid lg:grid-cols-2 gap-12 lg:gap-16 items-center">
              {/* Screenshot */}
              <RevealSection variant="fade-up" delay={0} className="order-2 lg:order-1">
                <div className="screenshot-perspective">
                  <AppScreenshot
                    label="Workspaces"
                    sublabel="Lists, Notes, and Whiteboards alongside your CRM"
                    accentFrom="from-blue-500"
                    accentTo="to-indigo-600"
                    isLight={isLight}
                    showChrome={true}
                    className="screenshot-tilt"
                    src="/screenshots/workspaces.png"
                    alt="Itemize Workspaces Screenshot"
                  />
                </div>
              </RevealSection>

              {/* Content */}
              <RevealSection variant="fade-up" delay={150} className="order-1 lg:order-2">
                <div>
                  {/* Category Header */}
                  <div className="flex items-center gap-4 mb-6">
                    <div className="flex flex-shrink-0 items-center justify-center w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-500 shadow-lg shadow-blue-500/20">
                      <Map className="h-6 w-6 text-white" />
                    </div>
                    <h2 className={`text-xl md:text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r ${accentGradient}`}>
                      Workspaces
                    </h2>
                  </div>

                  <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-6 leading-tight`}>
                    The only CRM with a built-in{' '}
                    <span className={`bg-clip-text text-transparent ${accentGradient}`}>Workspace Canvas</span>
                  </h2>
                  <p className={`text-lg leading-relaxed ${secondaryTextColor} mb-8`}>
                    Other CRMs force you to keep notes in separate apps. Itemize includes
                    powerful lists, notes, and whiteboards -- right alongside your contacts and deals.
                  </p>
                  <ul className="space-y-5 mb-10">
                    {[
                      { icon: CheckSquare, text: 'Smart lists with AI-powered suggestions' },
                      { icon: StickyNote, text: 'Rich notes with formatting and media' },
                      { icon: Palette, text: 'Infinite whiteboards for brainstorming' },
                      { icon: Sparkles, text: 'Everything synced and searchable' },
                    ].map((item, i) => (
                      <li key={i} className="flex items-center gap-4">
                        <div className={`w-10 h-10 rounded-xl ${isLight ? 'bg-blue-50' : 'bg-blue-900/30'} flex items-center justify-center flex-shrink-0`}>
                          <item.icon className={`h-5 w-5 ${isLight ? 'text-blue-600' : 'text-blue-400'}`} />
                        </div>
                        <span className={`${textColor} font-medium`}>{item.text}</span>
                      </li>
                    ))}
                  </ul>
                  <Button
                    onClick={handleGetStarted}
                    className={`rounded-xl px-6 py-5 ${accentGradient} ${accentGradientHover} text-white font-semibold shadow-lg shadow-blue-500/25 transition-all duration-300 hover:shadow-xl hover:shadow-blue-500/30 hover:-translate-y-0.5`}
                  >
                    Try Workspaces Free
                    <ArrowRight className="ml-2 h-4 w-4" />
                  </Button>
                </div>
              </RevealSection>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 5: FEATURE DEEP-DIVES                                  */}
        {/* Screenshot-based showcases with scroll reveal                  */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="features" className="py-20 md:py-32" style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="text-center mb-20">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-4`}>
                  Features
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-5`}>
                  Everything you need to grow
                </h2>
                <p className={`max-w-2xl mx-auto text-lg ${secondaryTextColor}`}>
                  From first contact to closed deal, Itemize has you covered.
                </p>
              </div>
            </RevealSection>

            <Suspense fallback={<div className="h-[600px] w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-3xl" />}>
              <div className="space-y-28 md:space-y-36">
                {/* Feature 1: Contact Management */}
                <FeatureShowcase
                  isLight={isLight}
                  reverse={false}
                  badge={{ icon: Users, label: 'Contact Management', color: 'from-blue-500 to-cyan-500' }}
                  title="Every customer, every interaction, one view"
                  description="Stop searching through emails and spreadsheets. See your complete customer history, notes, deals, and communications in one unified profile."
                  features={['Unlimited contacts with custom fields', 'Activity timeline and interaction history', 'Smart tags and segmentation', 'CSV import and bulk operations']}
                  screenshot={{ label: 'Contacts', sublabel: 'Full contact management with search and filters', accentFrom: 'from-blue-500', accentTo: 'to-cyan-500', src: '/screenshots/contacts.png' }}
                />

                {/* Feature 2: Sales Pipelines */}
                <FeatureShowcase
                  isLight={isLight}
                  reverse={true}
                  badge={{ icon: TrendingUp, label: 'Sales Pipelines', color: 'from-emerald-500 to-teal-500' }}
                  title="Visual deal tracking that makes sense"
                  description="Drag deals through custom stages, see your revenue forecast at a glance, and never let an opportunity slip through the cracks."
                  features={['Drag-and-drop Kanban boards', 'Custom pipeline stages and deal values', 'Revenue forecasting and probability', 'Win/loss tracking and analytics']}
                  screenshot={{ label: 'Pipelines', sublabel: 'Kanban board with drag-and-drop deal management', accentFrom: 'from-emerald-500', accentTo: 'to-teal-500', src: '/screenshots/pipelines.png' }}
                />

                {/* Feature 3: Calendars & Booking */}
                <FeatureShowcase
                  isLight={isLight}
                  reverse={false}
                  badge={{ icon: Calendar, label: 'Calendars & Booking', color: 'from-orange-500 to-amber-500' }}
                  title="Let clients book, you stay focused"
                  description="Share your availability and let clients book directly. Automatic reminders reduce no-shows and save hours of back-and-forth scheduling."
                  features={['Online booking pages with custom slugs', 'Google Calendar two-way sync', 'Automatic email reminders', 'Buffer times and daily limits']}
                  screenshot={{ label: 'Calendars', sublabel: 'Booking calendar management and scheduling', accentFrom: 'from-orange-500', accentTo: 'to-amber-500', src: '/screenshots/calendars.png' }}
                />

                {/* Feature 4: Automations */}
                <FeatureShowcase
                  isLight={isLight}
                  reverse={true}
                  badge={{ icon: Zap, label: 'Automations', color: 'from-pink-500 to-rose-500' }}
                  title="Set it up once, let it work forever"
                  description="Build visual workflows that automatically send emails, update contacts, create tasks, and trigger actions -- so you can focus on what matters."
                  features={['Visual drag-and-drop workflow builder', 'Email sequences with templates', '8 action types including webhooks', '6 trigger types with conditional logic']}
                  screenshot={{ label: 'Automations', sublabel: 'Visual workflow builder with drag-and-drop nodes', accentFrom: 'from-pink-500', accentTo: 'to-rose-500', src: '/screenshots/automations.png' }}
                />
              </div>
            </Suspense>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 6: INTEGRATIONS                                        */}
        {/* Real brand logos in a grid                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="integrations" className={`pt-20 md:pt-32 pb-10 md:pb-16 ${isLight ? 'bg-white/60' : 'bg-slate-800/40'}`} style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="text-center mb-16">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-4`}>
                  Integrations
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl font-extrabold ${textColor} mb-5`}>
                  Connects with tools you already use
                </h2>
                <p className={`max-w-xl mx-auto text-lg ${secondaryTextColor}`}>
                  Itemize works seamlessly with the apps you rely on every day.
                </p>
              </div>
            </RevealSection>

            <RevealSection variant="fade-up" delay={150}>
              <Suspense fallback={<div className="h-40 w-full animate-pulse bg-slate-100 dark:bg-slate-800 rounded-2xl" />}><IntegrationGrid isLight={isLight} /></Suspense>
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 7: TRUST & SECURITY                                    */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/*
          <section id="security" className="py-20 md:py-28" style={{ contain: 'layout style' }}>
            <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
              <RevealSection>
                <div className="text-center mb-14">
                  <h2 className={`landing-heading text-3xl md:text-4xl font-extrabold ${textColor} mb-4`}>
                    Your data, protected
                  </h2>
                  <p className={`max-w-xl mx-auto text-lg ${secondaryTextColor}`}>
                    Security isn't an afterthought -- it's built into everything we do.
                  </p>
                </div>
              </RevealSection>

              <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
                {[
                  { icon: Lock, label: '256-bit Encryption', desc: 'End-to-end data protection' },
                  { icon: Shield, label: 'GDPR Ready', desc: 'Full compliance built in' },
                  { icon: Cloud, label: '99.9% Uptime', desc: 'Reliable infrastructure' },
                  { icon: Key, label: 'Secure Auth', desc: 'OAuth2 and 2FA support' },
                ].map((item, i) => (
                  <RevealSection key={i} variant="fade-up" delay={i * 80}>
                    <div className={`text-center p-6 rounded-2xl ${cardBgColor} border ${cardBorderColor} transition-all duration-300 hover:shadow-md`}>
                      <div className={`w-14 h-14 rounded-2xl ${isLight ? 'bg-emerald-50' : 'bg-emerald-900/20'} flex items-center justify-center mx-auto mb-4`}>
                        <item.icon className={`h-7 w-7 ${isLight ? 'text-emerald-600' : 'text-emerald-400'}`} />
                      </div>
                      <h3 className={`font-bold ${textColor} mb-1`}>{item.label}</h3>
                      <p className={`text-sm ${mutedTextColor}`}>{item.desc}</p>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>
          </section>
        */}

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 8: PRICING                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="pricing" className={`pt-10 md:pt-16 pb-20 md:pb-32 ${isLight ? 'bg-white/60' : 'bg-slate-800/40'}`} style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection>
              <div className="text-center mb-14">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-4`}>
                  Pricing
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-5`}>
                  Plans for your business to scale
                </h2>
                <p className={`max-w-2xl mx-auto text-lg ${secondaryTextColor}`}>
                  Test drive for free. Upgrade whenever your team is ready.
                </p>
              </div>
            </RevealSection>

            <RevealSection variant="fade-up" delay={100}>
              <div className={`${cardBgColor} rounded-2xl p-6 md:p-10 border ${cardBorderColor}`}>
                <PricingCards
                  variant="landing"
                  showYearlyToggle={false}
                  onUpgrade={() => handleGetStarted()}
                />
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 9: FINAL CTA                                           */}
        {/* Full-bleed gradient with strong presence                       */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="cta" className="py-24 md:py-36 relative overflow-hidden" style={{ contain: 'layout style' }}>
          {/* Gradient background accent */}
          <div className={`absolute inset-0 ${isLight ? 'bg-gradient-to-br from-blue-50 via-indigo-50 to-violet-50' : 'bg-gradient-to-br from-blue-950/50 via-indigo-950/50 to-violet-950/50'}`} />

          <div className="relative max-w-3xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
            <RevealSection>
              <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-6 leading-tight md:whitespace-nowrap`}>
                Ready to simplify <br className="block md:hidden" /><span className={isLight ? 'text-blue-600' : 'text-blue-400'}>your business?</span>
              </h2>
              <p className={`text-lg md:text-xl ${secondaryTextColor} mb-10 max-w-2xl mx-auto leading-relaxed`}>
                Join Itemize to organize, automate, and grow.
                Start your free trial today.
              </p>
              <Button
                onClick={handleGetStarted}
                className={`rounded-xl px-10 py-7 ${accentGradient} ${accentGradientHover} text-white text-lg font-semibold shadow-xl shadow-blue-500/25 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/35 hover:-translate-y-0.5`}
                size="lg"
              >
                Get Started Free
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
              <p className={`mt-6 text-sm ${mutedTextColor}`}>
                No credit card required. 14-day free trial.
              </p>
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FOOTER                                                         */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <Footer />
      </div>
    </div>
  );
};

export default React.memo(Home);
