import React, { useState, useEffect } from 'react';

interface RangeTextInputProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  className?: string;
  id?: string;
}

export const RangeTextInput: React.FC<RangeTextInputProps> = ({
  value,
  onChange,
  placeholder,
  className,
  id,
}) => {
  const [localVal, setLocalVal] = useState<string>(value);

  // Synchronize local state when external canonical value changes,
  // but avoid wiping out in-progress typing (e.g. trailing dashes or commas)
  useEffect(() => {
    // Helper to sanitize numbers set from range
    const parseSimpleNumbers = (s: string) =>
      s
        .split(/[,\s]+/)
        .filter(Boolean)
        .map((x) => x.trim())
        .join(',');

    if (parseSimpleNumbers(value) !== parseSimpleNumbers(localVal)) {
      setLocalVal(value);
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newVal = e.target.value;
    setLocalVal(newVal);
    onChange(newVal);
  };

  return (
    <input
      id={id}
      type="text"
      value={localVal}
      onChange={handleChange}
      placeholder={placeholder}
      className={className}
    />
  );
};
