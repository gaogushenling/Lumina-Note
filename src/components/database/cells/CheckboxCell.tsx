import { Check } from "lucide-react";
import type { DatabaseColumn } from "@/types/database";

interface CheckboxCellProps {
  value: boolean | null;
  onChange: (value: boolean) => void;
  isEditing: boolean;
  onBlur: () => void;
  column: DatabaseColumn;
}

export function CheckboxCell({ value, onChange }: CheckboxCellProps) {
  const isChecked = value === true;
  
  return (
    <div className="h-9 px-2 flex items-center justify-center">
      <button
        onClick={(e) => {
          e.stopPropagation();
          onChange(!isChecked);
        }}
        className={`w-5 h-5 rounded border-2 flex items-center justify-center transition-colors ${
          isChecked
            ? 'bg-primary border-primary text-primary-foreground'
            : 'border-muted-foreground/30 hover:border-primary/50'
        }`}
      >
        {isChecked && <Check className="w-3 h-3" />}
      </button>
    </div>
  );
}
