import React, { useState } from 'react';

export default function GroupManager({ groups, onUpdate }) {
  const [editingGroup, setEditingGroup] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [newGroup, setNewGroup] = useState({ name: '', description: '' });
  const [dragOverId, setDragOverId] = useState(null);

  const handleAddGroup = async () => {
    if (!newGroup.name.trim()) {
      alert('Please enter a group name');
      return;
    }
    
    try {
      console.log('Creating group:', newGroup);
      
      const result = await window.electronAPI.createGroup({
        name: newGroup.name,
        description: newGroup.description || '',
        budget_id: 1
      });
      
      console.log('Create group result:', result);
      
      if (result && result.success) {
        setShowAddForm(false);
        setNewGroup({ name: '', description: '' });
        if (onUpdate) onUpdate();
        alert('Group created successfully!');
      } else {
        alert('Failed to create group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error creating group:', error);
      alert('Error creating group: ' + error.message);
    }
  };

  const handleUpdateGroup = async () => {
    if (!editingGroup) return;
    
    if (!editingGroup.name.trim()) {
      alert('Please enter a group name');
      return;
    }
    
    try {
      console.log('Updating group:', editingGroup);
      
      const result = await window.electronAPI.updateGroup(editingGroup.id, {
        name: editingGroup.name,
        description: editingGroup.description || ''
      });
      
      console.log('Update group result:', result);
      
      if (result && result.success) {
        setEditingGroup(null);
        if (onUpdate) onUpdate();
        alert('Group updated successfully!');
      } else {
        alert('Failed to update group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error updating group:', error);
      alert('Error updating group: ' + error.message);
    }
  };

  const handleDeleteGroup = async (groupId) => {
    if (!confirm('Are you sure you want to delete this group? Categories in this group must be moved or deleted first.')) {
      return;
    }
    
    try {
      console.log('Deleting group ID:', groupId);
      
      const result = await window.electronAPI.deleteGroup(groupId);
      console.log('Delete group result:', result);
      
      if (result && result.success) {
        if (onUpdate) onUpdate();
        alert('Group deleted successfully!');
      } else {
        alert('Failed to delete group: ' + (result?.error || 'Unknown error'));
      }
    } catch (error) {
      console.error('Error deleting group:', error);
      alert(error.message || 'Failed to delete group');
    }
  };

  const handleDragStart = (e, group) => {
    e.dataTransfer.setData('text/plain', group.id.toString());
  };

  const handleDragOver = (e, groupId) => {
    e.preventDefault();
    setDragOverId(groupId);
  };

  const handleDragLeave = () => {
    setDragOverId(null);
  };

  const handleDrop = async (e, targetGroup) => {
    e.preventDefault();
    setDragOverId(null);
    
    const sourceId = parseInt(e.dataTransfer.getData('text/plain'));
    if (sourceId === targetGroup.id) return;

    // Reorder groups
    const updatedGroups = [...groups];
    const sourceIndex = updatedGroups.findIndex(g => g.id === sourceId);
    const targetIndex = updatedGroups.findIndex(g => g.id === targetGroup.id);
    
    const [movedGroup] = updatedGroups.splice(sourceIndex, 1);
    updatedGroups.splice(targetIndex, 0, movedGroup);
    
    // Update sort orders
    const groupOrders = updatedGroups.map((g, index) => ({
      id: g.id,
      sort_order: index + 1
    }));

    try {
      console.log('Reordering groups:', groupOrders);
      
      const result = await window.electronAPI.reorderGroups(groupOrders);
      console.log('Reorder result:', result);
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error reordering groups:', error);
      alert('Failed to reorder groups: ' + error.message);
    }
  };

  const handleToggleExpand = async (groupId, currentExpanded) => {
    try {
      console.log('Toggling expand for group:', groupId, !currentExpanded);
      
      const result = await window.electronAPI.toggleGroupExpansion(groupId, !currentExpanded);
      console.log('Toggle expand result:', result);
      
      if (onUpdate) onUpdate();
    } catch (error) {
      console.error('Error toggling group expansion:', error);
      alert('Failed to toggle group expansion: ' + error.message);
    }
  };

  return (
    <div style={{ padding: '20px', color: 'white' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '20px' }}>
        <h2 style={{ margin: 0 }}>📁 Category Groups</h2>
        <button
          onClick={() => setShowAddForm(true)}
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
          <span>+</span> Add Group
        </button>
      </div>

      {/* Add Group Form */}
      {showAddForm && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #3B82F6'
        }}>
          <h3 style={{ marginTop: 0 }}>New Category Group</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
              Group Name *
            </label>
            <input
              type="text"
              value={newGroup.name}
              onChange={(e) => setNewGroup({...newGroup, name: e.target.value})}
              placeholder="e.g., Monthly Bills"
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
              Description (optional)
            </label>
            <textarea
              value={newGroup.description}
              onChange={(e) => setNewGroup({...newGroup, description: e.target.value})}
              placeholder="What's this group for?"
              rows="2"
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleAddGroup}
              style={{
                background: '#10B981',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Create Group
            </button>
            <button
              onClick={() => setShowAddForm(false)}
              style={{
                background: '#6B7280',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Edit Group Form */}
      {editingGroup && (
        <div style={{
          background: '#1F2937',
          padding: '20px',
          borderRadius: '8px',
          marginBottom: '20px',
          border: '1px solid #F59E0B'
        }}>
          <h3 style={{ marginTop: 0 }}>Edit Group</h3>
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
              Group Name *
            </label>
            <input
              type="text"
              value={editingGroup.name}
              onChange={(e) => setEditingGroup({...editingGroup, name: e.target.value})}
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
          <div style={{ marginBottom: '15px' }}>
            <label style={{ display: 'block', marginBottom: '5px', color: '#9CA3AF' }}>
              Description
            </label>
            <textarea
              value={editingGroup.description || ''}
              onChange={(e) => setEditingGroup({...editingGroup, description: e.target.value})}
              rows="2"
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
          <div style={{ display: 'flex', gap: '10px' }}>
            <button
              onClick={handleUpdateGroup}
              style={{
                background: '#F59E0B',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Save Changes
            </button>
            <button
              onClick={() => setEditingGroup(null)}
              style={{
                background: '#6B7280',
                color: 'white',
                border: 'none',
                padding: '10px 20px',
                borderRadius: '4px',
                cursor: 'pointer',
                fontWeight: 'bold'
              }}
            >
              Cancel
            </button>
          </div>
        </div>
      )}

      {/* Groups List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {groups.map((group, index) => (
          <div
            key={group.id}
            draggable
            onDragStart={(e) => handleDragStart(e, group)}
            onDragOver={(e) => handleDragOver(e, group.id)}
            onDragLeave={handleDragLeave}
            onDrop={(e) => handleDrop(e, group)}
            style={{
              background: dragOverId === group.id ? '#374151' : '#1F2937',
              border: '1px solid #374151',
              borderRadius: '8px',
              padding: '15px',
              cursor: 'move',
              transition: 'background 0.2s',
              position: 'relative'
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flex: 1 }}>
                <span style={{ color: '#9CA3AF', fontSize: '12px' }}>#{index + 1}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: '16px' }}>{group.name}</h3>
                  {group.description && (
                    <div style={{ fontSize: '12px', color: '#9CA3AF' }}>{group.description}</div>
                  )}
                </div>
              </div>
              <div style={{ display: 'flex', gap: '8px' }}>
                <button
                  onClick={() => handleToggleExpand(group.id, group.is_expanded)}
                  style={{
                    background: 'none',
                    border: '1px solid #3B82F6',
                    color: '#3B82F6',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  {group.is_expanded ? 'Collapse' : 'Expand'}
                </button>
                <button
                  onClick={() => setEditingGroup(group)}
                  style={{
                    background: 'none',
                    border: '1px solid #F59E0B',
                    color: '#F59E0B',
                    padding: '4px 8px',
                    borderRadius: '4px',
                    fontSize: '12px',
                    cursor: 'pointer'
                  }}
                >
                  Edit
                </button>
                <button
                  onClick={() => handleDeleteGroup(group.id)}
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
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Drag & Drop Hint */}
      <div style={{
        marginTop: '20px',
        padding: '10px',
        background: '#111827',
        borderRadius: '4px',
        fontSize: '12px',
        color: '#9CA3AF',
        textAlign: 'center'
      }}>
        💡 Drag groups to reorder them
      </div>
    </div>
  );
}