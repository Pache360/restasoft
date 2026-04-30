"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation';
import { ShoppingCart, Trash2, Plus, Minus, ClipboardList, Check, Loader2, LogOut, UserCircle, X, ScrollText, BellRing } from 'lucide-react';

// --- INTERFACES ESTRICTAS PARA TYPESCRIPT ---
interface UsuarioLogueado {
  id: string;
  nombre: string;
  rol: string;
}

interface Modificador { id: string; nombre: string; precio: number; }
interface Producto { id: string; nombre: string; precio: number; categoria: string; modificadores?: Modificador[]; }
interface ItemCarrito extends Producto { itemUniqueId: string; cantidad: number; extrasSeleccionados: Modificador[]; notas: string; yaGuardado?: boolean; }

interface DetallePedido { id: string; producto_id: string; cantidad: number; notas: string; subtotal: number; estado?: string; }
interface CuentaAbierta { id: string; total: number; tipo_servicio: string; fecha: string; pedido_items: DetallePedido[]; mesero: string; }

export default function ComandasPage() {
  const router = useRouter();
  
  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [productos, setProductos] = useState<Producto[]>([]);
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [numMesa, setNumMesa] = useState("1");
  const [cargando, setCargando] = useState(true);

  const [mostrarCarritoMovil, setMostrarCarritoMovil] = useState(false);
  const [cuentaAbiertaId, setCuentaAbiertaId] = useState<string | null>(null); 
  const [mostrarModalCuentas, setMostrarModalCuentas] = useState(false);
  const [cuentasAbiertas, setCuentasAbiertas] = useState<CuentaAbierta[]>([]);

  const [productoEnSeleccion, setProductoEnSeleccion] = useState<Producto | null>(null);
  const [extrasTemporales, setExtrasTemporales] = useState<Modificador[]>([]);
  const [notasTemporales, setNotasTemporales] = useState("");

  const [alertas, setAlertas] = useState<{id: number, mensaje: string}[]>([]);

  const mostrarAlerta = (mensaje: string) => {
    const id = Date.now();
    setAlertas(prev => [...prev, { id, mensaje }]);
    setTimeout(() => {
      setAlertas(prev => prev.filter(a => a.id !== id));
    }, 10000);
  };

  const quitarAlerta = (id: number) => {
    setAlertas(prev => prev.filter(a => a.id !== id));
  };

  useEffect(() => {
    // SOLUCIÓN 1: Englobamos todo en una función asíncrona para evitar "Cascading Renders"
    const inicializarDatos = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      if (!userGuardado) {
        router.push('/'); 
        return;
      }

      // 1. Pedimos el menú primero a Supabase
      const { data } = await supabase.from('productos').select('*').order('nombre');
      
      // 2. Seteamos los estados al mismo tiempo para un solo render limpio
      setProductos(data || []);
      setUsuarioActivo(JSON.parse(userGuardado));
      setCargando(false);
    };

    inicializarDatos();
  }, [router]);

  useEffect(() => {
    if (!usuarioActivo) return;

    const channel = supabase.channel('alertas-mesero')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'pedidos' }, (payload) => {
        if (payload.new.estado === 'completado') {
          // SOLUCIÓN 2: Uso del optional chaining (?) para evitar caídas de TypeScript
          if (payload.new.mesero === usuarioActivo?.nombre) {
            const nombreMesa = payload.new.tipo_servicio; 
            mostrarAlerta(`¡Tu ${nombreMesa} está lista en barra! 🏃‍♂️💨`);
          }
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, [usuarioActivo]);

  const cerrarSesion = () => {
    localStorage.removeItem('usuarioRestaSoft');
    router.push('/');
  };

  const cargarCuentasAbiertas = async () => {
    const { data } = await supabase.from('pedidos')
      .select('*, pedido_items(*)')
      .eq('metodo_pago', 'por_cobrar')
      .eq('mesero', usuarioActivo?.nombre);
    setCuentasAbiertas(data as CuentaAbierta[] || []);
  };

  const recuperarCuenta = async (cuenta: CuentaAbierta) => {
    const itemsRecuperados = cuenta.pedido_items.map((item) => {
      const prodBase = productos.find(p => p.id === item.producto_id);
      if(!prodBase) return null;
      return {
        ...prodBase, itemUniqueId: `${item.id}-${Math.random()}`, cantidad: item.cantidad,
        extrasSeleccionados: [], notas: item.notas || "", precio: item.subtotal / item.cantidad, yaGuardado: true 
      };
    }).filter(Boolean); 
    
    if(cuenta.tipo_servicio.includes("MESA")) {
       setNumMesa(cuenta.tipo_servicio.split("MESA ")[1] || "1");
    }

    setCuentaAbiertaId(cuenta.id); 
    setCarrito(itemsRecuperados as ItemCarrito[]);
    setMostrarModalCuentas(false);
  };

  const abrirPersonalizacion = (prod: Producto) => {
    setProductoEnSeleccion(prod); 
    setExtrasTemporales([]); 
    setNotasTemporales("");
  };

  const agregarAlCarritoFinal = () => {
    if (!productoEnSeleccion) return;
    const costoExtras = extrasTemporales.reduce((acc, e) => acc + e.precio, 0);
    const itemUniqueId = `${productoEnSeleccion.id}-${extrasTemporales.map(e => e.id).sort().join('-')}-${notasTemporales}`;

    setCarrito(prev => {
      const existe = prev.find(item => item.itemUniqueId === itemUniqueId && !item.yaGuardado);
      if (existe) return prev.map(item => item.itemUniqueId === itemUniqueId ? { ...item, cantidad: item.cantidad + 1 } : item);
      return [...prev, { ...productoEnSeleccion, itemUniqueId, precio: Number(productoEnSeleccion.precio) + costoExtras, cantidad: 1, extrasSeleccionados: extrasTemporales, notas: notasTemporales }];
    });
    setProductoEnSeleccion(null);
  };

  const quitarUno = (uniqueId: string) => {
    setCarrito(prev => {
      const item = prev.find(i => i.itemUniqueId === uniqueId);
      if (item && item.cantidad > 1) return prev.map(i => i.itemUniqueId === uniqueId ? { ...i, cantidad: i.cantidad - 1 } : i);
      return prev.filter(i => i.itemUniqueId !== uniqueId);
    });
  };

  const enviarComanda = async () => {
    if (carrito.length === 0) return;
    try {
      const total = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
      let pedidoId = cuentaAbiertaId;

      if (pedidoId) {
        await supabase.from('pedidos').update({ total }).eq('id', pedidoId);
        await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId);
      } else {
        const { data: pedido } = await supabase.from('pedidos')
          .insert([{ 
            total, 
            tipo_servicio: `MESA ${numMesa}`, 
            estado: 'pendiente', 
            metodo_pago: 'por_cobrar',
            mesero: usuarioActivo?.nombre 
          }]).select();
        pedidoId = pedido![0].id;
      }

      const detalles = carrito.map(item => ({
        pedido_id: pedidoId, 
        producto_id: item.id, 
        cantidad: item.cantidad, 
        notas: item.notas, 
        subtotal: item.precio * item.cantidad,
        estado: item.yaGuardado ? 'entregado' : 'pendiente' 
      }));
      await supabase.from('pedido_items').insert(detalles);

      for (const item of carrito) {
        if (item.yaGuardado) continue; 
        const { data: ingredientes } = await supabase.from('recetas').select('insumo_id, cantidad_requerida').eq('producto_id', item.id);
        if (ingredientes) {
          for (const ing of ingredientes) {
            const { data: insumo } = await supabase.from('insumos').select('cantidad_actual').eq('id', ing.insumo_id).single();
            if (insumo) await supabase.from('insumos').update({ cantidad_actual: insumo.cantidad_actual - (ing.cantidad_requerida * item.cantidad) }).eq('id', ing.insumo_id);
          }
        }
      }

      setCarrito([]);
      setNumMesa(""); 
      setCuentaAbiertaId(null);
      setMostrarCarritoMovil(false); 
      
      mostrarAlerta(cuentaAbiertaId ? `Mesa ${numMesa} actualizada` : `Comanda de Mesa ${numMesa} enviada`);
    } catch (err) {
      console.error("Error al enviar la comanda:", err);
      alert("Error enviando comanda. Por favor, revisa tu conexión.");
    }
  };

  const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  if (cargando) return <div className="h-screen flex justify-center items-center bg-indigo-950 text-white"><Loader2 className="animate-spin" size={48} /></div>;

  return (
    <div className="flex flex-col md:flex-row h-screen bg-slate-50 font-sans relative">
      
      {/* SOLUCIÓN 3: z-50 en lugar de z-[100] (Sugerencia de Tailwind) */}
      <div className="fixed top-4 left-0 right-0 z-50 flex flex-col items-center gap-3 pointer-events-none px-4">
        {alertas.map(alerta => (
          <div key={alerta.id} className="pointer-events-auto bg-emerald-500 text-white px-5 md:px-8 py-4 md:py-5 rounded-3xl shadow-[0_20px_50px_rgba(16,185,129,0.4)] flex items-center justify-between w-full max-w-md border-4 border-emerald-400 animate-in slide-in-from-top-10 fade-in duration-300">
             <div className="flex items-center gap-3 md:gap-4">
               <div className="bg-white/20 p-2 rounded-2xl"><BellRing size={28} className="animate-bounce" /></div>
               <span className="font-black uppercase tracking-widest text-xs md:text-sm leading-tight">{alerta.mensaje}</span>
             </div>
             <button onClick={() => quitarAlerta(alerta.id)} className="hover:bg-emerald-600 p-2 rounded-full transition-colors active:scale-95"><X size={20}/></button>
          </div>
        ))}
      </div>

      <nav className="md:hidden bg-indigo-950 text-white p-4 flex justify-between items-center z-20 shadow-md">
        <div className="flex items-center gap-2">
          <ScrollText className="text-orange-500" size={20} />
          <h1 className="font-black italic tracking-tighter leading-none mt-1">RESTA<span className="text-orange-500 font-light">SOFT</span></h1>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={() => { cargarCuentasAbiertas(); setMostrarModalCuentas(true); }} className="bg-slate-800/80 p-2 rounded-xl text-orange-400 border border-slate-700">
            <ClipboardList size={20} />
          </button>
          <button onClick={cerrarSesion} className="bg-slate-800/80 p-2 rounded-xl text-red-400 border border-slate-700">
            <LogOut size={20}/>
          </button>
        </div>
      </nav>

      <nav className="hidden md:flex w-24 bg-indigo-950 flex-col items-center py-6 justify-between border-r border-indigo-900 z-20">
        <div className="space-y-8 flex flex-col items-center w-full">
          <div className="bg-indigo-900/50 p-3 rounded-2xl">
            <ScrollText className="text-orange-500" size={30} />
          </div>

          <button onClick={() => { cargarCuentasAbiertas(); setMostrarModalCuentas(true); }} className="flex flex-col items-center gap-2 group w-full px-2" title="Mis Mesas Abiertas">
            <div className="bg-slate-800 p-4 rounded-2xl shadow-lg group-hover:bg-orange-500 transition-all text-slate-300 group-hover:text-white border border-slate-700 group-hover:border-orange-400 w-full flex justify-center">
              <ClipboardList size={28} />
            </div>
            <span className="text-[9px] font-black uppercase tracking-widest text-slate-400 group-hover:text-orange-400 text-center leading-tight">
              Mesas<br/>Activas
            </span>
          </button>
        </div>
        
        <button onClick={cerrarSesion} className="flex flex-col items-center gap-1 p-3 text-slate-500 hover:text-red-400 transition-all" title="Cerrar Sesión">
          <LogOut size={24}/>
          <span className="text-[9px] font-bold uppercase">Salir</span>
        </button>
      </nav>

      <main className="grow p-4 md:p-6 flex flex-col overflow-hidden pb-28 md:pb-6 relative z-10">
        <header className="mb-4 md:mb-6 flex justify-between items-center">
          <div>
            <h1 className="text-xl md:text-2xl font-black uppercase text-indigo-950 italic">Comandas</h1>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1 flex items-center gap-1">
              <UserCircle size={14} /> Atendiendo: {usuarioActivo?.nombre}
            </p>
          </div>
          
          <div className="flex items-center gap-2 bg-white px-3 md:px-5 py-2 md:py-3 rounded-2xl shadow-sm border border-slate-200">
            <span className="text-[10px] font-black uppercase text-slate-400">Mesa:</span>
            <input 
              type="number" 
              className="w-12 md:w-16 font-black text-xl md:text-2xl outline-none text-indigo-950 bg-transparent text-center p-0" 
              value={numMesa} 
              onChange={e => setNumMesa(e.target.value)} 
              placeholder="0"
            />
          </div>
        </header>

        <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 md:gap-4 overflow-y-auto pb-10 pr-1 md:pr-2">
          {productos.map((prod) => (
            <div key={prod.id} onClick={() => abrirPersonalizacion(prod)} className="bg-white p-4 md:p-5 rounded-3xl border-2 border-slate-100 hover:border-orange-500 active:scale-95 transition-all cursor-pointer shadow-sm flex flex-col justify-between min-h-28 md:min-h-32 group">
              <h3 className="font-black text-indigo-950 leading-tight mb-2 text-xs md:text-sm group-hover:text-orange-600 transition-colors">{prod.nombre}</h3>
              <div className="flex justify-between items-end mt-2">
                <span className="font-black text-indigo-950 text-sm md:text-base">${prod.precio}</span>
                <div className="bg-slate-100 p-1 md:p-1.5 rounded-lg group-hover:bg-orange-600 group-hover:text-white transition-all"><Plus size={16} /></div>
              </div>
            </div>
          ))}
        </div>
      </main>

      {!mostrarCarritoMovil && carrito.length > 0 && (
        <div className="md:hidden fixed bottom-4 left-4 right-4 z-30 animate-in slide-in-from-bottom-10">
          <button 
            onClick={() => setMostrarCarritoMovil(true)}
            className="w-full bg-indigo-950 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center border border-indigo-800 active:scale-95 transition-transform"
          >
            <div className="flex items-center gap-3">
               <div className="bg-orange-500 text-white w-8 h-8 rounded-full flex items-center justify-center font-black text-sm shadow-inner border border-orange-400">
                 {carrito.reduce((acc, i) => acc + i.cantidad, 0)}
               </div>
               <span className="font-black uppercase text-xs tracking-widest text-slate-300">Ver Comanda</span>
            </div>
            <span className="font-black text-lg text-orange-400">${subtotal.toFixed(2)}</span>
          </button>
        </div>
      )}

      <aside className={`
        fixed inset-0 z-40 bg-white flex flex-col 
        md:relative md:w-96 md:border-l md:border-slate-200 md:shadow-2xl md:z-10
        transition-transform duration-300 ease-in-out
        ${mostrarCarritoMovil ? 'translate-y-0' : 'translate-y-full md:translate-y-0'}
      `}>
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50 pt-8 md:pt-6">
          <h2 className="font-black text-base md:text-lg text-indigo-950 uppercase flex items-center gap-2">
            <ShoppingCart size={18} className="text-orange-500" />
            {cuentaAbiertaId ? `MESA ${numMesa} (EDICIÓN)` : `MESA ${numMesa || "?"}`}
          </h2>
          <div className="flex items-center gap-2">
             <button onClick={() => { setCarrito([]); setCuentaAbiertaId(null); setMostrarCarritoMovil(false); }} className="text-slate-400 hover:text-red-500 transition-colors p-2 bg-white rounded-xl shadow-sm border border-slate-100"><Trash2 size={18} /></button>
             <button onClick={() => setMostrarCarritoMovil(false)} className="md:hidden text-slate-400 hover:text-indigo-950 p-2 bg-white rounded-xl shadow-sm border border-slate-100"><X size={18} /></button>
          </div>
        </div>
        
        <div className="grow overflow-y-auto p-4 md:p-6 space-y-3 bg-slate-50/30">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30">
               <ShoppingCart size={48} className="text-slate-400 mb-4" />
               <p className="font-black uppercase tracking-widest text-xs text-slate-600">Comanda Vacía</p>
            </div>
          ) : (
            carrito.map(item => (
              <div key={item.itemUniqueId} className={`flex gap-3 p-3 rounded-2xl border transition-all ${item.yaGuardado ? 'bg-white border-slate-100 opacity-60' : 'bg-white border-orange-200 shadow-sm animate-in slide-in-from-right-4 duration-200'}`}>
                <div className="w-10 h-10 bg-slate-50 rounded-xl flex items-center justify-center font-black text-orange-600 text-lg border border-slate-100 shrink-0">
                  {item.cantidad}
                </div>
                <div className="grow">
                  <div className="flex justify-between font-black text-indigo-950 text-sm mb-1">
                    <span className="leading-tight">{item.nombre} {item.yaGuardado && <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full ml-1">En Cocina</span>}</span>
                  </div>
                  {item.notas && <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight mb-1 italic">&quot;{item.notas}&quot;</p>}
                  
                  {!item.yaGuardado && (
                    <button onClick={() => quitarUno(item.itemUniqueId)} className="text-red-400 hover:text-red-600 transition-all flex items-center gap-1 text-[10px] font-bold uppercase mt-1">
                      <Minus size={12} className="border border-current rounded-full p-0.5"/> Quitar
                    </button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
        
        <div className="p-6 border-t border-slate-100 bg-white shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-8 md:pb-6">
          <div className="flex justify-between items-end mb-6">
             <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total Comanda</span>
             <span className="text-3xl font-black text-indigo-950 italic leading-none">${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={enviarComanda} disabled={carrito.length === 0 || !numMesa} className="w-full bg-orange-600 text-white font-black py-4 md:py-5 rounded-2xl shadow-xl shadow-orange-600/20 flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:shadow-none hover:bg-orange-500 active:scale-95 transition-all uppercase tracking-widest text-xs md:text-sm">
            <Check size={18} /> {cuentaAbiertaId ? 'ACTUALIZAR COMANDA' : 'ENVIAR A COCINA'}
          </button>
        </div>
      </aside>

      {mostrarModalCuentas && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-4xl max-h-[90vh] rounded-[48px] p-6 md:p-10 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center mb-6 md:mb-8">
              <div>
                <h2 className="text-2xl md:text-3xl font-black text-indigo-950 uppercase italic">Mis Mesas</h2>
                {/* SOLUCIÓN 4: USO DE OPTIONAL CHAINING APLICADO A LA INTERFAZ ESTRICTA */}
                <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Abiertas por {usuarioActivo?.nombre}</p>
              </div>
              <button onClick={() => setMostrarModalCuentas(false)} className="bg-slate-100 p-2 md:p-3 rounded-full text-slate-400 hover:text-red-500 transition-all"><X size={20}/></button>
            </div>
            
            <div className="grow overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4 pr-1 md:pr-2">
              {cuentasAbiertas.length === 0 ? (
                <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-sm">No tienes mesas pendientes</div>
              ) : (
                cuentasAbiertas.map(cuenta => (
                  <div key={cuenta.id} className="border-2 border-slate-100 rounded-3xl p-4 md:p-6 hover:border-orange-500 transition-all cursor-pointer group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3 md:mb-4">
                        <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{cuenta.tipo_servicio}</span>
                        <span className="font-black text-lg md:text-xl text-indigo-950">${cuenta.total}</span>
                      </div>
                      <p className="text-[10px] md:text-xs text-slate-400 font-bold mb-4">{new Date(cuenta.fecha).toLocaleTimeString()}</p>
                    </div>
                    <button onClick={() => recuperarCuenta(cuenta)} className="w-full bg-slate-50 text-indigo-950 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-all">
                      Abrir Comanda para Agregar
                    </button>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {productoEnSeleccion && (
        <div className="fixed inset-0 bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[40px] p-6 md:p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-indigo-950 leading-none">{productoEnSeleccion.nombre}</h2>
                <p className="text-slate-400 text-[10px] md:text-xs mt-2 uppercase font-bold tracking-widest">Ajustes Especiales</p>
              </div>
              <button onClick={() => setProductoEnSeleccion(null)} className="text-slate-300 hover:text-red-500 transition-colors bg-slate-100 p-2 rounded-full">
                <X size={20}/>
              </button>
            </div>
            
            <div className="mb-6 md:mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Notas para Cocina</h4>
              <textarea 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-4 text-sm font-bold text-indigo-950 focus:border-orange-500 outline-none transition-all placeholder:text-slate-300 min-h-24 resize-none"
                placeholder="Ej. Sin cebolla, término medio, aderezo aparte..."
                value={notasTemporales}
                onChange={(e) => setNotasTemporales(e.target.value)}
              />
            </div>
            
            <button onClick={agregarAlCarritoFinal} className="w-full bg-orange-600 text-white font-black py-4 md:py-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 hover:bg-orange-500 active:scale-95 transition-all uppercase tracking-widest text-xs">
              <Check size={18} /> Agregar a la orden
            </button>
          </div>
        </div>
      )}

    </div>
  );
}