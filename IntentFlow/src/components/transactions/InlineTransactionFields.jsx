import React, { useState, useEffect, useRef } from 'react';

const fieldStyles = {
  input: {
    width: '100%',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #2563EB',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
    boxSizing: 'border-box',
  },
  select: {
    width: '100%',
    padding: '0.35rem 0.5rem',
    borderRadius: '0.375rem',
    border: '1px solid #2563EB',
    background: '#111827',
    color: '#F3F4F6',
    fontSize: '0.875rem',
  },
  display: {
    cursor: 'text',
    borderBottom: '1px dashed transparent',
  },
  displayHover: {
    borderBottomColor: '#475569',
  },
};

export function InlinePayeeField({ transaction, onSave, disabled }) {
  const [editing, setEditing] = useState(false);
  const [value, setValue] = useState(transaction?.payee || transaction?.description || '');
  const inputRef = useRef(null);

  useEffect(() => {
    setValue(transaction?.payee || transaction?.description || '');
  }, [transaction?.payee, transaction?.description, transaction?.id]);

  useEffect(() => {
    if (editing && inputRef.current) inputRef.current.focus();
  }, [editing]);

  const commit = async () => {
    setEditing(false);
    const trimmed = value.trim();
    const current = (transaction?.payee || transaction?.description || '').trim();
    if (!trimmed || trimmed === current) return;
    await onSave?.(transaction.id, {
      payee: trimmed,
      description: trimmed,
    });
  };

  if (disabled) {
    return <span>{value || '—'}</span>;
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={commit}
        onKeyDown={(e) => {
          if (e.key === 'Enter') e.currentTarget.blur();
          if (e.key === 'Escape') {
            setValue(transaction?.payee || transaction?.description || '');
            setEditing(false);
          }
        }}
        onClick={(e) => e.stopPropagation()}
        style={fieldStyles.input}
        aria-label="Edit payee"
      />
    );
  }

  return (
    <span
      role="button"
      tabIndex={0}
      title="Click to edit payee"
      style={fieldStyles.display}
      onClick={(e) => {
        e.stopPropagation();
        setEditing(true);
      }}
      onKeyDown={(e) => {
        if (e.key === 'Enter') {
          e.stopPropagation();
          setEditing(true);
        }
      }}
    >
      {value || '—'}
    </span>
  );
}

export function InlineCategoryField({ transaction, categories, onSave, disabled }) {
  const categoryId = transaction?.category_id ?? '';
  const label =
    transaction?.categoryName ||
    (categories || []).find((c) => String(c.id) === String(categoryId))?.name ||
    (transaction?.is_transfer === 1 ? 'Transfer' : categoryId ? 'Uncategorized' : '—');

  const handleChange = async (e) => {
    e.stopPropagation();
    const next = e.target.value;
    if (String(next) === String(categoryId)) return;
    await onSave?.(transaction.id, {
      category_id: next === '' || next === 'ready_to_assign' ? null : next,
      categoryId: next === '' || next === 'ready_to_assign' ? null : next,
    });
  };

  if (disabled) {
    return <span>{label}</span>;
  }

  return (
    <select
      value={categoryId || ''}
      onChange={handleChange}
      onClick={(e) => e.stopPropagation()}
      style={fieldStyles.select}
      aria-label="Edit category"
    >
      <option value="">Uncategorized</option>
      <option value="ready_to_assign">Ready to Assign</option>
      {(categories || []).map((cat) => (
        <option key={cat.id} value={cat.id}>
          {cat.name}
        </option>
      ))}
    </select>
  );
}
