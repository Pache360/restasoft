"use client";

import React, { useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BarChart3, DollarSign, CreditCard, ShoppingBag, 
  ArrowLeft, Calendar, Loader2, TrendingUp, ArrowDownCircle, Wallet,
  Printer // Agregado para el botón de imprimir
} from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image'; // Para el logo optimizado

// INTERFACES (Intactas)
interface VentaPedido {
  id: string;
  fecha: string;
  total: number;
  tipo_servicio: string;
  metodo_pago: string;
}

interface Egreso {
  id: string;
  monto: number;
  concepto: string;
  fecha: string;
}

export default function CorteDeCaja() {
  const [ventas, setVentas] = useState<VentaPedido[]>([]);
  const [egresos, setEgresos] = useState<Egreso[]>([]); 
  const [cargando, setCargando] = useState(true);

  useEffect(() => {
    async function fetchDatosHoy() {
      const hoy = new Date();
      hoy.setHours(0, 0, 0, 0);
      const isoHoy = hoy.toISOString();

      const { data: vData } = await supabase
        .from('pedidos')
        .select('*')
        .gte('fecha', isoHoy)
        .order('fecha', { ascending: false });

      const { data: eData } = await supabase
        .from('egresos')
        .select('*')
        .gte('fecha', isoHoy)
        .order('fecha', { ascending: false });

      setVentas((vData as VentaPedido[]) || []);
      setEgresos((eData as Egreso[]) || []);
      setCargando(false);
    }
    fetchDatosHoy();
  }, []);

  // CÁLCULOS FINANCIEROS (Intactos)
  const totalVentas = ventas.reduce((acc, v) => acc + Number(v.total), 0);
  const totalEgresos = egresos.reduce((acc, e) => acc + Number(e.monto), 0);
  const utilidadNeta = totalVentas - totalEgresos;
  const efectivo = ventas.filter(v => v.metodo_pago === 'efectivo').reduce((acc, v) => acc + Number(v.total), 0);
  const tarjeta = ventas.filter(v => v.metodo_pago === 'tarjeta').reduce((acc, v) => acc + Number(v.total), 0);

  // Función de Impresión
  const ejecutarImpresion = () => {
    window.print();
  };

  if (cargando) return (
    <div className="h-screen bg-indigo-950 flex items-center justify-center text-white">
      <Loader2 className="animate-spin mr-2"/> 
      <p className="font-black uppercase tracking-widest text-xs">Calculando Balance...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans">
      
      {/* --- AREA DE IMPRESIÓN (Solo visible en POS-58) --- */}
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
          <div className="flex justify-between"><span>VENTAS TOTALES:</span><span>${totalVentas.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>EGRESOS (GASTOS):</span><span>-${totalEgresos.toFixed(2)}</span></div>
          <div className="flex justify-between font-black text-[10px] pt-1"><span>UTILIDAD NETA:</span><span>${utilidadNeta.toFixed(2)}</span></div>
        </div>
        <div className="border-b border-dashed border-black my-2"></div>
        <div className="space-y-1">
          <p className="font-bold underline">DESGLOSE VENTAS:</p>
          <div className="flex justify-between"><span>EFECTIVO:</span><span>${efectivo.toFixed(2)}</span></div>
          <div className="flex justify-between"><span>TARJETA:</span><span>${tarjeta.toFixed(2)}</span></div>
        </div>
        <p className="text-center mt-4 text-[7px] uppercase italic">Pache 360 - Xoxocotlán</p>
      </div>

      <header className="bg-indigo-950 text-white p-8 shadow-2xl print:hidden">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all">
              <ArrowLeft size={24} />
            </Link>
            <div>
              {/* Uso de BarChart3 para eliminar el error de linter */}
              <h1 className="text-3xl font-black uppercase italic tracking-tighter flex items-center gap-2">
                <BarChart3 className="text-orange-500" /> Balance de <span className="text-orange-500">Caja</span>
              </h1>
              <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2">
                <Calendar size={12} /> {new Date().toLocaleDateString('es-MX', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-4">
            {/* BOTÓN DE IMPRESIÓN AGREGADO */}
            <button 
              onClick={ejecutarImpresion}
              className="bg-white/10 hover:bg-white/20 p-4 rounded-2xl border border-white/10 transition-all flex items-center gap-2"
            >
              <Printer size={20} />
            </button>

            <div className="bg-emerald-600 px-6 py-3 rounded-2xl shadow-lg shadow-emerald-900/20 text-center border-b-4 border-emerald-800">
              <p className="text-[10px] font-black uppercase opacity-80">Ganancia Real (Utilidad)</p>
              <p className="text-3xl font-black italic">${utilidadNeta.toFixed(2)}</p>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8 -mt-8 print:hidden">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-10">
          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Ventas Totales</p>
            {/* Uso de DollarSign para eliminar el error de linter */}
            <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
              <DollarSign size={16} className="text-emerald-500" /> ${totalVentas.toFixed(2)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200 text-red-600">
            <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Egresos (Compras)</p>
            <p className="text-xl font-black flex items-center gap-2">
              <ArrowDownCircle size={16} /> -${totalEgresos.toFixed(2)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Efectivo en Caja</p>
            <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
              <Wallet size={16} className="text-emerald-500" /> ${efectivo.toFixed(2)}
            </p>
          </div>

          <div className="bg-white p-5 rounded-3xl shadow-sm border border-slate-200">
            <p className="text-slate-400 text-[10px] font-black uppercase mb-1">Ventas Tarjeta</p>
            <p className="text-xl font-black text-indigo-950 flex items-center gap-2">
              <CreditCard size={16} className="text-blue-500" /> ${tarjeta.toFixed(2)}
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
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <tbody className="divide-y divide-slate-100">
                  {ventas.map((v) => (
                    <tr key={v.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-[10px] font-bold text-slate-400">
                        {new Date(v.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
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
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <tbody className="divide-y divide-slate-100">
                  {egresos.map((e) => (
                    <tr key={e.id} className="hover:bg-slate-50/50 transition-colors">
                      <td className="p-4 text-[10px] font-bold text-slate-400">
                        {new Date(e.fecha).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </td>
                      <td className="p-4 text-xs font-bold text-slate-600 uppercase">{e.concepto}</td>
                      <td className="p-4 text-right font-black text-red-600 text-sm">-${Number(e.monto).toFixed(2)}</td>
                    </tr>
                  ))}
                  {egresos.length === 0 && (
                    <tr><td colSpan={3} className="p-10 text-center text-slate-300 font-bold uppercase text-[10px] tracking-widest">Sin gastos hoy</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </main>
    </div>
  );
}