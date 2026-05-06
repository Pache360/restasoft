"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation'; 
import { 
  ShoppingCart, Trash2, Plus, Minus, Pizza, Utensils, 
  ChefHat, Settings, Clock, ChevronRight, Flame, X, Check, Loader2,
  Printer, DollarSign, CreditCard, BarChart3, ScrollText,
  BookOpen, Package, Monitor, Users as UsersIcon, ClipboardList, Coffee, LogOut
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// --- INTERFACES ESTRICTAS ---
interface UsuarioLogueado {
  id: string;
  nombre: string;
  rol: string;
}

interface ModuloPermisos {
  comandas: boolean;
  caja: boolean;
  cocina: boolean;
  inventario: boolean;
  reportes: boolean;
  admin: boolean;
}

type MatrizPermisos = Record<string, ModuloPermisos>;

interface Modificador { id: string; nombre: string; precio: number; }
interface Producto {
  id: string; nombre: string; precio: number;
  categoria: 'pizzas' | 'burgers' | 'bebidas' | 'complementos';
  descripcion?: string; modificadores?: Modificador[];
}
interface ItemCarrito extends Producto {
  itemUniqueId: string; cantidad: number;
  extrasSeleccionados: Modificador[]; notas: string;
  yaGuardado?: boolean; 
}
type TipoOrden = 'comedor' | 'llevar' | 'domicilio';
interface DetallePedido { id: string; producto_id: string; cantidad: number; notas: string; subtotal: number; estado?: string; }
interface CuentaAbierta { id: string; total: number; tipo_servicio: string; fecha: string; pedido_items: DetallePedido[]; mesero: string; }

const permisosBase: MatrizPermisos = {
  mesero: { comandas: true, caja: false, cocina: false, inventario: false, reportes: false, admin: false },
  cajero: { comandas: true, caja: true, cocina: false, inventario: false, reportes: false, admin: false },
  cocina: { comandas: false, caja: false, cocina: true, inventario: true, reportes: false, admin: false },
  subgerente: { comandas: true, caja: true, cocina: true, inventario: true, reportes: false, admin: false },
  gerente: { comandas: true, caja: true, cocina: true, inventario: true, reportes: true, admin: false },
  admin: { comandas: true, caja: true, cocina: true, inventario: true, reportes: true, admin: true }
};

export default function RestaSoftPOS() {
  const router = useRouter(); 

  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [pinLogin, setPinLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");
  
  const [productos, setProductos] = useState<Producto[]>([]);
  const [cargando, setCargando] = useState(true);
  
  const [carrito, setCarrito] = useState<ItemCarrito[]>([]);
  const [categoriaActiva, setCategoriaActiva] = useState<string>('todas');
  const [tipoOrden, setTipoOrden] = useState<TipoOrden>('comedor');
  
  const [numMesa, setNumMesa] = useState<string>("1");
  const [cuentaAbiertaId, setCuentaAbiertaId] = useState<string | null>(null); 
  
  const [mostrarModalMesa, setMostrarModalMesa] = useState(false);
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta'>('efectivo');

  const [mostrarModalCuentas, setMostrarModalCuentas] = useState(false);
  const [cuentasAbiertas, setCuentasAbiertas] = useState<CuentaAbierta[]>([]);

  const [productoEnSeleccion, setProductoEnSeleccion] = useState<Producto | null>(null);
  const [extrasTemporales, setExtrasTemporales] = useState<Modificador[]>([]);
  const [notasTemporales, setNotasTemporales] = useState("");

  const [isClient, setIsClient] = useState(false);
  const [ticketConfig, setTicketConfig] = useState({ 
    nombre: "RESTA SOFT", dir: "Sucursal Principal", tel: "", facturacion: "", msg: "¡Gracias por su preferencia!", logo: "" 
  });

  useEffect(() => {
    setIsClient(true);
    
    const inicializarPOS = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      
      if (userGuardado) {
        const parsed = JSON.parse(userGuardado);
        const guardados = localStorage.getItem('roles_permisos_restasoft');
        const matriz = guardados ? JSON.parse(guardados) : permisosBase;
        const misPermisos = matriz[parsed.rol] || permisosBase.mesero;

        if (parsed.rol !== 'admin' && !misPermisos.caja) {
          if (misPermisos.cocina) {
            router.push('/cocina');
            return;
          } else {
            router.push('/comandas');
            return;
          }
        }
        setUsuarioActivo(parsed);
      }

      setTicketConfig({
        nombre: localStorage.getItem('ticketNombre') || "RESTA SOFT",
        dir: localStorage.getItem('ticketDir') || "Sucursal Principal",
        tel: localStorage.getItem('ticketTel') || "",
        facturacion: localStorage.getItem('ticketFacturacion') || "",
        msg: localStorage.getItem('ticketMsg') || "¡Gracias por su preferencia!",
        logo: localStorage.getItem('ticketLogo') || ""
      });

      try {
        const { data, error } = await supabase.from('productos').select('*').order('nombre');
        if (error) throw new Error(error.message);
        setProductos(data || []);
      } catch (err: unknown) {
        if (err instanceof Error) console.error(err.message);
      } finally {
        setCargando(false);
      }
    };

    inicializarPOS();
  }, [router]);

  // --- NUEVO: SOPORTE PARA TECLADO FÍSICO EN EL LOGIN ---
  useEffect(() => {
    if (usuarioActivo) return; // Solo escuchar si estamos en la pantalla de login

    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (/^[0-9]$/.test(e.key)) {
        setPinLogin(prev => prev.length < 4 ? prev + e.key : prev);
      } else if (e.key === 'Backspace') {
        setPinLogin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter') {
        // Simulamos un clic en el botón de Enter para usar el PIN actual
        document.getElementById('btn-login-principal')?.click();
      } else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') {
        setPinLogin("");
      }
    };

    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [usuarioActivo]);

  const handleLogin = async () => {
    if (pinLogin.length !== 4) return;
    setCargando(true);
    const { data } = await supabase.from('usuarios').select('*').eq('pin', pinLogin).single();
    
    if (data) {
      localStorage.setItem('usuarioRestaSoft', JSON.stringify(data));
      
      const guardados = localStorage.getItem('roles_permisos_restasoft');
      const matriz = guardados ? JSON.parse(guardados) : permisosBase;
      const misPermisos = matriz[data.rol] || permisosBase.mesero;

      if (data.rol === 'admin' || misPermisos.caja) {
        setUsuarioActivo(data);
        setPinLogin("");
      } else if (misPermisos.cocina) {
        router.push('/cocina');
      } else {
        router.push('/comandas');
      }
    } else {
      setErrorLogin("PIN Incorrecto");
      setTimeout(() => setErrorLogin(""), 3000);
      setPinLogin("");
    }
    setCargando(false);
  };

  const cerrarSesion = () => {
    setUsuarioActivo(null);
    localStorage.removeItem('usuarioRestaSoft');
  };

  const ejecutarImpresion = () => { window.print(); };

  const cargarCuentasAbiertas = async () => {
    let query = supabase.from('pedidos').select('*, pedido_items(*)').eq('metodo_pago', 'por_cobrar');
    if (usuarioActivo?.rol === 'mesero') {
      query = query.eq('mesero', usuarioActivo.nombre);
    }
    const { data } = await query;
    setCuentasAbiertas(data as CuentaAbierta[] || []);
  };

  const finalizarPedido = async (esCuentaAbierta: boolean = false) => {
    if (carrito.length === 0) return;
    try {
      const totalVenta = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
      const servicioFinal = tipoOrden === 'comedor' ? `COMEDOR - MESA ${numMesa}` : tipoOrden.toUpperCase();
      
      const metodoFinal = esCuentaAbierta ? 'por_cobrar' : metodoPago;
      const estadoFinal = esCuentaAbierta ? 'pendiente' : 'completado'; 

      let pedidoId = cuentaAbiertaId;

      if (pedidoId) {
        await supabase.from('pedidos').update({
          total: totalVenta, estado: estadoFinal, metodo_pago: metodoFinal, mesero: usuarioActivo?.nombre
        }).eq('id', pedidoId);

        await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId);
      } else {
        const { data: pedidoData, error: pedidoError } = await supabase
          .from('pedidos').insert([{ total: totalVenta, tipo_servicio: servicioFinal, estado: estadoFinal, metodo_pago: metodoFinal, mesero: usuarioActivo?.nombre }]).select();
        if (pedidoError) throw pedidoError;
        pedidoId = pedidoData[0].id;
      }

      const detalles = carrito.map(item => ({
        pedido_id: pedidoId, producto_id: item.id, cantidad: item.cantidad, notas: item.notas, subtotal: item.precio * item.cantidad,
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

      if (!esCuentaAbierta) ejecutarImpresion();
      alert(esCuentaAbierta ? "¡Orden actualizada en cocina!" : "¡Cobro exitoso!");
      
      setCarrito([]);
      setMostrarModalPago(false);
      setCuentaAbiertaId(null);
    } catch (err: unknown) {
      if (err instanceof Error) alert("Error al procesar: " + err.message);
    }
  };

  const recuperarCuenta = async (cuenta: CuentaAbierta, irDirectoAPago: boolean = false) => {
    const itemsRecuperados = cuenta.pedido_items.map((item) => {
      const prodBase = productos.find(p => p.id === item.producto_id);
      if(!prodBase) return null;
      return {
        ...prodBase, itemUniqueId: `${item.id}-${Math.random()}`, cantidad: item.cantidad,
        extrasSeleccionados: [], notas: item.notas || "", precio: item.subtotal / item.cantidad, yaGuardado: true 
      };
    }).filter(Boolean); 
    
    if(cuenta.tipo_servicio.includes("MESA")) {
       setTipoOrden('comedor');
       setNumMesa(cuenta.tipo_servicio.split("MESA ")[1] || "1");
    } else {
       setTipoOrden(cuenta.tipo_servicio.toLowerCase() as TipoOrden);
    }

    setCuentaAbiertaId(cuenta.id); 
    setCarrito(itemsRecuperados as ItemCarrito[]);
    setMostrarModalCuentas(false);

    if (irDirectoAPago) setMostrarModalPago(true);
  };

  const abrirPersonalizacion = (prod: Producto) => {
    setProductoEnSeleccion(prod); setExtrasTemporales([]); setNotasTemporales("");
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

  const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  if (cargando && !usuarioActivo) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mb-4" size={48} /></div>;

  if (!usuarioActivo) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-indigo-950 text-white font-sans">
        <h1 className="text-5xl font-black italic tracking-tighter mb-8">RESTA<span className="text-orange-500 font-light text-2xl">SOFT</span></h1>
        <div className="bg-white p-10 rounded-[48px] text-slate-900 shadow-2xl w-full max-w-sm text-center">
          <h2 className="text-xl font-bold uppercase mb-2 text-indigo-950">Acceso al Sistema</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Ingresa tu PIN con el teclado</p>
          
          <div className="text-5xl tracking-[0.5em] mb-8 font-black text-indigo-950 h-14 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-slate-100">
            {pinLogin.padEnd(4, '•')}
          </div>
          
          {errorLogin && <p className="text-red-500 font-bold text-sm mb-4 animate-bounce">{errorLogin}</p>}

          <div className="grid grid-cols-3 gap-3">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + n) }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black text-indigo-950 hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95">{n}</button>
            ))}
            <button onClick={() => setPinLogin("")} className="bg-red-50 border-2 border-red-100 text-red-500 p-5 rounded-2xl font-black hover:bg-red-100 transition-all active:scale-95">C</button>
            <button onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + '0') }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black text-indigo-950 hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95">0</button>
            <button id="btn-login-principal" onClick={handleLogin} className="bg-emerald-500 text-white p-5 rounded-2xl font-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all active:scale-95"><Check size={32}/></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="flex h-screen bg-slate-50 text-slate-900 font-sans overflow-hidden print:overflow-visible print:h-auto print:block">
      
      {/* TICKET DE IMPRESIÓN */}
      <div id="area-impresion" className="hidden print:flex flex-col p-1 text-black bg-white font-mono text-[9px] leading-tight h-auto w-full">
        <div className="text-center mb-2">
          <div className="flex justify-center mb-1">
            {isClient && ticketConfig.logo ? (
              <Image src={ticketConfig.logo} alt="Logo" width={64} height={64} className="w-16 h-16 object-contain grayscale mx-auto" unoptimized />
            ) : (
              <Image src="/logo.png" alt="Logo" width={64} height={64} priority className="grayscale mx-auto" unoptimized />
            )}
          </div>
          <h2 className="text-sm font-black uppercase tracking-tighter leading-none mt-1">{ticketConfig.nombre}</h2>
          <p className="text-[7px] mt-1">{ticketConfig.dir}</p>
          {ticketConfig.tel && <p className="text-[7px]">Tel: {ticketConfig.tel}</p>}
          <p className="text-[7px] mt-1">{isClient ? new Date().toLocaleString() : ''}</p>
          <p className="text-[7px]">Le Atendió: {usuarioActivo.nombre}</p>
        </div>
        
        <div className="border-b border-dashed border-black mb-1"></div>
        <p className="mb-1 font-bold uppercase italic text-[8px]">SERVICIO: {tipoOrden === 'comedor' ? `MESA ${numMesa}` : tipoOrden.toUpperCase()}</p>
        <div className="border-b border-dashed border-black mb-1"></div>
        
        <div className="space-y-1">
          {carrito.map(item => (
            <div key={item.itemUniqueId} className="flex justify-between items-start">
              <span className="w-2/3">{item.cantidad}x {item.nombre}</span>
              <span>${(item.precio * item.cantidad).toFixed(2)}</span>
            </div>
          ))}
        </div>
        
        <div className="border-b border-dashed border-black my-2"></div>
        <div className="flex justify-between font-black text-xs"><span>TOTAL:</span><span>${subtotal.toFixed(2)}</span></div>
        
        <div className="mt-3 pt-2 text-center border-t border-dashed border-black text-[7px] space-y-1">
          {ticketConfig.facturacion && <p className="uppercase">{ticketConfig.facturacion}</p>}
          <p className="uppercase italic font-black">{ticketConfig.msg}</p>
        </div>
      </div>

      <nav className="w-24 bg-indigo-950 flex flex-col items-center py-6 justify-between border-r border-indigo-900 print:hidden overflow-y-auto">
        <div className="space-y-4 flex flex-col items-center w-full">
          <div className="bg-orange-500 p-3 rounded-2xl shadow-lg shadow-orange-500/30 mb-4">
            <Flame className="text-white" size={30} />
          </div>

          {['admin', 'gerente', 'cajero', 'subgerente'].includes(usuarioActivo.rol) && (
            <button className="p-3 rounded-2xl transition-all bg-white/10 text-orange-400" title="Caja POS"><ChefHat size={24} /></button>
          )}
          
          {['admin', 'gerente', 'mesero', 'subgerente'].includes(usuarioActivo.rol) && (
            <Link href="/comandas" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Tomar Comandas">
              <ScrollText size={24} />
            </Link>
          )}
          
          <button onClick={() => { cargarCuentasAbiertas(); setMostrarModalCuentas(true); }} className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all relative" title="Cuentas Abiertas">
            <ClipboardList size={24} />
          </button>
          
          {['admin', 'gerente', 'cocina', 'subgerente'].includes(usuarioActivo.rol) && (
            <Link href="/cocina" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Monitor Cocina"><Monitor size={24} /></Link>
          )}

          {['admin', 'gerente', 'subgerente'].includes(usuarioActivo.rol) && (
            <>
              <Link href="/inventario" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Inventario"><Package size={24} /></Link>
              <Link href="/recetas" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Recetario"><BookOpen size={24} /></Link>
              <Link href="/reportes" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Reportes Financieros"><BarChart3 size={24} /></Link>
            </>
          )}
        </div>

        <div className="flex flex-col gap-4 mt-4 w-full items-center">
          {usuarioActivo.rol === 'admin' && (
            <>
              <Link href="/usuarios" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Staff y Roles"><UsersIcon size={24} /></Link>
              <Link href="/configuracion" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all" title="Configuración"><Settings size={24} /></Link>
            </>
          )}
          <button onClick={cerrarSesion} className="p-3 rounded-2xl text-red-400 hover:bg-red-500/20 transition-all" title="Cerrar Sesión"><LogOut size={24}/></button>
        </div>
      </nav>

      <main className="grow p-6 flex flex-col overflow-hidden print:hidden">
        <header className="flex justify-between items-center mb-6">
          <div>
            <h1 className="text-3xl font-black tracking-tight text-indigo-950 italic uppercase leading-none">RESTA<span className="text-orange-600 font-light text-2xl">SOFT</span></h1>
            <div className="flex gap-2 mt-3">
              {(['comedor', 'llevar', 'domicilio'] as TipoOrden[]).map((t) => (
                <button key={t} onClick={() => setTipoOrden(t)} className={`px-4 py-2 rounded-full text-[10px] font-black uppercase transition-all border shadow-sm ${tipoOrden === t ? 'bg-indigo-950 text-white border-indigo-950 scale-105' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'}`}>{t}</button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-4">
            <div className="flex flex-col text-right">
               <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Usuario</span>
               <span className="text-sm font-black text-indigo-950 uppercase">{usuarioActivo.nombre}</span>
            </div>
            <div className="bg-white px-5 py-3 rounded-2xl shadow-sm border border-slate-200 text-indigo-950 font-black flex items-center gap-3 text-lg"><Clock size={20} className="text-orange-500" />
              {isClient ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'}
            </div>
          </div>
        </header>

        <div className="flex gap-3 mb-6 overflow-x-auto pb-2">
          <button onClick={() => setCategoriaActiva('todas')} className={`px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 transition-all ${categoriaActiva === 'todas' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><ChefHat size={16}/> Todo</button>
          <button onClick={() => setCategoriaActiva('pizzas')} className={`px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 transition-all ${categoriaActiva === 'pizzas' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Pizza size={16}/> Pizzas</button>
          <button onClick={() => setCategoriaActiva('burgers')} className={`px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 transition-all ${categoriaActiva === 'burgers' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Utensils size={16}/> Hamburguesas</button>
          <button onClick={() => setCategoriaActiva('bebidas')} className={`px-5 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 transition-all ${categoriaActiva === 'bebidas' ? 'bg-orange-500 text-white shadow-lg' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Coffee size={16}/> Bebidas</button>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 overflow-y-auto pr-2 pb-10">
          {productos.filter(p => categoriaActiva === 'todas' || p.categoria === categoriaActiva).map((prod) => (
            <div key={prod.id} onClick={() => abrirPersonalizacion(prod)} className="bg-white p-5 rounded-3xl border-2 border-slate-100 hover:border-orange-500 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between min-h-40">
              <div><h3 className="font-black text-lg text-indigo-950 group-hover:text-orange-600 transition-colors leading-tight">{prod.nombre}</h3></div>
              <div className="flex justify-between items-end mt-4"><span className="text-2xl font-black text-indigo-950">${prod.precio}</span><div className="bg-slate-100 p-2 rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-all"><Plus size={20} /></div></div>
            </div>
          ))}
        </div>
      </main>

      <aside className="w-105 bg-white border-l border-slate-200 flex flex-col shadow-2xl print:hidden relative z-10">
        <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <h2 className="font-black text-xl text-indigo-950 flex items-center gap-2 uppercase tracking-tighter">
            <ShoppingCart size={20} className="text-orange-500" /> 
            {cuentaAbiertaId ? `MESA ${numMesa} (MODIFICANDO)` : (tipoOrden === 'comedor' ? `NUEVA MESA ${numMesa}` : `NUEVO ${tipoOrden}`)}
          </h2>
          <button onClick={() => { setCarrito([]); setCuentaAbiertaId(null); }} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={20} /></button>
        </div>

        <div className="grow overflow-y-auto p-6 space-y-4">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30"><ShoppingCart size={60} className="text-slate-400 mb-4" /><p className="font-black uppercase tracking-widest text-xs text-slate-600">Ticket Vacío</p></div>
          ) : (
            carrito.map((item) => (
              <div key={item.itemUniqueId} className={`flex gap-4 p-4 rounded-2xl border transition-all ${item.yaGuardado ? 'bg-white border-slate-100 opacity-60' : 'bg-orange-50 border-orange-200 animate-in slide-in-from-right-4 duration-200'}`}>
                <div className="w-12 h-12 bg-white shadow-sm rounded-xl flex items-center justify-center font-black text-orange-600 text-xl border border-slate-100">{item.cantidad}</div>
                <div className="grow">
                  <div className="flex justify-between font-black text-indigo-950 text-sm mb-1">
                    <span className="leading-tight">{item.nombre} {item.yaGuardado && <span className="text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full ml-1">En Cocina</span>}</span>
                    <span>${(item.precio * item.cantidad).toFixed(2)}</span>
                  </div>
                  {item.notas && <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight mb-2 italic">&quot;{item.notas}&quot;</p>}
                  {!item.yaGuardado && (
                     <button onClick={() => quitarUno(item.itemUniqueId)} className="text-red-400 hover:text-red-600 transition-all flex items-center gap-1 text-[10px] font-bold uppercase mt-2"><Minus size={12} className="border border-current rounded-full p-0.5"/> Quitar</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)]">
          <div className="flex justify-between items-end mb-6">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total a pagar</span>
            <span className="text-4xl font-black text-indigo-950 italic leading-none">${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={() => { 
            if (cuentaAbiertaId || tipoOrden !== 'comedor') setMostrarModalPago(true); 
            else setMostrarModalMesa(true); 
          }} disabled={carrito.length === 0} className="w-full bg-orange-600 text-white font-black py-5 rounded-2xl shadow-xl shadow-orange-600/20 flex items-center justify-center gap-3 hover:bg-orange-500 active:scale-95 transition-all disabled:bg-slate-200 disabled:shadow-none uppercase tracking-widest text-sm">
            PROCESAR ORDEN <ChevronRight size={20} />
          </button>
        </div>
      </aside>

      {mostrarModalPago && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl text-center animate-in zoom-in duration-200">
            <h2 className="text-3xl font-black text-indigo-950 uppercase italic mb-2">Procesar Orden</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Mesa {numMesa} • {tipoOrden}</p>
            
            {usuarioActivo.rol !== 'mesero' && (
              <div className="grid grid-cols-2 gap-4 mb-6">
                <button onClick={() => setMetodoPago('efectivo')} className={`flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-4 transition-all ${metodoPago === 'efectivo' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}><DollarSign size={32} /><span className="font-black uppercase text-xs tracking-widest">Efectivo</span></button>
                <button onClick={() => setMetodoPago('tarjeta')} className={`flex flex-col items-center justify-center gap-3 p-6 rounded-3xl border-4 transition-all ${metodoPago === 'tarjeta' ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}><CreditCard size={32} /><span className="font-black uppercase text-xs tracking-widest">Tarjeta</span></button>
              </div>
            )}

            <div className="bg-slate-50 p-6 rounded-3xl mb-6 border border-slate-100">
              <p className="text-5xl font-black italic text-indigo-950">${subtotal.toFixed(2)}</p>
            </div>

            <div className="space-y-3">
              {usuarioActivo.rol !== 'mesero' && (
                <button onClick={() => finalizarPedido(false)} className="w-full bg-emerald-500 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-emerald-500/30 hover:bg-emerald-400 transition-all uppercase tracking-widest text-xs">
                  <Printer size={18} /> Cobrar e Imprimir
                </button>
              )}
              <button onClick={() => finalizarPedido(true)} className="w-full bg-indigo-950 text-white font-black py-4 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-indigo-900/30 hover:bg-indigo-800 transition-all uppercase tracking-widest text-xs">
                <ClipboardList size={18} /> {cuentaAbiertaId ? 'Actualizar Orden en Cocina' : 'Enviar a Cocina y Dejar Abierta'}
              </button>
              <button onClick={() => setMostrarModalPago(false)} className="w-full bg-slate-100 text-slate-500 font-black py-4 rounded-2xl uppercase tracking-widest text-xs hover:bg-slate-200 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {mostrarModalCuentas && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white w-full max-w-4xl max-h-[80vh] rounded-[48px] p-10 shadow-2xl flex flex-col">
            <div className="flex justify-between items-center mb-8">
              <div>
                <h2 className="text-3xl font-black text-indigo-950 uppercase italic">Cuentas Pendientes</h2>
                {usuarioActivo.rol === 'mesero' && <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Viendo solo las mesas de: {usuarioActivo.nombre}</p>}
              </div>
              <button onClick={() => setMostrarModalCuentas(false)} className="bg-slate-100 p-3 rounded-full text-slate-400 hover:text-red-500 transition-all"><X size={24}/></button>
            </div>
            <div className="grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-4 pr-2">
              {cuentasAbiertas.length === 0 ? (
                <div className="col-span-full py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-sm">No hay cuentas pendientes</div>
              ) : (
                cuentasAbiertas.map(cuenta => (
                  <div key={cuenta.id} className="border-2 border-slate-100 rounded-3xl p-6 hover:border-orange-500 transition-all cursor-pointer group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-4">
                        <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest">{cuenta.tipo_servicio}</span>
                        <span className="font-black text-xl text-indigo-950">${cuenta.total}</span>
                      </div>
                      <div className="flex justify-between text-xs font-bold mb-4">
                         <span className="text-slate-400">{new Date(cuenta.fecha).toLocaleTimeString()}</span>
                         <span className="text-indigo-400 uppercase">Por: {cuenta.mesero || 'Caja'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => recuperarCuenta(cuenta, false)} className="bg-slate-50 text-indigo-950 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-all">
                        Ver / Agregar
                      </button>
                      {usuarioActivo.rol !== 'mesero' ? (
                        <button onClick={() => recuperarCuenta(cuenta, true)} className="bg-emerald-500 text-white font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-md">
                          Cobrar Directo
                        </button>
                      ) : (
                        <div className="bg-slate-100 text-slate-400 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest text-center flex items-center justify-center cursor-not-allowed">
                          Solo Caja
                        </div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {mostrarModalMesa && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl text-center">
            <h2 className="text-3xl font-black text-indigo-950 uppercase italic mb-6">Mesa</h2>
            <div className="grid grid-cols-5 gap-3 mb-10">
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(n => (
                <button key={n} onClick={() => setNumMesa(n.toString())} className={`h-16 rounded-2xl font-black text-lg transition-all border-4 ${numMesa === n.toString() ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200'}`}>{n}</button>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setMostrarModalMesa(false)} className="grow bg-slate-100 text-slate-500 font-bold py-4 rounded-2xl uppercase tracking-widest text-xs">CANCELAR</button>
              <button onClick={() => { setMostrarModalMesa(false); setMostrarModalPago(true); }} className="grow bg-indigo-950 text-white font-black py-4 rounded-2xl uppercase tracking-widest text-xs shadow-xl">Siguiente</button>
            </div>
          </div>
        </div>
      )}

      {productoEnSeleccion && (
        <div className="fixed inset-0 bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center z-50 p-4 print:hidden">
          <div className="bg-white w-full max-w-md rounded-[40px] p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-6">
              <div>
                <h2 className="text-2xl font-black text-indigo-950 leading-none">{productoEnSeleccion.nombre}</h2>
                <p className="text-slate-400 text-xs mt-2 uppercase font-bold tracking-widest">Ajustes Especiales</p>
              </div>
              <button onClick={() => setProductoEnSeleccion(null)} className="text-slate-300 hover:text-red-500 transition-colors bg-slate-100 p-2 rounded-full"><X size={20}/></button>
            </div>
            
            <div className="mb-8">
              <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Notas para Cocina</h4>
              <textarea 
                className="w-full bg-slate-50 border-2 border-slate-100 rounded-3xl p-4 text-sm font-bold text-indigo-950 focus:border-orange-500 outline-none transition-all placeholder:text-slate-300 min-h-24 resize-none"
                placeholder="Ej. Sin cebolla, término medio..."
                value={notasTemporales}
                onChange={(e) => setNotasTemporales(e.target.value)}
              />
            </div>
            
            <button onClick={agregarAlCarritoFinal} className="w-full bg-orange-600 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-2 shadow-xl shadow-orange-600/30 hover:bg-orange-500 active:scale-95 transition-all uppercase tracking-widest text-xs">
              <Check size={18} /> Agregar a la orden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}