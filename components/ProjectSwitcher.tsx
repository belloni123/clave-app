'use client'

import React, { useState, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { createClient } from '@/utils/supabase/client'
import { useAppStore, Project } from '@/store/useAppStore'
import { Pencil, Plus, Check, Trash2, X } from 'lucide-react'

const PROJ_COLORS = [
  '#534AB7', // Purple
  '#1D9E75', // Green
  '#185FA5', // Blue
  '#D85A30', // Coral
  '#BA7517', // Amber
  '#888780', // Gray
  '#C2407A', // Pink
  '#2E9CBF', // Light Blue
]

export default function ProjectSwitcher() {
  const queryClient = useQueryClient()
  const supabase = createClient()
  const {
    projects,
    setProjects,
    activeProjectId,
    setActiveProjectId,
    getActiveProject,
    profile,
    showToast,
    sidebarCollapsed,
  } = useAppStore()

  const [ddOpen, setDdOpen] = useState(false)
  const [modalOpen, setModalOpen] = useState(false)
  const [editId, setEditId] = useState<string | null>(null)
  const [projName, setProjName] = useState('')
  const [selectedColor, setSelectedColor] = useState(PROJ_COLORS[0])
  const [mounted, setMounted] = useState(false)
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false)
  const dropdownRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    setMounted(true)
    return () => setMounted(false)
  }, [])

  // 1. QUERY PROJECTS
  const { data: dbProjects } = useQuery({
    queryKey: ['projects', profile?.id],
    queryFn: async () => {
      if (!profile?.id) return []
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .is('deleted_at', null)
        .order('created_at', { ascending: true })

      if (error) {
        showToast('Erro ao carregar projetos', 'err')
        return []
      }

      // Se não houver projetos, criar o "Projeto padrão"
      if (data.length === 0) {
        const { data: newProj, error: createError } = await supabase
          .from('projects')
          .insert({
            user_id: profile.id,
            name: 'Projeto padrão',
            color: PROJ_COLORS[0],
          })
          .select()
          .single()

        if (createError) {
          showToast('Erro ao inicializar projeto padrão', 'err')
          return []
        }
        return [newProj]
      }

      return data as Project[]
    },
    enabled: !!profile?.id,
  })

  // Sincronizar projetos do DB com o Zustand Store
  useEffect(() => {
    if (dbProjects) {
      setProjects(dbProjects)
      if (dbProjects.length > 0 && !activeProjectId) {
        setActiveProjectId(dbProjects[0].id)
      }
    }
  }, [dbProjects, setProjects, activeProjectId, setActiveProjectId])

  // Fechar dropdown ao clicar fora
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDdOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const activeProj = getActiveProject()

  // 2. MUTATION CREATE/EDIT
  const saveProjectMutation = useMutation({
    mutationFn: async (payload: { id?: string; name: string; color: string }) => {
      if (payload.id) {
        // Edit
        const { error } = await supabase
          .from('projects')
          .update({ name: payload.name, color: payload.color })
          .eq('id', payload.id)
        if (error) throw error
      } else {
        // Create
        if (profile?.role !== 'admin') {
          throw new Error('Apenas administradores podem criar projetos.')
        }
        const maxLimit = Infinity
        if (projects.length >= maxLimit) {
          throw new Error(`Limite de ${maxLimit} projetos atingido.`)
        }
        const { error } = await supabase
          .from('projects')
          .insert({
            user_id: profile!.id,
            name: payload.name,
            color: payload.color,
          })
        if (error) throw error
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      showToast(editId ? 'Projeto atualizado' : 'Projeto criado com sucesso')
      closeModal()
    },
    onError: (err: Error) => {
      showToast(err.message || 'Erro ao salvar projeto', 'err')
    },
  })

  // 3. MUTATION DELETE (SOFT DELETE)
  const deleteProjectMutation = useMutation({
    mutationFn: async (id: string) => {
      if (profile?.role !== 'admin') {
        throw new Error('Apenas administradores podem excluir projetos.')
      }
      const { error } = await supabase
        .from('projects')
        .update({ deleted_at: new Date().toISOString() })
        .eq('id', id)
      if (error) throw error
    },
    onSuccess: (_, id) => {
      queryClient.invalidateQueries({ queryKey: ['projects'] })
      showToast('Projeto excluído com sucesso')
      if (activeProjectId === id) {
        // Se deletou o ativo, muda pro primeiro restante
        const remaining = projects.filter((p) => p.id !== id)
        if (remaining.length > 0) {
          setActiveProjectId(remaining[0].id)
        }
      }
      closeModal()
    },
    onError: () => {
      showToast('Erro ao excluir projeto', 'err')
    },
  })

  const openCreateModal = () => {
    setEditId(null)
    setProjName('')
    setSelectedColor(PROJ_COLORS[0])
    setDdOpen(false)
    setModalOpen(true)
  }

  const openEditModal = (p: Project, e: React.MouseEvent) => {
    e.stopPropagation()
    setEditId(p.id)
    setProjName(p.name)
    setSelectedColor(p.color)
    setDdOpen(false)
    setModalOpen(true)
  }

  const closeModal = () => {
    setModalOpen(false)
    setEditId(null)
    setProjName('')
    setIsConfirmingDelete(false)
  }

  const handleSave = () => {
    if (!projName.trim()) return
    saveProjectMutation.mutate({
      id: editId || undefined,
      name: projName.trim(),
      color: selectedColor,
    })
  }

  const handleDelete = () => {
    if (!editId) return
    if (projects.length <= 1) {
      showToast('Não é possível excluir o único projeto', 'err')
      return
    }
    setIsConfirmingDelete(true)
  }

  const maxLimit = Infinity
  const maxReached = projects.length >= maxLimit

  return (
    <div className="relative px-3 py-2 border-b border-border-custom" ref={dropdownRef}>
      {/* Botão de Toggle */}
      <button
        onClick={() => setDdOpen(!ddOpen)}
        className="w-full flex items-center gap-2 p-1.5 rounded-lg border border-border2 bg-surface cursor-pointer font-sans transition-all duration-150 hover:border-text-custom min-w-0"
      >
        <div
          className="w-6 h-6 rounded-md flex items-center justify-center text-xs font-bold text-white shrink-0"
          style={{ background: activeProj?.color || '#534AB7' }}
        >
          {(activeProj?.name || '?')[0].toUpperCase()}
        </div>
        {!sidebarCollapsed && (
          <>
            <div className="flex-1 min-w-0 text-left">
              <div className="text-xs font-medium text-text-custom truncate">
                {activeProj?.name || 'Carregando...'}
              </div>
              <div className="text-[10px] text-text3 mt-0.5">Projeto ativo</div>
            </div>
            <span
              className={`text-text3 text-xs shrink-0 transition-transform duration-200 ${
                ddOpen ? 'rotate-180' : ''
              }`}
            >
              ▾
            </span>
          </>
        )}
      </button>

      {/* Dropdown Menu */}
      {ddOpen && (
        <div className="absolute top-[calc(100%+4px)] left-2 right-2 bg-surface border border-border2 rounded-lg shadow-xl z-50 overflow-hidden animate-[fadeUp_0.15s_ease_both]">
          <div className="px-3 py-2 flex justify-between items-center border-b border-border-custom text-[10px] font-semibold tracking-wider uppercase text-text3">
            <span>PROJETOS</span>
            <span>
              {projects.length}
            </span>
          </div>

          <div className="max-h-60 overflow-y-auto">
            {projects.map((p) => (
              <div
                key={p.id}
                onClick={() => {
                  setActiveProjectId(p.id)
                  setDdOpen(false)
                  showToast(`Projeto: ${p.name}`)
                }}
                className={`flex items-center gap-2 px-3 py-2 cursor-pointer transition-colors duration-100 hover:bg-surface2 ${
                  p.id === activeProjectId ? 'bg-surface2 font-medium' : ''
                }`}
              >
                <div
                  className="w-6 h-6 rounded-md flex items-center justify-center text-[10px] font-bold text-white shrink-0"
                  style={{ background: p.color }}
                >
                  {p.name[0].toUpperCase()}
                </div>
                <span className="text-xs text-text-custom flex-1 truncate">{p.name}</span>
                <button
                  onClick={(e) => openEditModal(p, e)}
                  className="p-1 text-text3 hover:text-text-custom hover:bg-surface rounded shrink-0 transition-colors"
                  title="Editar projeto"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                {p.id === activeProjectId && (
                  <Check className="w-4 h-4 text-green-custom shrink-0 ml-1" />
                )}
              </div>
            ))}
          </div>

          {profile?.role === 'admin' ? (
            maxReached ? (
              <div className="m-2 p-2 bg-amber-bg text-amber-t rounded text-[11px]">
                Limite de Infinitos projetos atingido.
              </div>
            ) : (
              <button
                onClick={openCreateModal}
                className="w-full flex items-center gap-2 px-3 py-2 cursor-pointer border-t border-border-custom text-text2 text-xs transition-colors hover:bg-surface2 hover:text-text-custom text-left"
              >
                <Plus className="w-4 h-4 shrink-0" />
                <span>Novo projeto</span>
              </button>
            )
          ) : (
            <div className="p-2 border-t border-border-custom text-center text-[10px] text-text3 italic">
              Apenas administradores podem criar projetos.
            </div>
          )}
        </div>
      )}

      {/* Modal Criar/Editar (Rendered outside the sidebar hierarchy using Portals to prevent Containing Block layout breaks) */}
      {mounted && modalOpen && createPortal(
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100] animate-[fadeUp_0.15s_ease_both] backdrop-blur-[1px]">
          <div className="bg-surface rounded-xl p-5 w-full max-w-[360px] shadow-2xl border border-border2">
            
            {isConfirmingDelete ? (
              /* Custom Confirm Delete Step */
              <div className="space-y-4 animate-[fadeIn_0.15s_ease_both]">
                <div className="flex justify-between items-center pb-2 border-b border-border-custom">
                  <p className="text-sm font-bold text-red-t flex items-center gap-1.5">
                    <Trash2 className="w-4 h-4" />
                    <span>Excluir Projeto</span>
                  </p>
                  <button onClick={closeModal} className="text-text3 hover:text-text-custom cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>
                
                <p className="text-xs text-text2 leading-relaxed">
                  Tem certeza que deseja excluir o projeto <strong className="text-text-custom">"{projName}"</strong>? 
                  Todos os dados de lançamentos, cronogramas e P&L vinculados a este projeto serão excluídos permanentemente.
                </p>

                <div className="flex gap-2.5 pt-2">
                  <button
                    onClick={() => setIsConfirmingDelete(false)}
                    className="flex-1 py-2 border border-border2 rounded-md text-xs hover:bg-surface2 text-text2 font-semibold transition-all duration-150 cursor-pointer"
                  >
                    Voltar
                  </button>
                  <button
                    onClick={() => deleteProjectMutation.mutate(editId!)}
                    disabled={deleteProjectMutation.isPending}
                    className="flex-1 py-2 bg-red-t hover:opacity-90 text-white rounded-md text-xs font-bold transition-all duration-150 flex items-center justify-center gap-1.5 shadow-sm cursor-pointer"
                  >
                    {deleteProjectMutation.isPending ? 'Excluindo...' : 'Confirmar'}
                  </button>
                </div>
              </div>
            ) : (
              /* Regular Create / Edit Form */
              <div className="animate-[fadeIn_0.15s_ease_both] space-y-4">
                <div className="flex justify-between items-center border-b border-border-custom pb-2">
                  <p className="text-sm font-bold text-text-custom">
                    {editId ? 'Editar projeto' : 'Novo projeto'}
                  </p>
                  <button onClick={closeModal} className="text-text3 hover:text-text-custom cursor-pointer">
                    <X className="w-5 h-5" />
                  </button>
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1 block">
                    Nome do projeto
                  </label>
                  <input
                    className="w-full px-3 py-2 text-xs border border-border2 rounded-md bg-surface text-text-custom outline-none focus:border-text-custom transition-colors"
                    value={projName}
                    onChange={(e) => setProjName(e.target.value)}
                    placeholder="Ex: Lançamento Thiago Santos"
                    maxLength={40}
                    autoFocus
                  />
                </div>

                <div>
                  <label className="text-xs font-semibold text-text2 mb-1.5 block">Cor</label>
                  <div className="flex gap-2 flex-wrap">
                    {PROJ_COLORS.map((c) => (
                      <div
                        key={c}
                        onClick={() => setSelectedColor(c)}
                        className={`w-6 h-6 rounded-md cursor-pointer border-2 transition-all duration-150 hover:scale-105 ${
                          c === selectedColor
                            ? 'border-text-custom scale-105'
                            : 'border-transparent'
                        }`}
                        style={{ background: c }}
                      />
                    ))}
                  </div>
                </div>

                <div className="flex justify-between items-center gap-2 pt-2">
                  {editId && profile?.role === 'admin' && (
                    <button
                      onClick={handleDelete}
                      disabled={projects.length <= 1}
                      className="px-3 py-2 border border-red-t/30 text-red-t rounded-md text-xs hover:bg-red-bg disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 flex items-center gap-1.5 cursor-pointer"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Excluir</span>
                    </button>
                  )}
                  <div className="flex gap-2 ml-auto">
                    <button
                      onClick={closeModal}
                      className="px-3 py-2 border border-border2 rounded-md text-xs hover:bg-surface2 text-text2 transition-all duration-150 cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      onClick={handleSave}
                      disabled={!projName.trim() || saveProjectMutation.isPending}
                      className="px-4 py-2 bg-purple-custom text-white rounded-md text-xs font-medium hover:opacity-90 disabled:opacity-40 disabled:cursor-not-allowed transition-all duration-150 shadow-sm cursor-pointer"
                    >
                      {saveProjectMutation.isPending ? 'Salvando...' : 'Salvar'}
                    </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  )
}
