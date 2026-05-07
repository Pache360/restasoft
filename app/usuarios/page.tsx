"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  UserPlus, Trash2, ArrowLeft, Key, Loader2, 
  ShieldCheck, Edit2, PlusCircle, Check, Plus,
  Clock, Calculator, ScanFace, Camera, DollarSign, Users, X,
  ClipboardCheck, Calendar, Printer
} from 'lucide-react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';

// --- INTERFACES ---
interface UsuarioLogueado { id: string; nombre: string; rol: string; }
interface Turno { id: string; nombre: string; hora_entrada: string; hora_salida: string; tolerancia_minutos: number; }
interface Usuario { id: string; nombre: string; pin: string; usuario?: string; password?: string; rol: string; turno_id?: string; sueldo_semanal?: number; qr_codigo?: string; rostro_descriptor?: number[]; turnos?: Turno; }
interface ModuloPermisos { comandas: boolean; caja: boolean; cocina: boolean; inventario: boolean; reportes: boolean; admin: boolean; }
interface Asistencia { id: string; usuario_id: string; tipo_registro: string; metodo: string; estatus_puntualidad: string; fecha_hora: string; }

type MatrizPermisos = Record<string, ModuloPermisos>;

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
  const [isClient, setIsClient] = useState(false);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [cargando, setCargando] = useState(true);
  
  const [vista, setVista] = useState<'staff' | 'permisos' | 'turnos' | 'asistencias' | 'nomina'>('staff');
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ id: '', nombre: '', pin: '', usuario: '', password: '', rol: 'mesero', sueldo_semanal: 0, turno_id: '' });

  const [nuevoRolInput, setNuevoRolInput] = useState("");
  const [permisos, setPermisos] = useState<MatrizPermisos>(permisosBase);

  // ASISTENCIAS (Diarias)
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaAsistencias, setFechaAsistencias] = useState<string>(hoy);
  const [listaAsistencias, setListaAsistencias] = useState<Asistencia[]>([]);

  // NÓMINA (Semanal)
  const [inicioSemana, setInicioSemana] = useState<number>(1); // 0=Dom, 1=Lun, 2=Mar...
  const [fechaInicioNomina, setFechaInicioNomina] = useState<Date>(new Date());
  const [fechaFinNomina, setFechaFinNomina] = useState<Date>(new Date());
  const [asistenciasNomina, setAsistenciasNomina] = useState<Asistencia[]>([]);
  const [horasExtraAprobadas, setHorasExtraAprobadas] = useState<Record<string, number>>({});
  
  // Estado para impresión de recibo individual
  const [reciboImpresion, setReciboImpresion] = useState<{
    empleado: string; rol: string; fechaIni: string; fechaFin: string; 
    sueldoDiario: number; diasTrabajados: number; pagoBase: number; 
    horasExtra: number; pagoExtra: number; total: number;
  } | null>(null);

  // EDICIÓN MANUAL DE ASISTENCIA
  const [modalEdicionAsistencia, setModalEdicionAsistencia] = useState(false);
  const [formAsistencia, setFormAsistencia] = useState<{ id: string | null; usuario_id: string; nombre_usuario: string; slot: number; tipo_registro: string; hora: string; } | null>(null);

  // ESTADOS PARA IA
  const [iaCargada, setIaCargada] = useState(false);
  const [modalRostro, setModalRostro] = useState(false);
  const [usuarioEnRostro, setUsuarioEnRostro] = useState<Usuario | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [modalTurno, setModalTurno] = useState(false);
  const [formTurno, setFormTurno] = useState<Partial<Turno>>({ nombre: '', hora_entrada: '08:00', hora_salida: '16:00', tolerancia_minutos: 15 });
  const [editandoTurnoId, setEditandoTurnoId] = useState<string | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  // Cargar IA
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

  // Control Cámara Móvil
  useEffect(() => {
    let streamActivo: MediaStream | null = null;
    if (modalRostro) {
      setTimeout(async () => {
        const nodoVideo = videoRef.current;
        if (nodoVideo) {
          try {
            const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } });
            nodoVideo.srcObject = stream;
            streamActivo = stream;
          } catch { alert("No se pudo acceder a la cámara."); }
        }
      }, 200);
    }
    return () => { if (streamActivo) streamActivo.getTracks().forEach(track => track.stop()); };
  }, [modalRostro]);

  // Inicializar Datos Base (INCLUYE INICIO DE SEMANA FIJO)
  useEffect(() => {
    const inicializarDatos = async () => {
      const userGuardado = localStorage.getItem('usuarioRestaSoft');
      let userParaSetear = null;
      if (userGuardado) {
        const parsed = JSON.parse(userGuardado);
        if (parsed.rol === 'admin') userParaSetear = parsed;
      }
      const permisosGuardados = localStorage.getItem('roles_permisos_restasoft');
      setPermisos(permisosGuardados ? JSON.parse(permisosGuardados) : permisosBase);
      
      const inicioSemanaGuardado = localStorage.getItem('inicioSemana_restasoft');
      if (inicioSemanaGuardado !== null) {
        setInicioSemana(Number(inicioSemanaGuardado));
      }

      setUsuarioActivo(userParaSetear);
      setCargando(false);
    };
    inicializarDatos();
  }, []);

  // Lógica de Cálculo de Rango de Fechas para Nómina
  useEffect(() => {
    const hoyDate = new Date();
    const d = new Date(hoyDate);
    // Retrocede hasta encontrar el día de la semana que coincide con "inicioSemana"
    while (d.getDay() !== inicioSemana) {
      d.setDate(d.getDate() - 1);
    }
    d.setHours(0,0,0,0);
    const fInicio = new Date(d);
    
    const fFin = new Date(d);
    fFin.setDate(fFin.getDate() + 6); // La semana tiene 7 días (inicio + 6)
    fFin.setHours(23,59,59,999);
    
    setFechaInicioNomina(fInicio);
    setFechaFinNomina(fFin);
  }, [inicioSemana]);

  const handleLogin = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!username || !password) return;
    setCargando(true);

    const { data } = await supabase.from('usuarios').select('*').eq('usuario', username).eq('password', password).single();
    
    if (data && data.rol === 'admin') {
      setUsuarioActivo(data);
      localStorage.setItem('usuarioRestaSoft', JSON.stringify(data));
      setUsername(""); setPassword("");
    } else if (data) {
      setErrorLogin("Acceso denegado: Solo Administradores"); setPassword("");
    } else {
      setErrorLogin("Credenciales incorrectas"); setPassword("");
    }
    setTimeout(() => setErrorLogin(""), 3000);
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

  const fetchAsistenciasDiarias = useCallback(async () => {
    if (!fechaAsistencias) return;
    const inicio = new Date(`${fechaAsistencias}T00:00:00`).toISOString();
    const fin = new Date(`${fechaAsistencias}T23:59:59`).toISOString();
    const { data } = await supabase.from('asistencias').select('*').gte('fecha_hora', inicio).lte('fecha_hora', fin).order('fecha_hora', { ascending: true });
    setListaAsistencias(data as Asistencia[] || []);
  }, [fechaAsistencias]);

  const fetchAsistenciasNomina = useCallback(async () => {
    if (vista !== 'nomina') return;
    const { data } = await supabase.from('asistencias').select('*').gte('fecha_hora', fechaInicioNomina.toISOString()).lte('fecha_hora', fechaFinNomina.toISOString());
    setAsistenciasNomina(data as Asistencia[] || []);
  }, [fechaInicioNomina, fechaFinNomina, vista]);

  useEffect(() => {
    let montado = true;
    const cargarCentrales = async () => {
      if (usuarioActivo && montado) {
        await fetchUsuarios();
        await fetchTurnos();
        if (vista === 'asistencias') await fetchAsistenciasDiarias();
        if (vista === 'nomina') await fetchAsistenciasNomina();
      }
    };
    cargarCentrales();
    return () => { montado = false; };
  }, [fetchUsuarios, fetchTurnos, fetchAsistenciasDiarias, fetchAsistenciasNomina, usuarioActivo, vista]);

  const cambiarInicioSemana = (dia: number) => {
    setInicioSemana(dia);
    localStorage.setItem('inicioSemana_restasoft', dia.toString());
  };

  const agregarNuevoRol = () => {
    const rolFormateado = nuevoRolInput.trim().toLowerCase();
    if (!rolFormateado) return;
    if (permisos[rolFormateado]) { alert("Esta categoría ya existe"); return; }
    const nuevosPermisos: MatrizPermisos = { ...permisos, [rolFormateado]: { comandas: false, caja: false, cocina: false, inventario: false, reportes: false, admin: false } };
    setPermisos(nuevosPermisos);
    localStorage.setItem('roles_permisos_restasoft', JSON.stringify(nuevosPermisos));
    setNuevoRolInput("");
  };

  const eliminarRol = (rolName: string) => {
    if (rolName === 'admin') return alert("No puedes eliminar el rol de Administrador");
    if (usuarios.some(u => u.rol === rolName)) return alert("Hay usuarios usando este rol. Cámbialos primero.");
    if (confirm(`¿Seguro que quieres eliminar "${rolName}"?`)) {
      const copia = { ...permisos }; delete copia[rolName];
      setPermisos(copia); localStorage.setItem('roles_permisos_restasoft', JSON.stringify(copia));
    }
  };

  const togglePermiso = (rol: string, modulo: keyof ModuloPermisos) => {
    const nuevosPermisos = { ...permisos, [rol]: { ...permisos[rol], [modulo]: !permisos[rol][modulo] } };
    setPermisos(nuevosPermisos); localStorage.setItem('roles_permisos_restasoft', JSON.stringify(nuevosPermisos));
  };

  const abrirRegistroRostro = (usuario: Usuario) => { setUsuarioEnRostro(usuario); setModalRostro(true); };
  const cerrarRegistroRostro = () => { setModalRostro(false); setUsuarioEnRostro(null); };

  const capturarYGuardarRostro = async () => {
    if (!videoRef.current || !usuarioEnRostro) return;
    setEscaneando(true);
    try {
      const deteccion = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();
      if (!deteccion) throw new Error("No detectó rostro. Mira a la cámara con buena luz.");
      const { error } = await supabase.from('usuarios').update({ rostro_descriptor: Array.from(deteccion.descriptor) }).eq('id', usuarioEnRostro.id);
      if (error) throw error;
      alert("¡Rostro registrado!"); cerrarRegistroRostro(); await fetchUsuarios();
    } catch (err: unknown) { alert(err instanceof Error ? err.message : "Error desconocido"); } 
    finally { setEscaneando(false); }
  };

  const guardarUsuario = async () => {
    if (!form.nombre || !form.usuario || !form.password || form.pin.length !== 4) return alert("Llena campos obligatorios");
    const payload = { nombre: form.nombre, pin: form.pin, usuario: form.usuario, password: form.password, rol: form.rol, sueldo_semanal: form.sueldo_semanal || 0, turno_id: form.turno_id || null };
    if (form.id) {
      const { error } = await supabase.from('usuarios').update(payload).eq('id', form.id);
      if (!error) { cerrarModal(); await fetchUsuarios(); } else alert("Error al actualizar");
    } else {
      const { error } = await supabase.from('usuarios').insert([{ ...payload, qr_codigo: `QR-${Math.random().toString(36).substr(2, 9).toUpperCase()}` }]);
      if (!error) { cerrarModal(); await fetchUsuarios(); } else alert("Error: Usuario o PIN en uso");
    }
  };

  const eliminarUsuario = async (id: string) => {
    if (confirm("¿Revocar acceso por completo?")) { await supabase.from('usuarios').delete().eq('id', id); await fetchUsuarios(); }
  };

  const abrirEditar = (u: Usuario) => { setForm({ id: u.id, nombre: u.nombre, pin: u.pin, usuario: u.usuario || '', password: u.password || '', rol: u.rol, sueldo_semanal: u.sueldo_semanal || 0, turno_id: u.turno_id || '' }); setModalAbierto(true); };
  const cerrarModal = () => { setModalAbierto(false); setForm({ id: '', nombre: '', pin: '', usuario: '', password: '', rol: Object.keys(permisos)[0], sueldo_semanal: 0, turno_id: '' }); };

  const guardarTurno = async () => {
    if (!formTurno.nombre) return alert("Nombre requerido");
    if (editandoTurnoId) await supabase.from('turnos').update(formTurno).eq('id', editandoTurnoId);
    else await supabase.from('turnos').insert([formTurno]);
    setModalTurno(false); await fetchTurnos();
  };

  const guardarAsistenciaManual = async () => {
    if (!formAsistencia || !formAsistencia.hora) return;
    setCargando(true);
    try {
      const fechaHoraLocal = new Date(`${fechaAsistencias}T${formAsistencia.hora}:00`);
      if (formAsistencia.id) {
        await supabase.from('asistencias').update({ fecha_hora: fechaHoraLocal.toISOString() }).eq('id', formAsistencia.id);
      } else {
        await supabase.from('asistencias').insert([{ usuario_id: formAsistencia.usuario_id, tipo_registro: formAsistencia.tipo_registro, metodo: 'manual', fecha_hora: fechaHoraLocal.toISOString(), estatus_puntualidad: 'manual' }]);
      }
      setModalEdicionAsistencia(false); await fetchAsistenciasDiarias();
    } catch (e) { console.error(e); alert("Error al guardar"); }
    setCargando(false);
  };

  if (!usuarioActivo && !cargando) {
    return (
      <div className="h-screen flex flex-col items-center justify-center bg-indigo-950 text-white font-sans">
        <div className="bg-orange-600 p-4 rounded-3xl mb-8 shadow-xl shadow-orange-600/20"><ShieldCheck size={48}/></div>
        <div className="bg-white p-10 rounded-[48px] text-slate-900 shadow-2xl w-full max-w-sm text-center">
          <h2 className="text-xl font-bold uppercase mb-2 text-indigo-950">Panel de Control</h2>
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Acceso solo a Administradores</p>
          <form onSubmit={handleLogin} className="flex flex-col gap-4">
            <input type="text" placeholder="Usuario" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950 text-center" value={username} onChange={(e) => setUsername(e.target.value)} />
            <input type="password" placeholder="Contraseña" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950 text-center" value={password} onChange={(e) => setPassword(e.target.value)} />
            {errorLogin && <p className="text-red-500 font-bold text-sm animate-bounce">{errorLogin}</p>}
            <button type="submit" disabled={cargando || !username || !password} className="w-full mt-2 bg-indigo-950 text-white p-4 rounded-2xl font-black hover:bg-indigo-800 shadow-lg flex items-center justify-center transition-all active:scale-95 disabled:opacity-50">
              {cargando ? <Loader2 className="animate-spin" /> : "Ingresar"}
            </button>
          </form>
          <Link href="/" className="mt-8 block text-slate-400 text-[10px] font-black uppercase tracking-widest hover:text-indigo-950">Volver a la Caja</Link>
        </div>
      </div>
    );
  }

  if (cargando && !reciboImpresion) return <div className="h-screen bg-indigo-950 flex items-center justify-center text-white"><Loader2 className="animate-spin mr-2"/> <p className="font-black uppercase tracking-widest text-xs">Cargando...</p></div>;

  return (
    <>
      {/* TICKET DE NÓMINA (SOLO VISIBLE AL IMPRIMIR) */}
      {reciboImpresion && (
        <div className="hidden print:block w-full bg-white text-black p-8 font-mono">
          <div className="max-w-md mx-auto border-2 border-black p-8">
            <div className="text-center mb-6">
              <h1 className="text-2xl font-black uppercase tracking-tighter">RESTA SOFT</h1>
              <h2 className="text-lg font-bold uppercase mt-1 border-b-2 border-black pb-2">Recibo de Nómina</h2>
            </div>
            
            <div className="space-y-2 mb-6 text-sm">
              <p><span className="font-bold">Empleado:</span> {reciboImpresion.empleado}</p>
              <p><span className="font-bold">Puesto:</span> {reciboImpresion.rol.toUpperCase()}</p>
              <p><span className="font-bold">Período:</span> {reciboImpresion.fechaIni} al {reciboImpresion.fechaFin}</p>
            </div>

            <table className="w-full text-sm mb-6 text-left">
              <thead>
                <tr className="border-b border-black">
                  <th className="py-2">Concepto</th>
                  <th className="py-2 text-right">Importe</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="py-2">Pago Base ({reciboImpresion.diasTrabajados} días x ${reciboImpresion.sueldoDiario.toFixed(2)})</td>
                  <td className="py-2 text-right">${reciboImpresion.pagoBase.toFixed(2)}</td>
                </tr>
                {reciboImpresion.horasExtra > 0 && (
                  <tr>
                    <td className="py-2">Horas Extra ({reciboImpresion.horasExtra} hrs)</td>
                    <td className="py-2 text-right">${reciboImpresion.pagoExtra.toFixed(2)}</td>
                  </tr>
                )}
              </tbody>
            </table>

            <div className="border-t-2 border-black pt-2 flex justify-between items-center mb-12">
              <span className="font-bold text-lg">TOTAL A PAGAR:</span>
              <span className="font-black text-xl">${reciboImpresion.total.toFixed(2)}</span>
            </div>

            <div className="mt-16 text-center">
              <div className="border-t border-black w-64 mx-auto mb-2"></div>
              <p className="text-xs uppercase">Firma de Conformidad</p>
              <p className="text-[10px] mt-1 text-gray-500">Al firmar este recibo acepto el pago total de mis servicios.</p>
            </div>
          </div>
        </div>
      )}

      {/* APLICACIÓN PRINCIPAL (OCULTA AL IMPRIMIR) */}
      <div className="min-h-screen bg-slate-50 font-sans pb-20 print:hidden">
        <header className="bg-indigo-950 text-white p-8 shadow-xl">
          <div className="max-w-6xl mx-auto flex justify-between items-center overflow-x-auto hide-scrollbar">
            <div className="flex items-center gap-4 shrink-0 mr-8">
              <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
              <h1 className="text-3xl font-black uppercase italic tracking-tighter">RRHH</h1>
            </div>
            <div className="bg-white/10 p-1 rounded-2xl flex gap-1 shrink-0">
              <button onClick={() => setVista('staff')} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'staff' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Users size={14} /> <span className="hidden sm:inline">Staff</span></button>
              <button onClick={() => setVista('permisos')} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'permisos' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><ShieldCheck size={14} /> <span className="hidden sm:inline">Roles</span></button>
              <button onClick={() => setVista('turnos')} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'turnos' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Clock size={14} /> <span className="hidden sm:inline">Turnos</span></button>
              <button onClick={() => setVista('asistencias')} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'asistencias' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><ClipboardCheck size={14} /> <span className="hidden sm:inline">Asistencias</span></button>
              <button onClick={() => setVista('nomina')} className={`px-4 md:px-6 py-2 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-1 ${vista === 'nomina' ? 'bg-orange-600' : 'text-slate-400 hover:text-white'}`}><Calculator size={14} /> <span className="hidden sm:inline">Nómina</span></button>
            </div>
          </div>
        </header>

        <main className="max-w-6xl mx-auto p-4 md:p-8">
          
          {vista === 'staff' && (
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
                        <span className={`px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${u.rol === 'admin' ? 'bg-indigo-950 text-white' : 'bg-slate-100 text-slate-500'}`}>{u.rol}</span>
                      </div>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-1"><Users size={12} className="text-orange-500"/> Usuario: {u.usuario || 'N/A'}</p>
                      <p className="text-slate-400 text-[10px] font-bold uppercase tracking-widest flex items-center gap-2 mb-2"><Key size={12} className="text-orange-500"/> PIN Checador: {u.pin}</p>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-4 flex items-center gap-1"><Clock size={14}/> {u.turnos?.nombre || 'Sin Turno Asignado'}</p>
                      <div className="bg-slate-50 p-3 rounded-2xl flex justify-between items-center mb-6">
                        <span className="text-[10px] font-black text-slate-400 uppercase">Sueldo Semanal Base</span>
                        <span className="text-lg font-black text-emerald-600">${u.sueldo_semanal || 0}</span>
                      </div>
                    </div>
                    
                    <div className="flex gap-2">
                      <button onClick={() => abrirRegistroRostro(u)} className={`flex flex-col items-center justify-center p-2 rounded-xl transition-all border-2 ${u.rostro_descriptor ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-orange-500 hover:text-orange-500'}`} title={u.rostro_descriptor ? "Actualizar Rostro" : "Registrar Rostro"}>
                        <ScanFace size={18} className="mb-1" />
                        <span className="text-[8px] font-black uppercase">{u.rostro_descriptor ? 'Rostro OK' : 'Capturar Cara'}</span>
                      </button>
                      <button onClick={() => abrirEditar(u)} className="grow flex items-center justify-center gap-2 bg-slate-50 text-indigo-950 font-black py-3 rounded-xl text-[10px] uppercase tracking-widest hover:bg-slate-200 transition-all"><Edit2 size={14} /> Editar</button>
                      <button onClick={() => eliminarUsuario(u.id)} className="flex items-center justify-center bg-red-50 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* --- PESTAÑA: ASISTENCIAS --- */}
          {vista === 'asistencias' && (
            <div className="animate-in fade-in bg-white p-4 md:p-8 rounded-4xl md:rounded-[48px] shadow-sm border-2 border-slate-100">
              <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-8 gap-4 border-b border-slate-100 pb-8">
                <div>
                  <h2 className="text-2xl font-black text-indigo-950 uppercase italic">Control de Asistencia</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Clic en la hora para editar manualmente</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-200 w-full md:w-auto">
                  <Calendar size={20} className="text-orange-500 ml-2" />
                  <input type="date" className="bg-transparent font-black text-indigo-950 outline-none px-2 uppercase tracking-widest text-sm cursor-pointer w-full" value={fechaAsistencias} onChange={(e) => setFechaAsistencias(e.target.value)} />
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-200">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50/50">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase tracking-widest rounded-tl-2xl w-1/5">Empleado</th>
                      <th className="p-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center border-l border-slate-100 w-1/5">1. Entrada</th>
                      <th className="p-4 text-[10px] font-black text-orange-500 uppercase tracking-widest text-center border-l border-slate-100 w-1/5">2. Salida a Comer</th>
                      <th className="p-4 text-[10px] font-black text-emerald-600 uppercase tracking-widest text-center border-l border-slate-100 w-1/5">3. Regreso Comida</th>
                      <th className="p-4 text-[10px] font-black text-red-500 uppercase tracking-widest text-center border-l border-slate-100 rounded-tr-2xl w-1/5">4. Salida Turno</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {usuarios.map(u => {
                      const susAsistencias = listaAsistencias.filter(a => a.usuario_id === u.id);
                      const t1 = susAsistencias[0]; const t2 = susAsistencias[1]; const t3 = susAsistencias[2]; const t4 = susAsistencias[3]; 

                      const renderTimeCell = (asist: Asistencia | undefined, slotIndex: number) => {
                        let esRetardo = false;
                        let label = "Retardo";

                        if (asist) {
                          if (slotIndex === 1 && u.turnos) {
                            const [th, tm] = u.turnos.hora_entrada.split(':');
                            const turnoEntrada = new Date(`${fechaAsistencias}T${th}:${tm}:00`);
                            turnoEntrada.setMinutes(turnoEntrada.getMinutes() + u.turnos.tolerancia_minutos);
                            const horaReal = new Date(asist.fecha_hora);
                            if (horaReal > turnoEntrada) esRetardo = true;
                          } else if (slotIndex === 3 && t2) {
                            const horaSalidaComida = new Date(t2.fecha_hora);
                            const limiteRegreso = new Date(horaSalidaComida.getTime() + 60 * 60 * 1000); 
                            const horaReal = new Date(asist.fecha_hora);
                            if (horaReal > limiteRegreso) { esRetardo = true; label = "Retardo Comida"; }
                          }
                        }

                        const timeStr = asist ? new Date(asist.fecha_hora).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : '--:--';
                        const horaForInput = asist ? new Date(asist.fecha_hora).toTimeString().slice(0,5) : '';
                        const isAdminOrGerente = usuarioActivo && ['admin', 'gerente'].includes(usuarioActivo.rol);

                        return (
                          <div onClick={() => {
                              if (!isAdminOrGerente) return;
                              setFormAsistencia({ id: asist ? asist.id : null, usuario_id: u.id, nombre_usuario: u.nombre, slot: slotIndex, tipo_registro: (slotIndex === 1 || slotIndex === 3) ? 'entrada' : 'salida', hora: horaForInput });
                              setModalEdicionAsistencia(true);
                            }}
                            className={`flex flex-col items-center justify-center h-full min-h-15 p-2 rounded-xl transition-all ${isAdminOrGerente ? 'cursor-pointer hover:bg-slate-100 border border-transparent hover:border-slate-200' : ''}`}
                            title={isAdminOrGerente ? "Haz clic para editar manualmente" : ""}
                          >
                            <span className={`text-sm font-black ${esRetardo ? 'text-red-500' : (asist ? 'text-indigo-950' : 'text-slate-300')}`}>{timeStr}</span>
                            {esRetardo && <span className="text-[8px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full uppercase mt-1 text-center leading-tight">{label}</span>}
                            {asist && asist.metodo === 'manual' && <span className="text-[8px] text-slate-400 mt-1 uppercase">Manual</span>}
                          </div>
                        );
                      };

                      return (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="p-4">
                            <p className="font-black text-indigo-950 uppercase text-sm">{u.nombre}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{u.turnos?.nombre || 'Sin Turno'}</p>
                          </td>
                          <td className="p-2 border-l border-slate-100 h-full">{renderTimeCell(t1, 1)}</td>
                          <td className="p-2 border-l border-slate-100 h-full">{renderTimeCell(t2, 2)}</td>
                          <td className="p-2 border-l border-slate-100 h-full">{renderTimeCell(t3, 3)}</td>
                          <td className="p-2 border-l border-slate-100 h-full">{renderTimeCell(t4, 4)}</td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* --- PESTAÑA: NÓMINA --- */}
          {vista === 'nomina' && (
            <div className="animate-in fade-in bg-white p-8 rounded-[48px] shadow-sm border-2 border-slate-100">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 pb-8 border-b border-slate-100 gap-4">
                <div>
                  <h2 className="text-2xl font-black text-indigo-950 uppercase italic">Generador de Nómina</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cálculo proporcional por días laborados</p>
                </div>
                
                <div className="flex flex-col sm:flex-row gap-4 w-full lg:w-auto">
                  <div className="bg-slate-50 border border-slate-200 p-2 rounded-2xl flex items-center gap-3 w-full sm:w-auto">
                    <div className="pl-3 border-r border-slate-200 pr-3">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Día de Inicio</span>
                      {isClient ? (
                        <select 
                          className="bg-transparent font-black text-indigo-950 outline-none text-xs uppercase"
                          value={inicioSemana}
                          onChange={(e) => cambiarInicioSemana(Number(e.target.value))}
                        >
                          <option value={0}>Domingo</option>
                          <option value={1}>Lunes</option>
                          <option value={2}>Martes</option>
                          <option value={3}>Miércoles</option>
                          <option value={4}>Jueves</option>
                          <option value={5}>Viernes</option>
                          <option value={6}>Sábado</option>
                        </select>
                      ) : <span className="text-xs font-black text-indigo-950">...</span>}
                    </div>
                    <div className="pr-4">
                      <span className="text-[9px] font-black uppercase text-slate-400 block mb-0.5">Período de Nómina</span>
                      <span className="text-xs font-bold text-indigo-950 uppercase">
                        {isClient ? `${fechaInicioNomina.toLocaleDateString()} al ${fechaFinNomina.toLocaleDateString()}` : 'Calculando...'}
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b-2 border-slate-100">
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest">Empleado</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Asistencia</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Pago Proporcional</th>
                      <th className="pb-4 text-[10px] font-black text-orange-500 uppercase tracking-widest text-center">Horas Extra</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-right">Total a Pagar</th>
                      <th className="pb-4 text-[10px] font-black text-slate-400 uppercase tracking-widest text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50">
                    {usuarios.map(u => {
                      const susAsistenciasSemana = asistenciasNomina.filter(a => a.usuario_id === u.id);
                      const diasUnicosTrabajados = new Set(susAsistenciasSemana.map(a => new Date(a.fecha_hora).toLocaleDateString())).size;
                      
                      const sueldoSemanalBase = u.sueldo_semanal || 0;
                      const sueldoDiario = sueldoSemanalBase / 7;
                      const pagoBaseCalculado = diasUnicosTrabajados * sueldoDiario;

                      const hrsExtra = horasExtraAprobadas[u.id] || 0;
                      const tarifaHoraExtra = sueldoSemanalBase / 48; 
                      const pagoExtra = hrsExtra * tarifaHoraExtra;
                      
                      const pagoTotal = pagoBaseCalculado + pagoExtra;

                      const strFechaIni = isClient ? fechaInicioNomina.toLocaleDateString() : '';
                      const strFechaFin = isClient ? fechaFinNomina.toLocaleDateString() : '';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50 transition-colors">
                          <td className="py-6 pr-4">
                            <p className="font-black text-indigo-950 uppercase text-sm">{u.nombre}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{u.rol}</p>
                          </td>
                          <td className="py-6 text-center px-2">
                            <span className={`px-3 py-1.5 rounded-xl font-black text-xs ${diasUnicosTrabajados === 0 ? 'bg-red-50 text-red-500' : diasUnicosTrabajados === 7 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                              {diasUnicosTrabajados} Días
                            </span>
                            <span className="block text-[8px] font-bold uppercase text-slate-400 mt-2">de 7 laborables</span>
                          </td>
                          <td className="py-6 text-right px-4">
                            <p className="font-black text-slate-600">${pagoBaseCalculado.toFixed(2)}</p>
                            <p className="text-[9px] font-bold uppercase text-slate-400 mt-1">(${(sueldoSemanalBase).toFixed(2)} Base)</p>
                          </td>
                          <td className="py-6 px-4">
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number" min="0" step="0.5" 
                                className="w-16 bg-slate-100 border-2 border-transparent focus:border-orange-500 rounded-xl p-2 font-black text-center text-indigo-950 outline-none" 
                                value={hrsExtra === 0 ? '' : hrsExtra} 
                                placeholder="0" 
                                onChange={(e) => setHorasExtraAprobadas({...horasExtraAprobadas, [u.id]: Number(e.target.value)})} 
                              />
                              <span className="text-[10px] font-bold text-slate-400 uppercase">Hrs</span>
                            </div>
                            {pagoExtra > 0 && <p className="text-[9px] text-center font-bold uppercase text-emerald-500 mt-2">+ ${pagoExtra.toFixed(2)}</p>}
                          </td>
                          <td className="py-6 text-right px-4 border-l border-slate-100">
                            <span className={`text-xl font-black ${pagoTotal > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>
                              ${pagoTotal.toFixed(2)}
                            </span>
                          </td>
                          <td className="py-6 text-center pl-4">
                            <button 
                              disabled={pagoTotal === 0}
                              onClick={() => {
                                setReciboImpresion({
                                  empleado: u.nombre, rol: u.rol, fechaIni: strFechaIni, fechaFin: strFechaFin,
                                  sueldoDiario: sueldoDiario, diasTrabajados: diasUnicosTrabajados, pagoBase: pagoBaseCalculado,
                                  horasExtra: hrsExtra, pagoExtra: pagoExtra, total: pagoTotal
                                });
                                // Retraso obligatorio para que React dibuje el recibo invisible en el DOM antes de imprimir
                                setTimeout(() => {
                                  window.print();
                                }, 500); 
                              }}
                              className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-3 rounded-xl transition-colors inline-flex disabled:opacity-50 disabled:hover:bg-indigo-50 disabled:hover:text-indigo-600"
                              title="Imprimir Recibo de Empleado"
                            >
                              <Printer size={18} />
                            </button>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* LAS OTRAS PESTAÑAS (PERMISOS, TURNOS) SE MANTIENEN IGUAL */}
          {vista === 'permisos' && (
            <div className="bg-white p-8 rounded-4xl border-2 border-slate-100 shadow-sm overflow-x-auto animate-in fade-in">
              <div className="flex justify-between items-center mb-6">
                <div>
                  <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-1 flex items-center gap-3"><ShieldCheck className="text-orange-500"/> Matriz de Accesos</h2>
                  <p className="text-slate-400 text-xs font-bold uppercase tracking-widest">Define a qué pantallas puede entrar cada perfil</p>
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-2 rounded-2xl border border-slate-100">
                  <input type="text" placeholder="Ej: Bartender..." className="bg-transparent font-bold text-sm outline-none px-3 text-indigo-950 uppercase w-32" value={nuevoRolInput} onChange={(e) => setNuevoRolInput(e.target.value)} onKeyDown={(e) => { if(e.key === 'Enter') agregarNuevoRol() }} />
                  <button onClick={agregarNuevoRol} className="bg-indigo-950 text-white p-2 rounded-xl hover:bg-indigo-800 transition-all shadow-md"><PlusCircle size={18} /></button>
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
                            <input type="checkbox" className="sr-only peer" checked={permisos[rol][mod]} onChange={() => togglePermiso(rol, mod)} disabled={rol === 'admin'} />
                            <div className="w-11 h-6 bg-slate-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-0.5 after:left-0.5 after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-emerald-500 peer-disabled:opacity-50"></div>
                          </label>
                        </td>
                      ))}
                      <td className="py-4 text-center">
                        {rol !== 'admin' && <button onClick={() => eliminarRol(rol)} className="bg-red-50 text-red-500 hover:bg-red-500 hover:text-white transition-colors p-2 rounded-xl mx-auto flex" title="Eliminar Categoría"><Trash2 size={16} /></button>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          {vista === 'turnos' && (
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
          )}
        </main>

        {/* --- MODALES GENERALES --- */}

        {/* MODAL EDICIÓN MANUAL DE ASISTENCIA */}
        {modalEdicionAsistencia && formAsistencia && (
          <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-70 p-4 print:hidden">
            <div className="bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl text-center">
              <h2 className="text-xl font-black text-indigo-950 uppercase italic mb-2">Modificar Registro</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 leading-relaxed">
                {formAsistencia.nombre_usuario} <br/> 
                <span className="text-orange-500">
                  {formAsistencia.slot === 1 ? '1. Entrada' : formAsistencia.slot === 2 ? '2. Salida a Comer' : formAsistencia.slot === 3 ? '3. Regreso Comida' : '4. Salida Turno'}
                </span>
              </p>
              <div className="mb-6 relative">
                <Clock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                <input type="time" className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 pl-12 font-black text-indigo-950 outline-none focus:border-emerald-500 text-2xl text-center transition-all" value={formAsistencia.hora} onChange={(e) => setFormAsistencia({...formAsistencia, hora: e.target.value})} />
              </div>
              <div className="flex gap-3">
                <button onClick={() => setModalEdicionAsistencia(false)} className="grow bg-slate-100 text-slate-400 hover:bg-slate-200 font-bold py-4 rounded-2xl uppercase text-[10px] transition-colors">Cancelar</button>
                <button onClick={guardarAsistenciaManual} disabled={cargando} className="grow bg-emerald-500 hover:bg-emerald-400 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-lg flex justify-center items-center gap-2 transition-colors disabled:opacity-50">
                  {cargando ? <Loader2 size={16} className="animate-spin"/> : <Check size={16}/>} Guardar
                </button>
              </div>
            </div>
          </div>
        )}

        {/* MODAL CREAR/EDITAR PERFIL */}
        {modalAbierto && (
          <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl">
              <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-8 text-center">{form.id ? 'Editar Perfil' : 'Nuevo Acceso'}</h2>
              <div className="space-y-4">
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Nombre del Empleado</label>
                  <input placeholder="Ej. Juan Pérez" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Usuario</label>
                    <input type="text" placeholder="Ej. jperez" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={form.usuario} onChange={e => setForm({...form, usuario: e.target.value})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Contraseña</label>
                    <input type="password" placeholder="***" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={form.password} onChange={e => setForm({...form, password: e.target.value})} />
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">PIN Checador</label>
                    <input type="text" maxLength={4} placeholder="1234" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-black outline-none focus:border-orange-500 text-indigo-950 tracking-[0.5em] text-center" value={form.pin} onChange={e => setForm({...form, pin: e.target.value.replace(/\D/g, '')})} />
                  </div>
                  <div>
                    <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Categoría / Rol</label>
                    <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950 uppercase" value={form.rol} onChange={e => setForm({...form, rol: e.target.value})}>
                      {Object.keys(permisos).map(rolName => <option key={rolName} value={rolName}>{rolName}</option>)}
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

        {/* MODAL TURNOS */}
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

        {/* MODAL IA ROSTROS */}
        {modalRostro && usuarioEnRostro && (
          <div className="fixed inset-0 bg-indigo-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
            <div className="bg-white w-full max-w-lg rounded-[48px] p-10 shadow-2xl text-center relative overflow-hidden">
              <button onClick={cerrarRegistroRostro} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 bg-slate-100 p-2 rounded-full"><X size={20}/></button>
              <h2 className="text-3xl font-black text-indigo-950 uppercase italic mb-2">Biometría</h2>
              <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Registrando rostro de: <span className="text-orange-500">{usuarioEnRostro.nombre}</span></p>
              <div className="relative w-64 h-64 mx-auto bg-black rounded-full overflow-hidden border-8 border-slate-100 mb-8 shadow-inner">
                <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover transform scale-x-[-1]" />
                {escaneando && (
                  <div className="absolute inset-0 bg-emerald-500/20 flex items-center justify-center backdrop-blur-sm">
                    <ScanFace size={64} className="text-emerald-400 animate-pulse" />
                  </div>
                )}
              </div>
              <p className="text-xs font-bold text-slate-500 mb-8 px-8">Pídele al empleado que mire fijamente a la cámara con buena iluminación y sin accesorios.</p>
              <button disabled={escaneando || !iaCargada} onClick={capturarYGuardarRostro} className="w-full bg-emerald-500 text-white font-black py-5 rounded-2xl flex items-center justify-center gap-2 hover:bg-emerald-400 shadow-xl shadow-emerald-500/30 uppercase tracking-widest text-sm transition-all disabled:opacity-50">
                {escaneando ? <><Loader2 className="animate-spin"/> Analizando Mapas Faciales...</> : <><Camera /> Capturar y Guardar Rostro</>}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}