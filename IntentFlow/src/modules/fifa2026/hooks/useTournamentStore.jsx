import React, { createContext, useCallback, useContext, useEffect, useMemo, useReducer } from 'react';
import { MATCH_STATUS } from '../config';
import { computeAllGroupStandings } from '../engine/standings';
import { computeOverallRankings } from '../engine/rankings';
import { groupKnockoutByRound } from '../engine/knockout';
import { computeTournamentStats } from '../engine/stats';
import { applyMatchResult, recalculateTournament } from '../engine/recalculate';
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
      const { matchId, homeScore, awayScore, phase } = action;
      const overrides = { ...state.resultOverrides };
      const base = phase === 'knockout'
        ? state.knockoutMatches.find((m) => m.id === matchId)
        : state.fixtures.find((m) => m.id === matchId);

      if (!base) return state;

      overrides[matchId] = applyMatchResult(base, homeScore, awayScore);
      const next = recalculateTournament({ ...state, resultOverrides: overrides });
      saveTournamentState(next);
      return next;
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

  const submitResult = useCallback((matchId, homeScore, awayScore, phase = 'group') => {
    dispatch({ type: ACTIONS.SET_RESULT, matchId, homeScore, awayScore, phase });
  }, []);

  const resetTournament = useCallback(() => {
    const fresh = resetTournamentState();
    dispatch({ type: ACTIONS.RESET, payload: { ...fresh, activeTab: state.activeTab } });
  }, [state.activeTab]);

  const derived = useMemo(() => {
    const groupStandings = computeAllGroupStandings(state.groups, state.fixtures);
    const overallRankings = computeOverallRankings(state.groups, state.fixtures);
    const knockoutByRound = groupKnockoutByRound(state.knockoutMatches);
    const completedGroup = state.fixtures.filter((f) => f.status === MATCH_STATUS.COMPLETED).length;
    const totalGroup = state.fixtures.length;
    const stats = computeTournamentStats(state);

    return {
      groupStandings,
      overallRankings,
      knockoutByRound,
      stats,
      progress: Math.round((completedGroup / totalGroup) * 100),
      completedGroup,
      totalGroup,
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
