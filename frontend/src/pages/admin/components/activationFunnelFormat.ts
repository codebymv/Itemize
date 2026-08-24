export const formatMedian = (hours: number | null | undefined): string => {
    if (hours == null) return 'Median —';
    if (hours < 1) return `Median ${Math.max(1, Math.round(hours * 60))}m`;
    if (hours < 24) return `Median ${Math.round(hours * 10) / 10}h`;
    return `Median ${Math.round((hours / 24) * 10) / 10}d`;
};
