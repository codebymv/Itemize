import React, { useState, useEffect } from 'react';
import { Share2, Copy, Check, ExternalLink, GitBranch } from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from './ui/dialog';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { Label } from './ui/label';
import { useToast } from '../hooks/use-toast';

interface ShareWireframeModalProps {
  isOpen: boolean;
  onClose: () => void;
  wireframeId: number;
  wireframeTitle: string;
  onShare: (wireframeId: number) => Promise<{ shareToken: string; shareUrl: string }>;
  onUnshare: (wireframeId: number) => Promise<void>;
  existingShareData?: { shareToken: string; shareUrl: string } | null;
}

export const ShareWireframeModal: React.FC<ShareWireframeModalProps> = ({ 
  isOpen, 
  onClose, 
  wireframeId,
  wireframeTitle,
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
      const result = await onShare(wireframeId);
      setShareData(result);
      toast({
        title: "Wireframe shared successfully",
        description: "Anyone with this link can view your wireframe.",
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to share wireframe",
        variant: "destructive",
      });
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
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
      await onUnshare(wireframeId);
      setShareData(null);
      toast({
        title: "Sharing revoked",
        description: "This wireframe is no longer publicly accessible.",
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
          <DialogTitle className="flex items-center gap-2">
            <Share2 className="h-5 w-5 text-blue-600" />
            Share Wireframe
          </DialogTitle>
          <DialogDescription>
            Create a shareable link for your wireframe diagram
          </DialogDescription>
        </DialogHeader>
        
        <div className="space-y-4">
          {/* Wireframe title display */}
          <div className="space-y-2">
            <Label>Sharing</Label>
            <div className="p-3 bg-gray-50 dark:bg-slate-700 rounded-md">
              <p className="font-medium text-sm flex items-center gap-2">
                <GitBranch className="h-4 w-4 text-blue-600" />
                {wireframeTitle}
              </p>
            </div>
          </div>

          {shareData ? (
            // Show share link and controls
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Share Link</Label>
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
                <p className="text-xs text-gray-500">
                  Anyone with this link can view this wireframe
                </p>
              </div>

              <div className="flex justify-between space-x-2">
                <Button
                  type="button"
                  onClick={handleUnshare}
                  disabled={isLoading}
                  className="bg-red-600 hover:bg-red-700 text-white"
                >
                  Revoke Sharing
                </Button>
                <Button
                  type="button"
                  onClick={onClose}
                  className="bg-blue-600 hover:bg-blue-700 text-white"
                >
                  Done
                </Button>
              </div>
            </div>
          ) : (
            // Show loading state while generating link
            <div className="space-y-4">
              <div className="space-y-2">
                <Label>Share Link</Label>
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
                <p className="text-xs text-gray-500">
                  Anyone with this link can view this wireframe
                </p>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  onClick={onClose}
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
