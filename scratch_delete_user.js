import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERRO: Variáveis de ambiente não foram carregadas!')
  process.exit(1)
}

// Inicializar cliente do Supabase com a chave de serviço (Admin)
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function deleteUser() {
  const emailToDelete = 'felipe@agenciabl6.com.br'
  console.log(`Buscando usuário com e-mail: ${emailToDelete}...`)
  
  // Como a service_role_key permite listar usuários, podemos buscar e deletar
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return
  }

  const targetUser = users.find(u => u.email === emailToDelete)

  if (!targetUser) {
    console.log('Usuário não encontrado no banco (provavelmente já foi deletado).')
    return
  }

  console.log(`Deletando usuário ID: ${targetUser.id}...`)
  const { error: deleteError } = await supabase.auth.admin.deleteUser(targetUser.id)

  if (deleteError) {
    console.error('Erro ao deletar usuário:', deleteError)
  } else {
    console.log('USUÁRIO DELETADO COM SUCESSO!')
  }
}

deleteUser()
