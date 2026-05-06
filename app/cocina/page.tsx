"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ChefHat, CheckCircle2, Clock, 
  ShieldCheck, Check, Loader2, LogOut, ArrowLeft, Utensils
} from 'lucide-react';
import Link from 'next/link';

// --- INTERFACES ---
interface UsuarioLogueado {
  id: string; nombre: string; rol: string;
}

interface Insumo {
  nombre: string;
  unidad_medida: string;
}

interface Receta {
  cantidad_requerida: number;
  insumos: Insumo;
}

interface Producto { 
  nombre: string; 
  recetas?: Receta[];
}

interface PedidoItem {
  id: string;
  cantidad: number;
  notas: string;
  estado: string;
  productos: Producto;
}

interface TicketCocina {
  id: string;
  tipo_servicio: string;
  mesero: string;
  created_at: string;
  pedido_items: PedidoItem[];
}

export default function CocinaMonitorPage() {
  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [pinLogin, setPinLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  const [cargando, setCargando] = useState(true);
  
  const [tickets, setTickets] = useState<TicketCocina[]>([]);
  const [procesandoItemId, setProcesandoItemId] = useState<string | null>(null);

  // --- LÓGICA DE LOGIN ---
  useEffect(() => {
    const userGuardado = localStorage.getItem('usuarioRestaSoft');
    if (userGuardado) {
      const parsed = JSON.parse(userGuardado);
      if (['cocina', 'admin', 'gerente', 'subgerente'].includes(parsed.rol)) {
        setUsuarioActivo(parsed);
      }
    }
    setCargando(false);
  }, []);

  const handleLogin = async () => {
    if (pinLogin.length !== 4) return;
    setCargando(true);
    const { data } = await supabase.from('usuarios').select('*').eq('pin', pinLogin).single();
    
    if (data && ['cocina', 'admin', 'gerente', 'subgerente'].includes(data.rol)) {
      setUsuarioActivo(data);
      localStorage.setItem('usuarioRestaSoft', JSON.stringify(data));
      setPinLogin("");
    } else if (data) {
      setErrorLogin("Acceso denegado: Tu rol no tiene acceso a cocina.");
    } else {
      setErrorLogin("PIN Incorrecto");
    }
    
    setTimeout(() => setErrorLogin(""), 3000);
    setPinLogin("");
    setCargando(false);
  };

  const cerrarSesion = () => {
    setUsuarioActivo(null);
    localStorage.removeItem('usuarioRestaSoft');
  };

  useEffect(() => {
    if (usuarioActivo) return; 
    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key >= '0' && e.key <= '9') setPinLogin(p => p.length < 4 ? p + e.key : p);
      else if (e.key === 'Backspace') setPinLogin(p => p.slice(0, -1));
      else if (e.key === 'Enter' && pinLogin.length === 4) handleLogin();
      else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') setPinLogin("");
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [usuarioActivo, pinLogin]);

  // --- LÓGICA DE COCINA (OBTENER PEDIDOS CON RECETA) ---
  const fetchTickets = useCallback(async () => {
    try {
      // AQUÍ OCURRE LA MAGIA: Traemos el pedido, los items, el producto y SU RECETA DESGLOSADA
      const { data, error } = await supabase
        .from('pedidos')
        .select(`
          id, tipo_servicio, mesero, created_at,
          pedido_items!inner(
            id, cantidad, notas, estado,
            productos (
              nombre,
              recetas (
                cantidad_requerida,
                insumos (nombre, unidad_medida)
              )
            )
          )
        `)
        .eq('pedido_items.estado', 'pendiente')
        .order('created_at', { ascending: true }); 

      if (error) throw error;
      setTickets(data as unknown as TicketCocina[] || []);
    } catch (error) {
      console.error("Error obteniendo tickets:", error);
    }
  }, []);

  // MAGIA INSTANTÁNEA: Supabase Realtime
  useEffect(() => {
    if (!usuarioActivo) return;
    
    fetchTickets(); 

    const canalCocina = supabase.channel('custom-cocina-channel')
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedido_items' },
        () => { fetchTickets(); }
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'pedidos' },
        () => { fetchTickets(); }
      )
      .subscribe();

    const intervalFallback = setInterval(fetchTickets, 10000);
    
    return () => {
      supabase.removeChannel(canalCocina);
      clearInterval(intervalFallback);
    };
  }, [usuarioActivo, fetchTickets]);

  const marcarItemComoListo = async (itemId: string) => {
    setProcesandoItemId(itemId);
    try {
      await supabase.from('pedido_items').update({ estado: 'entregado' }).eq('id', itemId);
      await fetchTickets(); 
    } catch (error) {
      console.error(error);
      alert("Error al marcar platillo como listo");
    } finally {
      setProcesandoItemId(null);
    }
  };

  // --- RENDERIZADO ---
  if (cargando && !usuarioActivo) {
    return <div className="h-screen bg-slate-900 flex items-center justify-center text-white"><Loader2 className="animate-spin mb-4" size={48} /></div>;
  }

  if (!usuarioActivo) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-slate-900 text-white font-sans">
        <div className="bg-orange-600 p-4 rounded-3xl mb-8 shadow-xl shadow-orange-600/20"><ChefHat size={48}/></div>
        <div className="bg-slate-800 p-10 rounded-[48px] text-white shadow-2xl w-full max-w-sm text-center border-4 border-slate-700">
          <h2 className="text-xl font-bold uppercase mb-2">Monitor de Cocina</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Ingresa tu PIN con el teclado</p>
          
          <div className="text-5xl tracking-[0.5em] mb-8 font-black text-orange-500 h-14 bg-slate-900 rounded-2xl flex items-center justify-center border-2 border-slate-700">
            {pinLogin.padEnd(4, '•')}
          </div>
          {errorLogin && <p className="text-red-500 font-bold text-sm mb-4 animate-bounce">{errorLogin}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + n) }} className="bg-slate-700 border-2 border-slate-600 p-5 rounded-2xl text-2xl font-black text-white hover:bg-slate-600 hover:border-orange-500 transition-all active:scale-95">{n}</button>
            ))}
            <button onClick={() => setPinLogin("")} className="bg-red-500/20 border-2 border-red-500/50 text-red-400 p-5 rounded-2xl font-black hover:bg-red-500/40 transition-all active:scale-95">C</button>
            <button onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + '0') }} className="bg-slate-700 border-2 border-slate-600 p-5 rounded-2xl text-2xl font-black text-white hover:bg-slate-600 hover:border-orange-500 transition-all active:scale-95">0</button>
            <button onClick={handleLogin} className="bg-emerald-500 text-white p-5 rounded-2xl font-black hover:bg-emerald-400 shadow-lg flex items-center justify-center transition-all active:scale-95"><Check size={32}/></button>
          </div>
          <Link href="/" className="mt-8 block text-slate-500 text-[10px] font-black uppercase tracking-widest hover:text-white">Volver a la Caja</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 font-sans flex flex-col">
      <header className="bg-slate-950 p-6 border-b border-slate-800 flex justify-between items-center shadow-lg">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-2 bg-slate-800 rounded-full hover:bg-slate-700 transition-colors"><ArrowLeft size={20} className="text-slate-300"/></Link>
          <div className="flex items-center gap-3">
            <div className="bg-orange-600 p-2 rounded-xl"><ChefHat size={24} className="text-white" /></div>
            <div>
              <h1 className="text-2xl font-black uppercase tracking-tighter text-white">KDS <span className="text-orange-500 font-light">Cocina</span></h1>
              <p className="text-[10px] uppercase font-bold tracking-widest text-emerald-400 flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema en Vivo</p>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-6">
          <div className="text-right">
            <p className="text-[10px] uppercase font-bold text-slate-500 tracking-widest">En Turno</p>
            <p className="text-sm font-black uppercase text-white">{usuarioActivo.nombre}</p>
          </div>
          <button onClick={cerrarSesion} className="bg-slate-800 p-3 rounded-2xl text-red-400 hover:bg-red-500/20 hover:text-red-400 transition-all"><LogOut size={20}/></button>
        </div>
      </header>

      <main className="grow p-6 overflow-x-auto">
        {tickets.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-slate-600 opacity-50 animate-in fade-in">
            <CheckCircle2 size={100} className="mb-6" />
            <h2 className="text-3xl font-black uppercase tracking-widest">Cocina Limpia</h2>
            <p className="font-bold">No hay pedidos pendientes en este momento.</p>
          </div>
        ) : (
          <div className="flex gap-6 h-full items-start">
            {tickets.map((ticket, index) => (
              <div key={ticket.id} className={`min-w-[320px] max-w-[320px] bg-slate-800 rounded-4xl overflow-hidden shadow-2xl border-2 flex flex-col animate-in slide-in-from-right-4 duration-300 ${index === 0 ? 'border-orange-500 shadow-orange-500/20' : 'border-slate-700'}`}>
                
                {/* TICKET HEADER */}
                <div className={`p-5 border-b border-slate-700 ${index === 0 ? 'bg-orange-500/10' : 'bg-slate-900/50'}`}>
                  <div className="flex justify-between items-start mb-3">
                    <span className="bg-slate-950 text-white px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest border border-slate-700 shadow-inner">
                      {ticket.tipo_servicio}
                    </span>
                    <span className="text-xs font-black text-slate-400">#{ticket.id.split('-')[0].toUpperCase()}</span>
                  </div>
                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-1 flex items-center gap-1"><ShieldCheck size={12}/> Mesero: {ticket.mesero || 'Barra'}</p>
                  {ticket.created_at && (
                    <p className="text-[10px] font-bold text-orange-400 uppercase tracking-widest flex items-center gap-1"><Clock size={12}/> {new Date(ticket.created_at).toLocaleTimeString()}</p>
                  )}
                </div>

                {/* TICKET ITEMS */}
                <div className="p-5 flex flex-col gap-3 grow overflow-y-auto">
                  {ticket.pedido_items.map(item => (
                    <div key={item.id} className="bg-slate-900 rounded-2xl p-4 border border-slate-700 flex flex-col gap-3 transition-all hover:border-slate-500">
                      
                      {/* TITULO Y NOTAS */}
                      <div className="flex gap-3 items-start">
                        <div className="w-10 h-10 bg-slate-800 rounded-xl flex items-center justify-center text-lg font-black text-orange-500 border border-slate-600 shrink-0">
                          {item.cantidad}
                        </div>
                        <div className="grow">
                          <h3 className="font-black text-sm uppercase text-white leading-tight mb-1">{item.productos?.nombre || 'Producto Desconocido'}</h3>
                          {item.notas && (
                            <div className="bg-yellow-500/10 border border-yellow-500/20 p-2 rounded-lg inline-block mb-1">
                              <p className="text-[10px] font-black text-yellow-500 uppercase tracking-wider leading-tight">⚠️ {item.notas}</p>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* --- NUEVO: RECETA Y PORCIONES CALCULADAS --- */}
                      {item.productos?.recetas && item.productos.recetas.length > 0 && (
                        <div className="mt-1 pl-3 border-l-2 border-slate-700 space-y-1">
                          <p className="text-[9px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1 mb-2">
                            <Utensils size={10} /> Preparación
                          </p>
                          {item.productos.recetas.map((r, i) => (
                            <div key={i} className="flex justify-between items-center text-[10px] font-black text-slate-400 uppercase">
                              <span>• {r.insumos?.nombre}</span>
                              <span className="text-emerald-400">
                                {Number((r.cantidad_requerida * item.cantidad).toFixed(3))} {r.insumos?.unidad_medida}
                              </span>
                            </div>
                          ))}
                        </div>
                      )}
                      
                      <button 
                        disabled={procesandoItemId === item.id}
                        onClick={() => marcarItemComoListo(item.id)}
                        className="w-full mt-2 bg-emerald-500/10 hover:bg-emerald-500 text-emerald-500 hover:text-white border border-emerald-500/50 py-3 rounded-xl flex items-center justify-center gap-2 font-black uppercase text-[10px] tracking-widest transition-all disabled:opacity-50"
                      >
                        {procesandoItemId === item.id ? <Loader2 size={16} className="animate-spin" /> : <><CheckCircle2 size={16} /> Listo</>}
                      </button>
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}