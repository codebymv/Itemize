# Onboarding System Implementation Plan

## 🎯 Overview
Implement a progressive, contextual onboarding system that shows feature-specific tutorials when users visit sections for the first time, inspired by video game UI patterns.

---

## 📋 Implementation Phases

### **Phase 1: Database Infrastructure** ✅ READY TO EXECUTE

#### 1.1 Create Database Migration Script
**File:** `/workspaces/Itemize/backend/scripts/init-onboarding.js`

**Purpose:** Utility script to check onboarding progress for a specific user

**Features:**
- Query user's onboarding progress
- Display completed/pending onboarding items
- Reset onboarding for a user (for testing)

#### 1.2 Database Migration
**File:** `/workspaces/Itemize/backend/src/db_migrations.js`

**Function:** `runOnboardingMigration`

**Schema Changes:**
```sql
-- Add onboarding_progress JSONB column to users table
ALTER TABLE users 
ADD COLUMN IF NOT EXISTS onboarding_progress JSONB DEFAULT '{}'::jsonb;

-- Create index for JSONB queries
CREATE INDEX IF NOT EXISTS idx_users_onboarding_progress 
ON users USING gin(onboarding_progress);

-- Example data structure:
{
  "canvas": {
    "seen": true,
    "timestamp": "2026-02-01T10:30:00.000Z",
    "version": "1.0",
    "dismissed": false,
    "step_completed": 3
  },
  "lists": {
    "seen": false
  },
  "notes": {
    "seen": true,
    "timestamp": "2026-02-01T11:00:00.000Z",
    "version": "1.0",
    "dismissed": false
  }
}
```

**Optional:** Analytics table for tracking
```sql
CREATE TABLE IF NOT EXISTS onboarding_events (
  id SERIAL PRIMARY KEY,
  user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
  feature_key VARCHAR(50) NOT NULL,
  event_type VARCHAR(20) NOT NULL, -- 'viewed', 'dismissed', 'completed', 'skipped'
  version VARCHAR(10) DEFAULT '1.0',
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_onboarding_events_user_feature 
ON onboarding_events(user_id, feature_key);
```

---

### **Phase 2: Backend API Endpoints**

#### 2.1 Routes
**File:** `/workspaces/Itemize/backend/src/routes/onboarding.js` (NEW)

**Endpoints:**
```javascript
GET    /onboarding/progress         - Get user's complete onboarding progress
GET    /onboarding/progress/:feature - Get specific feature's onboarding status
POST   /onboarding/mark-seen        - Mark a feature as seen
POST   /onboarding/dismiss          - Dismiss a specific onboarding
POST   /onboarding/complete-step    - Mark a specific step as completed
DELETE /onboarding/reset            - Reset all onboarding (dev/testing)
```

#### 2.2 Controllers
**File:** `/workspaces/Itemize/backend/src/controllers/onboardingController.js` (NEW)

**Functions:**
- `getOnboardingProgress` - Retrieve user's progress
- `markFeatureSeen` - Update when user views a feature
- `dismissOnboarding` - User explicitly dismisses
- `completeStep` - Track multi-step tutorial progress
- `resetOnboarding` - Clear all progress (admin/dev only)

#### 2.3 Middleware Integration
**File:** `/workspaces/Itemize/backend/src/index.js`

Add route registration:
```javascript
const onboardingRoutes = require('./routes/onboarding');
app.use('/onboarding', authenticateToken, onboardingRoutes);
```

---

### **Phase 3: Frontend Infrastructure**

#### 3.1 Onboarding Context
**File:** `/workspaces/Itemize/frontend/src/contexts/OnboardingContext.tsx` (NEW)

**State Management:**
```typescript
interface OnboardingProgress {
  [featureKey: string]: {
    seen: boolean;
    timestamp?: string;
    version?: string;
    dismissed?: boolean;
    step_completed?: number;
  };
}

interface OnboardingContextType {
  // State
  progress: OnboardingProgress;
  loading: boolean;
  
  // Actions
  markAsSeen: (featureKey: string) => Promise<void>;
  dismissOnboarding: (featureKey: string) => Promise<void>;
  shouldShowOnboarding: (featureKey: string) => boolean;
  completeStep: (featureKey: string, step: number) => Promise<void>;
  refreshProgress: () => Promise<void>;
}
```

**Features:**
- Load progress on mount
- Cache in memory to avoid repeated API calls
- Optimistic updates with rollback on failure
- Debounced API calls

