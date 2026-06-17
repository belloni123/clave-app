const { createClient } = require('@supabase/supabase-js')

// Carregar variáveis de ambiente do .env.local
try {
  require('dotenv').config({ path: '.env.local' })
} catch (e) {
  // Ignorar se dotenv não estiver instalado
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!supabaseUrl || !supabaseServiceKey) {
  console.error('ERRO: Variáveis de ambiente SUPABASE_SERVICE_ROLE_KEY ou NEXT_PUBLIC_SUPABASE_URL não encontradas no .env.local!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false
  }
})

async function makeAdmin() {
  const email = process.argv[2]
  if (!email) {
    console.error('Por favor, informe o e-mail do usuário como argumento do comando.')
    console.log('Exemplo: node scratch_make_admin.js seu-email@dominio.com')
    process.exit(1)
  }

  console.log(`Buscando usuário com e-mail: ${email}...`)
  
  const { data: { users }, error: listError } = await supabase.auth.admin.listUsers()
  
  if (listError) {
    console.error('Erro ao listar usuários:', listError)
    return
  }

  const targetUser = users.find(u => u.email.toLowerCase() === email.toLowerCase())

  if (!targetUser) {
    console.error(`ERRO: Usuário com e-mail ${email} não encontrado no Auth do Supabase. Certifique-se de ativá-lo/criá-lo na tela de login primeiro.`)
    return
  }

  console.log(`Usuário encontrado. Atualizando perfil ID: ${targetUser.id} para role = 'admin'...`)
  
  const { data, error } = await supabase
    .from('profiles')
    .update({ role: 'admin' })
    .eq('id', targetUser.id)
    .select()

  if (error) {
    console.error('Erro ao atualizar perfil no banco:', error)
  } else {
    console.log('SUCESSO! O perfil do usuário agora é administrador:', data)
  }
}

makeAdmin()
