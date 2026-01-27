import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { useHeader } from '@/contexts/HeaderContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { PricingCards } from '@/components/subscription';
import { SubscriptionStatus } from '@/components/subscription/SubscriptionStatus';
import { Plan } from '@/lib/subscription';
import { useToast } from '@/hooks/use-toast';
import { getAssetUrl } from '@/lib/api';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { 
    getPaymentSettings, 
    updatePaymentSettings, 
    PaymentSettings,
    Business,
    getBusinesses,
    createBusiness,
    updateBusiness,
    deleteBusiness,
    uploadBusinessLogo,
    deleteBusinessLogo,
} from '@/services/invoicesApi';
import {
    Settings,
    User,
    Wrench,
    Sparkles,
    Sun,
    Moon,
    CreditCard,
    Building,
    FileText,
    Percent,
    Plus,
    Edit,
    Trash2,
    Upload,
    Clock,
    Link,
    CheckCircle,
    XCircle,
    Save,
} from 'lucide-react';

// Settings navigation items
const settingsNav = [
    { title: 'Account', path: '/settings', icon: User },
    { title: 'Preferences', path: '/settings/preferences', icon: Wrench },
    { title: 'Payments', path: '/settings/payments', icon: CreditCard },
];

function SettingsNav() {
    const location = useLocation();
    const navigate = useNavigate();

    return (
        <nav className="flex flex-col gap-1">
            {settingsNav.map((item) => {
                const isActive = location.pathname === item.path;
                return (
                    <Button
                        key={item.path}
                        variant={isActive ? 'secondary' : 'ghost'}
                        className="justify-start text-muted-foreground hover:text-foreground group/btn"
                        onClick={() => navigate(item.path)}
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                    >
                        <item.icon className={`mr-2 h-4 w-4 transition-colors ${isActive ? 'text-blue-600' : 'group-hover/btn:text-blue-600'}`} />
                        {item.title}
                    </Button>
                );
            })}
        </nav>
    );
}

