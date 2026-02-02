import React, { useEffect, useCallback, useState } from 'react';
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useAuthActions, useAuthState } from '@/contexts/AuthContext';
import { LandingNav } from '@/components/LandingNav';
import { useNavigate } from 'react-router-dom';
import { useTheme } from 'next-themes';
import { 
  ArrowRight, 
  CheckCircle, 
  Check,
  Plus, 
  CheckSquare, 
  Sparkles, 
  StickyNote, 
  ChevronDown, 
  Palette, 
  Users,
  TrendingUp,
  Calendar,
  Zap,
  FileText,
  Globe,
  ChevronLeft,
  ChevronRight,
  Layers,
  Settings,
  Shield,
  Lock,
  Cloud,
  Key,
  XCircle,
  DollarSign,
  BarChart3,
  Mail,
  MessageSquare,
  CreditCard,
  Workflow,
  Search,
  Clock
} from 'lucide-react';
import BackgroundClouds from '@/components/ui/BackgroundClouds';
import { PricingCards } from '@/components/subscription';
import {
  Carousel,
  CarouselContent,
  CarouselItem,
  type CarouselApi,
} from "@/components/ui/carousel";
import FeatureRow from './home/components/FeatureRow';
import DashboardMock from './home/components/DashboardMock';
import WorkspacesMockLarge from './home/components/WorkspacesMockLarge';
import ContactsMockLarge from './home/components/ContactsMockLarge';
import PipelinesMockLarge from './home/components/PipelinesMockLarge';
import CalendarsMockLarge from './home/components/CalendarsMockLarge';
import AutomationsMockLarge from './home/components/AutomationsMockLarge';

