import { useEffect, useRef, useState } from "react";

export interface ComboboxOption {
  value: string;
  label: string;
}

interface ComboboxProps {
  options: ComboboxOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  className?: string;
  style?: React.CSSProperties;
}

export default function Combobox({
  options,
  value,
  onChange,
  placeholder = "Select...",
  searchable = false,
  className,
  style,
}: ComboboxProps) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const containerRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const selected = options.find((o) => o.value === value);

  const filtered = search
    ? options.filter((o) => o.label.toLowerCase().includes(search.toLowerCase()))
    : options;

  useEffect(() => {
    if (open && searchable) {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
    if (!open) setSearch("");
  }, [open, searchable]);

  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, []);

  const handleSelect = (val: string) => {
    onChange(val);
    setOpen(false);
    setSearch("");
  };

  return (
    <div className={`combobox${open ? " open" : ""}${className ? ` ${className}` : ""}`} ref={containerRef} style={style}>
      {searchable ? (
        <div className="combobox-trigger" onClick={() => !open && setOpen(true)}>
          <input
            ref={inputRef}
            type="text"
            className="combobox-input"
            placeholder={selected ? selected.label : placeholder}
            value={open ? search : ""}
            onChange={(e) => {
              setSearch(e.target.value);
              if (!open) setOpen(true);
            }}
            onFocus={() => setOpen(true)}
          />
          {!open && selected && (
            <span className="combobox-value">{selected.label}</span>
          )}
          <svg
            className={`combobox-arrow${open ? " open" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
      ) : (
        <button
          type="button"
          className="combobox-trigger"
          onClick={() => setOpen(!open)}
        >
          <span className={selected ? "combobox-value" : "combobox-placeholder"}>
            {selected ? selected.label : placeholder}
          </span>
          <svg
            className={`combobox-arrow${open ? " open" : ""}`}
            width="12"
            height="12"
            viewBox="0 0 24 24"
            fill="none"
            aria-hidden
          >
            <path d="M6 9l6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </button>
      )}

      {open && (
        <div className="combobox-dropdown">
          <div className="combobox-options">
            {filtered.map((o) => (
              <button
                key={o.value}
                type="button"
                className={`combobox-option${o.value === value ? " active" : ""}`}
                onClick={() => handleSelect(o.value)}
              >
                {o.label}
              </button>
            ))}
            {filtered.length === 0 && (
              <div className="combobox-empty">No results</div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
