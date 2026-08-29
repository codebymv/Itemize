import { OnboardingContent } from '@/components/OnboardingModal';
import { 
  Layout, 
  StickyNote, 
  CheckSquare, 
  Palette,
  Users,
  TrendingUp,
  FileText,
  Zap,
  Calendar,
  Mail,
  Inbox,
  Send,
  Globe,
  ClipboardList,
  CalendarCheck,
  MessageCircle,
  Share2,
  Star
} from 'lucide-react';

export const ONBOARDING_CONTENT: Record<string, OnboardingContent> = {
  canvas: {
    title: "Build your workspace",
    description: "Choose content and arrange it on one canvas.",
    version: "3.0",
    completeLabel: "Choose a format",
    steps: [
      {
        title: "Choose what belongs on your canvas",
        description: "Mix the content formats your work needs.",
        icon: <Layout className="h-12 w-12 text-primary" />,
        tips: [
          "Lists — track tasks and repeatable work",
          "Notes — capture context and ideas",
          "Whiteboards — sketch and brainstorm",
          "Wireframes — plan screens and layouts",
          "Vaults — protect sensitive information"
        ]
      },
      {
        title: "Arrange it around the way you work",
        description: "Move, resize, search, and filter as work changes.",
        icon: <Palette className="h-12 w-12 text-primary" />,
        tips: [
          "Drag items anywhere on the canvas",
          "Resize content to match its importance",
          "Search and filter across your workspace",
          "Share individual items when needed"
        ]
      }
    ]
  },

lists: {
    title: "Welcome to Lists",
    description: "Create and manage lists with powerful organization features",
    version: "1.0",
    steps: [
      {
        title: "Create Lists",
        description: "Add, organize, and complete list items.",
        icon: <CheckSquare className="h-12 w-12 text-primary" />,
        tips: [
          "Click 'New List' to create a list",
          "Add items with the '+' button",
          "Check boxes to mark items complete",
          "Drag to reorder items"
        ]
      },
      {
        title: "Categories & Colors",
        description: "Use categories and colors to organize your lists visually.",
        icon: <Palette className="h-12 w-12 text-primary" />,
        tips: [
          "Assign categories like 'Work', 'Personal', 'Shopping'",
          "Choose colors for easy identification",
          "Filter lists by category",
          "Search across all lists"
        ]
      }
    ]
  },

  notes: {
    title: "Welcome to Notes",
    description: "Capture and format ideas in rich-text notes.",
    version: "1.0",
    steps: [
      {
        title: "Create Notes",
        description: "Format text, add links, and use categories.",
        icon: <StickyNote className="h-12 w-12 text-primary" />,
        tips: [
          "Click 'New Note' to start writing",
          "Use rich text formatting",
          "Add links and images",
          "Organize with categories"
        ]
      },
      {
        title: "Sticky Note Style",
        description: "Arrange colorful notes anywhere on your canvas.",
        icon: <Palette className="h-12 w-12 text-primary" />,
        tips: [
          "Choose from multiple colors",
          "Resize notes to fit content",
          "Position anywhere on canvas",
          "Stack related notes together"
        ]
      }
    ]
  },

  whiteboards: {
    title: "Welcome to Whiteboards",
    description: "Visual brainstorming and diagramming space for your ideas",
    version: "1.0",
    steps: [
      {
        title: "Draw & Sketch",
        description: "Draw diagrams, flowcharts, and visual ideas.",
        icon: <Palette className="h-12 w-12 text-primary" />,
        tips: [
          "Use drawing tools to sketch",
          "Add shapes and connectors",
          "Insert text and labels",
          "Export as images"
        ]
      }
    ]
  },

  contacts: {
    title: "Welcome to CRM",
    description: "Manage your customer relationships and contacts in one place",
    version: "1.0",
    steps: [
      {
        title: "Contact Management",
        description: "Keep customer details and history together.",
        icon: <Users className="h-12 w-12 text-primary" />,
        tips: [
          "Add contacts with full details",
          "Track interaction history",
          "Tag and categorize contacts",
          "Import from CSV files"
        ]
      },
      {
        title: "Communication",
        description: "Send emails and track all communications with your contacts.",
        icon: <Mail className="h-12 w-12 text-primary" />,
        tips: [
          "Send emails directly from CRM",
          "Log calls and meetings",
          "Set reminders for follow-ups",
          "View complete communication history"
        ]
      }
    ]
  },

  pipelines: {
    title: "Welcome to Pipelines",
    description: "Track deals and opportunities through your sales process",
    version: "1.0",
    steps: [
      {
        title: "Sales Pipeline",
        description: "Visualize your sales process with customizable pipeline stages.",
        icon: <TrendingUp className="h-12 w-12 text-primary" />,
        tips: [
          "Drag deals between stages",
          "Track deal values and probabilities",
          "Set expected close dates",
          "Monitor pipeline health"
        ]
      }
    ]
  },

  invoices: {
    title: "Explore Sales & Payments",
    description: "Price work, bill clients, and track payments.",
    version: "2.0",
    completeLabel: "Explore sales tools",
    steps: [
      {
        title: "Price and bill your work",
        description: "Use estimates, invoices, or recurring billing.",
        icon: <FileText className="h-12 w-12 text-primary" />,
        tips: [
          "Estimates — propose a price and record approval",
          "Invoices — bill completed or in-progress work",
          "Recurring invoices — automate repeat billing",
          "Products — reuse your standard services and prices"
        ]
      },
      {
        title: "Track what gets paid",
        description: "Track document status, payments, and overdue balances.",
        icon: <TrendingUp className="h-12 w-12 text-primary" />,
        tips: [
          "See draft, sent, paid, and overdue work",
          "Review payment activity in one place",
          "Follow up on outstanding balances",
          "Keep every transaction tied to its client"
        ]
      }
    ]
  },

  automations: {
    title: "Welcome to Automations",
    description: "Automate repetitive tasks and workflows to save time",
    version: "1.0",
    steps: [
      {
        title: "Workflow Builder",
        description: "Create powerful automations with our visual workflow builder.",
        icon: <Zap className="h-12 w-12 text-primary" />,
        tips: [
          "Drag and drop to build workflows",
          "Set triggers and conditions",
          "Connect multiple actions",
          "Test before activating"
        ]
      },
      {
        title: "Common Automations",
        description: "Automate email sequences, task assignments, and more.",
        icon: <Mail className="h-12 w-12 text-primary" />,
        tips: [
          "Auto-respond to new contacts",
          "Schedule follow-up emails",
          "Assign tasks automatically",
          "Move deals through pipelines"
        ]
      }
    ]
  },

  calendars: {
    title: "Explore Scheduling",
    description: "Set availability, accept bookings, and connect calendars.",
    version: "2.0",
    completeLabel: "Explore scheduling",
    steps: [
      {
        title: "Make your time bookable",
        description: "Set availability, duration, and booking rules.",
        icon: <Calendar className="h-12 w-12 text-primary" />,
        tips: [
          "Calendars — define availability and booking rules",
          "Bookings — manage upcoming appointments",
          "Share booking links with clients",
          "Use reminders to reduce missed meetings"
        ]
      },
      {
        title: "Keep your calendars connected",
        description: "Keep availability aligned with external calendars.",
        icon: <CalendarCheck className="h-12 w-12 text-primary" />,
        tips: [
          "Calendar integrations — connect supported providers",
          "Choose which calendars affect availability",
          "Keep Itemize bookings visible in your schedule",
          "Review integration status when something changes"
        ]
      }
    ]
  },

  dashboard: {
    title: "Welcome to Your Dashboard",
    description: "Your central hub for insights and quick access to all features",
    version: "1.0",
    steps: [
      {
        title: "Overview",
        description: "See metrics, activity, and updates at a glance.",
        icon: <Layout className="h-12 w-12 text-primary" />,
        tips: [
          "View recent items and activity",
          "Monitor important metrics",
          "Quick access to all features",
          "Customize your dashboard layout"
        ]
      }
    ]
  },

  inbox: {
    title: "Explore Communications",
    description: "Bring customer conversations into one inbox.",
    version: "2.0",
    completeLabel: "Explore communications",
    steps: [
      {
        title: "Bring conversations together",
        description: "Keep messages, replies, and follow-ups together.",
        icon: <Inbox className="h-12 w-12 text-primary" />,
        tips: [
          "Inbox — review and reply to conversations",
          "Chat Widget — capture website conversations",
          "Social — connect supported social channels",
          "Close or archive conversations when resolved"
        ]
      },
      {
        title: "Meet customers where they reach you",
        description: "Configure each channel within one workflow.",
        icon: <MessageCircle className="h-12 w-12 text-primary" />,
        tips: [
          "Customize the website chat experience",
          "Connect only the channels you need",
          "Keep replies associated with the right contact",
          "Use conversation status to organize follow-up"
        ]
      }
    ]
  },

  campaigns: {
    title: "Explore Campaigns",
    description: "Build audiences, messages, and campaigns together.",
    version: "2.0",
    completeLabel: "Explore campaigns",
    steps: [
      {
        title: "Reach the right audience",
        description: "Target the right contacts and segments.",
        icon: <Send className="h-12 w-12 text-primary" />,
        tips: [
          "Segments — define reusable audiences",
          "Campaigns — compose, schedule, and send",
          "Email templates — standardize recurring messages",
          "SMS templates — prepare concise text outreach"
        ]
      },
      {
        title: "Learn from every send",
        description: "Use engagement to improve the next send.",
        icon: <TrendingUp className="h-12 w-12 text-primary" />,
        tips: [
          "Track delivery before judging engagement",
          "Compare opens and clicks over time",
          "Reuse strong messages as templates",
          "Keep targeting decisions in your segments"
        ]
      }
    ]
  },

  pages: {
    title: "Explore Pages & Forms",
    description: "Publish pages and collect structured responses.",
    version: "2.0",
    completeLabel: "Explore pages and forms",
    steps: [
      {
        title: "Publish a focused destination",
        description: "Present an offer with one clear next step.",
        icon: <Globe className="h-12 w-12 text-primary" />,
        tips: [
          "Start with a page structure that fits the goal",
          "Apply your content and visual identity",
          "Keep each page focused on one action",
          "Share the published link wherever you need it"
        ]
      },
      {
        title: "Collect the information you need",
        description: "Collect inquiries, intake, and feedback.",
        icon: <ClipboardList className="h-12 w-12 text-primary" />,
        tips: [
          "Forms — choose fields and validation rules",
          "Use standalone forms or connect them to pages",
          "Review submissions in Itemize",
          "Turn useful responses into contact context"
        ]
      }
    ]
  },

  forms: {
    title: "Welcome to Forms",
    description: "Collect lead and customer information.",
    version: "1.0",
    steps: [
      {
        title: "Form Builder",
        description: "Use flexible fields and conditional logic.",
        icon: <ClipboardList className="h-12 w-12 text-primary" />,
        tips: [
          "Drag and drop field types",
          "Set required fields and validation",
          "Embed forms on your website",
          "Auto-create contacts from submissions"
        ]
      }
    ]
  },

  bookings: {
    title: "Welcome to Bookings",
    description: "View and manage all your scheduled appointments",
    version: "1.0",
    steps: [
      {
        title: "Booking Management",
        description: "See all upcoming and past appointments at a glance.",
        icon: <CalendarCheck className="h-12 w-12 text-primary" />,
        tips: [
          "View bookings by status",
          "See customer details and notes",
          "Confirm or cancel appointments",
          "Send reminders to customers"
        ]
      }
    ]
  },

  chat_widget: {
    title: "Welcome to Chat Widget",
    description: "Add live chat to your website to engage visitors in real-time",
    version: "1.0",
    steps: [
      {
        title: "Live Chat Setup",
        description: "Configure your chat widget and embed it on your website.",
        icon: <MessageCircle className="h-12 w-12 text-primary" />,
        tips: [
          "Customize colors and messages",
          "Set online/offline modes",
          "Copy embed code for your site",
          "Conversations appear in your Inbox"
        ]
      }
    ]
  },

  social: {
    title: "Welcome to Social",
    description: "Connect your social media accounts and manage conversations",
    version: "1.0",
    steps: [
      {
        title: "Social Channels",
        description: "Manage Facebook and Instagram messages together.",
        icon: <Share2 className="h-12 w-12 text-primary" />,
        tips: [
          "Connect Facebook pages",
          "Connect Instagram accounts",
          "Reply to messages and comments",
          "Track engagement across platforms"
        ]
      }
    ]
  },

  reputation: {
    title: "Explore Reputation",
    description: "Request, monitor, and publish customer reviews.",
    version: "2.0",
    completeLabel: "Explore reputation",
    steps: [
      {
        title: "Build a repeatable review loop",
        description: "Collect feedback and reuse your strongest reviews.",
        icon: <Star className="h-12 w-12 text-primary" />,
        tips: [
          "Reviews — monitor feedback in one place",
          "Review Requests — invite customers to respond",
          "Widgets — publish selected reputation signals",
          "Track rating and response patterns over time"
        ]
      }
    ]
  }
};
