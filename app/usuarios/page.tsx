"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  UserPlus, Trash2, ArrowLeft, Key, Loader2, 
  ShieldCheck, Edit2, PlusCircle, Check, Plus,
  Clock, Calculator, ScanFace, Camera, DollarSign, Users, X
} from 'lucide-react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';

// --- INTERFACES ESTRICTAS PARA TYPESCRIPT ---
interface UsuarioLogueado {
  id: string;
  nombre: string;
  rol: string;
}

interface Turno {
  id: string; 
  nombre: string; 
  hora_entrada: string; 
  hora_salida: string; 
  tolerancia_minutos: number;
}

interface Usuario {
  id: string;
  nombre: string;
  pin: string;
  rol: string; 
  turno_id?: string; 
  sueldo_semanal?: number; 
  qr_codigo?: string;
  rostro_descriptor?: number[]; 
  turnos?: Turno;
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

// MOVIDO AFUERA PARA EVITAR WARNINGS DE DEPENDENCIAS EN USEEFFECT
const permisosBase: MatrizPermisos = {
  mesero: { comandas: true, caja: false, cocina: false, inventario: false, reportes: false, admin: false },
  cajero: { comandas: true, caja: true, cocina: false, inventario: false, reportes: false, admin: false },
  cocina: { comandas: false, caja: false, cocina: true, inventario: true, reportes: false, admin: false },
  subgerente: { comandas: true, caja: true, cocina: true, inventario: true, reportes: false, admin: false },
  gerente: { comandas: true, caja: true, cocina: true, inventario: true, reportes: true, admin: false },
  admin: { comandas: true, caja: true, cocina: true, inventario: true, reportes: true, admin: true }
};

export default function UsuariosPage() {
  const [usuarioActivo, setUsuarioActivo] = useState<UsuarioLogueado | null>(null);
  const [pinLogin, setPinLogin] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);
  const [vista, setVista] = useState<'staff' | 'permisos' | 'turnos' | 'nomina'>('staff');
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ id: '', nombre: '', pin: '', rol: 'mesero', sueldo_semanal: 0, turno_id: '' });

  const [nuevoRolInput, setNuevoRolInput] = useState("");
  const [permisos, setPermisos] = useState<MatrizPermisos>(permisosBase);

  // ESTADOS NUEVOS PARA HR E IA
  const [iaCargada, setIaCargada] = useState(false);
  const [modalRostro, setModalRostro] = useState(false);
  const [usuarioEnRostro, setUsuarioEnRostro] = useState<Usuario | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [modalTurno, setModalTurno] = useState(false);
  const [formTurno, setFormTurno] = useState<Partial<Turno>>({ nombre: '', hora_entrada: '08:00', hora_salida: '16:00', tolerancia_minutos: 15 });
  const [editandoTurnoId, setEditandoTurnoId] = useState<string | null>(null);

  const [horasExtraAprobadas, setHorasExtraAprobadas] = useState<Record<string, number>>({});

  // Cargar Modelos de Inteligencia Artificial al montar
  useEffect(() => {
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

  // SOLUCIÓN: FUNCIÓN ASÍNCRONA PARA EVITAR CASCADING RENDERS
  useEffect(() => {
    const inicializarDatos = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      let userParaSetear = null;

      if (userGuardado) {
        const parsed = JSON.parse(userGuardado);
        if (parsed.rol === 'admin') {
          userParaSetear = parsed;
        }
      }
      
      const permisosGuardados = localStorage.getItem('roles_permisos_restasoft');
      const permisosParaSetear = permisosGuardados ? JSON.parse(permisosGuardados) : permisosBase;

      // Un solo batch de actualizaciones de estado
      setPermisos(permisosParaSetear);
      setUsuarioActivo(userParaSetear);
      setCargando(false);
    };

    inicializarDatos();
  }, []);

  const handleLogin = async () => {
    if (pinLogin.length !== 4) return;
    setCargando(true);
    const { data } = await supabase.from('usuarios').select('*').eq('pin', pinLogin).single();
    
    if (data && data.rol === 'admin') {
      setUsuarioActivo(data);
      localStorage.setItem('usuarioRestaSoft', JSON.stringify(data));
    } else if (data) {
      setErrorLogin("Acceso denegado: Solo Administradores");
    } else {
      setErrorLogin("PIN Incorrecto");
    }
    
    setTimeout(() => setErrorLogin(""), 3000);
    setPinLogin("");
    setCargando(false);
  };

  const fetchUsuarios = useCallback(async () => {
    const { data } = await supabase.from('usuarios').select('*, turnos(*)').order('rol');
    setUsuarios(data as Usuario[] || []);
  }, []);

  const fetchTurnos = useCallback(async () => {
    const { data } = await supabase.from('turnos').select('*').order('nombre');
    setTurnos(data as Turno[] || []);
  }, []);

  // SOLUCIÓN: FUNCIÓN ASÍNCRONA PARA EVITAR CASCADING RENDERS
  useEffect(() => {
    let montado = true;
    const cargarDatosCentrales = async () => {
      if (usuarioActivo && montado) {
        await fetchUsuarios();
        await fetchTurnos();
      }
    };
    cargarDatosCentrales();
    return () => { montado = false; };
  }, [fetchUsuarios, fetchTurnos, usuarioActivo]);

  // --- LÓGICA DE ROLES MEJORADA ---
  const agregarNuevoRol = () => {
    const rolFormateado = nuevoRolInput.trim().toLowerCase();
    if (!rolFormateado) return;
    if (permisos[rolFormateado]) {
      alert("Esta categoría ya existe");
      return;
    }
    
    const nuevosPermisos: MatrizPermisos = { 
      ...permisos, 
      [rolFormateado]: { comandas: false, caja: false, cocina: false, inventario: false, reportes: false, admin: false } 
    };
    
    setPermisos(nuevosPermisos);
    localStorage.setItem('roles_permisos_restasoft', JSON.stringify(nuevosPermisos));
    setNuevoRolInput("");
  };

  const eliminarRol = (rolName: string) => {
    if (rolName === 'admin') {
      alert("No puedes eliminar el rol de Administrador por seguridad del sistema.");
      return;
    }

    const usuariosConRol = usuarios.filter(u => u.rol === rolName);
    if (usuariosConRol.length > 0) {
      alert(`No puedes eliminar "${rolName}" porque hay ${usuariosConRol.length} usuario(s) usándolo. Cámbiales el rol primero.`);
      return;
    }

    if (confirm(`¿Seguro que quieres eliminar la categoría "${rolName}"?`)) {
      const copia = { ...permisos };
      delete copia[rolName];
      setPermisos(copia);
      localStorage.setItem('roles_permisos_restasoft', JSON.stringify(copia));
    }
  };

  const togglePermiso = (rol: string, modulo: keyof ModuloPermisos) => {
    const nuevosPermisos = { ...permisos, [rol]: { ...permisos[rol], [modulo]: !permisos[rol][modulo] } };
    setPermisos(nuevosPermisos);
    localStorage.setItem('roles_permisos_restasoft', JSON.stringify(nuevosPermisos));
  };

  // --- LÓGICA DE ROSTROS (IA) ---
  const abrirRegistroRostro = async (usuario: Usuario) => {
    setUsuarioEnRostro(usuario);
    setModalRostro(true);
    if (videoRef.current) {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      } catch { alert("No se pudo acceder a la cámara"); }
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
      if (!deteccion) throw new Error("No detectó ningún rostro. Mira fijamente a la cámara con buena luz.");
      
      const descriptorArray = Array.from(deteccion.descriptor);
      
      const { error } = await supabase.from('usuarios')
        .update({ rostro_descriptor: descriptorArray })
        .eq('id', usuarioEnRostro.id);
        
      if (error) throw error;
      
      alert("¡Rostro registrado exitosamente para " + usuarioEnRostro.nombre + "!");
      cerrarRegistroRostro();
      await fetchUsuarios();
    } catch (err: unknown) {
      if (err instanceof Error) {
        alert(err.message);
      } else {
        alert("Ocurrió un error desconocido.");
      }
    } finally {
      setEscaneando(false);
    }
  };

  // --- LÓGICA DE USUARIOS ---
  const guardarUsuario = async () => {
    if (!form.nombre || form.pin.length !== 4) return alert("Nombre y PIN de 4 dígitos requeridos");
    
    const payload = {
      nombre: form.nombre,
      pin: form.pin,
      rol: form.rol,
      sueldo_semanal: form.sueldo_semanal || 0,
      turno_id: form.turno_id || null
    };

    if (form.id) {
      const { error } = await supabase.from('usuarios').update(payload).eq('id', form.id);
      if (!error) { cerrarModal(); await fetchUsuarios(); } else { alert("Error al actualizar"); }
    } else {
      const qrGen = `QR-${Math.random().toString(36).substr(2, 9).toUpperCase()}`;
      const { error } = await supabase.from('usuarios').insert([{ ...payload, qr_codigo: qrGen }]);
      if (!error) { cerrarModal(); await fetchUsuarios(); } else { alert("Error: El PIN ya podría estar en uso"); }
    }
  };

  const eliminarUsuario = async (id: string) => {
    if (confirm("¿Estás seguro de revocar el acceso a este usuario por completo?")) {
      await supabase.from('usuarios').delete().eq('id', id);
      await fetchUsuarios();
    }
  };

  const abrirEditar = (u: Usuario) => {
    setForm({ id: u.id, nombre: u.nombre, pin: u.pin, rol: u.rol, sueldo_semanal: u.sueldo_semanal || 0, turno_id: u.turno_id || '' });
    setModalAbierto(true);
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setForm({ id: '', nombre: '', pin: '', rol: Object.keys(permisos)[0], sueldo_semanal: 0, turno_id: '' });
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
    await fetchTurnos();
  };


  if (!usuarioActivo && !cargando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-indigo-950 text-white font-sans">
        <div className="bg-orange-600 p-4 rounded-3xl mb-8 shadow-xl shadow-orange-600/20"><ShieldCheck size={48}/></div>
        <div className="bg-white p-10 rounded-[48px] text-slate-900 shadow-2xl w-full max-w-sm text-center">
          <h2 className="text-xl font-bold uppercase mb-2 text-indigo-950">Panel de Control</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Acceso solo a Administradores</p>
          
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
            <button onClick={handleLogin} className="bg-indigo-950 text-white p-5 rounded-2xl font-black hover:bg-indigo-800 shadow-lg flex items-center justify-center transition-all active:scale-95"><Check size={32}/></button>
          </div>
          <Link href="/" className="mt-8 block text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-indigo-950">Volver a la Caja</Link>
        </div>
      </div>
    );
  }

  if (cargando) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> <p className="font-black uppercase tracking-widest text-xs">Cargando...</p></div>;

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Administración</h1>
          </div>
          <div className="bg-white/10 p-1 rounded-2xl flex gap-1">
            <button onClick={() => setVista('staff')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${vista === 'staff' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Users size={14} className="inline mr-1" /> Staff</button>
            <button onClick={() => setVista('permisos')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${vista === 'permisos' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><ShieldCheck size={14} className="inline mr-1"/> Roles</button>
            <button onClick={() => setVista('turnos')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${vista === 'turnos' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Clock size={14} className="inline mr-1"/> Turnos</button>
            <button onClick={() => setVista('nomina')} className={`px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${vista === 'nomina' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Calculator size={14} className="inline mr-1"/> Nómina</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        
        {vista === 'staff' ? (
          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
               <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Control de Empleados</p>
               <button onClick={() => setModalAbierto(true)} className="bg-orange-600 text-white px-6 py-3 rounded-2xl font-black flex gap-2 text-xs uppercase shadow-lg hover:bg-orange-500 transition-all"><UserPlus size={18} /> Nuevo Usuario</button>
            </div>
            
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {usuarios.map((u) => (
                <div key={u.id} className="bg-white p-6 rounded-4xl border-2 border-slate-100 shadow-sm hover:border-orange-500 transition-all group flex flex-col justify-between">
                  <div>
                    <div className="flex justify-between items-start mb-2">
                      <h3 className="font-black text-xl text-indigo-950 uppercase mb-1">{u.nombre}</h3>
                      <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${u.rol === 'admin' ? 'bg-indigo-950 text-white' : 'bg-slate-100 text-slate-500'}`}>
                        {u.rol}
                      </span>
                    </div>
                    <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-2">
                      <Key size={12} className="text-orange-500"/> PIN: {u.pin}
                    </p>
                    <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1">
                      <Clock size={14}/> {u.turnos?.nombre || 'Sin Turno Asignado'}
                    </p>
                    <div className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center mb-6">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Sueldo Base</span>
                      <span className="text-lg font-black text-emerald-600">${u.sueldo_semanal || 0}/sem</span>
                    </div>
                  </div>
                  
                  <div className="flex gap-2">
                    <button onClick={() => abrirRegistroRostro(u)} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border-2 ${u.rostro_descriptor ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-orange-500 hover:text-orange-500'}`} title={u.rostro_descriptor ? "Actualizar Rostro" : "Registrar Rostro"}>
                      <ScanFace size={18} className="mb-1" />
                      <span className="text-[8px] font-black uppercase">{u.rostro_descriptor ? 'Rostro OK' : 'Capturar Cara'}</span>
                    </button>
                    <button onClick={() => abrirEditar(u)} className="grow flex items-center justify-center gap-2 bg-slate-50 text-indigo-950 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all">
                      <Edit2 size={14} /> Editar
                    </button>
                    <button onClick={() => eliminarUsuario(u.id)} className="flex items-center justify-center bg-red-50 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-all">
                      <Trash2 size={16} />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        ) : vista === 'permisos' ? (

          <div className="bg-white p-8 rounded-4xl border-2 border-slate-100 shadow-sm overflow-x-auto animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
              <div>
                <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-1 flex items-center gap-3"><ShieldCheck className="text-orange-500"/> Matriz de Accesos</h2>
                <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Define a qué pantallas puede entrar cada perfil</p>
              </div>
              
              <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                <input 
                  type="text" 
                  placeholder="Ej: Bartender..." 
                  className="bg-transparent font-bold text-sm outline-none px-3 text-indigo-950 uppercase w-32"
                  value={nuevoRolInput}
                  onChange={(e) => setNuevoRolInput(e.target.value)}
                  onKeyDown={(e) => { if(e.key === 'Enter') agregarNuevoRol() }}
                />
                <button onClick={agregarNuevoRol} className="bg-indigo-950 text-white p-2 rounded-xl hover:bg-indigo-800 transition-all shadow-md">
                  <PlusCircle size={18} />
                </button>
              </div>
            </div>
            
            <table className="w-full text-left">
              <thead>
                <tr className="text-[10px] uppercase text-slate-400 font-black tracking-widest border-b-2 border-slate-100">
                  <th className="pb-4 pl-2">Categoría (Rol)</th>
                  <th className="pb-4 text-center">Toma de Comandas</th>
                  <th className="pb-4 text-center">Caja POS</th>
                  <th className="pb-4 text-center">Monitor Cocina</th>
                  <th className="pb-4 text-center">Inv. / Recetas</th>
                  <th className="pb-4 text-center">Reportes Financieros</th>
                  <th className="pb-4 text-center">Eliminar</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-50">
                {Object.keys(permisos).map(rol => (
                  <tr key={rol} className="hover:bg-orange-50/50 transition-colors">
                    <td className="py-4 pl-2 font-black text-indigo-950 uppercase text-xs">
                      {rol}
                      {rol === 'admin' && <span className="block text-[8px] text-slate-400 mt-1">Acceso Total Fijo</span>}
                    </td>
                    {(['comandas', 'caja', 'cocina', 'inventario', 'reportes'] as Array<keyof ModuloPermisos>).map(mod => (
                      <td key={mod} className="py-4 text-center">
                        <label className="relative inline-flex items-center cursor-pointer">
                          <input 
                            type="checkbox" 
                            className="sr-only peer"
                            checked={permisos[rol][mod]}
                            onChange={() => togglePermiso(rol, mod)}
                            disabled={rol === 'admin'} 
                          />
                          <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-disabled:opacity-50"></div>
                        </label>
                      </td>
                    ))}
                    <td className="py-4 text-center">
                      {rol !== 'admin' && (
                        <button onClick={() => eliminarRol(rol)} className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors p-2 rounded-xl mx-auto flex" title="Eliminar Categoría">
                          <Trash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : vista === 'turnos' ? (

          <div className="animate-in fade-in">
            <div className="flex justify-between items-center mb-6">
              <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Configuración de Horarios</p>
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

        ) : vista === 'nomina' ? (

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
                    const sueldoSemanal = u.sueldo_semanal || 0;
                    const tarifaHora = sueldoSemanal / 48; 
                    const pagoExtra = hrsExtra * tarifaHora;
                    const pagoTotal = sueldoSemanal + pagoExtra;

                    return (
                      <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                        <td className="py-6">
                          <p className="font-black text-indigo-950 uppercase text-sm">{u.nombre}</p>
                          <p className="text-[10px] font-bold text-slate-400 uppercase">{u.rol}</p>
                        </td>
                        <td className="py-6 font-black text-slate-600">${sueldoSemanal.toFixed(2)}</td>
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

        ) : null}
      </main>

      {/* --- MODAL CREAR/EDITAR EMPLEADO --- */}
      {modalAbierto && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-8 text-center">
              {form.id ? 'Editar Perfil' : 'Nuevo Acceso'}
            </h2>
            <div className="space-y-4">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Nombre del Empleado</label>
                <input placeholder="Ej. Juan Pérez" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">PIN de Acceso</label>
                  <input type="text" maxLength={4} placeholder="Ej. 1234" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-black outline-none focus:border-orange-500 text-indigo-950 tracking-[0.5em] text-center" value={form.pin} onChange={e => setForm({...form, pin: e.target.value.replace(/\D/g, '')})} />
                </div>
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Categoría / Rol</label>
                  <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950 uppercase" value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}>
                    {Object.keys(permisos).map(rolName => (
                      <option key={rolName} value={rolName}>{rolName}</option>
                    ))}
                  </select>
                </div>
              </div>
              
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Turno Asignado</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950 uppercase text-xs" value={form.turno_id || ''} onChange={e => setForm({...form, turno_id: e.target.value})}>
                  <option value="">Sin Turno (Horario Libre)</option>
                  {turnos.map(t => <option key={t.id} value={t.id}>{t.nombre} ({t.hora_entrada} - {t.hora_salida})</option>)}
                </select>
              </div>

              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Sueldo Semanal Base</label>
                <div className="relative">
                  <DollarSign className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" size={20} />
                  <input type="number" placeholder="Ej. 2500" className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4 pl-12 font-black outline-none text-emerald-950" value={form.sueldo_semanal === 0 ? '' : form.sueldo_semanal} onChange={e => setForm({...form, sueldo_semanal: Number(e.target.value)})} />
                </div>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={cerrarModal} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px] hover:bg-slate-200 transition-all">Cancelar</button>
              <button onClick={guardarUsuario} className="grow bg-orange-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl shadow-orange-600/30 hover:bg-orange-500 transition-all">Guardar</button>
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

    </div>
  );
}