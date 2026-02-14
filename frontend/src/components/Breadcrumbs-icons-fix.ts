import { Users, FileText } from 'lucide-react'

// Fixed imports for Breadcrumbs
const iconComponents = {
  Users,
  FileText,
  // Add other icons as needed
}

// Update Breadcrumbs to fix the import issue
// In the Breadcrumbs.tsx file, change the icon rendering to:
// {item.icon && React.createElement(item.icon)}