// src/services/forecast/validationService.cjs
const sqlite3 = require('sqlite3');
const { open } = require('sqlite');
const path = require('path');

class ValidationService {
    constructor(dbPath) {
        this.dbPath = dbPath || path.join(__dirname, '..', '..', 'db', 'data', 'app.db');
    }

    async getDb() {
        return open({
            filename: this.dbPath,
            driver: sqlite3.Database
        });
    }

    // Track forecast vs actual for historical validation
    async trackForecastAccuracy(userId, forecastDate, forecastData, actualData) {
        const db = await this.getDb();
        try {
            // Create forecast_history table if it doesn't exist
            await db.exec(`
                CREATE TABLE IF NOT EXISTS forecast_history (
                    id TEXT PRIMARY KEY,
                    user_id INTEGER NOT NULL,
                    forecast_date DATE NOT NULL,
                    target_date DATE NOT NULL,
                    forecasted_amount REAL NOT NULL,
                    actual_amount REAL NOT NULL,
                    category_id TEXT,
                    accuracy_score REAL,
                    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
                    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
                    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
                )
            `);

            // Calculate accuracy score (percentage of how close forecast was to actual)
            const accuracyScore = this.calculateAccuracy(forecastData, actualData);
            
            // Insert record
            const id = require('uuid').v4();
            await db.run(`
                INSERT INTO forecast_history (
                    id, user_id, forecast_date, target_date, 
                    forecasted_amount, actual_amount, category_id, accuracy_score
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            `, [
                id, userId, forecastDate, actualData.date,
                forecastData, actualData.amount, actualData.category_id, accuracyScore
            ]);

            return { success: true, id, accuracyScore };
        } finally {
            await db.close();
        }
    }

    // Calculate accuracy score (0-100%)
    calculateAccuracy(forecasted, actual) {
        if (actual === 0) return forecasted === 0 ? 100 : 0;
        
        const difference = Math.abs(forecasted - actual);
        const maxDiff = Math.max(Math.abs(forecasted), Math.abs(actual));
        const accuracy = Math.max(0, 100 - ((difference / maxDiff) * 100));
        return Math.min(100, accuracy);
    }

    // Get accuracy trends over time
    async getAccuracyTrends(userId, months = 6) {
        const db = await this.getDb();
        try {
            const startDate = new Date();
            startDate.setMonth(startDate.getMonth() - months);
            
            const trends = await db.all(`
                SELECT 
                    strftime('%Y-%m', target_date) as month,
                    COUNT(*) as predictions_count,
                    AVG(accuracy_score) as avg_accuracy,
                    MIN(accuracy_score) as min_accuracy,
                    MAX(accuracy_score) as max_accuracy,
                    SUM(CASE WHEN accuracy_score >= 90 THEN 1 ELSE 0 END) as excellent_count,
                    SUM(CASE WHEN accuracy_score BETWEEN 70 AND 89 THEN 1 ELSE 0 END) as good_count,
                    SUM(CASE WHEN accuracy_score < 70 THEN 1 ELSE 0 END) as poor_count
                FROM forecast_history
                WHERE user_id = ? AND target_date >= ?
                GROUP BY strftime('%Y-%m', target_date)
                ORDER BY month DESC
            `, [userId, startDate.toISOString().split('T')[0]]);

            return trends;
        } finally {
            await db.close();
        }
    }

    // Get category-specific accuracy
    async getCategoryAccuracy(userId) {
        const db = await this.getDb();
        try {
            const categoryAccuracy = await db.all(`
                SELECT 
                    c.id,
                    c.name as category_name,
                    cg.name as group_name,
                    COUNT(fh.id) as predictions_count,
                    AVG(fh.accuracy_score) as avg_accuracy,
                    MIN(fh.accuracy_score) as min_accuracy,
                    MAX(fh.accuracy_score) as max_accuracy,
                    STDDEV(fh.accuracy_score) as accuracy_volatility
                FROM forecast_history fh
                JOIN categories c ON fh.category_id = c.id
                LEFT JOIN category_groups cg ON c.group_id = cg.id
                WHERE fh.user_id = ?
                GROUP BY c.id, c.name, cg.name
                HAVING COUNT(fh.id) >= 3
                ORDER BY avg_accuracy DESC
            `, [userId]);

            return categoryAccuracy;
        } finally {
            await db.close();
        }
    }

