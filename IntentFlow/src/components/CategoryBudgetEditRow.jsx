import React, { useState, useRef, useCallback } from 'react';
import Button from './ui/Button';
import {
  CATEGORY_GOAL_TYPE_OPTIONS,
  CATEGORY_GOAL_FREQUENCY_OPTIONS,
  normalizeGoalTypeForSelect,
  normalizeGoalFrequencyForSelect,
} from '../constants/categoryGoalTypes.jsx';
import { formatDateForInput } from '../utils/budgetMonthUtils.jsx';
import { parseMoneyInput, formatMoneyInput } from '../utils/categoryMoneyInput.jsx';

/**
 * Inline category editor for Prosperity Map.
 * Uses local state so parent table reloads cannot reset goal target / assigned inputs.
 */
export default function CategoryBudgetEditRow({
  category,
  formatCurrency,
  getTargetInfo,
  buildPreviewCategory,
  getProgressColor,
  onSave,
  onCancel,
  onArchive,
  onDelete
}) {
  const [name, setName] = useState(category.name || '');
  const [assignedInput, setAssignedInput] = useState(() => formatMoneyInput(category.assigned));
  const [targetAmountInput, setTargetAmountInput] = useState(() =>
    formatMoneyInput(category.target_amount)
  );
  const [targetType, setTargetType] = useState(
    () => normalizeGoalTypeForSelect(category.target_type || 'monthly'),
  );
  const [targetFrequency, setTargetFrequency] = useState(
    () => normalizeGoalFrequencyForSelect(category.target_frequency || 'monthly'),
  );
  const [targetDate, setTargetDate] = useState(() => formatDateForInput(category.target_date));
  const [error, setError] = useState('');

  const draftRef = useRef({
    name: category.name || '',
    assignedInput: formatMoneyInput(category.assigned),
    targetAmountInput: formatMoneyInput(category.target_amount),
    targetType: category.target_type || 'monthly',
    targetFrequency: normalizeGoalFrequencyForSelect(category.target_frequency || 'monthly'),
    targetDate: formatDateForInput(category.target_date)
  });

  const syncRef = useCallback((patch) => {
    draftRef.current = { ...draftRef.current, ...patch };
  }, []);

  const previewCategory = buildPreviewCategory(category, draftRef.current);
  const editPreview = getTargetInfo(previewCategory);
  const editHasTarget = editPreview.status !== 'no-target';

  const handleSaveClick = () => {
    const draft = draftRef.current;
    if (!draft.name.trim()) {
      setError('Please enter a category name.');
      return;
    }
    if (draft.targetType === 'by_date' && !draft.targetDate) {
      setError('Please select a target date for a Target Category Balance by Date goal.');
      return;
    }

    const parsedAssigned = parseMoneyInput(draft.assignedInput);
    if (!Number.isFinite(parsedAssigned) || parsedAssigned < 0) {
      setError('Assigned must be a valid amount (0 or greater).');
      return;
    }

    const parsedTarget = parseMoneyInput(draft.targetAmountInput);
    if (!Number.isFinite(parsedTarget) || parsedTarget <= 0) {
      setError('Goal target must be a valid amount greater than 0.');
      return;
    }

    setError('');
    onSave({
      categoryId: category.id,
      name: draft.name.trim(),
      assigned: parsedAssigned,
      target_amount: parsedTarget,
      target_type: draft.targetType,
      target_frequency: draft.targetFrequency,
      target_date: draft.targetType === 'by_date' ? draft.targetDate : null
    });
  };

  return (
    <tr className="bg-[#0047AB]">
      <td className="px-4 py-4">
        <div className="flex flex-col gap-3">
          <label htmlFor="pm-category-edit-name" className="text-xs font-medium text-[#F0F9FF]/75">
            Category name
          </label>
          <input
            id="pm-category-edit-name"
            type="text"
            value={name}
            onChange={(e) => {
              const v = e.target.value;
              setName(v);
              syncRef({ name: v });
            }}
            className="w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          />
          <div className="flex flex-wrap gap-2">
            <Button variant="pmSecondary" type="button" onClick={() => onArchive(category)}>
              Archive
            </Button>
            <Button variant="pmDanger" type="button" onClick={() => onDelete(category.id)}>
              Delete
            </Button>
          </div>
        </div>
      </td>
      <td className="px-4 py-4">
        <label htmlFor="pm-category-edit-assigned" className="mb-2 block text-xs font-medium text-[#F0F9FF]/75">
          Assigned
        </label>
        <input
          id="pm-category-edit-assigned"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          value={assignedInput}
          onChange={(e) => {
            const v = e.target.value;
            setAssignedInput(v);
            syncRef({ assignedInput: v });
          }}
          className="w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          placeholder="0.00"
        />
      </td>
      <td className="px-4 py-4">{formatCurrency(category.activity || 0)}</td>
      <td className="px-4 py-4">{formatCurrency(category.available || 0)}</td>
      <td className="px-4 py-4 align-top">
        {editHasTarget ? (
          <div className="space-y-2">
            <div className="relative h-3 overflow-hidden rounded-full bg-[#0047AB]/70">
              <div
                className="h-full rounded-full"
                style={{
                  width: `${Math.min(100, editPreview.progress || 0)}%`,
                  backgroundColor: getProgressColor(editPreview.status)
                }}
              />
            </div>
            <div className="text-xs text-[#F0F9FF]/75">
              {Math.min(100, Math.round(editPreview.progress || 0))}% of goal
            </div>
          </div>
        ) : (
          <div className="text-xs text-[#F0F9FF]/65">Set a goal target to track progress</div>
        )}
      </td>
      <td className="px-4 py-4 align-top">
        <label htmlFor="pm-category-edit-goal-type" className="mb-2 block text-xs font-medium text-[#F0F9FF]/75">
          Goal type
        </label>
        <select
          id="pm-category-edit-goal-type"
          value={targetType}
          onChange={(e) => {
            const v = e.target.value;
            setTargetType(v);
            syncRef({ targetType: v });
          }}
          className="w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        >
          {CATEGORY_GOAL_TYPE_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label htmlFor="pm-category-edit-goal-frequency" className="mb-2 mt-3 block text-xs font-medium text-[#F0F9FF]/75">
          Frequency
        </label>
        <select
          id="pm-category-edit-goal-frequency"
          value={targetFrequency}
          onChange={(e) => {
            const v = e.target.value;
            setTargetFrequency(v);
            syncRef({ targetFrequency: v });
          }}
          className="w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
        >
          {CATEGORY_GOAL_FREQUENCY_OPTIONS.map((opt) => (
            <option key={opt.value} value={opt.value}>
              {opt.label}
            </option>
          ))}
        </select>
        <label htmlFor="pm-category-edit-goal-target" className="mb-2 mt-3 block text-xs font-medium text-[#F0F9FF]/75">
          Goal target ($)
        </label>
        <input
          id="pm-category-edit-goal-target"
          type="text"
          inputMode="decimal"
          autoComplete="off"
          aria-label="Goal target"
          value={targetAmountInput}
          onChange={(e) => {
            const v = e.target.value;
            setTargetAmountInput(v);
            syncRef({ targetAmountInput: v });
          }}
          className="w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
          placeholder="0.00"
        />
        {targetType === 'by_date' && (
          <>
            <label htmlFor="pm-category-edit-target-date" className="mb-2 mt-3 block text-xs font-medium text-[#F0F9FF]/75">
              Target date
            </label>
            <input
              id="pm-category-edit-target-date"
              type="date"
              value={targetDate || ''}
              onChange={(e) => {
                const v = e.target.value;
                setTargetDate(v);
                syncRef({ targetDate: v });
              }}
              className="date-input-dark w-full rounded-3xl border border-white/25 bg-[#0047AB] px-3 py-2 text-sm text-[#F0F9FF] outline-none focus:border-primary-500 focus:ring-2 focus:ring-primary-500/20"
              style={{ colorScheme: 'dark' }}
            />
          </>
        )}
        {error ? <p className="mt-2 text-xs text-rose-300">{error}</p> : null}
        <div className="mt-4 flex flex-wrap gap-2">
          <Button variant="pmPrimary" type="button" onClick={handleSaveClick}>
            Save
          </Button>
          <Button variant="pmSecondary" type="button" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </td>
    </tr>
  );
}
