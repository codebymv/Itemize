# Client Profile Component

The `ClientProfile` component provides a unified view of all data related to a single contact/client across all modules in Itemize. This is the "single source of truth" for client data.

## Features

- **Unified Client Info**: Displays contact details, company, status, and notes
- **Activity Timeline**: Shows all activity across invoices, signatures, communications, etc.
- **Documents Tab**: Lists invoices and signature requests with status indicators
- **Communications Tab**: Shows email, SMS, and call history
- **Payments Tab**: Displays payment history and totals
- **Tasks Tab**: Shows related tasks with status

## Usage

```tsx
import { ClientProfile } from '@/components/client-profile'
import type { ClientProfile as ClientProfileType } from '@/design-system/types/client.types'

<ClientProfile
  client={clientData}
  loading={false}
  onCreateInvoice={() => navigate('/invoices/new', { state: { contactId: clientData.contact.id } })}
  onCreateSignature={() => navigate('/documents/new', { state: { contactId: clientData.contact.id } })}
  onSendEmail={() => openEmailModal()}
  onAddCall={() => openCallNoteModal()}
  onAddNote={() => openNoteModal()}
  onScheduleMeeting={() => navigate('/bookings/new', { state: { contactId: clientData.contact.id } })}
/>
```

## Data Structure

The `ClientProfile` component expects a `ClientProfile` object with the following structure:

```tsx
interface ClientProfile {
  contact: {
    id: string
    firstName: string
    lastName: string
    email?: string
    phone?: string
    company?: string
    title?: string
    city?: string
    state?: string
    country?: string
    status: 'active' | 'inactive' | 'lead' | 'customer'
    notes?: string
    tags?: string[]
  }
  invoices: ClientInvoice[]
  signatures: ClientSignature[]
  payments: ClientPayment[]
  communications: ClientCommunication[]
  tasks: ClientTask[]
  bookings: ClientBooking[]
  notes: ClientNote[]
  lists: ClientList[]
  timeline: Activity[]
}
```

## Integration with Backend

The component is designed to work with existing API data. You'll need to:

1. **Fetch Client Data**: Combine data from multiple endpoints
2. **Transform API Data**: Convert API responses to the design system format
3. **Pass to Component**: Provide the transformed data to `ClientProfile`

Example transformation:

```tsx
import { transformApiActivityToDesignSystem } from '@/design-system/utils/transform-api-activity'

async function fetchClientProfile(contactId: string): Promise<ClientProfile> {
  const [contact, invoices, signatures, activities] = await Promise.all([
    getContact(contactId),
    getInvoices({ contactId }),
    getSignatures({ contactId }),
    getContactActivities(contactId),
  ])

  return {
    contact: {
      id: contact.id,
      firstName: contact.first_name,
      lastName: contact.last_name,
      email: contact.email,
      phone: contact.phone,
      company: contact.company,
      status: contact.status,
      notes: contact.notes,
    },
    invoices: invoices.map(inv => ({ ...inv, status: inv.status })),
    signatures: signatures.map(sig => ({ ...sig, status: sig.status })),
    payments: [],
    communications: [],
    tasks: [],
    bookings: [],
    notes: [],
    lists: [],
    timeline: activities.map(transformApiActivityToDesignSystem),
  }
}
```

## Smart Actions

The component provides quick actions that connect modules:

1. **Send Invoice** → Navigates to invoice editor with client pre-filled
2. **Send Contract** → Opens signature editor with client details
3. **Email** → Opens email composer with client as recipient
4. **Schedule** → Opens booking form with client default times

Each action should navigate to the appropriate module form and pre-populate the client information.

## Future Enhancements

- [ ] Add timeline filtering by module type
- [ ] Click on timeline items to view details
- [ ] Bulk actions (e.g., select multiple invoices)
- [ ] Inline editing of contact details
- [ ] Drag-and-drop tabs customization
- [ ] Integration with CRM pipeline stages