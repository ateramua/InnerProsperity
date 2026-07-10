import React from 'react';

/** Shown on accounts that exist in the DB but are disconnected / deactivated (is_active = 0). */
export default function InactiveAccountBadge({ account, style = {} }) {
  const inactive = account?.is_active === 0 || account?.is_active === false;
  if (!inactive) return null;
  return (
    <span
      title="This account is disconnected or deactivated but still in your register"
      style={{
        marginLeft: '0.35rem',
        padding: '0.1rem 0.4rem',
        borderRadius: '0.25rem',
        fontSize: '0.65rem',
        fontWeight: 700,
        letterSpacing: '0.03em',
        textTransform: 'uppercase',
        background: 'rgba(148, 163, 184, 0.2)',
        color: '#94A3B8',
        verticalAlign: 'middle',
        ...style,
      }}
    >
      Inactive
    </span>
  );
}
