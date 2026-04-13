import { useState, useCallback } from 'react';
export function useHistory(initialValue) {
  const [history, setHistory] = useState([initialValue]);
  const [index, setIndex] = useState(0);

  const push = useCallback((val) => {
    if (val === history[index]) return;
    const next = history.slice(0, index + 1);
    next.push(val);
    setHistory(next);
    setIndex(next.length - 1);
  }, [history, index]);

  const undo = useCallback(() => {
    if (index > 0) setIndex(index - 1);
  }, [index]);

  const redo = useCallback(() => {
    if (index < history.length - 1) setIndex(index + 1);
  }, [index, history]);

  return { value: history[index], push, undo, redo, canUndo: index > 0, canRedo: index < history.length - 1 };
}
