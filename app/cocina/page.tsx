"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { Clock, CheckCircle2, Flame, UtensilsCrossed, Loader2, Check, LogOut, ChefHat, ArrowLeft } from 'lucide-react';
import Link from 'next/link';

// --- INTERFACES ESTRICTAS PARA TYPESCRIPT ---
interface UsuarioLogueado {
  id: string;
  nombre: string;
  rol: string;
}

interface RecetaItem {
  insumos: { nombre: string };
}

interface PedidoItem { 
  id: string; 
  cantidad: number; 
  notas: string; 
  estado: string; 
  productos: { 
    nombre: string; 
    categoria: string; 
    recetas: RecetaItem[]; 
  }; 
}

interface Pedido { 
  id: string; 
  fecha: string; 
  total: number; 
  tipo_servicio: string; 
  estado: string; 
  pedido_items: PedidoItem[]; 
}

export default function CocinaKDS() {
  // Eliminamos el <any> y usamos nuestra nueva interfaz
  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [puedeVolver, setPuedeVolver] = useState(false); 
  const [pinLogin, setPinLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const [pedidos, setPedidos] = useState<Pedido[]>([]);
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    const userGuardado = localStorage.getItem('usuarioRestaSoft');
    if (userGuardado) {
      const parsed = JSON.parse(userGuardado);
      setUsuarioActivo(parsed);
      
      const guardados = localStorage.getItem('roles_permisos_restasoft');
      const matriz = guardados ? JSON.parse(guardados) : null;
      if (parsed.rol === 'admin' || (matriz && matriz[parsed.rol]?.caja)) {
        setPuedeVolver(true);
      }
    }
  }, []);

  const handleLogin = async () => {
    if (pinLogin.length !== 4) return;
    setCargando(true);
    const { data } = await supabase.from('usuarios').select('*').eq('pin', pinLogin).single();
    
    const guardados = localStorage.getItem('roles_permisos_restasoft');
    const matriz = guardados ? JSON.parse(guardados) : null;
    const tienePermisoCocina = data?.rol === 'admin' || (matriz && matriz[data?.rol]?.cocina);

    if (data && (tienePermisoCocina || ['admin', 'gerente', 'cocina', 'subgerente'].includes(data.rol))) {
      setUsuarioActivo(data);
      localStorage.setItem('usuarioRestaSoft', JSON.stringify(data));
      
      if (data.rol === 'admin' || (matriz && matriz[data.rol]?.caja)) {
        setPuedeVolver(true);
      } else {
        setPuedeVolver(false);
      }

      setPinLogin("");
    } else if (data) {
      setErrorLogin("No tienes permiso de Cocina");
      setTimeout(() => setErrorLogin(""), 3000);
      setPinLogin("");
    } else {
      setErrorLogin("PIN Incorrecto");
      setTimeout(() => setErrorLogin(""), 3000);
      setPinLogin("");
    }
    setCargando(false);
  };

  const fetchPedidos = useCallback(async () => {
    try {
      const { data, error } = await supabase.from('pedidos')
        .select(`
          *, 
          pedido_items (
            id, 
            cantidad, 
            notas, 
            estado, 
            productos (
              nombre, 
              categoria,
              recetas (
                insumos (nombre)
              )
            )
          )
        `)
        .eq('estado', 'pendiente').order('fecha', { ascending: true });
      if (error) throw error;
      
      // Eliminamos el <any> y usamos PedidoItem
      const pedidosFiltrados = (data || []).filter(p => p.pedido_items && p.pedido_items.some((item: PedidoItem) => item.estado === 'pendiente'));
      setPedidos(pedidosFiltrados);
    } catch (err) {
      console.error("Error cargando pedidos:", err);
    } finally {
      setCargando(false);
    }
  }, []);

  useEffect(() => {
    if (!usuarioActivo) {
       setCargando(false);
       return;
    }
    fetchPedidos();
    const channel = supabase.channel('cambios-cocina')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedidos' }, () => { setTimeout(fetchPedidos, 300); })
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pedido_items' }, () => { setTimeout(fetchPedidos, 300); })
      .subscribe();
    return () => { supabase.removeChannel(channel); };
  }, [fetchPedidos, usuarioActivo]);

  const completarPedido = async (id: string) => {
    try {
      await supabase.from('pedidos').update({ estado: 'completado' }).eq('id', id);
      await supabase.from('pedido_items').update({ estado: 'entregado' }).eq('pedido_id', id);
      setPedidos(prev => prev.filter(p => p.id !== id));
    } catch (err) {
      console.error("Error al completar:", err);
    }
  };

  if (!usuarioActivo && !cargando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <div className="bg-orange-600 p-4 rounded-3xl mb-8 shadow-xl shadow-orange-600/20"><Flame size={48}/></div>
        <div className="bg-slate-800 p-10 rounded-[48px] shadow-2xl w-full max-w-sm text-center border border-slate-700">
          <h2 className="text-xl font-bold uppercase mb-2 text-white">Acceso a Cocina</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Ingresa tu PIN</p>
          <div className="text-5xl tracking-[0.5em] mb-8 font-black text-white h-14 bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-slate-700">{pinLogin.padEnd(4, '•')}</div>
          {errorLogin && <p className="text-red-400 font-bold text-sm mb-4 animate-bounce">{errorLogin}</p>}
          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + n) }} className="bg-slate-700 border border-slate-600 p-5 rounded-2xl text-2xl font-black text-white hover:bg-slate-600 transition-all active:scale-95">{n}</button>
            ))}
            <button onClick={() => setPinLogin("")} className="bg-red-500/20 border border-red-500/30 text-red-400 p-5 rounded-2xl font-black hover:bg-red-500/30 transition-all active:scale-95">C</button>
            <button onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + '0') }} className="bg-slate-700 border border-slate-600 p-5 rounded-2xl text-2xl font-black text-white hover:bg-slate-600 transition-all active:scale-95">0</button>
            <button onClick={handleLogin} className="bg-orange-600 text-white p-5 rounded-2xl font-black hover:bg-orange-500 shadow-lg flex items-center justify-center transition-all active:scale-95"><Check size={32}/></button>
          </div>
          <Link href="/" className="mt-8 block text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-white">Volver al POS</Link>
        </div>
      </div>
    );
  }

  if (cargando) return <div className="min-h-screen bg-slate-900 flex flex-col items-center justify-center text-white"><Loader2 className="animate-spin text-orange-500 mb-4" size={48} /></div>;

  return (
    <div className="min-h-screen bg-slate-900 p-8 font-sans">
      <header className="flex justify-between items-center mb-10">
        <div className="flex items-center gap-6">
          <div className="bg-orange-600 p-3 rounded-2xl shadow-lg shadow-orange-900/40"><Flame className="text-white animate-pulse" size={32} /></div>
          <div>
            <h1 className="text-4xl font-black text-white tracking-tighter leading-none uppercase">Órdenes <span className="text-orange-500">Cocina</span></h1>
            <p className="text-slate-400 font-bold uppercase text-[10px] tracking-[0.2em] mt-2">Monitor de Producción Realtime</p>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-3 bg-slate-800/80 px-5 py-3 rounded-2xl border border-slate-700 shadow-inner">
             <ChefHat size={24} className="text-orange-500" />
             <div className="flex flex-col text-left mr-2">
               <span className="text-[9px] text-slate-400 font-black uppercase tracking-widest">Chef a Cargo</span>
               <span className="text-base text-white font-black uppercase leading-tight">{usuarioActivo?.nombre}</span>
             </div>
          </div>

          {puedeVolver && (
            <Link href="/" className="flex items-center gap-2 bg-indigo-950 px-5 py-4 rounded-2xl text-white hover:bg-indigo-800 transition-all border border-indigo-900 font-black uppercase text-xs tracking-widest group shadow-md">
              <ArrowLeft size={20} className="group-hover:-translate-x-1 transition-transform" /> Volver a Caja
            </Link>
          )}

          <button onClick={() => { setUsuarioActivo(null); setPuedeVolver(false); localStorage.removeItem('usuarioRestaSoft'); }} className="flex items-center gap-2 bg-slate-800 px-5 py-4 rounded-2xl text-slate-400 hover:text-white hover:bg-red-500 transition-all border border-slate-700 font-black uppercase text-xs tracking-widest group shadow-md">
            <LogOut size={20} className="group-hover:-translate-x-1 transition-transform" /> Salir
          </button>
        </div>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
        {pedidos.map((pedido) => (
          <div key={pedido.id} className="bg-white rounded-4xl overflow-hidden shadow-2xl flex flex-col border-t-8 border-orange-500 animate-in fade-in slide-in-from-bottom-4 duration-500">
            <div className="p-6 border-b border-slate-100 bg-slate-50/50">
              <div className="flex justify-between items-start mb-2">
                <span className="bg-indigo-950 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">#{pedido.id.slice(0, 4)}</span>
                <span className="flex items-center gap-1 text-slate-400 text-xs font-bold"><Clock size={14} />{new Date(pedido.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <h2 className="text-2xl font-black text-indigo-950 uppercase italic tracking-tighter">{pedido.tipo_servicio}</h2>
            </div>
            
            <div className="p-6 grow space-y-5">
              {/* Eliminamos el <any> y usamos PedidoItem */}
              {pedido.pedido_items.filter((item: PedidoItem) => item.estado === 'pendiente').map((item) => (
                <div key={item.id} className="border-l-4 border-orange-500 pl-4 py-1 bg-slate-50/50 rounded-r-xl">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl font-black text-orange-600 leading-none">{item.cantidad}x</span>
                    <div className="flex flex-col">
                      <span className="text-lg font-black text-indigo-950 uppercase leading-none tracking-tight">{item.productos?.nombre || "Producto"}</span>
                      {item.productos?.recetas && item.productos.recetas.length > 0 && (
                        <p className="text-[10px] text-slate-500 font-bold uppercase mt-2 leading-tight">
                          <span className="text-slate-400 mr-1">Ingredientes:</span> 
                          {/* Eliminamos el <any> y usamos RecetaItem */}
                          {item.productos.recetas.map((r: RecetaItem) => r.insumos?.nombre).filter(Boolean).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                  {item.notas && (
                    <div className="mt-3 bg-amber-100/50 p-3 rounded-xl border border-amber-200 flex items-start gap-2">
                      <p className="text-[11px] text-amber-900 font-black italic uppercase leading-tight">⚠️ {item.notas}</p>
                    </div>
                  )}
                </div>
              ))}
            </div>

            <button onClick={() => completarPedido(pedido.id)} className="m-6 bg-emerald-500 hover:bg-emerald-600 text-white font-black py-4 rounded-2xl shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all active:scale-95 group">
              <CheckCircle2 size={24} className="group-hover:scale-110 transition-transform" /> DESPACHAR ORDEN
            </button>
          </div>
        ))}

        {pedidos.length === 0 && (
          <div className="col-span-full h-80 flex flex-col items-center justify-center text-slate-700 border-2 border-dashed border-slate-800 rounded-[40px]">
            <UtensilsCrossed size={60} className="opacity-10 mb-4" />
            <p className="font-black text-lg uppercase tracking-widest opacity-20 italic">Todo en orden, Chef</p>
          </div>
        )}
      </div>
    </div>
  );
}