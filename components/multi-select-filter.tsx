"use client"

import {
  Combobox,
  ComboboxChip,
  ComboboxChips,
  ComboboxChipsInput,
  ComboboxContent,
  ComboboxEmpty,
  ComboboxItem,
  ComboboxList,
  ComboboxValue,
  useComboboxAnchor,
} from "@/components/ui/combobox"
import { cn } from "@/lib/utils"

/**
 * A searchable multi-select of plain strings, shown as chips. Nothing picked
 * reads as "all" — the placeholder says so — which is how the dashboards'
 * filter axes treat an empty selection.
 */
export function MultiSelectFilter<T extends string>({
  ariaLabel,
  placeholder,
  emptyText,
  options,
  value,
  onValueChange,
  className,
}: {
  ariaLabel: string
  /** Shown while nothing is picked, e.g. "All sites". */
  placeholder: string
  emptyText: string
  options: readonly T[]
  value: T[]
  onValueChange: (next: T[]) => void
  className?: string
}) {
  const anchor = useComboboxAnchor()

  return (
    <Combobox multiple items={options} value={value} onValueChange={(next) => onValueChange(next as T[])}>
      <ComboboxChips ref={anchor} className={cn("min-w-44", className)}>
        <ComboboxValue>
          {(values: T[]) => (
            <>
              {values.map((item) => (
                <ComboboxChip key={item}>{item}</ComboboxChip>
              ))}
              <ComboboxChipsInput aria-label={ariaLabel} placeholder={values.length === 0 ? placeholder : ""} />
            </>
          )}
        </ComboboxValue>
      </ComboboxChips>
      <ComboboxContent anchor={anchor}>
        <ComboboxEmpty>{emptyText}</ComboboxEmpty>
        <ComboboxList>
          {(item: T) => (
            <ComboboxItem key={item} value={item}>
              {item}
            </ComboboxItem>
          )}
        </ComboboxList>
      </ComboboxContent>
    </Combobox>
  )
}
