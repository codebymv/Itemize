import React, { useEffect, useState } from 'react';
import {
  Share2,
  Copy,
  Check,
  ExternalLink,
  StickyNote,
  CheckSquare,
  Palette,
  GitBranch,
  KeyRound,
  AlertTriangle,
  ShieldAlert,
  Info
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useToast } from '../hooks/use-toast';
import { useStableMutationKey } from '../hooks/useStableMutationKey';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from './ui/tooltip';

type ShareItemType = 'note' | 'list' | 'whiteboard' | 'wireframe' | 'vault';

interface ShareModalProps<TId extends string | number = string | number> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: ShareItemType;
  itemId: TId;
  itemTitle: string;
  onShare: (id: TId) => Promise<{ shareToken: string; shareUrl: string }>;
  onUnshare: (id: TId, mutationId: string) => Promise<void>;
  existingShareData?: { shareToken: string; shareUrl: string } | null;
  isLocked?: boolean;
  showWarning?: boolean;
}

const shareConfig = {
  note: {
    label: 'Note',
    description: 'Create a shareable link for your note',
    icon: StickyNote,
    iconClassName: 'text-slate-500',
    shareHelp: 'Anyone with this link can view this note',
    shareSuccessTitle: 'Note shared successfully',
    shareSuccessDescription: 'Anyone with this link can view your note.',
    revokeDescription: 'This note is no longer publicly accessible.'
  },
  list: {
    label: 'List',
    description: 'Create a shareable link for your list',
    icon: CheckSquare,
    iconClassName: 'text-slate-500',
    shareHelp: 'Anyone with this link can view this list',
    shareSuccessTitle: 'List shared successfully',
    shareSuccessDescription: 'Anyone with this link can view your list.',
    revokeDescription: 'This list is no longer publicly accessible.'
  },
  whiteboard: {
    label: 'Whiteboard',
    description: 'Create a shareable link for your whiteboard',
    icon: Palette,
    iconClassName: 'text-slate-500',
    shareHelp: 'Anyone with this link can view this whiteboard',
    shareSuccessTitle: 'Whiteboard shared successfully',
    shareSuccessDescription: 'Anyone with this link can view your whiteboard.',
    revokeDescription: 'This whiteboard is no longer publicly accessible.'
  },
  wireframe: {
    label: 'Wireframe',
    description: 'Create a shareable link for your wireframe',
    icon: GitBranch,
    iconClassName: 'text-slate-500',
    shareHelp: 'Anyone with this link can view this wireframe',
    shareSuccessTitle: 'Wireframe shared successfully',
    shareSuccessDescription: 'Anyone with this link can view your wireframe.',
    revokeDescription: 'This wireframe is no longer publicly accessible.'
  },
  vault: {
    label: 'Vault',
    description: 'Create an encrypted share link.',
    icon: KeyRound,
    iconClassName: 'text-blue-600',
    shareHelp: 'Anyone with the full URL, including the #fragment, can read a snapshot of this vault. Itemize cannot recover a link copied without the fragment.',
    shareSuccessTitle: 'Vault shared successfully',
    shareSuccessDescription: 'Copy the full link. The fragment after # is the decryption key and is never sent to Itemize.',
    revokeDescription: 'This vault is no longer publicly accessible.'
  }
} as const;

const ShareLinkLabel = ({ help, itemLabel }: { help?: string; itemLabel: string }) => (
  <div className="flex items-center gap-1.5">
    <Label className="font-raleway">Share Link</Label>
    {help && (
      <TooltipProvider delayDuration={200}>
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              className="inline-flex h-5 w-5 items-center justify-center rounded-full text-muted-foreground transition-colors hover:text-blue-600 dark:hover:text-blue-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 focus-visible:ring-offset-2"
              aria-label={`About ${itemLabel.toLowerCase()} share links`}
            >
              <Info className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="max-w-72 leading-relaxed">
            {help}
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    )}
  </div>
);

