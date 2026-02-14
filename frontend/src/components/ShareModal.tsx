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
  ShieldAlert
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';
import { useToast } from '../hooks/use-toast';

type ShareItemType = 'note' | 'list' | 'whiteboard' | 'wireframe' | 'vault';

interface ShareModalProps<TId extends string | number = string | number> {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  itemType: ShareItemType;
  itemId: TId;
  itemTitle: string;
  onShare: (id: TId) => Promise<{ shareToken: string; shareUrl: string }>;
  onUnshare: (id: TId) => Promise<void>;
  existingShareData?: { shareToken: string; shareUrl: string } | null;
  isLocked?: boolean;
  showWarning?: boolean;
  autoGenerate?: boolean;
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
    description: 'Create a shareable link for your encrypted vault',
    icon: KeyRound,
    iconClassName: 'text-blue-600',
    shareHelp: "Anyone with this link can view this vault's contents",
    shareSuccessTitle: 'Vault shared successfully',
    shareSuccessDescription: 'Anyone with this link can view your vault contents.',
    revokeDescription: 'This vault is no longer publicly accessible.'
  }
} as const;

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
  showWarning = false,
  autoGenerate = true
}: ShareModalProps<TId>) => {
  const [shareData, setShareData] = useState<{ shareToken: string; shareUrl: string } | null>(
    existingShareData || null
  );
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWarningState, setShowWarningState] = useState(showWarning);
  const { toast } = useToast();
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

    setIsLoading(true);
    try {
      const result = await onShare(itemId);
      setShareData(result);
      setShowWarningState(false);
      toast({
        title: config.shareSuccessTitle,
        description: config.shareSuccessDescription
      });
    } catch (error) {
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
    setIsLoading(true);
    try {
      await onUnshare(itemId);
      setShareData(null);
      setShowWarningState(showWarning);
      toast({
        title: 'Sharing revoked',
        description: config.revokeDescription
      });
    } catch (error) {
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

    if (autoGenerate && !existingShareData && !isLocked) {
      handleShare();
    }
  }, [open, existingShareData, autoGenerate, isLocked, showWarning]);

  if (!open) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 font-raleway">
            <Share2 className="h-5 w-5 text-blue-600" />
            {`Share ${config.label}`}
          </DialogTitle>
          <DialogDescription className="font-raleway">
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
                This vault is protected with a master password. Locked vaults cannot be shared for security reasons.
                Remove the master password protection first if you want to share this vault.
              </AlertDescription>
            </Alert>
          )}

          {showWarningState && !isLocked && !shareData && (
            <Alert className="border-amber-500 bg-amber-50 dark:bg-amber-950/20">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <AlertTitle className="text-amber-800 dark:text-amber-400">Security Warning</AlertTitle>
              <AlertDescription className="text-amber-700 dark:text-amber-300">
                <p className="mb-2">You are about to share sensitive encrypted data. Anyone with this link will be able to view the contents of this vault.</p>
                <ul className="list-disc list-inside space-y-1 text-sm">
                  <li>Shared data will be decrypted for viewers</li>
                  <li>Consider if this data should be shared</li>
                  <li>You can revoke access anytime</li>
                </ul>
              </AlertDescription>
            </Alert>
          )}

          {shareData ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-raleway">Share Link</Label>
                <div className="flex space-x-2">
                  <Input value={shareData.shareUrl || ''} readOnly className="flex-1" />
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
                <p className="text-xs text-gray-500 font-raleway">
                  {config.shareHelp}
                </p>
              </div>

              <div className="flex justify-between space-x-2">
                <Button
                  type="button"
                  onClick={handleUnshare}
                  disabled={isLoading}
                  className="bg-destructive hover:bg-destructive/90 text-destructive-foreground font-raleway"
                >
                  Revoke Sharing
                </Button>
<Button
                  type="button"
                  onClick={() => onOpenChange(false)}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-raleway"
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
                onClick={() => onOpenChange(false)}
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
                  onClick={() => onOpenChange(false)}
                  className="font-raleway"
                >
                  Cancel
                </Button>
<Button
                  type="button"
                  onClick={handleShare}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-raleway"
                >
                  I understand, Share
                </Button>
              </div>
            </div>
          ) : isLoading ? (
            <div className="space-y-4">
              <div className="space-y-2">
                <Label className="font-raleway">Share Link</Label>
                <div className="flex space-x-2">
                  <Input value="Generating share link..." readOnly className="flex-1" placeholder="Generating share link..." />
                  <Button type="button" variant="outline" size="icon" disabled aria-label="Copy link">
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button type="button" variant="outline" size="icon" disabled aria-label="Open link">
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500 font-raleway">
                  {config.shareHelp}
                </p>
              </div>
              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => onOpenChange(false)}
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
                onClick={() => onOpenChange(false)}
                  className="font-raleway"
              >
                Cancel
              </Button>
<Button
                type="button"
                onClick={handleShare}
                disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white font-raleway"
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
