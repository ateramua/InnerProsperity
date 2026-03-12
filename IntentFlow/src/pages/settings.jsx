// src/pages/settings.jsx
import { useState } from "react";
import { useAuth } from '../contexts/AuthContext';

export default function Settings() {
  const { user, logout } = useAuth();
  const [activeTab, setActiveTab] = useState("general");
  const [isRedirecting, setIsRedirecting] = useState(false);
  const [showUserMenu, setShowUserMenu] = useState(false);

  const [groups, setGroups] = useState([
    {
      id: 1,
      name: "Living",
      categories: [
        { id: 11, name: "Rent" },
        { id: 12, name: "Utilities" },
      ],
    },
    {
      id: 2,
      name: "Lifestyle",
      categories: [
        { id: 21, name: "Food" },
        { id: 22, name: "Entertainment" },
      ],
    },
  ]);

  const [newGroupName, setNewGroupName] = useState("");
  const [newCategoryName, setNewCategoryName] = useState({});
  const [budget, setBudget] = useState(1000);
  const [currency, setCurrency] = useState("USD");
  const [theme, setTheme] = useState("light");

  const addGroup = () => {
    if (!newGroupName.trim()) return;
    setGroups([
      ...groups,
      {
        id: Date.now(),
        name: newGroupName,
        categories: [],
      },
    ]);
    setNewGroupName("");
  };

  const updateGroupName = (id, value) => {
    setGroups(groups.map(g => (g.id === id ? { ...g, name: value } : g)));
  };

  const addCategory = (groupId) => {
    const name = newCategoryName[groupId];
    if (!name || !name.trim()) return;
    setGroups(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              categories: [
                ...g.categories,
                { id: Date.now(), name: name.trim() },
              ],
            }
          : g
      )
    );
    setNewCategoryName({ ...newCategoryName, [groupId]: "" });
  };

  const updateCategory = (groupId, catId, value) => {
    setGroups(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              categories: g.categories.map((c) =>
                c.id === catId ? { ...c, name: value } : c
              ),
            }
          : g
      )
    );
  };

  const deleteCategory = (groupId, catId) => {
    setGroups(
      groups.map((g) =>
        g.id === groupId
          ? {
              ...g,
              categories: g.categories.filter((c) => c.id !== catId),
            }
          : g
      )
    );
  };

  const saveSettings = async () => {
    setIsRedirecting(true);
    
    const settings = { currency, theme, budget, groups };
    console.log("Saving settings:", settings);
    
    try {
      if (window.electronAPI) {
        const savePromise = window.electronAPI.saveSettings(settings);
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('Save timeout')), 2000)
        );
        
        await Promise.race([savePromise, timeoutPromise])
          .catch(error => console.warn("Save warning:", error.message));
      }
    } catch (error) {
      console.error("❌ Error saving settings:", error);
    }
    
    console.log("🔄 Redirecting to home page...");
    
    if (window.history && window.history.length > 1) {
      window.history.back();
    } else {
      window.location.replace('/');
    }
    
    setTimeout(() => {
      if (window.location.pathname !== '/') {
        window.location.href = '/';
      }
    }, 100);
  };

  const cancelRedirect = () => {
    setIsRedirecting(false);
  };

  const handleLogout = async () => {
    await logout();
    window.location.href = '/login';
  };

  return (
    <div style={styles.container}>
      {/* Decorative overlay */}
      <div style={styles.gradientOverlay} />

      {/* Main white card */}
      <div style={styles.card}>
        {/* Header with user info */}
        <div style={styles.header}>
          <div style={styles.headerLeft}>
            <div style={styles.iconCircle}>
              <i className="fas fa-sliders-h"></i>
            </div>
            <div>
              <h1 style={styles.title}>settings</h1>
              <p style={styles.subtitle}>
                <i className="fas fa-magic" style={{ color: "#2a5298" }}></i> fine-tune your workspace
              </p>
            </div>
          </div>
          
          {/* User menu */}
          {user && (
            <div style={styles.userMenuContainer}>
              <button
                onClick={() => setShowUserMenu(!showUserMenu)}
                style={styles.userButton}
              >
                <div style={{
                  ...styles.userAvatar,
                  background: user.avatarColor || '#2a5298'
                }}>
                  {(user.fullName || user.username).charAt(0).toUpperCase()}
                </div>
                <span style={styles.userName}>{user.fullName || user.username}</span>
                <i className={`fas fa-chevron-${showUserMenu ? 'up' : 'down'}`} style={styles.chevronIcon}></i>
              </button>

              {showUserMenu && (
                <div style={styles.userMenu}>
                  <div style={styles.userMenuHeader}>
                    <div style={styles.userInfo}>
                      <div style={styles.userFullName}>{user.fullName || user.username}</div>
                      <div style={styles.userUsername}>@{user.username}</div>
                      {user.email && <div style={styles.userEmail}>{user.email}</div>}
                    </div>
                  </div>
                  <button
                    onClick={handleLogout}
                    style={styles.logoutButton}
                    onMouseEnter={(e) => e.target.style.background = '#fee2e2'}
                    onMouseLeave={(e) => e.target.style.background = 'transparent'}
                  >
                    <i className="fas fa-sign-out-alt" style={{ color: '#dc3545' }}></i>
                    <span>Logout</span>
                  </button>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Tabs */}
        <div style={styles.tabContainer}>
          <button
            onClick={() => setActiveTab("general")}
            style={{
              ...styles.tab,
              ...(activeTab === "general" ? styles.activeTab : styles.inactiveTab)
            }}
          >
            <i className="fas fa-cog"></i> General
          </button>
          <button
            onClick={() => setActiveTab("budget")}
            style={{
              ...styles.tab,
              ...(activeTab === "budget" ? styles.activeTab : styles.inactiveTab)
            }}
          >
            <i className="fas fa-chart-pie"></i> Prosperity Map
          </button>
          <button
            onClick={() => setActiveTab("categories")}
            style={{
              ...styles.tab,
              ...(activeTab === "categories" ? styles.activeTab : styles.inactiveTab)
            }}
          >
            <i className="fas fa-tags"></i> Categories
          </button>
        </div>

        {/* GENERAL TAB */}
        {activeTab === "general" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>General Settings</h2>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Currency</label>
              <select 
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
                style={styles.select}
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
              </select>
            </div>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Theme</label>
              <select 
                value={theme}
                onChange={(e) => setTheme(e.target.value)}
                style={styles.select}
              >
                <option value="light">Light</option>
                <option value="dark">Dark</option>
                <option value="system">System</option>
              </select>
            </div>
            
            <div style={styles.timezoneBox}>
              <i className="fas fa-clock" style={{ color: "#1e5f4b" }}></i>
              <span style={styles.timezoneText}>Timezone: <strong>America/New_York</strong> (detected)</span>
            </div>
          </div>
        )}

        {/* PROSPERITY MAP TAB */}
        {activeTab === "budget" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Prosperity Map</h2>

            <div style={styles.inputGroup}>
              <label style={styles.label}>Monthly Budget Amount</label>
              <input
                type="number"
                value={budget}
                onChange={(e) => setBudget(Number(e.target.value))}
                style={styles.input}
              />
            </div>

            <div style={styles.prosperityBox}>
              <p style={styles.prosperityText}>
                <i className="fas fa-chart-line" style={{ color: "#2a5298", marginRight: 8 }}></i>
                Projected savings: <strong>${Math.round(budget * 0.2)}</strong> (20% of budget)
              </p>
              <p style={styles.prosperitySubtext}>
                <i className="fas fa-leaf" style={{ marginRight: 8 }}></i>
                Your prosperity path is clear. Stay on track!
              </p>
            </div>
          </div>
        )}

        {/* CATEGORIES TAB */}
        {activeTab === "categories" && (
          <div style={styles.tabContent}>
            <h2 style={styles.sectionTitle}>Category Groups</h2>

            {groups.map((group) => (
              <div key={group.id} style={styles.groupCard}>
                <input
                  value={group.name}
                  onChange={(e) => updateGroupName(group.id, e.target.value)}
                  style={styles.groupNameInput}
                />

                {group.categories.map((cat) => (
                  <div key={cat.id} style={styles.categoryRow}>
                    <input
                      value={cat.name}
                      onChange={(e) => updateCategory(group.id, cat.id, e.target.value)}
                      style={styles.categoryInput}
                    />

                    <button
                      onClick={() => deleteCategory(group.id, cat.id)}
                      style={styles.deleteButton}
                    >
                      Delete
                    </button>
                  </div>
                ))}

                <div style={styles.addCategoryRow}>
                  <input
                    placeholder="New category"
                    value={newCategoryName[group.id] || ""}
                    onChange={(e) =>
                      setNewCategoryName({
                        ...newCategoryName,
                        [group.id]: e.target.value,
                      })
                    }
                    style={styles.categoryInput}
                  />

                  <button 
                    onClick={() => addCategory(group.id)}
                    style={styles.addCategoryButton}
                  >
                    Add Category
                  </button>
                </div>
              </div>
            ))}

            <div style={styles.addGroupRow}>
              <input
                placeholder="New group name"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                style={styles.groupInput}
              />

              <button 
                onClick={addGroup}
                style={styles.addGroupButton}
              >
                Add Group
              </button>
            </div>
          </div>
        )}

        {/* Save Settings Button */}
        <div style={styles.saveButtonContainer}>
          {isRedirecting && (
            <button 
              onClick={cancelRedirect}
              style={styles.cancelButton}
            >
              Cancel
            </button>
          )}
          <button 
            onClick={saveSettings}
            disabled={isRedirecting}
            style={{
              ...styles.saveButton,
              opacity: isRedirecting ? 0.7 : 1,
              cursor: isRedirecting ? "wait" : "pointer"
            }}
          >
            {isRedirecting ? (
              <>
                <i className="fas fa-spinner fa-spin"></i> Redirecting...
              </>
            ) : (
              <>
                <i className="fas fa-save"></i> Save Settings
              </>
            )}
          </button>
        </div>
        
        {/* Footer */}
        <div style={styles.footer}>
          <div>
            <i className="fas fa-dragon" style={{ marginRight: 8, color: "#2a5298" }}></i> fancy settings · keep it elegant
          </div>
          <div style={styles.colorLegend}>
            <span><i className="fas fa-circle" style={{ color: "#2a5298", fontSize: 8 }}></i> blue</span>
            <span><i className="fas fa-circle" style={{ color: "#1e5f4b", fontSize: 8 }}></i> green</span>
          </div>
        </div>
      </div>
    </div>
  );
}