export const ShareModal = <TId extends string | number>({
  open,
  onOpenChange,
  itemType,
  itemId,
  itemTitle,
  onShare,
  onUnshare,
  existingShareData,
  isLocked,
  showWarning = false
}: ShareModalProps<TId>) => {
  const [shareData, setShareData] = useState<{ shareToken: string; shareUrl: string } | null>(
    existingShareData || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWarningState, setShowWarningState] = useState(showWarning);
  const { toast } = useToast();
  const { begin, release, reset } = useStableMutationKey('workspace-sharing');
  const config = shareConfig[itemType];
  const Icon = config.icon;

  const handleShare = async () => {
    if (isLocked) {
      toast({
        title: `Cannot share locked ${config.label.toLowerCase()}`,
        description: 'Remove the master password lock before sharing this vault.',
        variant: 'destructive'
      });
      return;
    }

    const mutationId = begin(`enable:${itemType}:${itemId}`);
    if (!mutationId) return;

    setIsLoading(true);
    try {
      const result = await onShare(itemId);
      setShareData(result);
      setShowWarningState(false);
      reset();
      toast({
        title: config.shareSuccessTitle,
        description: config.shareSuccessDescription
      });
    } catch (error) {
      release();
      toast({
        title: 'Error',
        description: `Failed to share ${config.label.toLowerCase()}. Please try again.`,
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshare = async () => {
    const mutationId = begin(`disable:${itemType}:${itemId}`);
    if (!mutationId) return;

    setIsLoading(true);
    try {
      await onUnshare(itemId, mutationId);
      setShareData(null);
      setShowWarningState(showWarning);
      reset();
      toast({
        title: 'Sharing revoked',
        description: config.revokeDescription
      });
    } catch (error) {
      release();
      toast({
        title: 'Error',
        description: 'Failed to revoke sharing. Please try again.',
        variant: 'destructive'
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleCopyLink = async () => {
    if (!shareData?.shareUrl) return;

    try {
      await navigator.clipboard.writeText(shareData.shareUrl);
      setCopied(true);
      toast({
        title: 'Link copied',
        description: 'Share link copied to clipboard.'
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: 'Failed to copy',
        description: 'Could not copy link to clipboard.',
        variant: 'destructive'
      });
    }
  };

  const handleOpenLink = () => {
    if (shareData?.shareUrl) {
      window.open(shareData.shareUrl, '_blank');
    }
  };

  useEffect(() => {
    if (!open) return;
    setShareData(existingShareData || null);
    setCopied(false);
    setShowWarningState(showWarning && !existingShareData);

  }, [open, existingShareData, showWarning]);

  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen && isLoading) return;
    if (!nextOpen) reset();
    onOpenChange(nextOpen);
  };

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-raleway">
            <Share2 className="h-5 w-5 text-blue-600" />
            {`Share ${config.label}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {config.description}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-2">
            <Label className="font-raleway">Sharing</Label>
            <div className="p-3 bg-muted rounded-md">
              <p className="font-medium text-sm flex items-center gap-2 font-raleway">
                <Icon className={`h-4 w-4 ${config.iconClassName}`} />
                {itemTitle}
              </p>
            </div>
          </div>

          {isLocked && (
            <Alert variant="destructive">
              <ShieldAlert className="h-4 w-4" />
              <AlertTitle>Locked Vault</AlertTitle>
              <AlertDescription>
                Unlock this vault on the canvas before sharing.
              </AlertDescription>
            </Alert>
          )}

          {showWarningState && !isLocked && !shareData && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-400">Security Warning</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <p className="mb-2">You are about to publish a snapshot of this vault. Anyone with the full URL, including the fragment after #, can read it. Itemize never sees that fragment.</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Copy the complete link. A link without # is useless ciphertext</li>
                  <li>Treat the URL like the secrets themselves</li>
                  <li>Revoke the link as soon as it is no longer needed</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {shareData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <ShareLinkLabel help={config.shareHelp} itemLabel={config.label} />
                <div className="flex space-x-2">
                  <Input
                    value={shareData.shareUrl || ''}
                    readOnly
                    className="flex-1"
                    aria-label={`${config.label} share link`}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    disabled={isLoading}
                    aria-label="Copy link"
                  >
                    {copied ? <Check className="h-4 w-4 text-green-600" /> : <Copy className="h-4 w-4" />}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleOpenLink}
                    disabled={isLoading}
                    aria-label="Open link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              <div className="flex justify-between space-x-2">
                <Button
                  type="button"
                  onClick={handleUnshare}
                  disabled={isLoading}
                  aria-busy={isLoading || undefined}
                  className="interaction-button--destructive bg-destructive font-raleway text-destructive-foreground"
                >
                  Revoke Sharing
                </Button>
<Button
                  type="button"
                  onClick={() => handleOpenChange(false)}
                  className="interaction-button--primary bg-blue-600 font-raleway text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : isLocked ? (
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                  className="font-raleway"
              >
                Close
              </Button>
            </div>
          ) : showWarningState ? (
            <div className="space-y-4">
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  className="font-raleway"
                >
                  Cancel
                </Button>
<Button
                  type="button"
                  onClick={handleShare}
                  disabled={isLoading}
                  aria-busy={isLoading || undefined}
                  className="interaction-button--primary bg-blue-600 font-raleway text-white"
                >
                  I understand, Share
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <ShareLinkLabel help={config.shareHelp} itemLabel={config.label} />
                <div className="flex space-x-2">
                  <Input
                    value="Generating share link..."
                    readOnly
                    className="flex-1"
                    placeholder="Generating share link..."
                    aria-label={`${config.label} share link`}
                  />
                  <Button type="button" variant="outline" size="icon" disabled aria-label="Copy link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" disabled aria-label="Open link">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={isLoading}
                  className="font-raleway"
                >
                  Cancel
                </Button>
              </div>
            </div>
          ) : (
            <div className="flex justify-end space-x-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                  className="font-raleway"
              >
                Cancel
              </Button>
<Button
                type="button"
                onClick={handleShare}
                disabled={isLoading}
                aria-busy={isLoading || undefined}
                  className="interaction-button--primary bg-blue-600 font-raleway text-white"
              >
                Share
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default ShareModal;
