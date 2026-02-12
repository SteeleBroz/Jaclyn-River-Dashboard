'use client'

import { useParams, useRouter } from 'next/navigation'
import { useEffect, useState } from 'react'
import { supabase, Folder } from '@/lib/supabase'

export default function FolderPage() {
  const params = useParams()
  const router = useRouter()
  const folderSlug = params.slug as string
  const [folders, setFolders] = useState<Folder[]>([])
  const [currentFolder, setCurrentFolder] = useState<Folder | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchFolders = async () => {
      try {
        const { data: f } = await supabase.from('dash_folders').select('*').order('id')
        if (f) {
          setFolders(f)
          const folder = f.find(folder => folder.name.toLowerCase().replace(/\s+/g, '-') === folderSlug)
          setCurrentFolder(folder || null)
        }
      } catch (error) {
        console.error('Error fetching folders:', error)
      } finally {
        setLoading(false)
      }
    }

    fetchFolders()
  }, [folderSlug])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="text-xl text-gray-400 animate-pulse">Loading...</div>
      </div>
    )
  }

  if (!currentFolder) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#0f1419]">
        <div className="text-center">
          <div className="text-xl text-gray-400 mb-4">Folder not found</div>
          <button
            onClick={() => router.push('/')}
            className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition-colors"
          >
            Back to Dashboard
          </button>
        </div>
      </div>
    )
  }

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
          <div className="flex items-center gap-3">
            <div
              className="w-4 h-4 rounded-full"
              style={{ backgroundColor: currentFolder.color }}
            />
            <h1 className="text-2xl font-bold text-white">{currentFolder.name}</h1>
          </div>
        </div>
      </div>

      {/* Placeholder Content */}
      <div className="bg-[#16213e] rounded-xl p-8 text-center">
        <div className="mb-6">
          <div
            className="w-16 h-16 rounded-full mx-auto mb-4"
            style={{ backgroundColor: currentFolder.color + '40' }}
          />
          <h2 className="text-xl font-semibold text-white mb-2">
            {currentFolder.name} Dashboard
          </h2>
          <p className="text-gray-400">
            This folder dashboard is coming soon. It will have its own purpose, persona, and voice.
          </p>
        </div>

        <div className="bg-[#1a1a2e] rounded-lg p-6 max-w-md mx-auto">
          <h3 className="text-sm font-medium text-gray-300 mb-3">Planned Features</h3>
          <ul className="text-sm text-gray-400 space-y-2 text-left">
            <li>• Dedicated workspace for {currentFolder.name.toLowerCase()} tasks</li>
            <li>• Custom workflow and tools</li>
            <li>• Personalized interface and voice</li>
            <li>• Integration with main dashboard when needed</li>
          </ul>
        </div>
      </div>
    </main>
  )
}