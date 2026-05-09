"use client";

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  UserPlus, Trash2, ArrowLeft, Key, Loader2, 
  ShieldCheck, Edit2, PlusCircle, Check, Plus,
  Clock, Calculator, ScanFace, Camera, DollarSign, Users, X,
  ClipboardCheck, Calendar, FileText, PiggyBank,
  Settings2, Printer
} from 'lucide-react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';

// --- INTERFACES ---
interface UsuarioLogueado { id: string; nombre: string; rol: string; }
interface Turno { id: string; nombre: string; hora_entrada: string; hora_salida: string; tolerancia_minutos: number; }
interface Usuario { id: string; nombre: string; pin: string; usuario?: string; password?: string; rol: string; turno_id?: string; sueldo_semanal?: number; qr_codigo?: string; rostro_descriptor?: number[]; turnos?: Turno; }
interface ModuloPermisos { comandas: boolean; caja: boolean; cocina: boolean; inventario: boolean; reportes: boolean; admin: boolean; }
interface Asistencia { id: string; usuario_id: string; tipo_registro: string; metodo: string; estatus_puntualidad: string; fecha_hora: string; }
interface Prestamo { id: string; usuario_id: string; monto_total: number; cuotas_totales: number; cuotas_pagadas: number; monto_cuota: number; estado: string; }

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
  const [cargando, setCargando] = useState(true);
  const [isClient, setIsClient] = useState(false);
  
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [errorLogin, setErrorLogin] = useState("");

  const [usuarios, setUsuarios] = useState<Usuario[]>([]);
  const [turnos, setTurnos] = useState<Turno[]>([]);
  const [vista, setVista] = useState<'staff' | 'permisos' | 'turnos' | 'asistencias' | 'nomina'>('staff');
  
  const [modalAbierto, setModalAbierto] = useState(false);
  const [form, setForm] = useState({ id: '', nombre: '', pin: '', usuario: '', password: '', rol: 'mesero', sueldo_semanal: 0, turno_id: '' });

  const [nuevoRolInput, setNuevoRolInput] = useState("");
  const [permisos, setPermisos] = useState<MatrizPermisos>(permisosBase);

  // ASISTENCIAS
  const hoy = new Date().toISOString().split('T')[0];
  const [fechaAsistencias, setFechaAsistencias] = useState<string>(hoy);
  const [listaAsistencias, setListaAsistencias] = useState<Asistencia[]>([]);

  // NÓMINA Y PRÉSTAMOS
  const [inicioSemana, setInicioSemana] = useState<number>(1); 
  const [fechaInicioNomina, setFechaInicioNomina] = useState<Date>(new Date());
  const [fechaFinNomina, setFechaFinNomina] = useState<Date>(new Date());
  const [asistenciasNomina, setAsistenciasNomina] = useState<Asistencia[]>([]);
  const [prestamosActivos, setPrestamosActivos] = useState<Prestamo[]>([]);
  const [horasExtraAprobadas, setHorasExtraAprobadas] = useState<Record<string, number>>({});
  
  const [modalPrestamo, setModalPrestamo] = useState(false);
  const [formPrestamo, setFormPrestamo] = useState({ usuario_id: '', monto: 0, cuotas: 1 });

  // ESTADO MAESTRO PARA EL RECIBO DE IMPRESIÓN
  const [reciboImpresion, setReciboImpresion] = useState<{
    empleado: string; rol: string; fechaIni: string; fechaFin: string; 
    sueldoDiario: number; diasTrabajados: number; pagoBase: number; 
    horasExtra: number; pagoExtra: number; 
    descuentoRetrasos: number; descuentoPrestamo: number; total: number;
  } | null>(null);

  const [opcionesRecibo, setOpcionesRecibo] = useState({
    empresa: true,
    empleado: true,
    ingresos: true,
    deducciones: true,
    vacios: true
  });

  const [modalEdicionAsistencia, setModalEdicionAsistencia] = useState(false);
  const [formAsistencia, setFormAsistencia] = useState<{ id: string | null; usuario_id: string; nombre_usuario: string; slot: number; tipo_registro: string; hora: string; } | null>(null);

  const [iaCargada, setIaCargada] = useState(false);
  const [modalRostro, setModalRostro] = useState(false);
  const [usuarioEnRostro, setUsuarioEnRostro] = useState<Usuario | null>(null);
  const [escaneando, setEscaneando] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);

  const [modalTurno, setModalTurno] = useState(false);
  const [formTurno, setFormTurno] = useState<Partial<Turno>>({ nombre: '', hora_entrada: '08:00', hora_salida: '16:00', tolerancia_minutos: 15 });
  const [editandoTurnoId, setEditandoTurnoId] = useState<string | null>(null);

  useEffect(() => { setIsClient(true); }, []);

  const calcularMinutosRetraso = useCallback((user: Usuario, asistencias: Asistencia[]) => {
    let totalMinutos = 0;
    asistencias.forEach(a => {
      if (a.tipo_registro === 'entrada' && user.turnos) {
        const [th, tm] = user.turnos.hora_entrada.split(':');
        const limite = new Date(a.fecha_hora);
        limite.setHours(parseInt(th), parseInt(tm) + user.turnos.tolerancia_minutos, 0);
        const real = new Date(a.fecha_hora);
        if (real > limite) {
          totalMinutos += Math.round((real.getTime() - limite.getTime()) / 60000);
        }
      }
    });
    return totalMinutos;
  }, []);

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

  useEffect(() => {
    const hoyDate = new Date();
    const d = new Date(hoyDate);
    while (d.getDay() !== inicioSemana) {
      d.setDate(d.getDate() - 1);
    }
    d.setHours(0,0,0,0);
    const fInicio = new Date(d);
    
    const fFin = new Date(d);
    fFin.setDate(fFin.getDate() + 6);
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
    const { data: asis } = await supabase.from('asistencias').select('*').gte('fecha_hora', fechaInicioNomina.toISOString()).lte('fecha_hora', fechaFinNomina.toISOString());
    setAsistenciasNomina(asis as Asistencia[] || []);
    
    const { data: pres } = await supabase.from('prestamos').select('*').eq('estado', 'activo');
    setPrestamosActivos(pres as Prestamo[] || []);
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

  const registrarPrestamo = async () => {
    if (!formPrestamo.usuario_id || formPrestamo.monto <= 0) return alert("Datos inválidos");
    const cuota = formPrestamo.monto / formPrestamo.cuotas;
    await supabase.from('prestamos').insert([{
      usuario_id: formPrestamo.usuario_id, monto_total: formPrestamo.monto,
      cuotas_totales: formPrestamo.cuotas, monto_cuota: cuota
    }]);
    setModalPrestamo(false); setFormPrestamo({ usuario_id: '', monto: 0, cuotas: 1 });
    fetchAsistenciasNomina();
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
        <div className="bg-white p-10 rounded-4xl text-slate-900 shadow-2xl w-full max-w-sm text-center">
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
      {/* MAGIA DE IMPRESIÓN NATURA: Fuerza a Chrome a imprimir SOLO el recibo */}
      <style>{`
        @media print {
          body * {
            visibility: hidden;
          }
          #area-recibo-impresion, #area-recibo-impresion * {
            visibility: visible;
          }
          #area-recibo-impresion {
            position: absolute;
            left: 0;
            top: 0;
            width: 100%;
            margin: 0;
            padding: 0;
          }
        }
      `}</style>

      {/* ========================================================================= */}
      {/* VISTA DEL RECIBO */}
      {/* ========================================================================= */}
      {reciboImpresion && (
        <div className="fixed inset-0 z-50 bg-slate-900 overflow-y-auto p-4 md:p-8 flex flex-col items-center">
          
          {/* CONTROLES */}
          <div className="w-full max-w-3xl flex flex-col space-y-4 mb-6 shrink-0 print:hidden">
            <div className="flex justify-between items-center">
              <button onClick={() => setReciboImpresion(null)} className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-xl font-bold flex items-center gap-2 transition-all">
                <ArrowLeft size={16}/> Volver
              </button>
              <div className="flex gap-2">
                <button onClick={() => window.print()} className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-3 rounded-2xl font-black uppercase tracking-widest text-xs flex items-center gap-2 shadow-xl transition-all">
                  <Printer size={18}/> Imprimir
                </button>
              </div>
            </div>

            <div className="bg-white p-4 rounded-2xl shadow-lg flex flex-col sm:flex-row flex-wrap gap-4 text-xs font-bold text-slate-600 justify-center">
              <div className="w-full flex items-center gap-2 text-indigo-950 uppercase tracking-widest border-b border-slate-100 pb-2 sm:hidden">
                <Settings2 size={16} /> Ajustes del Recibo
              </div>
              <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer" checked={opcionesRecibo.empresa} onChange={(e) => setOpcionesRecibo({...opcionesRecibo, empresa: e.target.checked})} />
                Datos Empresa
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer" checked={opcionesRecibo.empleado} onChange={(e) => setOpcionesRecibo({...opcionesRecibo, empleado: e.target.checked})} />
                Datos Empleado
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer" checked={opcionesRecibo.ingresos} onChange={(e) => setOpcionesRecibo({...opcionesRecibo, ingresos: e.target.checked})} />
                Ingresos
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer" checked={opcionesRecibo.deducciones} onChange={(e) => setOpcionesRecibo({...opcionesRecibo, deducciones: e.target.checked})} />
                Deducciones
              </label>
              <label className="flex items-center gap-2 cursor-pointer hover:text-indigo-600 transition-colors">
                <input type="checkbox" className="accent-indigo-600 w-4 h-4 cursor-pointer" checked={opcionesRecibo.vacios} onChange={(e) => setOpcionesRecibo({...opcionesRecibo, vacios: e.target.checked})} />
                Valores $0.00
              </label>
            </div>
          </div>

          {/* EL CONTENEDOR DEL RECIBO (Fondo Blanco Limpio) */}
          <div className="bg-white rounded-lg shadow-2xl overflow-hidden shrink-0 w-full max-w-3xl">
            <div id="area-recibo-impresion" className="bg-white text-black p-8 font-mono text-sm w-full">
              
              <div className="border-2 border-black p-4 mb-2 flex justify-between items-start">
                <div>
                  <h1 className="font-black text-2xl uppercase tracking-tighter flex items-center gap-2">
                    <span className="text-xl print:hidden">📄</span> RESTA SOFT, S.A. DE C.V.
                  </h1>
                  {opcionesRecibo.empresa && (
                    <>
                      <p className="text-xs font-bold mt-1">R.F.C.: RSO-000000-XXX</p>
                      <p className="text-xs font-bold">REGISTRO PATRONAL: 000-00000-00</p>
                    </>
                  )}
                </div>
                <div className="text-right border-l-2 border-black pl-4">
                  <h2 className="font-black text-lg underline">RECIBO DE NÓMINA</h2>
                  <p className="text-xs font-bold mt-1 uppercase">PERÍODO DE PAGO</p>
                  <p className="text-xs">{reciboImpresion.fechaIni} AL {reciboImpresion.fechaFin}</p>
                </div>
              </div>

              <div className="border-2 border-black border-t-0 p-4 mt-0 grid grid-cols-2 md:grid-cols-3 gap-y-3 gap-x-4 text-xs">
                <div className="col-span-2"><span className="font-bold block text-[10px] text-gray-500">TRABAJADOR:</span> <span className="uppercase text-sm font-black">{reciboImpresion.empleado}</span></div>
                <div><span className="font-bold block text-[10px] text-gray-500">PUESTO:</span> <span className="uppercase font-bold">{reciboImpresion.rol}</span></div>
                <div><span className="font-bold block text-[10px] text-gray-500">DÍAS LABORADOS:</span> <span className="font-bold">{reciboImpresion.diasTrabajados} DÍAS</span></div>
                <div><span className="font-bold block text-[10px] text-gray-500">SUELDO DIARIO:</span> <span className="font-bold">${reciboImpresion.sueldoDiario.toFixed(2)}</span></div>
                
                {opcionesRecibo.empleado && (
                  <>
                    <div><span className="font-bold block text-[10px] text-gray-500">N.S.S.:</span> <span className="text-gray-400">________________</span></div>
                    <div><span className="font-bold block text-[10px] text-gray-500">C.U.R.P.:</span> <span className="text-gray-400">________________</span></div>
                    <div className="col-span-2 md:col-span-1"><span className="font-bold block text-[10px] text-gray-500">R.F.C. EMPLEADO:</span> <span className="text-gray-400">________________</span></div>
                  </>
                )}
              </div>

              <div className="flex flex-col sm:flex-row border-2 border-black mt-4 mb-2 text-xs min-h-64">
                
                {/* Columna Percepciones */}
                <div className="w-full sm:w-1/2 border-b-2 sm:border-b-0 sm:border-r-2 border-black flex flex-col">
                  <div className="p-2 font-black text-center border-b-2 border-black tracking-widest bg-slate-200" style={{ backgroundColor: '#e2e8f0' }}>PERCEPCIONES</div>
                  
                  {opcionesRecibo.ingresos ? (
                    <div className="p-4 space-y-3 grow">
                      <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1">
                        <span>Sueldo Base ({reciboImpresion.diasTrabajados} días)</span>
                        <span className="font-bold">${reciboImpresion.pagoBase.toFixed(2)}</span>
                      </div>
                      {reciboImpresion.horasExtra > 0 && (
                        <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1">
                          <span>Horas Extra ({reciboImpresion.horasExtra} hrs)</span>
                          <span className="font-bold">${reciboImpresion.pagoExtra.toFixed(2)}</span>
                        </div>
                      )}
                      {opcionesRecibo.vacios && (
                        <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1 text-slate-400">
                          <span>Propinas / Bonos</span>
                          <span>$0.00</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 grow flex items-center justify-center text-slate-300 text-[10px] uppercase font-bold tracking-widest">
                      Desglose Oculto
                    </div>
                  )}

                  <div className="border-t-2 border-black p-2 flex justify-between font-black mt-auto bg-slate-100" style={{ backgroundColor: '#f1f5f9' }}>
                    <span>SUMA PERCEPCIONES:</span>
                    <span>${(reciboImpresion.pagoBase + reciboImpresion.pagoExtra).toFixed(2)}</span>
                  </div>
                </div>

                {/* Columna Deducciones */}
                <div className="w-full sm:w-1/2 flex flex-col">
                  <div className="p-2 font-black text-center border-b-2 border-black tracking-widest bg-slate-200" style={{ backgroundColor: '#e2e8f0' }}>DEDUCCIONES</div>
                  
                  {opcionesRecibo.deducciones ? (
                    <div className="p-4 space-y-3 grow">
                      {reciboImpresion.descuentoRetrasos > 0 && (
                        <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1 text-red-600">
                          <span>Faltas / Retardos</span>
                          <span>-${reciboImpresion.descuentoRetrasos.toFixed(2)}</span>
                        </div>
                      )}
                      {reciboImpresion.descuentoPrestamo > 0 && (
                        <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1 text-red-600">
                          <span>Abono Préstamo</span>
                          <span>-${reciboImpresion.descuentoPrestamo.toFixed(2)}</span>
                        </div>
                      )}
                      {opcionesRecibo.vacios && (
                        <div className="flex justify-between items-end border-b border-dashed border-slate-300 pb-1 text-slate-400">
                          <span>Retención I.M.S.S. / I.S.R.</span>
                          <span>$0.00</span>
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className="p-4 grow flex items-center justify-center text-slate-300 text-[10px] uppercase font-bold tracking-widest">
                      Desglose Oculto
                    </div>
                  )}

                  <div className="border-t-2 border-black p-2 flex justify-between font-black mt-auto bg-slate-100" style={{ backgroundColor: '#f1f5f9' }}>
                    <span>SUMA DEDUCCIONES:</span>
                    <span>${(reciboImpresion.descuentoRetrasos + reciboImpresion.descuentoPrestamo).toFixed(2)}</span>
                  </div>
                </div>
              </div>

              <div className="border-2 border-black p-4 mt-0 flex justify-between items-center bg-slate-100" style={{ backgroundColor: '#f1f5f9' }}>
                <span className="font-black tracking-widest">NETO A PAGAR:</span>
                <span className="font-black text-2xl">${reciboImpresion.total.toFixed(2)} <span className="text-xs">MXN</span></span>
              </div>

              <div className="p-8 pb-12 text-center text-xs mt-8">
                <p className="mb-16 font-bold leading-relaxed max-w-xl mx-auto text-justify">
                  RECIBÍ DE LA EMPRESA ARRIBA MENCIONADA, LA CANTIDAD NETA DESCRITA EN ESTE RECIBO, ESTANDO CONFORME CON LAS PERCEPCIONES Y DEDUCCIONES RETENIDAS, DECLARANDO QUE NO SE ME ADEUDA CANTIDAD ALGUNA POR NINGÚN CONCEPTO, NO RESERVÁNDOME ACCIÓN NI DERECHO ALGUNO QUE EJERCITAR EN CONTRA DE LA MISMA.
                </p>
                <div className="w-64 border-t-2 border-black mx-auto pt-2 font-black tracking-widest uppercase">
                  FIRMA DEL TRABAJADOR
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* APLICACIÓN PRINCIPAL (PANEL RRHH) */}
      {/* ========================================================================= */}
      <div className={reciboImpresion ? "hidden" : "min-h-screen bg-slate-50 font-sans pb-20 block"}>
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
          
          {vista === 'nomina' && (
            <div className="animate-in fade-in bg-white p-8 rounded-4xl shadow-sm border-2 border-slate-100">
              <div className="flex flex-col lg:flex-row justify-between items-start lg:items-center mb-8 pb-8 border-b border-slate-100 gap-4">
                <div>
                  <h2 className="text-2xl font-black text-indigo-950 uppercase italic">Control de Nómina</h2>
                  <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mt-1">Cálculos automáticos con descuentos y préstamos</p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setModalPrestamo(true)} className="bg-indigo-950 text-white px-6 py-3 rounded-2xl font-black text-xs uppercase flex items-center gap-2 shadow-lg hover:bg-indigo-800 transition-all"><PiggyBank size={18}/> Registrar Adelanto</button>
                  <div className="bg-slate-50 p-2 rounded-2xl border border-slate-200 flex items-center gap-2">
                    <span className="text-[9px] font-black uppercase text-slate-400 ml-2">Inicio Sem.</span>
                    <select className="bg-transparent font-black text-indigo-950 outline-none text-xs uppercase" value={inicioSemana} onChange={(e) => cambiarInicioSemana(Number(e.target.value))}>
                      {["Dom", "Lun", "Mar", "Mie", "Jue", "Vie", "Sab"].map((d, i) => <option key={i} value={i}>{d}</option>)}
                    </select>
                  </div>
                </div>
              </div>

              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse min-w-200">
                  <thead>
                    <tr className="border-b-2 border-slate-100 bg-slate-50/50">
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase">Empleado</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase text-center">Asistencia</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase text-right">Pago Proporcional</th>
                      <th className="p-4 text-[10px] font-black text-orange-500 uppercase text-center">Horas Extra</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase text-right">Total a Pagar</th>
                      <th className="p-4 text-[10px] font-black text-slate-400 uppercase text-center">Acciones</th>
                    </tr>
                  </thead>
                  <tbody>
                    {usuarios.map(u => {
                      const susAsis = asistenciasNomina.filter(a => a.usuario_id === u.id);
                      const diasTrab = new Set(susAsis.map(a => new Date(a.fecha_hora).toLocaleDateString())).size;
                      const minsRetraso = calcularMinutosRetraso(u, susAsis);
                      
                      const base = u.sueldo_semanal || 0;
                      const diario = base / 7;
                      const pagoBase = diasTrab * diario;

                      const hExtra = horasExtraAprobadas[u.id] || 0;
                      const pagoExtra = hExtra * (base / 48);

                      const costoMinuto = (base / 48) / 60;
                      const descRetraso = minsRetraso * costoMinuto;

                      const prestamo = prestamosActivos.find(p => p.usuario_id === u.id);
                      const cuotaPres = prestamo ? prestamo.monto_cuota : 0;

                      const neto = (pagoBase + pagoExtra) - (descRetraso + cuotaPres);

                      const strFechaIni = isClient ? fechaInicioNomina.toLocaleDateString() : '';
                      const strFechaFin = isClient ? fechaFinNomina.toLocaleDateString() : '';

                      return (
                        <tr key={u.id} className="hover:bg-slate-50 border-b border-slate-50 transition-colors">
                          <td className="p-4">
                            <p className="font-black text-indigo-950 text-sm">{u.nombre}</p>
                            <p className="text-[10px] font-bold text-slate-400 uppercase">{u.rol}</p>
                          </td>
                          <td className="p-4 text-center">
                            <span className={`px-3 py-1.5 rounded-xl font-black text-xs ${diasTrab === 0 ? 'bg-red-50 text-red-500' : diasTrab === 7 ? 'bg-emerald-50 text-emerald-600' : 'bg-orange-50 text-orange-600'}`}>
                              {diasTrab} Días
                            </span>
                          </td>
                          <td className="p-4 text-right">
                            <p className="font-black text-slate-600">${pagoBase.toFixed(2)}</p>
                          </td>
                          <td className="p-4">
                            <div className="flex items-center justify-center gap-2">
                              <input 
                                type="number" min="0" step="0.5" 
                                className="w-16 bg-slate-100 border-2 border-transparent focus:border-orange-500 rounded-xl p-2 font-black text-center text-indigo-950 outline-none" 
                                value={hExtra === 0 ? '' : hExtra} 
                                placeholder="0" 
                                onChange={(e) => setHorasExtraAprobadas({...horasExtraAprobadas, [u.id]: Number(e.target.value)})} 
                              />
                            </div>
                          </td>
                          <td className="p-4 text-right">
                            <span className={`text-xl font-black ${neto > 0 ? 'text-emerald-600' : 'text-slate-300'}`}>${neto.toFixed(2)}</span>
                          </td>
                          <td className="p-4 text-center">
                            <button 
                              disabled={neto === 0}
                              onClick={() => {
                                setReciboImpresion({
                                  empleado: u.nombre, rol: u.rol, fechaIni: strFechaIni, fechaFin: strFechaFin,
                                  sueldoDiario: diario, diasTrabajados: diasTrab, pagoBase: pagoBase, horasExtra: hExtra, pagoExtra: pagoExtra,
                                  descuentoRetrasos: descRetraso, descuentoPrestamo: cuotaPres, total: neto
                                });
                              }}
                              className="bg-indigo-50 text-indigo-600 hover:bg-indigo-600 hover:text-white p-3 rounded-xl transition-colors disabled:opacity-50"
                            >
                              <FileText size={18} />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {vista === 'staff' && (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 animate-in fade-in">
              {usuarios.map(u => (
                <div key={u.id} className="bg-white p-6 rounded-4xl border-2 border-slate-100 shadow-sm hover:border-orange-500 transition-all flex flex-col justify-between">
                    <div className="flex justify-between items-start mb-4">
                      <div>
                          <h3 className="font-black text-xl text-indigo-950 uppercase">{u.nombre}</h3>
                          <span className="px-3 py-1 bg-slate-100 text-slate-500 rounded-full text-[10px] font-black uppercase">{u.rol}</span>
                      </div>
                      <button onClick={() => abrirEditar(u)} className="p-2 bg-slate-50 text-slate-400 hover:text-indigo-950 rounded-xl transition-all"><Edit2 size={16}/></button>
                    </div>
                    <div className="space-y-2 mb-6">
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Key size={12}/> PIN: {u.pin}</p>
                      <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-2"><Clock size={12}/> {u.turnos?.nombre || 'Sin Horario'}</p>
                    </div>
                    <div className="bg-slate-50 p-4 rounded-2xl flex justify-between items-center">
                      <span className="text-[10px] font-black text-slate-400 uppercase">Salario Semanal</span>
                      <span className="text-lg font-black text-emerald-600">${u.sueldo_semanal || 0}</span>
                    </div>
                    <div className="mt-4 flex gap-2 border-t border-slate-100 pt-4">
                      <button onClick={() => abrirRegistroRostro(u)} className={`flex flex-col items-center justify-center grow p-2 rounded-xl transition-all border-2 ${u.rostro_descriptor ? 'bg-emerald-50 text-emerald-600 border-emerald-100 hover:bg-emerald-100' : 'bg-slate-50 text-slate-400 border-slate-100 hover:border-orange-500 hover:text-orange-500'}`} title={u.rostro_descriptor ? "Actualizar Rostro" : "Registrar Rostro"}>
                        <ScanFace size={18} className="mb-1" />
                        <span className="text-[8px] font-black uppercase">{u.rostro_descriptor ? 'Rostro OK' : 'Capturar Cara'}</span>
                      </button>
                      <button onClick={() => eliminarUsuario(u.id)} className="flex items-center justify-center bg-red-50 text-red-500 p-3 rounded-xl hover:bg-red-500 hover:text-white transition-all"><Trash2 size={16} /></button>
                    </div>
                </div>
              ))}
              <button onClick={() => setModalAbierto(true)} className="border-4 border-dashed border-slate-200 rounded-4xl p-10 flex flex-col items-center justify-center text-slate-300 hover:text-orange-500 hover:border-orange-500 transition-all group">
                  <UserPlus size={48} className="mb-4 group-hover:scale-110 transition-all"/>
                  <span className="font-black uppercase tracking-widest text-sm">Nuevo Empleado</span>
              </button>
            </div>
          )}

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
      </div>

      {/* --- MODALES --- */}
      {modalPrestamo && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-110 p-4">
          <div className="bg-white w-full max-w-sm rounded-4xl p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-8 text-center">Registrar Adelanto</h2>
            <div className="space-y-4">
              <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold" value={formPrestamo.usuario_id} onChange={e => setFormPrestamo({...formPrestamo, usuario_id: e.target.value})}>
                <option value="">Selecciona Trabajador...</option>
                {usuarios.map(u => <option key={u.id} value={u.id}>{u.nombre}</option>)}
              </select>
              <input type="number" placeholder="Monto Total ($)" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold" value={formPrestamo.monto || ''} onChange={e => setFormPrestamo({...formPrestamo, monto: Number(e.target.value)})} />
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block">Semanas para pagar</label>
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold" value={formPrestamo.cuotas} onChange={e => setFormPrestamo({...formPrestamo, cuotas: Number(e.target.value)})}>
                  <option value={1}>1 exhibición</option>
                  <option value={2}>2 exhibiciones</option>
                  <option value={3}>3 exhibiciones</option>
                  <option value={4}>4 exhibiciones</option>
                </select>
              </div>
            </div>
            <div className="flex gap-4 mt-8">
              <button onClick={() => setModalPrestamo(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={registrarPrestamo} className="grow bg-indigo-950 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl">Guardar</button>
            </div>
          </div>
        </div>
      )}

      {modalEdicionAsistencia && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-70 p-4">
          <div className="bg-white w-full max-w-sm rounded-4xl p-8 shadow-2xl text-center">
            <h2 className="text-xl font-black text-indigo-950 uppercase italic mb-2">Modificar Registro</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-6 leading-relaxed">
              {formAsistencia?.nombre_usuario} <br/> 
              <span className="text-orange-500">
                {formAsistencia?.slot === 1 ? '1. Entrada' : formAsistencia?.slot === 2 ? '2. Salida a Comer' : formAsistencia?.slot === 3 ? '3. Regreso Comida' : '4. Salida Turno'}
              </span>
            </p>
            <div className="mb-6 relative">
              <Clock size={20} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input type="time" className="w-full bg-slate-50 border-2 border-slate-200 rounded-2xl p-4 pl-12 font-black text-indigo-950 outline-none focus:border-emerald-500 text-2xl text-center transition-all" value={formAsistencia?.hora || ''} onChange={(e) => setFormAsistencia(prev => prev ? {...prev, hora: e.target.value} : null)} />
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

      {modalRostro && (
        <div className="fixed inset-0 bg-indigo-950/90 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-lg rounded-4xl p-10 shadow-2xl text-center relative overflow-hidden">
            <button onClick={cerrarRegistroRostro} className="absolute top-6 right-6 text-slate-300 hover:text-red-500 bg-slate-100 p-2 rounded-full"><X size={20}/></button>
            <h2 className="text-3xl font-black text-indigo-950 uppercase italic mb-2">Biometría</h2>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-8">Registrando rostro de: <span className="text-orange-500">{usuarioEnRostro?.nombre}</span></p>
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
    </>
  );
}