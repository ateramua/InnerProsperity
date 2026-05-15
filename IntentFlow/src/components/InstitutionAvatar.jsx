import React from 'react';

const COLORS = [
  '#0047AB',
  '#0D9488',
  '#7C3AED',
  '#DC2626',
  '#D97706',
  '#2563EB',
];

function hashInstitution(name) {
  let h = 0;
  const s = String(name || '?');
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** Initials badge for institution grouping (logos deferred). */
const InstitutionAvatar = ({ institution, size = 36, style = {} }) => {
  const label = (institution || 'Bank').trim() || 'Bank';
  const words = label.split(/\s+/).filter(Boolean);
  const initials =
    words.length >= 2
      ? `${words[0][0]}${words[1][0]}`.toUpperCase()
      : label.slice(0, 2).toUpperCase();
  const bg = COLORS[hashInstitution(label) % COLORS.length];

  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: size,
        height: size,
        borderRadius: '10px',
        background: bg,
        color: '#fff',
        fontSize: size * 0.36,
        fontWeight: 700,
        flexShrink: 0,
        ...style,
      }}
    >
      {initials}
    </span>
  );
};

export default InstitutionAvatar;
