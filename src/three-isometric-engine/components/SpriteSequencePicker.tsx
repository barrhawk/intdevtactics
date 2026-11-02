//NOTE(@jimmylee)
//Selects a front/back sequence pair from the SEQ library, grouped by what the sequences animate.

import { SEQ_CATEGORIES } from '@engine/constants/sprites/seq-library';

export default function SpriteSequencePicker({ className, value, onChange }: { className: string; value: number; onChange: (index: number) => void }) {
  return (
    <select className={className} aria-label="Sequence" value={value} onChange={(e) => onChange(Number(e.target.value))}>
      {SEQ_CATEGORIES.map((category) => (
        <optgroup key={category.label} label={category.label}>
          {category.pairs.map(({ pair, index }) => (
            <option key={index} value={index}>
              {pair.label} {pair.name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}
