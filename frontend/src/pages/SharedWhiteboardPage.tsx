import React, { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { SharedContentLayout } from '../components/SharedContentLayout';
import { SharedWhiteboardCard } from '../components/SharedWhiteboardCard';
import { useToast } from '../hooks/use-toast';
import api from '../lib/api';

interface SharedWhiteboardData {
  id: number;
  title: string;
  category: string;
  canvas_data: any;
  canvas_width: number;
  canvas_height: number;
  background_color: string;
  color_value: string;
  created_at: string;
  updated_at: string;
  creator_name: string;
  type: 'whiteboard';
}

const SharedWhiteboardPage: React.FC = () => {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { toast } = useToast();
  const [whiteboardData, setWhiteboardData] = useState<SharedWhiteboardData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const fetchSharedWhiteboard = async () => {
      if (!token) {
        setError('Invalid share link');
        setLoading(false);
        return;
      }

      try {
        const response = await api.get(`/api/shared/whiteboard/${token}`);
        setWhiteboardData(response.data);
        
        // Set page title
        document.title = `${response.data.title} on Itemize.cloud`;
        
        // Set meta description
        const metaDescription = document.querySelector('meta[name="description"]');
        if (metaDescription) {
          metaDescription.setAttribute('content', 
            `View this whiteboard shared from Itemize.cloud. Created by ${response.data.creator_name} on ${new Date(response.data.created_at).toLocaleDateString()}.`
          );
        }
      } catch (err: any) {
        console.error('Error fetching shared whiteboard:', err);
        if (err.response?.status === 404) {
          setError('This shared whiteboard is no longer available or the link is invalid.');
        } else if (err.response?.status === 429) {
          setError('Too many requests. Please try again later.');
        } else {
          setError('Failed to load shared content. Please try again later.');
        }
        
        toast({
          title: "Error loading shared whiteboard",
          description: error || "The shared whiteboard could not be loaded.",
          variant: "destructive",
        });
      } finally {
        setLoading(false);
      }
    };

    fetchSharedWhiteboard();
  }, [token, toast, error]);

  const handleBackToHome = () => {
    navigate('/');
  };

  if (loading) {
    return (
      <SharedContentLayout 
        title="Loading..." 
        contentType="whiteboard"
        onBackToHome={handleBackToHome}
      >
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-blue-600"></div>
        </div>
      </SharedContentLayout>
    );
  }

  if (error || !whiteboardData) {
    return (
      <SharedContentLayout 
        title="Error" 
        contentType="whiteboard"
        onBackToHome={handleBackToHome}
      >
        <div className="text-center py-12">
          <div className="max-w-md mx-auto">
            <h2 
              className="text-xl font-semibold text-gray-900 dark:text-gray-100 mb-4"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Content Not Available
            </h2>
            <p 
              className="text-gray-600 dark:text-gray-400 mb-6"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              {error || 'The shared whiteboard you\'re looking for could not be found.'}
            </p>
            <button
              onClick={handleBackToHome}
              className="bg-blue-600 hover:bg-blue-700 text-white px-6 py-2 rounded-md transition-colors"
              style={{ fontFamily: '"Raleway", sans-serif' }}
            >
              Go to Itemize.cloud
            </button>
          </div>
        </div>
      </SharedContentLayout>
    );
  }

  return (
    <SharedContentLayout 
      title={whiteboardData.title} 
      contentType="whiteboard"
      onBackToHome={handleBackToHome}
    >
      <SharedWhiteboardCard whiteboardData={whiteboardData} />
    </SharedContentLayout>
  );
};

export default SharedWhiteboardPage;