#### 3.2 Onboarding Service
**File:** `/workspaces/Itemize/frontend/src/services/onboardingService.ts` (NEW)

**API Client:**
```typescript
export const onboardingService = {
  getProgress: () => api.get('/onboarding/progress'),
  markSeen: (feature: string) => api.post('/onboarding/mark-seen', { feature }),
  dismiss: (feature: string) => api.post('/onboarding/dismiss', { feature }),
  completeStep: (feature: string, step: number) => 
    api.post('/onboarding/complete-step', { feature, step }),
  reset: () => api.delete('/onboarding/reset'),
};
```

---

### **Phase 4: Onboarding UI Components**

#### 4.1 OnboardingModal Component
**File:** `/workspaces/Itemize/frontend/src/components/OnboardingModal.tsx` (NEW)

**Props:**
```typescript
interface OnboardingModalProps {
  isOpen: boolean;
  onClose: () => void;
  featureKey: string;
  content: OnboardingContent;
  onDismiss?: () => void;
  onComplete?: () => void;
}

interface OnboardingContent {
  title: string;
  description: string;
  steps: OnboardingStep[];
  version: string;
}

interface OnboardingStep {
  title: string;
  description: string;
  image?: string;
  video?: string;
  tips?: string[];
  action?: {
    label: string;
    onClick: () => void;
  };
}
```

**Features:**
- Multi-step carousel with progress indicators
- Optional images/screenshots per step
- "Don't show again" checkbox
- "Skip tour" button
- "Next" / "Previous" navigation
- "Get Started" final button
- Keyboard navigation (arrow keys, ESC)
- Responsive design

#### 4.2 OnboardingTrigger HOC/Hook
**File:** `/workspaces/Itemize/frontend/src/hooks/useOnboarding.ts` (NEW)

**Usage:**
```typescript
const useOnboarding = (featureKey: string) => {
  const { shouldShow, dismiss, markComplete } = useOnboardingTrigger(featureKey);
  
  return {
    shouldShowOnboarding: shouldShow,
    dismissOnboarding: dismiss,
    completeOnboarding: markComplete
  };
};
```

**Auto-trigger logic:**
- Check on component mount
- Respect dismissed state
- Handle version changes

---

### **Phase 5: Onboarding Content Configuration**

#### 5.1 Content Registry
**File:** `/workspaces/Itemize/frontend/src/config/onboardingContent.ts` (NEW)

**Structure:**
```typescript
export const ONBOARDING_CONTENT: Record<string, OnboardingContent> = {
  canvas: {
    title: "Welcome to Canvas View",
    description: "Organize your lists, notes, and whiteboards visually",
    version: "1.0",
    steps: [
      {
        title: "Infinite Canvas",
        description: "Drag and position your items anywhere on the canvas",
        image: "/onboarding/canvas-drag.png",
        tips: [
          "Click and drag items to move them",
          "Scroll to pan around the canvas",
          "Use mouse wheel to zoom in/out"
        ]
      },
      {
        title: "Create New Items",
        description: "Add lists, notes, or whiteboards directly on the canvas",
        image: "/onboarding/canvas-create.png",
        action: {
          label: "Try creating a list",
          onClick: () => {} // Trigger create modal
        }
      },
      // ... more steps
    ]
  },
  
  lists: {
    title: "Your Lists",
    description: "Create and manage todo lists with categories",
    version: "1.0",
    steps: [
      {
        title: "Create Lists",
        description: "Click 'New List' to create a todo list",
        tips: [
          "Organize tasks by category",
          "Drag to reorder items",
          "Mark tasks as complete"
        ]
      }
    ]
  },
  
  notes: {
    title: "Notes Feature",
    description: "Capture ideas with rich text notes",
    version: "1.0",
    steps: [/* ... */]
  },
  
  whiteboards: {
    title: "Whiteboards",
    description: "Visual brainstorming and diagramming",
    version: "1.0",
    steps: [/* ... */]
  },
  
  contacts: {
    title: "CRM & Contacts",
    description: "Manage your customer relationships",
    version: "1.0",
    steps: [/* ... */]
  },
  
  pipelines: {
    title: "Sales Pipelines",
    description: "Track deals through your sales process",
    version: "1.0",
    steps: [/* ... */]
  },
  
  invoices: {
    title: "Invoicing",
    description: "Create and send professional invoices",
    version: "1.0",
    steps: [/* ... */]
  },
  
  automations: {
    title: "Automations",
    description: "Automate repetitive tasks with workflows",
    version: "1.0",
    steps: [/* ... */]
  },
  
  calendars: {
    title: "Calendar & Scheduling",
    description: "Manage appointments and events",
    version: "1.0",
    steps: [/* ... */]
  }
};
```

