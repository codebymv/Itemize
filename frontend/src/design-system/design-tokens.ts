import { cn } from '@/lib/utils'

interface DesignTokens {
  colors: {
    primary: string
    primaryHover: string
    primaryForeground: string
    primaryLight: string
    primaryLightest: string
    success: string
    successLight: string
    warning: string
    warningLight: string
    danger: string
    dangerLight: string
    info: string
    infoLight: string
    neutral: {
      50: string
      100: string
      200: string
      300: string
      400: string
      500: string
      600: string
      700: string
      800: string
      900: string
      950: string
    }
  }
  spacing: {
    xs: string
    sm: string
    md: string
    lg: string
    xl: string
    '2xl': string
    '3xl': string
  }
  borderRadius: {
    sm: string
    md: string
    lg: string
    xl: string
    full: string
  }
  shadows: {
    sm: string
    md: string
    lg: string
    xl: string
  }
  opacity: {
    faint: string
    light: string
    medium: string
    strong: string
  }
}

export const designTokens: DesignTokens = {
  colors: {
    primary: 'bg-blue-600',
    primaryHover: 'hover:bg-blue-700',
    primaryForeground: 'text-white',
    primaryLight: 'bg-blue-100 dark:bg-blue-900',
    primaryLightest: 'bg-blue-50 dark:bg-blue-950',
    success: 'bg-green-600',
    successLight: 'bg-green-100 dark:bg-green-900',
    warning: 'bg-orange-600',
    warningLight: 'bg-orange-100 dark:bg-orange-900',
    danger: 'bg-red-600',
    dangerLight: 'bg-red-100 dark:bg-red-900',
    info: 'bg-blue-600',
    infoLight: 'bg-blue-100 dark:bg-blue-900',
    neutral: {
      50: 'bg-slate-50',
      100: 'bg-slate-100',
      200: 'bg-slate-200',
      300: 'bg-slate-300',
      400: 'bg-slate-400',
      500: 'bg-slate-500',
      600: 'bg-slate-600',
      700: 'bg-slate-700',
      800: 'bg-slate-800',
      900: 'bg-slate-900',
      950: 'bg-slate-950',
    },
  },
  spacing: {
    xs: '0.25rem',
    sm: '0.5rem',
    md: '0.75rem',
    lg: '1rem',
    xl: '1.5rem',
    '2xl': '2rem',
    '3xl': '3rem',
  },
  borderRadius: {
    sm: 'rounded-sm',
    md: 'rounded-md',
    lg: 'rounded-lg',
    xl: 'rounded-xl',
    full: 'rounded-full',
  },
  shadows: {
    sm: 'shadow-sm',
    md: 'shadow-md',
    lg: 'shadow-lg',
    xl: 'shadow-xl',
  },
  opacity: {
    faint: 'opacity-10',
    light: 'opacity-20',
    medium: 'opacity-50',
    strong: 'opacity-80',
  },
}

export const colorMixins = {
  primary: (styles = '') => cn(designTokens.colors.primary, designTokens.colors.primaryForeground, designTokens.colors.primaryHover, styles),
  success: (styles = '') => cn(designTokens.colors.success, styles),
  warning: (styles = '') => cn(designTokens.colors.warning, styles),
  danger: (styles = '') => cn(designTokens.colors.danger, styles),
  info: (styles = '') => cn(designTokens.colors.info, styles),
}

export const spacingMixins = {
  m: (size: keyof typeof designTokens.spacing) => `m-${size}`,
  p: (size: keyof typeof designTokens.spacing) => `p-${size}`,
  mx: (size: keyof typeof designTokens.spacing) => `mx-${size}`,
  my: (size: keyof typeof designTokens.spacing) => `my-${size}`,
}

export const semanticColors = {
  status: {
    active: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    paused: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300',
    completed: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
    pending: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300',
    draft: 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-300',
    published: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-300',
  },
  module: {
    invoice: 'text-blue-600 dark:text-blue-400',
    contact: 'text-green-600 dark:text-green-400',
    signature: 'text-purple-600 dark:text-purple-400',
    workflow: 'text-orange-600 dark:text-orange-400',
    campaign: 'text-indigo-600 dark:text-indigo-400',
    social: 'text-pink-600 dark:text-pink-400',
    calendar: 'text-teal-600 dark:text-teal-400',
  },
} as const

export type StatusType = keyof typeof semanticColors.status
export type ModuleType = keyof typeof semanticColors.module

export function getStatusColor(status: StatusType) {
  return semanticColors.status[status]
}

export function getModuleColor(module: ModuleType) {
  return semanticColors.module[module]
}