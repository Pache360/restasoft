"use client";

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Camera, QrCode, Grid3x3, 
  ArrowLeft, Loader2, UserCheck, LogOut, ShieldCheck, X, ScanFace
} from 'lucide-react';
import Link from 'next/link';
import { Html5QrcodeScanner } from 'html5-qrcode';
import * as faceapi from 'face-api.js';

// Definición de tipos para Supabase
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
  qr_codigo?: string;
  turno_id?: string;
  turnos?: Turno;
  rostro_descriptor?: number[]; // <--- El mapa matemático de la cara
}

export default function ChecadorKiosko() {
  const [hora, setHora] = useState(new Date());
  const [pin, setPin] = useState("");
  const [tipoRegistro, setTipoRegistro] = useState<'entrada' | 'salida' | null>(null);
  const [cargando, setCargando] = useState(false);
  const [mensaje, setMensaje] = useState({ texto: '', tipo: '' });
  
  // Estados de IA
  const [iaCargada, setIaCargada] = useState(false);
  const [validandoRostro, setValidandoRostro] = useState(false);
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Reloj en tiempo real
  useEffect(() => {
    const timer = setInterval(() => setHora(new Date()), 1000);
    return () => clearInterval(timer);
  }, []);

  // Cargar Modelos de Inteligencia Artificial al iniciar
  useEffect(() => {
    const cargarModelosIA = async () => {
      try {
        // Usamos un CDN seguro para no tener que descargar los modelos manuales
        const MODEL_URL = 'https://cdn.jsdelivr.net/gh/justadudewhohacks/face-api.js@master/weights';
        await Promise.all([
          faceapi.nets.ssdMobilenetv1.loadFromUri(MODEL_URL),
          faceapi.nets.faceLandmark68Net.loadFromUri(MODEL_URL),
          faceapi.nets.faceRecognitionNet.loadFromUri(MODEL_URL)
        ]);
        setIaCargada(true);
      } catch (error) {
        console.error("Error cargando IA Facial", error);
      }
    };
    cargarModelosIA();
  }, []);

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

  const procesarRegistro = useCallback(async (metodo: 'pin' | 'qr' | 'huella', valorQR?: string) => {
    if (!tipoRegistro) return alert("Selecciona primero ENTRADA o SALIDA");
    
    setCargando(true);
    setValidandoRostro(metodo === 'pin'); // Activar UI de escaneo

    try {
      let data = null;
      let userError = null;

      // 1. Identificar al usuario
      if (metodo === 'pin') {
        const res = await supabase.from('usuarios').select('*, turnos(*)').eq('pin', pin).single();
        data = res.data;
        userError = res.error;
      } else if (metodo === 'qr' && valorQR) {
        const res = await supabase.from('usuarios').select('*, turnos(*)').eq('qr_codigo', valorQR).single();
        data = res.data;
        userError = res.error;
      }

      const usuario = data as unknown as Usuario;

      if (userError || !usuario) throw new Error("Usuario no encontrado o PIN incorrecto");

      // 2. VALIDACIÓN FACIAL CON IA (Solo si tiene rostro registrado y usa PIN)
      if (metodo === 'pin' && usuario.rostro_descriptor && videoRef.current) {
        if (!iaCargada) throw new Error("La IA aún está cargando, intenta en 2 segundos...");

        // Escaneamos la cara de la persona parada frente a la tablet
        const deteccion = await faceapi.detectSingleFace(videoRef.current)
                                      .withFaceLandmarks()
                                      .withFaceDescriptor();

        if (!deteccion) {
          throw new Error("No se detectó ningún rostro. Por favor, mira fijamente a la cámara.");
        }

        // Convertimos el descriptor guardado en la BD a un formato que la IA entienda
        const descriptorRegistrado = new Float32Array(usuario.rostro_descriptor);
        
        // Calculamos la similitud (Distancia Euclidiana: Menos de 0.5 es la misma persona)
        const distancia = faceapi.euclideanDistance(deteccion.descriptor, descriptorRegistrado);
        
        if (distancia > 0.50) {
          throw new Error("ALERTA: El rostro no coincide con el de " + usuario.nombre);
        }
      }

      // 3. Capturar foto para el historial (seguridad extra)
      const foto = metodo === 'pin' ? capturarFotoBase64() : null;

      // 4. Validar puntualidad
      let estatus = 'puntual';
      if (tipoRegistro === 'entrada' && usuario.turnos) {
        const [h, m] = usuario.turnos.hora_entrada.split(':');
        const horaEntradaTurno = new Date();
        horaEntradaTurno.setHours(parseInt(h), parseInt(m), 0);
        
        const limiteTolerancia = new Date(horaEntradaTurno.getTime() + usuario.turnos.tolerancia_minutos * 60000);
        if (new Date() > limiteTolerancia) estatus = 'retardo';
      }

      // 5. Guardar asistencia
      const { error: asistError } = await supabase.from('asistencias').insert([{
        usuario_id: usuario.id,
        tipo_registro: tipoRegistro,
        metodo: metodo,
        foto_url: foto,
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

    } catch (err: unknown) {
      if (err instanceof Error) {
        setMensaje({ texto: err.message, tipo: 'error' });
      } else {
        setMensaje({ texto: 'Error desconocido', tipo: 'error' });
      }
      setPin("");
    } finally {
      setCargando(false);
      setValidandoRostro(false);
    }
  }, [pin, tipoRegistro, capturarFotoBase64, iaCargada]);

  // Soporte para teclado físico
  useEffect(() => {
    const manejarTeclado = (e: KeyboardEvent) => {
      if (validandoRostro || cargando) return; // Bloquear teclado si está escaneando

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
  }, [pin, tipoRegistro, procesarRegistro, validandoRostro, cargando]);

  // Inicializar Escáner QR
  useEffect(() => {
    let scanner: Html5QrcodeScanner | null = null;
    if (tipoRegistro) {
      scanner = new Html5QrcodeScanner("reader", { fps: 10, qrbox: 250 }, false);
      scanner.render((decodedText) => {
        if (scanner) {
          scanner.clear();
          procesarRegistro('qr', decodedText);
        }
      }, () => { /* ignore error callback */ });
    }
    return () => { 
      if (scanner) {
        scanner.clear().catch(console.error);
      }
    };
  }, [tipoRegistro, procesarRegistro]);

  // Encender cámara
  useEffect(() => {
    const currentVideo = videoRef.current; 
    async function setupCamera() {
      if (currentVideo) {
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ video: true });
          currentVideo.srcObject = stream;
        } catch (error) {
          console.error("Error al acceder a la cámara", error);
        }
      }
    }
    setupCamera();
    
    return () => {
      if (currentVideo && currentVideo.srcObject) {
        const stream = currentVideo.srcObject as MediaStream;
        stream.getTracks().forEach(track => track.stop());
      }
    };
  }, []);


  return (
    <div className="min-h-screen bg-indigo-950 text-white font-sans flex flex-col items-center justify-center p-6">
      <canvas ref={canvasRef} className="hidden" />
      
      {/* Botón Volver */}
      <Link href="/" className="absolute top-8 left-8 p-3 bg-white/10 rounded-full hover:bg-white/20 transition-all">
        <ArrowLeft size={24} />
      </Link>

      {/* Indicador de IA */}
      <div className="absolute top-8 right-8 flex items-center gap-2">
        {iaCargada ? (
          <span className="bg-emerald-500/20 text-emerald-400 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-emerald-500/30"><ScanFace size={14}/> IA Activa</span>
        ) : (
          <span className="bg-orange-500/20 text-orange-400 px-3 py-1 rounded-full text-[10px] font-black uppercase flex items-center gap-1 border border-orange-500/30"><Loader2 size={14} className="animate-spin"/> Cargando IA...</span>
        )}
      </div>

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
          <div className={`w-full md:w-1/2 bg-black rounded-[48px] overflow-hidden border-4 shadow-2xl relative min-h-100 transition-all ${validandoRostro ? 'border-emerald-500 ring-4 ring-emerald-500/50' : 'border-white/10'}`}>
             <div id="reader" className="w-full"></div>
             <video ref={videoRef} autoPlay muted className={`w-full h-full object-cover absolute inset-0 -z-10 transition-all ${validandoRostro ? 'grayscale-0' : 'grayscale opacity-50'}`} />
             
             {validandoRostro ? (
                <div className="absolute inset-0 flex flex-col items-center justify-center bg-indigo-950/80 backdrop-blur-sm z-10">
                   <ScanFace size={64} className="text-emerald-400 animate-pulse mb-4" />
                   <p className="font-black uppercase tracking-widest text-emerald-400">Analizando Rostro...</p>
                   <p className="text-[10px] text-white/50 mt-2 uppercase font-bold">Por favor, mira fijamente a la cámara</p>
                </div>
             ) : (
                <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
                  <div className="border-2 border-orange-500 w-64 h-64 rounded-3xl border-dashed animate-pulse" />
                </div>
             )}
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
                <button key={n} disabled={validandoRostro} onClick={() => { if(pin.length < 4) setPin(pin + n.toString()) }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black hover:bg-orange-50 hover:border-orange-500 transition-all active:scale-95 disabled:opacity-50">{n}</button>
              ))}
              <button disabled={validandoRostro} onClick={() => setPin("")} className="bg-red-50 text-red-500 p-5 rounded-2xl font-black hover:bg-red-100 disabled:opacity-50">C</button>
              <button disabled={validandoRostro} onClick={() => { if(pin.length < 4) setPin(pin + '0') }} className="bg-slate-50 border-2 border-slate-100 p-5 rounded-2xl text-2xl font-black hover:bg-orange-50 transition-all disabled:opacity-50">0</button>
              <button disabled={validandoRostro} onClick={() => procesarRegistro('pin')} className="bg-emerald-500 text-white p-5 rounded-2xl font-black hover:bg-emerald-400 flex items-center justify-center disabled:opacity-50">
                {cargando ? <Loader2 className="animate-spin" /> : <ShieldCheck size={32}/>}
              </button>
            </div>
          </div>

        </div>
      )}

      <footer className="mt-12 flex gap-8 opacity-30">
        <div className="flex items-center gap-2"><Grid3x3 size={16}/> <span>PIN</span></div>
        <div className="flex items-center gap-2"><QrCode size={16}/> <span>QR</span></div>
        <div className="flex items-center gap-2"><Camera size={16}/> <span>BIOMETRÍA FACIAL</span></div>
      </footer>
    </div>
  );
}