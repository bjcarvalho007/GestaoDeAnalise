/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect, useMemo } from 'react';
import { 
  LayoutDashboard, 
  Zap, 
  Target, 
  Calculator, 
  Printer, 
  Calendar, 
  BarChart2, 
  Layers, 
  Activity, 
  CalendarCheck, 
  Settings2, 
  ArrowRightLeft, 
  Menu, 
  X, 
  Check, 
  AlertTriangle, 
  Circle
} from 'lucide-react';
import { 
  BarChart, 
  Bar, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ResponsiveContainer, 
  CartesianGrid, 
  Legend 
} from 'recharts';
import { motion, AnimatePresence } from 'motion/react';

// --- Types ---
type Environment = 'recebimento' | 'separacao';

interface DayData {
  id: string;
  dia: string;
  pecas: number;
  conferentes: number;
  auxiliares: number;
  jornada: number;
}

interface Metas {
  CONFERENTE: number;
  AUXILIAR: number;
  VOLUME: number;
  JORNADA: number;
}

// --- Utils ---
const generateWeeklyStructure = (): DayData[] => {
  const dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return dias.map((dia, index) => ({
    id: `fixo-${index}`,
    dia: dia,
    pecas: 0,
    conferentes: 0,
    auxiliares: 0,
    jornada: 9,
  }));
};

const calculateProdReal = (pecas: number, qtdPessoas: number, jornada: number) => {
  if (!qtdPessoas || !jornada || !pecas) return 0;
  return Math.round(pecas / qtdPessoas / jornada);
};

const calculateSugerido = (pecas: number, jornada: number, meta: number) => {
  if (!pecas || !jornada || !meta) return 0;
  // Usamos floor para sugerir a quantidade de pessoas que mantém a produtividade ACIMA da meta
  return Math.max(1, Math.floor(pecas / (jornada * meta)));
};