---

### **Phase 6: Integration with Existing Pages**

#### 6.1 Add Onboarding Triggers to Routes

**Pages to Update:**
- `/workspaces/Itemize/frontend/src/pages/canvas.tsx` - Canvas onboarding
- `/workspaces/Itemize/frontend/src/pages/UserHome.tsx` - Lists onboarding
- `/workspaces/Itemize/frontend/src/pages/contacts/ContactsPage.tsx` - CRM onboarding
- `/workspaces/Itemize/frontend/src/pages/pipelines/PipelinesPage.tsx` - Pipelines onboarding
- `/workspaces/Itemize/frontend/src/pages/invoices/*` - Invoicing onboarding
- `/workspaces/Itemize/frontend/src/pages/automations/*` - Automations onboarding
- `/workspaces/Itemize/frontend/src/pages/calendars/*` - Calendar onboarding

**Pattern:**
```tsx
import { useOnboarding } from '@/hooks/useOnboarding';
import OnboardingModal from '@/components/OnboardingModal';
import { ONBOARDING_CONTENT } from '@/config/onboardingContent';

const CanvasPage = () => {
  const [showOnboarding, setShowOnboarding] = useState(false);
  const { shouldShowOnboarding, dismissOnboarding } = useOnboarding('canvas');
  
  useEffect(() => {
    if (shouldShowOnboarding) {
      setShowOnboarding(true);
    }
  }, [shouldShowOnboarding]);
  
  return (
    <>
      <OnboardingModal
        isOpen={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        featureKey="canvas"
        content={ONBOARDING_CONTENT.canvas}
        onDismiss={() => {
          dismissOnboarding();
          setShowOnboarding(false);
        }}
      />
      
      {/* Existing page content */}
    </>
  );
};
```

---

### **Phase 7: Settings & User Controls**

#### 7.1 Settings Page Integration
**File:** `/workspaces/Itemize/frontend/src/pages/SettingsPage.tsx`

**Add Section:**
```tsx
<Card>
  <CardHeader>
    <CardTitle>Onboarding & Tutorials</CardTitle>
    <CardDescription>
      Manage your feature tour preferences
    </CardDescription>
  </CardHeader>
  <CardContent className="space-y-4">
    <div className="flex items-center justify-between">
      <div>
        <Label>Show Feature Tours</Label>
        <p className="text-sm text-muted-foreground">
          Display tutorial modals when visiting features for the first time
        </p>
      </div>
      <Switch 
        checked={showOnboarding} 
        onCheckedChange={setShowOnboarding} 
      />
    </div>
    
    <Separator />
    
    <div>
      <Label>Reset All Tutorials</Label>
      <p className="text-sm text-muted-foreground mb-2">
        This will show all feature tours again as if you're a new user
      </p>
      <Button variant="outline" onClick={handleResetOnboarding}>
        Reset All Tutorials
      </Button>
    </div>
    
    {/* List of features with individual reset buttons */}
    <div className="space-y-2">
      <Label>Feature Tour Status</Label>
      {Object.entries(onboardingProgress).map(([feature, data]) => (
        <div key={feature} className="flex items-center justify-between">
          <span className="text-sm capitalize">{feature}</span>
          {data.seen && (
            <Button 
              size="sm" 
              variant="ghost"
              onClick={() => resetFeature(feature)}
            >
              Replay
            </Button>
          )}
        </div>
      ))}
    </div>
  </CardContent>
</Card>
```

---

### **Phase 8: Analytics & Tracking** (Optional)

#### 8.1 Backend Analytics Queries
**File:** `/workspaces/Itemize/backend/src/controllers/analyticsController.js`

**Queries:**
- Which features have highest dismissal rates?
- Average steps completed before dismissal
- Time to complete onboarding per feature
- Most/least engaged features

#### 8.2 Admin Dashboard
**File:** `/workspaces/Itemize/frontend/src/pages/AdminPage.tsx`

**Add Onboarding Metrics Section:**
- Onboarding completion rates
- Feature adoption metrics
- Heatmap of feature discovery

---

## 🔧 Implementation Order

