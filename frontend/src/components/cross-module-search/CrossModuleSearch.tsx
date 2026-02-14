import React, { useState, useCallback, useEffect } from 'react'
import { Input } from '@/components/ui/input'
import { Button } from '@/components/ui/button'
import { Card } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import {
  Search,
  X,
  User,
  FileText,
  FileSignature,
  FileEdit,
  Mail,
  Zap,
  Calendar,
  Type,
  Loader2,
} from 'lucide-react'
import { cn } from '@/lib/utils'
import { semanticColors } from '@/design-system/design-tokens'
import type { SearchResult } from '@/design-system/types/search.types'

interface CrossModuleSearchProps {
  placeholder?: string
  onSelectResult?: (result: SearchResult) => void
  className?: string
  organizationId?: number
}

const searchTypeIcons: Record<SearchResult['type'], { icon: React.ElementType; color: string }> = {
  contact: { icon: User, color: semanticColors.module.contact },
  invoice: { icon: FileText, color: semanticColors.module.invoice },
  signature: { icon: FileSignature, color: semanticColors.module.signature },
  document: { icon: FileText, color: semanticColors.module.invoice },
  note: { icon: FileEdit, color: semanticColors.module.workflow },
  list: { icon: FileEdit, color: semanticColors.module.workflow },
  campaign: { icon: Mail, color: semanticColors.module.campaign },
  workflow: { icon: Zap, color: semanticColors.module.workflow },
  booking: { icon: Calendar, color: semanticColors.module.calendar },
  form: { icon: Type, color: 'text-purple-600 dark:text-purple-400' },
}

const searchTypeLabels: Record<SearchResult['type'], string> = {
  contact: 'Contact',
  invoice: 'Invoice',
  signature: 'Signature',
  document: 'Document',
  note: 'Note',
  list: 'List',
  campaign: 'Campaign',
  workflow: 'Workflow',
  booking: 'Booking',
  form: 'Form',
}

export function CrossModuleSearch({
  placeholder = 'Search contacts, invoices, documents, and more...',
  onSelectResult,
  className,
  organizationId,
}: CrossModuleSearchProps) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [isSearching, setIsSearching] = useState(false)
  const [showResults, setShowResults] = useState(false)

  const performSearch = useCallback(async (searchQuery: string) => {
    if (searchQuery.trim().length < 2) {
      setResults([])
      setShowResults(false)
      return
    }

    setIsSearching(true)
    setShowResults(true)

    try {
      const response = await fetch('/api/search', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(organizationId && { 'x-organization-id': organizationId.toString() }),
        },
        body: JSON.stringify({
          q: searchQuery,
          types: ['contact', 'invoice', 'signature', 'note', 'list', 'campaign', 'workflow'], // Add more as needed
        }),
      })

      const data = await response.json()
      setResults(data.results || [])
    } catch (error) {
      console.error('Search failed:', error)
      setResults([])
    } finally {
      setIsSearching(false)
    }
  }, [organizationId])

  useEffect(() => {
    const debounceTimer = setTimeout(() => {
      performSearch(query)
    }, 300)

    return () => clearTimeout(debounceTimer)
  }, [query, performSearch])

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape') {
      setShowResults(false)
      setQuery('')
    }
  }

  const handleResultClick = (result: SearchResult) => {
    onSelectResult?.(result)
    setShowResults(false)
    setQuery('')
  }

  return (
    <div className={cn('relative w-full', className)}>
      <div className="relative">
        <Search className={cn(
          'absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 transition-colors',
          query ? 'text-blue-600' : 'text-muted-foreground'
        )} />
        <Input
          type="text"
          placeholder={placeholder}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => query.trim().length >= 2 && setShowResults(true)}
          className="pl-10 pr-10"
        />
        {query && (
          <Button
            variant="ghost"
            size="sm"
            className="absolute right-1 top-1/2 -translate-y-1/2 h-6 w-6 p-0 hover:bg-muted"
            onClick={() => {
              setQuery('')
              setResults([])
              setShowResults(false)
            }}
          >
            <X className="h-3 w-3" />
          </Button>
        )}
      </div>

      {showResults && (
        <Card className="absolute top-full left-0 right-0 mt-2 z-50 shadow-lg max-h-[400px] overflow-y-auto">
          {isSearching ? (
            <SearchResultsLoading />
          ) : results.length === 0 ? (
            <div className="p-4 text-center text-sm text-muted-foreground">
              {query.trim().length < 2 ? 'Type at least 2 characters to search' : 'No results found'}
            </div>
          ) : (
            <div className="py-2">
              {results.map((result, index) => (
                <SearchResultItem
                  key={`${result.type}-${result.id}-${index}`}
                  result={result}
                  onClick={handleResultClick}
                />
              ))}
            </div>
          )}
        </Card>
      )}
    </div>
  )
}

function SearchResultItem({
  result,
  onClick,
}: {
  result: SearchResult
  onClick: (result: SearchResult) => void
}) {
  const { icon: Icon, color } = searchTypeIcons[result.type]
  const label = searchTypeLabels[result.type]

  return (
    <button
      className="w-full text-left px-4 py-3 hover:bg-muted/50 transition-colors flex items-start gap-3 group"
      onClick={() => onClick(result)}
    >
      <div className={cn('flex-shrink-0', color)}>
        <Icon className="h-5 w-5" />
      </div>

      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <span className="font-medium text-sm truncate group-hover:underline">
            {result.title}
          </span>
          <Badge variant="outline" className="text-xs whitespace-nowrap">
            {label}
          </Badge>
        </div>
        {result.description && (
          <p className="text-sm text-muted-foreground truncate">
            {result.description}
          </p>
        )}
      </div>
    </button>
  )
}

function SearchResultsLoading() {
  return (
    <div className="p-4 space-y-3">
      {[...Array(4)].map((_, i) => (
        <div key={i} className="flex items-start gap-3">
          <Skeleton className="h-5 w-5 rounded-full" />
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
        </div>
      ))}
    </div>
  )
}