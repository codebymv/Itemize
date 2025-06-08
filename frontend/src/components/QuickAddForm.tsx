
import React, { useState } from 'react';
import { Plus } from 'lucide-react';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";

interface QuickAddFormProps {
  onCreateList: (title: string, type: string) => void;
}

const QuickAddForm: React.FC<QuickAddFormProps> = ({ onCreateList }) => {
  const [title, setTitle] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (title.trim()) {
      onCreateList(title.trim(), 'General');
      setTitle('');
    }
  };

  return (
    <Card className="border-dashed border-2 border-slate-300 bg-slate-50/50">
      <CardContent className="p-6">
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <Input
              placeholder="Quick add a new list..."
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="flex-1"
            />
            <Button 
              type="submit" 
              disabled={!title.trim()}
              className="bg-blue-600 hover:bg-blue-700 sm:w-auto w-full"
            >
              <Plus className="h-4 w-4 mr-2" />
              Create
            </Button>
          </div>
          
          <p className="text-xs text-gray-500">
            Creates a "General" list by default. Use the full form for custom categories.
          </p>
        </form>
      </CardContent>
    </Card>
  );
};

export default QuickAddForm;