### **Sprint 1: Database & Backend** (2-3 days)
1. ✅ Create database migration script
2. ✅ Add `runOnboardingMigration` to db_migrations.js
3. ✅ Run migration
4. Create backend routes & controllers
5. Test API endpoints

### **Sprint 2: Frontend Foundation** (3-4 days)
6. Create OnboardingContext
7. Create onboarding service
8. Create OnboardingModal component
9. Create useOnboarding hook
10. Test with one feature (Canvas)

### **Sprint 3: Content & Integration** (3-5 days)
11. Create onboarding content registry
12. Add screenshots/images
13. Integrate with all major routes
14. Add settings controls
15. Polish UI/UX

### **Sprint 4: Testing & Refinement** (2-3 days)
16. User testing
17. Fix bugs
18. Optimize performance
19. Add analytics (optional)
20. Documentation

---

## 📝 Testing Checklist

- [ ] New user sees onboarding on first visit to each feature
- [ ] "Don't show again" persists across sessions
- [ ] Dismissed onboarding doesn't show again
- [ ] Settings reset functionality works
- [ ] Multi-step navigation works (next/prev/skip)
- [ ] Keyboard navigation works (arrows, ESC)
- [ ] Mobile responsive
- [ ] Works with slow network (loading states)
- [ ] Database queries are indexed and performant
- [ ] Context doesn't cause unnecessary re-renders

---

## 🎨 UI/UX Considerations

**Modal Design:**
- Use existing shadcn Dialog component
- Add custom styling for onboarding-specific needs
- Progress dots for multi-step tours
- Smooth transitions between steps
- Optional background overlay dimming
- Highlight relevant UI elements (optional spotlight effect)

**Accessibility:**
- Keyboard navigation
- Screen reader support
- Focus management
- Color contrast compliance
- Skip/dismiss always visible

**Performance:**
- Lazy load images
- Cache progress client-side
- Debounce API calls
- Preload next step images
- Don't block page rendering

---

## 📊 Success Metrics

**User Engagement:**
- % of users who complete onboarding per feature
- Average steps completed before dismissal
- Time spent in onboarding
- Repeat tutorial requests

**Feature Adoption:**
- Correlation between onboarding and feature usage
- First-time feature usage after onboarding
- Feature retention rates

**Feedback:**
- User satisfaction surveys
- Support ticket reduction
- Feature confusion reports

---

## 🚀 Future Enhancements

1. **Interactive Tours:** Click-through walkthroughs with spotlights
2. **Video Tutorials:** Embedded video for complex features
3. **Contextual Tooltips:** Micro-onboarding for specific UI elements
4. **Achievement System:** Gamify feature discovery
5. **Personalized Paths:** Role-based onboarding flows
6. **A/B Testing:** Test different onboarding approaches
7. **Multi-language:** Internationalization support
8. **In-app Announcements:** New feature highlights

---

## 📁 Files to Create/Modify

### **New Files:**
- `/workspaces/Itemize/backend/scripts/init-onboarding.js`
- `/workspaces/Itemize/backend/src/routes/onboarding.js`
- `/workspaces/Itemize/backend/src/controllers/onboardingController.js`
- `/workspaces/Itemize/frontend/src/contexts/OnboardingContext.tsx`
- `/workspaces/Itemize/frontend/src/services/onboardingService.ts`
- `/workspaces/Itemize/frontend/src/components/OnboardingModal.tsx`
- `/workspaces/Itemize/frontend/src/hooks/useOnboarding.ts`
- `/workspaces/Itemize/frontend/src/config/onboardingContent.ts`

### **Modified Files:**
- `/workspaces/Itemize/backend/src/db_migrations.js` (add migration)
- `/workspaces/Itemize/backend/src/index.js` (add route)
- `/workspaces/Itemize/frontend/src/App.tsx` (add provider)
- `/workspaces/Itemize/frontend/src/pages/*.tsx` (add triggers)
- `/workspaces/Itemize/frontend/src/pages/SettingsPage.tsx` (add controls)

---

## 🎯 Key Decisions Made

1. **JSONB over separate table:** More flexible, easier to query user progress
2. **Client-side caching:** Reduces API calls, better UX
3. **Reusable modal:** Single component, parameterized content
4. **Route-based triggers:** Auto-show on first visit
5. **Optional analytics table:** For deeper insights without bloating users table
6. **Version tracking:** Allow re-showing onboarding when features change significantly

---

This plan provides a complete roadmap for implementing the onboarding system following best practices and your existing architecture patterns!
