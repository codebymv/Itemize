import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, ExternalLink } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';

interface ShareListModalProps {
  isOpen: boolean;
  onClose: () => void;
  listId: string;
  listTitle: string;
  onShare: (listId: string) => Promise<{ shareToken: string; shareUrl: string }>;
  onUnshare: (listId: string) => Promise<void>;
  existingShareData?: { shareToken: string; shareUrl: string } | null;
}

export const ShareListModal: React.FC<ShareListModalProps> = ({ 
  isOpen, 
  onClose, 
  listId,
  listTitle,
  onShare,
  onUnshare,
  existingShareData
}) => {
  const [shareData, setShareData] = useState<{ shareToken: string; shareUrl: string } | null>(existingShareData || null);
  const [isLoading, setIsLoading] = useState(false);
  const [copied, setCopied] = useState(false);
  const { toast } = useToast();

  const handleShare = async () => {
    setIsLoading(true);
    try {
      const result = await onShare(listId);
      setShareData(result);
      toast({
        title: "List shared successfully",
        description: "Anyone with this link can view your list.",
      });
    } catch (error) {
      toast({
        title: "Error sharing list",
        description: "Failed to generate share link. Please try again.",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    // Auto-generate share link when modal opens (like SoundCloud)
    if (isOpen) {
      setShareData(existingShareData || null);
      setCopied(false);

      // If no existing share data, automatically create the share link
      if (!existingShareData) {
        handleShare();
      }
    }
  }, [isOpen, existingShareData]);

  const handleUnshare = async () => {
    setIsLoading(true);
    try {
      await onUnshare(listId);
      setShareData(null);
      toast({
        title: "Sharing revoked",
        description: "This list is no longer publicly accessible.",
      });
    } catch (error) {
      toast({
        title: "Error revoking share",
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
            <Share2 className="h-5 w-5 text-slate-500" />
            Share List
          </DialogTitle>
          <DialogDescription style={{ fontFamily: '"Raleway", sans-serif' }}>
            Create a shareable link for your list
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* List title display */}
          <div className="space-y-2">
            <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Sharing</Label>
            <div className="p-3 bg-gray-50 dark:bg-gray-800 rounded-md">
              <p className="font-medium text-sm" style={{ fontFamily: '"Raleway", sans-serif' }}>
                {listTitle}
              </p>
            </div>
          </div>

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
                  Anyone with this link can view this list
                </p>
              </div>

              <div className="flex justify-between space-x-2">
                <Button 
                  type="button" 
                  variant="outline" 
                  onClick={handleUnshare}
                  disabled={isLoading}
                  className="text-red-600 hover:text-red-700"
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Revoke Sharing
                </Button>
                <Button 
                  type="button" 
                  onClick={onClose}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            // Show loading state while generating link
            <div className="space-y-4">
              <div className="space-y-2">
                <Label style={{ fontFamily: '"Raleway", sans-serif' }}>Share Link</Label>
                <div className="flex space-x-2">
                  <Input
                    value="Generating share link..."
                    readOnly
                    className="flex-1"
                    placeholder="Generating share link..."
                  />
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={true}
                    aria-label="Copy link"
                  >
                    <Copy className="h-4 w-4" />
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="icon"
                    disabled={true}
                    aria-label="Open link"
                  >
                    <ExternalLink className="h-4 w-4" />
                  </Button>
                </div>
                <p className="text-xs text-gray-500" style={{ fontFamily: '"Raleway", sans-serif' }}>
                  Anyone with this link can view this list
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
                  style={{ fontFamily: '"Raleway", sans-serif' }}
                >
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