const Home: React.FC = () => {
  const { currentUser, isAuthenticated, token } = useAuthState();
  const { login } = useAuthActions();
  const { theme } = useTheme();
  const navigate = useNavigate();
  const navigatedRef = React.useRef(false);

  // Theme-aware styling
  const isLight = theme === 'light';
  const bgGradient = isLight
    ? 'bg-gradient-to-br from-blue-50 to-indigo-100'
    : 'bg-gradient-to-br from-slate-900 to-slate-800';
  const textColor = isLight ? 'text-gray-900' : 'text-slate-100';
  const secondaryTextColor = isLight ? 'text-gray-600' : 'text-slate-400';
  const mutedTextColor = isLight ? 'text-gray-500' : 'text-slate-500';
  const cardBgColor = isLight ? 'bg-white' : 'bg-slate-800';
  const cardBorderColor = isLight ? 'border-gray-200' : 'border-slate-700';
  const patternColor = isLight ? 'bg-blue-400' : 'bg-slate-600';
  const accentGradient = 'bg-gradient-to-r from-blue-600 to-indigo-600';
  const accentGradientHover = 'hover:from-blue-700 hover:to-indigo-700';

  // If user is already authenticated, redirect to canvas
  useEffect(() => {
    if (isAuthenticated && !navigatedRef.current) {
      navigatedRef.current = true;
      setTimeout(() => navigate('/dashboard'), 0);
    }
  }, [currentUser, navigate, isAuthenticated, token]);

  const handleGetStarted = () => {
    navigate('/register');
  };

  const handleSignIn = () => {
    navigate('/login');
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className={`min-h-screen ${bgGradient} overflow-hidden relative`}>
      {/* Background Clouds */}
      <BackgroundClouds opacity={isLight ? 0.15 : 0.1} cloudCount={12} isLight={isLight} />

      {/* Background Pattern */}
      <div className="absolute inset-0 z-0 opacity-20 pointer-events-none">
        <div className="absolute top-0 left-0 w-full h-full">
          {Array.from({ length: 8 }).map((_, i) => (
            <div
              key={`pattern-${i}`}
              className={`absolute rounded-full ${patternColor}`}
              style={{
                width: `${Math.random() * 300 + 100}px`,
                height: `${Math.random() * 300 + 100}px`,
                top: `${Math.random() * 100}%`,
                left: `${Math.random() * 100}%`,
                opacity: Math.random() * 0.15,
                transform: `scale(${Math.random() * 1 + 0.5})`,
                filter: 'blur(80px)'
              }}
            />
          ))}
        </div>
      </div>

      {/* Landing Navigation */}
      <LandingNav />

      {/* Main Content */}
      <div className="relative z-10">
        
        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 1: HERO */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="hero" className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4 pt-16 md:pt-32 pb-16 md:pb-24">
          <div className="grid lg:grid-cols-2 gap-12 items-center">
            {/* Left: Text Content */}
            <div className="text-center lg:text-left">
              {/* Hero Headline */}
              <h1 className={`text-3xl md:text-4xl lg:text-5xl font-bold tracking-tight ${textColor} mb-6`}>
                The CRM that works{' '}
                <span className="bg-gradient-to-r from-blue-600 to-indigo-600 bg-clip-text text-transparent">
                  for you
                </span>
                <br />
                <span className={secondaryTextColor}>not against you</span>
              </h1>
              
              {/* Subheadline */}
              <p className={`text-lg ${secondaryTextColor} mb-8 max-w-xl mx-auto lg:mx-0`}>
                Stop juggling spreadsheets and disconnected tools. Itemize brings your contacts, 
                deals, and workflows together with beautiful workspaces—so you can focus on growing.
              </p>
              
              {/* CTA Buttons */}
              <div className="flex flex-col sm:flex-row gap-4 justify-center lg:justify-start mb-6">
                <Button 
                  onClick={handleGetStarted}
                  className={`rounded-lg px-8 py-6 ${accentGradient} ${accentGradientHover} text-white text-lg font-medium shadow-lg shadow-blue-500/25`}
                  size="lg"
                >
                  Start Free Trial
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Button>
                <Button 
                  variant="outline"
                  className={`rounded-lg px-8 py-6 text-lg font-medium ${isLight ? 'border-gray-300 hover:bg-gray-50' : 'border-slate-600 hover:bg-slate-800'}`}
                  size="lg"
                  onClick={() => scrollToSection('how-it-works')}
                >
                  See How It Works
                </Button>
              </div>
              
              {/* Trust Badges */}
              <div className="flex flex-wrap gap-4 justify-center lg:justify-start">
                <span className={`flex items-center gap-2 text-sm ${mutedTextColor}`}>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  14-day free trial
                </span>
                <span className={`flex items-center gap-2 text-sm ${mutedTextColor}`}>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  No credit card required
                </span>
                <span className={`flex items-center gap-2 text-sm ${mutedTextColor}`}>
                  <CheckCircle className="h-4 w-4 text-green-500" />
                  Cancel anytime
                </span>
              </div>
            </div>

            {/* Right: App Preview */}
            <div className="relative">
              <div className={`${cardBgColor} rounded-2xl border ${cardBorderColor} shadow-2xl overflow-hidden`}>
                {/* App Header - Clean dashboard header style */}
                <div className={`flex items-center justify-between px-4 py-3 border-b ${cardBorderColor}`}>
                  <div className="flex items-center gap-2">
                    <img src="/icon.png" alt="" className="h-5 w-5" />
                    <span className={`text-sm font-medium ${isLight ? 'text-gray-800' : 'text-slate-200'}`}>Dashboard</span>
                  </div>
                  <div className={`flex items-center gap-3`}>
                    <div className={`w-6 h-6 rounded-full ${isLight ? 'bg-blue-100' : 'bg-blue-900'} flex items-center justify-center`}>
                      <span className={`text-xs font-medium ${isLight ? 'text-blue-700' : 'text-blue-300'}`}>JD</span>
                    </div>
                  </div>
                </div>
                {/* App Content */}
                <div className="p-4">
                  <DashboardMock isLight={isLight} />
                </div>
              </div>
              {/* Floating accent elements */}
              <div className="absolute -top-4 -right-4 w-20 h-20 bg-gradient-to-br from-blue-400 to-indigo-500 rounded-2xl opacity-20 blur-xl" />
              <div className="absolute -bottom-4 -left-4 w-16 h-16 bg-gradient-to-br from-indigo-400 to-purple-500 rounded-xl opacity-20 blur-xl" />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 2: PROBLEM STATEMENT */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="problem" className={`py-16 md:py-24 ${isLight ? 'bg-white/50' : 'bg-slate-900/50'}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="text-center mb-12">
              <h2 className={`text-2xl md:text-3xl font-bold ${textColor} mb-4`}>
                Tired of juggling disconnected tools?
              </h2>
              <p className={`max-w-2xl mx-auto ${secondaryTextColor}`}>
                Most businesses waste hours every week switching between apps. Sound familiar?
              </p>
            </div>

            <div className="grid md:grid-cols-3 gap-6 mb-12">
              {[
                { icon: XCircle, title: 'Scattered Data', desc: 'Customer info spread across spreadsheets, emails, and sticky notes' },
                { icon: DollarSign, title: 'Tool Overload', desc: 'Paying for CRM + calendar + forms + automation separately' },
                { icon: BarChart3, title: 'No Clear Picture', desc: "Can't see your pipeline, contacts, and tasks in one view" },
              ].map((pain, i) => (
                <div 
                  key={i} 
                  className={`${cardBgColor} rounded-xl border ${cardBorderColor} p-6 text-center`}
                >
                  <div className={`w-12 h-12 rounded-full ${isLight ? 'bg-red-50' : 'bg-red-900/30'} flex items-center justify-center mx-auto mb-4`}>
                    <pain.icon className={`h-6 w-6 ${isLight ? 'text-red-500' : 'text-red-400'}`} />
                  </div>
                  <h3 className={`font-semibold ${textColor} mb-2`}>{pain.title}</h3>
                  <p className={`text-sm ${secondaryTextColor}`}>{pain.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-center">
              <p className={`text-lg font-medium ${textColor}`}>
                There's a better way →
              </p>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 3: VALUE FLOW (Organize → Automate → Grow) */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="how-it-works" className="py-16 md:py-24">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="text-center mb-16">
              <Badge className={`mb-4 ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/50 text-blue-300'}`}>
                How It Works
              </Badge>
              <h2 className={`text-3xl md:text-4xl font-bold ${textColor} mb-4`}>
                Three steps to a better business
              </h2>
            </div>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                { 
                  step: '1', 
                  title: 'Organize', 
                  desc: 'Bring all your contacts, notes, and ideas into one unified workspace.',
                  icon: Layers,
                  color: 'from-blue-500 to-blue-600'
                },
                { 
                  step: '2', 
                  title: 'Automate', 
                  desc: 'Set up workflows that handle follow-ups, reminders, and busywork.',
                  icon: Zap,
                  color: 'from-indigo-500 to-indigo-600'
                },
                { 
                  step: '3', 
                  title: 'Grow', 
                  desc: 'Focus on relationships and closing deals while the system works for you.',
                  icon: TrendingUp,
                  color: 'from-emerald-500 to-emerald-600'
                },
              ].map((item, i) => (
                <div key={i} className="text-center">
                  <div className={`w-16 h-16 rounded-2xl bg-gradient-to-br ${item.color} flex items-center justify-center mx-auto mb-6 shadow-lg`}>
                    <item.icon className="h-8 w-8 text-white" />
                  </div>
                  <div className={`text-sm font-medium ${isLight ? 'text-blue-600' : 'text-blue-400'} mb-2`}>
                    Step {item.step}
                  </div>
                  <h3 className={`text-xl font-bold ${textColor} mb-3`}>{item.title}</h3>
                  <p className={secondaryTextColor}>{item.desc}</p>
                </div>
              ))}
            </div>

            <div className="text-center mt-12">
              <Button 
                onClick={handleGetStarted}
                className={`${accentGradient} ${accentGradientHover} text-white px-8 py-6 text-lg rounded-lg shadow-lg shadow-blue-500/25`}
              >
                Start Organizing Today
                <ArrowRight className="ml-2 h-5 w-5" />
              </Button>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 4: UNIQUE DIFFERENTIATOR - WORKSPACES */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="workspaces" className={`py-16 md:py-24 ${isLight ? 'bg-gradient-to-br from-indigo-50 to-blue-50' : 'bg-gradient-to-br from-indigo-950/50 to-slate-900'}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="grid lg:grid-cols-2 gap-12 items-center">
              {/* Left: Visual */}
              <div className="order-2 lg:order-1">
                <div className={`${cardBgColor} rounded-2xl border ${cardBorderColor} p-6 shadow-xl`}>
                  <WorkspacesMockLarge isLight={isLight} />
                </div>
              </div>

              {/* Right: Content */}
              <div className="order-1 lg:order-2">
                <Badge className={`mb-4 bg-gradient-to-r from-violet-500 to-purple-600 text-white`}>
                  <Sparkles className="h-3 w-3 mr-1" />
                  Unique to Itemize
                </Badge>
                <h2 className={`text-3xl md:text-4xl font-bold ${textColor} mb-6`}>
                  The only CRM with built-in Workspaces
                </h2>
                <p className={`text-lg ${secondaryTextColor} mb-6`}>
                  Other CRMs force you to keep notes in separate apps. Itemize includes 
                  powerful lists, notes, and whiteboards—right alongside your contacts and deals.
                </p>
                <ul className="space-y-4 mb-8">
                  {[
                    { icon: CheckSquare, text: 'Smart lists with AI-powered suggestions' },
                    { icon: StickyNote, text: 'Rich notes with formatting and media' },
                    { icon: Palette, text: 'Infinite whiteboards for brainstorming' },
                    { icon: Sparkles, text: 'Everything synced and searchable' },
                  ].map((item, i) => (
                    <li key={i} className="flex items-center gap-3">
                      <div className={`w-8 h-8 rounded-lg ${isLight ? 'bg-indigo-100' : 'bg-indigo-900/50'} flex items-center justify-center`}>
                        <item.icon className={`h-4 w-4 ${isLight ? 'text-indigo-600' : 'text-indigo-400'}`} />
                      </div>
                      <span className={textColor}>{item.text}</span>
                    </li>
                  ))}
                </ul>
                <Button 
                  onClick={handleGetStarted}
                  variant="outline"
                  className={`${isLight ? 'border-indigo-300 text-indigo-700 hover:bg-indigo-50' : 'border-indigo-600 text-indigo-400 hover:bg-indigo-950'}`}
                >
                  Try Workspaces Free
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 5: FEATURE DEEP-DIVES */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="features" className="py-16 md:py-24">
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="text-center mb-16">
              <Badge className={`mb-4 ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900/50 text-blue-300'}`}>
                Features
              </Badge>
              <h2 className={`text-3xl md:text-4xl font-bold ${textColor} mb-4`}>
                Everything you need to grow
              </h2>
              <p className={`max-w-2xl mx-auto ${secondaryTextColor}`}>
                From first contact to closed deal, Itemize has you covered.
              </p>
            </div>

            <div className="space-y-24">
              {/* Feature 1: Contact Management */}
              <FeatureRow
                isLight={isLight}
                cardBgColor={cardBgColor}
                cardBorderColor={cardBorderColor}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                reverse={false}
                badge={{ icon: Users, label: 'Contact Management', color: 'from-blue-500 to-cyan-500' }}
                title="Every customer, every interaction, one view"
                description="Stop searching through emails and spreadsheets. See your complete customer history, notes, deals, and communications in one unified profile."
                features={['Unlimited contacts', 'Custom fields & tags', 'Activity timeline', 'Smart segmentation']}
                visual={<ContactsMockLarge isLight={isLight} />}
              />

              {/* Feature 2: Sales Pipelines */}
              <FeatureRow
                isLight={isLight}
                cardBgColor={cardBgColor}
                cardBorderColor={cardBorderColor}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                reverse={true}
                badge={{ icon: TrendingUp, label: 'Sales Pipelines', color: 'from-emerald-500 to-teal-500' }}
                title="Visual deal tracking that makes sense"
                description="Drag deals through custom stages, see your revenue forecast at a glance, and never let an opportunity slip through the cracks."
                features={['Kanban boards', 'Custom stages', 'Deal values & forecasting', 'Win/loss tracking']}
                visual={<PipelinesMockLarge isLight={isLight} />}
              />

              {/* Feature 3: Calendars & Booking */}
              <FeatureRow
                isLight={isLight}
                cardBgColor={cardBgColor}
                cardBorderColor={cardBorderColor}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                reverse={false}
                badge={{ icon: Calendar, label: 'Calendars & Booking', color: 'from-orange-500 to-amber-500' }}
                title="Let clients book, you stay focused"
                description="Share your availability and let clients book directly into your calendar. Automatic reminders reduce no-shows and save hours of back-and-forth."
                features={['Online booking pages', 'Google Calendar sync', 'Automatic reminders', 'Buffer times & limits']}
                visual={<CalendarsMockLarge isLight={isLight} />}
              />

              {/* Feature 4: Automations */}
              <FeatureRow
                isLight={isLight}
                cardBgColor={cardBgColor}
                cardBorderColor={cardBorderColor}
                textColor={textColor}
                secondaryTextColor={secondaryTextColor}
                reverse={true}
                badge={{ icon: Zap, label: 'Automations', color: 'from-pink-500 to-rose-500' }}
                title="Set it up once, let it work forever"
                description="Build workflows that automatically send emails, update contacts, create tasks, and trigger actions—so you can focus on what matters."
                features={['Visual workflow builder', 'Email sequences', 'Trigger-based actions', 'Conditional logic']}
                visual={<AutomationsMockLarge isLight={isLight} />}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 6: INTEGRATIONS */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="integrations" className={`py-16 md:py-24 ${isLight ? 'bg-white/50' : 'bg-slate-900/50'}`}>
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-4 text-center">
            <Badge className={`mb-4 ${isLight ? 'bg-gray-100 text-gray-700' : 'bg-slate-700 text-slate-300'}`}>
              Integrations
            </Badge>
            <h2 className={`text-2xl md:text-3xl font-bold ${textColor} mb-4`}>
              Connects with tools you already use
            </h2>
            <p className={`max-w-xl mx-auto ${secondaryTextColor} mb-12`}>
              Itemize works seamlessly with the apps you rely on every day.
            </p>

            <div className="flex flex-wrap justify-center gap-8 mb-8">
              {[
                { name: 'Stripe', icon: CreditCard },
                { name: 'Google Calendar', icon: Calendar },
                { name: 'Gmail', icon: Mail },
                { name: 'Twilio', icon: MessageSquare },
                { name: 'Webhooks', icon: Globe },
                { name: 'Zapier', icon: Zap, soon: true },
              ].map((integration, i) => (
                <div 
                  key={i} 
                  className={`flex flex-col items-center gap-2 p-4 rounded-xl ${cardBgColor} border ${cardBorderColor} min-w-[100px]`}
                >
                  <integration.icon className={`h-8 w-8 ${isLight ? 'text-gray-600' : 'text-slate-400'}`} />
                  <span className={`text-sm font-medium ${textColor}`}>{integration.name}</span>
                  {integration.soon && (
                    <span className={`text-xs ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>Coming soon</span>
                  )}
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 7: TRUST & SECURITY */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="security" className="py-16 md:py-24">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-4 text-center">
            <h2 className={`text-2xl md:text-3xl font-bold ${textColor} mb-4`}>
              Your data, protected
            </h2>
            <p className={`max-w-xl mx-auto ${secondaryTextColor} mb-12`}>
              Security isn't an afterthought—it's built into everything we do.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-6">
              {[
                { icon: Lock, label: '256-bit Encryption' },
                { icon: Shield, label: 'GDPR Ready' },
                { icon: Cloud, label: '99.9% Uptime' },
                { icon: Key, label: 'Secure Auth' },
              ].map((item, i) => (
                <div key={i} className="flex flex-col items-center gap-3">
                  <div className={`w-12 h-12 rounded-full ${isLight ? 'bg-green-50' : 'bg-green-900/30'} flex items-center justify-center`}>
                    <item.icon className={`h-6 w-6 ${isLight ? 'text-green-600' : 'text-green-400'}`} />
                  </div>
                  <span className={`text-sm font-medium ${textColor}`}>{item.label}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 8: PRICING */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="pricing" className={`py-16 md:py-24 ${isLight ? 'bg-white/50' : 'bg-slate-900/50'}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="text-center mb-12">
              <Badge className={`mb-4 ${isLight ? 'bg-green-100 text-green-700' : 'bg-green-900/50 text-green-300'}`}>
                Pricing
              </Badge>
              <h2 className={`text-3xl md:text-4xl font-bold ${textColor} mb-4`}>
                Simple, transparent pricing
              </h2>
              <p className={`max-w-2xl mx-auto ${secondaryTextColor}`}>
                Start free, upgrade when you need more power. No hidden fees.
              </p>
            </div>
            
            <div className={`${cardBgColor} rounded-2xl p-6 md:p-8 border ${cardBorderColor}`}>
              <PricingCards 
                variant="landing"
                showYearlyToggle={false}
                onUpgrade={() => handleGetStarted()}
              />
            </div>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* SECTION 9: FINAL CTA */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <section id="cta" className="py-20 md:py-32">
          <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-4 text-center">
            <h2 className={`text-3xl md:text-4xl font-bold ${textColor} mb-6`}>
              Ready to simplify your business?
            </h2>
            <p className={`text-lg ${secondaryTextColor} mb-8 max-w-2xl mx-auto`}>
              Join businesses using Itemize to organize, automate, and grow. 
              Start your free trial today—no credit card required.
            </p>
            <Button 
              onClick={handleGetStarted}
              className={`rounded-lg px-10 py-6 ${accentGradient} ${accentGradientHover} text-white text-lg font-medium shadow-lg shadow-blue-500/25`}
              size="lg"
            >
              Get Started Free
              <ArrowRight className="ml-2 h-5 w-5" />
            </Button>
          </div>
        </section>

        {/* ═══════════════════════════════════════════════════════════════ */}
        {/* FOOTER */}
        {/* ═══════════════════════════════════════════════════════════════ */}
        <footer className={`py-12 border-t ${cardBorderColor}`}>
          <div className="max-w-[1400px] mx-auto px-4 sm:px-6 lg:px-4">
            <div className="flex flex-col md:flex-row justify-between items-center gap-6">
              <div className="flex items-center gap-3">
                <img 
                  src={isLight ? "/textblack.png" : "/textwhite.png"}
                  alt="Itemize" 
                  className="h-8 w-auto"
                />
              </div>
              <div className={`flex gap-6 text-sm ${secondaryTextColor}`}>
                <button onClick={() => scrollToSection('features')} className="hover:underline">Features</button>
                <button onClick={() => navigate('/help')} className="hover:underline">Help</button>
                <button onClick={() => navigate('/status')} className="hover:underline">Status</button>
              </div>
              <p className={`text-sm ${mutedTextColor}`}>
                © 2026 Itemize. All rights reserved.
              </p>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
};

export default Home;
