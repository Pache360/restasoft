"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart3, DollarSign, CreditCard, ShoppingBag, 
  ArrowLeft, Calendar, Loader2, TrendingUp, ArrowDownCircle, Wallet,
  Printer, TrendingDown as TrendingDownIcon, UtensilsCrossed, AlertTriangle, ShieldCheck, Banknote
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image';

// --- INTERFACES ---
interface UsuarioLogueado {
  id: string; nombre: string; rol: string;
}

interface VentaPedido {
  id: string; created_at: string; total: number; tipo_servicio: string; metodo_pago: string; estado: string;
}

interface Egreso {
  id: string; monto: number; concepto: string; created_at: string;
}

interface PedidoItem {
  cantidad: number; productos: { nombre: string };
}

export default function ReportesCombinadosPage() {
  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'caja' | 'cierre'>('caja');

  // ==========================================
  // ESTADOS: BALANCE DE CAJA
  // ==========================================
  const [ventasCaja, setVentasCaja] = useState<VentaPedido[]>([]);
  const [egresosCaja, setEgresosCaja] = useState<Egreso[]>([]); 

  // ==========================================
  // ESTADOS: CIERRE DE DÍA (PRODUCCIÓN E INVENTARIO)
  // ==========================================
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaFiltro, setFechaFiltro] = useState<string>(hoy);
  const [ventasEfectivo, setVentasEfectivo] = useState(0);
  const [ventasTarjeta, setVentasTarjeta] = useState(0);
  const [cuentasPendientes, setCuentasPendientes] = useState(0);
  const [totalEgresosCierre, setTotalEgresosCierre] = useState(0);
  const [platillosVendidos, setPlatillosVendidos] = useState<Record<string, number>>({});
  const [listaEgresosCierre, setListaEgresosCierre] = useState<Egreso[]>([]);

  // Validar Seguridad - CORREGIDO (Evita cascading renders)
  useEffect(() => {
    const verificarAcceso = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      if (userGuardado) {
        const parsed = JSON.parse(userGuardado);
        if (['admin', 'gerente', 'cajero'].includes(parsed.rol)) {
          setUsuarioActivo(parsed);
        }
      }
    };
    verificarAcceso();
  }, []);

  // CARGAR DATOS PARA "BALANCE DE CAJA"
  const fetchDatosCaja = useCallback(async () => {
    const inicioHoy = new Date();
    inicioHoy.setHours(0, 0, 0, 0);
    const isoHoy = inicioHoy.toISOString();

    const { data: vData } = await supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', isoHoy)
      .order('created_at', { ascending: false });

    const { data: eData } = await supabase
      .from('egresos')
      .select('*')
      .gte('created_at', isoHoy)
      .order('created_at', { ascending: false });

    setVentasCaja((vData as VentaPedido[]) || []);
    setEgresosCaja((eData as Egreso[]) || []);
  }, []);

  // CARGAR DATOS PARA "CIERRE DE DÍA"
  const fetchDatosCierre = useCallback(async () => {
    const fechaInicio = new Date(`${fechaFiltro}T00:00:00.000Z`);
    const fechaFin = new Date(`${fechaFiltro}T23:59:59.999Z`);

    const { data: pedidosData } = await supabase
      .from('pedidos')
      .select('*')
      .gte('created_at', fechaInicio.toISOString())
      .lte('created_at', fechaFin.toISOString());

    const pedidos = (pedidosData || []) as VentaPedido[];
    
    let efectivo = 0; let tarjeta = 0; let pendientes = 0;
    pedidos.forEach(p => {
      if (p.metodo_pago === 'efectivo' && p.estado === 'completado') efectivo += p.total;
      else if (p.metodo_pago === 'tarjeta' && p.estado === 'completado') tarjeta += p.total;
      else if (p.metodo_pago === 'por_cobrar') pendientes += p.total;
    });

    setVentasEfectivo(efectivo);
    setVentasTarjeta(tarjeta);
    setCuentasPendientes(pendientes);

    const { data: egresosData } = await supabase
      .from('egresos')
      .select('*')
      .gte('created_at', fechaInicio.toISOString())
      .lte('created_at', fechaFin.toISOString())
      .order('created_at', { ascending: false });

    const egresos = (egresosData || []) as Egreso[];
    setListaEgresosCierre(egresos);
    setTotalEgresosCierre(egresos.reduce((acc, eg) => acc + eg.monto, 0));

    const { data: itemsData } = await supabase
      .from('pedido_items')
      .select('cantidad, productos(nombre)')
      .gte('created_at', fechaInicio.toISOString())
      .lte('created_at', fechaFin.toISOString());

    const items = (itemsData || []) as unknown as PedidoItem[];
    const conteoPlatillos: Record<string, number> = {};
    
    items.forEach(item => {
      const nombre = item.productos?.nombre || 'Desconocido';
      conteoPlatillos[nombre] = (conteoPlatillos[nombre] || 0) + item.cantidad;
    });

    setPlatillosVendidos(conteoPlatillos);
  }, [fechaFiltro]);

  // Ejecutar las consultas al montar o cambiar pestaña/filtro
  useEffect(() => {
    const iniciar = async () => {
      setCargando(true);
      if (vista === 'caja') await fetchDatosCaja();
      if (vista === 'cierre') await fetchDatosCierre();
      setCargando(false);
    };
    if (usuarioActivo) iniciar();
  }, [vista, usuarioActivo, fetchDatosCaja, fetchDatosCierre]);

  // CÁLCULOS BALANCE CAJA
  const totalVentasCaja = ventasCaja.reduce((acc, v) => acc + Number(v.total), 0);
  const totalEgresosCaja = egresosCaja.reduce((acc, e) => acc + Number(e.monto), 0);
  const utilidadNetaCaja = totalVentasCaja - totalEgresosCaja;
  const efectivoCaja = ventasCaja.filter(v => v.metodo_pago === 'efectivo').reduce((acc, v) => acc + Number(v.total), 0);
  const tarjetaCaja = ventasCaja.filter(v => v.metodo_pago === 'tarjeta').reduce((acc, v) => acc + Number(v.total), 0);

  // CÁLCULOS CIERRE DÍA
  const ventasTotalesRealesCierre = ventasEfectivo + ventasTarjeta;
  const utilidadAproximadaCierre = ventasTotalesRealesCierre - totalEgresosCierre;

  if (cargando && !usuarioActivo) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> Iniciando...</div>;

  if (!usuarioActivo && !cargando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-indigo-950 text-white font-sans">
        <div className="bg-red-500 p-6 rounded-full mb-6"><ShieldCheck size={48} /></div>
        <h1 className="text-2xl font-black uppercase tracking-widest mb-2">Acceso Denegado</h1>
        <p className="text-slate-400 font-bold uppercase text-xs mb-8">No tienes permisos para ver reportes</p>
        <Link href="/" className="bg-slate-800 px-6 py-3 rounded-xl uppercase font-black text-[10px] hover:bg-slate-700 transition-all">Volver a Caja</Link>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20 print:bg-white print:pb-0">
      
      {/* ========================================== */}
      {/* TICKET DE IMPRESIÓN (SOLO PARA BALANCE DE CAJA) */}
      {/* ========================================== */}
      {vista === 'caja' && (
        <div id="area-impresion" className="hidden print:flex flex-col p-1 text-black bg-white font-mono text-[9px] leading-tight h-auto">
          <div className="text-center mb-2">
            <div className="flex justify-center mb-1">
              <Image src="/logo.png" alt="Logo" width={60} height={60} className="grayscale" unoptimized />
            </div>
            <h2 className="text-sm font-black uppercase tracking-tighter">CORTE DE CAJA</h2>
            <p className="text-[7px]">{new Date().toLocaleString()}</p>
          </div>
          <div className="border-b border-dashed border-black mb-1"></div>
          <div className="space-y-1">
            <div className="flex justify-between"><span>VENTAS TOTALES:</span><span>${totalVentasCaja.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>EGRESOS (GASTOS):</span><span>-${totalEgresosCaja.toFixed(2)}</span></div>
            <div className="flex justify-between font-black text-[10px] pt-1"><span>UTILIDAD NETA:</span><span>${utilidadNetaCaja.toFixed(2)}</span></div>
          </div>
          <div className="border-b border-dashed border-black my-2"></div>
          <div className="space-y-1">
            <p className="font-bold underline">DESGLOSE VENTAS:</p>
            <div className="flex justify-between"><span>EFECTIVO:</span><span>${efectivoCaja.toFixed(2)}</span></div>
            <div className="flex justify-between"><span>TARJETA:</span><span>${tarjetaCaja.toFixed(2)}</span></div>
          </div>
          <p className="text-center mt-4 text-[7px] uppercase italic">Pache 360 - Xoxocotlán</p>
        </div>
      )}

      {/* ========================================== */}
      {/* ENCABEZADO DE IMPRESIÓN (SOLO PARA CIERRE DE DÍA) */}
      {/* ========================================== */}
      {vista === 'cierre' && (
        <div className="hidden print:block text-center pt-8 pb-4 border-b-2 border-black mb-8">
          <h1 className="text-4xl font-black uppercase italic tracking-tighter">RESTA SOFT</h1>
          <h2 className="text-xl font-bold uppercase tracking-widest mt-1">Cierre de Día y Producción</h2>
          <p className="text-sm font-bold uppercase mt-2">Fecha de Operación: {fechaFiltro}</p>
          <p className="text-[10px] font-bold uppercase text-slate-500 mt-1">Generado por: {usuarioActivo?.nombre}</p>
        </div>
      )}

      {/* ========================================== */}
      {/* HEADER DE LA APLICACIÓN */}
      {/* ========================================== */}
      <header className="bg-indigo-950 text-white p-8 shadow-2xl print:hidden">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={24} />
            </Link>
            <div>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                Reportes <span className="text-orange-500 font-light">RestaSoft</span>
              </h1>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* SELECTOR DE VISTAS */}
            <div className="bg-white/10 p-1 rounded-2xl flex gap-1 border border-white/20">
              <button onClick={() => setVista('caja')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'caja' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}>
                <Wallet size={14} /> Balance
              </button>
              <button onClick={() => setVista('cierre')} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'cierre' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}>
                <UtensilsCrossed size={14} /> Cierre
              </button>
            </div>

            {vista === 'cierre' && (
              <div className="flex items-center gap-2 bg-white/10 p-2 rounded-2xl border border-white/20">
                <Calendar size={18} className="text-slate-300 ml-2" />
                <input 
                  type="date" 
                  className="bg-transparent text-white font-black outline-none px-2 uppercase tracking-widest text-xs"
                  value={fechaFiltro}
                  onChange={(e) => setFechaFiltro(e.target.value)}
                />
              </div>
            )}

            <button 
              onClick={() => window.print()}
              className="bg-white/10 hover:bg-white/20 p-3 rounded-2xl border border-white/10 transition-all flex items-center gap-2 text-white font-black uppercase text-[10px] tracking-widest"
              title="Imprimir"
            >
              <Printer size={18} /> <span className="hidden md:inline">Imprimir</span>
            </button>
          </div>
        </div>
      </header>

      {/* ========================================== */}
      {/* VISTA 1: BALANCE DE CAJA */}
      {/* ========================================== */}
      {vista === 'caja' && (
        <main className="max-w-6xl mx-auto p-8 print:hidden animate-in fade-in">
          <div className="flex justify-between items-center mb-8">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic flex items-center gap-2">
              <BarChart3 className="text-orange-500"/> Balance del Turno Actual
            </h2>
            <div className="bg-emerald-600 px-6 py-3 rounded-2xl shadow-lg shadow-emerald-900/20 text-center border-b-4 border-emerald-800 text-white">
              <p className="text-[10px] font-black uppercase opacity-80">Ganancia Real (Utilidad)</p>
              <p className="text-3xl font-black italic">${utilidadNetaCaja.toFixed(2)}</p>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Ventas Totales</p>
              <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
                <DollarSign size={16} className="text-emerald-500" /> ${totalVentasCaja.toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 text-red-600">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Egresos (Compras)</p>
              <p className="text-xl font-black flex items-center gap-2">
                <ArrowDownCircle size={16} /> -${totalEgresosCaja.toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Efectivo en Caja</p>
              <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
                <Wallet size={16} className="text-emerald-500" /> ${efectivoCaja.toFixed(2)}
              </p>
            </div>
            <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
              <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Ventas Tarjeta</p>
              <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
                <CreditCard size={16} className="text-blue-500" /> ${tarjetaCaja.toFixed(2)}
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
                <h3 className="font-black text-indigo-950 uppercase text-xs flex items-center gap-2">
                  <ShoppingBag size={16} className="text-orange-500" /> Historial de Ventas
                </h3>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {ventasCaja.map((v) => (
                      <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-[10px] font-bold text-slate-400">
                          {new Date(v.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4 text-xs font-black text-indigo-950 uppercase italic">{v.tipo_servicio}</td>
                        <td className="p-4 text-right font-black text-indigo-950 text-sm">${Number(v.total).toFixed(2)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white rounded-[40px] shadow-sm border border-slate-200 overflow-hidden">
              <div className="p-6 border-b border-slate-100 flex justify-between items-center bg-red-50/30">
                <h3 className="font-black text-red-600 uppercase text-xs flex items-center gap-2">
                  <ArrowDownCircle size={16} /> Compras / Gastos
                </h3>
              </div>
              <div className="overflow-x-auto max-h-96">
                <table className="w-full text-left">
                  <tbody className="divide-y divide-slate-100">
                    {egresosCaja.map((e) => (
                      <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                        <td className="p-4 text-[10px] font-bold text-slate-400">
                          {new Date(e.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="p-4 text-xs font-bold text-slate-600 uppercase">{e.concepto}</td>
                        <td className="p-4 text-right font-black text-red-600 text-sm">-${Number(e.monto).toFixed(2)}</td>
                      </tr>
                    ))}
                    {egresosCaja.length === 0 && (
                      <tr><td colSpan={3} className="p-10 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">Sin gastos hoy</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        </main>
      )}

      {/* ========================================== */}
      {/* VISTA 2: CIERRE DE DÍA */}
      {/* ========================================== */}
      {vista === 'cierre' && (
        <main className="max-w-6xl mx-auto p-8 print:p-0 animate-in fade-in">
          
          <div className="mb-10">
            <h2 className="text-lg font-black text-indigo-950 uppercase italic mb-4 flex items-center gap-2"><DollarSign className="text-orange-500"/> Resumen Financiero</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 print:grid-cols-4">
              
              <div className="bg-emerald-50 border-2 border-emerald-100 p-6 rounded-3xl flex flex-col justify-between print:border-black print:bg-transparent">
                <span className="text-[10px] font-black uppercase tracking-widest text-emerald-600 flex items-center gap-2"><Banknote size={14}/> Efectivo Real</span>
                <span className="text-4xl font-black text-emerald-700 mt-2">${ventasEfectivo.toFixed(2)}</span>
              </div>

              <div className="bg-blue-50 border-2 border-blue-100 p-6 rounded-3xl flex flex-col justify-between print:border-black print:bg-transparent">
                <span className="text-[10px] font-black uppercase tracking-widest text-blue-600 flex items-center gap-2"><CreditCard size={14}/> Cobro Tarjeta</span>
                <span className="text-4xl font-black text-blue-700 mt-2">${ventasTarjeta.toFixed(2)}</span>
              </div>

              <div className="bg-orange-50 border-2 border-orange-100 p-6 rounded-3xl flex flex-col justify-between print:border-black print:bg-transparent">
                <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 flex items-center gap-2"><AlertTriangle size={14}/> Cuentas Abiertas</span>
                <span className="text-4xl font-black text-orange-700 mt-2">${cuentasPendientes.toFixed(2)}</span>
              </div>

              <div className="bg-red-50 border-2 border-red-100 p-6 rounded-3xl flex flex-col justify-between print:border-black print:bg-transparent">
                <span className="text-[10px] font-black uppercase tracking-widest text-red-600 flex items-center gap-2"><TrendingDownIcon size={14}/> Gastos y Mermas</span>
                <span className="text-4xl font-black text-red-700 mt-2">${totalEgresosCierre.toFixed(2)}</span>
              </div>

            </div>

            <div className="mt-4 bg-indigo-950 text-white p-8 rounded-4xl flex justify-between items-center shadow-xl print:bg-white print:text-black print:border-4 print:border-black print:rounded-none">
               <div>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest print:text-black">Ingreso Bruto (Efectivo + Tarjeta)</p>
                  <p className="text-4xl font-black italic mt-1">${ventasTotalesRealesCierre.toFixed(2)}</p>
               </div>
               <div className="text-right">
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest print:text-black">Balance Final Estimado</p>
                  <p className={`text-4xl font-black italic mt-1 flex items-center gap-2 ${utilidadAproximadaCierre >= 0 ? 'text-emerald-400 print:text-black' : 'text-red-400 print:text-black'}`}>
                    {utilidadAproximadaCierre >= 0 ? <TrendingUp size={32}/> : <TrendingDownIcon size={32}/>}
                    ${utilidadAproximadaCierre.toFixed(2)}
                  </p>
               </div>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 print:grid-cols-2 print:gap-4">
            
            <div className="bg-white border-2 border-slate-100 rounded-[40px] p-8 shadow-sm print:border-black print:rounded-none print:shadow-none">
              <h2 className="text-lg font-black text-indigo-950 uppercase italic mb-6 flex items-center gap-2 print:text-black">
                <UtensilsCrossed className="text-orange-500 print:hidden"/> Producción
              </h2>
              <div className="max-h-96 overflow-y-auto print:max-h-none">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 print:border-black">
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Cantidad</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Producto Preparado</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 print:divide-black/20">
                    {Object.entries(platillosVendidos)
                      .sort((a, b) => b[1] - a[1])
                      .map(([nombre, cantidad]) => (
                      <tr key={nombre} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4">
                          <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-xl text-sm font-black print:bg-transparent print:text-black print:border print:border-black">
                            {cantidad}
                          </span>
                        </td>
                        <td className="py-4 font-black text-indigo-950 uppercase text-sm print:text-black">{nombre}</td>
                      </tr>
                    ))}
                    {Object.keys(platillosVendidos).length === 0 && (
                      <tr><td colSpan={2} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">Sin registros de platillos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

            <div className="bg-white border-2 border-slate-100 rounded-[40px] p-8 shadow-sm print:border-black print:rounded-none print:shadow-none">
              <h2 className="text-lg font-black text-indigo-950 uppercase italic mb-6 flex items-center gap-2 print:text-black">
                <TrendingDownIcon className="text-red-500 print:hidden"/> Egresos e Inventario
              </h2>
              <div className="max-h-96 overflow-y-auto print:max-h-none">
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b-2 border-slate-100 print:border-black">
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Hora</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest print:text-black">Concepto / Merma</th>
                      <th className="pb-3 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right print:text-black">Costo</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 print:divide-black/20">
                    {listaEgresosCierre.map(egreso => (
                      <tr key={egreso.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-4 text-[10px] font-bold text-slate-400 uppercase print:text-black">
                          {new Date(egreso.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td className="py-4 font-black text-indigo-950 uppercase text-xs print:text-black">
                          {egreso.concepto}
                        </td>
                        <td className="py-4 text-right font-black text-red-500 print:text-black">
                          ${egreso.monto.toFixed(2)}
                        </td>
                      </tr>
                    ))}
                    {listaEgresosCierre.length === 0 && (
                      <tr><td colSpan={3} className="py-8 text-center text-slate-400 font-bold uppercase text-xs">Sin registros de egresos</td></tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>

          </div>
          
          <div className="hidden print:flex justify-around mt-20 pt-10">
            <div className="text-center w-64 border-t-2 border-black pt-2">
              <p className="font-black uppercase text-xs">Firma del Cajero</p>
            </div>
            <div className="text-center w-64 border-t-2 border-black pt-2">
              <p className="font-black uppercase text-xs">Firma del Gerente</p>
            </div>
          </div>

        </main>
      )}

    </div>
  );
}