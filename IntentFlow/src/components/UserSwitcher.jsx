import React, { useState, useEffect } from 'react';

export default function UserSwitcher({ onUserChange }) {
  const [users, setUsers] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);
  const [showLogin, setShowLogin] = useState(false);
  const [showNewUser, setShowNewUser] = useState(false);
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [email, setEmail] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    loadUsers();
    getCurrentUser();
  }, []);

  const loadUsers = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.listUsers();
      if (result.success) {
        setUsers(result.data);
      }
    }
  };

  const getCurrentUser = async () => {
    if (window.electronAPI) {
      const result = await window.electronAPI.getCurrentUser();
      if (result.success && result.data) {
        setCurrentUser(result.data);
        if (onUserChange) onUserChange(result.data);
      }
    }
  };

  const handleLogin = async () => {
    try {
      setError('');
      const result = await window.electronAPI.loginUser({ username, password });
      if (result.success) {
        setCurrentUser(result.data);
        setShowLogin(false);
        setUsername('');
        setPassword('');
        if (onUserChange) onUserChange(result.data);
        await loadUsers();
      } else {
        setError(result.error || 'Login failed');
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleCreateUser = async () => {
    try {
      setError('');
      const result = await window.electronAPI.createUser({
        username,
        password,
        fullName,
        email
      });
      if (result.success) {
        setCurrentUser(result.data);
        setShowNewUser(false);
        setShowLogin(false);
        setUsername('');
        setPassword('');
        setFullName('');
        setEmail('');
        if (onUserChange) onUserChange(result.data);
        await loadUsers();
      } else {
        setError(result.error || 'Failed to create user');
      }
    } catch (error) {
      setError(error.message);
    }
  };

  const handleLogout = async () => {
    await window.electronAPI.logoutUser();
    setCurrentUser(null);
    if (onUserChange) onUserChange(null);
    await loadUsers();
  };

  const handleSwitchUser = async (user) => {
    setShowLogin(true);
    setUsername(user.username);
  };

  if (!currentUser) {
    return (
      <div style={{ position: 'relative' }}>
        <button
          onClick={() => setShowLogin(!showLogin)}
          style={{
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px',
            display: 'flex',
            alignItems: 'center',
            gap: '5px'
          }}
        >
          <span>👤</span> Login
        </button>

        {showLogin && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '5px',
            background: '#1F2937',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid #374151',
            width: '280px',
            zIndex: 1000,
            padding: '15px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'white' }}>Sign In</h3>
              <button
                onClick={() => setShowLogin(false)}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div style={{
                background: '#EF444420',
                border: '1px solid #EF4444',
                color: '#EF4444',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '12px',
                marginBottom: '10px'
              }}>
                {error}
              </div>
            )}

            {users.length > 0 && (
              <div style={{ marginBottom: '15px' }}>
                <div style={{ fontSize: '12px', color: '#9CA3AF', marginBottom: '5px' }}>
                  Quick switch:
                </div>
                {users.map(user => (
                  <button
                    key={user.id}
                    onClick={() => handleSwitchUser(user)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      width: '100%',
                      padding: '8px',
                      background: 'none',
                      border: 'none',
                      color: 'white',
                      cursor: 'pointer',
                      borderRadius: '4px',
                      textAlign: 'left'
                    }}
                    onMouseEnter={(e) => e.target.style.background = '#374151'}
                    onMouseLeave={(e) => e.target.style.background = 'none'}
                  >
                    <span style={{
                      width: '24px',
                      height: '24px',
                      background: user.avatar_color || '#3B82F6',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontSize: '12px'
                    }}>
                      {user.username.charAt(0).toUpperCase()}
                    </span>
                    <span>{user.full_name || user.username}</span>
                  </button>
                ))}
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
            </div>

            <button
              onClick={handleLogin}
              style={{
                width: '100%',
                background: '#3B82F6',
                color: 'white',
                border: 'none',
                padding: '8px',
                borderRadius: '4px',
                cursor: 'pointer',
                marginBottom: '8px'
              }}
            >
              Sign In
            </button>

            <button
              onClick={() => {
                setShowLogin(false);
                setShowNewUser(true);
                setUsername('');
                setPassword('');
                setError('');
              }}
              style={{
                width: '100%',
                background: 'none',
                border: '1px solid #374151',
                color: '#9CA3AF',
                padding: '8px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Create New Account
            </button>
          </div>
        )}

        {showNewUser && (
          <div style={{
            position: 'absolute',
            top: '100%',
            left: 0,
            marginTop: '5px',
            background: '#1F2937',
            borderRadius: '8px',
            boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
            border: '1px solid #374151',
            width: '280px',
            zIndex: 1000,
            padding: '15px'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '15px' }}>
              <h3 style={{ margin: 0, fontSize: '16px', color: 'white' }}>Create Account</h3>
              <button
                onClick={() => setShowNewUser(false)}
                style={{ background: 'none', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            {error && (
              <div style={{
                background: '#EF444420',
                border: '1px solid #EF4444',
                color: '#EF4444',
                padding: '8px',
                borderRadius: '4px',
                fontSize: '12px',
                marginBottom: '10px'
              }}>
                {error}
              </div>
            )}

            <div style={{ marginBottom: '10px' }}>
              <input
                type="text"
                placeholder="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
              <input
                type="password"
                placeholder="Password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
              <input
                type="text"
                placeholder="Full Name (optional)"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
              <input
                type="email"
                placeholder="Email (optional)"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '8px',
                  borderRadius: '4px',
                  marginBottom: '8px'
                }}
              />
            </div>

            <button
              onClick={handleCreateUser}
              style={{
                width: '100%',
                background: '#10B981',
                color: 'white',
                border: 'none',
                padding: '8px',
                borderRadius: '4px',
                cursor: 'pointer'
              }}
            >
              Create Account
            </button>
          </div>
        )}
      </div>
    );
  }

  // Logged in view
  return (
    <div style={{ position: 'relative' }}>
      <button
        onClick={() => setShowLogin(!showLogin)}
        style={{
          background: 'rgba(255,255,255,0.1)',
          border: 'none',
          color: 'white',
          padding: '4px 12px 4px 4px',
          borderRadius: '30px',
          cursor: 'pointer',
          fontSize: '14px',
          display: 'flex',
          alignItems: 'center',
          gap: '8px'
        }}
      >
        <span style={{
          width: '32px',
          height: '32px',
          background: currentUser.avatarColor || '#3B82F6',
          borderRadius: '50%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontSize: '14px',
          fontWeight: 'bold'
        }}>
          {currentUser.fullName ? currentUser.fullName.charAt(0).toUpperCase() : currentUser.username.charAt(0).toUpperCase()}
        </span>
        <span>{currentUser.fullName || currentUser.username}</span>
        <span style={{ fontSize: '10px' }}>▼</span>
      </button>

      {showLogin && (
        <div style={{
          position: 'absolute',
          top: '100%',
          left: 0,
          marginTop: '5px',
          background: '#1F2937',
          borderRadius: '8px',
          boxShadow: '0 10px 25px -5px rgba(0,0,0,0.5)',
          border: '1px solid #374151',
          width: '220px',
          zIndex: 1000
        }}>
          <div style={{
            padding: '12px 15px',
            borderBottom: '1px solid #374151'
          }}>
            <div style={{ fontSize: '12px', color: '#9CA3AF' }}>Signed in as</div>
            <div style={{ fontWeight: 'bold', color: 'white' }}>{currentUser.fullName || currentUser.username}</div>
            {currentUser.email && (
              <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{currentUser.email}</div>
            )}
          </div>

          {users.length > 1 && (
            <div style={{ padding: '8px 0', borderBottom: '1px solid #374151' }}>
              <div style={{ padding: '0 15px 5px 15px', fontSize: '12px', color: '#9CA3AF' }}>
                Switch user:
              </div>
              {users.filter(u => u.id !== currentUser.id).map(user => (
                <button
                  key={user.id}
                  onClick={() => {
                    setShowLogin(false);
                    handleSwitchUser(user);
                  }}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '8px',
                    width: '100%',
                    padding: '8px 15px',
                    background: 'none',
                    border: 'none',
                    color: 'white',
                    cursor: 'pointer',
                    textAlign: 'left'
                  }}
                  onMouseEnter={(e) => e.target.style.background = '#374151'}
                  onMouseLeave={(e) => e.target.style.background = 'none'}
                >
                  <span style={{
                    width: '24px',
                    height: '24px',
                    background: user.avatar_color || '#3B82F6',
                    borderRadius: '50%',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px'
                  }}>
                    {user.username.charAt(0).toUpperCase()}
                  </span>
                  <span>{user.full_name || user.username}</span>
                </button>
              ))}
            </div>
          )}

          <button
            onClick={handleLogout}
            style={{
              display: 'block',
              width: '100%',
              textAlign: 'left',
              padding: '10px 15px',
              background: 'none',
              border: 'none',
              color: '#EF4444',
              cursor: 'pointer',
              fontSize: '14px'
            }}
            onMouseEnter={(e) => e.target.style.background = '#374151'}
            onMouseLeave={(e) => e.target.style.background = 'none'}
          >
            🚪 Sign Out
          </button>
        </div>
      )}
    </div>
  );
}