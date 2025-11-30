import { useState, useRef, useEffect } from "react";
import { Calendar } from "lucide-react";
import type { DatabaseColumn, DateValue } from "@/types/database";

interface DateCellProps {
  value: DateValue | null;
  onChange: (value: DateValue | null) => void;
  isEditing: boolean;
  onBlur: () => void;
  column: DatabaseColumn;
}

export function DateCell({ value, onChange, isEditing, onBlur, column }: DateCellProps) {
  const [editValue, setEditValue] = useState(value?.start || '');
  const inputRef = useRef<HTMLInputElement>(null);
  
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [isEditing]);
  
  useEffect(() => {
    setEditValue(value?.start || '');
  }, [value]);
  
  const handleBlur = () => {
    if (editValue !== value?.start) {
      onChange(editValue ? { start: editValue } : null);
    }
    onBlur();
  };
  
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleBlur();
    }
    if (e.key === 'Escape') {
      setEditValue(value?.start || '');
      onBlur();
    }
  };
  
  // 格式化日期显示
  const formatDate = (dateStr: string): string => {
    if (!dateStr) return '';
    
    const date = new Date(dateStr);
    const format = column.dateFormat || 'date';
    
    switch (format) {
      case 'full':
        return date.toLocaleString('zh-CN');
      case 'time':
        return date.toLocaleTimeString('zh-CN');
      case 'relative':
        return getRelativeTime(date);
      default:
        return date.toLocaleDateString('zh-CN');
    }
  };
  
  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type={column.includeTime ? 'datetime-local' : 'date'}
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleBlur}
        onKeyDown={handleKeyDown}
        className="w-full h-9 px-2 bg-transparent border-none outline-none text-sm"
      />
    );
  }
  
  if (!value?.start) {
    return (
      <div className="h-9 px-2 flex items-center text-sm text-muted-foreground">
        <Calendar className="w-4 h-4 mr-1" />
        空
      </div>
    );
  }
  
  return (
    <div className="h-9 px-2 flex items-center text-sm">
      <Calendar className="w-4 h-4 mr-1 text-muted-foreground" />
      {formatDate(value.start)}
      {value.end && ` → ${formatDate(value.end)}`}
    </div>
  );
}

function getRelativeTime(date: Date): string {
  const now = new Date();
  const diff = now.getTime() - date.getTime();
  const days = Math.floor(diff / (1000 * 60 * 60 * 24));
  
  if (days === 0) return '今天';
  if (days === 1) return '昨天';
  if (days === -1) return '明天';
  if (days > 0 && days < 7) return `${days}天前`;
  if (days < 0 && days > -7) return `${-days}天后`;
  
  return date.toLocaleDateString('zh-CN');
}
