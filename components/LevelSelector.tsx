'use client'

import React, { useEffect } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore, MaturityLevel } from '@/store/useAppStore'

const LEVELS: { key: MaturityLevel; name: string; color: string }[] = [
  { key: 'newbie', name: 'Fundação', color: '#888780' },
  { key: 'soft', name: 'Estruturação', color: '#1D9E75' },
  { key: 'hard', name: 'Tração', color: '#185FA5' },
  { key: 'pro', name: 'Expansão', color: '#534AB7' },
  { key: 'master', name: 'Escala', color: '#D85A30' },
]

export default function LevelSelector() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const {
    activeProjectId,
    getActiveProject,
    currentLevel,
    setCurrentLevel,
    showToast,
    sidebarCollapsed,
  } = useAppStore()

  const activeProj = getActiveProject()

  // Sincroniza o nível de maturidade do projeto ativo com a store do Zustand
  useEffect(() => {
    if (activeProj?.level) {
      setCurrentLevel(activeProj.level)
    }
  }, [activeProj, setCurrentLevel])

  const levelMutation = useMutation({
    mutationFn: async (level: MaturityLevel) => {
      if (!activeProjectId) return
      const { error } = await supabase
        .from('projects')
        .update({ level })
        .eq('id', activeProjectId)

      if (error) throw error
    },
    onSuccess: (_, level) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      setCurrentLevel(level)
      const levelNames: Record<MaturityLevel, string> = {
        newbie: 'Fundação',
        soft: 'Estruturação',
        hard: 'Tração',
        pro: 'Expansão',
        master: 'Escala',
      }
      showToast(`Maturidade atualizada para ${levelNames[level]}`)
    },
    onError: () => {
      showToast('Erro ao atualizar maturidade', 'err')
    },
  })

  const handleSelectLevel = (level: MaturityLevel) => {
    if (level === currentLevel || levelMutation.isPending) return
    levelMutation.mutate(level)
  }

  return (
    <div className="border-t border-border-custom p-2 shrink-0">
      {!sidebarCollapsed && (
        <div className="text-[10px] font-semibold tracking-wider uppercase text-text3 px-2 mb-1.5">
          MEU NÍVEL
        </div>
      )}
      <div className="flex flex-col gap-0.5">
        {LEVELS.map((lvl) => {
          const isActive = currentLevel === lvl.key
          return (
            <button
              key={lvl.key}
              onClick={() => handleSelectLevel(lvl.key)}
              className={`w-full flex items-center gap-2 p-1.5 rounded-md cursor-pointer transition-all duration-100 hover:bg-surface2 ${
                isActive ? 'bg-surface2 font-medium' : ''
              }`}
            >
              <div
                className="w-2.5 h-2.5 rounded-full shrink-0 transition-transform hover:scale-110"
                style={{ background: lvl.color }}
              />
              {!sidebarCollapsed && (
                <>
                  <span className="text-[11px] text-text-custom text-left flex-1">
                    {lvl.name}
                  </span>
                  {isActive && (
                    <span className="text-green-custom text-[11px] font-bold">✓</span>
                  )}
                </>
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}
