import { useMemo, useState } from 'react';
import {
  SEED_ROLES,
  THIRD_PLACE_TIEBREAKERS,
  countSlotsByRole,
  getR32TemplateRows,
  getThirdPlaceAllocationSlots,
  parseSeedToken,
} from '../data/r32BracketTemplate';
import { useTournamentStore } from '../hooks/useTournamentStore';
import TeamBadge from './TeamBadge';

const FLOW_STEPS = [
  { id: 1, title: 'Group stage ends', detail: 'All 72 group matches are played and final group tables are set.' },
  { id: 2, title: 'Teams ranked in groups', detail: 'Each group produces a winner, runner-up, third, and fourth place.' },
  { id: 3, title: 'Assigned to bracket slots', detail: 'Teams drop into pre-defined R32 positions — no new draw.' },
  { id: 4, title: 'Knockout stage begins', detail: 'Round of 32 fixtures are already fixed; only the team names change.' },
];

function RoleChip({ roleKey, active, onSelect }) {
  const role = SEED_ROLES[roleKey];
  return (
    <button
      type="button"
      className={`fifa2026-ko-role-chip ${role.className}${active ? ' active' : ''}`}
      onClick={() => onSelect(roleKey)}
      aria-pressed={active}
    >
      <span className="fifa2026-ko-role-chip-label">{role.label}</span>
      <span className="fifa2026-meta">{role.shortLabel}</span>
    </button>
  );
}

function SeedCell({ token, teamId, assignedThirdRank }) {
  const parsed = parseSeedToken(token);
  const role = SEED_ROLES[parsed.role] ?? null;

  return (
    <div className={`fifa2026-ko-seed-cell ${role?.className ?? ''}`}>
      <code className="fifa2026-ko-token">{token}</code>
      <span className="fifa2026-meta">{parsed.label}</span>
      {teamId && teamId !== 'TBD' ? (
        <TeamBadge teamId={teamId} compact />
      ) : (
        <span className="fifa2026-ko-tbd">TBD</span>
      )}
      {assignedThirdRank != null && (
        <span className="fifa2026-meta">Best 3rd #{assignedThirdRank}</span>
      )}
    </div>
  );
}

