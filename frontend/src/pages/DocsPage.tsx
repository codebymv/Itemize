import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import axios from 'axios';
import { Menu, X } from 'lucide-react'; // Import icons

// Define DocStructure interface (similar to hrvstr.us)
interface DocStructure {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DocStructure[];
}

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false); // State for sidebar visibility

  // Function to format names for display (similar to hrvstr.us)
  const formatName = (name: string) => {
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Function to recursively render the document tree (sidebar)
  const renderDocTree = (items: DocStructure[], level = 0) => {
    return items.map((item) => (
      <div key={item.path} style={{ paddingLeft: `${level * 10}px` }}>
        <Link
          to={`/help/${item.path}`}
          className={`block px-2 py-1 rounded ${docPath === item.path || (docPath === undefined && item.path === 'getting-started') ? 'bg-blue-200 text-blue-800' : 'hover:bg-gray-100'}`}
          onClick={() => setIsSidebarOpen(false)} // Close sidebar on link click
        >
          {item.type === 'folder' ? '📁' : '📄'} {formatName(item.name)}
        </Link>
        {item.children && (
          <div className="ml-2">
            {renderDocTree(item.children, level + 1)}
          </div>
        )}
      </div>
    ));
  };

  useEffect(() => {
    const fetchDocContent = async () => {
      setLoading(true);
      try {
        setError(null);
        const effectivePath = (!docPath || docPath === '/') ? 'getting-started' : docPath;
        const response = await axios.get(`/api/docs/content?path=${effectivePath}`);
        setMarkdownContent(response.data.content);
      } catch (err) {
        console.error('Error fetching documentation content:', err);
        setError('Failed to load documentation content. Please try again later.');
        setMarkdownContent('');
      } finally {
        setLoading(false);
      }
    };

    const fetchDocStructure = async () => {
      try {
        const response = await axios.get(`/api/docs/structure`);
        setDocStructure(response.data);
      } catch (err) {
        console.error('Error fetching documentation structure:', err);
        // Optionally set an error for the sidebar if structure fails to load
      }
    };

    fetchDocContent();
    fetchDocStructure();
  }, [docPath]);

  if (error) {
    return <div className="container mx-auto p-4 text-red-500">{error}</div>;
  }

  return (
    <div className="flex h-screen bg-gray-50">
      {/* Sidebar */}
      <div className={`w-64 bg-white p-4 shadow-md overflow-y-auto fixed inset-y-0 left-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 z-30 ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <h2 className="text-xl font-bold mb-4">Documentation</h2>
        <nav>
          {loading && docStructure.length === 0 ? (
            <div className="text-gray-500">Loading structure...</div>
          ) : (
            renderDocTree(docStructure)
          )}
        </nav>
      </div>

      {/* Overlay for mobile */}
      {isSidebarOpen && (
        <div
          className="fixed inset-0 bg-black bg-opacity-50 z-20 lg:hidden"
          onClick={() => setIsSidebarOpen(false)}
        />
      )}

      {/* Main Content */}
      <div className="flex-1 p-8 overflow-y-auto">
        {/* Mobile menu button */}
        <div className="lg:hidden mb-4">
          <button
            onClick={() => setIsSidebarOpen(true)}
            className="p-2 rounded-md bg-gray-200 hover:bg-gray-300"
          >
            <Menu className="h-6 w-6" />
          </button>
        </div>

        {loading && !markdownContent ? (
          <div className="text-gray-500">Loading documentation...</div>
        ) : (
          <div className="prose lg:prose-xl max-w-none">
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              rehypePlugins={[rehypeHighlight]}
            >
              {markdownContent}
            </ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
};

export default DocsPage;