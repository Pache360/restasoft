import { createClient } from '@supabase/supabase-js';

// Esto nos dirá en la consola si las variables están llegando
console.log("URL de Supabase:", process.env.NEXT_PUBLIC_SUPABASE_URL ? "Detectada ✅" : "No detectada ❌");

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);