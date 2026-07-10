import { QUALIFICATION_STATUS } from '../engine/qualification';

const BADGE_CONFIG = {
  [QUALIFICATION_STATUS.QUALIFIED]: {
    label: 'Qualified',
    icon: '🟢',
    className: 'qualified',
  },
  [QUALIFICATION_STATUS.CONDITIONAL]: {
    label: 'Best 3rd candidate',
    icon: '🟡',
    className: 'conditional',
  },
  [QUALIFICATION_STATUS.ELIMINATED]: {
    label: 'Eliminated',
    icon: '🔴',
    className: 'eliminated',
  },
};

export default function QualificationBadge({ status, compact = false }) {
  const config = BADGE_CONFIG[status];
  if (!config) return null;

  return (
    <span className={`fifa2026-qual-badge ${config.className}${compact ? ' compact' : ''}`}>
      <span aria-hidden="true">{config.icon}</span>
      {!compact && <span>{config.label}</span>}
    </span>
  );
}
