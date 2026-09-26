import {
  configDefaultsFor,
  sourceKindFor,
  type FieldDef,
  type SourceRecord,
  type Tile,
} from '@dashboard/shared';
import { useEffect, useState } from 'preact/hooks';
import { useI18n } from '../i18n';
import { fieldLabelKey, optionLabelKey, sourcesOfKind } from './tile-model';

interface FieldProps {
  field: FieldDef;
  tile: Tile;
  sources: readonly SourceRecord[];
  onChange(key: string, value: unknown): void;
}

/** A whole number that is only taken when the field is left, so typing "1" on the way to "14" is harmless. */
function NumberInput({
  value,
  min,
  max,
  disabled,
  label,
  onCommit,
}: {
  value: number;
  min: number;
  max: number;
  disabled: boolean;
  label: string;
  onCommit(value: number): void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);

  function commit(): void {
    const parsed = Number(text);
    if (Number.isInteger(parsed) && parsed >= min && parsed <= max) onCommit(parsed);
    else setText(String(value));
  }

  return (
    <input
      type="number"
      inputMode="numeric"
      min={min}
      max={max}
      step={1}
      aria-label={label}
      disabled={disabled}
      value={text}
      onInput={(event) => setText(event.currentTarget.value)}
      onBlur={commit}
      onKeyDown={(event) => event.key === 'Enter' && commit()}
    />
  );
}

/** Date and, optionally, time of a countdown: `YYYY-MM-DD` or `YYYY-MM-DDTHH:mm`. */
function DateTimeInput({ value, onChange }: { value: string; onChange(value: string): void }) {
  const { t } = useI18n();
  const date = value.slice(0, 10);
  const time = value.slice(11, 16);
  return (
    <div class="datetime">
      <label class="field">
        <span class="muted">{t('admin.editor.date')}</span>
        <input
          type="date"
          value={date}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next === '' ? '' : time ? `${next}T${time}` : next);
          }}
        />
      </label>
      <label class="field">
        <span class="muted">{t('admin.editor.time')}</span>
        <input
          type="time"
          value={time}
          disabled={date === ''}
          onChange={(event) => {
            const next = event.currentTarget.value;
            onChange(next === '' ? date : `${date}T${next}`);
          }}
        />
      </label>
    </div>
  );
}

function SourcePicker({ tile, sources, onChange }: Omit<FieldProps, 'field'>) {
  const { t } = useI18n();
  const kind = sourceKindFor(tile.type, tile.config);
  const available = kind ? sourcesOfKind(sources, kind) : [];
  const selected = Array.isArray(tile.config['sourceIds']) ? (tile.config['sourceIds'] as string[]) : [];
  const unknown = selected.filter((id) => !available.some((source) => source.id === id));

  function toggle(id: string, on: boolean): void {
    onChange('sourceIds', on ? [...selected, id] : selected.filter((existing) => existing !== id));
  }

  if (available.length === 0 && unknown.length === 0) {
    return (
      <p class="muted">
        {t('admin.editor.noSources')} <a href="#/accounts">{t('admin.nav.accounts')}</a>
      </p>
    );
  }
  return (
    <ul class="plain checklist">
      {available.map((source) => (
        <li key={source.id}>
          <label class="check">
            <input
              type="checkbox"
              checked={selected.includes(source.id)}
              onChange={(event) => toggle(source.id, event.currentTarget.checked)}
            />
            {source.color && <span class="swatch" style={{ background: source.color }} />}
            <span>{source.label}</span>
          </label>
        </li>
      ))}
      {unknown.map((id) => (
        <li key={id}>
          <label class="check">
            <input type="checkbox" checked onChange={() => toggle(id, false)} />
            <span class="muted">{id}</span>
          </label>
        </li>
      ))}
    </ul>
  );
}

/** One setting of a tile, drawn from its descriptor in the registry. */
export function FieldEditor({ field, tile, sources, onChange }: FieldProps) {
  const { t } = useI18n();
  const labelKey = fieldLabelKey(tile.type, field.key);
  const label = labelKey ? t(labelKey) : field.key;
  const defaults = configDefaultsFor(tile.type, tile.config) as Record<string, unknown>;
  const value = field.key in tile.config ? tile.config[field.key] : defaults[field.key];

  switch (field.kind) {
    case 'boolean':
      return (
        <label class="check">
          <input
            type="checkbox"
            checked={value === true}
            onChange={(event) => onChange(field.key, event.currentTarget.checked)}
          />
          <span>{label}</span>
        </label>
      );
    case 'enum':
      return (
        <label class="field">
          <span>{label}</span>
          <select
            value={String(value ?? '')}
            onChange={(event) => onChange(field.key, event.currentTarget.value)}
          >
            {field.options.map((option) => {
              const optionKey = optionLabelKey(field.key, option);
              return (
                <option key={option} value={option}>
                  {optionKey ? t(optionKey) : option}
                </option>
              );
            })}
          </select>
        </label>
      );
    case 'integer': {
      const automatic = field.nullable === true && value === null;
      return (
        <div class="field">
          <span>{label}</span>
          <div class="inline">
            <NumberInput
              value={typeof value === 'number' ? value : field.min}
              min={field.min}
              max={field.max}
              disabled={automatic}
              label={label}
              onCommit={(next) => onChange(field.key, next)}
            />
            {field.nullable && (
              <label class="check">
                <input
                  type="checkbox"
                  checked={automatic}
                  onChange={(event) => onChange(field.key, event.currentTarget.checked ? null : field.min)}
                />
                <span>{t('admin.editor.auto')}</span>
              </label>
            )}
          </div>
        </div>
      );
    }
    case 'text':
      return (
        <label class="field">
          <span>{label}</span>
          <input
            type="text"
            maxLength={field.maxLength}
            value={typeof value === 'string' ? value : ''}
            onInput={(event) => onChange(field.key, event.currentTarget.value)}
          />
        </label>
      );
    case 'datetime':
      return (
        <div class="field">
          <span>{label}</span>
          <DateTimeInput
            value={typeof value === 'string' ? value : ''}
            onChange={(next) => onChange(field.key, next)}
          />
        </div>
      );
    case 'sources':
      return (
        <div class="field">
          <span>{label}</span>
          <SourcePicker tile={tile} sources={sources} onChange={onChange} />
        </div>
      );
  }
}
