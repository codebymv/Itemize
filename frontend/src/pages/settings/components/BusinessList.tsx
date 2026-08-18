import React from 'react';
import { Building, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardHeader, CardTitle } from '@/components/ui/card';
import { EmptyState } from '@/components/EmptyState';
import type { Business } from '@/services/invoicesApi';

interface BusinessListProps {
  businesses: Business[];
  onEdit: (business: Business) => void;
  onDelete: (business: Business) => void;
  empty?: boolean;
  loading?: boolean;
}

export const BusinessList: React.FC<BusinessListProps> = ({
  businesses,
  onEdit,
  onDelete,
  empty = false,
  loading = false,
}) => {
  if (loading) {
    return (
      <div className="space-y-2">
        {[1, 2, 3].map((i) => (
          <div key={i} className="h-20 bg-muted/50 rounded animate-pulse" />
        ))}
      </div>
    );
  }

  if (empty || businesses.length === 0) {
    return (
      <EmptyState
        icon={Building}
        title="No businesses yet"
        description="Add your first business to get started."
      />
    );
  }

  return (
    <div className="space-y-2">
      {businesses.map((business) => (
        <Card key={business.id}>
          <CardHeader className="pb-2">
            <div className="flex items-start justify-between">
              <div className="flex items-center gap-3">
                {business.logo_url && (
                  <div className="h-10 w-10 rounded bg-muted flex items-center justify-center overflow-hidden">
                    <img
                      src={business.logo_url}
                      alt={business.name}
                      className="object-cover w-full h-full"
                    />
                  </div>
                )}
                <div>
                  <CardTitle className="text-sm">{business.name}</CardTitle>
                  {business.email && (
                    <p className="text-xs text-muted-foreground">{business.email}</p>
                  )}
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onEdit(business)}
                >
                  <Edit className="h-4 w-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => onDelete(business)}
                >
                  <Trash2 className="h-4 w-4 text-muted-foreground hover:text-destructive" />
                </Button>
              </div>
            </div>
          </CardHeader>
        </Card>
      ))}
    </div>
  );
};