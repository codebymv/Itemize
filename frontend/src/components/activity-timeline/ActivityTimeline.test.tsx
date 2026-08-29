import { render, screen } from '@testing-library/react'
import { describe, expect, it } from 'vitest'
import type { Activity } from '@/design-system/types/activity.types'
import { ActivityTimeline } from './ActivityTimeline'
import { getLatestActivityGroupLabel } from './activity-date'

function makeActivity(id: string, timestamp: Date): Activity {
  return {
    id,
    type: 'created',
    itemType: 'contact',
    title: `Activity ${id}`,
    timestamp,
  }
}

describe('ActivityTimeline', () => {
  it('can move the latest group label into its parent subtitle', () => {
    const today = new Date()
    const yesterday = new Date(today)
    yesterday.setDate(today.getDate() - 1)
    const activities = [makeActivity('today', today), makeActivity('yesterday', yesterday)]

    expect(getLatestActivityGroupLabel(activities)).toBe('Today')

    render(<ActivityTimeline activities={activities} hideFirstGroupHeading />)

    expect(screen.queryByRole('heading', { name: 'Today' })).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Yesterday' })).toBeInTheDocument()
  })
})
