import React from 'react';
import { Search } from 'lucide-react';

function ContactsMockLarge({ isLight }: { isLight: boolean }) {
  const contacts = [
    { name: 'Sarah Johnson', email: 'sarah@company.co', company: 'TechCorp', status: 'active' },
    { name: 'Mike Chen', email: 'mike@startup.io', company: 'StartupIO', status: 'active' },
    { name: 'Emma Wilson', email: 'emma@agency.com', company: 'Creative Agency', status: 'inactive' },
    { name: 'James Brown', email: 'james@corp.net', company: 'CorpNet', status: 'active' },
  ];
  
  return (
    <div className="space-y-3">
      {/* Header row */}
      <div className={`flex items-center justify-between pb-2 border-b ${isLight ? 'border-gray-200' : 'border-slate-700'}`}>
        <span className={`text-sm font-medium ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>4 contacts</span>
        <div className={`flex items-center gap-2 px-3 py-1.5 rounded-lg ${isLight ? 'bg-gray-100' : 'bg-slate-700'}`}>
          <Search className={`h-3.5 w-3.5 ${isLight ? 'text-gray-400' : 'text-slate-400'}`} />
          <span className={`text-xs ${isLight ? 'text-gray-400' : 'text-slate-500'}`}>Search...</span>
        </div>
      </div>
      {/* Contact cards - matching ContactCard.tsx */}
      {contacts.map((contact, i) => (
        <div key={i} className={`flex items-center gap-3 p-3 rounded-lg border ${isLight ? 'bg-white border-gray-200 hover:shadow-md' : 'bg-slate-800 border-slate-700 hover:bg-slate-750'} transition-shadow cursor-pointer`}>
          {/* Avatar - matches production bg-blue-100/bg-blue-900 styling */}
          <div className={`w-10 h-10 rounded-full flex items-center justify-center text-sm font-medium flex-shrink-0 ${isLight ? 'bg-blue-100 text-blue-700' : 'bg-blue-900 text-blue-300'}`}>
            {contact.name.split(' ').map(n => n[0]).join('')}
          </div>
          <div className="flex-1 min-w-0">
            <p className={`font-medium ${isLight ? 'text-gray-900' : 'text-white'}`}>{contact.name}</p>
            <p className={`text-xs ${isLight ? 'text-gray-500' : 'text-slate-400'}`}>{contact.company}</p>
          </div>
          <div className={`text-xs ${isLight ? 'text-blue-600 hover:underline' : 'text-blue-400'}`}>{contact.email}</div>
          {/* Status badge - matching production */}
          <span className={`text-xs px-2 py-0.5 rounded-full ${contact.status === 'active' ? 'bg-green-500 text-white' : isLight ? 'bg-gray-200 text-gray-600' : 'bg-slate-600 text-slate-300'}`}>
            {contact.status === 'active' ? 'Active' : 'Inactive'}
          </span>
        </div>
      ))}
    </div>
  );
}

export default ContactsMockLarge;