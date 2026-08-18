import { useCallback, useEffect, useState } from 'react';
import { useReactFlow } from '@xyflow/react';

export function useWireframeNodeLabel(id: string, dataLabel: string, multiline = false) {
  const { setNodes } = useReactFlow();
  const [isEditing, setIsEditing] = useState(false);
  const [label, setLabel] = useState(dataLabel);

  useEffect(() => {
    if (!isEditing) {
      setLabel(dataLabel);
    }
  }, [dataLabel, isEditing]);

  const commit = useCallback((nextLabel: string) => {
    setNodes((nodes) =>
      nodes.map((node) =>
        node.id === id
          ? { ...node, data: { ...node.data, label: nextLabel } }
          : node
      )
    );
    setIsEditing(false);
  }, [id, setNodes]);

  const handleBlur = useCallback(() => {
    commit(label);
  }, [commit, label]);

  const handleKeyDown = useCallback((event: React.KeyboardEvent) => {
    if (event.key === 'Enter' && (!multiline || !event.shiftKey)) {
      event.preventDefault();
      commit(label);
    }
  }, [commit, label, multiline]);

  return {
    isEditing,
    setIsEditing,
    label,
    setLabel,
    handleBlur,
    handleKeyDown,
  };
}
