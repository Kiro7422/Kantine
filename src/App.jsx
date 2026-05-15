import React, { useState, useEffect } from 'react';
import { supabase } from './supabase';
import { createClient } from '@supabase/supabase-js';
import {
  ShoppingCart, LogOut, Plus, Camera, Trash2, Edit, TrendingUp, Users, List,
  Clock, Filter, Shield, CheckCircle, User, Menu, X, ChevronRight, Receipt,
  AlertCircle, Info, Star, Tag, ShieldAlert, QrCode, Printer, Image as ImageIcon, Search
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from 'recharts';
import { QRCodeSVG } from 'qrcode.react';

export default function App() {
  // --- KUNDEN-MENÜ LOGIK (QR SCAN) ---
  const queryParams = new URLSearchParams(window.location.search);
  const isCustomerMenu = queryParams.get('view') === 'menu';

  // --- HAUPT-STATES ---
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState(null);
  const [view, setView] = useState(isCustomerMenu ? 'customer-menu' : 'pos');
  const [userRole, setUserRole] = useState('staff'); // superadmin, admin, staff
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);

  // Daten-States
  const [products, setProducts] = useState([]);
  const [cart, setCart] = useState([]);
  const [transactions, setTransactions] = useState([]);
  const [categories, setCategories] = useState([]);
  const [employees, setEmployees] = useState([]);

  // Formular- & Filter-States
  const [newProduct, setNewProduct] = useState({ name: '', price: '', category: '' });
  const [editingProductId, setEditingProductId] = useState(null);
  const [employeeForm, setEmployeeForm] = useState({ email: '', password: '' });
  const [imageFile, setImageFile] = useState(null);
  const [imagePreview, setImagePreview] = useState(null);
  const [filterCat, setFilterCat] = useState('All');
  const [statsMonth, setStatsMonth] = useState(new Date().toISOString().slice(0, 7));

  // UI-States
  const [toasts, setToasts] = useState([]);
  const [deleteConfirm, setDeleteConfirm] = useState({ open: false, id: null, type: null });
  const [checkoutModal, setCheckoutModal] = useState(false);
  const [cashGiven, setCashGiven] = useState('');
  const [selectedTransaction, setSelectedTransaction] = useState(null);
  const [transactionItems, setTransactionItems] = useState([]);

  // --- INITIALISIERUNG ---
  useEffect(() => {
    const init = async () => {
      if (!isCustomerMenu) {
        const { data } = await supabase.auth.getSession();
        if (data.session) {
          setSession(data.session);
          await fetchUserRole(data.session.user.id);
        }
      }
      await refreshAllData();
      // 5 Sek Loading Screen nur beim ersten Start
      setTimeout(() => setIsLoading(false), 800);
    };
    init();

    const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
      setSession(session);
      if (session) fetchUserRole(session.user.id);
    });
    return () => subscription.unsubscribe();
  }, []);

  const refreshAllData = async () => {
    await Promise.all([fetchProducts(), fetchTransactions(), fetchCategories(), fetchEmployees()]);
  };

  const fetchUserRole = async (uid) => {
    const { data } = await supabase.from('employees').select('role').eq('id', uid).single();
    if (data) setUserRole(data.role);
  };

  const fetchProducts = async () => {
    const { data } = await supabase.from('products').select('*, categories(name)').order('times_sold', { ascending: false });
    if (data) setProducts(data);
  };

  const fetchTransactions = async () => {
    const { data } = await supabase.from('transactions').select('*').order('created_at', { ascending: false });
    if (data) setTransactions(data);
  };

  const fetchCategories = async () => {
    const { data } = await supabase.from('categories').select('*').order('name');
    if (data) setCategories(data);
  };

  const fetchEmployees = async () => {
    const { data } = await supabase.from('employees').select('*').order('created_at');
    if (data) setEmployees(data);
  };

  // --- RECHTE-LOGIK ---
  const isSuper = userRole === 'superadmin';
  const isAdm = userRole === 'admin' || userRole === 'superadmin';
  const isStf = userRole === 'staff' || userRole === 'admin' || userRole === 'superadmin';

  // --- UI HELFER ---
  const addToast = (type, text) => {
    const id = Date.now();
    setToasts(p => [...p, { id, type, text }]);
    setTimeout(() => setToasts(p => p.filter(t => t.id !== id)), 3000);
  };

  // --- KASSEN FUNKTIONEN ---
  const addToCart = (p) => {
    setCart(prev => {
      const ex = prev.find(i => i.id === p.id);
      if (ex) return prev.map(i => i.id === p.id ? { ...i, quantity: i.quantity + 1 } : i);
      return [...prev, { ...p, quantity: 1 }];
    });
    addToast('success', `${p.name} hinzugefügt`);
  };

  const handleCheckout = async () => {
    const total = cart.reduce((s, i) => s + (i.price * i.quantity), 0);
    const cash = parseFloat(cashGiven);
    if (isNaN(cash) || cash < total) return addToast('error', 'Geld reicht nicht!');

    const { data: tr, error } = await supabase.from('transactions').insert([{
      cashier_id: session.user.id,
      total_amount: total,
      cash_given: cash,
      change_returned: cash - total
    }]).select().single();

    if (!error) {
      for (const item of cart) {
        await supabase.from('transaction_items').insert([{ transaction_id: tr.id, product_id: item.id, quantity: item.quantity, price_at_time: item.price }]);
        await supabase.from('products').update({ times_sold: (item.times_sold || 0) + item.quantity }).eq('id', item.id);
      }
      addToast('success', 'Verkauf abgeschlossen!');
      setCart([]); setCheckoutModal(false); setCashGiven(''); refreshAllData();
    }
  };

  // --- PRODUKT VERWALTUNG ---
  const handleSaveProduct = async () => {
    if (!newProduct.name || !newProduct.price) return addToast('error', 'Daten unvollständig');
    addToast('info', 'Wird verarbeitet...');

    let imageUrl = newProduct.image_url || null;
    if (imageFile) {
      const fileName = `${Date.now()}_${imageFile.name.replace(/\s/g, '_')}`;
      const { error: upErr } = await supabase.storage.from('product-images').upload(`public/${fileName}`, imageFile);
      if (!upErr) {
        const { data } = supabase.storage.from('product-images').getPublicUrl(`public/${fileName}`);
        imageUrl = data.publicUrl;
      }
    }

    let catId = null;
    if (newProduct.category) {
      const { data: exCat } = await supabase.from('categories').select('id').eq('name', newProduct.category).single();
      if (exCat) catId = exCat.id;
      else {
        const { data: nC } = await supabase.from('categories').insert([{ name: newProduct.category }]).select().single();
        if (nC) catId = nC.id;
      }
    }

    const payload = { name: newProduct.name, price: parseFloat(newProduct.price), image_url: imageUrl, category_id: catId };
    const { error } = editingProductId
      ? await supabase.from('products').update(payload).eq('id', editingProductId)
      : await supabase.from('products').insert([payload]);

    if (!error) {
      addToast('success', 'Gespeichert!');
      setNewProduct({ name: '', price: '', category: '' }); setEditingProductId(null); setImagePreview(null); setImageFile(null);
      refreshAllData();
    }
  };

  // --- LÖSCH LOGIK ---
  const confirmDeletion = async () => {
    const { id, type } = deleteConfirm;
    let err;
    if (type === 'product') err = (await supabase.from('products').delete().eq('id', id)).error;
    if (type === 'transaction') err = (await supabase.from('transactions').delete().eq('id', id)).error;
    if (type === 'employee') err = (await supabase.from('employees').delete().eq('id', id)).error;

    if (!err) { addToast('success', 'Gelöscht'); refreshAllData(); if (type === 'transaction') setSelectedTransaction(null); }
    else addToast('error', 'Löschen gesperrt (Daten werden noch genutzt)');
    setDeleteConfirm({ open: false, id: null, type: null });
  };

  // --- PERSONAL ---
  const handleCreateEmployee = async (e) => {
    e.preventDefault();
    if (!isSuper) return;
    const tempSupabase = createClient(import.meta.env.VITE_SUPABASE_URL, import.meta.env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false } });
    const { data, error } = await tempSupabase.auth.signUp({ email: employeeForm.email, password: employeeForm.password });
    if (!error && data.user) {
      await supabase.from('employees').insert([{ id: data.user.id, email: employeeForm.email, role: 'staff' }]);
      addToast('success', 'Mitarbeiter angelegt!');
      setEmployeeForm({ email: '', password: '' }); fetchEmployees();
    } else addToast('error', error.message);
  };

  // --- STATISTIK BERECHNUNG ---
  const filteredTr = transactions.filter(t => t.created_at?.startsWith(statsMonth));
  const monthTotal = filteredTr.reduce((s, t) => s + (t.total_amount || 0), 0);
  const top5 = [...products].sort((a, b) => b.times_sold - a.times_sold).slice(0, 5);
  const chartData = Array.from({ length: 31 }, (_, i) => {
    const d = String(i + 1).padStart(2, '0');
    const val = filteredTr.filter(t => t.created_at?.includes(`-${d}T`)).reduce((s, t) => s + (t.total_amount || 0), 0);
    return { name: d, Umsatz: val };
  });

  // --- RENDERING ---
  if (isLoading) return <LoadingScreen />;

  // SPEZIAL-ANSICHT: QR-MENÜ FÜR KUNDEN
  if (view === 'customer-menu') {
    return (
      <div className="min-h-screen bg-white font-sans p-6 text-center">
        <img src="/kantineapplogo.png" className="w-24 h-24 mx-auto mb-6" />
        <h1 className="text-3xl font-black text-primary uppercase tracking-tighter mb-10 italic">Speisekarte</h1>
        <div className="grid grid-cols-1 gap-4 max-w-xl mx-auto">
          {products.map(p => (
            <div key={p.id} className="flex items-center gap-4 p-4 bg-gray-50 rounded-[2.5rem] border shadow-sm text-left">
              <div className="w-20 h-20 rounded-3xl bg-white overflow-hidden border flex-shrink-0">
                {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="w-full h-full p-6 text-gray-200" />}
              </div>
              <div>
                <h3 className="font-bold text-gray-800 text-sm uppercase">{p.name}</h3>
                <p className="text-primary font-black text-xl">{p.price.toFixed(2)} €</p>
                {p.categories?.name && <span className="text-[8px] bg-white px-2 py-0.5 rounded-full text-gray-400 font-black border uppercase tracking-widest">{p.categories.name}</span>}
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  if (!session) return <LoginScreen setSession={setSession} addToast={addToast} />;

  return (
    <div className="flex h-screen bg-gray-100 overflow-hidden select-none font-sans">

      {/* TOAST SYSTEM */}
      <div className="fixed top-6 right-6 z-[100] space-y-3 pointer-events-none">
        {toasts.map(t => (
          <div key={t.id} className={`px-6 py-4 rounded-2xl shadow-2xl flex items-center gap-3 animate-slide-left pointer-events-auto border-l-8 bg-white ${t.type === 'success' ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}`}>
            {t.type === 'success' ? <CheckCircle size={18} /> : <AlertCircle size={18} />}
            <span className="font-black uppercase text-[10px] tracking-widest">{t.text}</span>
          </div>
        ))}
      </div>

      {/* SIDEBAR (SUPER-KOMPAKT GEGEN SCROLLEN) */}
      <div className={`fixed inset-y-0 left-0 transform ${isSidebarOpen ? "translate-x-0" : "-translate-x-full"} md:relative md:translate-x-0 transition duration-300 ease-in-out z-30 w-52 bg-primary text-white flex flex-col no-print`}>
        <div className="p-4 border-b border-blue-800 flex flex-col items-center gap-2">
          <img src="/kantineapplogo.png" className="w-12 h-12 object-contain drop-shadow-xl" />
          <span className="font-black text-[9px] uppercase text-center leading-tight tracking-widest">Kantine der Hl.Maria & Hl.Philopater</span>
        </div>
        <nav className="flex-1 p-2 space-y-1 mt-2">
          <NavItem active={view === 'pos'} onClick={() => setView('pos')} icon={<ShoppingCart />} label="Kasse" />
          {isStf && <NavItem active={view === 'products'} onClick={() => setView('products')} icon={<List />} label="Bestand" />}
          {isAdm && <NavItem active={view === 'statistik'} onClick={() => setView('statistik')} icon={<TrendingUp />} label="Statistik" />}
          {isStf && <NavItem active={view === 'qr'} onClick={() => setView('qr')} icon={<QrCode />} label="QR-Code" />}
          {isSuper && <NavItem active={view === 'admin'} onClick={() => setView('admin')} icon={<ShieldAlert />} label="Personal" />}
        </nav>
        <button onClick={() => supabase.auth.signOut()} className="m-4 p-3 rounded-xl bg-red-500/10 text-red-400 font-bold flex items-center gap-3 hover:bg-red-500 hover:text-white transition-all uppercase text-[9px] tracking-widest">
          <LogOut size={14} /> Abmelden
        </button>
      </div>

      <div className="flex-1 flex flex-col min-w-0">
        <header className="bg-white p-3 border-b flex justify-between items-center px-6 shadow-sm no-print">
          <button onClick={() => setIsSidebarOpen(true)} className="md:hidden p-2 bg-gray-100 rounded-xl"><Menu /></button>
          <div className="flex items-center gap-3 font-black text-[9px] text-gray-400 uppercase tracking-widest">
            <User size={12} className="text-primary" /> {session.user.email}
            <span className="bg-secondary/20 text-primary px-3 py-1 rounded-full text-[8px] font-black">{userRole}</span>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8 no-print">

          {/* POS (KASSE) */}
          {view === 'pos' && (
            <div className="h-full flex flex-col md:flex-row gap-8">
              <div className="flex-1 flex flex-col overflow-hidden">
                <h2 className="text-2xl font-black mb-6 uppercase tracking-tighter italic">Speisekarte</h2>
                <div className="flex gap-2 overflow-x-auto pb-4 mb-4 no-scrollbar">
                  <button onClick={() => setFilterCat('All')} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase shadow-sm transition-all ${filterCat === 'All' ? 'bg-primary text-white' : 'bg-white text-gray-400 border'}`}>Alle</button>
                  {categories.map(c => (
                    <button key={c.id} onClick={() => setFilterCat(c.name)} className={`px-5 py-2 rounded-full font-black text-[10px] uppercase shadow-sm transition-all ${filterCat === c.name ? 'bg-primary text-white' : 'bg-white text-gray-400 border'}`}>{c.name}</button>
                  ))}
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 overflow-y-auto pr-2">
                  {products.filter(p => filterCat === 'All' || p.categories?.name === filterCat).map(p => (
                    <button key={p.id} onClick={() => addToCart(p)} className="bg-white p-4 rounded-[2rem] shadow-sm border-2 border-transparent hover:border-secondary hover:shadow-xl transition-all active:scale-95 flex flex-col items-center">
                      <div className="w-full aspect-square bg-gray-50 rounded-3xl overflow-hidden mb-3 flex items-center justify-center border">
                        {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon className="text-gray-200" size={24} />}
                      </div>
                      <span className="font-bold text-gray-800 text-[10px] text-center line-clamp-1 uppercase">{p.name}</span>
                      <span className="text-primary font-black text-sm">{p.price.toFixed(2)} €</span>
                    </button>
                  ))}
                </div>
              </div>
              <div className="w-full md:w-80 bg-white rounded-[3rem] shadow-xl p-6 flex flex-col border">
                <h3 className="font-black text-lg mb-6 flex items-center gap-2 text-primary uppercase"><ShoppingCart size={20} /> Korb</h3>
                <div className="flex-1 overflow-y-auto space-y-3 mb-6 pr-1">
                  {cart.length === 0 ? <div className="h-full flex flex-col items-center justify-center opacity-10"><ShoppingCart size={48} /><p className="font-black uppercase text-[10px] mt-2">Leer</p></div> :
                    cart.map(item => (
                      <div key={item.id} className="bg-gray-50 p-3 rounded-2xl flex justify-between items-center border">
                        <div className="min-w-0 pr-1"><p className="font-black text-[10px] truncate uppercase">{item.name}</p><p className="text-primary font-bold text-[10px]">{(item.price * item.quantity).toFixed(2)} €</p></div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setCart(cart.map(i => i.id === item.id ? { ...i, quantity: Math.max(1, i.quantity - 1) } : i))} className="w-7 h-7 rounded-lg bg-white shadow-sm border font-black">-</button>
                          <span className="font-black text-xs">{item.quantity}</span>
                          <button onClick={() => addToCart(item)} className="w-7 h-7 rounded-lg bg-white shadow-sm border font-black">+</button>
                          <button onClick={() => setCart(cart.filter(i => i.id !== item.id))} className="text-red-400 ml-1"><Trash2 size={14} /></button>
                        </div>
                      </div>
                    ))}
                </div>
                <div className="border-t pt-4">
                  <div className="flex justify-between text-2xl font-black mb-6 text-primary italic"><span>Total</span><span>{cart.reduce((s, i) => s + (i.price * i.quantity), 0).toFixed(2)} €</span></div>
                  <button onClick={() => setCheckoutModal(true)} disabled={cart.length === 0} className="w-full bg-secondary text-primary py-5 rounded-2xl font-black shadow-lg uppercase text-[10px] tracking-widest active:scale-95 transition-all">Bezahlen</button>
                </div>
              </div>
            </div>
          )}

          {/* BESTAND (PRODUKTE) */}
          {view === 'products' && isStf && (
            <div className="max-w-4xl mx-auto space-y-10">
              <div className={`p-8 rounded-[3rem] shadow-xl border-4 ${editingProductId ? 'bg-yellow-50 border-yellow-400' : 'bg-white border-transparent'}`}>
                <h2 className="text-2xl font-black mb-8 uppercase tracking-tighter flex items-center gap-3">
                  {editingProductId ? <Edit className="text-yellow-600" /> : <Plus className="text-primary" />} {editingProductId ? 'Produkt bearbeiten' : 'Neues Produkt'}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 items-start">
                  <div className="space-y-4">
                    <Input value={newProduct.name} onChange={e => setNewProduct({ ...newProduct, name: e.target.value })} placeholder="Produktname" />
                    <Input type="number" value={newProduct.price} onChange={e => setNewProduct({ ...newProduct, price: e.target.value })} placeholder="Preis" />
                    <div className="relative">
                      <input list="cat-options" value={newProduct.category} onChange={e => setNewProduct({ ...newProduct, category: e.target.value })} placeholder="Kategorie wählen/tippen" className="w-full p-4 rounded-2xl bg-gray-50 border-none font-bold text-xs outline-none focus:ring-4 focus:ring-primary/5" />
                      <datalist id="cat-options">{categories.map(c => <option key={c.id} value={c.name} />)}</datalist>
                    </div>
                  </div>
                  <div className="space-y-4">
                    <label className="group relative flex flex-col items-center justify-center h-44 border-4 border-dashed border-gray-100 rounded-[2.5rem] cursor-pointer hover:border-primary transition-all overflow-hidden bg-gray-50">
                      {imagePreview || newProduct.image_url ? (
                        <img src={imagePreview || newProduct.image_url} className="w-full h-full object-cover" />
                      ) : (
                        <div className="text-center text-gray-300"><Camera size={32} className="mx-auto mb-2" /><span className="text-[8px] font-black uppercase">Foto hochladen/aufnehmen</span></div>
                      )}
                      <input type="file" accept="image/*" capture="environment" onChange={e => {
                        if (e.target.files[0]) { setImageFile(e.target.files[0]); setImagePreview(URL.createObjectURL(e.target.files[0])); }
                      }} className="hidden" />
                    </label>
                    {(imagePreview || newProduct.image_url) && <button onClick={() => { setImagePreview(null); setImageFile(null); setNewProduct({ ...newProduct, image_url: null }) }} className="w-full text-red-400 font-bold text-[8px] uppercase">Bild entfernen</button>}
                  </div>
                  <button onClick={handleSaveProduct} className={`py-6 rounded-3xl font-black text-white shadow-xl ${editingProductId ? 'bg-yellow-500' : 'bg-primary'} col-span-1 md:col-span-2 uppercase text-[10px] tracking-widest`}>SPEICHERN</button>
                  {editingProductId && <button onClick={() => { setEditingProductId(null); setNewProduct({ name: '', price: '', category: '' }); setImagePreview(null); }} className="col-span-1 md:col-span-2 text-gray-400 font-bold text-[8px] uppercase">Abbrechen</button>}
                </div>
              </div>

              <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border">
                <div className="p-6 bg-gray-50 font-black text-[10px] text-gray-400 uppercase tracking-widest border-b flex justify-between">
                  Bestandliste
                  <select value={filterCat} onChange={e => setFilterCat(e.target.value)} className="bg-white border rounded p-1 outline-none text-[8px]">
                    <option value="All">Alle Kategorien</option>
                    {categories.map(c => <option key={c.id} value={c.name}>{c.name}</option>)}
                  </select>
                </div>
                <div className="divide-y max-h-[600px] overflow-y-auto">
                  {products.filter(p => filterCat === 'All' || p.categories?.name === filterCat).map(p => (
                    <div key={p.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-all">
                      <div className="flex items-center gap-6">
                        <div className="w-16 h-16 rounded-2xl bg-gray-100 overflow-hidden border shadow-inner flex-shrink-0">
                          {p.image_url ? <img src={p.image_url} className="w-full h-full object-cover" /> : <ImageIcon size={20} className="text-gray-300 mx-auto mt-5" />}
                        </div>
                        <div>
                          <p className="font-black text-gray-800 text-sm uppercase">{p.name}</p>
                          <p className="text-primary font-black text-xs">{p.price.toFixed(2)} €</p>
                          <span className="text-[8px] text-gray-400 font-bold uppercase">{p.categories?.name || 'Keine Kat.'}</span>
                        </div>
                      </div>
                      <div className="flex gap-3">
                        <button onClick={() => { setNewProduct({ name: p.name, price: p.price, category: p.categories?.name || '', image_url: p.image_url }); setEditingProductId(p.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }} className="p-3 bg-blue-50 text-blue-600 rounded-xl active:scale-90 transition-all"><Edit size={18} /></button>
                        {isStf && <button onClick={() => setDeleteConfirm({ open: true, id: p.id, type: 'product' })} className="p-3 bg-red-50 text-red-600 rounded-xl active:scale-90 transition-all"><Trash2 size={18} /></button>}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* STATISTIK */}
          {view === 'statistik' && isAdm && (
            <div className="space-y-8 pb-10">
              <div className="flex flex-col md:flex-row justify-between items-center bg-white p-6 rounded-3xl shadow-sm gap-4">
                <h2 className="text-2xl font-black uppercase tracking-tighter">Auswertung</h2>
                <input type="month" value={statsMonth} onChange={e => setStatsMonth(e.target.value)} className="p-3 bg-gray-100 rounded-xl font-black text-primary border-none outline-none font-bold" />
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                <StatCard label="Umsatz Monat" value={`${monthTotal.toFixed(2)} €`} color="bg-primary text-white" />
                <div className="bg-white p-8 rounded-[3rem] shadow-sm border"><p className="text-[10px] uppercase font-black text-gray-400 mb-1">Verkäufe</p><h2 className="text-4xl font-black">{filteredTr.length}</h2></div>
                <div className="bg-secondary p-8 rounded-[3rem] text-primary shadow-xl"><p className="text-[10px] uppercase font-black opacity-60">Top Produkt</p><h2 className="text-xl font-black truncate uppercase">{products[0]?.name || '-'}</h2></div>
              </div>

              <div className="bg-white p-8 rounded-[3.5rem] shadow-xl border h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={chartData}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f3f4f6" />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fontWeight: 900 }} axisLine={false} />
                    <YAxis hide />
                    <Tooltip contentStyle={{ borderRadius: '1.5rem', border: 'none', fontWeight: 900 }} />
                    <Line type="monotone" dataKey="Umsatz" stroke="#1e3a8a" strokeWidth={5} dot={{ r: 3 }} activeDot={{ r: 6 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="bg-white rounded-[3rem] shadow-xl p-8 border">
                  <h3 className="font-black text-[10px] uppercase tracking-widest text-gray-400 mb-6">Top 5 Renner</h3>
                  <div className="space-y-4">
                    {top5.map((p, i) => (
                      <div key={p.id} className="flex justify-between items-center">
                        <span className="font-black text-gray-500 text-xs">{i + 1}. {p.name}</span>
                        <span className="font-black text-primary text-xs">{p.times_sold}x</span>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="lg:col-span-2 bg-white rounded-[3rem] shadow-xl overflow-hidden border">
                  <div className="p-6 bg-gray-50 font-black text-[10px] text-gray-400 uppercase tracking-widest border-b">Verlauf {statsMonth}</div>
                  <div className="divide-y max-h-[400px] overflow-y-auto">
                    {filteredTr.map(t => (
                      <div key={t.id} onClick={async () => {
                        setSelectedTransaction(t);
                        const { data } = await supabase.from('transaction_items').select('quantity, price_at_time, products(name)').eq('transaction_id', t.id);
                        if (data) setTransactionItems(data);
                      }} className="p-6 flex justify-between items-center hover:bg-gray-50 cursor-pointer">
                        <div><p className="text-xl font-black text-gray-800">{t.total_amount.toFixed(2)} €</p><p className="text-[8px] font-black text-gray-400 uppercase tracking-widest">{new Date(t.created_at).toLocaleString('de-DE')}</p></div>
                        <div className="flex gap-4 items-center">
                          {isSuper && <button onClick={(e) => { e.stopPropagation(); setDeleteConfirm({ open: true, id: t.id, type: 'transaction' }) }} className="p-3 bg-red-50 text-red-600 rounded-xl"><Trash2 size={16} /></button>}
                          <ChevronRight size={18} className="text-gray-300" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* QR-CODE GENERATOR */}
          {view === 'qr' && isStf && (
            <div className="max-w-xl mx-auto text-center no-print">
              <div className="bg-white p-12 rounded-[4rem] shadow-2xl flex flex-col items-center border">
                <QrCode size={48} className="text-primary mb-6" />
                <h2 className="text-3xl font-black uppercase tracking-tighter italic mb-10 text-gray-800">Kunden-Menü QR</h2>
                <div className="p-8 bg-white border-[12px] border-primary rounded-[4rem] shadow-2xl mb-12">
                  <QRCodeSVG value={`${window.location.origin}?view=menu`} size={250} includeMargin={true} />
                </div>
                <button onClick={() => window.print()} className="flex items-center gap-3 bg-primary text-white px-12 py-6 rounded-3xl font-black uppercase text-[10px] shadow-2xl hover:scale-105 active:scale-95 transition-all"><Printer size={20} /> QR-Code & Poster drucken</button>
              </div>
            </div>
          )}

          {/* PERSONAL VERWALTUNG (NUR SUPERADMIN) */}
          {view === 'admin' && isSuper && (
            <div className="max-w-4xl mx-auto space-y-10">
              <div className="bg-white p-10 rounded-[4rem] shadow-xl border flex flex-col md:flex-row gap-10 items-center">
                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-3xl font-black uppercase tracking-tighter text-primary italic">Personal-Zentrale</h2>
                  <p className="text-gray-400 text-[10px] uppercase font-bold mt-2">Zugänge für Mitarbeiter anlegen.</p>
                </div>
                <form onSubmit={handleCreateEmployee} className="w-full md:w-80 space-y-3">
                  <Input value={employeeForm.email} onChange={e => setEmployeeForm({ ...employeeForm, email: e.target.value })} placeholder="Email (z.B. kasse2@kirche.de)" />
                  <Input type="password" value={employeeForm.password} onChange={e => setEmployeeForm({ ...employeeForm, password: e.target.value })} placeholder="Sicheres Passwort" />
                  <button type="submit" className="w-full bg-primary text-white py-4 rounded-2xl font-black text-[10px] tracking-widest uppercase shadow-xl hover:-translate-y-1 transition-all">Erstellen</button>
                </form>
              </div>
              <div className="bg-white rounded-[3rem] shadow-xl overflow-hidden border">
                <div className="divide-y">
                  {employees.map(emp => (
                    <div key={emp.id} className="p-6 flex items-center justify-between hover:bg-gray-50 transition-all">
                      <div className="flex items-center gap-6">
                        <div className={`w-14 h-14 rounded-full flex items-center justify-center font-black ${emp.role === 'superadmin' ? 'bg-black text-white' : emp.role === 'admin' ? 'bg-secondary text-primary' : 'bg-gray-100 text-gray-500'}`}><Shield size={20} /></div>
                        <div><p className="font-black text-gray-800 text-sm">{emp.email}</p><p className="text-[10px] font-black uppercase tracking-widest text-primary">{emp.role}</p></div>
                      </div>
                      <div className="flex gap-4 items-center">
                        {emp.email !== session.user.email && (
                          <>
                            <select value={emp.role} onChange={async (e) => {
                              const nr = e.target.value;
                              await supabase.from('employees').update({ role: nr }).eq('id', emp.id);
                              fetchEmployees(); addToast('success', 'Rolle geändert');
                            }} className="bg-gray-100 border-none text-[10px] font-black uppercase rounded-xl p-3 outline-none focus:ring-4 focus:ring-primary/10">
                              <option value="staff">Staff</option>
                              <option value="admin">Admin</option>
                              <option value="superadmin">Superadmin</option>
                            </select>
                            <button onClick={() => setDeleteConfirm({ open: true, id: emp.id, type: 'employee' })} className="p-4 bg-red-50 text-red-600 rounded-2xl active:scale-90 transition-all"><Trash2 size={20} /></button>
                          </>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

        </main>
      </div>

      {/* --- PRINT AREA (VERBESSERT FÜR VOLLBILD-DRUCK) --- */}
      <div className="hidden print:flex fixed inset-0 bg-white z-[999] flex-col items-center justify-center text-center p-0 m-0">
        {selectedTransaction ? (
          /* Bereich für Kassenbon (schmal) */
          <div className="w-[80mm] mx-auto p-4 text-black font-mono">
            <h1 className="text-xl font-black mb-2 uppercase">Kirchen-Kantine</h1>
            <p className="text-xs italic mb-4">Hl. Maria & Philopater</p>
            <div className="border-t border-b border-black py-2 mb-4 text-[10px] text-left">
              <p>Datum: {new Date(selectedTransaction.created_at).toLocaleDateString('de-DE')}</p>
              <p>Zeit: {new Date(selectedTransaction.created_at).toLocaleTimeString('de-DE')}</p>
              <p>Bon-ID: {selectedTransaction.id.slice(0, 8)}</p>
            </div>
            <div className="mb-4 text-[10px] text-left">
              {transactionItems.map((item, i) => (
                <div key={i} className="flex justify-between">
                  <span>{item.quantity}x {item.products?.name}</span>
                  <span>{(item.quantity * item.price_at_time).toFixed(2)}€</span>
                </div>
              ))}
            </div>
            <div className="border-t-2 border-black pt-2 font-black flex justify-between text-lg">
              <span>GESAMT</span>
              <span>{selectedTransaction.total_amount.toFixed(2)}€</span>
            </div>
            <div className="mt-4 text-[8px] flex justify-between italic">
              <span>Gegeben: {selectedTransaction.cash_given.toFixed(2)}€</span>
              <span>Rückgeld: {selectedTransaction.change_returned.toFixed(2)}€</span>
            </div>
            <p className="mt-10 text-[10px] font-bold uppercase tracking-widest">Vielen Dank für Ihren Besuch!</p>
          </div>
        ) : (
          /* Bereich für das Speisekarten-Poster (A4) */
          <div className="w-full h-full flex flex-col items-center justify-center p-20 bg-white text-black">
            <img src="/kantineapplogo.png" className="w-40 h-40 mb-10 object-contain" />
            <h1 className="text-6xl font-black uppercase mb-4 tracking-tighter text-primary">اعمل اسكان للكود و شوف</h1>

            <div className="border-[20px] border-primary p-12 rounded-[5rem] shadow-none">
              <QRCodeSVG
                value={`${window.location.origin}?view=menu`}
                size={500}
                level="H"
              />
            </div>


          </div>
        )}
      </div>

      {/* --- MODALS --- */}
      {deleteConfirm.open && (
        <div className="fixed inset-0 bg-primary/95 backdrop-blur-3xl flex items-center justify-center p-6 z-[200] no-print">
          <div className="bg-white rounded-[4rem] p-12 max-w-sm w-full text-center shadow-2xl animate-scale-in">
            <AlertCircle size={54} className="mx-auto mb-6 text-red-500 animate-pulse" />
            <h2 className="text-3xl font-black mb-4 uppercase tracking-tighter text-gray-800">Löschen?</h2>
            <p className="text-gray-400 font-bold text-[10px] mb-10 uppercase tracking-widest">Dies kann nicht rückgängig gemacht werden!</p>
            <div className="flex flex-col gap-4">
              <button onClick={confirmDeletion} className="w-full bg-red-600 text-white py-6 rounded-3xl font-black shadow-2xl shadow-red-200 active:scale-95 transition-all uppercase text-[10px] tracking-widest">JA, LÖSCHEN</button>
              <button onClick={() => setDeleteConfirm({ open: false })} className="w-full py-4 text-gray-400 font-black uppercase text-[10px]">Abbrechen</button>
            </div>
          </div>
        </div>
      )}

      {checkoutModal && (
        <div className="fixed inset-0 bg-primary/95 backdrop-blur-3xl flex items-end md:items-center justify-center p-0 md:p-4 z-50 no-print">
          <div className="bg-white rounded-t-[5rem] md:rounded-[5rem] p-12 w-full max-w-sm shadow-2xl animate-slide-up">
            <h2 className="text-3xl font-black text-primary mb-10 tracking-tighter uppercase text-center italic">Zahlung: {(cart.reduce((s, i) => s + (i.price * i.quantity), 0)).toFixed(2)} €</h2>
            <input type="number" value={cashGiven} onChange={e => setCashGiven(e.target.value)} placeholder="0.00" className="w-full p-10 bg-gray-100 rounded-[2.5rem] text-6xl font-black mb-8 text-center outline-none focus:ring-8 focus:ring-primary/5 transition-all" autoFocus />
            {parseFloat(cashGiven) >= cart.reduce((s, i) => s + (i.price * i.quantity), 0) && (
              <div className="bg-green-600 text-white p-8 rounded-[3rem] text-center mb-10 shadow-2xl font-black text-5xl animate-bounce-short">{(parseFloat(cashGiven) - cart.reduce((s, i) => s + (i.price * i.quantity), 0)).toFixed(2)} €</div>
            )}
            <div className="flex gap-6">
              <button onClick={() => setCheckoutModal(false)} className="flex-1 py-4 font-black text-gray-400 uppercase text-[10px]">Abbruch</button>
              <button onClick={handleCheckout} disabled={!cashGiven || parseFloat(cashGiven) < cart.reduce((s, i) => s + (i.price * i.quantity), 0)} className="flex-[2] bg-primary text-white py-6 px-8 rounded-3xl font-black shadow-xl uppercase text-xs">FERTIG</button>
            </div>
          </div>
        </div>
      )}

      {selectedTransaction && (
        <div className="fixed inset-0 bg-primary/95 backdrop-blur-3xl flex items-center justify-center p-6 z-50 no-print">
          <div className="bg-white rounded-[4rem] p-10 w-full max-w-md shadow-2xl animate-scale-in">
            <div className="flex items-center justify-between mb-8 border-b pb-6 border-gray-100">
              <h2 className="text-2xl font-black uppercase text-primary tracking-tighter flex items-center gap-3"><Receipt size={28} /> Kassenbon</h2>
              <button onClick={() => setSelectedTransaction(null)} className="p-4 bg-gray-100 rounded-full text-gray-400 hover:text-gray-800 transition-all"><X size={20} /></button>
            </div>
            <div className="space-y-4 mb-10 max-h-52 overflow-y-auto pr-2">
              {transactionItems.map((item, i) => (
                <div key={i} className="flex justify-between font-black text-gray-700 text-xs uppercase tracking-tight"><span>{item.quantity}x {item.products?.name}</span><span>{(item.quantity * item.price_at_time).toFixed(2)} €</span></div>
              ))}
            </div>
            <div className="space-y-2 text-[10px] font-black text-gray-400 uppercase tracking-widest pt-6 border-t-4 border-double">
              <div className="flex justify-between"><span>Gegeben</span><span>{selectedTransaction.cash_given.toFixed(2)} €</span></div>
              <div className="flex justify-between"><span>Rückgeld</span><span>{selectedTransaction.change_returned.toFixed(2)} €</span></div>
              <div className="flex justify-between text-4xl font-black text-gray-800 mt-4"><span>TOTAL</span><span>{selectedTransaction.total_amount.toFixed(2)} €</span></div>
            </div>
            <div className="grid grid-cols-2 gap-4 mt-10">
              <button onClick={() => window.print()} className="bg-gray-100 py-5 rounded-3xl font-black uppercase text-[10px] text-gray-500 hover:bg-gray-200 transition-all flex items-center justify-center gap-2"><Printer size={18} /> Bon drucken</button>
              <button onClick={() => setSelectedTransaction(null)} className="bg-primary text-white py-5 rounded-3xl font-black uppercase text-[10px] tracking-widest shadow-xl">Schließen</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// HILFSKOMPONENTEN
const LoadingScreen = () => (
  <div className="min-h-screen bg-primary flex flex-col items-center justify-center text-white p-4 relative overflow-hidden">
    <div className="absolute top-[-10%] left-[-10%] w-96 h-96 bg-blue-800 rounded-full blur-[120px] opacity-30"></div>
    <div className="animate-bounce mb-8 relative z-10"><img src="/kantineapplogo.png" className="w-40 h-40 object-contain drop-shadow-[0_20px_50px_rgba(255,255,255,0.3)]" /></div>
    <h1 className="text-3xl md:text-5xl font-black text-center animate-pulse uppercase tracking-[0.1em] italic leading-tight relative z-10">Kantine der<br /> <span className="text-secondary">Hl. Maria & Philopater</span></h1>
    <p className="mt-10 font-black text-[10px] uppercase tracking-[0.5em] text-blue-300 animate-pulse">Wird vorbereitet...</p>
  </div>
);

const NavItem = ({ active, onClick, icon, label, closeSidebar }) => (
  <button
    onClick={() => {
      onClick();
      closeSidebar?.();
    }}
    className={`w-full flex items-center gap-5 p-4 rounded-2xl transition-all duration-300 ${active
      ? 'bg-blue-800 text-secondary shadow-xl translate-x-2'
      : 'hover:bg-blue-800/30 text-blue-300'
      }`}
  >
    {React.cloneElement(icon, { size: 20, strokeWidth: 3 })}
    <span className="font-black text-[10px] uppercase tracking-widest">
      {label}
    </span>
  </button>
);

const Input = (props) => (
  <input {...props} className="w-full p-5 rounded-2xl bg-gray-50 border-none outline-none focus:ring-8 focus:ring-primary/5 font-black text-xs transition-all placeholder:text-gray-300" />
);

const StatCard = ({ label, value, color }) => (
  <div className={`${color} p-10 rounded-[3.5rem] shadow-2xl`}><p className="text-[10px] uppercase font-black opacity-60 mb-2 tracking-widest">{label}</p><h2 className="text-5xl font-black tracking-tighter">{value}</h2></div>
);

function LoginScreen({ setSession, addToast }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const handleLogin = async (e) => {
    e.preventDefault(); setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) { addToast('error', 'Login fehlgeschlagen'); } else { addToast('success', 'Hi!'); }
    setLoading(false);
  };
  return (
    <div className="min-h-screen bg-primary flex items-center justify-center p-4 relative overflow-hidden">
      <div className="absolute top-[-20%] left-[-20%] w-[600px] h-[600px] bg-blue-800 rounded-full blur-[150px] opacity-40"></div>
      <div className="bg-white p-16 rounded-[4.5rem] shadow-2xl w-full max-w-md relative z-10 text-center">
        <img src="/kantineapplogo.png" className="w-24 h-24 mx-auto mb-10 drop-shadow-2xl" />
        <h2 className="text-3xl font-black text-primary uppercase tracking-tighter mb-12">Kantine Login</h2>
        <form onSubmit={handleLogin} className="space-y-6">
          <input value={email} onChange={e => setEmail(e.target.value)} type="email" placeholder="EMAIL" className="w-full p-7 bg-gray-100 rounded-[2rem] border-none font-black text-[10px] tracking-widest outline-none focus:ring-8 focus:ring-primary/5" required />
          <input value={password} onChange={e => setPassword(e.target.value)} type="password" placeholder="PASSWORT" className="w-full p-7 bg-gray-100 rounded-[2rem] border-none font-black text-[10px] tracking-widest outline-none focus:ring-8 focus:ring-primary/5" required />
          <button type="submit" disabled={loading} className="w-full bg-primary text-white py-8 rounded-[2.5rem] font-black text-[10px] uppercase tracking-widest shadow-2xl hover:scale-[1.03] transition-all">Einloggen</button>
        </form>
      </div>
    </div>
  );
}