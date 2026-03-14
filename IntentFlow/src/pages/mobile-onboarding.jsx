// src/pages/mobile-onboarding.jsx
import React, { useState } from 'react';
import { useRouter } from 'next/router';
import { useAuth } from '../contexts/AuthContext';
import { Preferences } from '@capacitor/preferences';  // ← THIS MUST BE AT THE TOP
  // In mobile-onboarding.jsx or a debug page
import MobileDatabase from '../services/mobileDatabase';

export default function MobileOnboarding() {
  const [step, setStep] = useState(0);
  const [userData, setUserData] = useState({
    name: '',
    email: '',
    monthlyIncome: '',
    payDay: '15',
    currency: 'USD',
    goals: []
  });
  const router = useRouter();
  const { user, updateUser } = useAuth();

  const steps = [
    {
      title: '👋 Welcome to IntentFlow',
      description: 'Take control of your finances with intelligent budgeting and forecasting.',
      image: '🚀',
      color: '#3B82F6'
    },
    {
      title: '📊 Track Your Spending',
      description: 'Connect your accounts and automatically categorize transactions.',
      image: '📈',
      color: '#10B981'
    },
    {
      title: '🎯 Set Financial Goals',
      description: 'Create savings goals, track debt payoff, and plan for the future.',
      image: '🎯',
      color: '#F59E0B'
    },
    {
      title: '🤖 Smart Insights',
      description: 'Get personalized recommendations to optimize your finances.',
      image: '💡',
      color: '#8B5CF6'
    },
    {
      title: 'Let\'s Get Started!',
      description: 'Tell us a bit about yourself to personalize your experience.',
      image: '✨',
      color: '#EC4899'
    }
  ];

  const handleNext = () => {
    if (step < steps.length - 1) {
      setStep(step + 1);
    } else {
      completeOnboarding();
    }
  };

  const handleSkip = () => {
    setStep(steps.length - 1);
  };

  const handleBack = () => {
    if (step > 0) {
      setStep(step - 1);
    } else {
      router.push('/mobile-login');
    }
  };



const setupTestData = async () => {
  // Create user
  await MobileDatabase.createUser({
    username: 'test',
    email: 'test@example.com',
    fullName: 'Test User'
  });
  
  // Create accounts
  await MobileDatabase.createAccount({
    user_id: 1,
    name: 'Checking',
    type: 'checking',
    balance: 3450.89,
    institution: 'Chase'
  });
  
  console.log('✅ Test data created');
};

  const completeOnboarding = async () => {
    try {
      await Preferences.set({ key: 'onboardingCompleted', value: 'true' });
      
      await Preferences.set({
        key: 'userPreferences',
        value: JSON.stringify({
          currency: userData.currency,
          payDay: userData.payDay,
          goals: userData.goals
        })
      });

      router.push('/mobile-home');
    } catch (error) {
      console.error('Error completing onboarding:', error);
    }
  };

  const toggleGoal = (goal) => {
    setUserData(prev => ({
      ...prev,
      goals: prev.goals.includes(goal)
        ? prev.goals.filter(g => g !== goal)
        : [...prev.goals, goal]
    }));
  };

  const progress = ((step + 1) / steps.length) * 100;

  const commonGoals = [
    { id: 'emergency', label: 'Emergency Fund', icon: '🚨' },
    { id: 'debt', label: 'Pay off Debt', icon: '💰' },
    { id: 'house', label: 'Buy a House', icon: '🏠' },
    { id: 'car', label: 'Buy a Car', icon: '🚗' },
    { id: 'vacation', label: 'Vacation', icon: '✈️' },
    { id: 'retirement', label: 'Retirement', icon: '👴' },
    { id: 'education', label: 'Education', icon: '📚' },
    { id: 'wedding', label: 'Wedding', icon: '💒' }
  ];

  return (
    <div style={styles.container}>
      <div style={styles.progressBar}>
        <div style={{
          ...styles.progressFill,
          width: `${progress}%`,
          backgroundColor: steps[step].color
        }} />
      </div>

      {step < steps.length - 1 && (
        <button style={styles.skipButton} onClick={handleSkip}>
          Skip
        </button>
      )}

      <div style={styles.content}>
        {step < steps.length - 1 ? (
          <div style={styles.splashContainer}>
            <div style={{
              ...styles.splashIcon,
              backgroundColor: steps[step].color + '20',
              color: steps[step].color
            }}>
              <span style={styles.splashImage}>{steps[step].image}</span>
            </div>
            <h1 style={styles.splashTitle}>{steps[step].title}</h1>
            <p style={styles.splashDescription}>{steps[step].description}</p>
            
            <div style={styles.indicators}>
              {steps.slice(0, -1).map((_, index) => (
                <div key={index} style={{
                  ...styles.indicator,
                  backgroundColor: index === step ? steps[step].color : '#374151'
                }} />
              ))}
            </div>
          </div>
        ) : (
          <div style={styles.formContainer}>
            <h2 style={styles.formTitle}>Tell us about yourself</h2>
            <p style={styles.formSubtitle}>This helps us personalize your experience</p>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Your Name *</label>
              <input
                type="text"
                value={userData.name}
                onChange={(e) => setUserData({...userData, name: e.target.value})}
                placeholder="e.g., John Doe"
                style={styles.input}
                autoFocus
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Email Address</label>
              <input
                type="email"
                value={userData.email}
                onChange={(e) => setUserData({...userData, email: e.target.value})}
                placeholder="you@example.com"
                style={styles.input}
              />
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Monthly Income *</label>
              <div style={styles.amountInput}>
                <span style={styles.currencySymbol}>$</span>
                <input
                  type="number"
                  value={userData.monthlyIncome}
                  onChange={(e) => setUserData({...userData, monthlyIncome: e.target.value})}
                  placeholder="5000"
                  step="100"
                  min="0"
                  style={styles.amountField}
                />
              </div>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Pay Day</label>
              <select
                value={userData.payDay}
                onChange={(e) => setUserData({...userData, payDay: e.target.value})}
                style={styles.select}
              >
                <option value="1">1st of the month</option>
                <option value="5">5th of the month</option>
                <option value="10">10th of the month</option>
                <option value="15">15th of the month</option>
                <option value="20">20th of the month</option>
                <option value="25">25th of the month</option>
                <option value="30">30th of the month</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Currency</label>
              <select
                value={userData.currency}
                onChange={(e) => setUserData({...userData, currency: e.target.value})}
                style={styles.select}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="JPY">JPY (¥)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>What are your financial goals?</label>
              <div style={styles.goalsGrid}>
                {commonGoals.map(goal => (
                  <button
                    key={goal.id}
                    style={{
                      ...styles.goalButton,
                      ...(userData.goals.includes(goal.id) ? styles.goalButtonSelected : {})
                    }}
                    onClick={() => toggleGoal(goal.id)}
                  >
                    <span style={styles.goalIcon}>{goal.icon}</span>
                    <span style={styles.goalLabel}>{goal.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div style={styles.terms}>
              <input type="checkbox" id="terms" defaultChecked />
              <label htmlFor="terms">
                I agree to the <a href="#">Terms of Service</a> and <a href="#">Privacy Policy</a>
              </label>
            </div>
          </div>
        )}
      </div>

      <div style={styles.navigation}>
        <button style={styles.backButton} onClick={handleBack}>
          {step === 0 ? 'Log In' : 'Back'}
        </button>
        <button
          style={{
            ...styles.nextButton,
            backgroundColor: steps[step].color,
            opacity: step === steps.length - 1 && !userData.name ? 0.5 : 1
          }}
          onClick={handleNext}
          disabled={step === steps.length - 1 && !userData.name}
        >
          {step === steps.length - 1 ? 'Get Started' : 'Next'}
        </button>
      </div>

      {step === steps.length - 1 && (
        <button style={styles.quickSetup} onClick={completeOnboarding}>
          Quick Setup (Use Defaults)
        </button>
      )}
    </div>
  );
}

const styles = {
  container: {
    minHeight: '100vh',
    background: 'linear-gradient(135deg, #0047AB, #0A2472)',
    color: 'white',
    display: 'flex',
    flexDirection: 'column',
    fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
  },
  progressBar: {
    position: 'fixed',
    top: 0,
    left: 0,
    right: 0,
    height: '4px',
    background: 'rgba(255,255,255,0.1)',
  },
  progressFill: {
    height: '100%',
    transition: 'width 0.3s ease',
  },
  skipButton: {
    position: 'fixed',
    top: '20px',
    right: '20px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '20px',
    padding: '8px 16px',
    color: 'white',
    fontSize: '14px',
    cursor: 'pointer',
    zIndex: 10,
  },
  content: {
    flex: 1,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '40px 20px',
    paddingTop: '60px',
  },
  splashContainer: {
    textAlign: 'center',
    maxWidth: '300px',
  },
  splashIcon: {
    width: '120px',
    height: '120px',
    borderRadius: '60px',
    margin: '0 auto 30px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
  },
  splashImage: {
    fontSize: '60px',
  },
  splashTitle: {
    fontSize: '28px',
    fontWeight: 'bold',
    marginBottom: '16px',
  },
  splashDescription: {
    fontSize: '16px',
    color: 'rgba(255,255,255,0.7)',
    lineHeight: 1.5,
    marginBottom: '30px',
  },
  indicators: {
    display: 'flex',
    justifyContent: 'center',
    gap: '8px',
  },
  indicator: {
    width: '8px',
    height: '8px',
    borderRadius: '4px',
    transition: 'background-color 0.3s ease',
  },
  formContainer: {
    width: '100%',
    maxWidth: '400px',
  },
  formTitle: {
    fontSize: '24px',
    fontWeight: 'bold',
    marginBottom: '8px',
  },
  formSubtitle: {
    fontSize: '14px',
    color: 'rgba(255,255,255,0.7)',
    marginBottom: '30px',
  },
  inputGroup: {
    marginBottom: '20px',
  },
  label: {
    display: 'block',
    marginBottom: '8px',
    fontSize: '14px',
    color: 'rgba(255,255,255,0.9)',
  },
  input: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
  },
  select: {
    width: '100%',
    padding: '14px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
    cursor: 'pointer',
  },
  amountInput: {
    position: 'relative',
  },
  currencySymbol: {
    position: 'absolute',
    left: '14px',
    top: '14px',
    color: 'rgba(255,255,255,0.5)',
  },
  amountField: {
    width: '100%',
    padding: '14px',
    paddingLeft: '36px',
    borderRadius: '12px',
    border: '1px solid rgba(255,255,255,0.2)',
    background: 'rgba(255,255,255,0.1)',
    color: 'white',
    fontSize: '16px',
    outline: 'none',
  },
  goalsGrid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(2, 1fr)',
    gap: '8px',
    marginTop: '8px',
  },
  goalButton: {
    padding: '12px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    color: 'white',
    fontSize: '12px',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '4px',
    cursor: 'pointer',
  },
  goalButtonSelected: {
    background: 'rgba(59, 130, 246, 0.3)',
    borderColor: '#3B82F6',
  },
  goalIcon: {
    fontSize: '20px',
  },
  goalLabel: {
    fontSize: '11px',
  },
  terms: {
    display: 'flex',
    alignItems: 'center',
    gap: '8px',
    marginTop: '20px',
    fontSize: '12px',
    color: 'rgba(255,255,255,0.7)',
  },
  navigation: {
    display: 'flex',
    gap: '12px',
    padding: '20px',
    paddingBottom: '40px',
  },
  backButton: {
    flex: 1,
    padding: '16px',
    background: 'rgba(255,255,255,0.1)',
    border: '1px solid rgba(255,255,255,0.2)',
    borderRadius: '12px',
    color: 'white',
    fontSize: '16px',
    cursor: 'pointer',
  },
  nextButton: {
    flex: 2,
    padding: '16px',
    border: 'none',
    borderRadius: '12px',
    color: 'white',
    fontSize: '16px',
    fontWeight: '600',
    cursor: 'pointer',
  },
  quickSetup: {
    position: 'fixed',
    bottom: '20px',
    left: '20px',
    background: 'none',
    border: 'none',
    color: 'rgba(255,255,255,0.5)',
    fontSize: '12px',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
};