"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Users, Clock, Calculator, Plus, Edit2, Trash2, 
  ArrowLeft, Loader2, Save, ScanFace, X, Camera, DollarSign, Calendar
} from 'lucide-react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';

// --- INTERFACES ---
interface Turno {
  id: string; nombre: string; hora_entrada: string; hora_salida: string; tolerancia_minutos: number;
}
interface Usuario {
  id: string; nombre: string; pin: string; rol: string;
  turno_id?: string; sueldo_semanal: number; qr_codigo?: string;
  rostro_descriptor?: number[]; turnos?: Turno;
}

export default function RecursosHumanosPage() {
  const [tabActiva, setTabActiva] = useState<'empleados' | 'turnos' | 'nomina'>('empleados');
  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);

  // Estados de IA para registro facial
  const [iaCargada, setIaCargada] = useState(false);
  const [modalRostro, setModalRostro] = useState(false);
  const [usuarioEnRostro, setUsuarioEnRostro] = useState<Usuario | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Estados para Formularios
  const [modalUsuario, setModalUsuario] = useState(false);
  const [formUsuario, setFormUsuario] = useState<Partial<Usuario>>({ nombre: '', pin: '', rol: 'mesero', sueldo_semanal: 0, turno_id: '' });
  const [editandoUserId, setEditandoUserId] = useState<string | null>(null);

  const [modalTurno, setModalTurno] = useState(false);
  const [formTurno, setFormTurno] = useState<Partial<Turno>>({ nombre: '', hora_entrada: '08:00', hora_salida: '16:00', tolerancia_minutos: 15 });
  const [editandoTurnoId, setEditandoTurnoId] = useState<string | null>(null);

  // Estados para Nómina
  const [horasExtraAprobadas, setHorasExtraAprobadas] = useState<Record<string, number>>({});

  // Cargar Datos Iniciales y Modelos de IA
  useEffect(() => {
    cargarDatos();
    const cargarModelosIA = async () => {
      try {
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setIaCargada(true);
      } catch (error) { console.error("Error cargando IA Facial", error); }
    };
    cargarModelosIA();
  }, []);

  const cargarDatos = async () => {
    setCargando(true);
    const { data: turnosData } = await supabase.from('turnos').select('*').order('nombre');
    const { data: usuariosData } = await supabase.from('usuarios').select('*, turnos(*)').order('nombre');
    setTurnos(turnosData || []);
    setUsuarios(usuariosData || []);
    setCargando(false);
  };

  // --- LÓGICA DE ROSTROS (IA) ---
  const abrirRegistroRostro = async (usuario: Usuario) => {
    setUsuarioEnRostro(usuario);
    setModalRostro(true);
    if (videoRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch (err) { alert("No se pudo acceder a la cámara"); }
    }
  };

  const cerrarRegistroRostro = () => {
    setModalRostro(false);
    setUsuarioEnRostro(null);
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach(t => t.stop());
    }
  };

  const capturarYGuardarRostro = async () => {
    if (!videoRef.current || !usuarioEnRostro) return;
    setEscaneando(true);
    try {
      const deteccion = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
      if (!deteccion) throw new Error("No detecto ningún rostro. Mira fijamente a la cámara con buena luz.");
      
      const descriptorArray = Array.from(deteccion.descriptor);
      
      const { error } = await supabase.from('usuarios')
        .update({ rostro_descriptor: descriptorArray })
        .eq('id', usuarioEnRostro.id);
        
      if (error) throw error;
      
      alert("¡Rostro registrado exitosamente para " + usuarioEnRostro.nombre + "!");
      cerrarRegistroRostro();
      cargarDatos();
    } catch (err: any) {
      alert(err.message);
    } finally {
      setEscaneando(false);
    }
  };

  // --- LÓGICA DE USUARIOS ---
  const guardarUsuario = async () => {
    if (!formUsuario.nombre || !formUsuario.pin) return alert("Nombre y PIN obligatorios");
    if (formUsuario.pin.length !== 4) return alert("El PIN debe tener 4 números");

    const payload = {
      nombre: formUsuario.nombre,
      pin: formUsuario.pin,
      rol: formUsuario.rol,
      sueldo_semanal: formUsuario.sueldo_semanal || 0,
      turno_id: formUsuario.turno_id || null
    };

    if (editandoUserId) {
      await supabase.from('usuarios').update(payload).eq('id', editandoUserId);
    } else {
      const qrGen = `QR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      await supabase.from('usuarios').insert([{ ...payload, qr_codigo: qrGen }]);
    }
    setModalUsuario(false);
    cargarDatos();
  };

  // --- LÓGICA DE TURNOS ---
  const guardarTurno = async () => {
    if (!formTurno.nombre) return alert("Ponle un nombre al turno");
    if (editandoTurnoId) {
      await supabase.from('turnos').update(formTurno).eq('id', editandoTurnoId);
    } else {
      await supabase.from('turnos').insert([formTurno]);
    }
    setModalTurno(false);
    cargarDatos();
  };

  if (cargando) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/>Cargando Recursos Humanos...</div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Recursos <span className="text-orange-500 text-2xl font-light">Humanos</span></h1>
          </div>
          
          <div className="flex bg-white/10 p-1 rounded-2xl gap-1">
            <button onClick={() => setTabActiva('empleados')} className={`px-5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all ${tabActiva === 'empleados' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}><Users size={16}/> Empleados</button>
            <button onClick={() => setTabActiva('turnos')} className={`px-5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all ${tabActiva === 'turnos' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}><Clock size={16}/> Turnos</button>
            <button onClick={() => setTabActiva('nomina')} className={`px-5 py-2 rounded-xl text-xs font-black uppercase flex items-center gap-2 transition-all ${tabActiva === 'nomina' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}><Calculator size={16}/> Nómina</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        
        {/* --- PESTAÑA EMPLEADOS --- */}
        {tabActiva === 'empleados' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-6">
              <button onClick={() => { setFormUsuario({ nombre: '', pin: '', rol: 'mesero', sueldo_semanal: 0, turno_id: '' }); setEditandoUserId(null); setModalUsuario(true); }} className="bg-indigo-950 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs flex items-center gap-2 hover:bg-indigo-800 shadow-xl"><Plus size={18}/> Nuevo Empleado</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {usuarios.map(u => (
                <div key={u.id} className="bg-white rounded-4xl p-6 shadow-sm border-2 border-slate-100 flex flex-col justify-between hover:border-orange-200 transition-all">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black text-xl text-indigo-950 uppercase">{u.nombre}</h3>
                      <span className="bg-orange-100 text-orange-600 px-3 py-1 rounded-full text-[9px] font-black uppercase tracking-widest">{u.rol}</span>
                    </div>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1"><Clock size={14}/> {u.turnos?.nombre || 'Sin Turno Asignado'}</p>
                    <div className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center mb-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Sueldo Base</span>
                      <span className="text-lg font-black text-emerald-600">${u.sueldo_semanal}/sem</span>
                    </div>
                  </div>

                  <div className="flex gap-2">
                    <button onClick={() => abrirRegistroRostro(u)} className={`grow flex flex-col items-center justify-center p-3 rounded-2xl transition-all border-2 ${u.rostro_descriptor ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-orange-500 hover:text-orange-500'}`} title={u.rostro_descriptor ? "Actualizar Rostro" : "Registrar Rostro"}>
                      <ScanFace size={24} className="mb-1" />
                      <span className="text-[9px] font-black uppercase">{u.rostro_descriptor ? 'Rostro OK' : 'Capturar Cara'}</span>
                    </button>
                    <button onClick={() => { setFormUsuario(u); setEditandoUserId(u.id); setModalUsuario(true); }} className="p-4 bg-indigo-950 text-white rounded-2xl hover:bg-indigo-800 transition-all"><Edit2 size={20}/></button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- PESTAÑA TURNOS --- */}
        {tabActiva === 'turnos' && (
          <div className="animate-in fade-in">
            <div className="flex justify-end mb-6">
              <button onClick={() => { setFormTurno({ nombre: '', hora_entrada: '08:00', hora_salida: '16:00', tolerancia_minutos: 15 }); setEditandoTurnoId(null); setModalTurno(true); }} className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs flex items-center gap-2 hover:bg-orange-500 shadow-xl"><Plus size={18}/> Nuevo Turno</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              {turnos.map(t => (
                <div key={t.id} className="bg-white rounded-4xl p-6 shadow-sm border-2 border-slate-100 flex justify-between items-center">
                  <div>
                    <h3 className="font-black text-xl text-indigo-950 uppercase mb-1">{t.nombre}</h3>
                    <p className="text-sm font-bold text-slate-500 uppercase flex items-center gap-2"><Clock size={16} className="text-orange-500"/> {t.hora_entrada} a {t.hora_salida}</p>
                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mt-2">Tolerancia: {t.tolerancia_minutos} min</p>
                  </div>
                  <button onClick={() => { setFormTurno(t); setEditandoTurnoId(t.id); setModalTurno(true); }} className="p-4 bg-slate-50 text-slate-400 rounded-2xl hover:text-indigo-950 hover:bg-slate-100 transition-all"><Edit2 size={20}/></button>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* --- PESTAÑA NÓMINA --- */}
        {tabActiva === 'nomina' && (
          <div className="animate-in fade-in bg-white p-8 rounded-[48px] shadow-sm border-2 border-slate-100">
            <div className="flex justify-between items-center mb-8 pb-8 border-b border-slate-100">
              <div>
                <h2 className="text-2xl font-black text-indigo-950 uppercase italic">Generador de Nómina</h2>
                <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Aprobación de pagos y horas extra</p>
              </div>
              <button className="bg-emerald-500 text-white px-6 py-3 rounded-2xl font-black uppercase text-xs hover:bg-emerald-400 shadow-xl shadow-emerald-500/20">Imprimir Reporte</button>
            </div>

            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b-2 border-slate-100">
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Sueldo Base</th>
                    <th className="pb-4 text-[10px] font-black text-orange-500 uppercase tracking-widest">Hrs Extra Autorizadas</th>
                    <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Pago Total Estimado</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {usuarios.map(u => {
                    const hrsExtra = horasExtraAprobadas[u.id] || 0;
                    // Asumimos tarifa por hora base (Sueldo Semanal / 48 hrs)
                    const tarifaHora = u.sueldo_semanal / 48; 
                    const pagoExtra = hrsExtra * tarifaHora;
                    const pagoTotal = u.sueldo_semanal + pagoExtra;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-6">
                          <p className="font-black text-indigo-950 uppercase text-sm">{u.nombre}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{u.rol}</p>
                        </td>
                        <td className="py-6 font-black text-slate-600">${u.sueldo_semanal.toFixed(2)}</td>
                        <td className="py-6">
                          <div className="flex items-center gap-2">
                            <input 
                              type="number" min="0" step="0.5" 
                              className="w-20 bg-slate-100 border-2 border-transparent focus:border-orange-500 rounded-xl p-2 font-black text-center text-indigo-950 outline-none"
                              value={hrsExtra === 0 ? '' : hrsExtra}
                              placeholder="0"
                              onChange={(e) => setHorasExtraAprobadas({...horasExtraAprobadas, [u.id]: Number(e.target.value)})}
                            />
                            <span className="text-[10px] font-bold text-slate-400 uppercase">Hrs</span>
                          </div>
                        </td>
                        <td className="py-6 text-right">
                          <span className={`text-xl font-black ${hrsExtra > 0 ? 'text-emerald-600' : 'text-indigo-950'}`}>
                            ${pagoTotal.toFixed(2)}
                          </span>
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      {/* --- MODAL REGISTRO ROSTRO IA --- */}
      {modalRostro && usuarioEnRostro && (
        <div className="fixed inset-0 bg-indigo-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl text-center relative overflow-hidden">
            <button onClick={cerrarRegistroRostro} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 bg-slate-100 p-2 rounded-full"><X size={20}/></button>
            
            <h2 className="text-3xl font-black text-indigo-950 uppercase italic mb-2">Biometría</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Registrando rostro de: <span className="text-orange-500">{usuarioEnRostro.nombre}</span></p>

            <div className="relative w-64 h-64 mx-auto bg-black rounded-full overflow-hidden border-8 border-slate-100 mb-8 shadow-inner">
              <video ref={videoRef} autoPlay muted className="w-full h-full object-cover transform scale-x-[-1]" />
              {escaneando && (
                <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm">
                  <ScanFace size={64} className="text-emerald-400 animate-pulse" />
                </div>
              )}
            </div>

            <p className="text-xs font-bold text-slate-500 mb-8 px-8">Pídele al empleado que mire fijamente a la cámara con buena iluminación y sin accesorios (lentes oscuros, gorras).</p>

            <button disabled={escaneando || !iaCargada} onClick={capturarYGuardarRostro} className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 shadow-xl shadow-emerald-500/30 uppercase tracking-widest text-sm transition-all disabled:opacity-50">
              {escaneando ? <><Loader2 className="animate-spin"/> Analizando Mapas Faciales...</> : <><Camera /> Capturar y Guardar Rostro</>}
            </button>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR/EDITAR EMPLEADO --- */}
      {modalUsuario && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic text-center mb-8">{editandoUserId ? 'Editar Empleado' : 'Nuevo Empleado'}</h2>
            <div className="space-y-4">
              <input placeholder="Nombre Completo..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={formUsuario.nombre} onChange={e => setFormUsuario({...formUsuario, nombre: e.target.value})} />
              
              <div className="grid grid-cols-2 gap-4">
                <input placeholder="PIN (4 núm)" maxLength={4} type="password" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-black tracking-widest text-center outline-none" value={formUsuario.pin} onChange={e => setFormUsuario({...formUsuario, pin: e.target.value.replace(/[^0-9]/g, '')})} />
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none uppercase text-xs" value={formUsuario.rol} onChange={e => setFormUsuario({...formUsuario, rol: e.target.value})}>
                  <option value="mesero">Mesero</option><option value="cajero">Cajero</option><option value="cocina">Cocina</option><option value="subgerente">Subgerente</option><option value="gerente">Gerente</option><option value="admin">Admin</option>
                </select>
              </div>

              <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none uppercase text-xs" value={formUsuario.turno_id || ''} onChange={e => setFormUsuario({...formUsuario, turno_id: e.target.value})}>
                <option value="">Sin Turno (Horario Libre)</option>
                {turnos.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}
              </select>

              <div className="relative">
                <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                <input type="number" placeholder="Sueldo Semanal Base" className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4 pl-12 font-black outline-none text-emerald-950" value={formUsuario.sueldo_semanal === 0 ? '' : formUsuario.sueldo_semanal} onChange={e => setFormUsuario({...formUsuario, sueldo_semanal: Number(e.target.value)})} />
              </div>
            </div>
            
            <div className="flex gap-4 mt-8">
              <button onClick={() => setModalUsuario(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={guardarUsuario} className="grow bg-indigo-950 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {/* --- MODAL CREAR/EDITAR TURNO --- */}
      {modalTurno && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic text-center mb-8">{editandoTurnoId ? 'Editar Turno' : 'Nuevo Turno'}</h2>
            <div className="space-y-4">
              <input placeholder="Nombre (Ej. Matutino)" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={formTurno.nombre} onChange={e => setFormTurno({...formTurno, nombre: e.target.value})} />
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Entrada</label>
                  <input type="time" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={formTurno.hora_entrada} onChange={e => setFormTurno({...formTurno, hora_entrada: e.target.value})} />
                </div>
                <div>
                  <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Salida</label>
                  <input type="time" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={formTurno.hora_salida} onChange={e => setFormTurno({...formTurno, hora_salida: e.target.value})} />
                </div>
              </div>
              <div>
                <label className="text-[9px] font-black uppercase text-slate-400 ml-2">Minutos de Tolerancia (Retardo)</label>
                <input type="number" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={formTurno.tolerancia_minutos} onChange={e => setFormTurno({...formTurno, tolerancia_minutos: Number(e.target.value)})} />
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setModalTurno(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={guardarTurno} className="grow bg-orange-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl">Guardar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}