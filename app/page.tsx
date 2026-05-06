"use client";

import React, { useState, useEffect } from 'react';
import { supabase } from '@/lib/supabase';
import { useRouter } from 'next/navigation'; 
import { 
  ShoppingCart, Trash2, Plus, Minus, Pizza, Utensils, 
  ChefHat, Settings, Clock, ChevronRight, Flame, X, Check, Loader2,
  Printer, DollarSign, CreditCard, BarChart3, ScrollText,
  BookOpen, Package, Monitor, Users as UsersIcon, ClipboardList, Coffee, LogOut,
  Banknote, Coins, Menu, ArrowLeft
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// --- INTERFACES ESTRICTAS ---
interface UsuarioLogueado { id: string; nombre: string; rol: string; }
interface ModuloPermisos { comandas: boolean; caja: boolean; cocina: boolean; inventario: boolean; reportes: boolean; admin: boolean; }
type MatrizPermisos = Record<string, ModuloPermisos>;
interface Modificador { id: string; nombre: string; precio: number; }
interface Producto { id: string; nombre: string; precio: number; categoria: 'pizzas' | 'burgers' | 'bebidas' | 'complementos'; descripcion?: string; modificadores?: Modificador[]; }
interface ItemCarrito extends Producto { itemUniqueId: string; cantidad: number; extrasSeleccionados: Modificador[]; notas: string; yaGuardado?: boolean; }
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
  
  // PAGOS Y CAMBIO
  const [mostrarModalPago, setMostrarModalPago] = useState(false);
  const [metodoPago, setMetodoPago] = useState<'efectivo' | 'tarjeta'>('efectivo');
  const [montoRecibido, setMontoRecibido] = useState<string>("");

  // FONDO DE CAJA
  const [fondoCaja, setFondoCaja] = useState<number>(0);
  const [mostrarModalFondo, setMostrarModalFondo] = useState(false);
  const [inputFondo, setInputFondo] = useState<string>("");

  const [mostrarModalCuentas, setMostrarModalCuentas] = useState(false);
  const [cuentasAbiertas, setCuentasAbiertas] = useState<CuentaAbierta[]>([]);

  const [productoEnSeleccion, setProductoEnSeleccion] = useState<Producto | null>(null);
  const [extrasTemporales, setExtrasTemporales] = useState<Modificador[]>([]);
  const [notasTemporales, setNotasTemporales] = useState("");

  const [isClient, setIsClient] = useState(false);
  
  // ESTADOS MÓVILES
  const [mostrarMenuMovil, setMostrarMenuMovil] = useState(false);
  const [mostrarCarritoMovil, setMostrarCarritoMovil] = useState(false);

  const [ticketConfig, setTicketConfig] = useState({ 
    nombre: "RESTA SOFT", dir: "Sucursal Principal", tel: "", facturacion: "", msg: "¡Gracias por su preferencia!", logo: "" 
  });

  const subtotal = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);

  useEffect(() => {
    setIsClient(true);
    
    const inicializarPOS = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      const fondoGuardado = localStorage.getItem('fondoCaja_restasoft');
      if (fondoGuardado) setFondoCaja(Number(fondoGuardado));
      
      if (userGuardado) {
        const parsed = JSON.parse(userGuardado);
        const guardados = localStorage.getItem('roles_permisos_restasoft');
        const matriz = guardados ? JSON.parse(guardados) : permisosBase;
        const misPermisos = matriz[parsed.rol] || permisosBase.mesero;

        if (parsed.rol !== 'admin' && !misPermisos.caja) {
          if (misPermisos.cocina) { router.push('/cocina'); return; } 
          else { router.push('/comandas'); return; }
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

  useEffect(() => {
    if (usuarioActivo) return; 

    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement || e.target instanceof HTMLTextAreaElement) return;

      if (/^[0-9]$/.test(e.key)) setPinLogin(prev => prev.length < 4 ? prev + e.key : prev);
      else if (e.key === 'Backspace') setPinLogin(prev => prev.slice(0, -1));
      else if (e.key === 'Enter') document.getElementById('btn-login-principal')?.click();
      else if (e.key.toLowerCase() === 'c' || e.key === 'Escape') setPinLogin("");
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

      if (data.rol === 'admin' || misPermisos.caja) { setUsuarioActivo(data); setPinLogin(""); } 
      else if (misPermisos.cocina) { router.push('/cocina'); } 
      else { router.push('/comandas'); }
    } else {
      setErrorLogin("PIN Incorrecto");
      setTimeout(() => setErrorLogin(""), 3000);
      setPinLogin("");
    }
    setCargando(false);
  };

  const cerrarSesion = () => { setUsuarioActivo(null); localStorage.removeItem('usuarioRestaSoft'); };
  const ejecutarImpresion = () => { window.print(); };

  const guardarFondoCaja = () => {
    const val = Number(inputFondo);
    setFondoCaja(val); localStorage.setItem('fondoCaja_restasoft', val.toString());
    setMostrarModalFondo(false); setInputFondo("");
  };

  const cargarCuentasAbiertas = async () => {
    let query = supabase.from('pedidos').select('*, pedido_items(*)').eq('metodo_pago', 'por_cobrar');
    if (usuarioActivo?.rol === 'mesero') query = query.eq('mesero', usuarioActivo.nombre);
    const { data } = await query;
    setCuentasAbiertas(data as CuentaAbierta[] || []);
  };

  const finalizarPedido = async (esCuentaAbierta: boolean = false) => {
    if (carrito.length === 0) return;
    
    if (!esCuentaAbierta && metodoPago === 'efectivo') {
      const recibido = Number(montoRecibido) || 0;
      if (recibido < subtotal && recibido !== 0) return alert("El monto recibido es menor al total a pagar.");
    }

    try {
      const totalVenta = carrito.reduce((acc, item) => acc + (item.precio * item.cantidad), 0);
      const servicioFinal = tipoOrden === 'comedor' ? `COMEDOR - MESA ${numMesa}` : tipoOrden.toUpperCase();
      
      const metodoFinal = esCuentaAbierta ? 'por_cobrar' : metodoPago;
      const estadoFinal = esCuentaAbierta ? 'pendiente' : 'completado'; 

      let pedidoId = cuentaAbiertaId;

      if (pedidoId) {
        await supabase.from('pedidos').update({ total: totalVenta, estado: estadoFinal, metodo_pago: metodoFinal, mesero: usuarioActivo?.nombre }).eq('id', pedidoId);
        await supabase.from('pedido_items').delete().eq('pedido_id', pedidoId);
      } else {
        const { data: pedidoData, error: pedidoError } = await supabase.from('pedidos').insert([{ total: totalVenta, tipo_servicio: servicioFinal, estado: estadoFinal, metodo_pago: metodoFinal, mesero: usuarioActivo?.nombre }]).select();
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
      
      setCarrito([]); setMostrarModalPago(false); setCuentaAbiertaId(null); setMontoRecibido("");
      setMostrarCarritoMovil(false); // Cierra el carrito en móviles al pagar
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
    
    if(cuenta.tipo_servicio.includes("MESA")) { setTipoOrden('comedor'); setNumMesa(cuenta.tipo_servicio.split("MESA ")[1] || "1"); } 
    else { setTipoOrden(cuenta.tipo_servicio.toLowerCase() as TipoOrden); }

    setCuentaAbiertaId(cuenta.id); setCarrito(itemsRecuperados as ItemCarrito[]); setMostrarModalCuentas(false);
    if (irDirectoAPago) setMostrarModalPago(true);
  };

  const abrirPersonalizacion = (prod: Producto) => { setProductoEnSeleccion(prod); setExtrasTemporales([]); setNotasTemporales(""); };

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

  if (cargando && !usuarioActivo) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mb-4" size={48} /></div>;

  if (!usuarioActivo) {
    return (
      <div className="min-h-screen md:h-screen flex flex-col items-center justify-center bg-indigo-950 text-white font-sans p-4">
        <h1 className="text-4xl md:text-5xl font-black italic tracking-tighter mb-8">RESTA<span className="text-orange-500 font-light text-xl md:text-2xl">SOFT</span></h1>
        <div className="bg-white p-6 md:p-10 rounded-4xl md:rounded-[48px] text-slate-900 shadow-2xl w-full max-w-sm text-center">
          <h2 className="text-xl font-bold uppercase mb-2 text-indigo-950">Acceso al Sistema</h2>
          <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 md:mb-8">Ingresa tu PIN</p>
          <div className="text-4xl md:text-5xl tracking-[0.5em] mb-6 md:mb-8 font-black text-indigo-950 h-12 md:h-14 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-slate-100">
            {pinLogin.padEnd(4, '•')}
          </div>
          {errorLogin && <p className="text-red-500 font-bold text-sm mb-4 animate-bounce">{errorLogin}</p>}
          <div className="grid grid-cols-3 gap-2 md:gap-3">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + n) }} className="bg-slate-50 border-2 border-slate-100 p-4 md:p-5 rounded-xl md:rounded-2xl text-xl md:text-2xl font-black text-indigo-950 hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95">{n}</button>
            ))}
            <button onClick={() => setPinLogin("")} className="bg-red-50 border-2 border-red-100 text-red-500 p-4 md:p-5 rounded-xl md:rounded-2xl font-black hover:bg-red-100 transition-all active:scale-95">C</button>
            <button onClick={() => { if(pinLogin.length < 4) setPinLogin(pinLogin + '0') }} className="bg-slate-50 border-2 border-slate-100 p-4 md:p-5 rounded-xl md:rounded-2xl text-xl md:text-2xl font-black text-indigo-950 hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95">0</button>
            <button id="btn-login-principal" onClick={handleLogin} className="bg-emerald-500 text-white p-4 md:p-5 rounded-xl md:rounded-2xl font-black hover:bg-emerald-400 shadow-lg shadow-emerald-500/30 flex items-center justify-center transition-all active:scale-95"><Check size={28}/></button>
          </div>
        </div>
      </div>
    );
  }

  return (
    // CAMBIO A DISEÑO ADAPTABLE (Flex col en móvil, row en MD)
    <div className="flex flex-col md:flex-row min-h-screen md:h-screen bg-slate-50 text-slate-900 font-sans md:overflow-hidden print:overflow-visible print:h-auto print:block relative">
      
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
        
        {metodoPago === 'efectivo' && Number(montoRecibido) > 0 && (
          <div className="mt-1 space-y-1 text-[8px] text-gray-600 font-bold">
            <div className="flex justify-between"><span>RECIBIDO:</span><span>${Number(montoRecibido).toFixed(2)}</span></div>
            <div className="flex justify-between"><span>CAMBIO:</span><span>${(Number(montoRecibido) - subtotal).toFixed(2)}</span></div>
          </div>
        )}
        
        <div className="mt-3 pt-2 text-center border-t border-dashed border-black text-[7px] space-y-1">
          {ticketConfig.facturacion && <p className="uppercase">{ticketConfig.facturacion}</p>}
          <p className="uppercase italic font-black">{ticketConfig.msg}</p>
        </div>
      </div>

      {/* NAVEGACIÓN (Lateral en PC, Oculta en menú hamburguesa en Móvil) */}
      <nav className={`fixed md:relative top-0 left-0 h-full w-64 md:w-24 bg-indigo-950 flex flex-col md:items-center py-6 justify-between border-r border-indigo-900 print:hidden z-40 transform transition-transform duration-300 md:translate-x-0 overflow-y-auto ${mostrarMenuMovil ? 'translate-x-0' : '-translate-x-full'}`}>
        <div className="space-y-4 flex flex-col items-center w-full px-4 md:px-0">
          <div className="flex justify-between w-full md:justify-center items-center mb-4">
             <div className="bg-orange-500 p-3 rounded-2xl shadow-lg shadow-orange-500/30">
               <Flame className="text-white" size={30} />
             </div>
             {/* Botón cerrar menú solo en móvil */}
             <button onClick={() => setMostrarMenuMovil(false)} className="md:hidden text-white/50 hover:text-white p-2"><X/></button>
          </div>

          {['admin', 'gerente', 'cajero', 'subgerente'].includes(usuarioActivo.rol) && (
            <button className="p-3 rounded-2xl transition-all bg-white/10 text-orange-400 w-full flex md:justify-center gap-3 items-center"><ChefHat size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Caja POS</span></button>
          )}
          {['admin', 'gerente', 'mesero', 'subgerente'].includes(usuarioActivo.rol) && (
            <Link href="/comandas" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><ScrollText size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Comandas</span></Link>
          )}
          <button onClick={() => { setMostrarMenuMovil(false); cargarCuentasAbiertas(); setMostrarModalCuentas(true); }} className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all relative w-full flex md:justify-center gap-3 items-center">
            <ClipboardList size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Cuentas</span>
          </button>
          {['admin', 'gerente', 'cocina', 'subgerente'].includes(usuarioActivo.rol) && (
            <Link href="/cocina" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><Monitor size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Cocina</span></Link>
          )}
          {['admin', 'gerente', 'subgerente'].includes(usuarioActivo.rol) && (
            <>
              <Link href="/inventario" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><Package size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Inventario</span></Link>
              <Link href="/recetas" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><BookOpen size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Recetas</span></Link>
              <Link href="/reportes" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><BarChart3 size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Reportes</span></Link>
            </>
          )}
        </div>
        <div className="flex flex-col gap-4 mt-4 w-full items-center px-4 md:px-0">
          {usuarioActivo.rol === 'admin' && (
            <>
              <Link href="/usuarios" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><UsersIcon size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Usuarios</span></Link>
              <Link href="/configuracion" className="p-3 rounded-2xl text-slate-400 hover:text-white hover:bg-white/10 transition-all w-full flex md:justify-center gap-3 items-center"><Settings size={24} /> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Ajustes</span></Link>
            </>
          )}
          <button onClick={cerrarSesion} className="p-3 rounded-2xl text-red-400 hover:bg-red-500/20 transition-all w-full flex md:justify-center gap-3 items-center"><LogOut size={24}/> <span className="md:hidden text-xs font-bold uppercase tracking-widest">Salir</span></button>
        </div>
      </nav>

      {/* OVERLAY PARA CERRAR EL MENÚ MÓVIL AL TOCAR AFUERA */}
      {mostrarMenuMovil && (
        <div onClick={() => setMostrarMenuMovil(false)} className="md:hidden fixed inset-0 bg-black/50 z-30"></div>
      )}

      <main className="grow p-4 md:p-6 flex flex-col md:overflow-hidden print:hidden relative pb-24 md:pb-6">
        {/* HEADER PRINCIPAL */}
        <header className="flex flex-col md:flex-row md:justify-between md:items-center gap-4 mb-6">
          <div className="flex justify-between items-center w-full md:w-auto">
            <div className="flex items-center gap-3">
              <button onClick={() => setMostrarMenuMovil(true)} className="md:hidden p-2 bg-white rounded-lg shadow-sm border border-slate-200 text-indigo-950"><Menu size={24}/></button>
              <div>
                <h1 className="text-2xl md:text-3xl font-black tracking-tight text-indigo-950 italic uppercase leading-none">RESTA<span className="text-orange-600 font-light">SOFT</span></h1>
              </div>
            </div>
          </div>
          
          {/* TIPO DE ORDEN Y BOTONES SUPERIORES */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 w-full md:w-auto">
            <div className="flex gap-2 w-full sm:w-auto overflow-x-auto pb-1 shrink-0 hide-scrollbar">
              {(['comedor', 'llevar', 'domicilio'] as TipoOrden[]).map((t) => (
                <button key={t} onClick={() => setTipoOrden(t)} className={`px-3 py-2 md:px-4 md:py-2 rounded-full text-[10px] font-black uppercase transition-all border shadow-sm whitespace-nowrap ${tipoOrden === t ? 'bg-indigo-950 text-white border-indigo-950 scale-105' : 'bg-white text-slate-400 border-slate-200 hover:bg-slate-100'}`}>{t}</button>
              ))}
            </div>

            <div className="flex items-center gap-2 md:gap-3 w-full sm:w-auto justify-between sm:justify-end">
              <button 
                onClick={() => { setInputFondo(fondoCaja > 0 ? fondoCaja.toString() : ""); setMostrarModalFondo(true); }}
                className="bg-emerald-50 text-emerald-600 hover:bg-emerald-100 px-3 py-2 rounded-xl shadow-sm border border-emerald-200 flex flex-col items-center justify-center transition-all shrink-0"
              >
                <span className="text-[7px] md:text-[8px] font-black uppercase tracking-widest text-emerald-500 mb-0.5">Fondo</span>
                <span className="text-xs md:text-sm font-black flex items-center gap-1"><Coins size={12}/> ${fondoCaja.toFixed(2)}</span>
              </button>
              
              <div className="flex flex-col text-right border-l border-slate-200 pl-2 md:pl-4 sm:flex">
                 <span className="text-[8px] md:text-[10px] font-black uppercase text-slate-400 tracking-widest">Usuario</span>
                 <span className="text-xs md:text-sm font-black text-indigo-950 uppercase">{usuarioActivo.nombre}</span>
              </div>
              
              <div className="bg-white px-3 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl shadow-sm border border-slate-200 text-indigo-950 font-black flex items-center gap-2 md:gap-3 text-sm md:text-lg shrink-0">
                <Clock size={16} className="text-orange-500" />
                {isClient ? new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '00:00'}
              </div>
            </div>
          </div>
        </header>

        {/* CATEGORÍAS (Scroll horizontal en celular) */}
        <div className="flex gap-2 md:gap-3 mb-4 md:mb-6 overflow-x-auto pb-2 shrink-0 hide-scrollbar">
          <button onClick={() => setCategoriaActiva('todas')} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 transition-all shrink-0 ${categoriaActiva === 'todas' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><ChefHat size={14} className="md:w-4 md:h-4"/> Todo</button>
          <button onClick={() => setCategoriaActiva('pizzas')} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 transition-all shrink-0 ${categoriaActiva === 'pizzas' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Pizza size={14} className="md:w-4 md:h-4"/> Pizzas</button>
          <button onClick={() => setCategoriaActiva('burgers')} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 transition-all shrink-0 ${categoriaActiva === 'burgers' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Utensils size={14} className="md:w-4 md:h-4"/> Burgers</button>
          <button onClick={() => setCategoriaActiva('bebidas')} className={`px-4 py-2 md:px-5 md:py-3 rounded-xl md:rounded-2xl font-black text-[10px] md:text-xs uppercase flex items-center gap-2 transition-all shrink-0 ${categoriaActiva === 'bebidas' ? 'bg-orange-500 text-white shadow-md' : 'bg-white text-slate-500 border border-slate-200 hover:bg-slate-100'}`}><Coffee size={14} className="md:w-4 md:h-4"/> Bebidas</button>
        </div>

        {/* LISTA DE PRODUCTOS */}
        <div className="grid grid-cols-2 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 md:gap-4 md:overflow-y-auto pr-1 md:pr-2 pb-10">
          {productos.filter(p => categoriaActiva === 'todas' || p.categoria === categoriaActiva).map((prod) => (
            <div key={prod.id} onClick={() => abrirPersonalizacion(prod)} className="bg-white p-3 md:p-5 rounded-2xl md:rounded-3xl border-2 border-slate-100 hover:border-orange-500 hover:shadow-xl transition-all cursor-pointer group flex flex-col justify-between min-h-32 md:min-h-40">
              <div><h3 className="font-black text-sm md:text-lg text-indigo-950 group-hover:text-orange-600 transition-colors leading-tight">{prod.nombre}</h3></div>
              <div className="flex justify-between items-end mt-2 md:mt-4"><span className="text-lg md:text-2xl font-black text-indigo-950">${prod.precio}</span><div className="bg-slate-100 p-1.5 md:p-2 rounded-lg md:rounded-xl group-hover:bg-orange-600 group-hover:text-white transition-all"><Plus size={16} className="md:w-5 md:h-5"/></div></div>
            </div>
          ))}
        </div>
      </main>

      {/* BOTÓN FLOTANTE MÓVIL PARA VER CARRITO */}
      <button 
        onClick={() => setMostrarCarritoMovil(true)} 
        className="md:hidden fixed bottom-4 left-4 right-4 bg-indigo-950 text-white p-4 rounded-2xl shadow-2xl flex justify-between items-center z-20 font-black uppercase text-xs"
      >
        <div className="flex items-center gap-2">
          <div className="bg-orange-500 rounded-full w-6 h-6 flex items-center justify-center text-[10px]">{carrito.reduce((acc, item) => acc + item.cantidad, 0)}</div>
          <span>Ver Orden</span>
        </div>
        <span>${subtotal.toFixed(2)} <ChevronRight size={16} className="inline"/></span>
      </button>

      {/* OVERLAY PARA CERRAR EL CARRITO MÓVIL AL TOCAR AFUERA */}
      {mostrarCarritoMovil && (
        <div onClick={() => setMostrarCarritoMovil(false)} className="md:hidden fixed inset-0 bg-black/50 z-30"></div>
      )}

      {/* CARRITO (Lateral en PC, Deslizable en Móvil) */}
      <aside className={`fixed inset-y-0 right-0 z-40 w-[85%] sm:w-96 bg-white md:border-l border-slate-200 flex flex-col shadow-2xl print:hidden transform transition-transform duration-300 md:relative md:translate-x-0 md:w-105 shrink-0 ${mostrarCarritoMovil ? 'translate-x-0' : 'translate-x-full'}`}>
        <div className="p-4 md:p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
          <button onClick={() => setMostrarCarritoMovil(false)} className="md:hidden text-slate-400 hover:text-slate-600 p-2"><ArrowLeft size={20}/></button>
          <h2 className="font-black text-sm md:text-xl text-indigo-950 flex items-center gap-2 uppercase tracking-tighter grow md:grow-0 ml-2 md:ml-0">
            <ShoppingCart size={18} className="text-orange-500" /> 
            {cuentaAbiertaId ? `MESA ${numMesa} (MODIFICANDO)` : (tipoOrden === 'comedor' ? `MESA ${numMesa}` : `${tipoOrden}`)}
          </h2>
          <button onClick={() => { setCarrito([]); setCuentaAbiertaId(null); setMontoRecibido(""); setMostrarCarritoMovil(false); }} className="text-slate-300 hover:text-red-500 transition-colors p-2"><Trash2 size={20} /></button>
        </div>

        <div className="grow overflow-y-auto p-4 md:p-6 space-y-3 md:space-y-4">
          {carrito.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center opacity-30"><ShoppingCart size={40} className="text-slate-400 mb-4 md:w-15 md:h-15" /><p className="font-black uppercase tracking-widest text-[10px] md:text-xs text-slate-600">Ticket Vacío</p></div>
          ) : (
            carrito.map((item) => (
              <div key={item.itemUniqueId} className={`flex gap-3 md:gap-4 p-3 md:p-4 rounded-xl md:rounded-2xl border transition-all ${item.yaGuardado ? 'bg-white border-slate-100 opacity-60' : 'bg-orange-50 border-orange-200 animate-in slide-in-from-right-4 duration-200'}`}>
                <div className="w-10 h-10 md:w-12 md:h-12 bg-white shadow-sm rounded-lg md:rounded-xl flex items-center justify-center font-black text-orange-600 text-lg md:text-xl border border-slate-100 shrink-0">{item.cantidad}</div>
                <div className="grow">
                  <div className="flex justify-between font-black text-indigo-950 text-xs md:text-sm mb-1">
                    <span className="leading-tight pr-2">{item.nombre} {item.yaGuardado && <span className="text-[8px] md:text-[9px] bg-slate-200 text-slate-500 px-2 py-0.5 rounded-full ml-1 whitespace-nowrap">En Cocina</span>}</span>
                    <span>${(item.precio * item.cantidad).toFixed(2)}</span>
                  </div>
                  {item.notas && <p className="text-[9px] md:text-[10px] font-bold text-slate-400 uppercase leading-tight mb-2 italic">&quot;{item.notas}&quot;</p>}
                  {!item.yaGuardado && (
                     <button onClick={() => quitarUno(item.itemUniqueId)} className="text-red-400 hover:text-red-600 transition-all flex items-center gap-1 text-[9px] md:text-[10px] font-bold uppercase mt-1 md:mt-2 w-max"><Minus size={10} className="border border-current rounded-full p-0.5"/> Quitar</button>
                  )}
                </div>
              </div>
            ))
          )}
        </div>

        <div className="p-4 md:p-6 bg-white border-t border-slate-100 shadow-[0_-10px_40px_rgba(0,0,0,0.05)] pb-8 md:pb-6">
          <div className="flex justify-between items-end mb-4 md:mb-6">
            <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Total a pagar</span>
            <span className="text-3xl md:text-4xl font-black text-indigo-950 italic leading-none">${subtotal.toFixed(2)}</span>
          </div>
          <button onClick={() => { 
            if (cuentaAbiertaId || tipoOrden !== 'comedor') setMostrarModalPago(true); 
            else setMostrarModalMesa(true); 
          }} disabled={carrito.length === 0} className="w-full bg-orange-600 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl shadow-lg md:shadow-xl shadow-orange-600/20 flex items-center justify-center gap-2 md:gap-3 hover:bg-orange-500 active:scale-95 transition-all disabled:bg-slate-200 disabled:shadow-none uppercase tracking-widest text-xs md:text-sm">
            PROCESAR ORDEN <ChevronRight size={18} />
          </button>
        </div>
      </aside>

      {/* --- MODAL DE PAGOS Y CAMBIO --- */}
      {mostrarModalPago && (
        <div className="fixed inset-0 bg-indigo-950/80 md:bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-60 p-2 md:p-4 print:hidden">
          <div className="bg-white w-full max-w-lg rounded-4xl md:rounded-[48px] p-6 md:p-10 shadow-2xl text-center animate-in zoom-in duration-200 max-h-[98vh] overflow-y-auto">
            <h2 className="text-2xl md:text-3xl font-black text-indigo-950 uppercase italic mb-1 md:mb-2">Procesar Orden</h2>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 md:mb-8">Mesa {numMesa} • {tipoOrden}</p>
            
            {usuarioActivo.rol !== 'mesero' && (
              <div className="grid grid-cols-2 gap-3 md:gap-4 mb-4 md:mb-6">
                <button onClick={() => { setMetodoPago('efectivo'); setMontoRecibido(""); }} className={`flex flex-col items-center justify-center gap-2 md:gap-3 p-4 md:p-6 rounded-2xl md:rounded-3xl border-4 transition-all ${metodoPago === 'efectivo' ? 'border-emerald-500 bg-emerald-50 text-emerald-600 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}><DollarSign size={28} className="md:w-8 md:h-8" /><span className="font-black uppercase text-[10px] md:text-xs tracking-widest">Efectivo</span></button>
                <button onClick={() => setMetodoPago('tarjeta')} className={`flex flex-col items-center justify-center gap-2 md:gap-3 p-4 md:p-6 rounded-2xl md:rounded-3xl border-4 transition-all ${metodoPago === 'tarjeta' ? 'border-blue-500 bg-blue-50 text-blue-600 shadow-inner' : 'border-slate-100 text-slate-400 hover:border-slate-200'}`}><CreditCard size={28} className="md:w-8 md:h-8" /><span className="font-black uppercase text-[10px] md:text-xs tracking-widest">Tarjeta</span></button>
              </div>
            )}

            <div className="bg-slate-50 p-4 md:p-6 rounded-2xl md:rounded-3xl mb-4 md:mb-6 border border-slate-100 flex justify-between items-center">
              <span className="text-xs md:text-sm font-black uppercase text-slate-400">Total:</span>
              <span className="text-3xl md:text-4xl font-black italic text-indigo-950">${subtotal.toFixed(2)}</span>
            </div>

            {/* CALCULADORA DE CAMBIO */}
            {usuarioActivo.rol !== 'mesero' && metodoPago === 'efectivo' && !cuentaAbiertaId && (
              <div className="mb-6 md:mb-8 bg-white border-2 border-slate-100 p-4 md:p-6 rounded-2xl md:rounded-3xl text-left">
                <label className="text-[9px] md:text-[10px] font-black uppercase tracking-widest text-slate-400 mb-2 md:mb-3 block">Calculadora de Cambio</label>
                
                <div className="grid grid-cols-5 gap-1 md:gap-2 mb-3 md:mb-4">
                  <button onClick={() => setMontoRecibido(subtotal.toString())} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 p-1 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black transition-colors">Exacto</button>
                  <button onClick={() => setMontoRecibido("50")} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 p-1 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black transition-colors">$50</button>
                  <button onClick={() => setMontoRecibido("100")} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 p-1 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black transition-colors">$100</button>
                  <button onClick={() => setMontoRecibido("200")} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 p-1 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black transition-colors">$200</button>
                  <button onClick={() => setMontoRecibido("500")} className="bg-slate-100 hover:bg-emerald-100 text-slate-600 hover:text-emerald-600 p-1 md:p-2 rounded-lg md:rounded-xl text-[9px] md:text-xs font-black transition-colors">$500</button>
                </div>

                <div className="flex items-center gap-2 md:gap-3 mb-3 md:mb-4">
                  <div className="relative grow">
                    <DollarSign size={16} className="absolute left-3 md:left-4 top-1/2 -translate-y-1/2 text-slate-400 md:w-5 md:h-5" />
                    <input type="number" placeholder="Recibido..." className="w-full bg-slate-50 border-2 border-slate-200 rounded-xl md:rounded-2xl p-3 pl-9 md:p-4 md:pl-12 font-black text-indigo-950 outline-none focus:border-emerald-500 transition-all text-base md:text-lg" value={montoRecibido} onChange={(e) => setMontoRecibido(e.target.value)} />
                  </div>
                  <button onClick={() => setMontoRecibido("")} className="bg-red-50 text-red-500 font-black px-4 py-3 md:p-4 rounded-xl md:rounded-2xl hover:bg-red-100 transition-colors">C</button>
                </div>

                <div className={`p-3 md:p-4 rounded-xl md:rounded-2xl flex justify-between items-center transition-all ${Number(montoRecibido) >= subtotal ? 'bg-emerald-50 border border-emerald-200' : 'bg-slate-50 border border-slate-100'}`}>
                  <span className="text-[10px] md:text-xs font-black uppercase text-slate-500">A entregar:</span>
                  <span className={`text-xl md:text-2xl font-black ${Number(montoRecibido) >= subtotal ? 'text-emerald-600' : 'text-slate-300'}`}>${Number(montoRecibido) >= subtotal ? (Number(montoRecibido) - subtotal).toFixed(2) : "0.00"}</span>
                </div>
              </div>
            )}

            <div className="space-y-2 md:space-y-3">
              {usuarioActivo.rol !== 'mesero' && (
                <button 
                  onClick={() => finalizarPedido(false)} 
                  disabled={metodoPago === 'efectivo' && (!montoRecibido || Number(montoRecibido) < subtotal)}
                  className="w-full bg-emerald-500 text-white font-black py-3 md:py-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:bg-emerald-400 transition-all uppercase tracking-widest text-[10px] md:text-xs disabled:opacity-50 disabled:shadow-none"
                >
                  <Printer size={16} /> Cobrar e Imprimir
                </button>
              )}
              <button onClick={() => finalizarPedido(true)} className="w-full bg-indigo-950 text-white font-black py-3 md:py-4 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:bg-indigo-800 transition-all uppercase tracking-widest text-[10px] md:text-xs">
                <ClipboardList size={16} /> {cuentaAbiertaId ? 'Actualizar Cocina' : 'Enviar a Cocina / Dejar Abierta'}
              </button>
              <button onClick={() => setMostrarModalPago(false)} className="w-full bg-slate-100 text-slate-500 font-black py-3 md:py-4 rounded-xl md:rounded-2xl uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-200 transition-all">Cancelar</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL PARA FONDO DE CAJA --- */}
      {mostrarModalFondo && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-60 p-4 print:hidden">
          <div className="bg-white w-full max-w-sm rounded-4xl md:rounded-[48px] p-6 md:p-10 shadow-2xl text-center animate-in zoom-in duration-200">
            <div className="mx-auto bg-emerald-100 w-12 h-12 md:w-16 md:h-16 rounded-full flex items-center justify-center mb-4"><Banknote className="text-emerald-600 w-6 h-6 md:w-8 md:h-8" /></div>
            <h2 className="text-xl md:text-2xl font-black text-indigo-950 uppercase italic mb-1 md:mb-2">Fondo de Caja</h2>
            <p className="text-[10px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 md:mb-8">Ingresa el efectivo inicial</p>
            
            <div className="relative mb-6 md:mb-8">
              <DollarSign size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 md:w-6 md:h-6" />
              <input type="number" placeholder="0.00" className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl md:rounded-3xl p-4 md:p-5 pl-10 md:pl-12 font-black text-indigo-950 outline-none focus:border-emerald-500 transition-all text-2xl md:text-3xl text-center" value={inputFondo} onChange={(e) => setInputFondo(e.target.value)} autoFocus />
            </div>
            
            <div className="flex gap-3 md:gap-4">
              <button onClick={() => setMostrarModalFondo(false)} className="grow bg-slate-100 text-slate-500 font-bold py-3 md:py-4 rounded-xl md:rounded-2xl uppercase tracking-widest text-[10px] md:text-xs hover:bg-slate-200 transition-colors">Cancelar</button>
              <button onClick={guardarFondoCaja} className="grow bg-emerald-500 text-white font-black py-3 md:py-4 rounded-xl md:rounded-2xl uppercase tracking-widest text-[10px] md:text-xs shadow-lg hover:bg-emerald-400 transition-colors flex justify-center items-center gap-2"><Check size={14}/> Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CUENTAS --- */}
      {mostrarModalCuentas && (
        <div className="fixed inset-0 bg-indigo-950/80 md:bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-60 p-2 md:p-4 print:hidden">
          <div className="bg-white w-full max-w-4xl max-h-[95vh] md:max-h-[80vh] rounded-4xl md:rounded-[48px] p-6 md:p-10 shadow-2xl flex flex-col">
            <div className="flex justify-between items-start md:items-center mb-6 md:mb-8">
              <div>
                <h2 className="text-xl md:text-3xl font-black text-indigo-950 uppercase italic leading-none">Cuentas Pendientes</h2>
                {usuarioActivo.rol === 'mesero' && <p className="text-[9px] md:text-xs font-bold text-slate-400 uppercase tracking-widest mt-2">Viendo solo las mesas de: {usuarioActivo.nombre}</p>}
              </div>
              <button onClick={() => setMostrarModalCuentas(false)} className="bg-slate-100 p-2 md:p-3 rounded-full text-slate-400 hover:text-red-500 transition-all shrink-0"><X size={20} className="md:w-6 md:h-6"/></button>
            </div>
            <div className="grow overflow-y-auto grid grid-cols-1 md:grid-cols-2 gap-3 md:gap-4 pr-1 md:pr-2">
              {cuentasAbiertas.length === 0 ? (
                <div className="col-span-full py-10 md:py-20 text-center text-slate-400 font-bold uppercase tracking-widest text-xs md:text-sm">No hay cuentas pendientes</div>
              ) : (
                cuentasAbiertas.map(cuenta => (
                  <div key={cuenta.id} className="border-2 border-slate-100 rounded-2xl md:rounded-3xl p-4 md:p-6 hover:border-orange-500 transition-all cursor-pointer group flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between items-start mb-3 md:mb-4">
                        <span className="bg-orange-100 text-orange-600 px-2 py-1 md:px-3 rounded-full text-[8px] md:text-[10px] font-black uppercase tracking-widest">{cuenta.tipo_servicio}</span>
                        <span className="font-black text-lg md:text-xl text-indigo-950">${cuenta.total}</span>
                      </div>
                      <div className="flex justify-between text-[10px] md:text-xs font-bold mb-3 md:mb-4">
                         <span className="text-slate-400">{new Date(cuenta.fecha).toLocaleTimeString()}</span>
                         <span className="text-indigo-400 uppercase">Por: {cuenta.mesero || 'Caja'}</span>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-2">
                      <button onClick={() => recuperarCuenta(cuenta, false)} className="bg-slate-50 text-indigo-950 font-black py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-orange-50 transition-all">Ver / Agregar</button>
                      {usuarioActivo.rol !== 'mesero' ? (
                        <button onClick={() => recuperarCuenta(cuenta, true)} className="bg-emerald-500 text-white font-black py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] uppercase tracking-widest hover:bg-emerald-400 transition-all shadow-md">Cobrar Directo</button>
                      ) : (
                        <div className="bg-slate-100 text-slate-400 font-black py-2 md:py-3 rounded-lg md:rounded-xl text-[9px] md:text-[10px] uppercase tracking-widest text-center flex items-center justify-center cursor-not-allowed">Solo Caja</div>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL MESA --- */}
      {mostrarModalMesa && (
        <div className="fixed inset-0 bg-indigo-950/80 md:bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-60 p-4 print:hidden">
          <div className="bg-white w-full max-w-lg rounded-4xl md:rounded-[48px] p-6 md:p-10 shadow-2xl text-center animate-in zoom-in duration-200">
            <h2 className="text-2xl md:text-3xl font-black text-indigo-950 uppercase italic mb-4 md:mb-6">Mesa</h2>
            <div className="grid grid-cols-4 md:grid-cols-5 gap-2 md:gap-3 mb-6 md:mb-10 max-h-60 overflow-y-auto pr-2 md:max-h-none md:overflow-visible">
              {[1,2,3,4,5,6,7,8,9,10,11,12,13,14,15].map(n => (
                <button key={n} onClick={() => setNumMesa(n.toString())} className={`h-12 md:h-16 rounded-xl md:rounded-2xl font-black text-base md:text-lg transition-all border-4 ${numMesa === n.toString() ? 'bg-orange-500 text-white border-orange-600 shadow-md' : 'bg-slate-50 text-slate-400 border-transparent hover:border-slate-200'}`}>{n}</button>
              ))}
            </div>
            <div className="flex gap-3 md:gap-4">
              <button onClick={() => setMostrarModalMesa(false)} className="grow bg-slate-100 text-slate-500 font-bold py-3 md:py-4 rounded-xl md:rounded-2xl uppercase tracking-widest text-[10px] md:text-xs">CANCELAR</button>
              <button onClick={() => { setMostrarModalMesa(false); setMostrarModalPago(true); }} className="grow bg-indigo-950 text-white font-black py-3 md:py-4 rounded-xl md:rounded-2xl uppercase tracking-widest text-[10px] md:text-xs shadow-xl">Siguiente</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL PRODUCTO ESPECIAL --- */}
      {productoEnSeleccion && (
        <div className="fixed inset-0 bg-indigo-950/80 md:bg-indigo-950/40 backdrop-blur-sm flex items-center justify-center z-60 p-4 print:hidden">
          <div className="bg-white w-full max-w-md rounded-4xl md:rounded-[40px] p-6 md:p-8 shadow-2xl animate-in zoom-in duration-200">
            <div className="flex justify-between items-start mb-4 md:mb-6">
              <div>
                <h2 className="text-xl md:text-2xl font-black text-indigo-950 leading-none">{productoEnSeleccion.nombre}</h2>
                <p className="text-slate-400 text-[10px] md:text-xs mt-1 md:mt-2 uppercase font-bold tracking-widest">Ajustes Especiales</p>
              </div>
              <button onClick={() => setProductoEnSeleccion(null)} className="text-slate-300 hover:text-red-500 transition-colors bg-slate-100 p-2 rounded-full"><X size={16} className="md:w-5 md:h-5"/></button>
            </div>
            
            <div className="mb-6 md:mb-8">
              <h4 className="text-[9px] md:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 md:mb-3">Notas para Cocina</h4>
              <textarea placeholder="Ej. Sin cebolla, término medio..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl md:rounded-3xl p-3 md:p-4 text-xs md:text-sm font-bold text-indigo-950 focus:border-orange-500 outline-none transition-all placeholder:text-slate-300 min-h-20 md:min-h-24 resize-none" value={notasTemporales} onChange={(e) => setNotasTemporales(e.target.value)} />
            </div>
            
            <button onClick={agregarAlCarritoFinal} className="w-full bg-orange-600 text-white font-black py-4 md:py-5 rounded-xl md:rounded-2xl flex items-center justify-center gap-2 shadow-lg hover:bg-orange-500 active:scale-95 transition-all uppercase tracking-widest text-[10px] md:text-xs">
              <Check size={16} /> Agregar a la orden
            </button>
          </div>
        </div>
      )}
    </div>
  );
}