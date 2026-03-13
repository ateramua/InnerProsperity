import { useEffect } from 'react';

/**
 * Custom hook that automatically syncs goal progress with linked categories
 * @param {Array} goals - Array of goal objects
 * @param {Array} categories - Array of category objects
 * @param {Function} onSync - Callback function to update goal progress
 */
export const useCategoryGoalSync = (goals, categories, onSync) => {
  useEffect(() => {
    // Find all goals linked to categories
    const linkedGoals = goals.filter(g => g.category_id);
    
    linkedGoals.forEach(goal => {
      const category = categories.find(c => c.id === goal.category_id);
      if (category && category.available !== goal.current_amount) {
        // Category available changed, update goal
        console.log(`🔄 Syncing goal "${goal.name}" with category "${category.name}":`, {
          goalCurrent: goal.current_amount,
          categoryAvailable: category.available
        });
        
        // Call the sync callback
        onSync(goal.id, category.available, category);
      }
    });
  }, [categories, goals]); // Re-run when categories or goals change
  
  // Also return a function to manually sync a specific goal
  const syncGoal = (goalId, categoryId, categories, onSyncCallback) => {
    const category = categories.find(c => c.id === categoryId);
    if (!category) return false;
    
    const goal = goals.find(g => g.id === goalId);
    if (!goal) return false;
    
    if (category.available !== goal.current_amount) {
      onSyncCallback(goalId, category.available, category);
      return true;
    }
    return false;
  };
  
  return { syncGoal };
};