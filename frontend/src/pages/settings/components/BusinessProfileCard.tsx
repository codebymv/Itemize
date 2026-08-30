import React from 'react';
import { Plus, Building, Clock, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import type { Business } from '@/services/invoicesApi';
import { SettingsSectionTitle } from '@/components/settings/SettingsPrimitives';

interface BusinessProfileCardProps {
  businesses: Business[];
  loading?: boolean;
  loadError?: boolean;
  onRetry?: () => void;
  onAddBusiness: () => void;
  onEditBusiness: (business: Business) => void;
  onDeleteBusiness: (business: Business) => void;
}

export const BusinessProfileCard: React.FC<BusinessProfileCardProps> = ({
  businesses,
  loading = false,
  loadError = false,
  onRetry,
  onAddBusiness,
  onEditBusiness,
  onDeleteBusiness,
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <SettingsSectionTitle icon={Building}>Business Profiles</SettingsSectionTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-muted/50 rounded animate-pulse" />
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={businesses.length > 0 ? "flex flex-row items-center justify-between space-y-0 pb-4" : ""}>
        <div>
          <SettingsSectionTitle icon={Building}>Business Profiles</SettingsSectionTitle>
        </div>
        {businesses.length > 0 && (
          <Button
            size="sm"
            onClick={onAddBusiness}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            <Plus className="h-4 w-4 mr-2" />
            Add Business
          </Button>
        )}
      </CardHeader>
      <CardContent>
        {loadError ? (
          <ErrorState
            kind="inline"
            title="Unable to load business profiles"
            description="Try again before editing business profiles."
            onAction={onRetry}
          />
        ) : businesses.length === 0 ? (
          <EmptyState
            icon={Building}
            kind="inline"
            title="No businesses yet"
            description="Add the identity customers will see on estimates and invoices."
            actionLabel="Add business"
            onAction={onAddBusiness}
          />
        ) : (
          <div className="space-y-2">
            {businesses.map(business => (
              <div
                key={business.id}
                className="flex flex-col sm:flex-row items-start gap-3 sm:gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-shrink-0">
                  {business.logo_url ? (
                    <div className="h-14 w-14 rounded border bg-white flex items-center justify-center overflow-hidden">
                      <img
                        src={business.logo_url}
                        alt={business.name}
                        className="h-12 w-12 object-contain"
                      />
                    </div>
                  ) : (
                    <div className="h-14 w-14 rounded border bg-muted flex items-center justify-center">
                      <Building className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 mb-1">
                    <h3 className="font-medium break-words sm:truncate">{business.name}</h3>
                    {business.last_used_at && (
                      <Badge variant="secondary" className="text-xs w-fit">
                        <Clock className="h-3 w-3 mr-1" />
                        Last used
                      </Badge>
                    )}
                  </div>
                  {business.email && <p className="text-sm text-muted-foreground break-all sm:truncate">{business.email}</p>}
                  {business.phone && <p className="text-sm text-muted-foreground">{business.phone}</p>}
                </div>
                <div className="flex items-center gap-2 flex-shrink-0 w-full sm:w-auto justify-end sm:justify-start">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    onClick={() => onEditBusiness(business)}
                    className="h-9 w-9 sm:h-10 sm:w-10"
                  >
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    onClick={() => onDeleteBusiness(business)}
                    className="text-destructive hover:text-destructive h-9 w-9 sm:h-10 sm:w-10"
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
