import React, { useState, useMemo } from 'react';
import TransactionPayeeSelect from './TransactionPayeeSelect.jsx';
import TransferCategoryInlineMessage from './TransferCategoryInlineMessage.jsx';
import {
  buildCategoryByIdMap,
  resolveTransactionCategoryName,
} from '../../utils/categoryDisplayUtils.jsx';
import {
  categorySelectValueForTransaction,
  isIncomeTransaction,
  isReadyToAssignSentinel,
  READY_TO_ASSIGN_CATEGORY_ID,
  READY_TO_ASSIGN_LABEL,
  READY_TO_ASSIGN_VALIDATION_MSG,
  validateReadyToAssignSelection,
} from '../../utils/readyToAssignCategory.jsx';
import { TransactionCategorySelectOptions } from './TransactionCategorySelectOptions.jsx';
import {
  isAccountRoutingPayeeLabel,
  isTransferTransaction,
} from '../../utils/transferPayeeUtils.jsx';

const fieldStyles = {
  select: {
    width: '100%',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #2563EB',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
  },
};

export function InlinePayeeField({
  transaction,
  onSave,
  disabled,
  payees = null,
  payeesLoading = false,
}) {
  const displayPayee = transaction?.payee || transaction?.description || '';

  if (disabled) {
    return <span>{displayPayee || '—'}</span>;
  }

  const handleCommit = async ({ payee, description, picked }) => {
    const payload = {
      payee,
      description: description ?? payee,
      picked,
    };
    if (picked?.isTransfer || isAccountRoutingPayeeLabel(payee)) {
      payload.category_id = null;
      payload.categoryId = null;
    }
    await onSave?.(transaction.id, payload);
  };

  if (!payees) {
    return <span>{displayPayee || '—'}</span>;
  }

  return (
    <TransactionPayeeSelect
      payeeName={displayPayee}
      excludeAccountId={transaction?.account_id}
      payees={payees}
      payeesLoading={payeesLoading}
      alwaysOpen
      disabled={false}
      autoFocus={false}
      onCommit={handleCommit}
    />
  );
}

export function InlineCategoryField({ transaction, categories, onSave, disabled }) {
  const categoryId = transaction?.category_id ?? transaction?.categoryId ?? '';
  const categoryById = useMemo(() => buildCategoryByIdMap(categories), [categories]);
  const [pendingCategoryId, setPendingCategoryId] = useState(null);
  const income = isIncomeTransaction(transaction);
  const suggestedId = transaction?.suggested_category_id;
  const suggestedSource = transaction?.suggested_category_source;
  const suggestedConfidence = Number(transaction?.suggested_category_confidence);
  const suggestedName = suggestedId
    ? isReadyToAssignSentinel(suggestedId)
      ? READY_TO_ASSIGN_LABEL
      : (categories || []).find((c) => String(c.id) === String(suggestedId))?.name
    : null;
  const suggestedPreselect =
    !categoryId && suggestedId && suggestedSource === 'rule';
  const displayCategoryId =
    pendingCategoryId ??
    categorySelectValueForTransaction(transaction) ??
    (suggestedPreselect ? suggestedId : '');
  const resolvedCategoryName = resolveTransactionCategoryName(transaction, categoryById);
  const isMlSuggestion = suggestedSource === 'ml';
  const confidencePct =
    Number.isFinite(suggestedConfidence) && suggestedConfidence > 0
      ? Math.round(suggestedConfidence * 100)
      : null;

  const label =
    transaction?.is_split_parent === 1
      ? 'Split'
      : resolvedCategoryName ||
        (transaction?.is_transfer === 1 ? 'Transfer' : categoryId ? 'Uncategorized' : '—');

  const acceptSuggestion = async (e) => {
    e.stopPropagation();
    if (!suggestedId) return;
    await onSave?.(transaction.id, {
      category_id: suggestedId,
      categoryId: suggestedId,
    });
  };

  const handleChange = async (e) => {
    e.stopPropagation();
    if (isTransferTransaction(transaction)) return;
    const next = e.target.value;
    const validation = validateReadyToAssignSelection(next, {
      isIncome: income,
      isTransfer: isTransferTransaction(transaction),
    });
    if (!validation.ok) {
      alert(validation.message || READY_TO_ASSIGN_VALIDATION_MSG);
      return;
    }
    const apiCategoryId =
      next === ''
        ? null
        : isReadyToAssignSentinel(next)
          ? READY_TO_ASSIGN_CATEGORY_ID
          : next;
    const currentSelect = categorySelectValueForTransaction(transaction);
    if (String(apiCategoryId ?? '') === String(currentSelect ?? '') && next !== '') return;
    if (next === '' && !categoryId && !income) return;
    setPendingCategoryId(next);
    try {
      await onSave?.(transaction.id, {
        category_id: apiCategoryId,
        categoryId: apiCategoryId,
      });
    } finally {
      setPendingCategoryId(null);
    }
  };

  if (isTransferTransaction(transaction)) {
    return <TransferCategoryInlineMessage />;
  }

  if (disabled || transaction?.is_split_parent === 1) {
    return <span>{label}</span>;
  }

  const showSuggestion =
    !categoryId &&
    suggestedId &&
    suggestedName &&
    !isTransferTransaction(transaction) &&
    suggestedSource !== 'rule';

  const showRulePreselectHint =
    suggestedPreselect && suggestedName && !pendingCategoryId;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
      {showRulePreselectHint && (
        <span
          style={{
            fontSize: '0.7rem',
            color: '#C7D2FE',
            fontWeight: 600,
          }}
        >
          {suggestedName} (Suggested)
        </span>
      )}
      {showSuggestion && (
        <button
          type="button"
          onClick={acceptSuggestion}
          style={{
            padding: '0.25rem 0.5rem',
            fontSize: '0.75rem',
            borderRadius: '0.375rem',
            border: isMlSuggestion ? '1px solid #0D9488' : '1px solid #6366F1',
            background: isMlSuggestion
              ? 'rgba(13, 148, 136, 0.18)'
              : 'rgba(99, 102, 241, 0.15)',
            color: isMlSuggestion ? '#99F6E4' : '#C7D2FE',
            cursor: 'pointer',
            textAlign: 'left',
            fontWeight: 600,
          }}
          title={
            isMlSuggestion
              ? `Apply ML recommendation${confidencePct != null ? ` (${confidencePct}% confidence)` : ''}`
              : 'Apply learned payee rule'
          }
        >
          {isMlSuggestion ? 'ML' : 'Rule'}: {suggestedName}
          {confidencePct != null ? ` (${confidencePct}%)` : ''}
        </button>
      )}
      <select
        value={displayCategoryId || ''}
        onChange={handleChange}
        onClick={(e) => e.stopPropagation()}
        style={fieldStyles.select}
        aria-label={
          showRulePreselectHint
            ? `Category — ${suggestedName} suggested from payee history`
            : 'Edit category'
        }
      >
        <TransactionCategorySelectOptions
          categories={categories}
          isIncome={income}
          emptyLabel={income ? null : 'Uncategorized'}
          suggestedId={suggestedPreselect ? suggestedId : null}
          suggestedSource={suggestedSource}
        />
      </select>
    </div>
  );
}
