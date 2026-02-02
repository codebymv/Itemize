import React from 'react';
import { Users, Mail, Clock, CheckSquare } from 'lucide-react';

function AutomationsMockLarge({ isLight }: { isLight: boolean }) {
  return (
    <div className="flex flex-col items-center py-4">
      {/* Workflow nodes - matching production visual style */}
      <div className="w-full max-w-sm space-y-3">
        {/* Trigger */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border-2 border-dashed ${isLight ? 'bg-blue-50 border-blue-300' : 'bg-blue-900/20 border-blue-700'}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? 'bg-blue-100' : 'bg-blue-800'}`}>
            <Users className={`h-5 w-5 ${isLight ? 'text-blue-600' : 'text-blue-300'}`} />
          </div>
          <div>
            <div className={`text-xs font-medium ${isLight ? 'text-blue-600' : 'text-blue-400'}`}>TRIGGER</div>
            <p className={`text-sm font-medium ${isLight ? 'text-blue-900' : 'text-blue-200'}`}>New Contact Added</p>
          </div>
        </div>
        
        {/* Connector */}
        <div className="flex justify-center">
          <div className={`w-0.5 h-6 ${isLight ? 'bg-gray-300' : 'bg-slate-600'}`} />
        </div>
        
        {/* Action 1 */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isLight ? 'bg-green-50 border-green-200' : 'bg-green-900/20 border-green-700'}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? 'bg-green-100' : 'bg-green-800'}`}>
            <Mail className={`h-5 w-5 ${isLight ? 'text-green-600' : 'text-green-300'}`} />
          </div>
          <div>
            <div className={`text-xs font-medium ${isLight ? 'text-green-600' : 'text-green-400'}`}>SEND EMAIL</div>
            <p className={`text-sm font-medium ${isLight ? 'text-green-900' : 'text-green-200'}`}>Welcome Email</p>
          </div>
        </div>
        
        {/* Connector */}
        <div className="flex justify-center">
          <div className={`w-0.5 h-6 ${isLight ? 'bg-gray-300' : 'bg-slate-600'}`} />
        </div>
        
        {/* Wait */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isLight ? 'bg-purple-50 border-purple-200' : 'bg-purple-900/20 border-purple-700'}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? 'bg-purple-100' : 'bg-purple-800'}`}>
            <Clock className={`h-5 w-5 ${isLight ? 'text-purple-600' : 'text-purple-300'}`} />
          </div>
          <div>
            <div className={`text-xs font-medium ${isLight ? 'text-purple-600' : 'text-purple-400'}`}>WAIT</div>
            <p className={`text-sm font-medium ${isLight ? 'text-purple-900' : 'text-purple-200'}`}>3 Days</p>
          </div>
        </div>
        
        {/* Connector */}
        <div className="flex justify-center">
          <div className={`w-0.5 h-6 ${isLight ? 'bg-gray-300' : 'bg-slate-600'}`} />
        </div>
        
        {/* Action 2 */}
        <div className={`flex items-center gap-3 p-3 rounded-xl border ${isLight ? 'bg-amber-50 border-amber-200' : 'bg-amber-900/20 border-amber-700'}`}>
          <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${isLight ? 'bg-amber-100' : 'bg-amber-800'}`}>
            <CheckSquare className={`h-5 w-5 ${isLight ? 'text-amber-600' : 'text-amber-300'}`} />
          </div>
          <div>
            <div className={`text-xs font-medium ${isLight ? 'text-amber-600' : 'text-amber-400'}`}>CREATE TASK</div>
            <p className={`text-sm font-medium ${isLight ? 'text-amber-900' : 'text-amber-200'}`}>Follow-up Call</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AutomationsMockLarge;