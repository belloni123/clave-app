import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

console.log('Testando Supabase URL:', supabaseUrl)
console.log('Anon Key parcial:', supabaseAnonKey?.substring(0, 20) + '...')

if (!supabaseUrl || !supabaseAnonKey) {
  console.error('ERRO: Variáveis de ambiente não foram carregadas!')
  process.exit(1)
}

const supabase = createClient(supabaseUrl, supabaseAnonKey)

async function testSignUp() {
  console.log('Tentando cadastrar felipe@agenciabl6.com.br...')
  try {
    const { data, error } = await supabase.auth.signUp({
      email: 'felipe@agenciabl6.com.br',
      password: 'SenhaDeTeste123!',
    })

    if (error) {
      console.error('ERRO NO SIGNUP:', error)
    } else {
      console.log('SUCESSO NO SIGNUP!')
      console.log('Dados do usuário:', data.user ? {
        id: data.user.id,
        email: data.user.email,
        identities: data.user.identities,
        confirmation_sent_at: data.user.confirmation_sent_at
      } : 'Nenhum usuário retornado')
    }
  } catch (err) {
    console.error('Exceção capturada:', err)
  }
}

testSignUp()
