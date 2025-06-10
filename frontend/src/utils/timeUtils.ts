import { formatDistanceToNow } from 'date-fns';

/**
 * Format a timestamp to display relative time (e.g., "Just now", "2 minutes ago", "1 hour ago")
 * @param timestamp - The timestamp to format (string or Date)
 * @returns Formatted relative time string
 */
export function formatRelativeTime(timestamp: string | Date): string {
  if (!timestamp) return 'Unknown';
  
  try {
    const date = timestamp instanceof Date ? timestamp : new Date(timestamp);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    
    // If less than 1 minute ago, show "Just now"
    if (diffMs < 60000) {
      return 'Just now';
    }
    
    // Use date-fns for everything else
    return formatDistanceToNow(date, { addSuffix: true });
  } catch (error) {
    console.error('Error formatting relative time:', error);
    return 'Unknown';
  }
} 