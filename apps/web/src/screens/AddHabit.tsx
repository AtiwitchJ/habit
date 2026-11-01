import { useEffect, useMemo, useState } from 'react';
import { RETRO_DAYS, stepFor } from '@habit/core/checkin';
import { addDays, assertLogicalDate, type LogicalDate } from '@habit/core/logical-date';
import { HUES, type Hue } from '@habit/core/repo';
import type { Schedule } from '@habit/core/streak';
import {
  CATEGORY_INFO,
  THAI_HABIT_PRESETS,
  type HabitPreset,
  type PresetCategory,
} from '../presets-th.ts';
import { repo } from '../repo-local.ts';

const firstEmoji = (text: string): string =>
  new Intl.Segmenter().segment(text.trim())[Symbol.iterator]().next().value?.segment ?? '';

function describeSchedule(schedule: Schedule): string {
  if (schedule.type === 'daily') return 'ทุกวัน';
  if (schedule.type === 'weekdays') return `วันธรรมดา (${schedule.days.length} วัน)`;
  return `${schedule.count} วัน / สัปดาห์`;
}

interface CustomDraft {
  name: string;
  kind: 'boolean' | 'quantitative';
  target: number;
  unit: string;
  step: string;
  schedule: Schedule;
  startDate: string;
  icon: string;
  color: Hue;
}

