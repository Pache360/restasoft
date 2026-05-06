"use client";

import React, { useEffect, useState, useCallback } from 'react';
import { supabase } from '@/lib/supabase';
import { 
  Plus, Edit2, Trash2, 
  ArrowLeft, MinusCircle, Loader2, Save, Tags,
  Hammer 
} from 'lucide-react';
import Link from 'next/link';

interface Categoria { id: string; nombre: string; }
interface Insumo {
  id: string;
  nombre: string;
  cantidad_actual: number;
  unidad_medida: string;
  stock_minimo: number;
  categoria_id: string;
  costo_unitario: number; 
  es_preparado: boolean; 
  categorias_insumos?: { nombre: string };
}

export default function InventarioPage() {
  const [insumos, setInsumos] = useState<Insumo[]>([]);
  const [categorias, setCategorias] = useState<Categoria[]>([]);
  const [cargando, setCargando] = useState(true);
  const [modalAbierto, setModalAbierto] = useState(false);
  const [modalCategorias, setModalCategorias] = useState(false);
  const [modalMerma, setModalMerma] = useState(false);
  const [modalProduccion, setModalProduccion] = useState(false);
  
  const [editandoId, setEditandoId] = useState<string | null>(null);
  
  const [form, setForm] = useState({ 
    nombre: '', 
    cantidad_actual: 0, 
    unidad_medida: 'kg', 
    stock_minimo: 0,
    categoria_id: '',
    costo_total: 0,
    costo_unitario: 0
  });
  
  const [nuevaCatNombre, setNuevaCatNombre] = useState('');
  const [insumoSeleccionado, setInsumoSeleccionado] = useState<Insumo | null>(null);
  const [cantidadMerma, setCantidadMerma] = useState(0);
  const [cantidadAProducir, setCantidadAProducir] = useState(0);

  const cargarDatos = useCallback(async () => {
    const { data: catData } = await supabase.from('categorias_insumos').select('*').order('nombre');
    const { data: insData } = await supabase.from('insumos').select('*, categorias_insumos(nombre)').order('nombre');
    
    setCategorias(catData || []);
    setInsumos(insData || []);
    setCargando(false);
  }, []);

  useEffect(() => { 
    let isMounted = true;
    const fetchData = async () => {
      try {
        if (isMounted) {
          await cargarDatos();
        }
      } catch (error) {
        console.error("Error al sincronizar:", error);
      }
    };
    fetchData();
    return () => { isMounted = false; };
  }, [cargarDatos]);

  const actualizarPrecioUnitario = (cantidad: number, total: number) => {
    const unitario = (cantidad > 0 && total > 0) ? (total / cantidad) : 0;
    setForm(prev => ({
      ...prev,
      cantidad_actual: cantidad,
      costo_total: total,
      costo_unitario: Number(unitario.toFixed(2))
    }));
  };

  const ejecutarProduccion = async () => {
    if (!insumoSeleccionado || cantidadAProducir <= 0) return;
    try {
      const { data: receta, error: errReceta } = await supabase
        .from('recetas_insumos')
        .select('*')
        .eq('insumo_preparado_id', insumoSeleccionado.id);

      if (errReceta || !receta || receta.length === 0) {
        alert("Aviso: Debes configurar los ingredientes de este preparado en el Recetario antes de producirlo.");
        return;
      }

      for (const item of receta) {
        const descuento = item.cantidad_proporcional * cantidadAProducir;
        const { data: base } = await supabase.from('insumos').select('cantidad_actual').eq('id', item.insumo_base_id).single();
        if (base) {
          const nuevaCantBase = Number((base.cantidad_actual - descuento).toFixed(3));
          await supabase.from('insumos').update({ cantidad_actual: nuevaCantBase }).eq('id', item.insumo_base_id);
        }
      }

      const nuevaCantPrep = Number((insumoSeleccionado.cantidad_actual + cantidadAProducir).toFixed(3));
      await supabase.from('insumos').update({ cantidad_actual: nuevaCantPrep }).eq('id', insumoSeleccionado.id);
      
      setModalProduccion(false);
      setCantidadAProducir(0);
      cargarDatos();
      alert("¡Producción completada!");
    } catch (error) { console.error(error); }
  };

  const guardarInsumo = async () => {
    if (!form.nombre) return alert("El nombre es obligatorio");
    
    const insumoExistente = insumos.find(i => i.id === editandoId);
    const stockPrevio = editandoId ? (insumoExistente?.cantidad_actual || 0) : 0;
    
    const stockFinal = Number((stockPrevio + form.cantidad_actual).toFixed(3));

    const payload = {
      nombre: form.nombre,
      cantidad_actual: stockFinal,
      unidad_medida: form.unidad_medida,
      stock_minimo: form.stock_minimo,
      categoria_id: form.categoria_id || null, 
      costo_unitario: form.costo_unitario
    };

    try {
      if (editandoId) {
        await supabase.from('insumos').update(payload).eq('id', editandoId);
      } else {
        await supabase.from('insumos').insert([payload]);
      }

      if (form.costo_total > 0) {
        await supabase.from('egresos').insert([{
          monto: form.costo_total,
          concepto: `Compra: ${form.nombre} (${form.cantidad_actual} ${form.unidad_medida})`
        }]);
      }

      cerrarModal();
      cargarDatos();
    } catch (error) { console.error(error); }
  };

  // --- NUEVA FUNCIÓN: ELIMINAR INSUMO ---
  const eliminarInsumo = async (id: string, nombre: string) => {
    if (confirm(`¿Estás seguro de que deseas eliminar "${nombre}" de forma permanente?`)) {
      try {
        const { error } = await supabase.from('insumos').delete().eq('id', id);
        if (error) {
          // Si da error, casi seguro es porque está siendo usado en el recetario
          alert(`No se pudo eliminar "${nombre}". Es posible que esté siendo utilizado como ingrediente en alguna receta.`);
          console.error(error);
          return;
        }
        cargarDatos();
      } catch (error) {
        console.error(error);
      }
    }
  };

  const agregarCategoria = async () => {
    if (!nuevaCatNombre) return;
    await supabase.from('categorias_insumos').insert([{ nombre: nuevaCatNombre }]);
    setNuevaCatNombre('');
    cargarDatos();
  };

  const eliminarCategoria = async (id: string) => {
    if (confirm("¿Seguro?")) {
      await supabase.from('categorias_insumos').delete().eq('id', id);
      cargarDatos();
    }
  };

  const registrarMerma = async () => {
    if (!insumoSeleccionado || cantidadMerma <= 0) return;
    const nuevaCantidad = Number((insumoSeleccionado.cantidad_actual - cantidadMerma).toFixed(3));
    const costoPerdido = Number((insumoSeleccionado.costo_unitario * cantidadMerma).toFixed(2));
    
    try {
      await supabase.from('insumos').update({ cantidad_actual: nuevaCantidad }).eq('id', insumoSeleccionado.id);
      if (costoPerdido > 0) {
        await supabase.from('egresos').insert([{ monto: costoPerdido, concepto: `MERMA: ${insumoSeleccionado.nombre}` }]);
      }
      setModalMerma(false);
      setCantidadMerma(0);
      cargarDatos();
    } catch (error) { console.error(error); }
  };

  const cerrarModal = () => {
    setModalAbierto(false);
    setEditandoId(null);
    setForm({ nombre: '', cantidad_actual: 0, unidad_medida: 'kg', stock_minimo: 0, categoria_id: '', costo_total: 0, costo_unitario: 0 });
  };

  if (cargando) return (
    <div className="h-screen bg-indigo-950 flex items-center justify-center text-white font-sans">
      <Loader2 className="animate-spin mr-2"/> 
      <p className="font-black uppercase tracking-widest text-xs">Sincronizando Almacén...</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 font-sans pb-20">
      <header className="bg-indigo-950 text-white p-8 shadow-xl">
        <div className="max-w-6xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-4">
            <Link href="/" className="p-2 hover:bg-white/10 rounded-full transition-all"><ArrowLeft size={24} /></Link>
            <h1 className="text-3xl font-black uppercase italic tracking-tighter">
              Almacén <span className="text-orange-500 text-2xl font-light">RestaSoft</span>
            </h1>
          </div>
          <div className="flex gap-3">
            <button onClick={() => setModalCategorias(true)} className="bg-indigo-800 hover:bg-indigo-700 text-white px-4 py-3 rounded-2xl font-bold flex items-center gap-2 transition-all text-xs">
              <Tags size={18} /> CATEGORÍAS
            </button>
            <button onClick={() => setModalAbierto(true)} className="bg-orange-600 hover:bg-orange-50 text-white px-6 py-3 rounded-2xl font-black flex items-center gap-2 shadow-lg text-xs">
              <Plus size={18} /> NUEVO INSUMO
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-6xl mx-auto p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {insumos.map((insumo) => (
            <div key={insumo.id} className={`bg-white p-6 rounded-4xl border-2 transition-all shadow-sm ${insumo.cantidad_actual <= insumo.stock_minimo ? 'border-red-200 bg-red-50/30' : 'border-slate-100'}`}>
              <div className="flex justify-between items-start mb-4">
                <div className="flex flex-col">
                  <span className="text-[10px] font-black text-orange-500 uppercase tracking-widest">{insumo.categorias_insumos?.nombre || 'Sin Categoría'}</span>
                  <h3 className="text-xl font-black text-indigo-950 uppercase">{insumo.nombre}</h3>
                </div>
                <div className="flex flex-col items-end">
                  <span className="text-[10px] font-black text-emerald-600 uppercase tracking-tighter">Costo Unitario</span>
                  <span className="text-sm font-black text-indigo-950">${insumo.costo_unitario || 0}</span>
                </div>
              </div>
              
              <div className="flex items-end gap-2 mb-6">
                <span className={`text-3xl font-black italic ${insumo.cantidad_actual <= insumo.stock_minimo ? 'text-red-600' : 'text-indigo-950'}`}>
                  {Number(insumo.cantidad_actual.toFixed(3))}
                </span>
                <span className="text-slate-400 font-bold uppercase text-[10px] mb-2">{insumo.unidad_medida}</span>
              </div>

              <div className="flex gap-2">
                {insumo.es_preparado && (
                  <button onClick={() => { setInsumoSeleccionado(insumo); setModalProduccion(true); }} className="p-3 bg-indigo-950 text-white rounded-2xl hover:bg-indigo-800 transition-all shadow-md" title="Producir Lote"><Hammer size={18} /></button>
                )}
                <button onClick={() => { setInsumoSeleccionado(insumo); setModalMerma(true); }} className="grow flex items-center justify-center gap-2 bg-red-100 text-red-600 font-black py-3 rounded-2xl text-[10px] uppercase hover:bg-red-200 transition-all"><MinusCircle size={16} /> Merma</button>
                <button onClick={() => { 
                    setEditandoId(insumo.id); 
                    setForm({
                      nombre: insumo.nombre,
                      cantidad_actual: 0, 
                      unidad_medida: insumo.unidad_medida,
                      stock_minimo: insumo.stock_minimo,
                      categoria_id: insumo.categoria_id || '',
                      costo_total: 0, 
                      costo_unitario: insumo.costo_unitario || 0
                    }); 
                    setModalAbierto(true); 
                }} className="p-3 bg-slate-50 border border-slate-100 text-slate-400 hover:text-blue-500 rounded-2xl transition-all" title="Editar"><Edit2 size={18} /></button>
                
                {/* --- BOTÓN DE ELIMINAR --- */}
                <button onClick={() => eliminarInsumo(insumo.id, insumo.nombre)} className="p-3 bg-red-50 border border-red-100 text-red-400 hover:text-red-600 hover:bg-red-100 rounded-2xl transition-all" title="Eliminar Insumo"><Trash2 size={18} /></button>
              </div>
            </div>
          ))}
        </div>
      </main>

      {modalProduccion && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 shadow-2xl text-center">
            <div className="bg-orange-100 text-orange-600 w-16 h-16 rounded-3xl flex items-center justify-center mx-auto mb-6"><Hammer size={32} /></div>
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic">Preparar Lote</h2>
            <div className="mb-8 mt-6">
              <label className="text-[10px] font-black text-slate-400 uppercase block mb-2">Cantidad preparada ({insumoSeleccionado?.unidad_medida})</label>
              <input type="number" className="w-full text-4xl font-black text-center bg-slate-50 p-4 rounded-3xl outline-none" value={cantidadAProducir === 0 ? '' : cantidadAProducir} onChange={e => setCantidadAProducir(Number(e.target.value))} autoFocus />
            </div>
            <div className="flex gap-4">
              <button onClick={() => setModalProduccion(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl text-[10px] uppercase">Cancelar</button>
              <button onClick={ejecutarProduccion} className="grow bg-orange-600 text-white font-black py-4 rounded-2xl text-[10px] uppercase">Producir</button>
            </div>
          </div>
        </div>
      )}

      {modalAbierto && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl overflow-y-auto max-h-[90vh]">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic text-center mb-8">{editandoId ? 'Agregar Stock' : 'Nuevo Insumo'}</h2>
            <div className="space-y-5">
              <input placeholder="Nombre..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={form.nombre} onChange={e => setForm({...form, nombre: e.target.value})} />
              <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={form.categoria_id} onChange={e => setForm({...form, categoria_id: e.target.value})}>
                <option value="">Categoría...</option>
                {categorias.map(c => <option key={c.id} value={c.id}>{c.nombre}</option>)}
              </select>
              <div className="grid grid-cols-2 gap-4">
                <input type="number" placeholder="Cantidad a sumar..." className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={form.cantidad_actual === 0 ? '' : form.cantidad_actual} onChange={e => actualizarPrecioUnitario(Number(e.target.value), form.costo_total)} />
                <select className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold" value={form.unidad_medida} onChange={e => setForm({...form, unidad_medida: e.target.value})}>
                  <option value="kg">Kg</option><option value="lts">Lts</option><option value="pz">Piezas</option><option value="gr">Gramos</option>
                </select>
              </div>
              <input type="number" placeholder="Costo de esta compra ($)" className="w-full bg-emerald-50 border-2 border-emerald-100 rounded-2xl p-4 font-bold outline-none" value={form.costo_total === 0 ? '' : form.costo_total} onChange={e => actualizarPrecioUnitario(form.cantidad_actual, Number(e.target.value))} />
              <div className="p-4 bg-slate-100 rounded-2xl flex justify-between items-center"><span className="text-[10px] font-black text-slate-400 uppercase">Costo Unitario:</span><span className="text-xl font-black text-indigo-950">${form.costo_unitario}</span></div>
              <input type="number" placeholder="Stock Mínimo" className="w-full bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={form.stock_minimo === 0 ? '' : form.stock_minimo} onChange={e => setForm({...form, stock_minimo: Number(e.target.value)})} />
            </div>
            <div className="flex gap-4 mt-10">
              <button onClick={cerrarModal} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl uppercase text-[10px]">Cancelar</button>
              <button onClick={guardarInsumo} className="grow bg-orange-600 text-white font-black py-4 rounded-2xl uppercase text-[10px] flex items-center justify-center gap-2 shadow-lg shadow-orange-600/20"><Save size={18}/> Guardar</button>
            </div>
          </div>
        </div>
      )}

      {modalCategorias && (
        <div className="fixed inset-0 bg-indigo-950/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-md rounded-[48px] p-10 shadow-2xl">
            <h2 className="text-2xl font-black text-indigo-950 uppercase italic text-center mb-8">Categorías</h2>
            <div className="flex gap-2 mb-8">
              <input placeholder="Nueva..." className="grow bg-slate-50 border-2 border-slate-100 rounded-2xl p-4 font-bold outline-none" value={nuevaCatNombre} onChange={e => setNuevaCatNombre(e.target.value)} />
              <button onClick={agregarCategoria} className="bg-orange-600 text-white p-4 rounded-2xl"><Plus/></button>
            </div>
            <div className="space-y-2 max-h-60 overflow-y-auto">
              {categorias.map(c => (
                <div key={c.id} className="flex justify-between items-center p-4 bg-slate-50 rounded-2xl border border-slate-100">
                  <span className="font-bold text-indigo-950 uppercase text-xs">{c.nombre}</span>
                  <button onClick={() => eliminarCategoria(c.id)} className="text-slate-300 hover:text-red-500"><Trash2 size={18}/></button>
                </div>
              ))}
            </div>
            <button onClick={() => setModalCategorias(false)} className="w-full mt-8 bg-indigo-950 text-white font-black py-4 rounded-2xl uppercase text-[10px]">Cerrar</button>
          </div>
        </div>
      )}

      {modalMerma && (
        <div className="fixed inset-0 bg-red-900/60 backdrop-blur-md flex items-center justify-center z-50 p-4">
          <div className="bg-white w-full max-w-sm rounded-[48px] p-10 shadow-2xl text-center">
            <h2 className="text-xl font-black text-indigo-950 uppercase mb-2">Merma</h2>
            <p className="text-slate-400 text-xs font-bold uppercase mb-8">{insumoSeleccionado?.nombre}</p>
            <input type="number" className="w-full text-4xl font-black text-center border-b-4 border-red-500 p-6 outline-none mb-8" value={cantidadMerma === 0 ? '' : cantidadMerma} onChange={e => setCantidadMerma(Number(e.target.value))} autoFocus />
            <div className="flex gap-4">
              <button onClick={() => setModalMerma(false)} className="grow bg-slate-100 text-slate-400 font-black py-4 rounded-2xl text-[10px]">CANCELAR</button>
              <button onClick={registrarMerma} className="grow bg-red-600 text-white font-black py-4 rounded-2xl text-[10px]">DESCONTAR</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}