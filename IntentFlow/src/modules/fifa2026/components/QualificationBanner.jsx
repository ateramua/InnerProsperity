import { useMemo } from 'react';
import { useTournamentStore } from '../hooks/useTournamentStore';

export default function QualificationBanner({ compact = false }) {
  const { derived } = useTournamentStore();
  const {
    groupStageComplete,
    qualificationSummary,
    completedGroup,
    totalGroup,
  } = derived;
  const { totalQualified } = qualificationSummary;

  const message = useMemo(() => {
    if (groupStageComplete) {
      return `Group stage complete — ${totalQualified} teams qualified for the Round of 32 (top 2 per group + 8 best third-place teams).`;
    }
    return `Live standings — ${totalQualified} teams currently on course for the Round of 32. Third-place slots update as results are entered (${completedGroup}/${totalGroup} group matches played).`;
  }, [groupStageComplete, totalQualified, completedGroup, totalGroup]);

  return (
    <div className={`fifa2026-qual-banner${compact ? ' compact' : ''}`}>
      <span className="fifa2026-qual-banner-icon" aria-hidden="true">
        {groupStageComplete ? '✅' : '📡'}
      </span>
      <p>{message}</p>
    </div>
  );
}
