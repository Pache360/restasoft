"use client";

import React, { useState, useEffect } from 'react';
import { ArrowLeft, Settings2, Receipt, Image as ImageIcon, CheckCircle2 } from 'lucide-react';
import Link from 'next/link';
import Image from 'next/image'; // <-- 1. Importamos el componente de Next.js

export default function ConfiguracionPage() {
  const [ticketNombre, setTicketNombre] = useState("RESTA SOFT");
  const [ticketDir, setTicketDir] = useState("Sucursal Principal");
  const [ticketTel, setTicketTel] = useState("");
  const [ticketFacturacion, setTicketFacturacion] = useState("");
  const [ticketMsg, setTicketMsg] = useState("¡Gracias por su preferencia!");
  const [logoBase64, setLogoBase64] = useState<string | null>(null);
  const [guardado, setGuardado] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (localStorage.getItem('ticketNombre')) setTicketNombre(localStorage.getItem('ticketNombre')!);
      if (localStorage.getItem('ticketDir')) setTicketDir(localStorage.getItem('ticketDir')!);
      if (localStorage.getItem('ticketTel')) setTicketTel(localStorage.getItem('ticketTel')!);
      if (localStorage.getItem('ticketFacturacion')) setTicketFacturacion(localStorage.getItem('ticketFacturacion')!);
      if (localStorage.getItem('ticketMsg')) setTicketMsg(localStorage.getItem('ticketMsg')!);
      if (localStorage.getItem('ticketLogo')) setLogoBase64(localStorage.getItem('ticketLogo'));
    }, 0);
    return () => clearTimeout(timer);
  }, []);

  const manejarSubidaLogo = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setLogoBase64(reader.result as string);
      };
      reader.readAsDataURL(file);
    }
  };

  const guardarConfiguracion = () => {
    localStorage.setItem('ticketNombre', ticketNombre);
    localStorage.setItem('ticketDir', ticketDir);
    localStorage.setItem('ticketTel', ticketTel);
    localStorage.setItem('ticketFacturacion', ticketFacturacion);
    localStorage.setItem('ticketMsg', ticketMsg);
    if (logoBase64) localStorage.setItem('ticketLogo', logoBase64);
    else localStorage.removeItem('ticketLogo');
    
    setGuardado(true);
    setTimeout(() => setGuardado(false), 3000);
  };

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-4xl mx-auto flex items-center gap-4">
          <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
          <h1 className="text-3xl font-black uppercase italic tracking-tighter">Ajustes del <span className="text-orange-500">Sistema</span></h1>
        </div>
      </header>

      <main className="max-w-4xl mx-auto p-8 grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="bg-white p-8 rounded-4xl border-2 border-slate-100 shadow-sm col-span-full md:col-span-1">
          <div className="flex items-center gap-3 mb-6">
            <div className="bg-orange-100 text-orange-600 p-3 rounded-2xl"><Receipt size={24}/></div>
            <h2 className="text-xl font-black text-indigo-950 uppercase italic">Diseño del Ticket</h2>
          </div>
          
          <div className="space-y-4 mb-8">
            <div className="border-2 border-dashed border-slate-200 rounded-2xl p-4 text-center hover:border-orange-500 transition-all">
              {logoBase64 ? (
                <div className="flex flex-col items-center">
                  {/* <-- 2. Usamos <Image /> con unoptimized para que pase el linter */}
                  <Image src={logoBase64} alt="Logo" width={80} height={80} className="h-20 w-auto mb-2 grayscale object-contain" unoptimized />
                  <button onClick={() => setLogoBase64(null)} className="text-[10px] font-bold text-red-500 uppercase hover:underline">Quitar Logo</button>
                </div>
              ) : (
                <label className="cursor-pointer flex flex-col items-center justify-center py-4">
                  <ImageIcon size={32} className="text-slate-300 mb-2" />
                  <span className="text-xs font-bold text-slate-500 uppercase">Subir Logo (Blanco y Negro)</span>
                  <input type="file" accept="image/*" className="hidden" onChange={manejarSubidaLogo} />
                </label>
              )}
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Nombre del Negocio</label>
              <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-indigo-950 outline-none focus:border-orange-500 transition-all" value={ticketNombre} onChange={(e) => setTicketNombre(e.target.value)} />
            </div>
            
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Dirección / Sucursal</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-indigo-950 outline-none focus:border-orange-500 transition-all" value={ticketDir} onChange={(e) => setTicketDir(e.target.value)} />
              </div>
              <div className="col-span-2">
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Teléfono (Opcional)</label>
                <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-indigo-950 outline-none focus:border-orange-500 transition-all" value={ticketTel} onChange={(e) => setTicketTel(e.target.value)} placeholder="Ej. 951 123 4567" />
              </div>
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Instrucciones de Facturación</label>
              <textarea className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-indigo-950 outline-none focus:border-orange-500 transition-all resize-none h-20" value={ticketFacturacion} onChange={(e) => setTicketFacturacion(e.target.value)} placeholder="Ej. Solicita tu factura al correo..." />
            </div>

            <div>
              <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Mensaje de Despedida</label>
              <input type="text" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold text-indigo-950 outline-none focus:border-orange-500 transition-all" value={ticketMsg} onChange={(e) => setTicketMsg(e.target.value)} />
            </div>
          </div>

          <button onClick={guardarConfiguracion} className={`w-full font-black py-4 rounded-2xl uppercase tracking-widest flex items-center justify-center gap-2 transition-all shadow-xl ${guardado ? 'bg-emerald-500 text-white shadow-emerald-500/30' : 'bg-indigo-950 text-white hover:bg-indigo-800'}`}>
            {guardado ? <><CheckCircle2 size={18} /> Guardado</> : <><Settings2 size={18} /> Aplicar Cambios</>}
          </button>
        </div>
      </main>
    </div>
  );
}