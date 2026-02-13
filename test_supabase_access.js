import { createClient } from '@supabase/supabase-js'

const supabaseUrl = 'https://ltllzovnblcukvrgkpfx.supabase.co'
const supabaseKey = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imx0bGx6b3ZuYmxjdWt2cmdrcGZ4Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAzNTYyOTEsImV4cCI6MjA4NTkzMjI5MX0.SyWoFAlz1N0If2WBJnCNv_Y7QyRQ56F9VxM6I7mAdvY'

const supabase = createClient(supabaseUrl, supabaseKey)

async function testAccess() {
  try {
    // Test if we can access the database  
    const { data: folders, error } = await supabase
      .from('folders')
      .select('*')
      .limit(1)
    
    if (error) {
      console.error('Database access error:', error)
      return
    }
    
    console.log('✅ Database access confirmed')
    
    // Try to check if dashboard_settings table exists
    const { data: settings, error: settingsError } = await supabase
      .from('dashboard_settings')
      .select('*')
      .limit(1)
    
    if (settingsError) {
      if (settingsError.code === '42P01') {
        console.log('❌ dashboard_settings table does not exist')
        console.log('Creating via SQL is required - please run the SQL in Supabase dashboard')
        return false
      } else {
        console.error('Settings table error:', settingsError)
        return false
      }
    }
    
    console.log('✅ dashboard_settings table exists')
    console.log('Current settings:', settings)
    return true
    
  } catch (error) {
    console.error('Connection error:', error)
    return false
  }
}

testAccess().then(exists => {
  if (!exists) {
    console.log('\n🔧 Manual step required:')
    console.log('1. Go to https://supabase.com/dashboard/project/ltllzovnblcukvrgkpfx/sql')
    console.log('2. Run the SQL from create_dashboard_settings.js')
    console.log('3. Then continue with the build')
  }
})