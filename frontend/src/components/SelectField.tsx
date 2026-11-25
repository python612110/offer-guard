import {
  useId,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent,
  type ReactNode,
} from "react";
import { Check, ChevronDown } from "lucide-react";

type Option<T> = T | { value: T; label: string };

export default function SelectField<T extends string>({
  label,
  value,
  options,
  onChange,
  disabled,
  showLabel,
  compact,
  icon,
}: {
  label: string;
  value: T;
  options: readonly Option<T>[];
  onChange: (value: T) => void;
  disabled?: boolean;
  showLabel?: boolean;
  compact?: boolean;
  icon?: ReactNode;
}) {
  const id = useId();
  const root = useRef<HTMLDivElement>(null);
  const entries = options.map((entry) =>
    typeof entry === "string" ? { value: entry, label: entry } : entry,
  );
  const current = entries.findIndex((entry) => entry.value === value);
  const trigger = useRef<HTMLButtonElement>(null);
  const rows = useRef<(HTMLDivElement | null)[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const expanded = open && !disabled && entries.length > 0;

  useEffect(() => {
    if (!expanded) return;
    function dismiss(event: PointerEvent) {
      if (event.target instanceof Node && !root.current?.contains(event.target))
        setOpen(false);
    }
    document.addEventListener("pointerdown", dismiss);
    return () => document.removeEventListener("pointerdown", dismiss);
  }, [expanded]);

  function reveal(index: number) {
    if (!entries.length) return;
    setActive(Math.min(entries.length - 1, Math.max(0, index)));
    setOpen(true);
  }

  function choose(index: number) {
    if (!entries[index]) return;
    onChange(entries[index].value);
    setOpen(false);
  }

  function onKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (event.key === "Tab") {
      setOpen(false);
      return;
    }
    if (event.key === "Escape" && expanded) {
      event.preventDefault();
      event.stopPropagation();
      setOpen(false);
      return;
    }
    if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
      event.preventDefault();
      const index =
        event.key === "Home"
          ? 0
          : event.key === "End"
            ? entries.length - 1
            : expanded
              ? active + (event.key === "ArrowDown" ? 1 : -1)
              : current >= 0
                ? current
                : event.key === "ArrowDown"
                  ? 0
                  : entries.length - 1;
      reveal(index);
    } else if (expanded && (event.key === "Enter" || event.key === " ")) {
      event.preventDefault();
      choose(active);
    }
  }

  return (
    <div
      ref={root}
      className={`select-field${compact ? " select-field-compact" : ""}`}
    >
      {showLabel && <label htmlFor={id}>{label}</label>}
      <button
        ref={trigger}
        id={id}
        type="button"
        role="combobox"
        aria-label={label}
        aria-haspopup="listbox"
        aria-expanded={expanded}
        aria-controls={expanded ? `${id}-list` : undefined}
        aria-activedescendant={expanded ? `${id}-option-${active}` : undefined}
        className="select-trigger"
        disabled={disabled || !entries.length}
        onKeyDown={onKeyDown}
        onBlur={() => setOpen(false)}
        onClick={() => {
          trigger.current?.focus({ preventScroll: true });
          if (expanded) setOpen(false);
          else reveal(current);
        }}
      >
        {icon}
        <span className="select-value">
          {entries[current]?.label ?? "请选择"}
        </span>
        <ChevronDown className="select-chevron" size={16} aria-hidden="true" />
      </button>
      {expanded && (
        <div
          id={`${id}-list`}
          className="select-options"
          role="listbox"
          aria-label={label}
          ref={(list) => {
            const row = rows.current[active];
            if (!list || !row) return;
            if (row.offsetTop < list.scrollTop) list.scrollTop = row.offsetTop;
            else if (
              row.offsetTop + row.offsetHeight >
              list.scrollTop + list.clientHeight
            )
              list.scrollTop =
                row.offsetTop + row.offsetHeight - list.clientHeight;
          }}
        >
          {entries.map((entry, index) => (
            <div
              key={entry.value}
              ref={(row) => {
                rows.current[index] = row;
              }}
              id={`${id}-option-${index}`}
              role="option"
              aria-selected={index === current}
              className={
                index === active ? "select-option is-active" : "select-option"
              }
              onMouseDown={(event) => event.preventDefault()}
              onClick={() => {
                trigger.current?.focus({ preventScroll: true });
                choose(index);
              }}
            >
              <span>{entry.label}</span>
              {index === current && <Check size={16} aria-hidden="true" />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
