'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'

// Types for File Hub
type TileType = 'folder' | 'doc' | 'sheet'

interface FileTile {
  id: string
  type: TileType
  title: string
  subtitle?: string
  url?: string // Only for docs/sheets
  notes?: string
  parentId?: string // For nested folders
}

// Sample data for Phase 1
const SAMPLE_TILES: FileTile[] = [
  {
    id: '1',
    type: 'folder',
    title: 'SteeleBroz',
    subtitle: 'Brand & Marketing'
  },
  {
    id: '2',
    type: 'folder',
    title: 'Family',
    subtitle: 'Personal documents'
  },
  {
    id: '3',
    type: 'doc',
    title: 'Brand Strategy 2024',
    subtitle: 'Q1 Planning Document',
    url: 'https://docs.google.com/document/d/example'
  },
  {
    id: '4',
    type: 'sheet',
    title: 'Revenue Tracker',
    subtitle: 'Monthly finances',
    url: 'https://sheets.google.com/spreadsheet/d/example'
  },
  {
    id: '5',
    type: 'folder',
    title: 'Kids Sports',
    parentId: '2'
  },
  {
    id: '6',
    type: 'doc', 
    title: 'Tournament Schedule',
    parentId: '5',
    url: 'https://docs.google.com/document/d/example2'
  }
]

