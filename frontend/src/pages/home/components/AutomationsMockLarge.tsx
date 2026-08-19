import React from 'react';
import { Users, Mail, Clock, CheckSquare } from 'lucide-react';

function AutomationsMockLarge() {
  return (
    <div className="flex flex-col items-center py-4">
      {/* Workflow nodes - matching production visual style */}
      <div className="w-full max-w-sm space-y-3">
        {/* Trigger */}
        <div className="flex items-center gap-3 p-3 rounded-xl border-2 border-dashed bg-blue-50 border-blue-300 dark:bg-blue-900/20 dark:border-blue-700">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-blue-100 dark:bg-blue-800">
            <Users className="h-5 w-5 text-blue-600 dark:text-blue-300" />
          </div>
          <div>
            <div className="text-xs font-medium text-blue-600 dark:text-blue-400">TRIGGER</div>
            <p className="text-sm font-medium text-blue-900 dark:text-blue-200">New Contact Added</p>
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-0.5 h-6 bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Action 1 */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-green-50 border-green-200 dark:bg-green-900/20 dark:border-green-700">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-green-100 dark:bg-green-800">
            <Mail className="h-5 w-5 text-green-600 dark:text-green-300" />
          </div>
          <div>
            <div className="text-xs font-medium text-green-600 dark:text-green-400">SEND EMAIL</div>
            <p className="text-sm font-medium text-green-900 dark:text-green-200">Welcome Email</p>
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-0.5 h-6 bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Wait */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-purple-50 border-purple-200 dark:bg-purple-900/20 dark:border-purple-700">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-purple-100 dark:bg-purple-800">
            <Clock className="h-5 w-5 text-purple-600 dark:text-purple-300" />
          </div>
          <div>
            <div className="text-xs font-medium text-purple-600 dark:text-purple-400">WAIT</div>
            <p className="text-sm font-medium text-purple-900 dark:text-purple-200">3 Days</p>
          </div>
        </div>

        {/* Connector */}
        <div className="flex justify-center">
          <div className="w-0.5 h-6 bg-gray-300 dark:bg-slate-600" />
        </div>

        {/* Action 2 */}
        <div className="flex items-center gap-3 p-3 rounded-xl border bg-amber-50 border-amber-200 dark:bg-amber-900/20 dark:border-amber-700">
          <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-amber-100 dark:bg-amber-800">
            <CheckSquare className="h-5 w-5 text-amber-600 dark:text-amber-300" />
          </div>
          <div>
            <div className="text-xs font-medium text-amber-600 dark:text-amber-400">CREATE TASK</div>
            <p className="text-sm font-medium text-amber-900 dark:text-amber-200">Follow-up Call</p>
          </div>
        </div>
      </div>
    </div>
  );
}

export default AutomationsMockLarge;
