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
  Mail
} from 'lucide-react';

export const ONBOARDING_CONTENT: Record<string, OnboardingContent> = {
  canvas: {
    title: "Welcome to Canvas View",
    description: "Your infinite workspace for organizing lists, notes, and whiteboards visually",
    version: "1.0",
    steps: [
      {
        title: "Infinite Canvas",
        description: "Arrange your workspace exactly how you want. Drag and drop items anywhere on the canvas for a personalized layout.",
        icon: <Layout className="h-12 w-12 text-primary" />,
        tips: [
          "Click and drag items to move them around",
          "Scroll to pan across the canvas",
          "Use mouse wheel or pinch to zoom in/out",
          "Double-click empty space to create new items"
        ]
      },
      {
        title: "Create & Organize",
        description: "Add lists, notes, and whiteboards directly on the canvas. Each item can be resized and positioned independently.",
        icon: <StickyNote className="h-12 w-12 text-primary" />,
        tips: [
          "Click '+' button to create new items",
          "Drag edges to resize items",
          "Use categories to organize related items",
          "Color-code items for quick visual reference"
        ]
      },
      {
        title: "Save Automatically",
        description: "All your changes are saved automatically. Your canvas layout persists across sessions.",
        icon: <CheckSquare className="h-12 w-12 text-primary" />,
        tips: [
          "Changes sync in real-time",
          "No need to manually save",
          "Access from any device",
          "Undo/redo support for mistakes"
        ]
      }
    ]
  },

  lists: {
    title: "Welcome to Lists",
    description: "Create and manage todo lists with powerful organization features",
    version: "1.0",
    steps: [
      {
        title: "Create Lists",
        description: "Organize your tasks into lists. Add items, check them off, and stay productive.",
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
    title: "Welcome to Invoicing",
    description: "Create professional invoices and track payments",
    version: "1.0",
    steps: [
      {
        title: "Create Invoices",
        description: "Generate professional invoices with your branding and send them to customers.",
        icon: <FileText className="h-12 w-12 text-primary" />,
        tips: [
          "Customize invoice templates",
          "Add your logo and branding",
          "Calculate taxes automatically",
          "Send via email or download PDF"
        ]
      },
      {
        title: "Track Payments",
        description: "Monitor invoice status and record payments to stay on top of receivables.",
        icon: <TrendingUp className="h-12 w-12 text-primary" />,
        tips: [
          "See paid, pending, and overdue invoices",
          "Record partial payments",
          "Send payment reminders",
          "Generate financial reports"
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
    title: "Welcome to Calendar",
    description: "Schedule appointments and manage your availability",
    version: "1.0",
    steps: [
      {
        title: "Appointment Booking",
        description: "Let customers book time with you based on your availability.",
        icon: <Calendar className="h-12 w-12 text-primary" />,
        tips: [
          "Set your available hours",
          "Create booking links to share",
          "Sync with Google Calendar",
          "Send automatic reminders"
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
  }
};
