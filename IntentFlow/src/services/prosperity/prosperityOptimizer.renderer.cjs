// src/services/prosperity/prosperityOptimizer.renderer.cjs
class ProsperityOptimizerRenderer {
    async optimizeProsperityMap(userId, totalIncome) {
        console.log('🎯 ProsperityOptimizer: optimizeProsperityMap called');
        return await window.electronAPI.optimizeProsperityMap(userId, totalIncome);
    }

    // Helper function that doesn't need IPC
    formatCurrency(amount) {
        return new Intl.NumberFormat('en-US', {
            style: 'currency',
            currency: 'USD'
        }).format(amount || 0);
    }

    getPriorityColor(priority) {
        switch(priority) {
            case 1: return '#EF4444';
            case 2: return '#F59E0B';
            case 3: return '#10B981';
            case 4: return '#3B82F6';
            case 5: return '#8B5CF6';
            default: return '#6B7280';
        }
    }

    getPriorityLabel(priority) {
        switch(priority) {
            case 1: return 'Essential';
            case 2: return 'Debt';
            case 3: return 'Savings';
            case 4: return 'Variable';
            case 5: return 'Discretionary';
            default: return 'Other';
        }
    }
}

module.exports = ProsperityOptimizerRenderer;