/** Two to four choices side by side, one pressed: the Pegasus segmented control, on @tomas-tc/ui's tokens. */
export function Segmented<Value extends string | boolean>({
  label,
  options,
  value,
  onChange,
  guide,
  disabled = false,
}: {
  label: string;
  options: { value: Value; label: string }[];
  value: Value;
  onChange: (value: Value) => void;
  guide?: string;
  disabled?: boolean;
}) {
  return (
    <div role="radiogroup" aria-label={label} data-guide={guide} className="inline-flex h-9 items-center gap-0.5 rounded-md bg-muted p-[3px]">
      {options.map((option) => (
        <button
          key={String(option.value)}
          type="button"
          role="radio"
          aria-checked={option.value === value}
          disabled={disabled}
          onClick={() => onChange(option.value)}
          className="h-full rounded-[4px] px-3 text-sm font-medium text-muted-foreground transition-colors disabled:opacity-60 aria-checked:bg-background aria-checked:text-foreground aria-checked:shadow-sm"
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}
