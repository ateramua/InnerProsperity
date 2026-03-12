import React, { useState } from 'react';

export default function FileManager({ onFileLoaded, onFileSaved, currentBudget }) {
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [action, setAction] = useState(''); // 'save', 'load', 'export'
  const [error, setError] = useState('');
  const [currentFile, setCurrentFile] = useState(null);

  const handleSave = async () => {
    if (password !== confirmPassword) {
      setError('Passwords do not match');
      return;
    }

    if (password.length < 4) {
      setError('Password must be at least 4 characters');
      return;
    }

    const result = await window.electronAPI.saveBudgetToFile({
      budget: currentBudget,
      password: password
    });

    if (result.success) {
      setCurrentFile(result.filePath);
      setShowPasswordModal(false);
      setPassword('');
      setConfirmPassword('');
      setError('');
      alert(result.message);
      if (onFileSaved) onFileSaved(result);
    } else {
      setError(result.error || 'Failed to save file');
    }
  };

  const handleLoad = async () => {
    const result = await window.electronAPI.loadBudgetFromFile({
      password: password
    });

    if (result.success) {
      setCurrentFile(result.filePath);
      setShowPasswordModal(false);
      setPassword('');
      setError('');
      alert(result.message);
      if (onFileLoaded) onFileLoaded(result.data);
    } else {
      setError(result.error || 'Failed to load file');
    }
  };

  const handleNew = () => {
    if (confirm('Create new budget? Any unsaved changes will be lost.')) {
      setCurrentFile(null);
      if (onFileLoaded) onFileLoaded(null); // Signal for new budget
    }
  };

  const handleExport = async () => {
    const result = await window.electronAPI.exportBudget(currentBudget);
    if (result.success) {
      alert(result.message);
    }
  };

  const formatFileSize = (bytes) => {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  };

  return (
    <div style={{ padding: '10px' }}>
      {/* File Info Bar */}
      {currentFile && (
        <div style={{
          background: '#1F2937',
          padding: '8px 12px',
          borderRadius: '4px',
          marginBottom: '10px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '12px',
          border: '1px solid #374151'
        }}>
          <div>
            <span style={{ color: '#9CA3AF' }}>📁 </span>
            <strong>{currentFile.name}</strong>
            <span style={{ color: '#9CA3AF', marginLeft: '10px' }}>
              {currentFile.directory}
            </span>
          </div>
          <div style={{ color: '#9CA3AF' }}>
            🔒 Encrypted
          </div>
        </div>
      )}

      {/* Action Buttons */}
      <div style={{
        display: 'flex',
        gap: '5px',
        flexWrap: 'wrap'
      }}>
        <button
          onClick={handleNew}
          style={{
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>📄</span> New
        </button>

        <button
          onClick={() => {
            setAction('load');
            setShowPasswordModal(true);
            setError('');
          }}
          style={{
            background: '#10B981',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>📂</span> Open
        </button>

        <button
          onClick={() => {
            setAction('save');
            setShowPasswordModal(true);
            setError('');
          }}
          style={{
            background: '#F59E0B',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>💾</span> Save As
        </button>

        <button
          onClick={handleExport}
          style={{
            background: '#8B5CF6',
            color: 'white',
            border: 'none',
            padding: '6px 12px',
            borderRadius: '4px',
            cursor: 'pointer',
            fontSize: '12px',
            display: 'flex',
            alignItems: 'center',
            gap: '4px'
          }}
        >
          <span>📤</span> Export JSON
        </button>
      </div>

      {/* Password Modal */}
      {showPasswordModal && (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          background: 'rgba(0,0,0,0.7)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000
        }}>
          <div style={{
            background: '#1F2937',
            borderRadius: '12px',
            padding: '30px',
            maxWidth: '400px',
            width: '90%'
          }}>
            <h3 style={{ marginTop: 0, marginBottom: '15px' }}>
              {action === 'save' ? '💾 Save Budget' : '📂 Open Budget'}
            </h3>
            
            <p style={{ color: '#9CA3AF', fontSize: '14px', marginBottom: '20px' }}>
              {action === 'save' 
                ? 'Enter a password to encrypt your budget file.' 
                : 'Enter the password for the selected budget file.'}
            </p>

            {error && (
              <div style={{
                background: '#EF444420',
                border: '1px solid #EF4444',
                color: '#EF4444',
                padding: '10px',
                borderRadius: '4px',
                fontSize: '12px',
                marginBottom: '15px'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Password
              </label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              />
            </div>

            {action === 'save' && (
              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                  Confirm Password
                </label>
                <input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  style={{
                    width: '100%',
                    background: '#111827',
                    border: '1px solid #374151',
                    color: 'white',
                    padding: '10px',
                    borderRadius: '4px'
                  }}
                />
              </div>
            )}

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={action === 'save' ? handleSave : handleLoad}
                style={{
                  flex: 1,
                  background: '#10B981',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                {action === 'save' ? 'Save File' : 'Open File'}
              </button>
              <button
                onClick={() => {
                  setShowPasswordModal(false);
                  setPassword('');
                  setConfirmPassword('');
                  setError('');
                }}
                style={{
                  flex: 1,
                  background: '#6B7280',
                  color: 'white',
                  border: 'none',
                  padding: '12px',
                  borderRadius: '4px',
                  cursor: 'pointer'
                }}
              >
                Cancel
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
