"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  BookOpen, Plus, Trash2, ArrowLeft, Loader2, UtensilsCrossed, 
  Star, Hammer, Edit2, X, Check, Link2, DollarSign 
} from 'lucide-react';
import Link from 'next/link';

interface ModificadorBase { id: string; nombre: string; }
interface Producto { id: string; nombre: string; modificadores?: ModificadorBase[]; }
interface Insumo { id: string; nombre: string; unidad_medida: string; categoria_id?: string; es_preparado?: boolean; }
interface RecetaItem { 
  id: string; 
  insumo_id: string; 
  cantidad_requerida: number; 
  insumos: { nombre: string; unidad_medida: string; } 
}

export default function RecetasPage() {
  const [productos, setProductos] = useState<Producto[]>([]);
  const [modificadores, setModificadores] = useState<Producto[]>([]);
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [idCategoriaPreparados, setIdCategoriaPreparados] = useState<string>('');
  
  const [modo, setModo] = useState<'productos' | 'modificadores' | 'preparados'>('productos');
  const [seleccionadoId, setSeleccionadoId] = useState<string>('');
  
  const [ingredientes, setIngredientes] = useState<RecetaItem[]>([]);
  const [cargando, setCargando] = useState(true);
  
  const [modalNuevo, setModalNuevo] = useState(false);
  const [nombreNuevo, setNombreNuevo] = useState('');
  const [precioNuevo, setPrecioNuevo] = useState<number>(0); 
  
  const [modalAsignar, setModalAsignar] = useState(false);
  const [productosVincular, setProductosVincular] = useState<string[]>([]);

  const [nuevoIngrediente, setNuevoIngrediente] = useState({ insumo_id: '', cantidad: 0 });
  const [editandoIngredienteId, setEditandoIngredienteId] = useState<string | null>(null);
  const [cantidadEditada, setCantidadEditada] = useState<number>(0);

  const cargarDatosIniciales = useCallback(async () => {
    const { data: p } = await supabase.from('productos').select('id, nombre, modificadores').order('nombre');
    const { data: i } = await supabase.from('insumos').select('id, nombre, unidad_medida, categoria_id, es_preparado').order('nombre');
    const { data: c } = await supabase.from('categorias_insumos').select('id, nombre');
    
    const idCatPrep = c?.find(cat => cat.nombre.toLowerCase() === 'preparados')?.id;
    if (idCatPrep) setIdCategoriaPreparados(idCatPrep);

    const modsUnicos: Producto[] = [];
    p?.forEach(prod => {
      prod.modificadores?.forEach((m: ModificadorBase) => {
        if (!modsUnicos.find(x => x.id === m.id)) {
          modsUnicos.push({ id: m.id, nombre: m.nombre });
        }
      });
    });

    setProductos(p || []);
    setModificadores(modsUnicos);
    setInsumos(i || []);
    setCargando(false);
  }, []);

  // --- FIX: Forma correcta de llamar la función en el Effect ---
  useEffect(() => {
    const initData = async () => {
      await cargarDatosIniciales();
    };
    initData();
  }, [cargarDatosIniciales]);

  const crearElementoPrincipal = async () => {
    if (!nombreNuevo) return;
    
    const tabla = modo === 'productos' ? 'productos' : modo === 'modificadores' ? 'modificadores' : 'insumos';
    
    const payload: Record<string, string | number | null | boolean> = { 
      nombre: nombreNuevo 
    };

    if (modo === 'productos' || modo === 'modificadores') {
      payload.precio = precioNuevo;
    }
    
    if (modo === 'preparados') {
      payload.es_preparado = true; 
      payload.categoria_id = idCategoriaPreparados || null; 
    }

    const { error } = await supabase.from(tabla).insert([payload]);
    
    if (!error) {
      setModalNuevo(false);
      setNombreNuevo('');
      setPrecioNuevo(0);
      cargarDatosIniciales();
    } else {
      alert("Error al crear: " + error.message);
    }
  };

  const vincularExtraAProductos = async () => {
    const extra = modificadores.find(m => m.id === seleccionadoId);
    if (!extra) return;

    for (const pId of productosVincular) {
      const prod = productos.find(p => p.id === pId);
      const modsActuales = prod?.modificadores || [];
      if (!modsActuales.find(m => m.id === extra.id)) {
        const nuevosMods = [...modsActuales, { id: extra.id, nombre: extra.nombre }];
        await supabase.from('productos').update({ modificadores: nuevosMods }).eq('id', pId);
      }
    }
    setModalAsignar(false);
    alert("Vínculos actualizados.");
  };

  const cargarReceta = async (id: string) => {
    setSeleccionadoId(id);
    const tabla = modo === 'modificadores' ? 'recetas_modificadores' : modo === 'preparados' ? 'recetas_insumos' : 'recetas';
    const columnaFiltro = modo === 'modificadores' ? 'modificador_id' : modo === 'preparados' ? 'insumo_preparado_id' : 'producto_id';
    
    const selectFields = modo === 'preparados' 
      ? `id, insumo_id:insumo_base_id, cantidad_requerida:cantidad_proporcional, insumos:insumos!insumo_base_id (nombre, unidad_medida)`
      : `id, insumo_id, cantidad_requerida, insumos (nombre, unidad_medida)`;

    const { data, error } = await supabase.from(tabla).select(selectFields).eq(columnaFiltro, id);
    if (!error) setIngredientes(data as unknown as RecetaItem[] || []);
  };

  const eliminarEntradaPrincipal = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!confirm("¿Eliminar elemento?")) return;
    const tabla = modo === 'productos' ? 'productos' : modo === 'modificadores' ? 'modificadores' : 'insumos';
    await supabase.from(tabla).delete().eq('id', id);
    cargarDatosIniciales();
  };

  const agregarIngrediente = async () => {
    if (!seleccionadoId || !nuevoIngrediente.insumo_id || nuevoIngrediente.cantidad <= 0) return;
    
    const tabla = modo === 'productos' ? 'recetas' : modo === 'modificadores' ? 'recetas_modificadores' : 'recetas_insumos';
    const columnaFiltro = modo === 'productos' ? 'producto_id' : modo === 'modificadores' ? 'modificador_id' : 'insumo_preparado_id';
    const columnaInsumo = modo === 'preparados' ? 'insumo_base_id' : 'insumo_id';
    const columnaCant = modo === 'preparados' ? 'cantidad_proporcional' : 'cantidad_requerida';

    const { error } = await supabase.from(tabla).insert([{ 
      [columnaFiltro]: seleccionadoId, 
      [columnaInsumo]: nuevoIngrediente.insumo_id, 
      [columnaCant]: nuevoIngrediente.cantidad 
    }]);

    if (!error) { 
      setNuevoIngrediente({ insumo_id: '', cantidad: 0 }); 
      await cargarReceta(seleccionadoId); 
    }
  };

  const guardarEdicion = async (id: string) => {
    const tabla = modo === 'productos' ? 'recetas' : modo === 'modificadores' ? 'recetas_modificadores' : 'recetas_insumos';
    const col = modo === 'preparados' ? 'cantidad_proporcional' : 'cantidad_requerida';
    await supabase.from(tabla).update({ [col]: cantidadEditada }).eq('id', id);
    setEditandoIngredienteId(null); cargarReceta(seleccionadoId);
  };

  const eliminarIngrediente = async (id: string) => {
    const tabla = modo === 'productos' ? 'recetas' : modo === 'modificadores' ? 'recetas_modificadores' : 'recetas_insumos';
    await supabase.from(tabla).delete().eq('id', id);
    cargarReceta(seleccionadoId);
  };

  if (cargando) return (
    <div className="h-screen bg-indigo-950 flex items-center justify-center text-white font-sans">
      <Loader2 className="animate-spin mr-2"/> 
      <p className="font-black uppercase tracking-widest text-xs">Cargando...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-6xl mx-auto flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">Recetario <span className="text-orange-500 text-2xl font-light">Maestro</span></h1>
          </div>
          <div className="bg-white/10 p-1 rounded-2xl flex gap-1">
            <button onClick={() => { setModo('productos'); setSeleccionadoId(''); setIngredientes([]); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'productos' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>Productos</button>
            <button onClick={() => { setModo('modificadores'); setSeleccionadoId(''); setIngredientes([]); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'modificadores' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>Extras</button>
            <button onClick={() => { setModo('preparados'); setSeleccionadoId(''); setIngredientes([]); }} className={`px-4 py-2 rounded-xl text-[10px] font-black uppercase transition-all ${modo === 'preparados' ? 'bg-orange-600 text-white' : 'text-slate-400 hover:text-white'}`}>Preparados</button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8 grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-1 space-y-4">
          <div className="flex justify-between items-center px-2">
            <h2 className="text-[10px] font-black uppercase text-slate-400 tracking-widest">Lista de {modo}</h2>
            <button onClick={() => setModalNuevo(true)} className="bg-orange-600 text-white p-1 rounded-lg hover:scale-110 transition-all"><Plus size={16}/></button>
          </div>
          <div className="bg-white rounded-4xl border-2 border-slate-100 p-4 shadow-sm max-h-150 overflow-y-auto">
            {(modo === 'productos' ? productos : modo === 'modificadores' ? modificadores : insumos.filter(ins => ins.es_preparado)).map(item => (
              <div key={item.id} className="relative group">
                <button onClick={() => cargarReceta(item.id)} className={`w-full text-left p-4 pr-12 rounded-2xl mb-2 font-bold transition-all ${seleccionadoId === item.id ? 'bg-orange-500 text-white shadow-lg' : 'hover:bg-slate-50 text-indigo-950'}`}>{item.nombre}</button>
                <button onClick={(e) => eliminarEntradaPrincipal(item.id, e)} className="absolute right-3 top-4 text-slate-200 hover:text-red-500 transition-all"><Trash2 size={16} /></button>
              </div>
            ))}
          </div>
        </div>

        <div className="lg:col-span-2">
          {seleccionadoId ? (
            <div className="bg-white p-8 rounded-4xl border-2 border-slate-100 shadow-sm animate-in fade-in duration-300">
              <div className="flex justify-between items-center mb-8">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 text-orange-600 p-3 rounded-2xl">{modo === 'productos' ? <UtensilsCrossed size={24}/> : modo === 'modificadores' ? <Star size={24}/> : <Hammer size={24}/>}</div>
                  <h3 className="text-2xl font-black text-indigo-950 uppercase italic">{modo}</h3>
                </div>
                {modo === 'modificadores' && (
                  <button onClick={() => setModalAsignar(true)} className="bg-indigo-950 text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase flex items-center gap-2 shadow-lg"><Link2 size={14}/> Vincular a Platillos</button>
                )}
              </div>

              <div className="space-y-3 mb-10">
                {ingredientes.map(item => (
                  <div key={item.id} className="flex justify-between items-center p-5 bg-slate-50 rounded-2xl border">
                    {editandoIngredienteId === item.id ? (
                      <div className="flex grow items-center gap-4 animate-in fade-in">
                        <input type="number" className="bg-white border-2 border-orange-200 rounded-xl px-3 py-1 w-32 outline-none text-indigo-950 font-bold" value={cantidadEditada} onChange={(e) => setCantidadEditada(Number(e.target.value))} autoFocus />
                        <button onClick={() => guardarEdicion(item.id)} className="bg-emerald-500 text-white p-2 rounded-xl"><Check size={18}/></button>
                        <button onClick={() => setEditandoIngredienteId(null)} className="bg-slate-200 p-2 rounded-xl text-slate-600"><X size={18}/></button>
                      </div>
                    ) : (
                      <>
                        <div>
                          <p className="font-black text-indigo-950 uppercase text-sm">{item.insumos?.nombre}</p>
                          <p className="text-[10px] text-slate-400 font-bold tracking-widest">{item.cantidad_requerida} {item.insumos?.unidad_medida}</p>
                        </div>
                        <div className="flex gap-2">
                          <button onClick={() => { setEditandoIngredienteId(item.id); setCantidadEditada(item.cantidad_requerida); }} className="text-slate-300 hover:text-indigo-950 transition-all"><Edit2 size={18}/></button>
                          <button onClick={() => eliminarIngrediente(item.id)} className="text-red-200 hover:text-red-600 transition-all"><Trash2 size={18}/></button>
                        </div>
                      </>
                    )}
                  </div>
                ))}
              </div>

              <div className="border-t pt-8">
                <h4 className="text-[10px] font-black uppercase text-slate-400 mb-4 tracking-widest">Añadir Componente</h4>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <select className="bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={nuevoIngrediente.insumo_id} onChange={e => setNuevoIngrediente({...nuevoIngrediente, insumo_id: e.target.value})}>
                    <option value="">Seleccionar Insumo...</option>
                    {insumos.filter(i => i.id !== seleccionadoId).map(i => <option key={i.id} value={i.id}>{i.nombre} ({i.unidad_medida})</option>)}
                  </select>
                  <div className="flex gap-2">
                    <input type="number" step="0.001" placeholder="Cant." className="grow bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={nuevoIngrediente.cantidad === 0 ? '' : nuevoIngrediente.cantidad} onChange={e => setNuevoIngrediente({...nuevoIngrediente, cantidad: Number(e.target.value)})} />
                    <button onClick={agregarIngrediente} className="bg-orange-600 text-white px-6 rounded-2xl shadow-lg hover:bg-orange-500 transition-all"><Plus size={24}/></button>
                  </div>
                </div>
              </div>
            </div>
          ) : (
            <div className="h-100 flex flex-col items-center justify-center text-slate-300 border-4 border-dashed rounded-4xl border-slate-100">
              <BookOpen size={64} className="mb-4 opacity-10" />
              <p className="font-black uppercase tracking-widest text-[10px]">Selecciona un elemento para configurar</p>
            </div>
          )}
        </div>
      </main>

      {modalNuevo && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 shadow-2xl text-center">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic mb-6">Nuevo {modo}</h2>
            
            <div className="space-y-4 mb-8">
              <div>
                <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block text-left">Nombre:</label>
                <input placeholder="Ej. Masa especial..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none focus:border-orange-500 text-indigo-950" value={nombreNuevo} onChange={e => setNombreNuevo(e.target.value)} autoFocus />
              </div>

              {(modo === 'productos' || modo === 'modificadores') && (
                <div>
                  <label className="text-[10px] font-black text-slate-400 uppercase ml-2 mb-1 block text-left">Precio de Venta ($):</label>
                  <div className="relative">
                    <DollarSign size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input type="number" placeholder="0.00" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 pl-10 font-bold outline-none focus:border-orange-500 text-indigo-950" value={precioNuevo === 0 ? '' : precioNuevo} onChange={e => setPrecioNuevo(Number(e.target.value))} />
                  </div>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <button onClick={() => { setModalNuevo(false); setPrecioNuevo(0); setNombreNuevo(''); }} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cerrar</button>
              <button onClick={crearElementoPrincipal} className="grow bg-orange-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl">Crear</button>
            </div>
          </div>
        </div>
      )}

      {modalAsignar && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl">
            <h2 className="text-xl font-black text-indigo-950 uppercase italic mb-6 text-center">Vincular Extra</h2>
            <div className="max-h-60 overflow-y-auto space-y-2 mb-8 pr-2">
              {productos.map(p => (
                <label key={p.id} className="flex items-center gap-3 p-3 bg-slate-50 rounded-2xl cursor-pointer hover:bg-slate-100 transition-all">
                  <input type="checkbox" className="w-5 h-5 accent-orange-500" checked={productosVincular.includes(p.id)} onChange={e => e.target.checked ? setProductosVincular([...productosVincular, p.id]) : setProductosVincular(productosVincular.filter(id => id !== p.id))} />
                  <span className="font-bold text-indigo-950 text-sm uppercase">{p.nombre}</span>
                </label>
              ))}
            </div>
            <div className="flex gap-4">
              <button onClick={() => setModalAsignar(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={vincularExtraAProductos} className="grow bg-indigo-950 text-white font-black py-4 rounded-2xl uppercase text-[10px] shadow-xl">Actualizar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}