export default function KnockoutMatchupGuide() {
  const { derived } = useTournamentStore();
  const { knockoutByRound, bestThirdPlace, groupStageComplete } = derived;
  const [activeRole, setActiveRole] = useState('winner');

  const r32Matches = knockoutByRound.r32 ?? [];
  const templateRows = useMemo(() => getR32TemplateRows(), []);
  const thirdSlots = useMemo(() => getThirdPlaceAllocationSlots(), []);
  const slotCounts = useMemo(() => countSlotsByRole(), []);

  const thirdRankByTeam = useMemo(
    () => Object.fromEntries(bestThirdPlace.map((row) => [row.teamId, row.thirdPlaceRank])),
    [bestThirdPlace],
  );

  const liveRows = useMemo(() => {
    const bySlot = Object.fromEntries(r32Matches.map((m) => [m.slot, m]));
    return templateRows.map((row) => {
      const match = bySlot[row.slot];
      return {
        ...row,
        matchLabel: match?.label ?? `R32-${row.slot}`,
        homeTeamId: match?.homeTeamId ?? 'TBD',
        awayTeamId: match?.awayTeamId ?? 'TBD',
        homeThirdRank: match?.homeTeamId && match.homeTeamId !== 'TBD'
          ? thirdRankByTeam[match.homeTeamId] ?? null
          : null,
        awayThirdRank: match?.awayTeamId && match.awayTeamId !== 'TBD'
          ? thirdRankByTeam[match.awayTeamId] ?? null
          : null,
      };
    });
  }, [templateRows, r32Matches, thirdRankByTeam]);

  const activeRoleInfo = SEED_ROLES[activeRole];

  return (
    <div className="fifa2026-ko-guide">
      <header className="fifa2026-ko-guide-header">
        <h2 className="fifa2026-ko-guide-title">How the Matchups Are Determined</h2>
        <p className="fifa2026-meta">
          FIFA World Cup 2026 uses a fixed knockout bracket published before the tournament.
          Your live group results populate these slots automatically — there is no second draw.
        </p>
      </header>

      <section className="fifa2026-glass fifa2026-ko-guide-section">
        <h3>Overview</h3>
        <p>
          Thirty-two teams reach the Round of 32: the top two from each of the twelve groups,
          plus the eight best third-place teams. Every knockout tie is pre-assigned to specific
          group finishing positions. Once the group stage ends, teams simply fill their
          predetermined slots.
        </p>
      </section>

      <section className="fifa2026-glass fifa2026-ko-guide-section fifa2026-ko-highlight">
        <h3>No Second Draw</h3>
        <ul className="fifa2026-ko-list">
          <li>There is <strong>no redraw</strong> after the group stage.</li>
          <li>The full knockout path is fixed when the tournament bracket is published.</li>
          <li>Only the <em>names</em> of teams change — the fixture structure never does.</li>
        </ul>
      </section>

      <section className="fifa2026-glass fifa2026-ko-guide-section">
        <h3>Pre-Determined Bracket</h3>
        <p>
          Each Round of 32 slot is tied to a group position code such as <code>1A</code> (Winner Group A),
          <code>2B</code> (Runner-up Group B), or <code>3ABCDF</code> (best qualifying third-place team
          from groups A, B, C, D, or F). The table below shows all 16 R32 fixtures with
          {groupStageComplete ? ' final assignments from your results.' : ' live provisional assignments as you enter scores.'}
        </p>

        <div className="fifa2026-ko-table-wrap">
          <table className="fifa2026-table fifa2026-ko-mapping-table">
            <thead>
              <tr>
                <th>#</th>
                <th>Match</th>
                <th>Home slot</th>
                <th>Away slot</th>
                <th>Live matchup</th>
              </tr>
            </thead>
            <tbody>
              {liveRows.map((row) => (
                <tr key={row.slot}>
                  <td>{row.slot}</td>
                  <td>{row.matchLabel}</td>
                  <td>
                    <SeedCell
                      token={row.homeToken}
                      teamId={row.homeTeamId}
                      assignedThirdRank={row.homeThirdRank}
                    />
                  </td>
                  <td>
                    <SeedCell
                      token={row.awayToken}
                      teamId={row.awayTeamId}
                      assignedThirdRank={row.awayThirdRank}
                    />
                  </td>
                  <td className="fifa2026-ko-live-matchup">
                    <TeamBadge teamId={row.homeTeamId} compact />
                    <span className="fifa2026-ko-vs">vs</span>
                    <TeamBadge teamId={row.awayTeamId} compact />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="fifa2026-glass fifa2026-ko-guide-section">
        <h3>Group Position Rules</h3>
        <p className="fifa2026-meta" style={{ marginBottom: '0.75rem' }}>
          Click a role to see how that finishing position maps into the bracket.
        </p>

        <div className="fifa2026-ko-role-chips">
          {Object.keys(SEED_ROLES).map((key) => (
            <RoleChip
              key={key}
              roleKey={key}
              active={activeRole === key}
              onSelect={setActiveRole}
            />
          ))}
        </div>

        <div className={`fifa2026-ko-role-detail ${activeRoleInfo.className}`}>
          <h4>{activeRoleInfo.label}</h4>
          <p>{activeRoleInfo.description}</p>
          <p className="fifa2026-meta">{activeRoleInfo.bracketNote}</p>
        </div>

        <div className="fifa2026-ko-bracket-diagram">
          <div className="fifa2026-ko-diagram-col winner">
            <span className="fifa2026-ko-diagram-title">Group winners</span>
            <span className="fifa2026-ko-diagram-count">{slotCounts.winner} R32 slots</span>
            <span className="fifa2026-meta">Codes: 1A … 1L</span>
            <span className="fifa2026-meta">Higher-seeded paths · often vs 3rd or 2nd</span>
          </div>
          <div className="fifa2026-ko-diagram-arrow" aria-hidden>→</div>
          <div className="fifa2026-ko-diagram-col runner-up">
            <span className="fifa2026-ko-diagram-title">Runners-up</span>
            <span className="fifa2026-ko-diagram-count">{slotCounts.runnerUp} R32 slots</span>
            <span className="fifa2026-meta">Codes: 2A … 2L</span>
            <span className="fifa2026-meta">Predefined runner-up fixtures</span>
          </div>
          <div className="fifa2026-ko-diagram-arrow" aria-hidden>→</div>
          <div className="fifa2026-ko-diagram-col third-place">
            <span className="fifa2026-ko-diagram-title">Best third-place</span>
            <span className="fifa2026-ko-diagram-count">{slotCounts.thirdPlace} R32 slots</span>
            <span className="fifa2026-meta">8 teams qualify globally</span>
            <span className="fifa2026-meta">Matrix assigns eligible groups per slot</span>
          </div>
        </div>
      </section>

      <section className="fifa2026-glass fifa2026-ko-guide-section">
        <h3>Third-Place Allocation</h3>
        <p>
          Twelve third-place teams are ranked across all groups. The top eight advance and are placed
          into fixed R32 slots using FIFA&apos;s third-place allocation matrix — each slot lists which
          groups may supply that team. Assignment uses the data-driven allocation matrix keyed by
          which groups produced qualifiers — each team is placed by its group, not its global ranking.
        </p>

        <ol className="fifa2026-ko-tiebreak-list">
          {THIRD_PLACE_TIEBREAKERS.map((rule) => (
            <li key={rule}>{rule}</li>
          ))}
        </ol>

        <div className="fifa2026-ko-table-wrap">
          <table className="fifa2026-table fifa2026-ko-third-matrix">
            <thead>
              <tr>
                <th>R32</th>
                <th>Third-place slot</th>
                <th>Eligible groups</th>
                <th>Plays</th>
                <th>Assigned team</th>
              </tr>
            </thead>
            <tbody>
              {thirdSlots.map((slot, index) => {
                const match = r32Matches.find((m) => m.slot === slot.slot);
                const teamId = match?.[`${slot.side}TeamId`] ?? 'TBD';
                return (
                  <tr key={`${slot.slot}-${slot.side}`}>
                    <td>{slot.slot}</td>
                    <td><code>{slot.token}</code></td>
                    <td>{slot.eligibleGroups.join(', ')}</td>
                    <td className="fifa2026-meta">{slot.opponentLabel}</td>
                    <td>
                      {teamId !== 'TBD' ? (
                        <>
                          <TeamBadge teamId={teamId} compact />
                          {thirdRankByTeam[teamId] != null && (
                            <span className="fifa2026-meta"> · #{thirdRankByTeam[teamId]} best 3rd</span>
                          )}
                        </>
                      ) : (
                        <span className="fifa2026-ko-tbd">Awaiting results</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {bestThirdPlace.length > 0 && (
          <div className="fifa2026-ko-third-ranking">
            <h4>Current best-third ranking</h4>
            <div className="fifa2026-ko-third-ranking-grid">
              {bestThirdPlace.map((row) => (
                <div
                  key={row.teamId}
                  className={`fifa2026-ko-third-rank-item${row.qualifies ? ' qualifies' : ''}`}
                >
                  <span className="fifa2026-ko-third-rank-num">#{row.thirdPlaceRank}</span>
                  <TeamBadge teamId={row.teamId} compact />
                  <span className="fifa2026-meta">Grp {row.groupId}</span>
                  <span className="fifa2026-meta">{row.points} pts</span>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      <section className="fifa2026-glass fifa2026-ko-guide-section">
        <h3>How teams reach the knockout stage</h3>
        <div className="fifa2026-ko-flow">
          {FLOW_STEPS.map((step, index) => (
            <div key={step.id} className="fifa2026-ko-flow-step-wrap">
              <div className="fifa2026-ko-flow-step">
                <span className="fifa2026-ko-flow-num">{step.id}</span>
                <strong>{step.title}</strong>
                <p className="fifa2026-meta">{step.detail}</p>
              </div>
              {index < FLOW_STEPS.length - 1 && (
                <span className="fifa2026-ko-flow-arrow" aria-hidden>→</span>
              )}
            </div>
          ))}
        </div>
      </section>
    </div>
  );
}
