import { useState } from "react";

const displayValue = (value) => value === "" || value == null ? "" : String(Math.round(Number(value)));

// Під час набору змінюється лише це поле. Округлення — для відображення;
// фокус/blur без редагування не змінює збережені копійки та не викликає API.
export default function SalesNumberInput({ value, onCommit, ...props }) {
  const [draft, setDraft] = useState(null);
  const [changed, setChanged] = useState(false);
  return (
    <input
      {...props}
      type="number"
      step="any"
      value={draft ?? displayValue(value)}
      onFocus={() => { setDraft(value == null ? "" : String(value)); setChanged(false); }}
      onChange={(event) => { setDraft(event.target.value); setChanged(true); }}
      onBlur={() => {
        if (changed && draft !== String(value ?? "")) onCommit(draft);
        setDraft(null);
        setChanged(false);
      }}
      onKeyDown={(event) => {
        if (event.key === "Enter") event.currentTarget.blur();
      }}
    />
  );
}