export default function PersonalPage() {
  const router = useRouter()
  const [tiles, setTiles] = useState<FileTile[]>(SAMPLE_TILES)
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null)
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [editingTile, setEditingTile] = useState<FileTile | null>(null)

  // Form state for create/edit
  const [formData, setFormData] = useState({
    type: 'folder' as TileType,
    title: '',
    subtitle: '',
    url: '',
    notes: ''
  })

  // Get current folder path for breadcrumbs
  const getBreadcrumbs = () => {
    const breadcrumbs: Array<{id: string | null, name: string}> = [
      { id: null, name: 'Personal' }
    ]
    
    let folderId = currentFolderId
    while (folderId) {
      const folder = tiles.find(t => t.id === folderId && t.type === 'folder')
      if (folder) {
        breadcrumbs.unshift({ id: folder.id, name: folder.title })
        folderId = folder.parentId || null
      } else {
        break
      }
    }
    
    return breadcrumbs
  }

  // Get tiles for current folder
  const getCurrentTiles = () => {
    return tiles.filter(tile => tile.parentId === currentFolderId)
  }

  // Icons for different tile types
  const getTileIcon = (type: TileType) => {
    switch (type) {
      case 'folder':
        return (
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M10 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2h-8l-2-2z"/>
          </svg>
        )
      case 'doc':
        return (
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M14,2H6A2,2 0 0,0 4,4V20A2,2 0 0,0 6,22H18A2,2 0 0,0 20,20V8L14,2M18,20H6V4H13V9H18V20Z"/>
          </svg>
        )
      case 'sheet':
        return (
          <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
            <path d="M19,3H5C3.9,3 3,3.9 3,5V19A2,2 0 0,0 5,21H19A2,2 0 0,0 21,19V5C21,3.9 20.1,3 19,3M19,19H5V5H19V19M7,7V9H17V7H7M7,11V13H17V11H7M7,15V17H17V15H7Z"/>
          </svg>
        )
    }
  }

  // Get tile color
  const getTileColor = (type: TileType) => {
    switch (type) {
      case 'folder': return 'text-blue-400'
      case 'doc': return 'text-blue-600'
      case 'sheet': return 'text-green-600'
    }
  }

  // Handle tile click
  const handleTileClick = (tile: FileTile) => {
    if (tile.type === 'folder') {
      setCurrentFolderId(tile.id)
    } else {
      // Open doc/sheet in new tab
      if (tile.url) {
        window.open(tile.url, '_blank')
      }
    }
  }

  // Handle create new tile
  const handleCreateTile = () => {
    if (!formData.title.trim()) return

    const newTile: FileTile = {
      id: Date.now().toString(),
      type: formData.type,
      title: formData.title.trim(),
      subtitle: formData.subtitle.trim() || undefined,
      url: formData.url.trim() || undefined,
      notes: formData.notes.trim() || undefined,
      parentId: currentFolderId || undefined
    }

    setTiles(prev => [...prev, newTile])
    setShowCreateModal(false)
    setFormData({ type: 'folder', title: '', subtitle: '', url: '', notes: '' })
  }

  // Handle edit tile
  const handleEditTile = () => {
    if (!editingTile || !formData.title.trim()) return

    setTiles(prev => prev.map(tile => 
      tile.id === editingTile.id 
        ? {
            ...tile,
            title: formData.title.trim(),
            subtitle: formData.subtitle.trim() || undefined,
            url: formData.url.trim() || undefined,
            notes: formData.notes.trim() || undefined
          }
        : tile
    ))
    
    setEditingTile(null)
    setFormData({ type: 'folder', title: '', subtitle: '', url: '', notes: '' })
  }

  // Handle delete tile
  const handleDeleteTile = (tileId: string) => {
    if (!confirm('Delete this item?')) return

    // Delete the tile and any nested items
    const deleteRecursive = (id: string) => {
      const tile = tiles.find(t => t.id === id)
      if (tile?.type === 'folder') {
        // Delete all children first
        tiles.filter(t => t.parentId === id).forEach(child => deleteRecursive(child.id))
      }
      setTiles(prev => prev.filter(t => t.id !== id))
    }

    deleteRecursive(tileId)
  }

  // Open edit modal
  const openEditModal = (tile: FileTile) => {
    setEditingTile(tile)
    setFormData({
      type: tile.type,
      title: tile.title,
      subtitle: tile.subtitle || '',
      url: tile.url || '',
      notes: tile.notes || ''
    })
  }

  const breadcrumbs = getBreadcrumbs()
  const currentTiles = getCurrentTiles()

  return (
    <main className="min-h-screen p-4 md:p-6 max-w-[1400px] mx-auto bg-[#0f1419]">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div className="flex items-center gap-4">
          <button
            onClick={() => router.push('/')}
            className="p-2 text-gray-400 hover:text-white transition-colors rounded-lg hover:bg-[#16213e]"
            title="Back to Dashboard"
          >
            <svg className="w-6 h-6" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
          </button>
          <h1 className="text-2xl font-bold text-white">Personal File Hub</h1>
        </div>
        
        <button
          onClick={() => setShowCreateModal(true)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors flex items-center gap-2"
        >
          <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6v6m0 0v6m0-6h6m-6 0H6" />
          </svg>
          New
        </button>
      </div>

      {/* Breadcrumbs */}
      <div className="flex items-center gap-2 mb-6 text-sm">
        {breadcrumbs.map((crumb, index) => (
          <div key={crumb.id || 'root'} className="flex items-center gap-2">
            {index > 0 && (
              <svg className="w-4 h-4 text-gray-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            )}
            <button
              onClick={() => setCurrentFolderId(crumb.id)}
              className={`${
                index === breadcrumbs.length - 1 
                  ? 'text-white font-medium' 
                  : 'text-gray-400 hover:text-white'
              } transition-colors`}
            >
              {crumb.name}
            </button>
          </div>
        ))}
      </div>

      {/* Tiles Grid */}
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-4">
        {currentTiles.map(tile => (
          <div
            key={tile.id}
            className="bg-[#16213e] rounded-xl p-4 hover:bg-[#1a2447] transition-colors cursor-pointer group"
          >
            {/* Tile Content */}
            <div onClick={() => handleTileClick(tile)} className="mb-3">
              <div className={`${getTileColor(tile.type)} mb-3 flex justify-center`}>
                {getTileIcon(tile.type)}
              </div>
              <h3 className="text-white text-sm font-medium mb-1 line-clamp-2">
                {tile.title}
              </h3>
              {tile.subtitle && (
                <p className="text-gray-400 text-xs line-clamp-1">
                  {tile.subtitle}
                </p>
              )}
            </div>

            {/* Tile Actions */}
            <div className="flex justify-end gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  openEditModal(tile)
                }}
                className="p-1 text-gray-400 hover:text-white rounded"
                title="Edit"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                </svg>
              </button>
              <button
                onClick={(e) => {
                  e.stopPropagation()
                  handleDeleteTile(tile.id)
                }}
                className="p-1 text-gray-400 hover:text-red-400 rounded"
                title="Delete"
              >
                <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
              </button>
            </div>
          </div>
        ))}

        {/* Empty State */}
        {currentTiles.length === 0 && (
          <div className="col-span-full text-center py-12">
            <div className="text-gray-400 mb-4">
              <svg className="w-16 h-16 mx-auto mb-4 opacity-50" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1} d="M9 13h6m-3-3v6m-9 1V7a2 2 0 012-2h6l2 2h6a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2z" />
              </svg>
            </div>
            <p className="text-gray-400 mb-4">This folder is empty</p>
            <button
              onClick={() => setShowCreateModal(true)}
              className="text-blue-400 hover:text-blue-300 transition-colors"
            >
              Create your first item
            </button>
          </div>
        )}
      </div>

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16213e] rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">Create New Item</h2>
            
            <div className="space-y-4">
              {/* Type Selection */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-2">
                  Type
                </label>
                <div className="flex gap-2">
                  {(['folder', 'doc', 'sheet'] as TileType[]).map(type => (
                    <button
                      key={type}
                      onClick={() => setFormData(prev => ({ ...prev, type }))}
                      className={`flex-1 p-2 rounded-lg text-sm font-medium transition-colors ${
                        formData.type === type
                          ? 'bg-blue-600 text-white'
                          : 'bg-[#1a2447] text-gray-300 hover:bg-[#1e2951]'
                      }`}
                    >
                      {type === 'folder' ? 'Folder' : type === 'doc' ? 'Google Doc' : 'Google Sheet'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter title..."
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional subtitle..."
                />
              </div>

              {/* URL (only for docs/sheets) */}
              {formData.type !== 'folder' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    URL *
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.google.com/..."
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setShowCreateModal(false)
                  setFormData({ type: 'folder', title: '', subtitle: '', url: '', notes: '' })
                }}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleCreateTile}
                disabled={!formData.title.trim() || (formData.type !== 'folder' && !formData.url.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Create
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Edit Modal */}
      {editingTile && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center p-4 z-50">
          <div className="bg-[#16213e] rounded-xl p-6 max-w-md w-full">
            <h2 className="text-xl font-bold text-white mb-4">Edit {editingTile.title}</h2>
            
            <div className="space-y-4">
              {/* Title */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Title *
                </label>
                <input
                  type="text"
                  value={formData.title}
                  onChange={(e) => setFormData(prev => ({ ...prev, title: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Enter title..."
                />
              </div>

              {/* Subtitle */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Subtitle
                </label>
                <input
                  type="text"
                  value={formData.subtitle}
                  onChange={(e) => setFormData(prev => ({ ...prev, subtitle: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  placeholder="Optional subtitle..."
                />
              </div>

              {/* URL (only for docs/sheets) */}
              {editingTile.type !== 'folder' && (
                <div>
                  <label className="block text-sm font-medium text-gray-300 mb-1">
                    URL *
                  </label>
                  <input
                    type="url"
                    value={formData.url}
                    onChange={(e) => setFormData(prev => ({ ...prev, url: e.target.value }))}
                    className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    placeholder="https://docs.google.com/..."
                  />
                </div>
              )}

              {/* Notes */}
              <div>
                <label className="block text-sm font-medium text-gray-300 mb-1">
                  Notes
                </label>
                <textarea
                  value={formData.notes}
                  onChange={(e) => setFormData(prev => ({ ...prev, notes: e.target.value }))}
                  className="w-full bg-[#1a2447] text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 h-20 resize-none"
                  placeholder="Optional notes..."
                />
              </div>
            </div>

            <div className="flex justify-end gap-3 mt-6">
              <button
                onClick={() => {
                  setEditingTile(null)
                  setFormData({ type: 'folder', title: '', subtitle: '', url: '', notes: '' })
                }}
                className="px-4 py-2 text-gray-300 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleEditTile}
                disabled={!formData.title.trim() || (editingTile.type !== 'folder' && !formData.url.trim())}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 disabled:bg-gray-600 disabled:opacity-50 text-white rounded-lg transition-colors"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  )
}