const styles = {
  container: {
    minHeight: "100vh",
    background: "linear-gradient(135deg, #1e3c72 0%, #2a5298 50%, #1e5f4b 100%)",
    fontFamily: "'Inter', sans-serif",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: "20px",
    position: "relative"
  },
  gradientOverlay: {
    position: "fixed",
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    background: "radial-gradient(circle at 20% 80%, rgba(64, 224, 208, 0.15) 0%, transparent 50%), radial-gradient(circle at 80% 20%, rgba(72, 202, 228, 0.15) 0%, transparent 50%)",
    pointerEvents: "none",
    zIndex: 0
  },
  card: {
    background: "white",
    borderRadius: "48px",
    padding: "40px 48px",
    boxShadow: "0 30px 60px -20px rgba(0,0,0,0.4), 0 0 0 1px rgba(255,255,255,0.3) inset",
    width: "100%",
    maxWidth: "860px",
    margin: "20px",
    position: "relative",
    zIndex: 1
  },
  header: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: "32px"
  },
  headerLeft: {
    display: "flex",
    alignItems: "center",
    gap: "16px"
  },
  iconCircle: {
    background: "linear-gradient(135deg, #2a5298, #1e5f4b)",
    borderRadius: "32px",
    width: "56px",
    height: "56px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontSize: "28px",
    boxShadow: "0 10px 15px -8px rgba(0,0,0,0.3)"
  },
  title: {
    fontSize: "2.4rem",
    fontWeight: 600,
    letterSpacing: "-0.02em",
    margin: 0,
    color: "#0f172a"
  },
  subtitle: {
    fontSize: "1rem",
    color: "#64748b",
    marginTop: "4px",
    display: "flex",
    gap: "8px",
    alignItems: "center"
  },
  userMenuContainer: {
    position: "relative"
  },
  userButton: {
    display: "flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    background: "white",
    border: "1px solid #e2e8f0",
    borderRadius: "40px",
    cursor: "pointer"
  },
  userAvatar: {
    width: "32px",
    height: "32px",
    borderRadius: "50%",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "white",
    fontWeight: 600
  },
  userName: {
    fontWeight: 500,
    color: "#334155"
  },
  chevronIcon: {
    fontSize: "12px",
    color: "#64748b"
  },
  userMenu: {
    position: "absolute",
    top: "100%",
    right: 0,
    marginTop: "8px",
    background: "white",
    borderRadius: "12px",
    boxShadow: "0 4px 20px rgba(0,0,0,0.15)",
    border: "1px solid #e2e8f0",
    minWidth: "240px",
    zIndex: 1000
  },
  userMenuHeader: {
    padding: "16px",
    borderBottom: "1px solid #e2e8f0"
  },
  userInfo: {
    display: "flex",
    flexDirection: "column",
    gap: "4px"
  },
  userFullName: {
    fontWeight: 600,
    color: "#0f172a",
    fontSize: "1rem"
  },
  userUsername: {
    color: "#64748b",
    fontSize: "0.9rem"
  },
  userEmail: {
    color: "#64748b",
    fontSize: "0.85rem",
    marginTop: "4px"
  },
  logoutButton: {
    width: "100%",
    padding: "12px 16px",
    border: "none",
    background: "transparent",
    textAlign: "left",
    cursor: "pointer",
    color: "#dc3545",
    display: "flex",
    alignItems: "center",
    gap: "8px",
    borderRadius: "0 0 12px 12px"
  },
  tabContainer: {
    display: "flex",
    gap: "12px",
    marginBottom: "40px",
    flexWrap: "wrap"
  },
  tab: {
    padding: "12px 28px",
    borderRadius: "40px",
    fontWeight: 600,
    fontSize: "1rem",
    cursor: "pointer",
    border: "none",
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    transition: "all 0.2s ease"
  },
  activeTab: {
    background: "linear-gradient(135deg, #2a5298, #1e5f4b)",
    color: "white",
    boxShadow: "0 8px 18px -6px rgba(30, 60, 114, 0.4)"
  },
  inactiveTab: {
    background: "white",
    border: "1px solid #e2e8f0",
    color: "#334155"
  },
  tabContent: {
    display: "flex",
    flexDirection: "column",
    gap: "15px"
  },
  sectionTitle: {
    fontSize: "1.6rem",
    fontWeight: 500,
    marginBottom: "10px"
  },
  inputGroup: {
    marginBottom: "10px"
  },
  label: {
    display: "block",
    marginBottom: "5px",
    fontWeight: 600,
    color: "#334155"
  },
  select: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif"
  },
  input: {
    width: "100%",
    padding: "10px",
    borderRadius: "8px",
    border: "1px solid #ddd",
    fontSize: "1rem",
    fontFamily: "'Inter', sans-serif"
  },
  timezoneBox: {
    background: "#f8fafc",
    borderRadius: "40px",
    padding: "16px",
    marginTop: "12px",
    display: "flex",
    alignItems: "center",
    gap: "16px",
    border: "1px solid #e2e8f0"
  },
  timezoneText: {
    fontSize: "0.95rem",
    color: "#334155"
  },
  prosperityBox: {
    marginTop: "10px",
    padding: "15px",
    background: "#f0f8ff",
    borderRadius: "8px"
  },
  prosperityText: {
    margin: 0
  },
  prosperitySubtext: {
    margin: "10px 0 0 0",
    color: "#1e5f4b"
  },
  groupCard: {
    border: "1px solid #ddd",
    padding: "15px",
    borderRadius: "8px",
    marginBottom: "15px"
  },
  groupNameInput: {
    fontWeight: "bold",
    fontSize: "16px",
    marginBottom: "10px",
    width: "100%",
    padding: "8px",
    border: "1px solid #ddd",
    borderRadius: "4px",
    fontFamily: "'Inter', sans-serif"
  },
  categoryRow: {
    display: "flex",
    gap: "10px",
    marginBottom: "8px"
  },
  categoryInput: {
    flex: 1,
    padding: "8px",
    borderRadius: "4px",
    border: "1px solid #ddd",
    fontFamily: "'Inter', sans-serif"
  },
  deleteButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    background: "#dc3545",
    color: "white",
    fontWeight: 500
  },
  addCategoryRow: {
    display: "flex",
    gap: "10px",
    marginTop: "10px"
  },
  addCategoryButton: {
    padding: "8px 16px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    background: "#28a745",
    color: "white",
    fontWeight: 500
  },
  addGroupRow: {
    display: "flex",
    gap: "10px",
    marginTop: "10px"
  },
  groupInput: {
    flex: 1,
    padding: "10px",
    borderRadius: "4px",
    border: "1px solid #ddd",
    fontFamily: "'Inter', sans-serif"
  },
  addGroupButton: {
    padding: "10px 20px",
    border: "none",
    borderRadius: "4px",
    cursor: "pointer",
    background: "#007bff",
    color: "white",
    fontWeight: 500
  },
  saveButtonContainer: {
    marginTop: "30px",
    display: "flex",
    justifyContent: "flex-end",
    gap: "10px"
  },
  saveButton: {
    background: "linear-gradient(135deg, #2a5298, #1e3c72)",
    color: "white",
    border: "none",
    padding: "12px 36px",
    borderRadius: "40px",
    fontSize: "16px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: "10px",
    transition: "all 0.2s ease"
  },
  cancelButton: {
    background: "#6c757d",
    color: "white",
    border: "none",
    padding: "12px 24px",
    borderRadius: "40px",
    fontSize: "16px",
    fontWeight: 500,
    cursor: "pointer",
    transition: "all 0.2s ease"
  },
  footer: {
    marginTop: "48px",
    display: "flex",
    justifyContent: "space-between",
    borderTop: "1px solid #e2e8f0",
    paddingTop: "24px",
    color: "#94a3b8",
    fontSize: "0.85rem"
  },
  colorLegend: {
    display: "flex",
    gap: "16px"
  }
};