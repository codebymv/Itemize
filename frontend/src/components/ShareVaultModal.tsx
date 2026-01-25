import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, ExternalLink, KeyRound, AlertTriangle, ShieldAlert } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';
import { Alert, AlertDescription, AlertTitle } from './ui/alert';

interface ShareVaultModalProps {
  isOpen: boolean;
  onClose: () => void;
  vaultId: number;
  vaultTitle: string;
  isLocked: boolean;
  onShare: (vaultId: number) => Promise<{ shareToken: string; shareUrl: string }>;
  onUnshare: (vaultId: number) => Promise<void>;
  existingShareData?: { shareToken: string; shareUrl: string } | null;
}

export const ShareVaultModal: React.FC<ShareVaultModalProps> = ({ 
  isOpen, 
  onClose, 
  vaultId,
  vaultTitle,
  isLocked,
  onShare,
  onUnshare,
  existingShareData
}) => {
  const [shareData, setShareData] = useState<{ shareToken: string; shareUrl: string } | null>(existingShareData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showWarning, setShowWarning] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    // Reset state when modal opens
    if (isOpen) {
      setShareData(existingShareData || null);
      setCopied(false);
      setShowWarning(!existingShareData); // Show warning only if not already shared
    }
  }, [isOpen, existingShareData]);

  const handleShare = async () => {
    // If vault is locked, don't allow sharing
    if (isLocked) {
      toast({
        title: "Cannot share locked vault",
        description: "Remove the master password lock before sharing this vault.",
        variant: "destructive",
      });
      return;
    }

    setIsLoading(true);
    try {
      const result = await onShare(vaultId);
      setShareData(result);
      setShowWarning(false);
      toast({
        title: "Vault shared successfully",
        description: "Anyone with this link can view your vault contents.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share vault",
        description: "Failed to generate share link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  const handleUnshare = async () => {
    setIsLoading(true);
    try {
      await onUnshare(vaultId);
      setShareData(null);
      setShowWarning(true);
      toast({
        title: "Sharing revoked",
        description: "This vault is no longer publicly accessible.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to revoke share",
        description: "Failed to revoke sharing. Please try again.",
        variant: "destructive",
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
        title: "Link copied",
        description: "Share link copied to clipboard.",
      });
      setTimeout(() => setCopied(false), 2000);
    } catch (error) {
      toast({
        title: "Failed to copy",
        description: "Could not copy link to clipboard.",
        variant: "destructive",
      });
    }
  };

  const handleOpenLink = () => {
    if (shareData?.shareUrl) {
      window.open(shareData.shareUrl, '_blank');
    }
  };

  if (!isOpen) return null;

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[500px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
            <Share2 className="h-5 w-5 text-blue-500" />
            Share Vault
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a shareable link for your encrypted vault
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Vault title display */}
          <div className="space-y-2">
            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Sharing</Label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md">
              <p className="font-medium text-sm flex items-center gap-2" style={{ fontFamily: '"Raleway", sans-serif' }}>
                <KeyRound className="h-4 w-4 text-blue-500" />
                {vaultTitle}
              </p>
            </div>
          </div>

          {/* Locked vault warning */}
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

          {/* Security warning for sharing */}
          {showWarning && !isLocked && !shareData && (
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
            // Show share link and controls
            <div className="space-y-4">
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Share Link</Label>
                <div className="flex space-x-2">
                  <Input
                    value={shareData?.shareUrl || ""}
                    readOnly
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    onClick={handleCopyLink}
                    disabled={isLoading}
                    aria-label="Copy link"
                  >
                    {copied ? (
                      <Check className="h-4 w-4 text-green-600" />
                    ) : (
                      <Copy className="h-4 w-4" />
                    )}
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
                <p className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Anyone with this link can view this vault's contents
                </p>
              </div>

              <div className="flex justify-between space-x-2">
                <Button
                  type="button"
                  onClick={handleUnshare}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Revoke Sharing
                </Button>
                <Button
                  type="button"
                  onClick={onClose}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : !isLocked ? (
            // Show warning and share button
            <div className="space-y-4">
              <div className="flex justify-end space-x-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Cancel
                </Button>
                <Button
                  type="button"
                  onClick={handleShare}
                  disabled={isLoading}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  {isLoading ? 'Creating Link...' : 'I understand, Share'}
                </Button>
              </div>
            </div>
          ) : (
            // Locked vault - just show close button
            <div className="flex justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={onClose}
                style={{ fontFamily: '"Raleway", sans-serif' }}
              >
                Close
              </Button>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