    // Generate confidence score for future predictions
    async calculateConfidenceScore(userId, categoryId = null) {
        const db = await this.getDb();
        try {
            let query = `
                SELECT 
                    AVG(accuracy_score) as historical_accuracy,
                    COUNT(*) as data_points,
                    STDDEV(accuracy_score) as volatility
                FROM forecast_history
                WHERE user_id = ?
            `;
            const params = [userId];

            if (categoryId) {
                query += ` AND category_id = ?`;
                params.push(categoryId);
            }

            const result = await db.get(query, params);
            
            if (!result || result.data_points < 3) {
                return {
                    score: 50, // Default confidence for insufficient data
                    level: 'low',
                    message: 'Insufficient historical data for accurate prediction'
                };
            }

            // Calculate confidence score based on:
            // - Historical accuracy (60% weight)
            // - Data points (20% weight)
            // - Low volatility (20% weight)
            const accuracyScore = result.historical_accuracy || 50;
            const dataPointsScore = Math.min(100, (result.data_points / 12) * 100);
            const volatilityScore = Math.max(0, 100 - (result.volatility || 0));

            const confidenceScore = (
                (accuracyScore * 0.6) +
                (dataPointsScore * 0.2) +
                (volatilityScore * 0.2)
            );

            let level = 'medium';
            if (confidenceScore >= 80) level = 'high';
            else if (confidenceScore < 50) level = 'low';

            return {
                score: Math.round(confidenceScore),
                level,
                dataPoints: result.data_points,
                historicalAccuracy: Math.round(accuracyScore),
                message: this.getConfidenceMessage(level, result.data_points)
            };
        } finally {
            await db.close();
        }
    }

    getConfidenceMessage(level, dataPoints) {
        switch(level) {
            case 'high':
                return 'High confidence based on consistent historical data';
            case 'medium':
                return 'Moderate confidence - consider reviewing recent trends';
            case 'low':
                return 'Low confidence due to limited or volatile data';
            default:
                return 'Insufficient data for reliable prediction';
        }
    }

    // Get forecast accuracy summary
    async getAccuracySummary(userId) {
        const db = await this.getDb();
        try {
            const summary = await db.get(`
                SELECT 
                    COUNT(*) as total_predictions,
                    AVG(accuracy_score) as overall_accuracy,
                    MIN(accuracy_score) as worst_accuracy,
                    MAX(accuracy_score) as best_accuracy,
                    SUM(CASE WHEN accuracy_score >= 90 THEN 1 ELSE 0 END) as excellent_predictions,
                    SUM(CASE WHEN accuracy_score < 50 THEN 1 ELSE 0 END) as poor_predictions
                FROM forecast_history
                WHERE user_id = ?
            `, [userId]);

            return summary;
        } finally {
            await db.close();
        }
    }

    // Compare multiple forecasting methods
    async compareForecastMethods(userId, methods = ['average', 'trend', 'seasonal']) {
        // This would compare different forecasting algorithms
        // For now, return placeholder
        return {
            bestMethod: 'average',
            methodScores: {
                average: 85,
                trend: 78,
                seasonal: 82
            }
        };
    }

    // Identify patterns in forecast errors
    async analyzeErrorPatterns(userId) {
        const db = await this.getDb();
        try {
            const errors = await db.all(`
                SELECT 
                    strftime('%m', target_date) as month,
                    strftime('%w', target_date) as day_of_week,
                    CASE 
                        WHEN forecasted_amount > actual_amount THEN 'over_estimate'
                        WHEN forecasted_amount < actual_amount THEN 'under_estimate'
                        ELSE 'exact'
                    END as error_type,
                    ABS(forecasted_amount - actual_amount) as error_magnitude,
                    (ABS(forecasted_amount - actual_amount) / NULLIF(actual_amount, 0)) * 100 as error_percentage
                FROM forecast_history
                WHERE user_id = ? AND actual_amount > 0
            `, [userId]);

            // Analyze patterns
            const patterns = {
                monthly: {},
                weekly: {},
                bias: { over: 0, under: 0, exact: 0 },
                averageError: 0,
                worstMonth: null,
                bestMonth: null
            };

            if (errors.length === 0) return patterns;

            let totalError = 0;
            const monthErrors = {};

            errors.forEach(error => {
                // Track bias
                patterns.bias[error.error_type] = (patterns.bias[error.error_type] || 0) + 1;
                
                // Track monthly errors
                if (!monthErrors[error.month]) {
                    monthErrors[error.month] = { total: 0, count: 0 };
                }
                monthErrors[error.month].total += error.error_percentage;
                monthErrors[error.month].count++;
                
                totalError += error.error_percentage;
            });

            // Calculate averages
            patterns.averageError = totalError / errors.length;

            // Find best/worst months
            let maxError = 0;
            let minError = Infinity;
            
            Object.entries(monthErrors).forEach(([month, data]) => {
                const avgMonthError = data.total / data.count;
                if (avgMonthError > maxError) {
                    maxError = avgMonthError;
                    patterns.worstMonth = month;
                }
                if (avgMonthError < minError) {
                    minError = avgMonthError;
                    patterns.bestMonth = month;
                }
            });

            return patterns;
        } finally {
            await db.close();
        }
    }
}

module.exports = ValidationService;