import { useState, useRef, useEffect } from "react";

export default function MultiSelect({
  options,
  selected,
  onChange,
  placeholder,
  label,
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef(null);

  useEffect(() => {
    function handleClickOutside(e) {
      if (containerRef.current && !containerRef.current.contains(e.target)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const hasSelection = selected.length > 0;

  const buttonLabel = hasSelection
    ? selected.length === 1
      ? selected[0]
      : `${selected.length}件選択中`
    : placeholder;

  function toggle(option) {
    if (selected.includes(option)) {
      onChange(selected.filter((s) => s !== option));
    } else {
      onChange([...selected, option]);
    }
  }

  function clearAll() {
    onChange([]);
  }

  return (
    <div ref={containerRef} className="relative inline-block">
      {label && (
        <span className="text-xs text-slate-500 mr-1">{label}</span>
      )}
      <button
        type="button"
        onClick={() => setOpen((prev) => !prev)}
        className={`border rounded-md px-2 py-1.5 text-sm inline-flex items-center gap-1 transition-colors ${
          hasSelection
            ? "border-blue-300 text-blue-700 bg-blue-50"
            : "border-slate-300 text-slate-700 bg-white"
        }`}
      >
        <span>{buttonLabel}</span>
        <svg
          className={`w-3.5 h-3.5 transition-transform ${open ? "rotate-180" : ""}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M19 9l-7 7-7-7"
          />
        </svg>
      </button>

      {open && (
        <div className="absolute left-0 top-full mt-1 z-50 bg-white border border-slate-200 rounded-md shadow-lg min-w-[180px] max-h-60 overflow-y-auto">
          {hasSelection && (
            <button
              type="button"
              onClick={clearAll}
              className="w-full text-left px-3 py-1.5 text-xs text-red-500 hover:bg-slate-50 border-b border-slate-100"
            >
              すべて解除
            </button>
          )}
          {options.map((option) => (
            <label
              key={option}
              className="flex items-center gap-2 px-3 py-1.5 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.includes(option)}
                onChange={() => toggle(option)}
                className="rounded border-slate-300 text-blue-600 focus:ring-blue-500 focus:ring-offset-0 h-3.5 w-3.5"
              />
              <span>{option}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
