"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  ArrowLeft, Loader2, UserCheck, LogOut, ShieldCheck, ScanFace, Fingerprint
} from 'lucide-react';
import Link from 'next/link';
import * as faceapi from 'face-api.js';

// --- DEFINICIÓN DE TIPOS ---
interface Turno {
  id: string; nombre: string; hora_entrada: string; hora_salida: string; tolerancia_minutos: number;
}
interface Usuario {
  id: string; nombre: string; pin: string; turno_id?: string; turnos?: Turno; rostro_descriptor?: number[]; 
}

export default function ChecadorKiosko() {
  const [isClient, setIsClient] = useState(false);
  const [hora, setHora] = useState(new Date());
  const [pin, setPin] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState<'entrada' | 'salida'>('entrada'); // Por defecto en entrada
  const [modoBiometrico, setModoBiometrico] = useState<'facial' | 'huella'>('facial');
  
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  
  // Estados de IA y Cámara
  const [iaCargada, setIaCargada] = useState(false);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reloj
  useEffect(() => {
    setIsClient(true);
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cargar Modelos de IA
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

  // --- CÁMARA SIEMPRE ACTIVA (Se carga al entrar a la página) ---
  useEffect(() => {
    let streamActivo: MediaStream | null = null;

    const iniciarCamara = async () => {
      if (modoBiometrico === 'facial' && videoRef.current) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ 
            video: { facingMode: 'user', width: { ideal: 640 }, height: { ideal: 480 } } 
          });
          videoRef.current.srcObject = stream;
          streamActivo = stream;
        } catch (error) {
          console.error("Error al acceder a la cámara:", error);
          setMensaje({ texto: 'Asegúrate de dar permisos de cámara al navegador', tipo: 'error' });
        }
      }
    };

    // Pequeño retraso para asegurar que el HTML del <video> ya está renderizado
    setTimeout(iniciarCamara, 300);

    return () => {
      if (streamActivo) streamActivo.getTracks().forEach(track => track.stop());
    };
  }, [modoBiometrico]);

  const capturarFotoBase64 = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      return canvasRef.current.toDataURL('image/jpeg', 0.5);
    }
    return null;
  }, []);

  const procesarRegistro = useCallback(async () => {
    if (pin.length !== 4) return;
    
    setCargando(true);
    setMensaje({ texto: '', tipo: '' });

    try {
      // 1. Buscar Usuario
      const { data, error: userError } = await supabase.from('usuarios').select('*, turnos(*)').eq('pin', pin).single();
      const usuario = data as unknown as Usuario;
      
      if (userError || !usuario) throw new Error("Usuario no encontrado o PIN incorrecto");

      // 2. VALIDACIÓN BIOMÉTRICA
      if (modoBiometrico === 'facial') {
        if (!usuario.rostro_descriptor || usuario.rostro_descriptor.length === 0) {
          throw new Error("No tienes rostro registrado en el sistema.");
        }
        if (!iaCargada) throw new Error("La Inteligencia Artificial aún está cargando...");
        if (!videoRef.current) throw new Error("Cámara no activa.");

        const deteccion = await faceapi.detectSingleFace(videoRef.current).withFaceLandmarks().withFaceDescriptor();

        if (!deteccion) throw new Error("No se detectó ningún rostro. Mira a la cámara.");

        const descriptorRegistrado = new Float32Array(usuario.rostro_descriptor);
        const distancia = faceapi.euclideanDistance(deteccion.descriptor, descriptorRegistrado);
        
        if (distancia > 0.50) throw new Error("ALERTA: El rostro no coincide con el PIN.");
      } else {
        // Aquí iría la lógica del lector USB de Huella si el hardware lo permite
        // Por ahora lo simulamos como "Aprobado" si meten bien el PIN en modo Huella
      }

      const foto = modoBiometrico === 'facial' ? capturarFotoBase64() : null;

      // 3. Validar Puntualidad (Retardos)
      let estatus = 'puntual';
      if (tipoRegistro === 'entrada' && usuario.turnos) {
        const [h, m] = usuario.turnos.hora_entrada.split(':');
        const horaEntradaTurno = new Date();
        horaEntradaTurno.setHours(parseInt(h), parseInt(m), 0);
        
        const limiteTolerancia = new Date(horaEntradaTurno.getTime() + usuario.turnos.tolerancia_minutos * 60000);
        if (new Date() > limiteTolerancia) estatus = 'retardo';
      }

      // 4. Guardar
      const { error: asistError } = await supabase.from('asistencias').insert([{
        usuario_id: usuario.id,
        tipo_registro: tipoRegistro,
        metodo: modoBiometrico === 'facial' ? 'pin' : 'huella',
        foto_url: foto,
        estatus_puntualidad: estatus
      }]);

      if (asistError) throw asistError;

      setMensaje({ 
        texto: `¡HOLA ${usuario.nombre}! ${tipoRegistro.toUpperCase()} EXITOSA (${estatus.toUpperCase()})`, 
        tipo: 'exito' 
      });

    } catch (err: unknown) {
      if (err instanceof Error) setMensaje({ texto: err.message, tipo: 'error' });
      else setMensaje({ texto: 'Error de seguridad', tipo: 'error' });
    } finally {
      setCargando(false);
      setPin("");
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 4000);
    }
  }, [pin, tipoRegistro, modoBiometrico, capturarFotoBase64, iaCargada]);

  // Teclado Físico
  useEffect(() => {
    const manejarTeclado = (e: KeyboardEvent) => {
      if (cargando) return; 

      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) setPin(prev => prev + e.key);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter' && pin.length === 4) {
        procesarRegistro();
      } else if (e.key === 'Escape') {
        setPin("");
      }
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [pin, procesarRegistro, cargando]);

  return (
    <div className="h-screen bg-indigo-950 text-white font-sans flex flex-col overflow-hidden">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* HEADER SUPERIOR */}
      <header className="p-6 flex justify-between items-center z-10 bg-indigo-950 shadow-md">
        <div className="flex items-center gap-4">
          <Link href="/" className="p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
            <ArrowLeft size={24} />
          </Link>
          <div>
            <h1 className="text-2xl font-black italic tracking-tighter">KIOSCO <span className="text-orange-500 font-light">RESTA SOFT</span></h1>
            <p className="text-orange-500 font-bold uppercase tracking-[0.2em] text-[10px]">
              {isClient ? hora.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' }) : 'Cargando fecha...'}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-6">
          <h2 className="text-4xl font-black italic tracking-tighter">
            {isClient ? hora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }) : '--:--:--'}
          </h2>
          
          {/* SELECTOR DE BIOMETRÍA */}
          <div className="bg-black/30 p-1 rounded-2xl flex gap-1 border border-white/10">
            <button onClick={() => setModoBiometrico('facial')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${modoBiometrico === 'facial' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <ScanFace size={16} /> Face ID
            </button>
            <button onClick={() => setModoBiometrico('huella')} className={`px-4 py-3 rounded-xl text-[10px] font-black uppercase transition-all flex items-center gap-2 ${modoBiometrico === 'huella' ? 'bg-orange-600 shadow-md' : 'text-slate-400 hover:text-white'}`}>
              <Fingerprint size={16} /> Lector USB
            </button>
          </div>
        </div>
      </header>

      {/* CONTENIDO PRINCIPAL DIVIDIDO */}
      <main className="grow flex flex-col md:flex-row p-6 gap-6 w-full max-w-7xl mx-auto h-full">
        
        {/* COLUMNA IZQUIERDA: BIOMETRÍA (Cámara o Huella) */}
        <div className="w-full md:w-1/2 bg-black rounded-[48px] overflow-hidden border-4 border-slate-800 shadow-2xl relative flex flex-col items-center justify-center min-h-[50vh]">
          {modoBiometrico === 'facial' ? (
            <>
              <video ref={videoRef} autoPlay muted playsInline className="w-full h-full object-cover absolute inset-0 -scale-x-100" />
              
              {!iaCargada && (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/80 backdrop-blur-sm z-10">
                  <Loader2 size={48} className="text-orange-500 animate-spin mb-4" />
                  <p className="font-black uppercase tracking-widest text-orange-500 text-sm">Cargando Inteligencia Artificial...</p>
                </div>
              )}

              {/* Marco guía (Overlay) */}
              <div className="absolute inset-0 border-12 border-black/20 pointer-events-none rounded-[40px]"></div>
              <div className="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 pointer-events-none">
                <div className="w-64 h-80 border-2 border-white/50 border-dashed rounded-[60px] animate-pulse"></div>
              </div>
              
              <div className="absolute bottom-6 bg-black/60 backdrop-blur-md px-6 py-2 rounded-full border border-white/10">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span> Sistema Facial Activo
                </p>
              </div>
            </>
          ) : (
            <div className="text-center p-8 flex flex-col items-center">
              <Fingerprint size={120} className="text-emerald-500 animate-pulse mb-6 opacity-80" />
              <h3 className="text-2xl font-black uppercase text-white mb-2">Lector Biométrico</h3>
              <p className="text-slate-400 text-sm font-bold uppercase tracking-widest max-w-xs leading-relaxed">
                Coloca tu dedo en el escáner USB para registrar tu asistencia automáticamente.
              </p>
            </div>
          )}
        </div>

        {/* COLUMNA DERECHA: CONTROLES Y PIN */}
        <div className="w-full md:w-1/2 bg-white rounded-[48px] p-8 md:p-10 shadow-2xl text-indigo-950 flex flex-col">
          
          {/* Alertas */}
          <div className="h-16 mb-4">
            {mensaje.texto && (
              <div className={`p-4 rounded-2xl font-black uppercase text-center animate-in zoom-in duration-200 text-xs tracking-widest flex items-center justify-center h-full ${mensaje.tipo === 'exito' ? 'bg-emerald-100 text-emerald-700 border border-emerald-200' : 'bg-red-100 text-red-600 border border-red-200'}`}>
                {mensaje.texto}
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4 mb-8">
            <button onClick={() => setTipoRegistro('entrada')} className={`p-6 rounded-3xl flex flex-col items-center gap-3 transition-all border-4 ${tipoRegistro === 'entrada' ? 'bg-emerald-50 border-emerald-500 text-emerald-600 shadow-inner' : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'}`}>
              <UserCheck size={32} />
              <span className="font-black uppercase tracking-widest text-xs">Entrada</span>
            </button>
            <button onClick={() => setTipoRegistro('salida')} className={`p-6 rounded-3xl flex flex-col items-center gap-3 transition-all border-4 ${tipoRegistro === 'salida' ? 'bg-red-50 border-red-500 text-red-600 shadow-inner' : 'bg-slate-50 border-transparent text-slate-400 hover:border-slate-200'}`}>
              <LogOut size={32} />
              <span className="font-black uppercase tracking-widest text-xs">Salida</span>
            </button>
          </div>

          <div className="text-4xl tracking-[0.5em] mb-6 font-black h-16 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-slate-100 text-indigo-950">
            {pin.padEnd(4, '•')}
          </div>

          <div className="grid grid-cols-3 gap-3 grow max-h-100">
            {[1,2,3,4,5,6,7,8,9].map(n => (
              <button key={n} disabled={cargando} onClick={() => { if(pin.length < 4) setPin(pin + n.toString()) }} className="bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95 disabled:opacity-50">{n}</button>
            ))}
            <button disabled={cargando} onClick={() => { setPin(""); setMensaje({texto:'', tipo:''}); }} className="bg-red-50 text-red-500 rounded-2xl font-black hover:bg-red-100 disabled:opacity-50">C</button>
            <button disabled={cargando} onClick={() => { if(pin.length < 4) setPin(pin + '0') }} className="bg-slate-50 border-2 border-slate-100 rounded-2xl text-2xl font-black hover:bg-orange-50 transition-all disabled:opacity-50">0</button>
            <button disabled={cargando || pin.length !== 4} onClick={procesarRegistro} className="bg-indigo-950 text-white rounded-2xl font-black hover:bg-indigo-800 flex items-center justify-center disabled:opacity-50 disabled:bg-slate-300 transition-all shadow-xl shadow-indigo-900/20 active:scale-95">
              {cargando ? <Loader2 className="animate-spin" /> : <ShieldCheck size={32}/>}
            </button>
          </div>
          
        </div>
      </main>
    </div>
  );
}