export function AddHabit({
  today,
  onDone,
  onCancel,
}: {
  today: LogicalDate;
  onDone(): void;
  onCancel(): void;
}) {
  const [activeCategory, setActiveCategory] = useState<PresetCategory>('popular');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [presetVariants, setPresetVariants] = useState<Record<string, number>>({});
  const [existingNames, setExistingNames] = useState<Set<string>>(new Set());
  const [showCustomForm, setShowCustomForm] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Custom fallback form state
  const [customDraft, setCustomDraft] = useState<CustomDraft>({
    name: '',
    kind: 'boolean',
    target: 1,
    unit: '',
    step: '',
    schedule: { type: 'daily' },
    startDate: today,
    icon: '✨',
    color: 'teal',
  });

  useEffect(() => {
    void repo.listHabits().then((list) => {
      setExistingNames(new Set(list.map((h) => h.name.toLowerCase().trim())));
    });
  }, []);

  const filteredPresets = useMemo(() => {
    return THAI_HABIT_PRESETS.filter((p) => p.category === activeCategory);
  }, [activeCategory]);

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const getActivePresetConfig = (preset: HabitPreset) => {
    const variantIdx = presetVariants[preset.id] ?? 0;
    if (preset.options && preset.options[variantIdx]) {
      const opt = preset.options[variantIdx];
      return {
        target: opt.target,
        unit: opt.unit,
        step: opt.step ?? (preset.kind === 'quantitative' ? Math.max(1, Math.round(opt.target / 10)) : 1),
      };
    }
    return {
      target: preset.target,
      unit: preset.unit,
      step: preset.step ?? (preset.kind === 'quantitative' ? Math.max(1, Math.round(preset.target / 10)) : 1),
    };
  };

  // Mode A: Add single habit immediately
  const handleInstantAdd = async (preset: HabitPreset) => {
    try {
      setSaving(true);
      setError(null);
      const cfg = getActivePresetConfig(preset);
      await repo.addHabit({
        name: preset.name,
        icon: preset.icon,
        color: preset.color,
        kind: preset.kind,
        target: cfg.target,
        unit: cfg.unit,
        step: cfg.step,
        schedule: preset.schedule,
        startDate: today,
        templateId: preset.id,
        reminderTime: preset.reminderTime,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // Mode B: Add all selected habits in batch
  const handleBatchAdd = async () => {
    if (selectedIds.size === 0) return;
    try {
      setSaving(true);
      setError(null);
      const toAdd = THAI_HABIT_PRESETS.filter((p) => selectedIds.has(p.id));
      await Promise.all(
        toAdd.map((preset) => {
          const cfg = getActivePresetConfig(preset);
          return repo.addHabit({
            name: preset.name,
            icon: preset.icon,
            color: preset.color,
            kind: preset.kind,
            target: cfg.target,
            unit: cfg.unit,
            step: cfg.step,
            schedule: preset.schedule,
            startDate: today,
            templateId: preset.id,
            reminderTime: preset.reminderTime,
          });
        }),
      );
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  // Custom Form Save (Last resort)
  const saveCustom = async () => {
    const trimmed = customDraft.name.trim();
    if (!trimmed) return setError('กรุณาระบุชื่อนิสัย');
    if (customDraft.kind === 'quantitative' && !(customDraft.target > 0)) {
      return setError('เป้าหมายต้องมากกว่า 0');
    }
    if (customDraft.kind === 'quantitative' && !customDraft.unit.trim()) {
      return setError('กรุณาระบุหน่วยวัด');
    }
    try {
      assertLogicalDate(customDraft.startDate);
    } catch {
      return setError('วันที่เริ่มต้นไม่ถูกต้อง');
    }

    try {
      setSaving(true);
      await repo.addHabit({
        name: trimmed,
        icon: customDraft.icon || '✨',
        color: customDraft.color,
        kind: customDraft.kind,
        target: customDraft.kind === 'boolean' ? 1 : customDraft.target,
        unit: customDraft.kind === 'quantitative' ? customDraft.unit.trim() : undefined,
        step:
          customDraft.kind === 'quantitative' && customDraft.step !== ''
            ? Number(customDraft.step)
            : undefined,
        schedule: customDraft.schedule,
        startDate: customDraft.startDate,
      });
      onDone();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSaving(false);
    }
  };

  if (showCustomForm) {
    return (
      <form
        className="card"
        onSubmit={(e) => {
          e.preventDefault();
          void saveCustom();
        }}
      >
        <div className="datebar">
          <h2>✍️ กำหนดนิสัยด้วยตัวเอง</h2>
          <button type="button" onClick={() => setShowCustomForm(false)}>
            กลับไปเลือกกิจกรรม
          </button>
        </div>

        <label className="field">
          <span>ชื่อนิสัย</span>
          <input
            value={customDraft.name}
            onChange={(e) => setCustomDraft({ ...customDraft, name: e.target.value })}
            placeholder="เช่น วิดพื้น, ดื่มน้ำ, นั่งสมาธิ"
            autoFocus
          />
        </label>

        <label className="field">
          <span>ไอคอน (อิโมจิ)</span>
          <input
            value={customDraft.icon}
            onChange={(e) =>
              setCustomDraft({ ...customDraft, icon: firstEmoji(e.target.value) || '✨' })
            }
            placeholder="✨"
          />
        </label>

        <div className="field">
          <span>สี</span>
          <div className="swatches">
            {HUES.map((hue) => (
              <button
                key={hue}
                type="button"
                className={`hue-${hue}`}
                aria-pressed={customDraft.color === hue}
                onClick={() => setCustomDraft({ ...customDraft, color: hue })}
              />
            ))}
          </div>
        </div>

        <label className="field">
          <span>ประเภทการนับ</span>
          <select
            value={customDraft.kind}
            onChange={(e) =>
              setCustomDraft({
                ...customDraft,
                kind: e.target.value as 'boolean' | 'quantitative',
                target: e.target.value === 'boolean' ? 1 : 10,
              })
            }
          >
            <option value="boolean">ทำ / ไม่ทำ (Yes/No)</option>
            <option value="quantitative">นับจำนวน / วัดค่า (Amount)</option>
          </select>
        </label>

        {customDraft.kind === 'quantitative' && (
          <>
            <label className="field">
              <span>เป้าหมายต่อวัน</span>
              <input
                type="number"
                min="1"
                value={customDraft.target}
                onChange={(e) =>
                  setCustomDraft({ ...customDraft, target: Number(e.target.value) })
                }
              />
            </label>
            <label className="field">
              <span>หน่วย</span>
              <input
                value={customDraft.unit}
                onChange={(e) => setCustomDraft({ ...customDraft, unit: e.target.value })}
                placeholder="แก้ว, นาที, หน้า, ครั้ง"
              />
            </label>
          </>
        )}

        {error && <p className="error">{error}</p>}

        <div className="actions">
          <button type="submit" className="primary" disabled={saving}>
            {saving ? 'กำลังบันทึก...' : 'บันทึกนิสัย'}
          </button>
          <button type="button" onClick={() => setShowCustomForm(false)}>
            ยกเลิก
          </button>
        </div>
      </form>
    );
  }

  const categories = Object.keys(CATEGORY_INFO) as PresetCategory[];

  return (
    <div className="add-habit-page">
      {/* Header */}
      <div className="preset-header">
        <div>
          <h2>เลือกกิจกรรมที่อยากทำ ✨</h2>
          <p className="subtitle">แตะการ์ดเพื่อเลือกหลายอัน หรือแตะปุ่มเพื่อเพิ่มทันที</p>
        </div>
        <button className="cancel-btn" onClick={onCancel}>
          ปิด
        </button>
      </div>

      {error && <p className="banner">{error}</p>}

      {/* Category Scroll Tabs */}
      <div className="category-scroll-bar">
        {categories.map((catKey) => {
          const info = CATEGORY_INFO[catKey];
          const isActive = activeCategory === catKey;
          return (
            <button
              key={catKey}
              type="button"
              className={`cat-tab ${isActive ? 'active' : ''}`}
              onClick={() => setActiveCategory(catKey)}
            >
              <span>{info.icon}</span>
              <span>{info.label}</span>
            </button>
          );
        })}
      </div>

      {/* Presets Grid Boxes */}
      <div className="presets-grid">
        {filteredPresets.map((preset) => {
          const isSelected = selectedIds.has(preset.id);
          const isAlreadyAdded = existingNames.has(preset.name.toLowerCase().trim());
          const cfg = getActivePresetConfig(preset);
          const currentVariant = presetVariants[preset.id] ?? 0;

          return (
            <div
              key={preset.id}
              className={`preset-box hue-${preset.color} ${isSelected ? 'selected' : ''} ${
                isAlreadyAdded ? 'already-added' : ''
              }`}
              onClick={() => {
                if (!isAlreadyAdded) toggleSelect(preset.id);
              }}
            >
              <div className="box-top">
                <span className="box-icon">{preset.icon}</span>
                <div className="box-title-group">
                  <h4>{preset.name}</h4>
                  <span className="box-schedule-badge">
                    {cfg.target > 1 && preset.kind === 'quantitative'
                      ? `${cfg.target} ${cfg.unit} · `
                      : ''}
                    {describeSchedule(preset.schedule)}
                  </span>
                </div>
                {!isAlreadyAdded && (
                  <div className={`selection-checkbox ${isSelected ? 'checked' : ''}`}>
                    {isSelected ? '✓' : ''}
                  </div>
                )}
              </div>

              {/* Preset Variant Chips (if any options exist) */}
              {preset.options && preset.options.length > 1 && (
                <div className="preset-variant-chips" onClick={(e) => e.stopPropagation()}>
                  {preset.options.map((opt, idx) => (
                    <button
                      key={`${opt.unit}-${opt.target}`}
                      type="button"
                      className={`variant-pill ${currentVariant === idx ? 'active' : ''}`}
                      onClick={() =>
                        setPresetVariants((prev) => ({ ...prev, [preset.id]: idx }))
                      }
                    >
                      {opt.target} {opt.unit}
                    </button>
                  ))}
                </div>
              )}

              {/* Action row on card */}
              <div className="box-actions" onClick={(e) => e.stopPropagation()}>
                {isAlreadyAdded ? (
                  <span className="added-badge">มีในลิสต์แล้ว ✓</span>
                ) : (
                  <button
                    type="button"
                    className="quick-add-btn"
                    disabled={saving}
                    onClick={() => handleInstantAdd(preset)}
                  >
                    + เพิ่มเลยทันที
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {/* Floating Bottom Bar for Mode B (Multi-Select Batch Add) */}
      {selectedIds.size > 0 && (
        <div className="floating-batch-bar">
          <div className="batch-info">
            <span>เลือกไว้ <strong>{selectedIds.size}</strong> กิจกรรม</span>
          </div>
          <button
            type="button"
            className="batch-submit-btn primary"
            disabled={saving}
            onClick={handleBatchAdd}
          >
            {saving ? 'กำลังเพิ่ม...' : `เพิ่ม ${selectedIds.size} นิสัยที่เลือกลงวันนี้ →`}
          </button>
        </div>
      )}

      {/* Last Resort: Custom Manual Form */}
      <div className="custom-fallback-section">
        <p>ไม่เจอกิจกรรมที่ต้องการ?</p>
        <button
          type="button"
          className="custom-form-trigger"
          onClick={() => setShowCustomForm(true)}
        >
          ✍️ พิมพ์กำหนดนิสัยเอง
        </button>
      </div>
    </div>
  );
}