export default function App() {
  // --- States ---
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [metas, setMetas] = useState<Metas>(() => ({ CONFERENTE: 220, AUXILIAR: 110, VOLUME: 6000, JORNADA: 9 }));

  const [data, setData] = useState<{ atual: DayData[] }>(() => ({ atual: generateWeeklyStructure() }));

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());

  const [calcData, setCalcData] = useState({ 
    pecas: 6000, 
    jornada: 9,
    metaConf: 220,
    metaAux: 110,
    conf: 4,
    aux: 7
  });
  const [filterMode, setFilterMode] = useState<'todos' | 'ok' | 'pendente'>('todos');
  const [dashboardDateFilter, setDashboardDateFilter] = useState<'semana' | 'mes' | string>('semana');

  // --- Effects ---
  useEffect(() => {
    if (!selectedEnv) return;

    const defaultMetas = { CONFERENTE: 220, AUXILIAR: 110, VOLUME: 6000, JORNADA: 9 };
    const metasKey = `logistics_${selectedEnv}_metas_v4`;
    const dataKey = `logistics_${selectedEnv}_data_v4`;

    // Migration from old keys to 'recebimento' if it's the first time
    if (selectedEnv === 'recebimento') {
      const oldMetas = localStorage.getItem('logistics_metas_v3');
      const oldData = localStorage.getItem('logistics_data_v3');
      if (oldMetas && !localStorage.getItem(metasKey)) localStorage.setItem(metasKey, oldMetas);
      if (oldData && !localStorage.getItem(dataKey)) localStorage.setItem(dataKey, oldData);
    }

    const savedMetas = localStorage.getItem(metasKey);
    const savedData = localStorage.getItem(dataKey);

    if (savedMetas) {
      try { setMetas({ ...defaultMetas, ...JSON.parse(savedMetas) }); } catch (e) { console.error(e); }
    } else {
      setMetas(defaultMetas);
    }

    if (savedData) {
      try { setData(JSON.parse(savedData)); } catch (e) { console.error(e); }
    } else {
      setData({ atual: generateWeeklyStructure() });
    }
  }, [selectedEnv]);

  useEffect(() => {
    // Splash screen animation delay
    const timer = setTimeout(() => setShowSplash(false), 2500);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (selectedEnv) {
      localStorage.setItem(`logistics_${selectedEnv}_data_v4`, JSON.stringify(data));
    }
  }, [data, selectedEnv]);

  useEffect(() => {
    if (selectedEnv) {
      localStorage.setItem(`logistics_${selectedEnv}_metas_v4`, JSON.stringify(metas));
    }
  }, [metas, selectedEnv]);

  useEffect(() => {
    setCalcData(prev => {
      const newMetaConf = metas.CONFERENTE || 220;
      const newMetaAux = metas.AUXILIAR || 110;
      const newPecasGoal = metas.VOLUME || 6000;
      const newJornada = metas.JORNADA || 9;
      return {
        ...prev,
        pecas: newPecasGoal,
        jornada: newJornada,
        metaConf: newMetaConf,
        metaAux: newMetaAux,
        conf: calculateSugerido(newPecasGoal, newJornada, newMetaConf),
        aux: calculateSugerido(newPecasGoal, newJornada, newMetaAux)
      };
    });
  }, [metas]);

  // --- Derived Data ---
  const confLabel = selectedEnv === 'separacao' ? 'Separador' : 'Conferente';
  const auxLabel = 'Auxiliar';

  const filteredOperationalData = useMemo(() => {
    return data.atual.filter(item => {
      if (filterMode === 'todos') return true;
      const pecas = Number(item.pecas) || 0;
      const jornada = Number(item.jornada) || 9;
      const prodC = calculateProdReal(pecas, Number(item.conferentes) || 0, jornada);
      const prodA = calculateProdReal(pecas, Number(item.auxiliares) || 0, jornada);
      
      const volumeOk = pecas >= (metas.VOLUME || 6000);
      const prodCOk = prodC >= (metas.CONFERENTE || 220);
      const prodAOk = selectedEnv === 'separacao' ? true : prodA >= (metas.AUXILIAR || 110);
      
      const allOk = volumeOk && prodCOk && prodAOk && pecas > 0;
      return filterMode === 'ok' ? allOk : (filterMode === 'pendente' && pecas > 0 && !allOk);
    });
  }, [data.atual, filterMode, metas]);

  const stats = useMemo(() => {
    const targetData = (dashboardDateFilter === 'semana' || dashboardDateFilter === 'mes')
      ? data.atual 
      : data.atual.filter(d => d.id === dashboardDateFilter);

    const totalPecas = targetData.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0);
    const ativos = targetData.filter(i => i.pecas > 0);
    const count = ativos.length || 1;
    
    // Se for visão de mês, vamos projetar o mês baseado na média semanal (considerando 4 semanas)
    const factor = dashboardDateFilter === 'mes' ? 4 : 1;
    const displayTotalPecas = totalPecas * factor;
    
    const mediaRealConf = Math.round(ativos.reduce((acc, curr) => {
      const p = calculateProdReal(curr.pecas, curr.conferentes, curr.jornada);
      return acc + p;
    }, 0) / count);
    
    const mediaRealAux = Math.round(ativos.reduce((acc, curr) => {
      const p = calculateProdReal(curr.pecas, curr.auxiliares, curr.jornada);
      return acc + p;
    }, 0) / count);

    const mediaHeadcountConf = Number((ativos.reduce((acc, curr) => acc + (Number(curr.conferentes) || 0), 0) / count).toFixed(1));
    const mediaHeadcountAux = Number((ativos.reduce((acc, curr) => acc + (Number(curr.auxiliares) || 0), 0) / count).toFixed(1));
    
    const mediaHeadcountTotal = selectedEnv === 'separacao' 
      ? mediaHeadcountAux 
      : Number((mediaHeadcountConf + mediaHeadcountAux).toFixed(1));

    return { 
      totalPecas: displayTotalPecas, 
      diasAtivos: ativos.length * (dashboardDateFilter === 'mes' ? 4 : 1), 
      mediaRealConf, 
      mediaRealAux, 
      mediaHeadcountConf, 
      mediaHeadcountAux, 
      mediaHeadcountTotal,
      isDayView: dashboardDateFilter !== 'semana' && dashboardDateFilter !== 'mes',
      isMonthView: dashboardDateFilter === 'mes'
    };
  }, [data, dashboardDateFilter, selectedEnv]);

  const resetWeek = () => {
    if (confirm('Deseja limpar todos os dados e reiniciar a semana?')) {
      setData({ atual: generateWeeklyStructure() });
    }
  };

  const updateDataField = (id: string, field: keyof DayData, value: string | number) => {
    const val = field === 'dia' ? value : (value === "" ? 0 : parseFloat(value.toString()));
    setData(prev => ({
      ...prev,
      atual: prev.atual.map(item => item.id === id ? { ...item, [field]: val } : item)
    }));
  };

  return (
    <>
      <AnimatePresence>
        {(!selectedEnv && !showSplash) && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 z-50 bg-[#F1F5F9] flex items-center justify-center p-6"
          >
            <div className="max-w-4xl w-full text-center space-y-12">
              <div className="space-y-4">
                <div className="w-20 h-1.5 bg-blue-900 rounded-full mx-auto" />
                <h2 className="text-4xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter">
                  Escolha o seu <span className="text-blue-900">Ambiente</span>
                </h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-xs">Selecione o fluxo de operação para iniciar a gestão</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                {[
                  { id: 'recebimento', label: 'Recebimento', icon: ArrowRightLeft, color: 'bg-indigo-600', description: 'Gestão de entrada de mercadorias e conferência inicial.' },
                  { id: 'separacao', label: 'Separação', icon: Zap, color: 'bg-emerald-600', description: 'Controle de picking, organização de pedidos e fluxo de saída.' }
                ].map(env => (
                  <button
                    key={env.id}
                    onClick={() => setSelectedEnv(env.id as Environment)}
                    className="group bg-white p-10 rounded-[2.5rem] border-2 border-transparent hover:border-blue-900 shadow-xl hover:shadow-2xl transition-all duration-500 text-left flex flex-col gap-6 relative overflow-hidden"
                  >
                    <div className="absolute top-0 right-0 w-32 h-32 bg-slate-50 rounded-full -mr-16 -mt-16 group-hover:bg-blue-50 transition-colors" />
                    <div className={`${env.color} w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg relative z-10 group-hover:scale-110 transition-transform`}>
                      <env.icon size={30} />
                    </div>
                    <div className="relative z-10">
                      <h3 className="text-2xl font-black text-slate-900 uppercase tracking-tight">{env.label}</h3>
                      <p className="text-slate-500 text-sm font-medium mt-2 leading-relaxed">{env.description}</p>
                    </div>
                    <div className="flex items-center gap-2 text-blue-900 font-bold uppercase tracking-widest text-[10px] mt-4 opacity-0 group-hover:opacity-100 transition-opacity">
                      Acessar agora <Check size={14} />
                    </div>
                  </button>
                ))}
              </div>
              
              <footer className="pt-12 text-center border-t border-slate-200">
                <p className="text-[9px] font-bold text-slate-400 gap-2 flex items-center justify-center uppercase tracking-[0.4em]">
                   Sistema Unificado de Logística <Circle size={4} className="fill-slate-400" /> 2026
                </p>
              </footer>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {showSplash && (
          <motion.div 
            initial={{ opacity: 1 }}
            exit={{ opacity: 0, y: -20 }}
            transition={{ duration: 0.8, ease: "circOut" }}
            className="fixed inset-0 z-[100] bg-[#0F172A] flex flex-col items-center justify-center text-white"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 1, ease: "backOut" }}
              className="text-center"
            >
              <div className="w-24 h-24 bg-indigo-600 rounded-[2.5rem] flex items-center justify-center mb-8 mx-auto shadow-2xl shadow-indigo-500/20 border border-indigo-400/30">
                <ArrowRightLeft className="w-12 h-12 text-white animate-pulse" />
              </div>
              <h1 className="text-4xl font-bold tracking-tighter uppercase mb-2">
                Gestão integrada
              </h1>
              <div className="h-1 w-48 bg-slate-800 mx-auto rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ left: "-100%" }}
                  animate={{ left: "100%" }}
                  transition={{ repeat: Infinity, duration: 1.5, ease: "linear" }}
                  className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-red-800 to-transparent"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>      <div className="min-h-screen flex flex-col bg-[#F1F5F9] font-sans">
        {/* TOP NAVIGATION BAR */}
        <header className="sticky top-0 z-50 bg-[#1E293B] text-white shadow-xl no-print">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div className="flex items-center justify-between h-20">
              {/* Logo Area */}
              <button 
                onClick={() => setSelectedEnv(null)}
                className="flex items-center gap-3 group text-left"
              >
                <div className="w-9 h-9 bg-indigo-500 rounded-xl flex items-center justify-center shadow-lg group-hover:rotate-12 transition-transform duration-300">
                  <ArrowRightLeft className="w-5 h-5 text-white" />
                </div>
                <div className="flex flex-col">
                  <span className="text-white font-black tracking-tight uppercase text-base leading-none">Gestão integrada</span>
                  <span className="text-[8px] font-black text-indigo-400 uppercase tracking-widest mt-1">Ambiente: {selectedEnv}</span>
                </div>
              </button>

              {/* Desktop Navigation */}
              <nav className="hidden md:flex items-center gap-1">
                {[
                  { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                  { id: 'input', label: 'Gestão Operacional', icon: Zap },
                  { id: 'meta', label: 'Configurações', icon: Target },
                  { id: 'calculadora', label: 'Simular demanda', icon: Calculator }
                ].map(item => (
                  <button 
                    key={item.id}
                    onClick={() => setActiveTab(item.id)}
                    className={`flex items-center gap-2 px-5 py-2.5 rounded-xl text-xs font-bold transition-all duration-300 group ${
                      activeTab === item.id 
                      ? 'bg-blue-900/30 text-blue-400 border border-blue-500/30 shadow-inner' 
                      : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                    }`}
                  >
                    <item.icon size={16} className={`${activeTab === item.id ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'} transition-colors`} />
                    <span className="tracking-wide uppercase">{item.label}</span>
                  </button>
                ))}
              </nav>

              {/* Right Side Actions Empty - Moved to FAB */}
              <div className="hidden md:flex items-center gap-4">
              </div>

              {/* Mobile Menu Button */}
              <div className="md:hidden">
                <button onClick={() => setIsMobileMenuOpen(!isMobileMenuOpen)} className="p-2.5 bg-slate-800 rounded-xl hover:bg-slate-700 transition-colors">
                  {isMobileMenuOpen ? <X size={20} /> : <Menu size={20} />}
                </button>
              </div>
            </div>
          </div>

          {/* Mobile Menu Dropdown */}
          <AnimatePresence>
            {isMobileMenuOpen && (
              <motion.div 
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                className="md:hidden border-t border-slate-800 bg-[#1E293B] overflow-hidden"
              >
                <div className="px-4 py-6 space-y-2">
                  {[
                    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
                    { id: 'input', label: 'Gestão Operacional', icon: Zap },
                    { id: 'meta', label: 'Configurações', icon: Target },
                    { id: 'calculadora', label: 'Simular demanda', icon: Calculator }
                  ].map(item => (
                    <button 
                      key={item.id}
                      onClick={() => { setActiveTab(item.id); setIsMobileMenuOpen(false); }}
                      className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl text-sm font-bold transition-all ${
                        activeTab === item.id 
                        ? 'bg-indigo-600 text-white' 
                        : 'text-slate-400 hover:bg-slate-800'
                      }`}
                    >
                      <item.icon size={20} />
                      <span className="uppercase tracking-widest">{item.label}</span>
                    </button>
                  ))}
                  <div className="pt-4 mt-2 border-t border-slate-800">
                    <button 
                      onClick={() => { window.print(); setIsMobileMenuOpen(false); }} 
                      className="w-full flex items-center gap-4 px-6 py-4 rounded-xl text-sm font-bold text-emerald-400 bg-emerald-400/10"
                    >
                      <Printer size={20} />
                      <span>EXPORTAR RELATÓRIO</span>
                    </button>
                  </div>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </header>

        <main className="flex-1 min-w-0 overflow-y-auto max-h-screen bg-[#F1F5F9] print:bg-white print:max-h-none print:overflow-visible">
          <div className="p-6 md:p-10 max-w-7xl mx-auto print:p-0 print:max-w-none">
            {/* Context Header */}
            <div className="mb-10 flex flex-col md:flex-row justify-between items-end gap-4 no-print border-b border-slate-200 pb-8">
              <div>
                <div className="flex items-center gap-2 mb-2">
                  <div className="h-1 w-8 bg-blue-900 rounded-full" />
                  <span className="text-xs font-black text-slate-400 uppercase tracking-[0.3em]">Ambiente {selectedEnv}</span>
                </div>
                <h1 className="text-3xl font-black text-slate-900 tracking-tighter uppercase">
                  {activeTab === 'dashboard' ? 'Sumário de Performance' : 
                   activeTab === 'input' ? 'Console de Operações' : 
                   activeTab === 'meta' ? 'Parametrização de Metas' : 'Simular demanda'}
                </h1>
              </div>
              <div className="flex items-center gap-3 no-print bg-white px-4 py-2 rounded-2xl border border-slate-200 shadow-sm">
                <select 
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer text-slate-600"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                    <option key={m} value={i} className="text-slate-900">{m}</option>
                  ))}
                </select>
                <div className="w-px h-4 bg-slate-200" />
                <select 
                  className="bg-transparent border-none text-[10px] font-black uppercase tracking-widest outline-none cursor-pointer text-slate-600"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y} className="text-slate-900">{y}</option>
                  ))}
                </select>
                <Calendar size={14} className="text-blue-900 ml-1" />
              </div>
            </div>

            {/* PRINT ONLY HEADER */}
            <div className="hidden print:block mb-8 border-b-2 border-slate-900 pb-6">
              <div className="flex justify-between items-end">
                <div>
                  <h1 className="text-4xl font-black uppercase tracking-tighter text-slate-900">Relatório Operacional CDTO - {selectedEnv?.toUpperCase()}</h1>
                  <p className="text-sm font-bold text-slate-500 uppercase tracking-widest mt-1">Status de Desempenho e Metas Logísticas</p>
                </div>
                <div className="text-right">
                  <p className="text-xs font-black uppercase text-slate-400">Data de Emissão</p>
                  <p className="text-lg font-black text-slate-900">{new Date().toLocaleDateString('pt-PT')}</p>
                </div>
              </div>
            </div>

            {/* --- DASHBOARD --- */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8 animate-in duration-500 print:space-y-6">
                {/* Date Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 no-print bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-fit">
                   <div className="flex gap-1">
                     <button 
                       onClick={() => setDashboardDateFilter('semana')}
                       className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'semana' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                     >
                       Semana
                     </button>
                     <button 
                       onClick={() => setDashboardDateFilter('mes')}
                       className={`px-4 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'mes' ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                     >
                       Mês
                     </button>
                   </div>
                   <div className="w-px h-4 bg-slate-200 mx-1" />
                   <div className="flex gap-1">
                     {data.atual.map(dia => (
                       <button
                         key={dia.id}
                         onClick={() => setDashboardDateFilter(dia.id)}
                         className={`px-3 py-2 rounded-xl text-xs font-black uppercase tracking-widest transition-all ${dashboardDateFilter === dia.id ? 'bg-indigo-600 text-white shadow-lg shadow-indigo-200' : 'text-slate-400 hover:bg-slate-50'}`}
                       >
                         {dia.dia.substring(0, 3)}
                       </button>
                     ))}
                   </div>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 print:grid-cols-4">
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {stats.isDayView ? 'Equipe Real' : stats.isMonthView ? 'Média Mensal' : 'Resumo Equipe'}
                    </span>
                    <div className="flex items-end justify-between mt-2">
                       <div>
                         <span className="text-3xl font-black text-indigo-600">{stats.mediaHeadcountTotal}</span>
                         <p className="text-[11px] font-black text-slate-400 uppercase mt-1">
                           {stats.isDayView ? 'Homens Real' : 'Homens Médio'}
                         </p>
                       </div>
                          <div className="text-right">
                            {selectedEnv !== 'separacao' && (
                              <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{confLabel.substring(0, 1)}: {stats.mediaHeadcountConf}</p>
                            )}
                            <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">{auxLabel.substring(0, 1)}: {stats.mediaHeadcountAux}</p>
                          </div>
                    </div>
                  </div>
                  {selectedEnv !== 'separacao' && (
                    <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none">
                      <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Prod. {confLabel}</span>
                      <div className="flex items-end justify-between mt-2">
                        <div>
                          <span className="text-3xl font-black text-slate-800">{stats.mediaRealConf}</span>
                          <p className="text-[11px] font-black text-slate-400 uppercase mt-1">Ref: {metas.CONFERENTE}</p>
                        </div>
                        <span className={`text-xs font-bold flex items-center mb-1 ${stats.mediaRealConf >= metas.CONFERENTE ? 'text-emerald-500' : 'text-rose-500'}`}>
                          {Math.round((stats.mediaRealConf/metas.CONFERENTE)*100)}%
                          {stats.mediaRealConf >= metas.CONFERENTE ? <Check size={14} className="ml-1"/> : <AlertTriangle size={14} className="ml-1"/>}
                        </span>
                      </div>
                    </div>
                  )}
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">Prod. Auxiliar</span>
                    <div className="flex items-end justify-between mt-2">
                      <div>
                        <span className="text-3xl font-black text-slate-800">{stats.mediaRealAux}</span>
                        <p className="text-[11px] font-black text-slate-400 uppercase mt-1">Ref: {metas.AUXILIAR}</p>
                      </div>
                      <span className={`text-xs font-bold flex items-center mb-1 ${stats.mediaRealAux >= metas.AUXILIAR ? 'text-emerald-500' : 'text-rose-500'}`}>
                        {Math.round((stats.mediaRealAux/metas.AUXILIAR)*100)}%
                        {stats.mediaRealAux >= metas.AUXILIAR ? <Check size={14} className="ml-1"/> : <AlertTriangle size={14} className="ml-1"/>}
                      </span>
                    </div>
                  </div>
                  <div className="bg-white p-5 rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                      {stats.isDayView ? 'Volume Real' : stats.isMonthView ? 'Volúme Est. Mês' : 'Volume Período'}
                    </span>
                    <div className="flex items-end justify-between mt-2">
                      <span className="text-3xl font-black text-slate-800">{stats.totalPecas.toLocaleString()}</span>
                      <span className="text-xs font-bold text-emerald-500 mb-1 tracking-tighter uppercase">
                        {stats.isDayView ? 'Hoje' : stats.isMonthView ? 'Projecção' : `${stats.diasAtivos} Dias`}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block print:space-y-6">
                  <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden print:shadow-none print:break-inside-avoid">
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                      <h3 className="text-sm font-bold text-slate-700 flex items-center uppercase">
                        <span className="w-2 h-6 bg-indigo-500 rounded mr-3"></span>
                        Análise de Performance vs Metas
                      </h3>
                    </div>
                    <div className="p-6 h-[350px] w-full print:h-[250px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={data.atual} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                          <XAxis 
                            dataKey="dia" 
                            axisLine={false} 
                            tickLine={false} 
                            tick={{fontSize: 9, fontWeight: 700, fill: '#64748b'}} 
                            interval={0}
                          />
                          <YAxis axisLine={false} tickLine={false} tick={{fontSize: 9, fill: '#94a3b8'}} />
                          <Tooltip 
                            cursor={{fill: '#f1f5f9'}}
                            contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                          />
                          <Legend wrapperStyle={{fontSize: '9px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px'}} />
                          {selectedEnv !== 'separacao' && (
                            <Bar name={`Real ${confLabel}`} dataKey={(d: DayData) => calculateProdReal(d.pecas, d.conferentes, d.jornada)} fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                          )}
                          <Bar name={`Real ${auxLabel}`} dataKey={(d: DayData) => calculateProdReal(d.pecas, d.auxiliares, d.jornada)} fill="#991b1b" radius={[4, 4, 0, 0]} />
                        </BarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>

                  <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden print:shadow-none print:break-inside-avoid">
                    <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                      <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Histórico do Período</h3>
                    </div>
                    <div className="p-4 space-y-2">
                      {data.atual.map(dia => {
                        const pecas = Number(dia.pecas) || 0;
                        const jornada = Number(dia.jornada) || 9;
                        const prodC = calculateProdReal(pecas, Number(dia.conferentes) || 0, jornada);
                        const prodA = calculateProdReal(pecas, Number(dia.auxiliares) || 0, jornada);
                        
                        const volumeOk = pecas >= (metas.VOLUME || 6000);
                        const prodCOk = prodC >= (metas.CONFERENTE || 220);
                        const prodAOk = selectedEnv === 'separacao' ? true : prodA >= (metas.AUXILIAR || 110);
                        
                        const isOk = volumeOk && prodCOk && prodAOk;
                        const isZero = pecas === 0;
                        const prod = prodC;
                        
                        return (
                          <div key={dia.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                            <div className="flex items-center gap-3">
                              <div className={`w-1.5 h-1.5 rounded-full ${isZero ? 'bg-slate-300' : (isOk ? 'bg-emerald-500' : 'bg-rose-500')}`} />
                              <div>
                                <p className="text-[10px] font-bold text-slate-800 uppercase">{dia.dia.split('-')[0]}</p>
                                <p className="text-[9px] text-slate-400">{dia.pecas.toLocaleString()} PÇS</p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className={`text-xs font-bold ${isZero ? 'text-slate-300' : (isOk ? 'text-emerald-600' : 'text-rose-600')}`}>
                                {isZero ? '--' : prod}
                              </p>
                              {!isZero && <p className="text-[8px] font-bold text-slate-400 uppercase">PÇ/H</p>}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>

                  <div className="bg-white rounded-[2rem] p-10 border border-slate-200 shadow-xl print:shadow-none print:p-6 print:break-inside-avoid">
                  <div className="flex flex-col md:flex-row items-center justify-between gap-8">
                    <div className="text-center md:text-left">
                      <h3 className="text-xl font-bold text-slate-800 uppercase flex items-center gap-2 justify-center md:justify-start">
                        RESUMO DE METAS
                      </h3>
                      <p className="text-slate-500 text-xs font-medium mt-1">Equipe necessária para atingir o volume meta de {(metas.VOLUME || 0).toLocaleString()} PÇS.</p>
                    </div>
                    <div className="flex gap-4">
                      {selectedEnv !== 'separacao' && (
                        <div className="bg-indigo-50 border border-indigo-100 p-8 rounded-2xl min-w-[160px] text-center">
                          <p className="text-[9px] font-black text-indigo-600 uppercase mb-2 tracking-widest">{confLabel}s Necessários</p>
                          <p className="text-5xl font-black text-indigo-900">{calculateSugerido(metas.VOLUME || 6000, metas.JORNADA || 9, metas.CONFERENTE || 220)}</p>
                        </div>
                      )}
                      <div className="bg-slate-50 border border-slate-200 p-8 rounded-2xl min-w-[160px] text-center">
                        <p className="text-[9px] font-black text-slate-400 uppercase mb-2 tracking-widest">Aux. Necessários</p>
                        <p className="text-5xl font-black text-slate-900">{calculateSugerido(metas.VOLUME || 6000, metas.JORNADA || 9, metas.AUXILIAR || 110)}</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- GESTÃO OPERACIONAL --- */}
            {activeTab === 'input' && (
              <>
                <div className="flex items-center gap-3 no-print mb-6 bg-slate-100 p-2 rounded-2xl w-fit">
                <select 
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                >
                  {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                    <option key={m} value={i}>{m}</option>
                  ))}
                </select>
                <select 
                  className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none focus:ring-2 focus:ring-blue-500/20"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y}>{y}</option>
                  ))}
                </select>
              </div>

              <div className="space-y-8 animate-in slide-in-from-right-5 duration-500 print:space-y-0 print:animate-none">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 no-print">
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-5 shadow-sm">
                    <div className="w-12 h-12 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900"><Layers size={20}/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume Semanal</p>
                      <p className="text-xl font-black text-slate-800">{stats.totalPecas.toLocaleString()}</p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-5 shadow-sm border-l-4 border-l-red-800">
                    <div className="w-12 h-12 bg-red-50 rounded-xl flex items-center justify-center text-red-800"><Activity size={20}/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prod. Média (H)</p>
                      <p className="text-xl font-black text-slate-800">{stats.mediaRealConf} <span className="text-xs text-slate-400">PÇ/H</span></p>
                    </div>
                  </div>
                  <div className="bg-white p-6 rounded-2xl border border-slate-200 flex items-center gap-5 shadow-sm">
                    <div className="w-12 h-12 bg-amber-50 rounded-xl flex items-center justify-center text-amber-600"><CalendarCheck size={20}/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dias com Atividade</p>
                      <p className="text-xl font-black text-slate-800">{stats.diasAtivos} <span className="text-xs text-slate-400">DIAS</span></p>
                    </div>
                  </div>
                </div>

                {/* Filtering Bar */}
                <div className="flex flex-wrap items-center gap-3 no-print bg-white p-3 rounded-2xl border border-slate-200">
                  <span className="text-xs font-black text-slate-400 uppercase tracking-widest ml-2 hidden sm:inline">Filtrar por Status:</span>
                  <div className="flex bg-slate-100 p-1 rounded-xl">
                    {[
                      { id: 'todos', label: 'Todos' },
                      { id: 'ok', label: 'Meta Atingida' },
                      { id: 'pendente', label: 'Abaixo da Meta' }
                    ].map(option => (
                      <button
                        key={option.id}
                        onClick={() => setFilterMode(option.id as any)}
                        className={`px-4 py-2 rounded-lg text-xs font-bold uppercase transition-all ${
                          filterMode === option.id 
                          ? 'bg-white text-indigo-600 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 print:grid-cols-2 print:gap-4">
                  {filteredOperationalData.map(item => {
                    const localJornada = Number(item.jornada) || metas.JORNADA || 9;
                    const localPecas = Number(item.pecas) || 0;
                    
                    const sugC = calculateSugerido(localPecas, localJornada, metas.CONFERENTE || 220);
                    const sugA = calculateSugerido(localPecas, localJornada, metas.AUXILIAR || 110);
                    const totalSugerido = selectedEnv === 'separacao' ? sugA : sugC + sugA;
                    
                    const prodC = calculateProdReal(localPecas, Number(item.conferentes) || 0, localJornada);
                    const prodA = calculateProdReal(localPecas, Number(item.auxiliares) || 0, localJornada);
                    const hasData = localPecas > 0;
                    
                    const volumeOk = localPecas >= (metas.VOLUME || 6000);
                    const prodCOk = prodC >= (metas.CONFERENTE || 220);
                    const prodAOk = prodA >= (metas.AUXILIAR || 110);
                    const staffingCOk = (Number(item.conferentes) || 0) >= sugC;
                    const staffingAOk = selectedEnv === 'separacao' ? true : (Number(item.auxiliares) || 0) >= sugA;
                    const diffC = (Number(item.conferentes) || 0) - sugC;
                    const diffA = (Number(item.auxiliares) || 0) - sugA;
                    const allOk = volumeOk && prodCOk && (selectedEnv === 'separacao' ? true : prodAOk);

                    return (
                      <div id={`card-${item.id}`} key={item.id} className={`bg-white rounded-3xl border overflow-hidden shadow-sm transition-all duration-300 print:shadow-none print:border-slate-200 ${
                        hasData 
                        ? (allOk ? 'border-emerald-200 ring-1 ring-emerald-50' : 'border-rose-200 ring-1 ring-rose-50') 
                        : 'border-slate-200 hover:border-indigo-200'
                      }`}>
                        <div className={`px-6 py-4 flex justify-between items-center ${hasData ? (allOk ? 'bg-emerald-50/30' : 'bg-rose-50/30') : 'bg-slate-50'}`}>
                          <div>
                            <h3 className="font-bold text-xs uppercase text-slate-800 tracking-tight">{item.dia}</h3>
                            {hasData && (
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${volumeOk ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span className={`text-[8px] font-bold uppercase tracking-wider ${volumeOk ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    Volume: {localPecas.toLocaleString()} PÇS {volumeOk ? '(OK)' : `(FALTA ${Math.max(0, (metas.VOLUME || 6000) - localPecas).toLocaleString()})`}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${prodCOk && (selectedEnv === 'separacao' ? true : prodAOk) ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                                  <span className={`text-[8px] font-bold uppercase tracking-wider ${prodCOk && (selectedEnv === 'separacao' ? true : prodAOk) ? 'text-emerald-600' : 'text-rose-600'}`}>
                                    Produtividade: {prodCOk && (selectedEnv === 'separacao' ? true : prodAOk) ? 'Meta Atingida' : 'Abaixo da Meta'}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            hasData 
                            ? (allOk ? 'bg-emerald-500 text-white shadow-lg shadow-emerald-500/20' : 'bg-rose-500 text-white shadow-lg shadow-rose-500/20') 
                            : 'bg-slate-200 text-slate-400'
                          }`}>
                            {hasData ? (allOk ? <Check size={20} /> : <AlertTriangle size={20} />) : <Circle size={20} />}
                          </div>
                        </div>

                        <div className="p-6 space-y-5 print:p-4 print:space-y-3">
                         <div className="p-4 bg-indigo-50/50 rounded-2xl border border-indigo-100 flex flex-col gap-3 mb-4">
                             <div className="flex justify-between items-center">
                                <span className="text-[10px] font-black text-indigo-950 uppercase tracking-widest">Dimensionamento do Dia</span>
                             </div>
                             <div className="grid grid-cols-3 gap-2">
                                <div className="bg-white p-2 rounded-xl border border-indigo-100 text-center shadow-sm">
                                  <p className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Total Homens</p>
                                  <p className="text-lg font-black text-indigo-950">{totalSugerido}</p>
                                </div>
                                {selectedEnv !== 'separacao' && (
                                  <div className={`p-2 rounded-xl text-center border transition-all ${staffingCOk ? 'bg-white border-emerald-100' : 'bg-rose-50 border-rose-200 shadow-sm'}`}>
                                    <p className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Sug. {confLabel.substring(0, 4)}</p>
                                    <p className={`text-lg font-black ${staffingCOk ? 'text-emerald-600' : 'text-rose-600'}`}>{sugC}</p>
                                  </div>
                                )}
                                <div className={`p-2 rounded-xl text-center border transition-all ${staffingAOk ? 'bg-white border-emerald-100' : 'bg-rose-50 border-rose-200 shadow-sm'}`}>
                                  <p className="text-[7px] font-bold text-slate-400 uppercase leading-tight">Sug. Aux</p>
                                  <p className={`text-lg font-black ${staffingAOk ? 'text-emerald-600' : 'text-rose-600'}`}>{sugA}</p>
                                </div>
                             </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Volume (PÇS)</label>
                              <input 
                                type="number" 
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-center text-slate-700 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                                value={item.pecas || ''} 
                                onChange={(e) => updateDataField(item.id, 'pecas', e.target.value)} 
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Equipa (H)</label>
                              <input 
                                type="number" 
                                step="0.5"
                                className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-center text-slate-700 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                                value={item.jornada || ''} 
                                onChange={(e) => updateDataField(item.id, 'jornada', e.target.value)} 
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {selectedEnv !== 'separacao' && (
                              <div className="space-y-1.5">
                                <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">{confLabel}s</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-center text-indigo-600 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                                    value={item.conferentes || ''} 
                                    onChange={(e) => updateDataField(item.id, 'conferentes', e.target.value)} 
                                  />
                                  {hasData && (
                                    <div className={`absolute -top-2 -right-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${staffingCOk ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white animate-pulse'}`}>
                                      {diffC > 0 ? `+${diffC}` : diffC < 0 ? diffC : 'OK'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-[9px] font-bold text-slate-400 uppercase tracking-widest ml-1">Auxiliares</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  className="w-full p-3 bg-slate-50 border border-slate-100 rounded-xl font-bold text-center text-slate-600 focus:bg-white focus:border-indigo-500 outline-none transition-all"
                                  value={item.auxiliares || ''} 
                                  onChange={(e) => updateDataField(item.id, 'auxiliares', e.target.value)} 
                                />
                                {hasData && (
                                  <div className={`absolute -top-2 -right-1 px-1.5 py-0.5 rounded text-[10px] font-black uppercase ${staffingAOk ? 'bg-emerald-500 text-white' : 'bg-rose-500 text-white animate-pulse'}`}>
                                    {diffA > 0 ? `+${diffA}` : diffA < 0 ? diffA : 'OK'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 grid grid-cols-2 gap-2">
                              {selectedEnv !== 'separacao' && (
                                <div className="text-center">
                                  <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Real {confLabel.substring(0, 4)}. (PÇ/H)</p>
                                  <p id={`prod-real-c-${item.id}`} className={`text-base font-black ${prodCOk ? 'text-indigo-600' : 'text-rose-600'}`}>{prodC} <span className="text-[10px] text-slate-400">/ {metas.CONFERENTE}</span></p>
                                </div>
                              )}
                              <div className="text-center border-l border-slate-100">
                                <p className="text-[8px] font-bold text-slate-400 uppercase tracking-tighter">Real Aux. (PÇ/H)</p>
                                <p id={`prod-real-a-${item.id}`} className={`text-base font-black ${prodAOk ? 'text-indigo-600' : 'text-rose-600'}`}>{prodA} <span className="text-[10px] text-slate-400">/ {metas.AUXILIAR}</span></p>
                              </div>
                            </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </>
          )}

            {/* --- CALCULADORA --- */}
            {activeTab === 'calculadora' && (
              <div className="max-w-4xl mx-auto animate-in zoom-in-95 duration-500 no-print">
                <div className="bg-white p-12 md:p-16 rounded-[2.5rem] border border-slate-200 shadow-2xl relative overflow-hidden group">
                  <div className="absolute top-0 right-0 w-80 h-80 bg-blue-50/50 rounded-full blur-3xl -mr-40 -mt-40 pointer-events-none group-hover:bg-blue-100/50 transition-colors duration-1000" />
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-16 items-center relative z-10">
                    <div className="space-y-10">
                      <div className="space-y-4">
                        <div className="w-12 h-1.5 bg-blue-900 rounded-full" />
                        <h2 className="text-3xl font-bold uppercase text-slate-900 tracking-tight leading-tight">Simulador de<br/><span className="text-blue-900 font-black">Necessidade</span></h2>
                        <p className="text-slate-500 text-xs font-medium uppercase tracking-widest">Headcount necessário para equilibrar o volume atual com as metas.</p>
                      </div>
                      <div className="space-y-6">
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest ml-1">Volume Previsto (PÇS)</label>
                          <input 
                            type="number" 
                            className="w-full p-6 bg-slate-50 border border-slate-100 rounded-2xl font-black text-3xl text-slate-800 focus:border-red-800 focus:bg-white focus:ring-4 focus:ring-red-500/10 outline-none transition-all shadow-inner" 
                            value={calcData.pecas || ''} 
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setCalcData(prev => ({
                                ...prev, 
                                pecas: val,
                                conf: calculateSugerido(val, prev.jornada, prev.metaConf),
                                aux: calculateSugerido(val, prev.jornada, prev.metaAux)
                              }));
                            }} 
                          />
                        </div>
                        <div className="space-y-3">
                          <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest ml-1">Horas Operacionais (H)</label>
                          <input 
                            type="number" 
                            step="0.5" 
                            className="w-full p-6 bg-slate-50 border border-slate-100 rounded-2xl font-black text-3xl text-slate-800 focus:border-red-800 focus:bg-white focus:ring-4 focus:ring-red-500/10 outline-none transition-all shadow-inner" 
                            value={calcData.jornada || ''} 
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setCalcData(prev => ({
                                ...prev, 
                                jornada: val,
                                conf: calculateSugerido(prev.pecas, val, prev.metaConf),
                                aux: calculateSugerido(prev.pecas, val, prev.metaAux)
                              }));
                            }} 
                          />
                        </div>
                        <div className="grid grid-cols-2 gap-4">
                          {selectedEnv !== 'separacao' && (
                            <div className="space-y-3">
                              <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest ml-1">Meta {confLabel.substring(0, 4)}. (PÇ/H)</label>
                              <input 
                                type="number" 
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xl text-slate-700 focus:border-red-800 focus:bg-white outline-none transition-all" 
                                value={calcData.metaConf || ''} 
                                onChange={(e) => {
                                  const val = e.target.value === '' ? 0 : Number(e.target.value);
                                  setCalcData(prev => ({
                                    ...prev, 
                                    metaConf: val,
                                    conf: calculateSugerido(prev.pecas, prev.jornada, val),
                                    aux: calculateSugerido(prev.pecas, prev.jornada, prev.metaAux)
                                  }));
                                }} 
                              />
                            </div>
                          )}
                          <div className="space-y-3">
                            <label className="text-[10px] font-bold uppercase text-slate-400 tracking-widest ml-1">Meta Aux. (PÇ/H)</label>
                            <input 
                              type="number" 
                              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-xl text-slate-700 focus:border-red-800 focus:bg-white outline-none transition-all" 
                              value={calcData.metaAux || ''} 
                              onChange={(e) => {
                                const val = e.target.value === '' ? 0 : Number(e.target.value);
                                setCalcData(prev => ({
                                  ...prev, 
                                  metaAux: val,
                                  conf: calculateSugerido(prev.pecas, prev.jornada, prev.metaConf),
                                  aux: calculateSugerido(prev.pecas, prev.jornada, val)
                                }));
                              }} 
                            />
                          </div>
                        </div>
                      </div>
                    </div>
                    <div className="space-y-5">
                      {selectedEnv !== 'separacao' && (
                        <div className="bg-blue-900 p-10 rounded-3xl text-white shadow-xl shadow-blue-950/20 text-center relative overflow-hidden group/card hover:scale-[1.02] transition-transform">
                          <div className="absolute top-0 left-0 w-full h-1 bg-white/20 group-hover/card:h-full transition-all duration-700 opacity-10" />
                          <p className="text-[10px] font-bold uppercase opacity-80 mb-3 tracking-widest relative z-10">{confLabel}s (Ajustável)</p>
                          <input 
                            type="number" 
                            className="w-full bg-transparent text-7xl font-black relative z-10 tracking-tighter text-center outline-none focus:scale-110 transition-transform"
                            value={calcData.conf || ''} 
                            onChange={(e) => {
                              const val = e.target.value === '' ? 0 : Number(e.target.value);
                              setCalcData(prev => {
                                const newPecas = val === 0 ? prev.pecas : Math.round(val * prev.jornada * prev.metaConf);
                                return {
                                  ...prev, 
                                  conf: val,
                                  pecas: newPecas,
                                  aux: val === 0 ? prev.aux : calculateSugerido(newPecas, prev.jornada, prev.metaAux)
                                };
                              });
                            }}
                          />
                          <p className="text-[9px] font-bold mt-4 opacity-50 uppercase relative z-10 tracking-widest">Base: {calcData.metaConf} PÇ / H</p>
                        </div>
                      )}
                      <div className="bg-red-800 p-10 rounded-3xl text-white shadow-xl shadow-red-950/20 text-center relative overflow-hidden group/card hover:scale-[1.02] transition-transform">
                        <div className="absolute top-0 left-0 w-full h-1 bg-white/20 group-hover/card:h-full transition-all duration-700 opacity-10" />
                        <p className="text-[10px] font-bold uppercase opacity-80 mb-3 tracking-widest relative z-10">Auxiliares (Ajustável)</p>
                        <input 
                          type="number" 
                          className="w-full bg-transparent text-7xl font-black relative z-10 tracking-tighter text-center outline-none focus:scale-110 transition-transform"
                          value={calcData.aux || ''} 
                          onChange={(e) => {
                            const val = e.target.value === '' ? 0 : Number(e.target.value);
                            setCalcData(prev => {
                              const newPecas = val === 0 ? prev.pecas : Math.round(val * prev.jornada * prev.metaAux);
                              return {
                                ...prev, 
                                aux: val,
                                pecas: newPecas,
                                conf: val === 0 ? prev.conf : calculateSugerido(newPecas, prev.jornada, prev.metaConf)
                              };
                            });
                          }}
                        />
                        <p className="text-[9px] font-bold mt-4 opacity-50 uppercase relative z-10 tracking-widest">Base: {calcData.metaAux} PÇ / H</p>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- CONFIGURAÇÕES --- */}
            {activeTab === 'meta' && (
              <div className="max-w-2xl mx-auto animate-in fade-in duration-500 no-print">
                <div className="bg-[#1E293B] p-12 md:p-16 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden border border-slate-700">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-800 to-transparent" />
                  <div className="text-center mb-12">
                    <div className="w-16 h-16 bg-slate-800 rounded-2xl flex items-center justify-center mx-auto mb-6 border border-slate-700 shadow-xl">
                      <Settings2 size={30} className="text-blue-400" />
                    </div>
                    <h2 className="text-xl font-bold uppercase tracking-tight">Parametrização de Metas</h2>
                    <p className="text-slate-500 text-[10px] font-bold mt-3 uppercase tracking-widest">Indicadores de Produtividade Esperada</p>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">
                    <div className="space-y-4 text-center">
                      <label className="text-[10px] font-bold uppercase text-blue-400 tracking-widest leading-none block h-4">Meta Volume</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-4xl font-black text-white text-center outline-none focus:border-indigo-500 transition-all shadow-inner" 
                        value={metas.VOLUME || ''} 
                        onChange={(e) => setMetas({...metas, VOLUME: e.target.value === '' ? 0 : Number(e.target.value)})} 
                      />
                      <p className="text-[8px] font-bold text-slate-500 uppercase">PEÇAS / DIA</p>
                    </div>
                    <div className="space-y-4 text-center">
                      <label className="text-[10px] font-bold uppercase text-emerald-400 tracking-widest leading-none block h-4">Jornada Padrão</label>
                      <input 
                        type="number" 
                        step="0.5"
                        className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-4xl font-black text-white text-center outline-none focus:border-emerald-500 transition-all shadow-inner" 
                        value={metas.JORNADA || ''} 
                        onChange={(e) => setMetas({...metas, JORNADA: e.target.value === '' ? 0 : Number(e.target.value)})} 
                      />
                      <p className="text-[8px] font-bold text-slate-500 uppercase">HORAS / DIA</p>
                    </div>
                    {selectedEnv !== 'separacao' && (
                      <div className="space-y-4 text-center">
                        <label className="text-[10px] font-bold uppercase text-indigo-400 tracking-widest leading-none block h-4">Alvo {confLabel.substring(0, 4)}.</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-4xl font-black text-white text-center outline-none focus:border-blue-500 transition-all shadow-inner" 
                          value={metas.CONFERENTE || ''} 
                          onChange={(e) => setMetas({...metas, CONFERENTE: e.target.value === '' ? 0 : Number(e.target.value)})} 
                        />
                        <p className="text-[8px] font-bold text-slate-500 uppercase">PÇ / HORA</p>
                      </div>
                    )}
                    <div className="space-y-4 text-center">
                      <label className="text-[10px] font-bold uppercase text-red-400 tracking-widest leading-none block h-4">Alvo Auxiliares</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-900 border border-slate-800 p-6 rounded-2xl text-4xl font-black text-white text-center outline-none focus:border-red-500 transition-all shadow-inner" 
                        value={metas.AUXILIAR || ''} 
                        onChange={(e) => setMetas({...metas, AUXILIAR: e.target.value === '' ? 0 : Number(e.target.value)})} 
                      />
                      <p className="text-[8px] font-bold text-slate-500 uppercase">PÇ / HORA</p>
                    </div>
                  </div>
                </div>
              </div>
            )}
          </div>

          <footer className="mt-auto p-12 text-center no-print">
            <div className="w-12 h-0.5 bg-slate-200 mx-auto mb-6 opacity-50" />
            <p className="text-xs font-bold text-slate-400 uppercase tracking-[0.4em]">Gestão integrada • {selectedEnv} • 2026</p>
            <button 
              onClick={() => setSelectedEnv(null)}
              className="mt-4 text-[10px] font-black text-blue-900 uppercase tracking-widest hover:underline"
            >
              Trocar Ambiente
            </button>
          </footer>

          {/* Floating Action Button for Export */}
          <button 
            onClick={() => window.print()}
            className="fixed bottom-8 right-8 z-[60] bg-blue-900 hover:bg-blue-800 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(30,58,138,0.3)] hover:shadow-[0_20px_50px_rgba(30,58,138,0.5)] transition-all duration-300 transform hover:scale-110 active:scale-90 no-print group"
          >
            <Printer size={24} className="group-hover:rotate-12 transition-transform" />
            <span className="absolute right-20 bg-[#1E293B] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-slate-700">
              Exportar Relatório
            </span>
          </button>
        </main>
      </div>
    </>
  );
}
