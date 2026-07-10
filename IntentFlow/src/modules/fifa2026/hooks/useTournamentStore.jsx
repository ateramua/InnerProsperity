import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { MATCH_STATUS } from '../config';
import { buildQualificationSnapshot } from '../engine/qualification';
import { computeOverallRankings } from '../engine/rankings';
import { groupKnockoutByRound, computeChampionPath, buildMatchIndex } from '../engine/knockout';
import { computeTournamentStats } from '../engine/stats';
import { applyMatchResult, applyKnockoutResult, recalculateTournament } from '../engine/recalculate';
import { pickKnockoutResultOverride, validateKnockoutResultInput } from '../engine/knockoutResolution';
import { loadTournamentState, resetTournamentState, saveTournamentState } from '../services/persistence';

const TournamentContext = createContext(null);

const ACTIONS = {
  HYDRATE: 'HYDRATE',
  SET_RESULT: 'SET_RESULT',
  RESET: 'RESET',
  SET_TAB: 'SET_TAB',
};

function reducer(state, action) {
  switch (action.type) {
    case ACTIONS.HYDRATE:
      return action.payload;
    case ACTIONS.SET_TAB: {
      const nextTabState = { ...state, activeTab: action.tab };
      saveTournamentState(nextTabState);
      return nextTabState;
    }
    case ACTIONS.RESET:
      return { ...action.payload, activeTab: state.activeTab };
    case ACTIONS.SET_RESULT: {
      const { matchId, homeScore, awayScore, phase, knockoutResult } = action;
      const overrides = { ...state.resultOverrides };
      const base = phase === 'knockout'
        ? state.knockoutMatches.find((m) => m.id === matchId)
        : state.fixtures.find((m) => m.id === matchId);

      if (!base) return state;

      try {
        if (phase === 'knockout' && knockoutResult) {
          const validation = validateKnockoutResultInput(knockoutResult);
          if (!validation.ok) return state;

          overrides[matchId] = pickKnockoutResultOverride(applyKnockoutResult(base, knockoutResult));
        } else {
          overrides[matchId] = applyMatchResult(base, homeScore, awayScore);
        }

        const next = recalculateTournament({ ...state, resultOverrides: overrides });
        saveTournamentState(next);
        return next;
      } catch {
        return state;
      }
    }
    default:
      return state;
  }
}

export function TournamentProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, () => {
    const loaded = loadTournamentState();
    return { ...loaded, activeTab: loaded.activeTab || 'standings' };
  });

  useEffect(() => {
    const loaded = loadTournamentState();
    dispatch({ type: ACTIONS.HYDRATE, payload: { ...loaded, activeTab: loaded.activeTab || 'standings' } });
  }, []);

  const setActiveTab = useCallback((tab) => {
    dispatch({ type: ACTIONS.SET_TAB, tab });
  }, []);

  const submitResult = useCallback((matchId, homeScore, awayScore, phase = 'group', knockoutResult = null) => {
    if (phase === 'knockout' && knockoutResult) {
      const validation = validateKnockoutResultInput(knockoutResult);
      if (!validation.ok) {
        return { error: validation.message };
      }

      const base = state.knockoutMatches.find((m) => m.id === matchId);
      if (!base) {
        return { error: 'Match not found.' };
      }

      try {
        applyKnockoutResult(base, knockoutResult);
      } catch (err) {
        return { error: err.message || 'Could not save knockout result.' };
      }
    }

    try {
      dispatch({ type: ACTIONS.SET_RESULT, matchId, homeScore, awayScore, phase, knockoutResult });
      return { error: null };
    } catch (err) {
      return { error: err.message || 'Could not save result.' };
    }
  }, [state.knockoutMatches]);

  const resetTournament = useCallback(() => {
    const fresh = resetTournamentState();
    dispatch({ type: ACTIONS.RESET, payload: { ...fresh, activeTab: state.activeTab } });
  }, [state.activeTab]);

  const derived = useMemo(() => {
    const qualification = buildQualificationSnapshot(state.groups, state.fixtures);
    const groupStandings = qualification.groupStandings;
    const overallRankings = computeOverallRankings(state.groups, state.fixtures, qualification);
    const knockoutByRound = groupKnockoutByRound(state.knockoutMatches);
    const r32Matches = state.knockoutMatches.filter((m) => m.roundId === 'r32');
    const r32Ready = r32Matches.filter(
      (m) => m.homeTeamId !== 'TBD' && m.awayTeamId !== 'TBD',
    ).length;
    const completedGroup = state.fixtures.filter((f) => f.status === MATCH_STATUS.COMPLETED).length;
    const totalGroup = state.fixtures.length;
    const stats = computeTournamentStats(state);
    const matchIndex = buildMatchIndex(state.knockoutMatches);
    const championPath = computeChampionPath(state.knockoutMatches, stats.champion);

    return {
      groupStandings,
      bestThirdPlace: qualification.bestThirdPlace,
      qualificationSummary: qualification.summary,
      groupStageComplete: qualification.groupStageComplete,
      overallRankings,
      knockoutByRound,
      matchIndex,
      championPath,
      stats,
      progress: Math.round((completedGroup / totalGroup) * 100),
      completedGroup,
      totalGroup,
      r32Ready,
      r32Total: r32Matches.length,
    };
  }, [state]);

  const value = useMemo(() => ({
    state,
    derived,
    setActiveTab,
    submitResult,
    resetTournament,
  }), [state, derived, setActiveTab, submitResult, resetTournament]);

  return (
    <TournamentContext.Provider value={value}>
      {children}
    </TournamentContext.Provider>
  );
}

export function useTournamentStore() {
  const ctx = useContext(TournamentContext);
  if (!ctx) throw new Error('useTournamentStore must be used within TournamentProvider');
  return ctx;
}
