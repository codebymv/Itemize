# Landing Page Builder Enhancement Plan

## 1. Visual Language Improvements (COMPLETED)
- ✅ Capitalize status badges (Published, Draft, Archived)
- ✅ Capitalize section type badges (Hero, Text, Image, etc.)
- ✅ Add proper border colors to status badges
- ✅ Created `textUtils.ts` for consistent capitalization

## 2. Competitive Preview & Staging Features

### 2.1 Device Preview System (TODO)
- Device selector with Desktop/Tablet/Mobile views
- Live preview iframe that updates on save
- Responsive width matching actual device sizes
- Preview URL: `/api/pages/public/page/{slug}`

### 2.2 Staging Environment (TODO)
- **Purpose**: Test changes before publishing
- **Implementation**: Add `version` field to pages (draft/production)
- **Preview URL**: `/p/{slug}?preview={versionId}`
- **Version History**: Track all changes with timestamps
- **Rollback**: Revert to any previous version

### 2.3 A/B Testing (TODO)
- Create multiple page variants
- Split traffic evenly or weighted
- Track conversion rates per variant
- Declare winner automatically or manually

### 2.4 Real-Time Collaboration (TODO)
- WebSocket-based real-time editing
- Multiple users editing same page
- Presence indicators (showing who's viewing)
- User cursors and selection highlights

### 2.5 Advanced Preview Features (TODO)
- Heatmap view (click tracking overlay)
- Scroll depth visualization
- Mobile gesture overlay
- QR code generator for mobile preview
- Email preview embed

## 3. Additional Competitive Features

### 3.1 Page Templates (TODO)
- Pre-built landing page templates
- Template categories: Lead Gen, E-commerce, Event, etc.
- One-click apply template
- Save as template from existing pages

### 3.2 Global Assets Library (TODO)
- Upload and manage images/videos
- Asset categories and tags
- CDN integration
- Image optimization on upload

### 3.3 Form Builder Integration (TODO)
- Drag-and-drop form fields
- Field validation rules
- Multi-step forms
- Form submissions to CRM
- Form analytics

### 3.4 Dynamic Content (TODO)
- Personalization tags ({{name}}, {{email}})
- Time-based content
- Location-based content
- Query parameter variable injection

### 3.5 Conversion Optimization (TODO)
- Exit intent popups
- Scroll-triggered elements
- Countdown timers with scarcity
- Social proof badges (e.g., "John from NY just bought")
- FOMO elements

### 3.6 Integration Hub (TODO)
- Zapier integration
- Webhooks
- Email marketing (SendGrid, Mailchimp)
- SMS marketing
- Analytics (GA4, Facebook Pixel)
- Custom scripts per page

### 3.7 Advanced SEO (TODO)
- Schema.org markup builder
- Open Graph preview editor
- Twitter Card editor
- Canonical URL setting
- No-index setting
- Sitemap auto-generation
- Robots.txt control

### 3.8 Team & Permissions (TODO)
- Team management with roles:
  - Owner (full access)
  - Editor (edit but not delete/publish)
  - Viewer (read-only)
- Comment system for feedback
- Approval workflow
- Change history with author attribution

### 3.9 Performance Optimization (TODO)
- Lazy load images
- Critical CSS inline
- JavaScript deferral
- Font optimization
- Core Web Vitals monitoring
- Performance grade

### 3.10 Advanced Analytics (TODO)
- Real-time visitor tracking
- Heatmaps
- Session recordings
- Form submission tracking
- Click tracking (link-specific)
- Scroll depth tracking
- UTM campaign tracking
- Goal funnels
- Cohort analysis
- Export to CSV/PDF

## 4. Prioritized Implementation Roadmap

### Phase 1 (High Priority)
1. Device preview system (Desktop/Tablet/Mobile)
2. Live preview with auto-refresh
3. Staging environment (versioning)
4. Rollback functionality

### Phase 2 (Medium Priority)
5. Page templates marketplace
6. Global assets library
7. Form builder integration
8. Dynamic content tags

### Phase 3 (Advanced)
9. A/B testing framework
10. Real-time collaboration
11. Heatmaps and session recordings
12. Integration hub

## 5. Technical Architecture Notes

### Staging System
```typescript
interface PageVersion {
  id: number;
  page_id: number;
  version_number: number;
  content: PageContent;
  status: 'draft' | 'staging' | 'production';
  created_by: number;
  created_at: string;
  published_at?: string;
}
```

### A/B Testing
```typescript
interface PageVariant {
  id: number;
  page_id: number;
  name: string;
  traffic_weight: number; // 0-100
  conversions: number;
  views: number;
  conversion_rate: number;
}
```

### Real-time Events
```typescript
type CollaborativeEvent =
  | { type: 'cursor_move', userId: string, position: { x: number, y: number } }
  | { type: 'text_edit', sectionId: number, content: string }
  | { type: 'section_add', section: PageSection }
  | { type: 'user_join', user: UserInfo }
  | { type: 'user_leave', userId: string };
```

## 6. API Endpoints Needed

### Preview
- `POST /api/pages/:id/preview` - Generate preview version
- `GET /api/public/preview/:versionId` - Serve preview

### Staging
- `GET /api/pages/:id/versions` - List versions
- `POST /api/pages/:id/versions/:versionId/publish` - Deploy version
- `DELETE /api/pages/:id/versions/:versionId` - Delete version

### A/B Testing
- `POST /api/pages/:id/variants` - Create variant
- `PUT /api/pages/:id/variants/:id` - Update weights
- `GET /api/pages/:id/analytics/ab-test` - A/B test stats

## 7. Database Schema Updates

### Page Versions Table
```sql
CREATE TABLE page_versions (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  content JSONB NOT NULL,
  settings JSONB DEFAULT NULL,
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  published_at TIMESTAMP,
  UNIQUE(page_id, version_number)
);
```

### Page Variants Table
```sql
CREATE TABLE page_variants (
  id SERIAL PRIMARY KEY,
  page_id INTEGER REFERENCES pages(id) ON DELETE CASCADE,
  name VARCHAR(255) NOT NULL,
  content JSONB NOT NULL,
  traffic_weight INTEGER DEFAULT 50 CHECK (traffic_weight >= 0 AND traffic_weight <= 100),
  views INTEGER DEFAULT 0,
  conversions INTEGER DEFAULT 0,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### Assets Table
```sql
CREATE TABLE page_assets (
  id SERIAL PRIMARY KEY,
  organization_id INTEGER REFERENCES organizations(id),
  name VARCHAR(255) NOT NULL,
  url TEXT NOT NULL,
  type VARCHAR(50) CHECK (type IN ('image', 'video', 'document')),
  size INTEGER,
  tags TEXT[],
  created_by INTEGER REFERENCES users(id),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```