// src/services/forecast/forecastService.renderer.cjs
class ForecastServiceRenderer {
  async generateForecast(userId, options) {
    console.log('📊 Forecast: generateForecast called');
    return await window.electronAPI.generateForecast(userId, options);
  }

  async getDailyForecast(userId) {
    console.log('📊 Forecast: getDailyForecast called');
    return await window.electronAPI.getDailyForecast(userId);
  }

  async getWeeklyForecast(userId, weeks) {
    console.log('📊 Forecast: getWeeklyForecast called');
    return await window.electronAPI.getWeeklyForecast(userId, weeks);
  }

  async getYearlyForecast(userId, years) {
    console.log('📊 Forecast: getYearlyForecast called');
    return await window.electronAPI.getYearlyForecast(userId, years);
  }

  async getRecommendations(userId) {
    console.log('📊 Forecast: getRecommendations called');
    return await window.electronAPI.getRecommendations(userId);
  }
}

module.exports = ForecastServiceRenderer;