import React from 'react';
import { Routes, Route, useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useTheme } from 'next-themes';
import { useAISuggest } from '@/context/AISuggestContext';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
    User,
    Palette,
    Sparkles,
    Bell,
    Link as LinkIcon,
    Sun,
    Moon
} from 'lucide-react';

// Settings navigation items
const settingsNav = [
    { title: 'Profile', path: '/settings', icon: User },
    { title: 'Appearance', path: '/settings/appearance', icon: Palette },
    { title: 'AI Features', path: '/settings/ai', icon: Sparkles },
    { title: 'Integrations', path: '/settings/integrations', icon: LinkIcon, disabled: true },
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
                        className={`justify-start text-muted-foreground hover:text-foreground ${item.disabled ? 'opacity-50' : ''}`}
                        onClick={() => !item.disabled && navigate(item.path)}
                        disabled={item.disabled}
                        style={{ fontFamily: '"Raleway", sans-serif' }}
                    >
                        <item.icon className={`mr-2 h-4 w-4 ${isActive ? 'text-blue-600' : ''}`} />
                        {item.title}
                        {item.disabled && <span className="ml-auto text-xs">Soon</span>}
                    </Button>
                );
            })}
        </nav>
    );
}

function ProfileSettings() {
    const { currentUser } = useAuth();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Profile</h3>
                <p className="text-sm text-muted-foreground">
                    Your account information
                </p>
            </div>
            <Separator />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Account</CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex items-center gap-4">
                        <div className="h-16 w-16 rounded-full bg-blue-600 flex items-center justify-center text-white text-xl font-medium">
                            {currentUser?.name?.[0]?.toUpperCase() || 'U'}
                        </div>
                        <div>
                            <p className="font-medium">{currentUser?.name || 'User'}</p>
                            <p className="text-sm text-muted-foreground">{currentUser?.email}</p>
                        </div>
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

function AppearanceSettings() {
    const { theme, setTheme } = useTheme();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Appearance</h3>
                <p className="text-sm text-muted-foreground">
                    Customize how Itemize looks on your device
                </p>
            </div>
            <Separator />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">Theme</CardTitle>
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
        </div>
    );
}

function AISettings() {
    const { aiEnabled, setAiEnabled } = useAISuggest();

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">AI Features</h3>
                <p className="text-sm text-muted-foreground">
                    Configure AI-powered enhancements
                </p>
            </div>
            <Separator />
            <Card>
                <CardHeader>
                    <CardTitle className="text-base">AI Suggestions</CardTitle>
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

function IntegrationsSettings() {
    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-medium">Integrations</h3>
                <p className="text-sm text-muted-foreground">
                    Connect Itemize with other tools
                </p>
            </div>
            <Separator />
            <Card>
                <CardContent className="py-8 text-center">
                    <LinkIcon className="h-8 w-8 mx-auto text-muted-foreground mb-4" />
                    <p className="text-muted-foreground">Integrations coming soon</p>
                </CardContent>
            </Card>
        </div>
    );
}

export function SettingsPage() {
    return (
        <div className="container mx-auto p-6 max-w-4xl">
            <div className="mb-8">
                <h1 className="text-2xl font-light tracking-tight">Settings</h1>
                <p className="text-muted-foreground">
                    Manage your account and preferences
                </p>
            </div>

            <div className="grid gap-8 md:grid-cols-[200px_1fr]">
                <SettingsNav />

                <div className="min-w-0">
                    <Routes>
                        <Route index element={<ProfileSettings />} />
                        <Route path="appearance" element={<AppearanceSettings />} />
                        <Route path="ai" element={<AISettings />} />
                        <Route path="integrations" element={<IntegrationsSettings />} />
                    </Routes>
                </div>
            </div>
        </div>
    );
}

export default SettingsPage;
