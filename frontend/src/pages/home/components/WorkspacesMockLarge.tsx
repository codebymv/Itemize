import React from 'react';
import { Check, ChevronDown, Palette } from 'lucide-react';

function WorkspacesMockLarge({ isLight }: { isLight: boolean }) {
  const cardBg = isLight ? 'bg-white' : 'bg-slate-800';
  const borderColor = isLight ? 'border-gray-200' : 'border-slate-700';
  
  return (
    <div className="grid grid-cols-3 gap-4 min-h-[320px]">
      {/* List Card - matches ListCard.tsx styling */}
      <div className={`${cardBg} rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
        <div className={`p-3 border-b ${borderColor} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-violet-500 cursor-pointer" title="Color picker" />
            <span className={`text-sm font-medium italic ${isLight ? 'text-gray-800' : 'text-slate-100'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Sprint Tasks</span>
          </div>
          <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
        </div>
        {/* Progress bar */}
        <div className={`h-1 ${isLight ? 'bg-gray-100' : 'bg-slate-700'}`}>
          <div className="h-full w-1/2 bg-violet-500 rounded-r" />
        </div>
        <div className="p-3 space-y-2">
          {[
            { text: 'Review proposal', done: true },
            { text: 'Call client', done: true },
            { text: 'Update docs', done: false },
            { text: 'Send invoice', done: false },
          ].map((item, i) => (
            <div key={i} className="flex items-center gap-2">
              <div className={`w-4 h-4 rounded border-2 flex items-center justify-center ${item.done ? 'bg-violet-500 border-violet-500' : isLight ? 'border-gray-300' : 'border-slate-600'}`}>
                {item.done && <Check className="h-3 w-3 text-white" />}
              </div>
              <span className={`text-sm ${item.done ? 'line-through opacity-50' : ''} ${isLight ? 'text-gray-700' : 'text-slate-300'}`}>{item.text}</span>
            </div>
          ))}
        </div>
      </div>
      
      {/* Note Card - matches NoteCard.tsx styling */}
      <div className={`${cardBg} rounded-xl border ${borderColor} shadow-sm overflow-hidden`}>
        <div className={`p-3 border-b ${borderColor} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-amber-400 cursor-pointer" title="Color picker" />
            <span className={`text-sm font-medium italic ${isLight ? 'text-gray-800' : 'text-slate-100'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Meeting Notes</span>
          </div>
          <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
        </div>
        <div className="p-3">
          <div className={`text-sm space-y-2 ${isLight ? 'text-gray-600' : 'text-slate-400'}`}>
            <p className={`font-medium ${isLight ? 'text-gray-800' : 'text-slate-200'}`}>Key Takeaways:</p>
            <ul className="text-xs space-y-1 ml-4 list-disc">
              <li>Budget approved for Q2</li>
              <li>Timeline: 2 weeks delivery</li>
              <li>Next step: send proposal</li>
            </ul>
            <p className={`text-xs mt-3 pt-2 border-t ${borderColor}`}>
              <span className="font-medium">Action Items:</span> Follow up by Friday
            </p>
          </div>
        </div>
      </div>
      
      {/* Whiteboard Card - matches WhiteboardCard.tsx styling */}
      <div className={`${cardBg} rounded-xl border ${borderColor} shadow-sm overflow-hidden flex flex-col`}>
        <div className={`p-3 border-b ${borderColor} flex items-center justify-between`}>
          <div className="flex items-center gap-2">
            <div className="w-3 h-3 rounded-full bg-blue-500 cursor-pointer" title="Color picker" />
            <span className={`text-sm font-medium italic ${isLight ? 'text-gray-800' : 'text-slate-100'}`} style={{ fontFamily: '"Raleway", sans-serif' }}>Brainstorm</span>
          </div>
          <ChevronDown className={`h-4 w-4 ${isLight ? 'text-gray-400' : 'text-slate-500'}`} />
        </div>
        <div className={`flex-1 ${isLight ? 'bg-gray-50' : 'bg-slate-900/50'} p-4 flex flex-col items-center justify-center relative min-h-[200px]`}>
          {/* Mini whiteboard canvas representation */}
          <div className="absolute inset-4 border-2 border-dashed border-blue-300 dark:border-blue-700 rounded-lg opacity-50" />
          <div className="flex gap-2 mb-4">
            {['bg-red-400', 'bg-blue-400', 'bg-green-400', 'bg-yellow-400'].map((color, i) => (
              <div key={i} className={`w-4 h-4 rounded-full ${color} opacity-60`} />
            ))}
          </div>
          <Palette className={`h-10 w-10 ${isLight ? 'text-gray-300' : 'text-slate-600'}`} />
          <span className={`text-xs mt-2 ${isLight ? 'text-gray-400' : 'text-slate-500'}`}>Draw & annotate</span>
        </div>
      </div>
    </div>
  );
}

export default WorkspacesMockLarge;