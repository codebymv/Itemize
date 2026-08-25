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
    description: "Choose the kinds of content that fit your work and arrange them together on one canvas.",
    version: "3.0",
    completeLabel: "Choose a format",
    steps: [
      {
        title: "Choose what belongs on your canvas",
        description: "Start with the format that fits your work. Mix different content types together or use only what you need.",
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
        description: "Move and resize content as your project evolves, then use search and filters whenever you need to focus.",
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
        description: "Organize your content into lists. Add items, check them off, and stay productive.",
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
    description: "Capture ideas, thoughts, and important information with rich text notes",
    version: "1.0",
    steps: [
      {
        title: "Create Notes",
        description: "Quick capture for all your thoughts. Format text, add links, and organize with categories.",
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
        description: "Notes appear as colorful sticky notes on your canvas, just like a real desk.",
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
        description: "Free-form drawing canvas for diagrams, flowcharts, and visual thinking.",
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
        description: "Store and organize all your customer information, interactions, and history.",
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
    description: "Price work, bill clients, and follow the money from one connected toolkit.",
    version: "2.0",
    completeLabel: "Explore sales tools",
    steps: [
      {
        title: "Price and bill your work",
        description: "Use the document that matches the job, from an initial estimate through recurring billing.",
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
        description: "Monitor document status, payment activity, and overdue balances without losing the client context.",
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
    description: "Configure availability, accept bookings, and connect the calendars you already use.",
    version: "2.0",
    completeLabel: "Explore scheduling",
    steps: [
      {
        title: "Make your time bookable",
        description: "Create calendars with the availability, duration, and booking rules each service needs.",
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
        description: "Connect external calendars so availability and scheduled work stay aligned.",
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
        description: "See key metrics, recent activity, and important updates at a glance.",
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
    description: "Bring customer conversations together across your inbox, website, and connected social channels.",
    version: "2.0",
    completeLabel: "Explore communications",
    steps: [
      {
        title: "Bring conversations together",
        description: "Use the inbox as the shared record of customer messages, replies, and follow-up work.",
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
        description: "Configure each channel independently while keeping the resulting conversations in one workflow.",
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
    description: "Define the audience, prepare reusable messages, and send campaigns from one place.",
    version: "2.0",
    completeLabel: "Explore campaigns",
    steps: [
      {
        title: "Reach the right audience",
        description: "Build campaigns around the contacts and segments that should receive each message.",
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
        description: "Review delivery and engagement signals, then refine the next audience or message.",
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
    description: "Publish focused pages and collect structured responses without adding another builder.",
    version: "2.0",
    completeLabel: "Explore pages and forms",
    steps: [
      {
        title: "Publish a focused destination",
        description: "Use landing pages to explain an offer, present a clear next step, or support a campaign.",
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
        description: "Build forms for inquiries, intake, feedback, or any structured response.",
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
    description: "Create custom forms to collect information from leads and customers",
    version: "1.0",
    steps: [
      {
        title: "Form Builder",
        description: "Build custom forms with various field types and conditional logic.",
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
        description: "Connect Facebook and Instagram to manage messages from one place.",
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
    description: "Monitor feedback, request new reviews, and publish trust signals where customers will see them.",
    version: "2.0",
    completeLabel: "Explore reputation",
    steps: [
      {
        title: "Build a repeatable review loop",
        description: "Bring existing reviews into view, ask satisfied customers for feedback, and reuse the strongest proof.",
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