function AccountInfo({ currentPlan }: { currentPlan?: Plan }) {
    const { currentUser } = useAuth();
    const { startCheckout } = useSubscription();
    const [billingPeriod, setBillingPeriod] = useState<'monthly' | 'yearly'>('monthly');
    const [isLoading, setIsLoading] = useState(false);

    const handleUpgrade = async (planId: Plan) => {
        if (currentPlan === planId) return; // Don't upgrade to current plan
        
        setIsLoading(true);
        try {
            await startCheckout(planId, billingPeriod);
        } catch (error) {
            console.error('Failed to start checkout:', error);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="space-y-6">
            {/* Account Information Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Account Information</CardTitle>
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-medium">
                            {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <p className="font-medium">{currentUser?.name || 'User'}</p>
                            <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
                        </div>
                    </div>

                    <Separator />

                    <SubscriptionStatus />
                </CardContent>
            </Card>

            {/* Available Plans Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Available Plans</CardTitle>
                    <CardDescription>Choose the plan that works best for you</CardDescription>
                </CardHeader>
                <CardContent>
                    <PricingCards
                        variant="dashboard"
                        currentPlan={currentPlan}
                        onUpgrade={handleUpgrade}
                        isLoading={isLoading}
                        showYearlyToggle={true}
                        billingPeriod={billingPeriod}
                        onBillingPeriodChange={setBillingPeriod}
                    />
                </CardContent>
            </Card>
        </div>
    );
}

function AccountSettings() {
    const { planName } = useSubscription();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Account</h3>
                <p className="text-sm text-muted-foreground">
                    Manage your account information and subscription
                </p>
            </div>
            <Separator />
            
            <AccountInfo currentPlan={planName as Plan | undefined} />
        </div>
    );
}

function PreferencesSettings() {
    const { theme, setTheme } = useTheme();
    const { aiEnabled, setAiEnabled } = useAISuggest();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Preferences</h3>
                <p className="text-sm text-muted-foreground">
                    Customize your experience
                </p>
            </div>
            <Separator />
            
            {/* Appearance Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Appearance</CardTitle>
                    <CardDescription>Select your preferred theme</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex gap-4">
                        <Button
                            variant={theme === 'light' ? 'default' : 'outline'}
                            className={`flex-1 ${theme === 'light' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                            onClick={() => setTheme('light')}
                        >
                            <Sun className="mr-2 h-4 w-4" />
                            Light
                        </Button>
                        <Button
                            variant={theme === 'dark' ? 'default' : 'outline'}
                            className={`flex-1 ${theme === 'dark' ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}`}
                            onClick={() => setTheme('dark')}
                        >
                            <Moon className="mr-2 h-4 w-4" />
                            Dark
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* AI Features Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">AI Features</CardTitle>
                    <CardDescription>
                        Get smart suggestions for list items, note content, and more
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <Sparkles className="h-4 w-4 text-blue-600" />
                            <Label htmlFor="ai-toggle">Enable AI Enhancements</Label>
                        </div>
                        <Switch
                            id="ai-toggle"
                            checked={aiEnabled}
                            onCheckedChange={setAiEnabled}
                        />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function PaymentsSettings({ setSaveButton }: { setSaveButton?: (button: React.ReactNode) => void }) {
    const { toast } = useToast();
    
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    
    // Settings state
    const [settings, setSettings] = useState<PaymentSettings>({
        invoice_prefix: 'INV-',
        next_invoice_number: 1,
        default_payment_terms: 30,
        default_tax_rate: 10,
        default_currency: 'USD',
        stripe_connected: false,
    });

    // Businesses state
    const [businesses, setBusinesses] = useState<Business[]>([]);
    const [businessDialogOpen, setBusinessDialogOpen] = useState(false);
    const [editingBusiness, setEditingBusiness] = useState<Business | null>(null);
    const [businessFormData, setBusinessFormData] = useState({
        name: '',
        email: '',
        phone: '',
        address: '',
        tax_id: '',
        logo_url: '',
    });
    const [savingBusiness, setSavingBusiness] = useState(false);
    const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
    const [businessToDelete, setBusinessToDelete] = useState<Business | null>(null);
    const [uploadingLogo, setUploadingLogo] = useState(false);
    const [pendingLogoFile, setPendingLogoFile] = useState<File | null>(null);
    const businessFileInputRef = useRef<HTMLInputElement>(null);

    useEffect(() => {
        const init = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error) {
                toast({ title: 'Error', description: 'Failed to initialize', variant: 'destructive' });
                setLoading(false);
            }
        };
        init();
    }, [toast]);

    const fetchData = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const [settingsData, businessesData] = await Promise.all([
                getPaymentSettings(organizationId),
                getBusinesses(organizationId),
            ]);
            setSettings(settingsData);
            setBusinesses(businessesData);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load settings', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, toast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleSaveSettings = useCallback(async () => {
        if (!organizationId) return;
        setSaving(true);
        try {
            const updated = await updatePaymentSettings(settings, organizationId);
            setSettings(updated);
            toast({ title: 'Saved', description: 'Payment settings saved successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save settings', variant: 'destructive' });
        } finally {
            setSaving(false);
        }
    }, [organizationId, settings, toast]);

    const updateField = (field: keyof PaymentSettings, value: any) => {
        setSettings(prev => ({ ...prev, [field]: value }));
    };

    // Business CRUD handlers
    const openBusinessDialog = (business?: Business) => {
        if (businessFormData.logo_url?.startsWith('blob:')) {
            URL.revokeObjectURL(businessFormData.logo_url);
        }
        
        if (business) {
            setEditingBusiness(business);
            setBusinessFormData({
                name: business.name || '',
                email: business.email || '',
                phone: business.phone || '',
                address: business.address || '',
                tax_id: business.tax_id || '',
                logo_url: business.logo_url || '',
            });
        } else {
            setEditingBusiness(null);
            setBusinessFormData({
                name: '',
                email: '',
                phone: '',
                address: '',
                tax_id: '',
                logo_url: '',
            });
            setPendingLogoFile(null);
        }
        setBusinessDialogOpen(true);
    };

    const handleSaveBusiness = async () => {
        if (!organizationId) return;
        if (!businessFormData.name.trim()) {
            toast({ title: 'Error', description: 'Business name is required', variant: 'destructive' });
            return;
        }

        setSavingBusiness(true);
        try {
            if (editingBusiness) {
                const updated = await updateBusiness(editingBusiness.id, businessFormData, organizationId);
                setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b));
                toast({ title: 'Updated', description: 'Business updated successfully' });
            } else {
                const created = await createBusiness(businessFormData, organizationId);
                setBusinesses(prev => [created, ...prev]);
                
                if (pendingLogoFile) {
                    try {
                        setUploadingLogo(true);
                        const result = await uploadBusinessLogo(created.id, pendingLogoFile, organizationId);
                        const updated = await updateBusiness(created.id, { ...businessFormData, logo_url: result.logo_url }, organizationId);
                        setBusinesses(prev => prev.map(b => b.id === updated.id ? updated : b));
                        if (businessFormData.logo_url?.startsWith('blob:')) {
                            URL.revokeObjectURL(businessFormData.logo_url);
                        }
                        toast({ title: 'Created', description: 'Business created with logo successfully' });
                    } catch (logoError: any) {
                        if (businessFormData.logo_url?.startsWith('blob:')) {
                            URL.revokeObjectURL(businessFormData.logo_url);
                        }
                        toast({ 
                            title: 'Created', 
                            description: 'Business created but logo upload failed. You can add a logo later.', 
                            variant: 'default' 
                        });
                    } finally {
                        setUploadingLogo(false);
                        setPendingLogoFile(null);
                    }
                } else {
                    toast({ title: 'Created', description: 'Business created successfully' });
                }
            }
            setBusinessDialogOpen(false);
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to save business', variant: 'destructive' });
        } finally {
            setSavingBusiness(false);
        }
    };

    const handleDeleteBusiness = async () => {
        if (!organizationId || !businessToDelete) return;

        try {
            await deleteBusiness(businessToDelete.id, organizationId);
            setBusinesses(prev => prev.filter(b => b.id !== businessToDelete.id));
            toast({ title: 'Deleted', description: 'Business deleted successfully' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to delete business', variant: 'destructive' });
        } finally {
            setDeleteDialogOpen(false);
            setBusinessToDelete(null);
        }
    };

    const handleBusinessLogoUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
        const file = event.target.files?.[0];
        if (!file || !organizationId) return;

        const allowedTypes = ['image/jpeg', 'image/jpg', 'image/png', 'image/gif', 'image/webp'];
        if (!allowedTypes.includes(file.type)) {
            toast({ title: 'Invalid file type', description: 'Please upload a JPEG, PNG, GIF, or WebP image.', variant: 'destructive' });
            return;
        }

        if (file.size > 2 * 1024 * 1024) {
            toast({ title: 'File too large', description: 'Maximum file size is 2MB.', variant: 'destructive' });
            return;
        }

        if (editingBusiness) {
            setUploadingLogo(true);
            try {
                const result = await uploadBusinessLogo(editingBusiness.id, file, organizationId);
                setBusinessFormData(prev => ({ ...prev, logo_url: result.logo_url }));
                setBusinesses(prev => prev.map(b => 
                    b.id === editingBusiness.id ? { ...b, logo_url: result.logo_url } : b
                ));
                toast({ title: 'Logo uploaded', description: 'Business logo has been updated.' });
            } catch (error: any) {
                toast({ 
                    title: 'Upload failed', 
                    description: error.response?.data?.error || 'Failed to upload logo.', 
                    variant: 'destructive' 
                });
            } finally {
                setUploadingLogo(false);
                if (businessFileInputRef.current) {
                    businessFileInputRef.current.value = '';
                }
            }
        } else {
            setPendingLogoFile(file);
            const previewUrl = URL.createObjectURL(file);
            setBusinessFormData(prev => ({ ...prev, logo_url: previewUrl }));
            toast({ title: 'Logo selected', description: 'Logo will be uploaded when you save the business.' });
        }
    };

    const handleRemoveBusinessLogo = async () => {
        if (!organizationId || !editingBusiness) return;

        setUploadingLogo(true);
        try {
            await deleteBusinessLogo(editingBusiness.id, organizationId);
            setBusinessFormData(prev => ({ ...prev, logo_url: '' }));
            setBusinesses(prev => prev.map(b => 
                b.id === editingBusiness.id ? { ...b, logo_url: undefined } : b
            ));
            toast({ title: 'Logo removed', description: 'Business logo has been removed.' });
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to remove logo.', variant: 'destructive' });
        } finally {
            setUploadingLogo(false);
        }
    };

    // Set save button in header (must be before early return)
    useEffect(() => {
        if (setSaveButton && !loading) {
            setSaveButton(
                <Button
                    size="sm"
                    className="bg-blue-600 hover:bg-blue-700 text-white"
                    onClick={handleSaveSettings}
                    disabled={saving}
                >
                    <Save className="h-4 w-4 mr-2" />
                    {saving ? 'Saving...' : 'Save Settings'}
                </Button>
            );
        }
        return () => {
            if (setSaveButton) {
                setSaveButton(null);
            }
        };
    }, [saving, setSaveButton, loading, handleSaveSettings]);

    if (loading) {
        return (
            <div className="space-y-6">
                <div>
                    <h3 className="text-lg font-medium">Payments</h3>
                    <p className="text-sm text-muted-foreground">
                        Configure invoicing and payment settings
                    </p>
                </div>
                <Separator />
                <Skeleton className="h-48" />
                <Skeleton className="h-48" />
            </div>
        );
    }


    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Payments</h3>
                <p className="text-sm text-muted-foreground">
                    Configure invoicing and payment settings
                </p>
            </div>
            <Separator />

            {/* Business Profiles Card */}
            <Card>
                <CardHeader className={businesses.length > 0 ? "flex flex-row items-center justify-between space-y-0 pb-4" : ""}>
                    <div>
                        <CardTitle className="text-base">Business Profiles</CardTitle>
                        <CardDescription>Manage your business profiles for invoicing</CardDescription>
                    </div>
                    {businesses.length > 0 && (
                        <Button
                            size="sm"
                            onClick={() => openBusinessDialog()}
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
                                onClick={() => openBusinessDialog()}
                                className="bg-blue-600 hover:bg-blue-700 text-white"
                            >
                                <Plus className="h-4 w-4 mr-2" />
                                Add Business
                            </Button>
                        </div>
                    ) : (
                        <div className="grid gap-4">
                            {businesses.map(business => (
                                <div
                                    key={business.id}
                                    className="flex items-start gap-4 p-4 border rounded-lg hover:bg-muted/50 transition-colors"
                                >
                                    <div className="flex-shrink-0">
                                        {business.logo_url ? (
                                            <img
                                                src={getAssetUrl(business.logo_url)}
                                                alt={business.name}
                                                className="h-14 w-14 object-contain rounded border bg-white"
                                            />
                                        ) : (
                                            <div className="h-14 w-14 rounded border bg-muted flex items-center justify-center">
                                                <Building className="h-6 w-6 text-muted-foreground" />
                                            </div>
                                        )}
                                    </div>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2">
                                            <h3 className="font-medium truncate">{business.name}</h3>
                                            {business.last_used_at && (
                                                <Badge variant="secondary" className="text-xs">
                                                    <Clock className="h-3 w-3 mr-1" />
                                                    Last used
                                                </Badge>
                                            )}
                                        </div>
                                        {business.email && <p className="text-sm text-muted-foreground truncate">{business.email}</p>}
                                        {business.phone && <p className="text-sm text-muted-foreground">{business.phone}</p>}
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <Button variant="ghost" size="icon" onClick={() => openBusinessDialog(business)}>
                                            <Edit className="h-4 w-4" />
                                        </Button>
                                        <Button
                                            variant="ghost"
                                            size="icon"
                                            onClick={() => { setBusinessToDelete(business); setDeleteDialogOpen(true); }}
                                            className="text-destructive hover:text-destructive"
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

            {/* Invoice Settings Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Invoice Settings</CardTitle>
                    <CardDescription>Configure how your invoices are numbered and their default terms</CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="grid grid-cols-3 gap-4">
                        <div>
                            <Label>Invoice Prefix</Label>
                            <Input
                                value={settings.invoice_prefix || ''}
                                onChange={(e) => updateField('invoice_prefix', e.target.value)}
                                placeholder="INV-"
                            />
                        </div>
                        <div>
                            <Label>Next Invoice Number</Label>
                            <Input
                                type="number"
                                min="1"
                                value={settings.next_invoice_number || ''}
                                onChange={(e) => updateField('next_invoice_number', e.target.value === '' ? 1 : parseInt(e.target.value))}
                            />
                        </div>
                        <div>
                            <Label>Default Payment Due</Label>
                            <Select
                                value={String(settings.default_payment_terms || 30)}
                                onValueChange={(v) => updateField('default_payment_terms', parseInt(v))}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="0">Due on receipt</SelectItem>
                                    <SelectItem value="7">7 days</SelectItem>
                                    <SelectItem value="14">14 days</SelectItem>
                                    <SelectItem value="15">15 days</SelectItem>
                                    <SelectItem value="30">30 days</SelectItem>
                                    <SelectItem value="45">45 days</SelectItem>
                                    <SelectItem value="60">60 days</SelectItem>
                                    <SelectItem value="90">90 days</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                    <div>
                        <Label>Default Notes</Label>
                        <Textarea
                            value={settings.default_notes || ''}
                            onChange={(e) => updateField('default_notes', e.target.value)}
                            placeholder="Thank you for your business!"
                            rows={2}
                        />
                    </div>
                    <div>
                        <Label>Default Terms & Conditions</Label>
                        <Textarea
                            value={settings.default_terms || ''}
                            onChange={(e) => updateField('default_terms', e.target.value)}
                            placeholder="Payment is due within the specified terms."
                            rows={3}
                        />
                    </div>
                </CardContent>
            </Card>

            {/* Tax Settings Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Tax Settings</CardTitle>
                    <CardDescription>Configure default tax rates for new products and invoices</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="grid grid-cols-2 gap-4">
                        <div>
                            <Label>Default Tax Rate (%)</Label>
                            <Input
                                type="number"
                                min="0"
                                max="100"
                                step="0.1"
                                value={settings.default_tax_rate ?? ''}
                                onChange={(e) => updateField('default_tax_rate', e.target.value === '' ? 0 : parseFloat(e.target.value))}
                            />
                        </div>
                        <div>
                            <Label>Default Currency</Label>
                            <Select
                                value={settings.default_currency || 'USD'}
                                onValueChange={(v) => updateField('default_currency', v)}
                            >
                                <SelectTrigger>
                                    <SelectValue />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="USD">USD - US Dollar</SelectItem>
                                    <SelectItem value="EUR">EUR - Euro</SelectItem>
                                    <SelectItem value="GBP">GBP - British Pound</SelectItem>
                                    <SelectItem value="CAD">CAD - Canadian Dollar</SelectItem>
                                    <SelectItem value="AUD">AUD - Australian Dollar</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                    </div>
                </CardContent>
            </Card>

            {/* Online Payments Card */}
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Online Payments</CardTitle>
                    <CardDescription>Connect Stripe to accept online payments from your customers</CardDescription>
                </CardHeader>
                <CardContent>
                    <div className="flex items-center justify-between p-4 border rounded-lg">
                        <div className="flex items-center gap-4">
                            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${settings.stripe_connected ? 'bg-green-100 dark:bg-green-900' : 'bg-muted'}`}>
                                {settings.stripe_connected ? (
                                    <CheckCircle className="h-6 w-6 text-green-600" />
                                ) : (
                                    <XCircle className="h-6 w-6 text-muted-foreground" />
                                )}
                            </div>
                            <div>
                                <p className="font-medium">
                                    {settings.stripe_connected ? 'Stripe Connected' : 'Stripe Not Connected'}
                                </p>
                                <p className="text-sm text-muted-foreground">
                                    {settings.stripe_connected
                                        ? `Connected ${settings.stripe_connected_at ? new Date(settings.stripe_connected_at).toLocaleDateString() : ''}`
                                        : 'Connect your Stripe account to accept credit card payments'
                                    }
                                </p>
                            </div>
                        </div>
                        <Button
                            variant={settings.stripe_connected ? 'outline' : 'default'}
                            className={!settings.stripe_connected ? 'bg-blue-600 hover:bg-blue-700 text-white' : ''}
                        >
                            <Link className="h-4 w-4 mr-2" />
                            {settings.stripe_connected ? 'Manage Connection' : 'Connect Stripe'}
                        </Button>
                    </div>
                    {settings.stripe_connected && settings.stripe_account_id && (
                        <div className="mt-4 p-3 bg-muted/50 rounded-lg">
                            <p className="text-sm text-muted-foreground">
                                Stripe Account ID: <code className="text-xs">{settings.stripe_account_id}</code>
                            </p>
                        </div>
                    )}
                </CardContent>
            </Card>

            {/* Business Add/Edit Dialog */}
            <Dialog open={businessDialogOpen} onOpenChange={(open) => {
                if (!open) {
                    if (businessFormData.logo_url?.startsWith('blob:')) {
                        URL.revokeObjectURL(businessFormData.logo_url);
                    }
                    setPendingLogoFile(null);
                }
                setBusinessDialogOpen(open);
            }}>
                <DialogContent className="sm:max-w-[500px]">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <Building className="h-5 w-5 text-blue-500" />
                            {editingBusiness ? 'Edit Business' : 'Add Business'}
                        </DialogTitle>
                        <DialogDescription>
                            {editingBusiness ? 'Update your business profile information' : 'Add a new business profile for invoicing'}
                        </DialogDescription>
                    </DialogHeader>
                    <div className="grid gap-4 py-4">
                        <div className="space-y-2">
                            <Label>Business Name *</Label>
                            <Input
                                value={businessFormData.name}
                                onChange={(e) => setBusinessFormData(prev => ({ ...prev, name: e.target.value }))}
                                placeholder="Your Business Name"
                            />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-2">
                                <Label>Email</Label>
                                <Input
                                    type="email"
                                    value={businessFormData.email}
                                    onChange={(e) => setBusinessFormData(prev => ({ ...prev, email: e.target.value }))}
                                    placeholder="billing@business.com"
                                />
                            </div>
                            <div className="space-y-2">
                                <Label>Phone</Label>
                                <Input
                                    value={businessFormData.phone}
                                    onChange={(e) => setBusinessFormData(prev => ({ ...prev, phone: e.target.value }))}
                                    placeholder="+1 (555) 123-4567"
                                />
                            </div>
                        </div>
                        <div className="space-y-2">
                            <Label>Tax ID / VAT Number</Label>
                            <Input
                                value={businessFormData.tax_id}
                                onChange={(e) => setBusinessFormData(prev => ({ ...prev, tax_id: e.target.value }))}
                                placeholder="XX-XXXXXXX"
                            />
                        </div>
                        <div className="space-y-2">
                            <Label>Address</Label>
                            <Textarea
                                value={businessFormData.address}
                                onChange={(e) => setBusinessFormData(prev => ({ ...prev, address: e.target.value }))}
                                placeholder="123 Business St, Suite 100&#10;City, State 12345"
                                rows={3}
                            />
                        </div>
                        
                        {/* Logo Upload */}
                        <div className="space-y-2">
                            <Label>Logo</Label>
                            <div className="mt-1">
                                {businessFormData.logo_url ? (
                                    <div className="flex items-center gap-4 p-3 border rounded-lg">
                                        <img
                                            src={businessFormData.logo_url.startsWith('blob:') || businessFormData.logo_url.startsWith('http') 
                                                ? businessFormData.logo_url 
                                                : getAssetUrl(businessFormData.logo_url)}
                                            alt="Business Logo"
                                            className="h-12 w-auto object-contain rounded border bg-white"
                                        />
                                        <div className="flex gap-2">
                                            <Button
                                                type="button"
                                                variant="outline"
                                                size="sm"
                                                onClick={() => businessFileInputRef.current?.click()}
                                                disabled={uploadingLogo || savingBusiness}
                                            >
                                                <Upload className="h-3 w-3 mr-1" />
                                                {editingBusiness ? 'Replace' : 'Change'}
                                            </Button>
                                            {editingBusiness && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={handleRemoveBusinessLogo}
                                                    disabled={uploadingLogo}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                    Remove
                                                </Button>
                                            )}
                                            {!editingBusiness && pendingLogoFile && (
                                                <Button
                                                    type="button"
                                                    variant="outline"
                                                    size="sm"
                                                    onClick={() => {
                                                        if (businessFormData.logo_url?.startsWith('blob:')) {
                                                            URL.revokeObjectURL(businessFormData.logo_url);
                                                        }
                                                        setPendingLogoFile(null);
                                                        setBusinessFormData(prev => ({ ...prev, logo_url: '' }));
                                                        if (businessFileInputRef.current) {
                                                            businessFileInputRef.current.value = '';
                                                        }
                                                    }}
                                                    disabled={uploadingLogo || savingBusiness}
                                                    className="text-destructive hover:text-destructive"
                                                >
                                                    <Trash2 className="h-3 w-3 mr-1" />
                                                    Remove
                                                </Button>
                                            )}
                                        </div>
                                    </div>
                                ) : (
                                    <Button
                                        type="button"
                                        variant="outline"
                                        onClick={() => businessFileInputRef.current?.click()}
                                        disabled={uploadingLogo || savingBusiness}
                                    >
                                        <Upload className="h-4 w-4 mr-2" />
                                        {uploadingLogo ? 'Uploading...' : 'Upload Logo'}
                                    </Button>
                                )}
                                <input
                                    ref={businessFileInputRef}
                                    type="file"
                                    accept="image/jpeg,image/jpg,image/png,image/gif,image/webp"
                                    onChange={handleBusinessLogoUpload}
                                    className="hidden"
                                />
                                <p className="text-xs text-muted-foreground mt-2">
                                    PNG, JPG, GIF or WebP (max 2MB)
                                </p>
                            </div>
                        </div>
                    </div>
                    <DialogFooter>
                        <Button variant="outline" onClick={() => setBusinessDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button
                            onClick={handleSaveBusiness}
                            disabled={savingBusiness}
                            className="bg-blue-600 hover:bg-blue-700 text-white"
                        >
                            {savingBusiness ? 'Saving...' : editingBusiness ? 'Save Changes' : 'Add Business'}
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Business</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete "{businessToDelete?.name}"? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleDeleteBusiness}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            Delete
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}

export function SettingsPage() {
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();
    const location = useLocation();
    const [saveButton, setSaveButton] = useState<React.ReactNode>(null);

    // Find the active nav item based on current path
    const activeNavItem = settingsNav.find(item => item.path === location.pathname) || settingsNav[0];

    // Set header content with icon and title including active tab
    useEffect(() => {
        setHeaderContent(
            <div className="flex flex-col md:flex-row md:items-center md:justify-between w-full min-w-0 gap-3 md:gap-2">
                <div className="flex items-center gap-2 ml-2">
                    <Settings className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        SETTINGS | {activeNavItem.title}
                    </h1>
                </div>
                {saveButton && <div className="flex items-center gap-2">{saveButton}</div>}
            </div>
        );
        return () => setHeaderContent(null);
    }, [theme, setHeaderContent, activeNavItem.title, saveButton]);

    return (
        <div className="container mx-auto p-6 max-w-8xl">
            <div className="grid gap-8 md:grid-cols-[200px_1fr]">
                <SettingsNav />

                <div className="min-w-0" key={location.pathname}>
                    <Routes>
                        <Route index element={<AccountSettings />} />
                        <Route path="preferences" element={<PreferencesSettings />} />
                        <Route path="payments" element={<PaymentsSettings setSaveButton={setSaveButton} />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;
