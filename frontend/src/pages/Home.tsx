import React, { useEffect, useMemo, useState, useCallback } from 'react';
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
} from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import { PricingCards } from '@/components/subscription';
import AppScreenshot from './home/components/AppScreenshot';
import FeatureShowcase from './home/components/FeatureShowcase';
import { IntegrationGrid } from './home/components/IntegrationLogos';
import { useRevealClass } from '@/hooks/useScrollReveal';

/* ═══════════════════════════════════════════════════════════════ */
/* Reusable reveal wrapper for sections                           */
/* ═══════════════════════════════════════════════════════════════ */
const RevealSection = React.memo(function RevealSection({ 
  children, 
  variant = 'fade-up' as const, 
  delay = 0,
  className = '',
  isFastScrolling = false,
}: { 
  children: React.ReactNode; 
  variant?: 'fade-up' | 'fade' | 'scale'; 
  delay?: number;
  className?: string;
  isFastScrolling?: boolean;
}) {
  const reveal = useRevealClass(variant, { delay, isFastScrolling });
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
  
  // Scroll velocity tracking
  const [isFastScrolling, setIsFastScrolling] = useState(false);
  const scrollTimeoutRef = React.useRef<NodeJS.Timeout>();
  const lastScrollYRef = React.useRef(0);
  const lastScrollTimeRef = React.useRef(0);
  const velocityThreshold = 15; // pixels per ms to consider "fast"
  const scrollCooldown = 150; // ms to stay in "fast" state after scroll stops

  useEffect(() => {
    let rafId: number;
    let lastY = 0;
    let lastTime = 0;

    const handleScroll = () => {
      const now = performance.now();
      const y = window.scrollY;
      
      if (lastTime > 0) {
        const deltaTime = now - lastTime;
        const deltaY = Math.abs(y - lastY);
        const velocity = deltaY / deltaTime;
        
        if (velocity > velocityThreshold) {
          setIsFastScrolling(true);
          
          if (scrollTimeoutRef.current) {
            clearTimeout(scrollTimeoutRef.current);
          }
          
          scrollTimeoutRef.current = setTimeout(() => {
            setIsFastScrolling(false);
          }, scrollCooldown);
        }
      }
      
      lastY = y;
      lastTime = now;
      
      rafId = requestAnimationFrame(handleScroll);
    };

    rafId = requestAnimationFrame(handleScroll);

    return () => {
      cancelAnimationFrame(rafId);
      if (scrollTimeoutRef.current) {
        clearTimeout(scrollTimeoutRef.current);
      }
    };
  }, [velocityThreshold, scrollCooldown]);

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
        <div className={`absolute -top-40 -right-40 w-[600px] h-[600px] rounded-full ${isLight ? 'bg-blue-400' : 'bg-blue-600'} opacity-[0.04] blur-[100px]`} style={{ willChange: 'transform' }} />
        <div className={`absolute top-[40%] -left-40 w-[500px] h-[500px] rounded-full ${isLight ? 'bg-indigo-400' : 'bg-indigo-600'} opacity-[0.04] blur-[100px]`} style={{ willChange: 'transform' }} />
        <div className={`absolute bottom-20 right-[20%] w-[400px] h-[400px] rounded-full ${isLight ? 'bg-violet-300' : 'bg-violet-600'} opacity-[0.03] blur-[100px]`} style={{ willChange: 'transform' }} />
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
              <RevealSection variant="fade-up" delay={0} isFastScrolling={isFastScrolling}>
                <h1 className={`landing-heading text-4xl md:text-5xl lg:text-[3.5rem] xl:text-6xl font-extrabold tracking-tight leading-[1.1] ${textColor} mb-6`}>
                  The CRM that works{' '}
                  <span className={isLight ? 'text-blue-600' : 'text-blue-400'}>for you</span>
                  <br />
                  not against you
                </h1>
              </RevealSection>

              <RevealSection variant="fade-up" delay={100} isFastScrolling={isFastScrolling}>
                <p className={`text-lg md:text-xl leading-relaxed ${secondaryTextColor} mb-10 max-w-2xl mx-auto`}>
                  Stop juggling spreadsheets and disconnected tools. Itemize brings your contacts, 
                  deals, and workflows together with beautiful workspaces.
                </p>
              </RevealSection>

              <RevealSection variant="fade-up" delay={200} isFastScrolling={isFastScrolling}>
                <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
                  <Button 
                    onClick={handleGetStarted}
                    className={`rounded-xl px-8 py-6 ${accentGradient} ${accentGradientHover} text-white text-lg font-semibold shadow-xl shadow-blue-500/20 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-0.5`}
                    size="lg"
                  >
                    Start Free Trial
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Button>
                  <Button 
                    variant="outline"
                    className={`rounded-xl px-8 py-6 text-lg font-semibold ${isLight ? 'border-gray-300 hover:bg-gray-50 text-gray-700' : 'border-slate-600 hover:bg-slate-800 text-slate-300'}`}
                    size="lg"
                    onClick={() => scrollToSection('how-it-works')}
                  >
                    See How It Works
                  </Button>
                </div>
              </RevealSection>

              <RevealSection variant="fade" delay={300} isFastScrolling={isFastScrolling}>
                <div className="flex flex-wrap gap-6 justify-center">
                  {['14-day free trial', 'No credit card required', 'Cancel anytime'].map((text) => (
                    <span key={text} className={`flex items-center gap-2 text-sm font-medium ${mutedTextColor}`}>
                      <CheckCircle className="h-4 w-4 text-emerald-500" />
                      {text}
                    </span>
                  ))}
                </div>
              </RevealSection>
            </div>

            {/* Full-width hero screenshot with perspective */}
            <RevealSection variant="scale" delay={400} isFastScrolling={isFastScrolling}>
              <div className="screenshot-perspective max-w-5xl mx-auto" style={{ willChange: 'transform, opacity' }}>
                <AppScreenshot
                  label="Dashboard"
                  sublabel="Replace with screenshot of your real dashboard"
                  accentFrom="from-blue-500"
                  accentTo="to-indigo-600"
                  isLight={isLight}
                  showChrome={true}
                  aspectRatio="aspect-[16/10]"
                  className="screenshot-tilt"
                />
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: PROBLEM STATEMENT                                   */}
        {/* Asymmetric cards with stronger visual hierarchy                */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="problem" className="py-20 md:py-32" style={{ contain: 'layout style' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection isFastScrolling={isFastScrolling}>
              <div className="text-center mb-16">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-red-500' : 'text-red-400'} mb-4`}>
                  Sound familiar?
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor}`}>
                  Tired of juggling disconnected tools?
                </h2>
              </div>
            </RevealSection>

            <div className="grid md:grid-cols-3 gap-6 mb-16">
              {[
                { 
                  title: 'Scattered Data', 
                  desc: 'Customer info spread across spreadsheets, emails, and sticky notes. Nothing connects.',
                  gradient: 'from-red-500 to-orange-500',
                  number: '01',
                },
                { 
                  title: 'Tool Overload', 
                  desc: 'Paying for CRM + calendar + forms + automation separately. Stitching them together is a nightmare.',
                  gradient: 'from-orange-500 to-amber-500',
                  number: '02',
                },
                { 
                  title: 'No Clear Picture', 
                  desc: "Can't see your pipeline, contacts, and tasks in one view. Decisions are based on gut, not data.",
                  gradient: 'from-amber-500 to-yellow-500',
                  number: '03',
                },
              ].map((pain, i) => (
                <RevealSection key={i} variant="fade-up" delay={i * 100} isFastScrolling={isFastScrolling}>
                  <div className={`relative ${cardBgColor} rounded-2xl border ${cardBorderColor} p-8 h-full group hover:shadow-lg transition-all duration-300`}>
                    {/* Number accent */}
                    <span className={`absolute top-6 right-6 text-5xl font-extrabold ${isLight ? 'text-gray-100' : 'text-slate-700'} select-none leading-none`}>
                      {pain.number}
                    </span>
                    {/* Gradient top bar */}
                    <div className={`w-12 h-1 rounded-full bg-gradient-to-r ${pain.gradient} mb-6`} />
                    <h3 className={`landing-heading text-xl font-bold ${textColor} mb-3 relative`}>{pain.title}</h3>
                    <p className={`${secondaryTextColor} leading-relaxed relative`}>{pain.desc}</p>
                  </div>
                </RevealSection>
              ))}
            </div>

            <RevealSection isFastScrolling={isFastScrolling}>
              <div className="text-center">
                <p className={`text-xl font-semibold ${textColor}`}>
                  There's a better way <span className="landing-gradient-text font-bold">→</span>
                </p>
              </div>
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: HOW IT WORKS                                        */}
        {/* Connected steps with visual flow line                          */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className={`py-20 md:py-32 relative ${isLight ? 'bg-white/60' : 'bg-slate-800/40'}`} style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection isFastScrolling={isFastScrolling}>
              <div className="text-center mb-20">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-4`}>
                  How It Works
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor}`}>
                  Three steps to a better business
                </h2>
              </div>
            </RevealSection>

            <div className="relative">
              {/* Connecting line (desktop) */}
              <div className={`hidden md:block absolute top-24 left-[16.66%] right-[16.66%] h-px ${isLight ? 'bg-gray-200' : 'bg-slate-700'}`} />

              <div className="grid md:grid-cols-3 gap-12 md:gap-8">
                {[
                  { 
                    step: '1', 
                    title: 'Organize', 
                    desc: 'Bring all your contacts, notes, and ideas into one unified workspace. No more switching tabs.',
                    icon: Layers,
                    gradient: 'from-blue-500 to-blue-600',
                    shadow: 'shadow-blue-500/20',
                  },
                  { 
                    step: '2', 
                    title: 'Automate', 
                    desc: 'Set up workflows that handle follow-ups, reminders, and busywork. It runs while you sleep.',
                    icon: Zap,
                    gradient: 'from-indigo-500 to-indigo-600',
                    shadow: 'shadow-indigo-500/20',
                  },
                  { 
                    step: '3', 
                    title: 'Grow', 
                    desc: 'Focus on relationships and closing deals while the system works for you. Watch the numbers climb.',
                    icon: TrendingUp,
                    gradient: 'from-emerald-500 to-emerald-600',
                    shadow: 'shadow-emerald-500/20',
                  },
                ].map((item, i) => (
                  <RevealSection key={i} variant="fade-up" delay={i * 150} isFastScrolling={isFastScrolling}>
                    <div className="text-center relative">
                      {/* Step circle */}
                      <div className={`w-20 h-20 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mx-auto mb-8 shadow-xl ${item.shadow} relative z-10`}>
                        <item.icon className="h-9 w-9 text-white" />
                      </div>
                      <div className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-3`}>
                        Step {item.step}
                      </div>
                      <h3 className={`landing-heading text-2xl font-bold ${textColor} mb-4`}>{item.title}</h3>
                      <p className={`${secondaryTextColor} leading-relaxed max-w-xs mx-auto`}>{item.desc}</p>
                    </div>
                  </RevealSection>
                ))}
              </div>
            </div>

            <RevealSection delay={500} isFastScrolling={isFastScrolling}>
              <div className="text-center mt-16">
                <Button 
                  onClick={handleGetStarted}
                  className={`rounded-xl px-8 py-6 ${accentGradient} ${accentGradientHover} text-white text-lg font-semibold shadow-xl shadow-blue-500/20 transition-all duration-300 hover:shadow-2xl hover:shadow-blue-500/30 hover:-translate-y-0.5`}
                  size="lg"
                >
                  Start Organizing Today
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
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
              <RevealSection variant="fade-up" delay={0} className="order-2 lg:order-1" isFastScrolling={isFastScrolling}>
                <div className="screenshot-perspective">
                  <AppScreenshot
                    label="Workspaces"
                    sublabel="Lists, Notes, and Whiteboards alongside your CRM"
                    accentFrom="from-blue-500"
                    accentTo="to-indigo-600"
                    isLight={isLight}
                    showChrome={true}
                    className="screenshot-tilt"
                  />
                </div>
              </RevealSection>

              {/* Content */}
              <RevealSection variant="fade-up" delay={150} className="order-1 lg:order-2" isFastScrolling={isFastScrolling}>
                <div>
                  <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm font-semibold mb-6 bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-lg shadow-blue-500/20">
                    <Sparkles className="h-4 w-4" />
                    Unique to Itemize
                  </div>
                  <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-6 leading-tight`}>
                    The only CRM with built-in{' '}
                    <span className="landing-gradient-text">Workspaces</span>
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
            <RevealSection isFastScrolling={isFastScrolling}>
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

            <div className="space-y-28 md:space-y-36">
              {/* Feature 1: Contact Management */}
              <FeatureShowcase
                isLight={isLight}
                reverse={false}
                badge={{ icon: Users, label: 'Contact Management', color: 'from-blue-500 to-cyan-500' }}
                title="Every customer, every interaction, one view"
                description="Stop searching through emails and spreadsheets. See your complete customer history, notes, deals, and communications in one unified profile."
                features={['Unlimited contacts with custom fields', 'Activity timeline and interaction history', 'Smart tags and segmentation', 'CSV import and bulk operations']}
                screenshot={{ label: 'Contacts', sublabel: 'Full contact management with search and filters', accentFrom: 'from-blue-500', accentTo: 'to-cyan-500' }}
              />

              {/* Feature 2: Sales Pipelines */}
              <FeatureShowcase
                isLight={isLight}
                reverse={true}
                badge={{ icon: TrendingUp, label: 'Sales Pipelines', color: 'from-emerald-500 to-teal-500' }}
                title="Visual deal tracking that makes sense"
                description="Drag deals through custom stages, see your revenue forecast at a glance, and never let an opportunity slip through the cracks."
                features={['Drag-and-drop Kanban boards', 'Custom pipeline stages and deal values', 'Revenue forecasting and probability', 'Win/loss tracking and analytics']}
                screenshot={{ label: 'Pipelines', sublabel: 'Kanban board with drag-and-drop deal management', accentFrom: 'from-emerald-500', accentTo: 'to-teal-500' }}
              />

              {/* Feature 3: Calendars & Booking */}
              <FeatureShowcase
                isLight={isLight}
                reverse={false}
                badge={{ icon: Calendar, label: 'Calendars & Booking', color: 'from-orange-500 to-amber-500' }}
                title="Let clients book, you stay focused"
                description="Share your availability and let clients book directly. Automatic reminders reduce no-shows and save hours of back-and-forth scheduling."
                features={['Online booking pages with custom slugs', 'Google Calendar two-way sync', 'Automatic email reminders', 'Buffer times and daily limits']}
                screenshot={{ label: 'Calendars', sublabel: 'Booking calendar management and scheduling', accentFrom: 'from-orange-500', accentTo: 'to-amber-500' }}
              />

              {/* Feature 4: Automations */}
              <FeatureShowcase
                isLight={isLight}
                reverse={true}
                badge={{ icon: Zap, label: 'Automations', color: 'from-pink-500 to-rose-500' }}
                title="Set it up once, let it work forever"
                description="Build visual workflows that automatically send emails, update contacts, create tasks, and trigger actions -- so you can focus on what matters."
                features={['Visual drag-and-drop workflow builder', 'Email sequences with templates', '8 action types including webhooks', '6 trigger types with conditional logic']}
                screenshot={{ label: 'Automations', sublabel: 'Visual workflow builder with drag-and-drop nodes', accentFrom: 'from-pink-500', accentTo: 'to-rose-500' }}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 6: INTEGRATIONS                                        */}
        {/* Real brand logos in a grid                                     */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="integrations" className={`py-20 md:py-32 ${isLight ? 'bg-white/60' : 'bg-slate-800/40'}`} style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection isFastScrolling={isFastScrolling}>
              <div className="text-center mb-16">
                <p className={`text-sm font-bold uppercase tracking-widest ${mutedTextColor} mb-4`}>
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

            <RevealSection variant="fade-up" delay={150} isFastScrolling={isFastScrolling}>
              <IntegrationGrid isLight={isLight} />
            </RevealSection>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 7: TRUST & SECURITY                                    */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="security" className="py-20 md:py-28" style={{ contain: 'layout style' }}>
          <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection isFastScrolling={isFastScrolling}>
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
                <RevealSection key={i} variant="fade-up" delay={i * 80} isFastScrolling={isFastScrolling}>
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

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 8: PRICING                                             */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="pricing" className={`py-20 md:py-32 ${isLight ? 'bg-white/60' : 'bg-slate-800/40'}`} style={{ contain: 'layout style', contentVisibility: 'auto' }}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <RevealSection isFastScrolling={isFastScrolling}>
              <div className="text-center mb-14">
                <p className={`text-sm font-bold uppercase tracking-widest ${isLight ? 'text-emerald-600' : 'text-emerald-400'} mb-4`}>
                  Pricing
                </p>
                <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-5`}>
                  Simple, transparent pricing
                </h2>
                <p className={`max-w-2xl mx-auto text-lg ${secondaryTextColor}`}>
                  Start free, upgrade when you need more power. No hidden fees.
                </p>
              </div>
            </RevealSection>
            
            <RevealSection variant="fade-up" delay={100} isFastScrolling={isFastScrolling}>
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
            <RevealSection isFastScrolling={isFastScrolling}>
              <h2 className={`landing-heading text-3xl md:text-4xl lg:text-5xl font-extrabold ${textColor} mb-6 leading-tight`}>
                Ready to simplify{' '}
                <span className="landing-gradient-text">your business?</span>
              </h2>
              <p className={`text-lg md:text-xl ${secondaryTextColor} mb-10 max-w-2xl mx-auto leading-relaxed`}>
                Join businesses using Itemize to organize, automate, and grow. 
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
        {/* Clean, minimal                                                 */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <footer className={`py-12 border-t ${cardBorderColor}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-3">
                <img 
                  src={isLight ? "/textblack.png" : "/textwhite.png"}
                  alt="Itemize" 
                  className="h-7 w-auto"
                />
              </div>
              <div className={`flex gap-8 text-sm font-medium ${secondaryTextColor}`}>
                <button onClick={() => scrollToSection('features')} className="hover:text-blue-600 transition-colors">Features</button>
                <button onClick={() => navigate('/help')} className="hover:text-blue-600 transition-colors">Help</button>
                <button onClick={() => navigate('/status')} className="hover:text-blue-600 transition-colors">Status</button>
              </div>
              <p className={`text-sm ${mutedTextColor}`}>
                &copy; 2026 Itemize. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default React.memo(Home);
