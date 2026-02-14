import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedContentLayout } from '../components/SharedContentLayout';
import { SharedVaultCard } from '../components/SharedVaultCard';
import { NotAvailableCTA } from '../components/NotAvailableCTA';
import { useToast } from '../hooks/use-toast';
import { Spinner } from '../components/ui/Spinner';
import { getSharedVault } from '../services/api';

interface SharedVaultItem {
  id: number;
  item_type: 'key_value' | 'secure_note';
  label: string;
  value: string;
  order_index: number;
}

interface SharedVaultData {
  id: number;
  title: string;
  category: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  items: SharedVaultItem[];
  is_shared: boolean;
}

const SharedVaultPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [vaultData, setVaultData] = useState<SharedVaultData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Store original title for cleanup
  const [originalTitle] = useState(document.title);

  useEffect(() => {
    const fetchSharedVault = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await getSharedVault(token);
        setVaultData(response);
        
        // Set page title
        document.title = `${response.title} on Itemize`;
        
        // Set meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.setAttribute('content', 
            `View this encrypted vault shared from Itemize.cloud. Contains ${response.items.length} secure items.`
          );
        }
      } catch (err: any) {
        console.error('Error fetching shared vault:', err);
        if (err.response?.status === 404) {
          setError('This shared vault is no longer available or the link is invalid.');
        } else if (err.response?.status === 403) {
          setError('This vault is locked and cannot be viewed publicly.');
        } else if (err.response?.status === 429) {
          setError('Too many requests. Please try again later.');
        } else {
          setError('Failed to load shared content. Please try again later.');
        }
      } finally {
        setLoading(false);
      }
    };

    fetchSharedVault();
  }, [token, toast]);

  // Cleanup title on unmount
  useEffect(() => {
    return () => {
      document.title = originalTitle;
    };
  }, [originalTitle]);

  const handleBackToHome = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <SharedContentLayout
        title="Loading..."
        contentType="vault"
        onBackToHome={handleBackToHome}
        showCTA={false}
      >
        <div className="flex items-center justify-center py-12">
          <Spinner size="xl" variant="brand" />
        </div>
      </SharedContentLayout>
    );
  }

  if (error || !vaultData) {
    return (
      <SharedContentLayout
        title="Error"
        contentType="vault"
        onBackToHome={handleBackToHome}
        showCTA={false}
        isError={true}
      >
        <NotAvailableCTA
          contentType="vault"
          error={error}
          onBackToHome={handleBackToHome}
        />
      </SharedContentLayout>
    );
  }

  return (
    <SharedContentLayout 
      title={vaultData.title} 
      contentType="vault"
      onBackToHome={handleBackToHome}
    >
      <SharedVaultCard vaultData={vaultData} />
    </SharedContentLayout>
  );
};

export default SharedVaultPage;
