import React, { useState } from 'react';

export default function CategoryManager({ categories, groups, onUpdate }) {
  const [editingId, setEditingId] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newCategory, setNewCategory] = useState({
    name: '',
    groupId: '',
    type: 'standard',
    assigned: 0,
    hidden: false
  });

  // Calculate totals per group (if needed)
  const groupTotals = groups.reduce((acc, group) => {
    const groupCategories = categories.filter(c => c.category_group_id === group.id);
    acc[group.id] = {
      budgeted: groupCategories.reduce((sum, c) => sum + (c.assigned || 0), 0),
      spent: groupCategories.reduce((sum, c) => sum + Math.abs(c.activity || 0), 0),
      available: groupCategories.reduce((sum, c) => sum + (c.available || 0), 0),
      categoryCount: groupCategories.length
    };
    return acc;
  }, {});

  const handleAddCategory = async () => {
    if (!newCategory.name.trim()) {
      alert('Please enter a category name');
      return;
    }
    if (!newCategory.groupId) {
      alert('Please select a category group');
      return;
    }

    try {
      console.log('Creating category:', newCategory);
      
      const result = await window.electronAPI.createCategory({
        name: newCategory.name,
        category_group_id: parseInt(newCategory.groupId),
        category_type: newCategory.type,
        hidden: newCategory.hidden ? 1 : 0,
        budget_id: 1
      });

      console.log('Create category result:', result);

      if (result && result.success) {
        setShowAddForm(false);
        setNewCategory({ name: '', groupId: '', type: 'standard', hidden: false });
        if (onUpdate) onUpdate();
        alert('Category added successfully!');
      } else {
        alert('Failed to add category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error adding category:', error);
      alert('Error adding category: ' + error.message);
    }
  };

  const handleEditCategory = (category) => {
    setEditingId(category.id);
    // Implement modal or inline edit if needed
    console.log('Edit category:', category);
  };

  const handleDeleteCategory = async (categoryId) => {
    if (!confirm('Are you sure you want to delete this category? This may affect existing transactions.')) return;

    try {
      const result = await window.electronAPI.deleteCategory(categoryId);
      if (result && result.success) {
        if (onUpdate) onUpdate();
        alert('Category deleted successfully!');
      } else {
        alert('Failed to delete category: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting category:', error);
      alert('Error deleting category: ' + error.message);
    }
  };

  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-US', {
      style: 'currency',
      currency: 'USD',
      minimumFractionDigits: 2
    }).format(amount);
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📋 Categories</h2>
        <button
          onClick={() => setShowAddForm(true)}
          style={{
            background: '#3B82F6',
            color: 'white',
            border: 'none',
            padding: '8px 16px',
            borderRadius: '6px',
            cursor: 'pointer',
            fontSize: '14px'
          }}
        >
          + Add Category
        </button>
      </div>

      {/* Add Category Modal */}
      {showAddForm && (
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
            <h3 style={{ marginTop: 0 }}>Add New Category</h3>
            
            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Category Name *
              </label>
              <input
                type="text"
                value={newCategory.name}
                onChange={(e) => setNewCategory({...newCategory, name: e.target.value})}
                placeholder="e.g., YouTube Premium"
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
                autoFocus
              />
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Category Group *
              </label>
              <select
                value={newCategory.groupId}
                onChange={(e) => setNewCategory({...newCategory, groupId: e.target.value})}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                <option value="">Select Group</option>
                {groups.map(g => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
              </select>
            </div>

            <div style={{ marginBottom: '15px' }}>
              <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
                Category Type
              </label>
              <select
                value={newCategory.type}
                onChange={(e) => setNewCategory({...newCategory, type: e.target.value})}
                style={{
                  width: '100%',
                  background: '#111827',
                  border: '1px solid #374151',
                  color: 'white',
                  padding: '10px',
                  borderRadius: '4px'
                }}
              >
                <option value="standard">Standard</option>
                <option value="savings">Savings Goal</option>
                <option value="debt">Debt Payment</option>
              </select>
            </div>

            <div style={{ marginBottom: '20px' }}>
              <label style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <input
                  type="checkbox"
                  checked={newCategory.hidden}
                  onChange={(e) => setNewCategory({...newCategory, hidden: e.target.checked})}
                />
                <span>Hidden by default</span>
              </label>
            </div>

            <div style={{ display: 'flex', gap: '10px' }}>
              <button
                onClick={handleAddCategory}
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
                Add Category
              </button>
              <button
                onClick={() => setShowAddForm(false)}
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

      {/* Categories Table */}
      <div style={{ overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ borderBottom: '1px solid #374151' }}>
              <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Category</th>
              <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Group</th>
              <th style={{ textAlign: 'left', padding: '10px', color: '#9CA3AF' }}>Type</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Budgeted</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Spent</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Available</th>
              <th style={{ textAlign: 'center', padding: '10px', color: '#9CA3AF' }}>Status</th>
              <th style={{ textAlign: 'right', padding: '10px', color: '#9CA3AF' }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {categories.map(cat => {
              const group = groups.find(g => g.id === cat.category_group_id);
              return (
                <tr key={cat.id} style={{ borderBottom: '1px solid #2d3748' }}>
                  <td style={{ padding: '10px' }}>{cat.name}</td>
                  <td style={{ padding: '10px' }}>{group?.name || 'Unknown'}</td>
                  <td style={{ padding: '10px', textTransform: 'capitalize' }}>{cat.category_type}</td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>{formatCurrency(cat.assigned || 0)}</td>
                  <td style={{ padding: '10px', textAlign: 'right', color: '#EF4444' }}>
                    {formatCurrency(Math.abs(cat.activity || 0))}
                  </td>
                  <td style={{ 
                    padding: '10px', 
                    textAlign: 'right',
                    color: cat.available >= 0 ? '#10B981' : '#EF4444'
                  }}>
                    {formatCurrency(cat.available || 0)}
                  </td>
                  <td style={{ padding: '10px', textAlign: 'center' }}>
                    <span style={{
                      background: cat.hidden ? '#EF444420' : '#10B98120',
                      color: cat.hidden ? '#EF4444' : '#10B981',
                      padding: '4px 8px',
                      borderRadius: '4px',
                      fontSize: '12px'
                    }}>
                      {cat.hidden ? 'Hidden' : 'Active'}
                    </span>
                  </td>
                  <td style={{ padding: '10px', textAlign: 'right' }}>
                    <button
                      onClick={() => handleEditCategory(cat)}
                      style={{
                        background: 'none',
                        border: '1px solid #F59E0B',
                        color: '#F59E0B',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        marginRight: '5px',
                        cursor: 'pointer'
                      }}
                    >
                      Edit
                    </button>
                    <button
                      onClick={() => handleDeleteCategory(cat.id)}
                      style={{
                        background: 'none',
                        border: '1px solid #EF4444',
                        color: '#EF4444',
                        padding: '4px 8px',
                        borderRadius: '4px',
                        fontSize: '12px',
                        cursor: 'pointer'
                      }}
                    >
                      Delete
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}