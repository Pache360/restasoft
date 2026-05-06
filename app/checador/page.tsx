"use client";

import React, { useState, useEffect, useRef } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Camera, QrCode, Keypad, CheckCircle2, 
  Clock, ArrowLeft, Loader2, UserCheck, LogOut, ShieldCheck 
} from 'lucide-react';
import Link from 'next/link';
import { Html5QrcodeScanner } from 'html5-qrcode';

export default function ChecadorKiosko() {
  const [hora, setHora] = useState(new Date());
  const [pin, setPin] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState<'entrada' | 'salida' | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Soporte para teclado físico
  useEffect(() => {
    const manejarTeclado = (e: KeyboardEvent) => {
      if (e.key >= '0' && e.key <= '9') {
        if (pin.length < 4) setPin(prev => prev + e.key);
      } else if (e.key === 'Backspace') {
        setPin(prev => prev.slice(0, -1));
      } else if (e.key === 'Enter' && pin.length === 4) {
        procesarRegistro('pin');
      } else if (e.key === 'Escape') {
        setPin("");
        setTipoRegistro(null);
      }
    };
    window.addEventListener('keydown', manejarTeclado);
    return () => window.removeEventListener('keydown', manejarTeclado);
  }, [pin, tipoRegistro]);

  // Inicializar Escáner QR
  useEffect(() => {
    if (tipoRegistro) {
      const scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        scanner.clear();
        procesarRegistro('qr', decodedText);
      }, (error) => { /* ignore */ });
      return () => { scanner.clear(); };
    }
  }, [tipoRegistro]);

  // Encender cámara para foto de seguridad
  useEffect(() => {
    async function setupCamera() {
      if (videoRef.current) {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        videoRef.current.srcObject = stream;
      }
    }
    setupCamera();
  }, []);

  const capturarFotoBase64 = () => {
    if (videoRef.current && canvasRef.current) {
      const context = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      context?.drawImage(videoRef.current, 0, 0);
      return canvasRef.current.toDataURL('image/jpeg', 0.5);
    }
    return null;
  };

  const procesarRegistro = async (metodo: 'pin' | 'qr' | 'huella', valorQR?: string) => {
    if (!tipoRegistro) return alert("Selecciona primero ENTRADA o SALIDA");
    
    setCargando(true);
    try {
      // 1. Identificar al usuario
      let query = supabase.from('usuarios').select('*, turnos(*)');
      if (metodo === 'pin') query = query.eq('pin', pin).single();
      if (metodo === 'qr') query = query.eq('qr_codigo', valorQR).single();

      const { data: usuario, error: userError } = await query;

      if (userError || !usuario) throw new Error("Usuario no encontrado");

      // 2. Capturar foto si es por PIN (seguridad extra)
      const foto = metodo === 'pin' ? capturarFotoBase64() : null;

      // 3. Validar puntualidad (si es entrada)
      let estatus = 'puntual';
      if (tipoRegistro === 'entrada' && usuario.turnos) {
        const [h, m] = usuario.turnos.hora_entrada.split(':');
        const horaEntradaTurno = new Date();
        horaEntradaTurno.setHours(parseInt(h), parseInt(m), 0);
        
        const limiteTolerancia = new Date(horaEntradaTurno.getTime() + usuario.turnos.tolerancia_minutos * 60000);
        if (new Date() > limiteTolerancia) estatus = 'retardo';
      }

      // 4. Guardar asistencia
      const { error: asistError } = await supabase.from('asistencias').insert([{
        usuario_id: usuario.id,
        tipo_registro: tipoRegistro,
        metodo: metodo,
        foto_url: foto, // Aquí guardamos el base64 directo para simplificar (o puedes usar Storage)
        estatus_puntualidad: estatus
      }]);

      if (asistError) throw asistError;

      setMensaje({ 
        texto: `¡HOLA ${usuario.nombre}! ${tipoRegistro.toUpperCase()} REGISTRADA (${estatus.toUpperCase()})`, 
        tipo: 'exito' 
      });

      // Resetear
      setPin("");
      setTipoRegistro(null);
      setTimeout(() => setMensaje({ texto: '', tipo: '' }), 5000);

    } catch (err: any) {
      setMensaje({ texto: err.message, tipo: 'error' });
      setPin("");
    } finally {
      setCargando(false);
    }
  };

  return (
    <div className="min-h-screen bg-indigo-950 text-white font-sans flex flex-col items-center justify-center p-6">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Botón Volver */}
      <Link href="/" className="absolute top-8 left-8 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
        <ArrowLeft size={24} />
      </Link>

      <div className="text-center mb-10">
        <h1 className="text-8xl font-black italic tracking-tighter mb-2">
          {hora.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
        </h1>
        <p className="text-orange-500 font-bold uppercase tracking-[0.3em] text-sm">
          {hora.toLocaleDateString([], { weekday: 'long', day: 'numeric', month: 'long' })}
        </p>
      </div>

      {mensaje.texto && (
        <div className={`mb-8 p-6 rounded-3xl font-black uppercase text-center animate-bounce shadow-2xl ${mensaje.tipo === 'exito' ? 'bg-emerald-500' : 'bg-red-500'}`}>
          {mensaje.texto}
        </div>
      )}

      {!tipoRegistro ? (
        <div className="grid grid-cols-2 gap-8 w-full max-w-2xl">
          <button onClick={() => setTipoRegistro('entrada')} className="bg-emerald-500 hover:bg-emerald-400 p-12 rounded-[48px] flex flex-col items-center gap-4 transition-all hover:scale-105 shadow-xl">
            <UserCheck size={64} />
            <span className="text-2xl font-black uppercase">Entrada</span>
          </button>
          <button onClick={() => setTipoRegistro('salida')} className="bg-red-500 hover:bg-red-400 p-12 rounded-[48px] flex flex-col items-center gap-4 transition-all hover:scale-105 shadow-xl">
            <LogOut size={64} />
            <span className="text-2xl font-black uppercase">Salida</span>
          </button>
        </div>
      ) : (
        <div className="flex flex-col md:flex-row gap-8 w-full max-w-5xl items-center animate-in zoom-in duration-300">
          
          {/* Lado Izquierdo: Cámara/QR */}
          <div className="w-full md:w-1/2 bg-black rounded-[48px] overflow-hidden border-4 border-white/10 shadow-2xl relative min-h-[400px]">
             <div id="reader" className="w-full"></div>
             <video ref={videoRef} autoPlay className="w-full h-full object-cover grayscale opacity-50" />
             <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                <div className="border-2 border-orange-500 w-64 h-64 rounded-3xl border-dashed animate-pulse" />
             </div>
             <p className="absolute bottom-4 left-0 right-0 text-center text-[10px] font-black uppercase tracking-widest text-white/50">Cámara de Seguridad Activa</p>
          </div>

          {/* Lado Derecho: Teclado PIN */}
          <div className="w-full md:w-1/2 bg-white p-10 rounded-[48px] text-indigo-950 shadow-2xl">
            <div className="flex justify-between items-center mb-6">
              <h2 className="text-xl font-black uppercase italic">Validación {tipoRegistro}</h2>
              <button onClick={() => setTipoRegistro(null)} className="text-slate-300 hover:text-red-500"><X /></button>
            </div>

            <div className="text-5xl tracking-[0.5em] mb-8 font-black h-16 bg-slate-50 rounded-2xl flex items-center justify-center border-2 border-slate-100">
              {pin.padEnd(4, '•')}
            </div>

            <div className="grid grid-cols-3 gap-3">
              {[1,2,3,4,5,6,7,8,9].map(n => (
                <button key={n} onClick={() => { if(pin.length < 4) setPin(pin + n) }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95">{n}</button>
              ))}
              <button onClick={() => setPin("")} className="bg-red-50 text-red-500 p-5 rounded-2xl font-black hover:bg-red-100">C</button>
              <button onClick={() => { if(pin.length < 4) setPin(pin + '0') }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black hover:bg-orange-50 transition-all">0</button>
              <button onClick={() => procesarRegistro('pin')} className="bg-emerald-500 text-white p-5 rounded-2xl font-black hover:bg-emerald-400 flex items-center justify-center">
                {cargando ? <Loader2 className="animate-spin" /> : <ShieldCheck size={32}/>}
              </button>
            </div>
          </div>

        </div>
      )}

      <footer className="mt-12 flex gap-8 opacity-30">
        <div className="flex items-center gap-2"><Keypad size={16}/> <span>PIN</span></div>
        <div className="flex items-center gap-2"><QrCode size={16}/> <span>QR</span></div>
        <div className="flex items-center gap-2"><Camera size={16}/> <span>FOTO SEGURIDAD</span></div>
      </footer>
    </div>
  );
}