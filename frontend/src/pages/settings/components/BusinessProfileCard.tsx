import React from 'react';
import { Plus, Building, Clock, Edit, Trash2, Upload } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import type { Business } from '@/services/invoicesApi';

interface BusinessProfileCardProps {
  businesses: Business[];
  loading?: boolean;
  onAddBusiness: () => void;
  onEditBusiness: (business: Business) => void;
  onDeleteBusiness: (business: Business) => void;
}

export const BusinessProfileCard: React.FC<BusinessProfileCardProps> = ({
  businesses,
  loading = false,
  onAddBusiness,
  onEditBusiness,
  onDeleteBusiness,
}) => {
  if (loading) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Business Profiles</CardTitle>
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
          <CardTitle className="text-base">Business Profiles</CardTitle>
          <CardDescription>Manage your business profiles for invoicing</CardDescription>
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
        {businesses.length === 0 ? (
          <div className="text-center py-8 border-2 border-dashed rounded-lg">
            <Building className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">No businesses yet</p>
            <p className="text-sm text-muted-foreground mb-4">
              Add your first business to start creating invoices
            </p>
            <Button
              onClick={onAddBusiness}
              className="bg-blue-600 hover:bg-blue-700 text-white"
            >
              <Plus className="h-4 w-4 mr-2" />
              Add Business
            </Button>
          </div>
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