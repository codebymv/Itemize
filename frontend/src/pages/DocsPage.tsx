import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useTheme } from 'next-themes';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeHighlight from 'rehype-highlight';
import axios from 'axios';
import { Menu, X, FileText, Folder } from 'lucide-react';

// Dynamic syntax highlighting import based on theme
// We'll handle this through CSS classes instead of multiple imports

// Define DocStructure interface (similar to hrvstr.us)
interface DocStructure {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: DocStructure[];
}

const DocsPage: React.FC = () => {
  const { '*': docPath } = useParams<{ '*': string }>();
  const { theme } = useTheme();
  const [markdownContent, setMarkdownContent] = useState<string>('');
  const [error, setError] = useState<string | null>(null);
  const [docStructure, setDocStructure] = useState<DocStructure[]>([]);
  const [loading, setLoading] = useState(true);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Theme-aware color classes - matching canvas slate colors
  const bgColor = theme === 'dark' ? 'bg-slate-800' : 'bg-gray-50';
  const sidebarBg = theme === 'dark' ? 'bg-slate-700' : 'bg-white';
  const textColor = theme === 'dark' ? 'text-slate-100' : 'text-gray-900';
  const mutedTextColor = theme === 'dark' ? 'text-slate-400' : 'text-gray-500';
  const borderColor = theme === 'dark' ? 'border-slate-600' : 'border-gray-200';
  const hoverBg = theme === 'dark' ? 'hover:bg-slate-600' : 'hover:bg-gray-100';
  const activeBg = theme === 'dark' ? 'bg-blue-900 text-blue-300' : 'bg-blue-200 text-blue-800';
  const buttonBg = theme === 'dark' ? 'bg-slate-600 hover:bg-slate-500' : 'bg-gray-200 hover:bg-gray-300';
  const shadowClass = theme === 'dark' ? 'shadow-slate-900/50' : 'shadow-md';

  // Dynamically load theme-appropriate syntax highlighting
  useEffect(() => {
    const existingLink = document.querySelector('#highlight-theme');
    if (existingLink) {
      existingLink.remove();
    }

    const link = document.createElement('link');
    link.id = 'highlight-theme';
    link.rel = 'stylesheet';
    link.href = theme === 'dark' 
      ? 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css'
      : 'https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css';
    document.head.appendChild(link);

    return () => {
      const linkToRemove = document.querySelector('#highlight-theme');
      if (linkToRemove) {
        linkToRemove.remove();
      }
    };
  }, [theme]);

  // Function to format names for display
  const formatName = (name: string) => {
    return name
      .replace(/-/g, ' ')
      .replace(/\b\w/g, l => l.toUpperCase());
  };

  // Function to recursively render the document tree (sidebar)
  const renderDocTree = (items: DocStructure[], level = 0) => {
    return items.map((item) => (
      <div key={item.path} style={{ paddingLeft: `${level * 12}px` }}>
        <Link
          to={`/help/${item.path}`}
          className={`flex items-center px-3 py-2 rounded-md text-sm transition-colors ${
            docPath === item.path || (docPath === undefined && item.path === 'getting-started') 
              ? activeBg
              : `${textColor} ${hoverBg}`
          }`}
          onClick={() => setIsSidebarOpen(false)}
        >
          {item.type === 'folder' ? (
            <Folder className={`h-4 w-4 mr-2 flex-shrink-0 ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
            }`} />
          ) : (
            <FileText className={`h-4 w-4 mr-2 flex-shrink-0 ${
              theme === 'dark' ? 'text-blue-400' : 'text-blue-500'
            }`} />
          )}
          <span className="truncate">{formatName(item.name)}</span>
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
      }
    };

    fetchDocContent();
    fetchDocStructure();
  }, [docPath]);

  if (error) {
    return (
      <div className={`container mx-auto p-4 ${theme === 'dark' ? 'text-red-400 bg-slate-800' : 'text-red-500 bg-gray-50'}`}>
        {error}
      </div>
    );
  }

  return (
    <div className={`flex h-screen ${bgColor}`} style={{ fontFamily: '"Raleway", sans-serif' }}>
      {/* Sidebar */}
      <div className={`w-64 ${sidebarBg} p-4 ${shadowClass} overflow-y-auto fixed inset-y-0 left-0 transform transition-transform duration-300 ease-in-out lg:relative lg:translate-x-0 z-30 border-r ${borderColor} ${isSidebarOpen ? 'translate-x-0' : '-translate-x-full'}`}>
        <h2 className={`text-xl font-bold mb-4 ${textColor}`}>Documentation</h2>
        <nav>
          {loading && docStructure.length === 0 ? (
            <div className={mutedTextColor}>Loading structure...</div>
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
            className={`flex items-center px-3 py-2 rounded-md ${buttonBg} ${textColor} transition-colors`}
          >
            <Menu className="h-5 w-5 mr-2" />
            <span className="text-sm font-medium">Documentation Menu</span>
          </button>
        </div>

        {loading && !markdownContent ? (
          <div className={mutedTextColor}>Loading documentation...</div>
        ) : (
          <div className={`prose lg:prose-xl max-w-none ${
            theme === 'dark' 
              ? 'prose-invert prose-headings:text-slate-100 prose-p:text-slate-300 prose-strong:text-slate-200 prose-code:text-slate-200 prose-pre:bg-slate-700 prose-blockquote:text-slate-300'
              : 'prose-headings:text-gray-900 prose-p:text-gray-700'
          }`}>
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