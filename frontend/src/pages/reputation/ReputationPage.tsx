import React, { useState, useEffect, useCallback } from 'react';
import { useTheme } from 'next-themes';
import { Star, Search, MoreHorizontal, MessageSquare, ThumbsUp, ThumbsDown, ExternalLink } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { useToast } from '@/hooks/use-toast';
import { useHeader } from '@/contexts/HeaderContext';
import { ensureDefaultOrganization } from '@/services/contactsApi';
import { getReviews, getReputationAnalytics } from '@/services/reputationApi';

interface Review {
    id: number;
    platform: string;
    reviewer_name: string;
    rating: number;
    content: string;
    status: 'pending' | 'responded' | 'flagged';
    sentiment: 'positive' | 'neutral' | 'negative';
    created_at: string;
    response?: string;
}

interface Analytics {
    total_reviews: number;
    average_rating: number;
    positive_count: number;
    neutral_count: number;
    negative_count: number;
}

export function ReputationPage() {
    const { toast } = useToast();
    const { setHeaderContent } = useHeader();
    const { theme } = useTheme();

    const [reviews, setReviews] = useState<Review[]>([]);
    const [analytics, setAnalytics] = useState<Analytics | null>(null);
    const [loading, setLoading] = useState(true);
    const [initError, setInitError] = useState<string | null>(null);
    const [organizationId, setOrganizationId] = useState<number | null>(null);
    const [searchQuery, setSearchQuery] = useState('');
    const [ratingFilter, setRatingFilter] = useState<string>('all');

    useEffect(() => {
        setHeaderContent(
            <div className="flex items-center justify-between w-full min-w-0">
                <div className="flex items-center gap-2 ml-2">
                    <Star className="h-5 w-5 text-blue-600 flex-shrink-0" />
                    <h1
                        className="text-xl font-semibold italic truncate"
                        style={{ fontFamily: '"Raleway", sans-serif', color: theme === 'dark' ? '#ffffff' : '#000000' }}
                    >
                        REVIEWS
                    </h1>
                </div>
                <div className="flex items-center gap-2 ml-4 flex-1 justify-end mr-4">
                    <div className="relative hidden md:block w-full max-w-xs">
                        <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-muted-foreground h-4 w-4" />
                        <Input
                            placeholder="Search reviews..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="pl-10 h-9 bg-muted/20 border-border/50"
                        />
                    </div>
                    <Select value={ratingFilter} onValueChange={setRatingFilter}>
                        <SelectTrigger className="w-[120px] h-9 hidden sm:flex">
                            <SelectValue placeholder="Rating" />
                        </SelectTrigger>
                        <SelectContent>
                            <SelectItem value="all">All Ratings</SelectItem>
                            <SelectItem value="5">5 Stars</SelectItem>
                            <SelectItem value="4">4 Stars</SelectItem>
                            <SelectItem value="3">3 Stars</SelectItem>
                            <SelectItem value="2">2 Stars</SelectItem>
                            <SelectItem value="1">1 Star</SelectItem>
                        </SelectContent>
                    </Select>
                </div>
            </div>
        );
        return () => setHeaderContent(null);
    }, [searchQuery, ratingFilter, theme, setHeaderContent]);

    useEffect(() => {
        const initOrg = async () => {
            try {
                const org = await ensureDefaultOrganization();
                setOrganizationId(org.id);
            } catch (error: any) {
                setInitError('Failed to initialize.');
                setLoading(false);
            }
        };
        initOrg();
    }, []);

    const fetchData = useCallback(async () => {
        if (!organizationId) return;
        setLoading(true);
        try {
            const [reviewsRes, analyticsRes] = await Promise.all([
                getReviews(
                    { rating: ratingFilter !== 'all' ? parseInt(ratingFilter) : undefined },
                    organizationId
                ),
                getReputationAnalytics(30, organizationId)
            ]);
            setReviews(reviewsRes.reviews || []);
            // Map the API response to our expected format
            if (analyticsRes?.overall) {
                setAnalytics({
                    total_reviews: Number(analyticsRes.overall.total_reviews) || 0,
                    average_rating: Number(analyticsRes.overall.average_rating) || 0,
                    positive_count: Number(analyticsRes.overall.positive_reviews) || 0,
                    neutral_count: Number(analyticsRes.overall.total_reviews || 0) - Number(analyticsRes.overall.positive_reviews || 0) - Number(analyticsRes.overall.negative_reviews || 0),
                    negative_count: Number(analyticsRes.overall.negative_reviews) || 0,
                });
            } else {
                setAnalytics(null);
            }
        } catch (error) {
            toast({ title: 'Error', description: 'Failed to load reviews', variant: 'destructive' });
        } finally {
            setLoading(false);
        }
    }, [organizationId, ratingFilter]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const renderStars = (rating: number) => {
        return [...Array(5)].map((_, i) => (
            <Star
                key={i}
                className={`h-4 w-4 ${i < rating ? 'text-yellow-400 fill-yellow-400' : 'text-gray-300'}`}
            />
        ));
    };

    const getSentimentBadge = (sentiment: string) => {
        switch (sentiment) {
            case 'positive': return 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300';
            case 'negative': return 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-300';
            default: return 'bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300';
        }
    };

    const filteredReviews = reviews.filter(r =>
        r.reviewer_name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        r.content.toLowerCase().includes(searchQuery.toLowerCase())
    );

    if (initError) {
        return (
            <div className="container mx-auto p-6 max-w-7xl">
                <Card className="max-w-lg mx-auto mt-12">
                    <CardContent className="pt-6 text-center">
                        <p className="text-muted-foreground">{initError}</p>
                        <Button onClick={() => window.location.reload()} className="mt-4">Retry</Button>
                    </CardContent>
                </Card>
            </div>
        );
    }

    return (
        <div className="container mx-auto p-6 max-w-7xl">
            {/* Analytics Summary */}
            {analytics && (
                <div className="grid grid-cols-2 md:grid-cols-5 gap-4 mb-6">
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <p className="text-2xl font-bold">{analytics.total_reviews}</p>
                            <p className="text-sm text-muted-foreground">Total Reviews</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <p className="text-2xl font-bold">{Number(analytics.average_rating || 0).toFixed(1)}</p>
                            <p className="text-sm text-muted-foreground">Average Rating</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <p className="text-2xl font-bold text-green-600">{analytics.positive_count}</p>
                            <p className="text-sm text-muted-foreground">Positive</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <p className="text-2xl font-bold text-gray-600">{analytics.neutral_count}</p>
                            <p className="text-sm text-muted-foreground">Neutral</p>
                        </CardContent>
                    </Card>
                    <Card>
                        <CardContent className="pt-6 text-center">
                            <p className="text-2xl font-bold text-red-600">{analytics.negative_count}</p>
                            <p className="text-sm text-muted-foreground">Negative</p>
                        </CardContent>
                    </Card>
                </div>
            )}

            {/* Reviews List */}
            <Card>
                <CardContent className="p-0">
                    {loading ? (
                        <div className="p-6 space-y-4">
                            {[...Array(3)].map((_, i) => <Skeleton key={i} className="h-32" />)}
                        </div>
                    ) : filteredReviews.length === 0 ? (
                        <div className="p-12 text-center">
                            <div className="mx-auto w-12 h-12 rounded-full bg-muted flex items-center justify-center mb-4">
                                <Star className="h-6 w-6 text-muted-foreground" />
                            </div>
                            <h3 className="text-lg font-medium mb-2">No reviews yet</h3>
                            <p className="text-muted-foreground mb-4">Reviews from your customers will appear here</p>
                        </div>
                    ) : (
                        <div className="divide-y">
                            {filteredReviews.map((review) => (
                                <div key={review.id} className="p-4">
                                    <div className="flex items-start justify-between mb-2">
                                        <div>
                                            <div className="flex items-center gap-2 mb-1">
                                                <p className="font-medium">{review.reviewer_name}</p>
                                                <Badge variant="outline" className="text-xs">{review.platform}</Badge>
                                                <Badge className={`text-xs ${getSentimentBadge(review.sentiment)}`}>
                                                    {review.sentiment}
                                                </Badge>
                                            </div>
                                            <div className="flex items-center gap-1">
                                                {renderStars(review.rating)}
                                                <span className="text-sm text-muted-foreground ml-2">
                                                    {new Date(review.created_at).toLocaleDateString()}
                                                </span>
                                            </div>
                                        </div>
                                        <DropdownMenu>
                                            <DropdownMenuTrigger asChild>
                                                <Button variant="ghost" size="icon">
                                                    <MoreHorizontal className="h-4 w-4" />
                                                </Button>
                                            </DropdownMenuTrigger>
                                            <DropdownMenuContent align="end">
                                                <DropdownMenuItem>
                                                    <MessageSquare className="h-4 w-4 mr-2" />Respond
                                                </DropdownMenuItem>
                                                <DropdownMenuItem>
                                                    <ExternalLink className="h-4 w-4 mr-2" />View Original
                                                </DropdownMenuItem>
                                            </DropdownMenuContent>
                                        </DropdownMenu>
                                    </div>
                                    <p className="text-sm text-muted-foreground">{review.content}</p>
                                    {review.response && (
                                        <div className="mt-3 pl-4 border-l-2 border-blue-500">
                                            <p className="text-sm font-medium">Your Response:</p>
                                            <p className="text-sm text-muted-foreground">{review.response}</p>
                                        </div>
                                    )}
                                </div>
                            ))}
                        </div>
                    )}
                </CardContent>
            </Card>
        </div>
    );
}

export default ReputationPage;
