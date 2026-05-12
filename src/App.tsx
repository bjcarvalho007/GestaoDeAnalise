/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useMemo } from 'react';
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
  ShieldCheck,
  Menu, 
  X, 
  Check, 
  CheckCircle2,
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
type Environment = 'recebimento' | 'separacao' | 'geral' | 'inventario';
import * as XLSX from 'xlsx';
import { FileUp, Download, Package, Move, LogOut, LogIn, Search, Filter } from 'lucide-react';

interface DayData {
  id: string;
  dia: string;
  pecas: number;
  conferentes: number;
  auxiliares: number;
  jornada: number;
  real: number;
}

interface Metas {
  CONFERENTE: number;
  AUXILIAR: number;
  VOLUME: number;
  JORNADA: number;
}

// --- Utils ---
const generateWeeklyStructure = (month?: number, year?: number): DayData[] => {
  const now = new Date();
  const targetMonth = month !== undefined ? month : now.getMonth();
  const targetYear = year !== undefined ? year : now.getFullYear();
  
  // Create a date for the first day of that period
  // We'll use the current day if it's the current month/year, 
  // or the 1st of the month if it's a different month
  const isCurrentMonth = targetMonth === now.getMonth() && targetYear === now.getFullYear();
  const referenceDate = isCurrentMonth ? now : new Date(targetYear, targetMonth, 1);
  
  const dayOfWeek = referenceDate.getDay(); // 0 (Sun) to 6 (Sat)
  // Find Monday of that week
  const diffToMonday = (dayOfWeek === 0 ? -6 : 1 - dayOfWeek);
  const monday = new Date(referenceDate);
  monday.setDate(referenceDate.getDate() + diffToMonday);

  const dias = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado'];
  return dias.map((dia, index) => {
    const currentDay = new Date(monday);
    currentDay.setDate(monday.getDate() + index);
    const dayStr = currentDay.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' });
    
    return {
      id: `fixo-${index}`,
      dia: `${dia} (${dayStr})`,
      pecas: 0,
      conferentes: 0,
      auxiliares: 0,
      jornada: 9,
      real: 0,
    };
  });
};

const calculateProdReal = (pecas: number, qtdPessoas: number, jornada: number) => {
  if (!qtdPessoas || !jornada || !pecas) return 0;
  return Math.round(pecas / qtdPessoas / jornada);
};

const calculateSugerido = (pecas: number, jornada: number, meta: number) => {
  if (!pecas || !jornada || !meta) return 0;
  // Usamos ceil para garantir que a quantidade de pessoas cubra o volume sem ultrapassar o esforço padrão (meta)
  return Math.max(1, Math.ceil(pecas / (jornada * meta)));
};

export default function App() {
  // --- States ---
  const [selectedEnv, setSelectedEnv] = useState<Environment | null>(null);
  const [showSplash, setShowSplash] = useState(true);
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const [metas, setMetas] = useState<Metas>(() => ({ CONFERENTE: 220, AUXILIAR: 110, VOLUME: 6000, JORNADA: 9 }));

  const [data, setData] = useState<{ atual: DayData[] }>(() => ({ atual: generateWeeklyStructure() }));
  const [allData, setAllData] = useState<Record<string, { atual: DayData[], metas: Metas }>>({});

  const [manualGlobalHC, setManualGlobalHC] = useState<number | null>(() => {
    const saved = localStorage.getItem('logistics_manual_global_hc');
    return saved ? JSON.parse(saved) : null;
  });
  const [manualGlobalJornada, setManualGlobalJornada] = useState<number>(() => {
    const saved = localStorage.getItem('logistics_manual_global_jornada');
    return saved ? JSON.parse(saved) : 9;
  });

  const [selectedMonth, setSelectedMonth] = useState(new Date().getMonth());
  const [selectedYear, setSelectedYear] = useState(new Date().getFullYear());
  const [isLoaded, setIsLoaded] = useState(false);

  // Helper to get current day ID (0-5 for Seg-Sab)
  const getCurrentDayId = () => {
    const day = new Date().getDay(); // 0-6 (Sun-Sat)
    if (day === 0) return 'semana'; // Default to week view on Sunday
    return `fixo-${day - 1}`;
  };

  const [calcData, setCalcData] = useState({ 
    pecas: 6000, 
    jornada: 9,
    metaConf: 220,
    metaAux: 110,
    conf: 4,
    aux: 7
  });
  const [filterMode, setFilterMode] = useState<'todos' | 'ok' | 'pendente'>('todos');
  const [dashboardDateFilter, setDashboardDateFilter] = useState<'semana' | 'mes' | 'ano' | string>(getCurrentDayId());

  // --- Inventory Module States ---
  const [dataYesterday, setDataYesterday] = useState<any[]>([]);
  const [dataToday, setDataToday] = useState<any[]>([]);
  const [inventoryReport, setInventoryReport] = useState<any[]>([]);
  const [inventoryStats, setInventoryStats] = useState({ total: 0, out: 0, move: 0, in: 0 });
  const [isProcessing, setIsProcessing] = useState(false);
  const [fileNames, setFileNames] = useState({ yesterday: '', today: '' });
  const [columnMaps, setColumnMaps] = useState<{ yesterday: any, today: any }>({ yesterday: null, today: null });

  // Helper to find field regardless of key casing or variation
  const getField = (obj: any, keys: string[]) => {
    if (!obj) return undefined;
    const objKeys = Object.keys(obj);
    const lowerKeys = keys.map(k => k.toLowerCase());
    
    // Exact match first
    const exactMatch = objKeys.find(ok => lowerKeys.includes(ok.toLowerCase()));
    if (exactMatch) return obj[exactMatch];

    // Partial match (contains)
    const partialMatch = objKeys.find(ok => {
      const lowOk = ok.toLowerCase();
      return lowerKeys.some(lk => lowOk.includes(lk) || lk.includes(lowOk));
    });
    
    return partialMatch ? obj[partialMatch] : undefined;
  };

  // Map of accepted aliases for detection
  const CI_ALIASES = ['CI', 'Código', 'Cod', 'Item', 'SKU', 'ID', 'Referência', 'Referencia'];
  const BALANCE_ALIASES = ['Real', 'Saldo', 'Quantidade', 'Qtd', 'Estoque', 'Qtd Real', 'Stock'];
  const ADDRESS_ALIASES = ['Endereço', 'Endereco', 'Loc', 'Localizacao', 'Posição', 'Slot', 'Bin'];
  const DESC_ALIASES = ['Descrição', 'Descricao', 'Item Desc', 'Produto', 'Nome'];

  const detectColumns = (sample: any) => {
    if (!sample) return null;
    const keys = Object.keys(sample);
    return {
      ci: keys.find(k => CI_ALIASES.some(a => k.toLowerCase().includes(a.toLowerCase()))),
      balance: keys.find(k => BALANCE_ALIASES.some(a => k.toLowerCase().includes(a.toLowerCase()))),
      address: keys.find(k => ADDRESS_ALIASES.some(a => k.toLowerCase().includes(a.toLowerCase()))),
      desc: keys.find(k => DESC_ALIASES.some(a => k.toLowerCase().includes(a.toLowerCase())))
    };
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>, type: 'yesterday' | 'today') => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileNames(prev => ({ ...prev, [type]: file.name }));
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const data = new Uint8Array(ev.target?.result as ArrayBuffer);
        const workbook = XLSX.read(data, { type: 'array' });
        const sheetName = workbook.SheetNames[0];
        if (!sheetName) throw new Error("Planilha vazia");
        
        // Try to handle sheets with empty rows at the top
        let json = XLSX.utils.sheet_to_json(workbook.Sheets[sheetName], { defval: "", blankrows: false });
        
        if (Array.isArray(json) && json.length > 0 && Array.isArray(json[0])) {
           // If it's still raw arrays, we need to promote a row to headers
           const dataRows = json as any[][];
           const headerRowIndex = dataRows.findIndex(row => row.some(cell => CI_ALIASES.some(a => String(cell).toLowerCase().includes(a.toLowerCase()))));
           if (headerRowIndex !== -1) {
              const headers = dataRows[headerRowIndex];
              json = dataRows.slice(headerRowIndex + 1).map(row => {
                 const obj: any = {};
                 headers.forEach((h, i) => { if(h) obj[String(h)] = row[i]; });
                 return obj;
              });
           }
        }

        if (!Array.isArray(json) || json.length === 0) {
          alert("O arquivo parece estar vazio ou não tem o formato correto.");
          return;
        }

        const mapping = detectColumns(json[0]);
        setColumnMaps(prev => ({ ...prev, [type]: mapping }));

        if (!mapping?.ci || !mapping?.address) {
          console.warn("Colunas não detectadas automaticamente:", mapping);
        }

        if (type === 'yesterday') setDataYesterday(json);
        else setDataToday(json);
      } catch (error) {
        console.error("Erro ao ler arquivo:", error);
        alert("Erro ao processar o arquivo Excel. Verifique se o formato é suportado (.xlsx, .xls ou .csv).");
      } finally {
        // Reset input for same-file re-upload
        e.target.value = '';
      }
    };
    reader.readAsArrayBuffer(file);
  };

  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 50;

  const paginatedReport = useMemo(() => {
    const start = (currentPage - 1) * itemsPerPage;
    return inventoryReport.slice(start, start + itemsPerPage);
  }, [inventoryReport, currentPage]);

  const totalPages = Math.ceil(inventoryReport.length / itemsPerPage);

  const processInventory = () => {
    if (!dataYesterday.length || !dataToday.length) {
      alert("⚠️ Erro: Suba ambos os arquivos primeiro (Ontem e Hoje).");
      return;
    }

    setIsProcessing(true);
    setInventoryReport([]);
    setCurrentPage(1);
    
    // Use a slight delay to allow the loading state to render
    setTimeout(() => {
      try {
        const report: any[] = [];
        
        // Aliases for better auto-detection
        const ciAliases = ['CI', 'Código', 'Cod', 'Item', 'SKU', 'ID', 'Referência', 'Referencia', 'Code'];
        const balanceAliases = ['Real', 'Saldo', 'Quantidade', 'Qtd', 'Estoque', 'Qtd Real', 'Stock', 'Amount', 'Total'];
        const addressAliases = ['Endereço', 'Endereco', 'Loc', 'Localizacao', 'Posição', 'Slot', 'Bin', 'Address', 'Loc.'];
        const descAliases = ['Descrição', 'Descricao', 'Item Desc', 'Produto', 'Nome', 'Description', 'Product'];

        // Pre-create Maps for O(1) lookups
        const mapYesterday = new Map<string, any>();
        const mapToday = new Map<string, any>();
        
        // Build map yesterday
        dataYesterday.forEach(row => {
          const val = getField(row, ciAliases);
          if (val !== undefined && val !== null) {
            const key = String(val).trim();
            if (key) mapYesterday.set(key, row);
          }
        });

        // Build map today
        dataToday.forEach(row => {
          const val = getField(row, ciAliases);
          if (val !== undefined && val !== null) {
            const key = String(val).trim();
            if (key) mapToday.set(key, row);
          }
        });

        const allCIs = new Set([...mapYesterday.keys(), ...mapToday.keys()]);
        
        if (allCIs.size === 0) {
          alert("❌ Erro: Não foi possível identificar a coluna 'CI' (Código) nas planilhas. Verifique se os cabeçalhos estão corretos.");
          setIsProcessing(false);
          return;
        }

        let sOut = 0, sMove = 0, sIn = 0;

        allCIs.forEach(ci => {
          const y = mapYesterday.get(ci);
          const t = mapToday.get(ci);

          const realY = y ? Number(getField(y, balanceAliases) || 0) : 0;
          const realT = t ? Number(getField(t, balanceAliases) || 0) : 0;
          const endY = y ? String(getField(y, addressAliases) || 'N/A') : '---';
          const endT = t ? String(getField(t, addressAliases) || 'N/A') : '---';
          const desc = String((t ? getField(t, descAliases) : getField(y, descAliases)) || ci);
          const diff = realT - realY;

          // Case 1: Removed / Stock Zero
          if (y && !t) {
            report.push({ 
              ci, desc, endY, endT: 'ZERADO', 
              realY, realT: 0, diff: -realY, 
              status: 'REMOVIDO / ESTOQUE ZERADO NO SISTEMA', 
              type: 'CRITICAL',
              color: 'bg-red-50 text-red-700 font-black border-l-4 border-l-red-600' 
            });
            sOut++;
          } 
          // Case 2: New Item
          else if (!y && t) {
            report.push({ 
              ci, desc, endY: 'NOVO', endT, 
              realY: 0, realT, diff: realT, 
              status: 'ITEM NOVO NO ESTOQUE', 
              type: 'NEW',
              color: 'bg-emerald-100 text-emerald-800 font-bold border-l-4 border-l-emerald-600' 
            });
            sIn++;
          }
          // Case 3: Both exist - check for diffs
          else if (y && t) {
            let statusString = "OK";
            let colorString = "";
            let type = "NORMAL";

            if (endY !== endT && diff === 0) {
              statusString = "RELOCAÇÃO (MESMO SALDO)";
              colorString = "bg-blue-50 text-blue-700";
              type = "MOVE";
              sMove++;
            } else if (endY !== endT && diff !== 0) {
              statusString = `REPOSIÇÃO EM NOVO ENDEREÇO (${diff > 0 ? '+' : ''}${diff} PÇ)`;
              colorString = "bg-indigo-50 text-indigo-700 border-l-4 border-l-indigo-400";
              type = "MIXED";
              sMove++;
            } else if (diff < 0) {
              const isCritical = (realT === 0);
              statusString = isCritical ? "RUPTURA / ESTOQUE ZEROU" : `SAÍDA: ${Math.abs(diff)} PÇ`;
              colorString = isCritical ? "bg-orange-100 text-orange-900 border-l-4 border-l-orange-600" : "bg-orange-50 text-orange-700";
              type = isCritical ? "STOCKOUT" : "PICKING";
            } else if (diff > 0) {
              statusString = `ENTRADA / REPOSIÇÃO: +${diff} PÇ`;
              colorString = "bg-emerald-50 text-emerald-700";
              type = "REPLENISH";
            }

            if (endY !== endT || diff !== 0) {
              report.push({ 
                ci, desc, endY, endT, realY, realT, diff, 
                status: statusString, 
                color: colorString,
                type: type
              });
            }
          }
        });

        if (report.length === 0) {
          alert("✨ Nenhuma divergência detectada! As planilhas estão perfeitamente sincronizadas.");
        } else {
          setInventoryReport(report);
          setInventoryStats({ total: dataToday.length, out: sOut, move: sMove, in: sIn });
        }
      } catch (err) {
        console.error("Erro fatal no processamento:", err);
        alert("Erro no processamento. Verifique se as planilhas têm colunas como 'CI' e 'Endereço'.");
      } finally {
        setIsProcessing(false);
      }
    }, 300);
  };


  const exportInventoryExcel = () => {
    if (!inventoryReport.length) return;

    const ws = XLSX.utils.json_to_sheet(inventoryReport.map(r => ({
      'CI': r.ci,
      'Descrição': r.desc,
      'Endereço Original': r.endY,
      'Endereço Atual': r.endT,
      'Saldo Anterior': r.realY,
      'Saldo Atual': r.realT,
      'Diferença': r.diff,
      'Status da Movimentação': r.status
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Divergencias");
    XLSX.writeFile(wb, `Relatorio_Movimentacao_${new Date().toLocaleDateString('pt-BR').replace(/\//g, '-')}.xlsx`);
  };

  useEffect(() => {
    localStorage.setItem('logistics_manual_global_hc', JSON.stringify(manualGlobalHC));
  }, [manualGlobalHC]);

  useEffect(() => {
    localStorage.setItem('logistics_manual_global_jornada', JSON.stringify(manualGlobalJornada));
  }, [manualGlobalJornada]);

  // --- Data Sync ---
  useEffect(() => {
    setIsLoaded(false);
    // Global sync function to fetch all data from localStorage
    const syncAllData = () => {
      const environments: ('recebimento' | 'separacao' | 'inventario')[] = ['recebimento', 'separacao', 'inventario'];
      const combined: Record<string, { atual: DayData[], metas: Metas }> = {};
      
      environments.forEach(env => {
        const metasKey = `logistics_${env}_metas_v4`;
        // Make data specific to month and year
        const dataKey = `logistics_${env}_data_v4_${selectedYear}_${selectedMonth}`;
        
        const savedMetas = localStorage.getItem(metasKey);
        const savedData = localStorage.getItem(dataKey);
        
        // Fallback to legacy key if monthly key doesn't exist yet (for migration)
        const legacyDataKey = `logistics_${env}_data_v4`;
        const legacyData = !savedData ? localStorage.getItem(legacyDataKey) : null;
        
        combined[env] = {
          atual: savedData ? JSON.parse(savedData).atual : (legacyData ? JSON.parse(legacyData).atual : generateWeeklyStructure(selectedMonth, selectedYear)),
          metas: savedMetas ? JSON.parse(savedMetas) : { CONFERENTE: 220, AUXILIAR: 110, VOLUME: 6000, JORNADA: 9 }
        };
      });
      setAllData(combined);
      return combined;
    };

    if (!selectedEnv || selectedEnv === 'geral') {
      syncAllData();
      setIsLoaded(true);
      return;
    }

    // Individual environment selection
    const currentCombined = syncAllData();
    const envData = currentCombined[selectedEnv as keyof typeof currentCombined];
    
    if (envData) {
      setMetas(envData.metas);
      setData({ atual: envData.atual });
    }
    // individual environment pickers default to simulator when selected
    if (selectedEnv && selectedEnv !== 'geral' && activeTab === 'dashboard') {
      setActiveTab('calculadora');
    }
    setIsLoaded(true);
  }, [selectedEnv]);

  useEffect(() => {
    // Splash screen animation delay
    const timer = setTimeout(() => setShowSplash(false), 1200);
    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    if (isLoaded && selectedEnv && selectedEnv !== 'geral') {
      localStorage.setItem(`logistics_${selectedEnv}_data_v4_${selectedYear}_${selectedMonth}`, JSON.stringify(data));
    }
  }, [data, selectedEnv, selectedMonth, selectedYear, isLoaded]);

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
      const prodCOk = selectedEnv === 'separacao' ? true : prodC >= (metas.CONFERENTE || 220);
      const prodAOk = prodA >= (metas.AUXILIAR || 110);
      
      const allOk = volumeOk && prodCOk && prodAOk && pecas > 0;
      return filterMode === 'ok' ? allOk : (filterMode === 'pendente' && pecas > 0 && !allOk);
    });
  }, [data.atual, filterMode, metas]);

  const stats = useMemo(() => {
    const isDayView = dashboardDateFilter !== 'semana' && dashboardDateFilter !== 'mes' && dashboardDateFilter !== 'ano';
    const isWeekView = dashboardDateFilter === 'semana';
    const isMonthView = dashboardDateFilter === 'mes';
    const isYearView = dashboardDateFilter === 'ano';

    const getHorizonStats = (baseDemand: number, baseReal: number) => ({
      dia: { demand: baseDemand, real: baseReal },
      mes: { demand: baseDemand, real: baseReal },
      ano: { demand: baseDemand, real: baseReal }
    });

    if (selectedEnv === 'geral') {
      const operationalEnvs = ['recebimento', 'separacao'];
      let totalPecasGeneral = 0;
      let totalRealGeneral = 0;
      let totalHeadcountGeneral = 0;
      let totalActivesInPeriod = 0;
      let globalMonthlyReal = 0;
      let globalMonthlyPecas = 0;
      let totalDaysActiveMonth = 0;
      let aggregateVolumeMeta = 0;
      let periodActualMH = 0;
      let periodDaysActiveCount = 0;
      
      const envStats = operationalEnvs.map(env => {
        const envObj = allData[env];
        if (!envObj) return null;
        
        const envData = envObj.atual;
        const envMetas = envObj.metas;
        
        const targetData = (isWeekView || isMonthView || isYearView)
          ? envData 
          : envData.filter(d => d.id === dashboardDateFilter);
        
        const totalPecas = targetData.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0);
        const totalReal = targetData.reduce((acc, curr) => acc + (Number(curr.real) || 0), 0);
        
        // Monthly accumulators
        const totalRealMonth = envData.reduce((acc, curr) => acc + (Number(curr.real) || 0), 0);
        const totalPecasMonth = envData.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0);
        globalMonthlyReal += totalRealMonth;
        globalMonthlyPecas += totalPecasMonth;
        const activeDaysMonth = envData.filter(d => (Number(d.pecas) || 0) > 0 || (Number(d.real) || 0) > 0);
        totalDaysActiveMonth += activeDaysMonth.length;
        
        // Current period actual MH
        const envPeriodMH = targetData.reduce((acc, curr) => {
             const j = Number(curr.jornada) || 9;
             const hc = (Number(curr.conferentes) || 0) + (Number(curr.auxiliares) || 0);
             return acc + (j * hc);
        }, 0);
        periodActualMH += envPeriodMH;

        const ativosTarget = targetData.filter(i => (Number(i.pecas) || 0) > 0 || (Number(i.real) || 0) > 0);
        const countDays = ativosTarget.length || 1;
        periodDaysActiveCount += ativosTarget.length;
        
        totalPecasGeneral += totalPecas;
        totalRealGeneral += totalReal;
        
        const mediaHeadcountConf = Number((ativosTarget.reduce((acc, curr) => acc + (Number(curr.conferentes) || 0), 0) / countDays).toFixed(1));
        const mediaHeadcountAux = Number((ativosTarget.reduce((acc, curr) => acc + (Number(curr.auxiliares) || 0), 0) / countDays).toFixed(1));
        
        const hcTotal = env === 'separacao' ? mediaHeadcountAux : (mediaHeadcountConf + mediaHeadcountAux);
        totalHeadcountGeneral += hcTotal;
        totalActivesInPeriod += ativosTarget.length;
        
        aggregateVolumeMeta += Number(envMetas.VOLUME) || 6000;

        return {
          env,
          totalPecas: totalPecas,
          totalReal: totalReal,
          hcTotal,
          ativos: ativosTarget.length,
          meta: env === 'separacao' ? (envMetas.AUXILIAR || 110) : (envMetas.CONFERENTE || 220)
        };
      }).filter(Boolean) as any[];

      const effectiveHC = manualGlobalHC !== null ? manualGlobalHC : totalHeadcountGeneral;
      const effectiveJornada = manualGlobalJornada;
      const avgDaysInPeriod = periodDaysActiveCount / (envStats.length || 1);
      
      const effectiveMH = (manualGlobalHC !== null || manualGlobalJornada !== 9)
        ? (effectiveHC * effectiveJornada * Math.max(1, avgDaysInPeriod))
        : periodActualMH;

      const productivity = effectiveMH > 0 ? Number((totalRealGeneral / effectiveMH).toFixed(2)) : 0;

      const baseDemand = totalPecasGeneral / (isDayView ? 1 : (periodDaysActiveCount / (envStats.length || 1) || 1));
      const baseReal = totalRealGeneral / (isDayView ? 1 : (periodDaysActiveCount / (envStats.length || 1) || 1));

      return {
        totalPecas: totalPecasGeneral,
        realPecas: totalRealGeneral,
        aggregateVolumeMeta,
        horizons: getHorizonStats(baseDemand, baseReal),
        mediaHeadcountTotal: Number(totalHeadcountGeneral.toFixed(1)),
        mediaHeadcountConf: Number((envStats.reduce((acc, curr) => acc + (curr.env === 'recebimento' ? curr.hcTotal : 0), 0)).toFixed(1)),
        mediaHeadcountAux: Number((envStats.reduce((acc, curr) => acc + (curr.env === 'separacao' ? curr.hcTotal : 0), 0)).toFixed(1)),
        manualHC: manualGlobalHC,
        manualJornada: manualGlobalJornada,
        diasAtivos: totalActivesInPeriod,
        productivity,
        envStats,
        monthlyReal: globalMonthlyReal,
        monthlyPecas: globalMonthlyPecas,
        isDayView,
        isWeekView,
        isMonthView,
        isYearView
      };
    }

    const targetData = (isWeekView || isMonthView || isYearView)
      ? data.atual 
      : data.atual.filter(d => d.id === dashboardDateFilter);

    const totalPecas = targetData.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0);
    const totalReal = targetData.reduce((acc, curr) => acc + (Number(curr.real) || 0), 0);
    const ativos = targetData.filter(i => (Number(i.pecas) || 0) > 0 || (Number(i.real) || 0) > 0);
    const count = ativos.length || 1;
    
    const realPecas = totalReal;
    const displayTotalPecas = totalPecas;
    const displayRealPecas = totalReal;
    
    const totalMHConf = targetData.reduce((acc, curr) => acc + ((Number(curr.conferentes) || 0) * (Number(curr.jornada) || 9)), 0);
    const totalMHAux = targetData.reduce((acc, curr) => acc + ((Number(curr.auxiliares) || 0) * (Number(curr.jornada) || 9)), 0);
    
    const mediaRealConf = totalMHConf > 0 ? Math.round(totalReal / totalMHConf) : 0;
    const mediaRealAux = totalMHAux > 0 ? Math.round(totalReal / totalMHAux) : 0;

    const mediaHeadcountConf = Number((ativos.reduce((acc, curr) => acc + (Number(curr.conferentes) || 0), 0) / count).toFixed(1));
    const mediaHeadcountAux = Number((ativos.reduce((acc, curr) => acc + (Number(curr.auxiliares) || 0), 0) / count).toFixed(1));
    
    const mediaHeadcountTotal = selectedEnv === 'separacao' 
      ? mediaHeadcountAux 
      : Number((mediaHeadcountConf + mediaHeadcountAux).toFixed(1));

    const baseDemand = displayTotalPecas / (isDayView ? 1 : count);
    const baseReal = displayRealPecas / (isDayView ? 1 : count);

    return { 
      totalPecas: displayTotalPecas,
      realPecas: displayRealPecas,
      horizons: getHorizonStats(baseDemand, baseReal),
      diasAtivos: ativos.length, 
      mediaRealConf, 
      mediaRealAux, 
      mediaHeadcountConf, 
      mediaHeadcountAux, 
      mediaHeadcountTotal,
      isDayView,
      isWeekView,
      isMonthView,
      isYearView
    };
  }, [allData, dashboardDateFilter, selectedEnv, manualGlobalHC, manualGlobalJornada, data.atual]);

  const consolidatedChartData = useMemo(() => {
    if (selectedEnv !== 'geral') return data.atual;
    
    const environments = ['recebimento', 'separacao'];
    const dias = ['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab'];
    
    return dias.map((dia, index) => {
      let totPecas = 0;
      let totReal = 0;
      
      environments.forEach(env => {
        const dayData = allData[env]?.atual?.[index];
        if (dayData) {
          totPecas += Number(dayData.pecas) || 0;
          totReal += Number(dayData.real) || 0;
        }
      });
      
      return {
        id: `fixo-${index}`,
        dia: dia,
        pecas: totPecas,
        real: totReal,
        // For compatibility with helper functions that might be used
        conferentes: 0,
        auxiliares: 0,
        jornada: 9
      };
    });
  }, [allData, data.atual, selectedEnv]);

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
            transition={{ duration: 0.3 }}
            className="fixed inset-0 z-50 bg-[#F1F5F9] flex items-center justify-center p-6"
          >
            <div className="max-w-4xl w-full text-center space-y-8 sm:space-y-12">
              <div className="space-y-3 sm:space-y-4">
                <div className="w-16 sm:w-20 h-1 sm:h-1.5 bg-blue-900 rounded-full mx-auto" />
                <h2 className="text-3xl sm:text-4xl md:text-5xl font-black text-slate-900 uppercase tracking-tighter">
                  Escolha o seu <span className="text-blue-900">Ambiente</span>
                </h2>
                <p className="text-slate-500 font-bold uppercase tracking-widest text-[10px] sm:text-xs px-4">Selecione o fluxo de operação para iniciar a gestão</p>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-6 sm:gap-8 max-h-[60vh] md:max-h-none overflow-y-auto md:overflow-visible p-2">
                {[
                  { id: 'recebimento', label: 'Recebimento', icon: ArrowRightLeft, color: 'bg-blue-900', description: 'Gestão de entrada de mercadorias e conferência inicial.', maintenance: false },
                  { id: 'separacao', label: 'Separação', icon: Zap, color: 'bg-red-900', description: 'Controle de picking, organização de pedidos e fluxo de saída.', maintenance: false },
                  { id: 'inventario', label: 'Inventário Pro', icon: Package, color: 'bg-emerald-800', description: 'Controle inteligente de movimentação, saldo e divergências.', maintenance: false },
                  { id: 'geral', label: 'Gestão Geral', icon: ShieldCheck, color: 'bg-slate-900', description: 'Visão consolidada de todos os ambientes, KPIs globais e análise.', maintenance: true }
                ].map(env => (
                  <button
                    key={env.id}
                    onClick={() => {
                        if (env.maintenance) return;
                        setSelectedEnv(env.id as Environment);
                        if (env.id === 'inventario') {
                            setActiveTab('inventory_main');
                        } else {
                            setActiveTab('calculadora');
                        }
                    }}
                    disabled={env.maintenance}
                    className={`group bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] border-2 border-transparent ${env.maintenance ? 'opacity-60 grayscale cursor-not-allowed' : 'hover:border-blue-900 shadow-lg hover:shadow-2xl cursor-pointer'} transition-all duration-300 text-left flex flex-col gap-4 sm:gap-6 relative overflow-hidden shrink-0`}
                  >
                    <div className={`absolute top-0 right-0 w-24 sm:w-32 h-24 sm:h-32 bg-slate-50 ${env.maintenance ? '' : 'group-hover:bg-blue-50'} rounded-full -mr-12 sm:-mr-16 -mt-12 sm:-mt-16 transition-colors`} />
                    <div className={`${env.color} w-12 sm:w-16 h-12 sm:h-16 rounded-xl sm:rounded-2xl flex items-center justify-center text-white shadow-lg relative z-10 ${env.maintenance ? '' : 'group-hover:scale-110'} transition-transform`}>
                      <env.icon size={24} className="sm:size-[30px]" />
                    </div>
                    <div className="relative z-10">
                      <h3 className={`text-xl sm:text-2xl font-black text-slate-900 uppercase tracking-tight ${env.maintenance ? 'line-through text-slate-400' : ''}`}>{env.label}</h3>
                      {env.maintenance && (
                        <p className="text-red-700 text-[10px] sm:text-xs font-black uppercase tracking-widest mt-1 animate-pulse">Em Manutenção</p>
                      )}
                      <p className="text-slate-500 text-xs sm:text-sm font-medium mt-1.5 sm:mt-2 leading-relaxed opacity-60">
                        {env.maintenance ? 'Ambiente restrito: Em manutenção.' : 'Apenas Simulador de Demanda disponível.'}
                      </p>
                    </div>
                    <div className={`flex items-center gap-2 ${env.maintenance ? 'text-slate-400' : 'text-blue-900'} font-bold uppercase tracking-widest text-[9px] sm:text-[10px] mt-2 sm:mt-4 ${env.maintenance ? 'opacity-100' : 'opacity-0 group-hover:opacity-100'} transition-opacity`}>
                      {env.maintenance ? 'Indisponível' : 'Simular Demanda'} <Check size={14} />
                    </div>
                  </button>
                ))}
              </div>
              
              <footer className="pt-8 sm:pt-12 text-center border-t border-slate-200">
                <p className="text-[8px] sm:text-[9px] font-bold text-slate-400 gap-2 flex items-center justify-center uppercase tracking-[0.3em] sm:tracking-[0.4em]">
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
            transition={{ duration: 0.5, ease: "circOut" }}
            className="fixed inset-0 z-[100] bg-[#0F172A] flex flex-col items-center justify-center text-white"
          >
            <motion.div
              initial={{ scale: 0.8, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              transition={{ duration: 0.6, ease: "backOut" }}
              className="text-center"
            >
              <div className="w-24 h-24 bg-blue-900 rounded-[2.5rem] flex items-center justify-center mb-8 mx-auto shadow-2xl shadow-blue-500/20 border border-blue-400/30">
                <ArrowRightLeft className="w-12 h-12 text-white animate-pulse" />
              </div>
              <h1 className="text-4xl font-bold tracking-tighter uppercase mb-2">
                Gestão integrada
              </h1>
              <div className="h-1 w-48 bg-slate-800 mx-auto rounded-full overflow-hidden relative">
                <motion.div 
                  initial={{ left: "-100%" }}
                  animate={{ left: "100%" }}
                  transition={{ repeat: Infinity, duration: 1, ease: "linear" }}
                  className="absolute top-0 bottom-0 w-1/2 bg-gradient-to-r from-transparent via-red-800 to-transparent"
                />
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>      <div className="min-h-screen flex flex-col bg-[#F1F5F9] font-sans">
        {/* TOP NAVIGATION BAR */}
        {selectedEnv && (
          <header className="sticky top-0 z-50 bg-[#1E293B] text-white shadow-xl no-print">
            <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
              <div className="flex items-center justify-between h-20">
                {/* Logo Area */}
                <button 
                  onClick={() => setSelectedEnv(null)}
                  className="flex items-center gap-3 group text-left"
                >
                  <div className="w-10 h-10 bg-blue-900 rounded-xl flex items-center justify-center shadow-[0_0_20px_rgba(30,58,138,0.4)] group-hover:rotate-6 transition-all duration-500">
                    <ShieldCheck className="w-6 h-6 text-white" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-white font-black tracking-tight uppercase text-xl sm:text-2xl leading-none">Gestão integrada</span>
                    <span className="text-xs font-black text-blue-300 uppercase tracking-widest mt-1.5 font-mono">
                      {selectedEnv === 'geral' ? 'Módulo: VISÃO GLOBAL' : `Ambiente: ${selectedEnv?.toUpperCase()}`}
                    </span>
                  </div>
                </button>

                {/* Desktop Navigation */}
                <nav className="hidden md:flex items-center gap-1">
                  {[
                    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, maintenance: true },
                    { id: 'input', label: 'Gestão Operacional', icon: Zap, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: true },
                    { id: 'meta', label: 'Configurações', icon: Target, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: true },
                    { id: 'calculadora', label: 'Simular demanda', icon: Calculator, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: false },
                    { id: 'inventory_main', label: 'Analytics', icon: Activity, hidden: selectedEnv !== 'inventario' }
                  ].filter(item => !item.hidden).map(item => (
                    <button 
                      key={item.id}
                      onClick={() => !item.maintenance && setActiveTab(item.id)}
                      disabled={item.maintenance}
                      className={`flex items-center gap-2 px-6 py-4 rounded-xl text-base font-bold transition-all duration-300 group ${
                        activeTab === item.id 
                        ? 'bg-blue-900/30 text-blue-400 border border-blue-500/30 shadow-inner' 
                        : 'text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent'
                      } ${item.maintenance ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                    >
                      <item.icon size={20} className={`${activeTab === item.id ? 'text-blue-400' : 'text-slate-500 group-hover:text-slate-300'} transition-colors`} />
                      <span className={`tracking-wide uppercase ${item.maintenance ? 'line-through' : ''}`}>{item.label}</span>
                      {item.maintenance && <span className="text-[8px] font-black bg-red-900 text-white px-2 py-0.5 rounded ml-2 shadow-lg">EM MANUTENÇÃO</span>}
                    </button>
                  ))}
                </nav>

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
                      { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard, maintenance: true },
                      { id: 'input', label: 'Gestão Operacional', icon: Zap, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: true },
                      { id: 'meta', label: 'Configurações', icon: Target, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: true },
                      { id: 'calculadora', label: 'Simular demanda', icon: Calculator, hidden: selectedEnv === 'geral' || selectedEnv === 'inventario', maintenance: false },
                      { id: 'inventory_main', label: 'Analytics', icon: Activity, hidden: selectedEnv !== 'inventario' }
                    ].filter(item => !item.hidden).map(item => (
                      <button 
                        key={item.id}
                        onClick={() => { if(!item.maintenance) { setActiveTab(item.id); setIsMobileMenuOpen(false); } }}
                        disabled={item.maintenance}
                        className={`w-full flex items-center gap-4 px-6 py-4 rounded-xl text-sm font-bold transition-all ${
                          activeTab === item.id 
                          ? 'bg-blue-900 text-white' 
                          : 'text-slate-400 hover:bg-slate-800'
                        } ${item.maintenance ? 'opacity-40 grayscale cursor-not-allowed' : ''}`}
                      >
                        <item.icon size={20} />
                        <span className={`uppercase tracking-widest ${item.maintenance ? 'line-through text-slate-500' : ''}`}>{item.label}</span>
                        {item.maintenance && <span className="text-[8px] font-black bg-red-900 text-white px-2 py-0.5 rounded ml-auto">EM MANUTENÇÃO</span>}
                      </button>
                    ))}
                    <div className="pt-4 mt-2 border-t border-slate-800">
                      <button 
                        onClick={() => { window.print(); setIsMobileMenuOpen(false); }} 
                        className="w-full flex items-center gap-4 px-6 py-4 rounded-xl text-sm font-bold text-blue-400 bg-blue-400/10"
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
        )}

        <main className="flex-1 min-w-0 overflow-y-auto max-h-screen bg-[#F1F5F9] print:bg-white print:max-h-none print:overflow-visible">
          <div className="p-6 md:p-10 max-w-7xl mx-auto print:p-0 print:max-w-none">
            {/* Context Header */}
            <div className="mb-4 sm:mb-8 flex flex-col md:flex-row justify-between items-start md:items-end gap-6 no-print border-b border-slate-200 pb-4 sm:pb-6">
              <div className="w-full">
                  <div className="flex items-center gap-2 mb-2 sm:mb-4">
                    <div className="h-1.5 w-8 sm:w-12 bg-blue-900 rounded-full" />
                    <span className="text-[10px] sm:text-sm font-black text-slate-400 uppercase tracking-[0.3em]">
                      {selectedEnv === 'geral' ? 'Visão Consolidada' : `Ambiente ${selectedEnv}`}
                    </span>
                  </div>
                  <h1 className="text-xl sm:text-3xl font-black text-slate-900 tracking-tighter uppercase leading-tight">
                    {selectedEnv === 'geral' ? 'Dashboard geral das operações' : (
                      activeTab === 'dashboard' ? 'Performance' : 
                      activeTab === 'input' ? 'Operações' : 
                      activeTab === 'meta' ? 'Parametrização' : 'Simular'
                    )}
                  </h1>
              </div>
              <div className="flex items-center gap-3 no-print bg-white px-4 sm:px-5 py-2.5 sm:py-3 rounded-2xl border border-slate-200 shadow-sm w-full sm:w-auto justify-between sm:justify-start">
                <select 
                  className="bg-transparent border-none text-[10px] sm:text-xs font-black uppercase tracking-widest outline-none cursor-default text-slate-400 appearance-none pointer-events-none"
                  value={selectedMonth}
                  onChange={(e) => setSelectedMonth(Number(e.target.value))}
                  disabled
                >
                  {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                    <option key={m} value={i} className="text-slate-900">{m}</option>
                  ))}
                </select>
                <div className="w-px h-6 bg-slate-200" />
                <select 
                  className="bg-transparent border-none text-[10px] sm:text-xs font-black uppercase tracking-widest outline-none cursor-default text-slate-400 appearance-none pointer-events-none"
                  value={selectedYear}
                  onChange={(e) => setSelectedYear(Number(e.target.value))}
                  disabled
                >
                  {[2024, 2025, 2026, 2027].map(y => (
                    <option key={y} value={y} className="text-slate-900">{y}</option>
                  ))}
                </select>
                <Calendar size={18} className="text-blue-900" />
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

            {/* PRINT ONLY FOOTER FIXED - trick for some browsers but let's use a simpler approach */}
            <div className="hidden print:block fixed bottom-0 left-0 right-0 py-4 border-t border-slate-200 text-center">
               <p className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">
                 Gestão Integrada Logística © 2026 - Relatório Gerencial Confidencial
               </p>
            </div>

            {/* --- DASHBOARD --- */}
            {activeTab === 'dashboard' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300 print:space-y-8 print:animate-none">
                {/* Date Filter Bar */}
                <div className="flex flex-wrap items-center gap-3 no-print bg-white p-3 sm:p-4 rounded-2xl border border-slate-200 shadow-sm w-full lg:w-fit overflow-x-auto opacity-70 pointer-events-none">
                   <div className="flex gap-1.5 bg-slate-50 p-1 rounded-xl border border-slate-100 flex-shrink-0">
                     <button 
                       disabled
                       className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg text-[11px] sm:text-sm font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'semana' ? 'bg-blue-900 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                     >
                       Semana
                     </button>
                     <button 
                       disabled
                       className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg text-[11px] sm:text-sm font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'mes' ? 'bg-blue-900 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                     >
                       Mês
                     </button>
                     <button 
                       disabled
                       className={`px-3 sm:px-5 py-2.5 sm:py-3 rounded-lg text-[11px] sm:text-sm font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'ano' ? 'bg-blue-900 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-white hover:text-slate-600'}`}
                     >
                       Ano
                     </button>
                   </div>
                   <div className="w-px h-8 bg-slate-200 mx-1 hidden sm:block" />
                   <div className="flex gap-2 overflow-x-auto pb-1 sm:pb-0 scrollbar-hide">
                     {generateWeeklyStructure().map(dia => (
                       <button
                         key={dia.id}
                         disabled
                         className={`px-3 sm:px-4 py-2.5 sm:py-3 rounded-lg text-[10px] sm:text-sm font-black uppercase tracking-widest transition-all min-w-[50px] sm:min-w-[60px] flex-shrink-0 ${dashboardDateFilter === dia.id ? 'bg-blue-900 text-white shadow-lg shadow-blue-200' : 'text-slate-400 hover:bg-slate-50'}`}
                       >
                         {dia.dia.substring(0, 3)}
                       </button>
                     ))}
                   </div>
                </div>

                {selectedEnv === 'geral' ? (
                  /* GESTÃO GERAL VIEW */
                  <div className="space-y-8 print:space-y-10">
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 print:grid-cols-2 print:gap-4">
                      <div className="bg-white p-5 sm:p-6 rounded-[1.2rem] sm:rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col justify-between group hover:shadow-lg transition-all duration-500 print:shadow-none print:break-inside-avoid print:border-slate-300">
                        <div>
                          <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 sm:mb-4">Fluxo Consolidado</p>
                          <div className="flex flex-col gap-1.5">
                            <div className="flex items-baseline gap-2.5">
                              <span className="text-4xl sm:text-5xl font-black text-slate-900 tracking-tighter">{stats.realPecas?.toLocaleString()}</span>
                              <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">Realizado</span>
                            </div>
                            <div className="bg-slate-50 px-3 py-1.5 rounded-lg border border-slate-100 w-fit">
                              <p className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-tight">
                                Programado: <span className="text-blue-900 ml-1">{stats.totalPecas?.toLocaleString()}</span>
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 sm:mt-8 flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-blue-500" />
                             <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-tight">Total Operação</span>
                          </div>
                          <BarChart2 size={24} className="text-slate-100 group-hover:text-blue-100 transition-colors hidden sm:block" />
                        </div>
                      </div>

                      <div className="bg-white p-5 sm:p-6 rounded-[1.2rem] sm:rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col justify-between group hover:shadow-lg transition-all duration-500 print:shadow-none print:break-inside-avoid print:border-slate-300">
                        <div>
                          <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 sm:mb-4">Produtividade Global</p>
                          <div className="flex items-baseline gap-2.5">
                            <span className={`text-4xl sm:text-5xl font-black tracking-tighter ${stats.productivity >= 65 ? 'text-blue-900' : 'text-red-900'}`}>
                              {stats.productivity}
                            </span>
                            <span className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase">PÇ / H</span>
                          </div>
                        </div>
                        <div className="mt-6 sm:mt-8 flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100">
                          <div className="flex items-center gap-1.5">
                             <div className={`w-2 h-2 rounded-full ${stats.productivity >= 65 ? 'bg-blue-600' : 'bg-red-700'}`} />
                             <span className="text-[10px] sm:text-xs font-black text-slate-500 uppercase tracking-tight">Meta: 65,00 PÇ / H</span>
                          </div>
                          {stats.productivity >= 65 ? <CheckCircle2 size={24} className="text-blue-600" /> : <AlertTriangle size={24} className="text-red-700" />}
                        </div>
                      </div>

                      <div className="bg-white p-5 sm:p-6 rounded-[1.2rem] sm:rounded-[1.5rem] shadow-sm border border-slate-200 flex flex-col justify-between group hover:shadow-lg transition-all duration-500 print:shadow-none print:break-inside-avoid print:border-slate-300">
                        <div>
                          <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-2 sm:mb-4">Efetivo Consolidado</p>
                          <div className="flex flex-col gap-3.5 sm:gap-6">
                            <div className="flex items-center gap-3 sm:gap-5">
                              <div className="flex flex-col">
                                <span className="text-[10px] font-black text-slate-400 uppercase mb-1.5 tracking-tighter">Equipe</span>
                                <input 
                                  type="number"
                                  value={manualGlobalHC !== null ? manualGlobalHC : stats.mediaHeadcountTotal}
                                  disabled
                                  className="w-20 sm:w-28 text-3xl sm:text-4xl font-black text-slate-400 bg-slate-50 rounded-lg px-3 py-1.5 border border-slate-100 outline-none shadow-inner transition-all cursor-not-allowed opacity-50"
                                  placeholder="0"
                                />
                              </div>
                              <span className="text-xs sm:text-sm font-bold text-slate-400 uppercase self-end mb-2">Colab. Total</span>
                            </div>
                            
                            <div className="grid grid-cols-2 gap-4 pb-4 border-b border-slate-100">
                               <div className="bg-blue-50/50 p-3 rounded-xl border border-blue-100/50 opacity-70">
                                 <p className="text-[9px] font-black text-blue-600 uppercase tracking-widest mb-1">Capacidade Meta (Sum)</p>
                                 <p className="text-lg font-black text-blue-900/50">
                                   {(stats.aggregateVolumeMeta || 0).toLocaleString()}
                                   <span className="text-[10px] ml-1">PÇS</span>
                                 </p>
                               </div>
                               <div className="bg-red-50/50 p-3 rounded-xl border border-red-100/50 opacity-70">
                                 <p className="text-[9px] font-black text-red-600 uppercase tracking-widest mb-1">Total Real Mês</p>
                                 <p className="text-lg font-black text-red-900/50">
                                   {(stats.monthlyReal || 0).toLocaleString()}
                                   <span className="text-[10px] ml-1">PÇS</span>
                                 </p>
                               </div>
                            </div>

                            <div className="flex items-center justify-between opacity-50 pointer-events-none">
                              <div className="flex flex-col">
                                <span className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase mb-1 tracking-tighter">Jornada</span>
                                <div className="flex items-center gap-2">
                                  <input 
                                    type="number"
                                    value={manualGlobalJornada}
                                    disabled
                                    className="w-12 sm:w-16 text-sm sm:text-lg font-black text-slate-400 bg-slate-100 rounded-lg px-2 sm:px-3 py-1 border-none outline-none cursor-not-allowed"
                                  />
                                  <span className="text-[9px] sm:text-[10px] font-bold text-slate-400 uppercase">H/Dia</span>
                                </div>
                              </div>
                              
                              <button 
                                disabled
                                className="p-1 sm:p-2 text-slate-200 cursor-not-allowed"
                                title="Inativo"
                              >
                                <Settings2 size={16} />
                              </button>
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 sm:mt-8 flex items-center justify-between pt-4 sm:pt-6 border-t border-slate-100">
                          <div className="flex items-center gap-2">
                             <div className="w-2 h-2 rounded-full bg-blue-500" />
                             <span className="text-[9px] sm:text-[10px] font-black text-slate-500 uppercase tracking-tight">Simulação de Impacto</span>
                          </div>
                          <Activity size={20} className="text-blue-500 opacity-50 hidden sm:block" />
                        </div>
                      </div>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 sm:gap-8">
                       <div className="bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm overflow-hidden relative">
                         <div className="absolute top-0 right-0 p-8 hidden sm:block">
                            <Layers className="text-blue-900/5" size={120} />
                         </div>
                         <h3 className="text-lg sm:text-xl font-black text-slate-900 uppercase tracking-tighter mb-6 sm:mb-8 flex items-center gap-3">
                           <span className="w-1.5 sm:w-2 h-6 sm:h-8 bg-blue-900 rounded-full" />
                           Distribuição por Área
                         </h3>
                         <div className="space-y-6 relative z-10">
                           {stats.envStats?.map((env: any) => (
                             <div key={env.env} className="group">
                               <div className="flex justify-between items-end mb-2">
                                 <div>
                                   <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest">{env.env === 'recebimento' ? 'Recebimento' : 'Separação'}</p>
                                   <div className="flex flex-col gap-1">
                                     <p className="text-xl sm:text-2xl font-black text-slate-800 leading-none">
                                       {env.totalReal.toLocaleString()} <span className="text-xs font-bold text-slate-500 uppercase">Real</span>
                                     </p>
                                     <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">
                                       Programado: <span className="text-blue-600">{env.totalPecas.toLocaleString()}</span>
                                     </p>
                                   </div>
                                 </div>
                                 <div className="text-right">
                                   <p className="text-[9px] sm:text-[10px] font-black text-blue-400 uppercase tracking-tighter">Eq. Média: {env.hcTotal}</p>
                                   <p className="text-xs sm:text-sm font-black text-slate-600">{Math.round((env.totalPecas / stats.totalPecas) * 100)}%</p>
                                 </div>
                               </div>
                               <div className="h-3 sm:h-4 bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                                 <motion.div 
                                   initial={{ width: 0 }}
                                   animate={{ width: `${(env.totalPecas / stats.totalPecas) * 100}%` }}
                                   transition={{ duration: 1, ease: "circOut" }}
                                   className={`h-full ${env.env === 'recebimento' ? 'bg-blue-900' : 'bg-red-800'}`}
                                 />
                               </div>
                             </div>
                           ))}
                         </div>
                       </div>

                       <div className="bg-white p-6 sm:p-10 rounded-[1.5rem] sm:rounded-[2.5rem] border border-slate-200 shadow-sm flex flex-col justify-center text-center space-y-4 sm:space-y-6">
                         <div className="w-16 sm:w-20 h-16 sm:h-20 bg-slate-50 rounded-[1.5rem] sm:rounded-[2rem] flex items-center justify-center mx-auto text-blue-900">
                           <Calendar className="w-8 sm:w-10 h-8 sm:h-10" />
                         </div>
                         <div>
                           <h4 className="text-base sm:text-lg font-black text-slate-900 uppercase tracking-tight">Insights de Gestão</h4>
                           <p className="text-slate-500 text-xs sm:text-sm font-medium mt-2 leading-relaxed max-w-sm mx-auto">
                             Operação em equilíbrio. Monitorar headcount volante para picos de demanda no recebimento.
                           </p>
                         </div>
                         <div className="pt-4 sm:pt-6 border-t border-slate-100 grid grid-cols-2 gap-3 sm:gap-4">
                           <div className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl">
                             <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Dias</p>
                             <p className="text-lg sm:text-xl font-black text-slate-800">{stats.diasAtivos / (stats.envStats?.length || 1)}</p>
                           </div>
                           <div className="p-3 sm:p-4 bg-slate-50 rounded-xl sm:rounded-2xl">
                             <p className="text-[9px] sm:text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Equipe</p>
                             <p className="text-lg sm:text-xl font-black text-slate-800">{stats.mediaHeadcountTotal}</p>
                           </div>
                         </div>
                       </div>
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4 no-print">
                      <div className="bg-blue-50/50 p-4 sm:p-5 rounded-2xl border border-blue-100/50">
                          <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-widest mb-1.5">Diário</p>
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-blue-900 leading-none">
                              {stats.isDayView 
                                ? (stats.realPecas ?? 0).toLocaleString()
                                : Math.round((stats.horizons?.dia?.real || 0)).toLocaleString()
                              }
                            </p>
                            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Programado: <span className="text-blue-600 font-black">{stats.isDayView 
                                ? (stats.totalPecas ?? 0).toLocaleString()
                                : Math.round((stats.horizons?.dia?.demand || 0)).toLocaleString()
                              }</span>
                            </p>
                          </div>
                      </div>
                      <div className="bg-red-50/50 p-4 sm:p-5 rounded-2xl border border-red-100/50">
                          <p className="text-[10px] sm:text-xs font-black text-red-600 uppercase tracking-widest mb-1.5">Semanal</p>
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-red-900 leading-none">
                              {selectedEnv === 'geral' 
                                ? (stats.realPecas ?? 0).toLocaleString() 
                                : data.atual.reduce((acc, curr) => acc + (Number(curr.real) || 0), 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Programado: <span className="text-red-700 font-black">
                                {selectedEnv === 'geral' 
                                  ? (stats.totalPecas ?? 0).toLocaleString() 
                                  : data.atual.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0).toLocaleString()}
                              </span>
                            </p>
                          </div>
                      </div>
                      <div className="bg-blue-50/50 p-4 sm:p-5 rounded-2xl border border-blue-100/50">
                          <p className="text-[10px] sm:text-xs font-black text-blue-400 uppercase tracking-widest mb-1.5">Mensal</p>
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-blue-900 leading-none">
                              {selectedEnv === 'geral' 
                                ? (stats.monthlyReal || stats.realPecas || 0).toLocaleString() 
                                : data.atual.reduce((acc, curr) => acc + (Number(curr.real) || 0), 0).toLocaleString()}
                            </p>
                            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">
                              Programado: <span className="text-blue-700 font-black">
                                {selectedEnv === 'geral' 
                                  ? (stats.monthlyPecas || stats.totalPecas || 0).toLocaleString() 
                                  : data.atual.reduce((acc, curr) => acc + (Number(curr.pecas) || 0), 0).toLocaleString()}
                              </span>
                            </p>
                          </div>
                      </div>
                      <div className="bg-slate-50/50 p-4 sm:p-5 rounded-2xl border border-slate-100/50">
                          <p className="text-[10px] sm:text-xs font-black text-slate-400 uppercase tracking-widest mb-1.5">Capacidade Meta</p>
                          <div className="flex flex-col gap-1.5">
                            <p className="text-xl sm:text-2xl font-black text-slate-900 leading-none">{(stats.aggregateVolumeMeta || 6000).toLocaleString()}</p>
                            <p className="text-[10px] sm:text-xs font-bold text-slate-500 uppercase tracking-widest">Ref. Operacional</p>
                          </div>
                      </div>
                  </div>

                <div className="bg-slate-900 rounded-3xl p-6 sm:p-8 text-white relative overflow-hidden shadow-2xl border border-slate-800 print:bg-white print:text-slate-900 print:border-slate-300 print:shadow-none print:break-inside-avoid">
                  <div className="absolute top-0 right-0 w-64 h-64 bg-blue-500/10 rounded-full blur-3xl -mr-32 -mt-32 pointer-events-none print:hidden" />
                  <div className="relative z-10">
                    <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 mb-8">
                       <div className="flex flex-col sm:flex-row sm:items-baseline gap-4">
                         <div>
                           <h3 className="text-xl sm:text-2xl font-black tracking-tight mb-1">Cenário Consolidado</h3>
                           <p className="text-slate-400 text-[10px] sm:text-xs font-bold uppercase tracking-widest print:text-slate-500">Projeção de Performance Global</p>
                         </div>
                         <div className="flex items-center gap-2 bg-white/5 p-1.5 rounded-xl border border-white/10 no-print opacity-50 pointer-events-none">
                            <select 
                              className="bg-transparent text-[10px] font-black uppercase text-slate-500 outline-none cursor-default"
                              value={selectedMonth}
                              disabled
                            >
                              {['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'].map((m, i) => (
                                <option key={m} value={i} className="bg-slate-900">{m}</option>
                              ))}
                            </select>
                            <span className="text-white/10">|</span>
                            <select 
                              className="bg-transparent text-[10px] font-black uppercase text-slate-500 outline-none cursor-default"
                              value={selectedYear}
                              disabled
                            >
                              {[2024, 2025, 2026, 2027].map(y => (
                                <option key={y} value={y} className="bg-slate-900">{y}</option>
                              ))}
                            </select>
                         </div>
                       </div>
                       <div className="bg-white/10 px-4 py-2 rounded-xl border border-white/5 flex items-center gap-3 print:bg-slate-50 print:border-slate-200">
                          <div className="w-2 h-2 rounded-full bg-red-500 animate-pulse print:animate-none" />
                          <span className="text-[10px] font-black uppercase tracking-widest text-slate-300 print:text-slate-500">Live Dashboard</span>
                       </div>
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-3 gap-6 print:grid-cols-3 print:gap-2">
                       {['dia', 'mes', 'ano'].map((period) => {
                         const h = stats.horizons?.[period as keyof typeof stats.horizons];
                         if (!h) return null;
                         const label = period === 'dia' ? 'Diário' : period === 'mes' ? 'Mensal' : 'Anual';
                         const demand = Math.round(h.demand);
                         const real = Math.round(h.real);
                         const isOk = real >= demand;
                         const diff = real - demand;

                         return (
                           <div key={period} className="bg-white/5 border border-white/10 p-5 rounded-2xl hover:bg-white/[0.07] transition-all group print:bg-white print:border-slate-200 print:p-3">
                             <div className="flex items-center justify-between mb-4">
                                <span className="text-[10px] font-black text-blue-400 uppercase tracking-widest print:text-blue-900">{label}</span>
                                <div className={`px-2 py-0.5 rounded text-[9px] font-bold uppercase ${isOk ? 'bg-blue-600/20 text-blue-400 print:bg-blue-50 print:text-blue-800' : 'bg-red-800/20 text-red-500 print:bg-red-50 print:text-red-900'}`}>
                                  {isOk ? 'Meta OK' : 'Abaixo'}
                                </div>
                             </div>
                             <div className="space-y-4 print:space-y-2">
                               <div>
                                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Demanda Sugerida</p>
                                 <p className="text-2xl font-black print:text-lg">{demand.toLocaleString()}</p>
                               </div>
                               <div className="pt-3 border-t border-white/5 print:border-slate-100">
                                 <p className="text-[10px] font-bold text-slate-500 uppercase mb-1">Realizado / Movim.</p>
                                 <p className={`text-2xl font-black print:text-lg ${isOk ? 'text-blue-400 print:text-blue-900' : 'text-red-500 print:text-red-800'}`}>
                                   {real.toLocaleString()}
                                 </p>
                               </div>
                               <div className="flex items-center justify-between pt-2">
                                  <span className={`text-[10px] font-black uppercase ${isOk ? 'text-blue-500' : 'text-red-600'}`}>
                                    {diff >= 0 ? `+${diff.toLocaleString()}` : diff.toLocaleString()}
                                  </span>
                                  <div className="h-1 flex-1 mx-3 bg-white/5 rounded-full overflow-hidden print:bg-slate-100">
                                     <div 
                                       className={`h-full rounded-full transition-all duration-1000 ${isOk ? 'bg-blue-600' : 'bg-red-800'}`} 
                                       style={{ width: `${Math.min(100, (real / (demand || 1)) * 100)}%` }}
                                     />
                                  </div>
                                  <span className="text-[10px] font-bold text-slate-500">
                                    {Math.round((real / (demand || 1)) * 100)}%
                                  </span>
                               </div>
                             </div>
                           </div>
                         );
                       })}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-6 print:grid-cols-4">
                    <div className="bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300 print:break-inside-avoid transition-all hover:shadow-md">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">
                        {stats.isDayView ? 'Equipe Real' : stats.isYearView ? 'Média Anual' : stats.isMonthView ? 'Média Mensal' : 'Resumo Equipe'}
                      </span>
                      <div className="flex flex-col sm:flex-row items-start sm:items-end justify-between mt-4 sm:mt-8 gap-2">
                        <div>
                          <span className="text-5xl sm:text-6xl font-black text-blue-900 leading-none">{stats.mediaHeadcountTotal}</span>
                          <p className="text-xs sm:text-sm font-black text-slate-400 uppercase mt-3">
                            {stats.isDayView ? 'H. Real' : 'H. Médio'}
                          </p>
                        </div>
                            <div className="text-right sm:block hidden bg-slate-50 p-4 rounded-2xl border border-slate-100 print:p-2 print:border-slate-200">
                              {selectedEnv === 'geral' ? (
                                <>
                                  <p className="text-sm font-bold text-slate-500 uppercase tracking-tighter mb-1">Rec: {stats.mediaHeadcountConf}</p>
                                  <p className="text-sm font-bold text-slate-500 uppercase tracking-tighter">Sep: {stats.mediaHeadcountAux}</p>
                                </>
                              ) : (
                                <>
                                  {selectedEnv === 'separacao' ? (
                                    <div className="mb-2">
                                      <p className="text-[10px] font-black text-blue-600 uppercase tracking-widest">Prod. Média</p>
                                      <p className="text-2xl font-black text-slate-700 leading-none">{stats.mediaRealAux} <span className="text-[10px] text-slate-400">PÇ/H</span></p>
                                    </div>
                                  ) : (
                                    <p className="text-sm font-bold text-slate-500 uppercase tracking-tighter mb-1">{confLabel.substring(0, 1)}: {stats.mediaHeadcountConf}</p>
                                  )}
                                  <p className="text-sm font-bold text-slate-500 uppercase tracking-tighter">{auxLabel.substring(0, 1)}: {stats.mediaHeadcountAux}</p>
                                </>
                              )}
                            </div>
                      </div>
                    </div>
                    {selectedEnv !== 'separacao' && (
                      <div className="bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300 print:break-inside-avoid transition-all hover:shadow-md">
                        <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Prod. {confLabel}</span>
                        <div className="flex items-end justify-between mt-4 sm:mt-8">
                          <div>
                            <span className="text-3xl sm:text-6xl font-black text-slate-800 leading-none">{stats.mediaRealConf}</span>
                            <p className="text-xs sm:text-sm font-black text-slate-400 uppercase mt-3">Ref: {metas.CONFERENTE}</p>
                          </div>
                          <span className={`text-sm sm:text-base font-bold flex items-center mb-2 px-3 py-1 rounded-xl ${stats.mediaRealConf >= metas.CONFERENTE ? 'text-blue-600 bg-blue-50' : 'text-red-800 bg-red-50'}`}>
                            {Math.round((stats.mediaRealConf/metas.CONFERENTE)*100)}%
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300 print:break-inside-avoid transition-all hover:shadow-md">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">Prod. Auxiliar</span>
                      <div className="flex items-end justify-between mt-4 sm:mt-8">
                        <div>
                          <span className="text-3xl sm:text-6xl font-black text-slate-800 leading-none">{stats.mediaRealAux}</span>
                          <p className="text-xs sm:text-sm font-black text-slate-400 uppercase mt-3">Ref: {metas.AUXILIAR}</p>
                        </div>
                        <span className={`text-sm sm:text-base font-bold flex items-center mb-2 px-3 py-1 rounded-xl ${stats.mediaRealAux >= metas.AUXILIAR ? 'text-blue-600 bg-blue-50' : 'text-red-800 bg-red-50'}`}>
                          {Math.round((stats.mediaRealAux/metas.AUXILIAR)*100)}%
                        </span>
                      </div>
                    </div>
                    <div className="bg-white p-5 sm:p-8 rounded-xl sm:rounded-2xl shadow-sm border border-slate-200 flex flex-col justify-between print:shadow-none print:border-slate-300 print:break-inside-avoid transition-all hover:shadow-md">
                      <span className="text-[10px] sm:text-xs font-bold text-slate-400 uppercase tracking-widest leading-tight">
                        {stats.isDayView ? 'Fluxo vs Programado' : 'Real Movim. vs Programado'}
                      </span>
                      <div className="flex flex-col mt-4 sm:mt-8">
                        <div className="flex flex-col gap-3">
                          <div className="flex items-center justify-between">
                            <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Programado</span>
                            <span className="text-2xl sm:text-4xl font-black text-slate-800 print:text-2xl">{(stats.totalPecas ?? 0).toLocaleString()}</span>
                          </div>
                          <div className="flex items-center justify-between border-t border-slate-100 pt-5 print:pt-2">
                            <span className="text-sm sm:text-base font-black text-blue-500 uppercase tracking-widest print:text-xs">Real Movim.</span>
                            <span className={`text-3xl sm:text-5xl font-black print:text-3xl ${(stats.realPecas ?? 0) >= (stats.totalPecas ?? 0) ? 'text-blue-700' : 'text-red-900'}`}>
                              {(stats.realPecas ?? 0).toLocaleString()}
                            </span>
                          </div>
                        </div>
                        
                        <div className="flex items-center justify-between mt-8 sm:mt-12 bg-slate-50 p-4 sm:p-6 rounded-2xl border border-slate-100 print:mt-4 print:p-3 print:border-slate-200">
                          <p className={`text-sm sm:text-lg font-black uppercase tracking-tight print:text-xs ${(stats.realPecas ?? 0) >= (stats.totalPecas ?? 0) ? 'text-blue-600' : 'text-red-800'}`}>
                            {(stats.realPecas ?? 0) >= (stats.totalPecas ?? 0)
                              ? `+${((stats.realPecas ?? 0) - (stats.totalPecas ?? 0)).toLocaleString()} ${selectedEnv === 'recebimento' ? 'Excesso' : 'Extra'}` 
                              : `-${((stats.totalPecas ?? 0) - (stats.realPecas ?? 0)).toLocaleString()} ${selectedEnv === 'recebimento' ? 'NO-SHOW' : 'Pendente'}`}
                          </p>
                          <span className="text-lg sm:text-xl font-bold text-slate-500 bg-white px-3 py-1 rounded-lg border border-slate-200 print:text-sm">
                            {Math.round(((stats.realPecas ?? 0) / ((stats.totalPecas ?? 1) || 1)) * 100)}%
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 print:block print:space-y-6">
                    <div className="lg:col-span-2 bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden print:shadow-none print:break-inside-avoid">
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
                        <h3 className="text-sm font-bold text-slate-700 flex items-center uppercase">
                          <span className="w-2 h-6 bg-blue-900 rounded mr-3"></span>
                          Análise de Performance vs Metas
                        </h3>
                      </div>
                      <div className="p-6 h-[350px] w-full print:h-[250px]">
                        <ResponsiveContainer width="100%" height="100%">
                          <BarChart data={consolidatedChartData} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
                            <XAxis 
                              dataKey="dia" 
                              axisLine={false} 
                              tickLine={false} 
                              tick={{fontSize: 11, fontWeight: 700, fill: '#64748b'}} 
                              interval={0}
                            />
                            <YAxis axisLine={false} tickLine={false} tick={{fontSize: 11, fill: '#94a3b8'}} />
                            <Tooltip 
                              cursor={{fill: '#f1f5f9'}}
                              contentStyle={{borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)'}} 
                            />
                            <Legend wrapperStyle={{fontSize: '11px', fontWeight: 'bold', textTransform: 'uppercase', paddingTop: '20px'}} />
                            {selectedEnv !== 'geral' && (
                              <>
                                {selectedEnv !== 'separacao' && (
                                  <Bar name={`Real ${confLabel}`} dataKey={(d: DayData) => calculateProdReal(d.pecas, d.conferentes, d.jornada)} fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                                )}
                                <Bar name={`Real ${auxLabel}`} dataKey={(d: DayData) => calculateProdReal(d.pecas, d.auxiliares, d.jornada)} fill="#991b1b" radius={[4, 4, 0, 0]} />
                              </>
                            )}
                            {selectedEnv === 'geral' && (
                              <>
                                <Bar name="Volume Programado" dataKey="pecas" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                                <Bar name="Volume Realizado" dataKey="real" fill="#1e3a8a" radius={[4, 4, 0, 0]} />
                              </>
                            )}
                          </BarChart>
                        </ResponsiveContainer>
                      </div>
                    </div>

                    <div className="bg-white rounded-2xl shadow-sm border border-slate-200 flex flex-col overflow-hidden print:shadow-none print:break-inside-avoid">
                      <div className="px-6 py-4 bg-slate-50 border-b border-slate-200">
                        <h3 className="text-xs font-bold text-slate-700 uppercase tracking-wider">Histórico do Período</h3>
                      </div>
                      <div className="p-4 space-y-2">
                        {consolidatedChartData && consolidatedChartData.map(dia => {
                          const pecas = Number(dia.pecas) || 0;
                          const real = Number(dia.real) || 0;
                          const jornada = Number(dia.jornada) || 9;
                          const prodC = calculateProdReal(pecas, Number(dia.conferentes) || 0, jornada);
                          const prodA = calculateProdReal(pecas, Number(dia.auxiliares) || 0, jornada);
                          
                          const volumeOk = selectedEnv === 'geral' ? real >= pecas : pecas >= (metas.VOLUME || 6000);
                          const prodCOk = selectedEnv === 'separacao' || selectedEnv === 'geral' ? true : prodC >= (metas.CONFERENTE || 220);
                          const prodAOk = selectedEnv === 'geral' ? true : prodA >= (metas.AUXILIAR || 110);
                          
                          const isOk = selectedEnv === 'geral' ? volumeOk : (volumeOk && prodCOk && prodAOk);
                          const isZero = pecas === 0 && real === 0;
                          
                          return (
                            <div key={dia.id} className="flex items-center justify-between p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100">
                              <div className="flex items-center gap-3">
                                <div className={`w-1.5 h-1.5 rounded-full ${isZero ? 'bg-slate-300' : (isOk ? 'bg-blue-600' : 'bg-red-800')}`} />
                                <div>
                                  <p className="text-[11px] font-bold text-slate-800 uppercase">{selectedEnv === 'geral' ? dia.dia : dia.dia.split('-')[0]}</p>
                                  <p className="text-[10px] text-slate-400 font-bold">{selectedEnv === 'geral' ? `Prog: ${pecas.toLocaleString()}` : `${pecas.toLocaleString()} PÇS`}</p>
                                </div>
                              </div>
                              <div className="flex items-center gap-6">
                                {selectedEnv === 'geral' ? (
                                  <div className="text-right min-w-[50px]">
                                    <p className={`text-base font-black ${isZero ? 'text-slate-300' : (isOk ? 'text-blue-900' : 'text-red-900')}`}>
                                      {isZero ? '--' : real.toLocaleString()}
                                    </p>
                                    {!isZero && <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Real PÇ</p>}
                                  </div>
                                ) : (
                                  <>
                                    {!isZero && selectedEnv !== 'separacao' && (
                                      <div className="text-right border-r border-slate-200 pr-5">
                                        <p className={`text-sm font-black ${prodCOk ? 'text-blue-900' : 'text-red-900'}`}>
                                          {prodC}
                                        </p>
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{confLabel.substring(0, 1)} <span className="text-[8px] opacity-70">(PÇ/H)</span></p>
                                      </div>
                                    )}
                                    <div className="text-right min-w-[50px]">
                                      <p className={`text-base font-black ${isZero ? 'text-slate-300' : (prodAOk ? 'text-blue-900' : 'text-red-900')}`}>
                                        {isZero ? '--' : prodA}
                                      </p>
                                      {!isZero && <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">{selectedEnv === 'separacao' ? 'PÇ/H' : 'A'} <span className="text-[8px] opacity-70">(PÇ/H)</span></p>}
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </div>

                    <div className="bg-white rounded-[1.5rem] sm:rounded-[2rem] p-6 sm:p-10 border border-slate-200 shadow-xl print:shadow-none print:p-6 print:break-inside-avoid">
                    <div className="flex flex-col md:flex-row items-center justify-between gap-6 sm:gap-8">
                      <div className="text-center md:text-left">
                        <div className="flex items-center gap-2 justify-center md:justify-start mb-1">
                          <h3 className="text-lg sm:text-xl font-bold text-slate-800 uppercase">
                            ANÁLISE DE DIMENSIONAMENTO
                          </h3>
                          <div className="px-2 py-0.5 bg-blue-100 text-blue-700 text-[10px] font-black rounded-full uppercase tracking-tighter">Sugestão Inteligente</div>
                        </div>
                        <p className="text-slate-500 text-[10px] sm:text-xs font-medium">Dimensionamento ideal para processar <strong>{stats.horizons.dia.demand.toLocaleString()} PÇS/DIA</strong> {stats.horizons.dia.real > 0 && <span>(Real: <strong>{stats.horizons.dia.real.toLocaleString()}</strong>)</span>} com jornada de {stats.manualJornada || metas.JORNADA || 9}h</p>
                      </div>
                      <div className="flex gap-3 sm:gap-4 w-full sm:w-auto">
                        {selectedEnv !== 'separacao' && (() => {
                          const sugerido = calculateSugerido(stats.horizons.dia.demand, stats.manualJornada || metas.JORNADA || 9, metas.CONFERENTE || 220);
                          const atual = stats.mediaHeadcountConf || 0;
                          const gap = atual - sugerido;
                          return (
                            <div className={`flex-1 ${gap < 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} border p-4 sm:p-6 rounded-2xl sm:min-w-[160px] text-center transition-colors`}>
                              <p className={`text-[8px] sm:text-[9px] font-black uppercase mb-1 sm:mb-2 tracking-widest ${gap < 0 ? 'text-red-900' : 'text-blue-900'}`}>{confLabel}s</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900">{sugerido}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Ideal</p>
                              </div>
                              {stats.horizons.dia.real > 0 && (
                                <div className="mt-1 text-[9px] font-bold text-blue-900/60 uppercase">
                                  Real: {calculateSugerido(stats.horizons.dia.real, stats.manualJornada || metas.JORNADA || 9, metas.CONFERENTE || 220)} sug.
                                </div>
                              )}
                              <div className={`mt-2 text-[9px] font-black uppercase inline-flex items-center gap-1 px-2 py-0.5 rounded ${gap < 0 ? 'bg-red-600 text-white animate-pulse' : (gap > 0 ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')}`}>
                                {gap === 0 ? 'Equipe OK' : gap < 0 ? `Faltam ${Math.abs(gap)}` : `Sobram ${gap}`}
                              </div>
                            </div>
                          );
                        })()}
                        {(() => {
                          const sugerido = calculateSugerido(stats.horizons.dia.demand, stats.manualJornada || metas.JORNADA || 9, metas.AUXILIAR || 110);
                          const atual = stats.mediaHeadcountAux || 0;
                          const gap = atual - sugerido;
                          return (
                            <div className={`flex-1 ${gap < 0 ? 'bg-red-50 border-red-100' : 'bg-blue-50 border-blue-100'} border p-4 sm:p-6 rounded-2xl sm:min-w-[160px] text-center transition-colors`}>
                              <p className={`text-[8px] sm:text-[9px] font-black uppercase mb-1 sm:mb-2 tracking-widest ${gap < 0 ? 'text-red-900' : 'text-blue-900'}`}>Auxiliares</p>
                              <div className="flex items-baseline justify-center gap-1">
                                <p className="text-2xl sm:text-4xl font-black text-slate-900">{sugerido}</p>
                                <p className="text-[10px] font-bold text-slate-400 uppercase">Ideal</p>
                              </div>
                              {stats.horizons.dia.real > 0 && (
                                <div className="mt-1 text-[9px] font-bold text-blue-900/60 uppercase">
                                  Real: {calculateSugerido(stats.horizons.dia.real, stats.manualJornada || metas.JORNADA || 9, metas.AUXILIAR || 110)} sug.
                                </div>
                              )}
                              <div className={`mt-2 text-[9px] font-black uppercase inline-flex items-center gap-1 px-2 py-0.5 rounded ${gap < 0 ? 'bg-red-600 text-white animate-pulse' : (gap > 0 ? 'bg-emerald-600 text-white' : 'bg-blue-600 text-white')}`}>
                                {gap === 0 ? 'Equipe OK' : gap < 0 ? `Faltam ${Math.abs(gap)}` : `Sobram ${gap}`}
                              </div>
                            </div>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </>
              )}
            </div>
          )}

            {/* --- GESTÃO OPERACIONAL --- */}
            {activeTab === 'input' && (
              <>
                      <div className="flex flex-col lg:flex-row lg:items-center gap-4 no-print mb-8">
                  <div className="flex items-center gap-3 bg-slate-100 p-2 rounded-2xl w-fit">
                    <div className="flex items-center px-3 py-2 bg-blue-900 rounded-xl text-white mr-1 shadow-sm">
                      <Calendar size={14} className="mr-2" />
                      <span className="text-[10px] font-black uppercase tracking-widest">Base de Dados</span>
                    </div>
                    <select 
                      className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none cursor-default opacity-50"
                      value={selectedMonth}
                      disabled
                      readOnly
                    >
                      {['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'].map((m, i) => (
                        <option key={m} value={i}>{m}</option>
                      ))}
                    </select>
                    <select 
                      className="bg-white border border-slate-200 rounded-xl px-4 py-2 text-xs font-black uppercase tracking-widest outline-none cursor-default opacity-50"
                      value={selectedYear}
                      disabled
                      readOnly
                    >
                      {[2024, 2025, 2026, 2027].map(y => (
                        <option key={y} value={y}>{y}</option>
                      ))}
                    </select>
                  </div>

                  <div className="flex flex-wrap items-center gap-3 bg-white p-2 rounded-2xl border border-slate-200 shadow-sm w-fit opacity-50 pointer-events-none">
                    <button 
                      disabled
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'semana' ? 'bg-blue-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                      Semana
                    </button>
                    <button 
                      disabled
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'mes' ? 'bg-blue-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                      Mês
                    </button>
                    <button 
                      disabled
                      className={`px-4 py-2 rounded-lg text-[10px] font-black uppercase tracking-widest transition-all ${dashboardDateFilter === 'ano' ? 'bg-blue-900 text-white' : 'text-slate-400 hover:bg-slate-50'}`}
                    >
                      Ano
                    </button>
                    <div className="w-[1px] h-6 bg-slate-100 mx-1" />
                    <select
                      className={`bg-transparent text-[10px] font-black uppercase tracking-widest outline-none px-2 py-2 rounded-lg transition-all ${!['semana', 'mes', 'ano'].includes(dashboardDateFilter) ? 'text-blue-900 bg-blue-50' : 'text-slate-400'}`}
                      value={!['semana', 'mes', 'ano'].includes(dashboardDateFilter) ? dashboardDateFilter : ""}
                      disabled
                    >
                      <option value="" disabled>Selecione o Dia</option>
                      {data.atual.map((dia) => {
                        const isToday = dia.id === getCurrentDayId();
                        return (
                          <option key={dia.id} value={dia.id}>
                            {dia.dia} {isToday ? ' (HOJE)' : ''}
                          </option>
                        );
                      })}
                    </select>
                  </div>
                </div>

                <div className="space-y-8 animate-in fade-in slide-in-from-right-5 duration-300 print:space-y-6 print:animate-none">
                  <div className="hidden md:flex items-center gap-6 no-print">
                    <div className="bg-white p-7 rounded-2xl border border-slate-200 flex items-center gap-6 shadow-sm">
                      <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900"><Layers size={24}/></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Volume Periodo</p>
                        <p className="text-2xl font-black text-slate-800">{stats.realPecas.toLocaleString()}</p>
                      </div>
                    </div>
                    <div className="bg-white p-7 rounded-2xl border border-slate-200 flex items-center gap-6 shadow-sm border-l-4 border-l-red-800">
                      <div className="w-14 h-14 bg-red-50 rounded-xl flex items-center justify-center text-red-800"><Activity size={24}/></div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Prod. Média (H)</p>
                        <p className="text-2xl font-black text-slate-800">
                          {selectedEnv === 'separacao' ? stats.mediaRealAux : stats.mediaRealConf} 
                          <span className="text-sm text-slate-400 ml-2 uppercase">PÇ/H</span>
                        </p>
                      </div>
                    </div>
                  <div className="bg-white p-7 rounded-2xl border border-slate-200 flex items-center gap-6 shadow-sm">
                    <div className="w-14 h-14 bg-blue-50 rounded-xl flex items-center justify-center text-blue-900"><CalendarCheck size={24}/></div>
                    <div>
                      <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">Dias com Atividade</p>
                      <p className="text-2xl font-black text-slate-800">{stats.diasAtivos} <span className="text-sm text-slate-400">DIAS</span></p>
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
                          ? 'bg-white text-blue-900 shadow-sm' 
                          : 'text-slate-500 hover:text-slate-800'
                        }`}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-2 xl:grid-cols-3 gap-6 print:grid-cols-2 print:gap-6 print:break-after-auto">
                  {filteredOperationalData.map(item => {
                    const localJornada = Number(item.jornada) || metas.JORNADA || 9;
                    const localPecas = Number(item.pecas) || 0;
                    
                    const sugC = calculateSugerido(localPecas, localJornada, metas.CONFERENTE || 220);
                    const sugA = calculateSugerido(localPecas, localJornada, metas.AUXILIAR || 110);
                    const totalSugerido = selectedEnv === 'separacao' ? sugA : sugC + sugA;

                    const localRealVolume = Number(item.real) || 0;
                    const sugCReal = calculateSugerido(localRealVolume, localJornada, metas.CONFERENTE || 220);
                    const sugAReal = calculateSugerido(localRealVolume, localJornada, metas.AUXILIAR || 110);
                    const totalSugeridoReal = selectedEnv === 'separacao' ? sugAReal : sugCReal + sugAReal;
                    
                    const prodC = calculateProdReal(localPecas, Number(item.conferentes) || 0, localJornada);
                    const prodA = calculateProdReal(localPecas, Number(item.auxiliares) || 0, localJornada);
                    
                    const prodCActual = calculateProdReal(localRealVolume, Number(item.conferentes) || 0, localJornada);
                    const prodAActual = calculateProdReal(localRealVolume, Number(item.auxiliares) || 0, localJornada);

                    const hasData = localPecas > 0;
                    
                    const volumeOk = localPecas >= (metas.VOLUME || 6000);
                    const realOk = (Number(item.real) || 0) >= localPecas;
                    const prodCOk = prodC >= (metas.CONFERENTE || 220);
                    const prodAOk = prodA >= (metas.AUXILIAR || 110);
                    const prodCActualOk = prodCActual >= (metas.CONFERENTE || 220);
                    const prodAActualOk = prodAActual >= (metas.AUXILIAR || 110);
                    const staffingCOk = (Number(item.conferentes) || 0) >= sugC;
                    const staffingAOk = selectedEnv === 'separacao' ? true : (Number(item.auxiliares) || 0) >= sugA;
                    const diffC = (Number(item.conferentes) || 0) - sugC;
                    const diffA = (Number(item.auxiliares) || 0) - sugA;
                    const allOk = volumeOk && realOk && prodCOk && (selectedEnv === 'separacao' ? true : prodAOk);

                    return (
                      <div id={`card-${item.id}`} key={item.id} className={`bg-white rounded-3xl border overflow-hidden shadow-sm transition-all duration-300 print:shadow-none print:border-slate-300 print:break-inside-avoid ${
                        hasData 
                        ? (allOk ? 'border-blue-200 ring-1 ring-blue-50' : 'border-red-200 ring-1 ring-red-50') 
                        : 'border-slate-200 hover:border-blue-200'
                      }`}>
                        <div className={`px-6 py-4 flex justify-between items-center ${hasData ? (allOk ? 'bg-blue-50/30' : 'bg-red-50/30') : 'bg-slate-50'}`}>
                          <div>
                            <h3 className="font-bold text-xs uppercase text-slate-800 tracking-tight">{item.dia}</h3>
                            {hasData && (
                              <div className="flex flex-col gap-1 mt-1">
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${volumeOk ? 'bg-blue-600' : 'bg-red-600'}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${volumeOk ? 'text-blue-800' : 'text-red-900'}`}>
                                    Demanda: {volumeOk ? 'Comprometida' : 'Abaixo do Alvo'}
                                  </span>
                                </div>
                                <div className="flex items-center gap-1.5">
                                  <div className={`w-1.5 h-1.5 rounded-full ${realOk ? 'bg-blue-600' : 'bg-red-600'}`} />
                                  <span className={`text-[10px] font-bold uppercase tracking-wider ${realOk ? 'text-blue-800' : 'text-red-900'}`}>
                                    Fluxo: {(Number(item.real) || 0).toLocaleString()} PÇS {realOk ? '(OK)' : (selectedEnv === 'recebimento' ? '(NO-SHOW)' : '(PENDENTE)')}
                                  </span>
                                </div>
                              </div>
                            )}
                          </div>
                          <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${
                            hasData 
                            ? (allOk ? 'bg-blue-900 text-white shadow-lg shadow-blue-500/20' : 'bg-red-900 text-white shadow-lg shadow-red-500/20') 
                            : 'bg-slate-200 text-slate-400'
                          }`}>
                            {hasData ? (allOk ? <Check size={20} /> : <AlertTriangle size={20} />) : <Circle size={20} />}
                          </div>
                        </div>

                        <div className="p-6 space-y-5 print:p-4 print:space-y-3">
                          <div className="p-4 bg-blue-50/50 rounded-2xl border border-blue-100 flex flex-col gap-3 mb-4">
                              <div className="flex justify-between items-baseline">
                                 <span className="text-xs font-black text-blue-950 uppercase tracking-widest">Dimensionamento do Dia</span>
                                 <span className="text-[9px] font-bold text-slate-400 uppercase tracking-tighter">Sugestão p/ Programado</span>
                              </div>
                              <div className="grid grid-cols-3 gap-2">
                                 <div className="bg-white p-2 rounded-xl border border-blue-100 text-center shadow-sm">
                                   <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Total Homens</p>
                                   <p className="text-xl font-black text-blue-950">{totalSugerido}</p>
                                 </div>
                                 {selectedEnv !== 'separacao' && (
                                   <div className={`p-2 rounded-xl text-center border transition-all ${staffingCOk ? 'bg-white border-blue-100' : 'bg-red-50 border-red-200 shadow-sm'}`}>
                                     <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Sug. {confLabel.substring(0, 4)}</p>
                                     <p className={`text-xl font-black ${staffingCOk ? 'text-blue-900' : 'text-red-900'}`}>{sugC}</p>
                                   </div>
                                 )}
                                 <div className={`p-2 rounded-xl text-center border transition-all ${staffingAOk ? 'bg-white border-blue-100' : 'bg-red-50 border-red-200 shadow-sm'}`}>
                                   <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Sug. Aux</p>
                                   <p className={`text-xl font-black ${staffingAOk ? 'text-blue-900' : 'text-red-900'}`}>{sugA}</p>
                                 </div>
                              </div>

                              <div className="mt-2 pt-2 border-t border-blue-100/50">
                                <div className="flex justify-between items-baseline mb-2">
                                   <span className="text-[9px] font-black text-slate-400 uppercase tracking-widest">Ajuste p/ Real Movimentado</span>
                                </div>
                                <div className="grid grid-cols-3 gap-2">
                                   <div className="bg-blue-100/30 p-2 rounded-xl border border-blue-100 text-center shadow-sm">
                                     <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Total Sug.</p>
                                     <p className="text-xl font-black text-blue-900">{totalSugeridoReal}</p>
                                   </div>
                                   {selectedEnv !== 'separacao' && (
                                     <div className="bg-blue-100/30 p-2 rounded-xl border border-blue-100 text-center shadow-sm">
                                       <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">{confLabel.substring(0, 4)}</p>
                                       <p className="text-xl font-black text-blue-900">{sugCReal}</p>
                                     </div>
                                   )}
                                   <div className="bg-blue-100/30 p-2 rounded-xl border border-blue-100 text-center shadow-sm">
                                     <p className="text-[10px] font-bold text-slate-400 uppercase leading-tight">Auxiliar</p>
                                     <p className="text-xl font-black text-blue-900">{sugAReal}</p>
                                   </div>
                                </div>
                              </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Volume (PÇS)</label>
                              <input 
                                type="number" 
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-center text-slate-400 outline-none transition-all text-lg cursor-not-allowed"
                                value={item.pecas || ''} 
                                disabled
                                readOnly
                              />
                            </div>
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-blue-400 uppercase tracking-widest ml-1">Real Movim.</label>
                              <input 
                                type="number" 
                                className="w-full p-4 bg-blue-50/10 border border-blue-50 rounded-xl font-black text-center text-blue-300 outline-none transition-all text-lg cursor-not-allowed"
                                value={item.real || ''} 
                                disabled
                                readOnly
                              />
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 text-[10px]">Equipa (H)</label>
                              <input 
                                type="number" 
                                step="0.5"
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-center text-slate-400 outline-none transition-all text-lg cursor-not-allowed"
                                value={item.jornada || ''} 
                                disabled
                                readOnly
                              />
                            </div>
                            <div className="flex flex-col gap-1.5">
                               <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1 text-[10px]">Prod. Real</label>
                               <div className="flex-1 bg-slate-50 border border-slate-100 rounded-xl flex items-center justify-center font-black text-slate-300 text-lg">
                                 {calculateProdReal(item.real || item.pecas, (Number(item.conferentes) || 0) + (Number(item.auxiliares) || 0), item.jornada || 9)}
                               </div>
                            </div>
                          </div>

                          <div className="grid grid-cols-2 gap-4">
                            {selectedEnv !== 'separacao' && (
                              <div className="space-y-1.5">
                                <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">{confLabel}s</label>
                                <div className="relative">
                                  <input 
                                    type="number" 
                                    className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-center text-blue-300 outline-none transition-all text-lg cursor-not-allowed"
                                    value={item.conferentes || ''} 
                                    disabled
                                    readOnly
                                  />
                                  {hasData && (
                                    <div className={`absolute -top-2 -right-1 px-2 py-1 rounded text-xs font-black uppercase ${staffingCOk ? 'bg-blue-300 text-white' : 'bg-red-300 text-white'}`}>
                                      {diffC > 0 ? `+${diffC}` : diffC < 0 ? diffC : 'OK'}
                                    </div>
                                  )}
                                </div>
                              </div>
                            )}
                            <div className="space-y-1.5">
                              <label className="text-xs font-bold text-slate-400 uppercase tracking-widest ml-1">Auxiliares</label>
                              <div className="relative">
                                <input 
                                  type="number" 
                                  className="w-full p-4 bg-slate-50 border border-slate-100 rounded-xl font-black text-center text-slate-300 outline-none transition-all text-lg cursor-not-allowed"
                                  value={item.auxiliares || ''} 
                                  disabled
                                  readOnly
                                />
                                {hasData && (
                                  <div className={`absolute -top-2 -right-1 px-2 py-1 rounded text-xs font-black uppercase ${staffingAOk ? 'bg-blue-600 text-white' : 'bg-red-800 text-white animate-pulse'}`}>
                                    {diffA > 0 ? `+${diffA}` : diffA < 0 ? diffA : 'OK'}
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>

                          <div className="pt-4 border-t border-slate-100 space-y-4">
                            <div className="grid grid-cols-2 gap-2">
                              {selectedEnv !== 'separacao' && (
                                <div className="text-center">
                                  <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Meta {confLabel.substring(0, 4)}. (PÇ/H)</p>
                                  <p className={`text-xl font-black ${prodCOk ? 'text-blue-900' : 'text-red-900'}`}>{prodC} <span className="text-xs text-slate-400">/ {metas.CONFERENTE}</span></p>
                                </div>
                              )}
                              <div className={`text-center ${selectedEnv !== 'separacao' ? 'border-l border-slate-100' : ''}`}>
                                <p className="text-[10px] font-bold text-slate-400 uppercase tracking-tighter">Meta Aux. (PÇ/H)</p>
                                <p className={`text-xl font-black ${prodAOk ? 'text-blue-900' : 'text-red-900'}`}>{prodA} <span className="text-xs text-slate-400">/ {metas.AUXILIAR}</span></p>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2 p-3 bg-blue-50/50 rounded-xl border border-blue-100">
                              {selectedEnv !== 'separacao' && (
                                <div className="text-center">
                                  <p className="text-[10px] font-black text-blue-900/60 uppercase tracking-tighter">Real {confLabel.substring(0, 4)}. (PÇ/H)</p>
                                  <p className={`text-xl font-black ${prodCActualOk ? 'text-blue-900' : 'text-red-900'}`}>{prodCActual} <span className="text-xs text-blue-400/60">PÇ/H</span></p>
                                </div>
                              )}
                              <div className={`text-center ${selectedEnv !== 'separacao' ? 'border-l border-blue-100' : ''}`}>
                                <p className="text-[10px] font-black text-blue-900/60 uppercase tracking-tighter">Real Aux. (PÇ/H)</p>
                                <p className={`text-xl font-black ${prodAActualOk ? 'text-blue-900' : 'text-red-900'}`}>{prodAActual} <span className="text-xs text-blue-400/60">PÇ/H</span></p>
                              </div>
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
              <div className="max-w-4xl mx-auto animate-in fade-in zoom-in-95 duration-300 no-print">
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
                          <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Volume Previsto (PÇS)</label>
                          <input 
                            type="number" 
                            className="w-full p-6 bg-slate-50 border border-slate-100 rounded-2xl font-black text-4xl text-slate-800 focus:border-red-800 focus:bg-white focus:ring-4 focus:ring-red-500/10 outline-none transition-all shadow-inner" 
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
                          <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Horas Operacionais (H)</label>
                          <input 
                            type="number" 
                            step="0.5" 
                            className="w-full p-6 bg-slate-50 border border-slate-100 rounded-2xl font-black text-4xl text-slate-800 focus:border-red-800 focus:bg-white focus:ring-4 focus:ring-red-500/10 outline-none transition-all shadow-inner" 
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
                              <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Meta {confLabel.substring(0, 4)}. (PÇ/H)</label>
                              <input 
                                type="number" 
                                className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-2xl text-slate-700 focus:border-red-800 focus:bg-white outline-none transition-all" 
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
                            <label className="text-xs font-bold uppercase text-slate-400 tracking-widest ml-1">Meta Aux. (PÇ/H)</label>
                            <input 
                              type="number" 
                              className="w-full p-4 bg-slate-50 border border-slate-100 rounded-2xl font-black text-2xl text-slate-700 focus:border-red-800 focus:bg-white outline-none transition-all" 
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
                      <div className="space-y-6 relative z-10">
                        {selectedEnv !== 'separacao' && (
                          <div className="bg-blue-900 p-12 rounded-3xl text-white shadow-xl shadow-blue-950/20 text-center relative overflow-hidden group/card hover:scale-[1.02] transition-transform">
                            <div className="absolute top-0 left-0 w-full h-1 bg-white/20 group-hover/card:h-full transition-all duration-700 opacity-10" />
                            <p className="text-xs font-bold uppercase opacity-80 mb-3 tracking-widest relative z-10">{confLabel}s (Ajustável)</p>
                            <input 
                              type="number" 
                              className="w-full bg-transparent text-8xl font-black relative z-10 tracking-tighter text-center outline-none focus:scale-110 transition-transform"
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
                            <p className="text-[11px] font-bold mt-4 opacity-50 uppercase relative z-10 tracking-widest">Base: {calcData.metaConf} PÇ / H</p>
                          </div>
                        )}
                        <div className="bg-red-800 p-12 rounded-3xl text-white shadow-xl shadow-red-950/20 text-center relative overflow-hidden group/card hover:scale-[1.02] transition-transform">
                          <div className="absolute top-0 left-0 w-full h-1 bg-white/20 group-hover/card:h-full transition-all duration-700 opacity-10" />
                          <p className="text-xs font-bold uppercase opacity-80 mb-3 tracking-widest relative z-10">Auxiliares (Ajustável)</p>
                          <input 
                            type="number" 
                            className="w-full bg-transparent text-8xl font-black relative z-10 tracking-tighter text-center outline-none focus:scale-110 transition-transform"
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
                          <p className="text-[11px] font-bold mt-4 opacity-50 uppercase relative z-10 tracking-widest">Base: {calcData.metaAux} PÇ / H</p>
                        </div>
                      </div>
                  </div>
                </div>
              </div>
            )}

            {/* --- INVENTORY MODULE --- */}
            {activeTab === 'inventory_main' && (
              <div className="space-y-8 animate-in fade-in slide-in-from-bottom-4 duration-300">
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                  {/* Yesterday Upload */}
                  <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-2 h-6 bg-slate-300 rounded-full" />
                      <h3 className="font-black text-slate-800 uppercase tracking-tight">Base Anterior (Ontem)</h3>
                    </div>
                    <label className="relative border-2 border-dashed border-slate-200 hover:border-emerald-500 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-emerald-50/10 active:scale-[0.98]">
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileUpload(e, 'yesterday')} />
                      <div className="w-16 h-16 bg-slate-50 rounded-2xl flex items-center justify-center text-slate-300 mb-4 group-hover:text-emerald-500 group-hover:bg-emerald-50 transition-colors">
                        <FileUp size={32} />
                      </div>
                      <span className="text-sm font-black text-slate-500 uppercase tracking-widest text-center px-4">
                        {fileNames.yesterday || 'Arraste a planilha de ontem'}
                      </span>
                    </label>
                    {columnMaps.yesterday && (
                      <div className="mt-4 p-3 bg-emerald-50/50 rounded-xl border border-emerald-100 flex items-center gap-4 animate-in slide-in-from-top-2">
                        <div className="flex -space-x-1">
                          {['ci', 'balance', 'address'].map(k => (
                            <div key={k} className={`w-2 h-2 rounded-full ${columnMaps.yesterday[k] ? 'bg-emerald-500' : 'bg-slate-300'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] font-black text-emerald-800 uppercase tracking-widest">
                          Mapeamento: {columnMaps.yesterday.ci || '?'} | {columnMaps.yesterday.balance || '?'} | {columnMaps.yesterday.address || '?'}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Today Upload */}
                  <div className="bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden group">
                    <div className="flex items-center gap-3 mb-6">
                      <div className="w-2 h-6 bg-emerald-600 rounded-full" />
                      <h3 className="font-black text-slate-800 uppercase tracking-tight">Base Atual (Hoje)</h3>
                    </div>
                    <label className="relative border-2 border-dashed border-slate-200 hover:border-emerald-600 rounded-2xl p-10 flex flex-col items-center justify-center cursor-pointer transition-all hover:bg-emerald-50/20 active:scale-[0.98]">
                      <input type="file" className="hidden" accept=".xlsx, .xls, .csv" onChange={(e) => handleFileUpload(e, 'today')} />
                      <div className="w-16 h-16 bg-emerald-50 rounded-2xl flex items-center justify-center text-emerald-600 mb-4 shadow-inner">
                        <Download size={32} />
                      </div>
                      <span className="text-sm font-black text-slate-600 uppercase tracking-widest text-center px-4">
                        {fileNames.today || 'Arraste a planilha de hoje'}
                      </span>
                    </label>
                    {columnMaps.today && (
                      <div className="mt-4 p-3 bg-emerald-50/80 rounded-xl border border-emerald-200 flex items-center gap-4 animate-in slide-in-from-top-2">
                         <div className="flex -space-x-1">
                          {['ci', 'balance', 'address'].map(k => (
                            <div key={k} className={`w-2 h-2 rounded-full ${columnMaps.today[k] ? 'bg-emerald-600' : 'bg-slate-300'}`} />
                          ))}
                        </div>
                        <span className="text-[9px] font-black text-emerald-900 uppercase tracking-widest">
                          Mapeamento: {columnMaps.today.ci || '?'} | {columnMaps.today.balance || '?'} | {columnMaps.today.address || '?'}
                        </span>
                      </div>
                    )}
                  </div>
                </div>

                {/* Process Button */}
                <div className="flex justify-center">
                  <button 
                    onClick={processInventory}
                    disabled={isProcessing}
                    className={`bg-emerald-800 hover:bg-emerald-900 text-white font-black py-5 px-16 rounded-[1.5rem] shadow-2xl transition-all flex items-center gap-4 group active:scale-95 disabled:opacity-50 disabled:cursor-not-allowed`}
                  >
                    {isProcessing ? (
                      <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    ) : (
                      <Activity size={20} className="group-hover:rotate-12 transition-transform" />
                    )}
                    <span className="uppercase tracking-[0.2em]">{isProcessing ? 'Processando Dados...' : 'Gerar Relatório de Movimentação'}</span>
                  </button>
                </div>

                {inventoryReport.length > 0 && (
                  <div className="space-y-8 animate-in fade-in slide-in-from-top-4 duration-500">
                    <div className="flex flex-col md:flex-row justify-between items-end gap-4 bg-white p-8 rounded-[2rem] border border-slate-200 shadow-sm relative overflow-hidden">
                      {/* Decoration for print header */}
                      <div className="hidden print:block absolute top-0 left-0 w-full h-2 bg-emerald-600" />
                      
                      <div className="space-y-2">
                        <div className="flex items-center gap-2">
                          <div className="w-8 h-1.5 bg-emerald-600 rounded-full" />
                          <span className="text-xs font-black text-slate-400 uppercase tracking-widest">Resumo Operacional</span>
                        </div>
                        <h3 className="text-3xl font-black text-slate-900 uppercase tracking-tighter">Inventário Diário Concluído</h3>
                        <p className="text-xs font-bold text-slate-500 max-w-lg">
                          O sistema analisou os fluxos e identificou <span className="text-emerald-700">{inventoryReport.length} divergências</span> que requerem atenção ou registros no seu sistema principal.
                        </p>
                      </div>
                      <div className="bg-slate-50 px-6 py-4 rounded-2xl border border-slate-100 text-center print:border-none print:bg-transparent">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Acuracidade Estimada</p>
                        <p className="text-3xl font-black text-blue-900">
                          {inventoryStats.total > 0 ? Math.max(0, 100 - (inventoryReport.length / inventoryStats.total * 100)).toFixed(1) : '100'}%
                        </p>
                      </div>
                    </div>
                    {/* Stats */}
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 sm:gap-6">
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-slate-400">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Itens Analisados</p>
                        <p className="text-3xl font-black text-slate-800 tracking-tighter">{inventoryStats.total.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-red-500">
                        <p className="text-[10px] font-black text-red-400 uppercase tracking-widest mb-1">Saídas Detectadas</p>
                        <p className="text-3xl font-black text-red-600 tracking-tighter">{inventoryStats.out.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-blue-500">
                        <p className="text-[10px] font-black text-blue-400 uppercase tracking-widest mb-1">Muda Address</p>
                        <p className="text-3xl font-black text-blue-600 tracking-tighter">{inventoryStats.move.toLocaleString()}</p>
                      </div>
                      <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-200 border-l-4 border-l-emerald-600">
                        <p className="text-[10px] font-black text-emerald-400 uppercase tracking-widest mb-1">Entradas Novas</p>
                        <p className="text-3xl font-black text-emerald-600 tracking-tighter">{inventoryStats.in.toLocaleString()}</p>
                      </div>
                    </div>

                    {/* Table */}
                    <div className="bg-white rounded-[2rem] shadow-xl border border-slate-200 overflow-hidden group">
                      <div className="px-8 py-6 bg-slate-50 border-b border-slate-200 flex flex-col sm:flex-row justify-between items-center gap-4">
                        <div className="flex flex-col">
                          <div className="flex items-center gap-3">
                            <Search size={18} className="text-slate-400" />
                            <h3 className="font-black text-slate-800 text-sm uppercase tracking-widest">MAPA DE DIVERGÊNCIAS OPERACIONAIS</h3>
                          </div>
                          <p className="text-[10px] font-bold text-slate-400 uppercase mt-1">Sincronização entre {fileNames.yesterday} e {fileNames.today}</p>
                        </div>
                        <div className="flex items-center gap-2">
                          <button 
                            onClick={exportInventoryExcel}
                            className="bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-black px-6 py-3 rounded-xl shadow-lg shadow-emerald-900/10 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-widest"
                          >
                            <Download size={14} /> Excel
                          </button>
                          <button 
                            onClick={() => window.print()}
                            className="bg-blue-900 hover:bg-blue-800 text-white text-[10px] font-black px-6 py-3 rounded-xl shadow-lg shadow-blue-900/10 transition-all active:scale-95 flex items-center gap-2 uppercase tracking-widest"
                          >
                            <Printer size={14} /> PDF / Imprimir
                          </button>
                        </div>
                      </div>
                      <div className="overflow-x-auto max-h-[650px] scrollbar-thin scrollbar-thumb-slate-200">
                        <table className="w-full text-left border-collapse whitespace-nowrap">
                          <thead className="sticky top-0 bg-slate-50 z-20 shadow-sm">
                            <tr className="text-[10px] uppercase text-slate-500 border-b border-slate-100 font-black">
                              <th className="px-8 py-5 tracking-widest">Análise de Fluxo (Endereço)</th>
                              <th className="px-8 py-5 tracking-widest">Identificação (CI)</th>
                              <th className="px-8 py-5 tracking-widest">Produto / Descrição</th>
                              <th className="px-8 py-5 text-center tracking-widest">Anterior</th>
                              <th className="px-8 py-5 text-center tracking-widest">Atual</th>
                              <th className="px-8 py-5 text-center tracking-widest">Delta</th>
                              <th className="px-8 py-5 tracking-widest">Inteligência Operacional</th>
                            </tr>
                          </thead>
                          <tbody className="text-xs text-slate-600 font-bold">
                            {paginatedReport.map((row, idx) => (
                              <tr key={idx} className={`border-b border-slate-50 hover:bg-slate-50/70 transition-colors ${row.color}`}>
                                <td className="px-8 py-5">
                                  <div className="flex flex-col gap-1">
                                    <div className="flex items-center gap-2">
                                      <span className="bg-slate-100 px-2 py-0.5 rounded text-[9px] text-slate-500 font-black">DE</span>
                                      <span className="text-slate-400 italic line-through">{row.endY}</span>
                                    </div>
                                    <div className="flex items-center gap-2">
                                      <span className="bg-blue-100 px-2 py-0.5 rounded text-[9px] text-blue-700 font-black">PARA</span>
                                      <span className="font-black text-blue-900">{row.endT}</span>
                                    </div>
                                  </div>
                                </td>
                                <td className="px-8 py-5 font-mono font-black text-slate-900 text-sm tracking-tighter">{row.ci}</td>
                                <td className="px-8 py-5">
                                  <p className="truncate max-w-[200px] sm:max-w-xs uppercase leading-tight font-black">{row.desc}</p>
                                  <span className="text-[9px] text-slate-400 font-bold">Referência Unitária</span>
                                </td>
                                <td className="px-8 py-5 text-center opacity-40 font-black text-sm">{row.realY}</td>
                                <td className="px-8 py-5 text-center font-black text-emerald-900 text-sm underline decoration-emerald-200 decoration-2 underline-offset-4">{row.realT}</td>
                                <td className={`px-8 py-5 text-center font-black text-base ${row.diff < 0 ? 'text-red-700' : 'text-emerald-700 font-black scale-110'}`}>
                                  {row.diff > 0 ? `+${row.diff}` : row.diff === 0 ? '--' : row.diff}
                                </td>
                                <td className="px-8 py-5">
                                  <div className="flex flex-col gap-1.5">
                                    <div className="flex items-center gap-2">
                                      <div className={`w-2 h-2 rounded-full shadow-sm animate-pulse ${
                                        row.type === 'CRITICAL' || row.type === 'STOCKOUT' ? 'bg-red-600' : 
                                        row.type === 'REPLENISH' ? 'bg-emerald-600' : 
                                        'bg-blue-500'
                                      }`} />
                                      <span className="text-[10px] uppercase font-black tracking-tighter whitespace-normal leading-tight">{row.status}</span>
                                    </div>
                                    {(row.type === 'CRITICAL' || row.type === 'STOCKOUT') && (
                                      <div className="bg-red-700 text-white text-[8px] font-black px-1.5 py-0.5 rounded w-fit animate-bounce">AÇÃO NECESSÁRIA</div>
                                    )}
                                  </div>
                                </td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                      
                      {/* Pagination Controls */}
                      {totalPages > 1 && (
                         <div className="px-8 py-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between">
                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                               Mostrando {paginatedReport.length} de {inventoryReport.length} divergências
                            </p>
                            <div className="flex items-center gap-2">
                               <button 
                                 onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
                                 disabled={currentPage === 1}
                                 className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
                               >
                                 <Menu size={16} className="rotate-90" />
                               </button>
                               <div className="flex items-center gap-1">
                                  {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
                                     let pageNum = currentPage;
                                     if (currentPage < 3) pageNum = i + 1;
                                     else if (currentPage > totalPages - 2) pageNum = totalPages - 4 + i;
                                     else pageNum = currentPage - 2 + i;
                                     
                                     if (pageNum < 1 || pageNum > totalPages) return null;

                                     return (
                                       <button 
                                         key={pageNum}
                                         onClick={() => setCurrentPage(pageNum)}
                                         className={`w-8 h-8 rounded-lg text-[10px] font-black transition-all ${currentPage === pageNum ? 'bg-blue-900 text-white shadow-lg' : 'bg-white border border-slate-200 text-slate-400 hover:bg-slate-50'}`}
                                       >
                                         {pageNum}
                                       </button>
                                     );
                                  })}
                               </div>
                               <button 
                                 onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
                                 disabled={currentPage === totalPages}
                                 className="p-2 rounded-lg bg-white border border-slate-200 text-slate-600 disabled:opacity-30 disabled:cursor-not-allowed hover:bg-slate-50 transition-colors shadow-sm"
                               >
                                 <ArrowRightLeft size={16} className="rotate-90" />
                               </button>
                            </div>
                         </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* --- CONFIGURAÇÕES --- */}
            {activeTab === 'meta' && (
              <div className="max-w-2xl mx-auto animate-in fade-in slide-in-from-top-4 duration-300 no-print">
                <div className="bg-[#1E293B] p-12 md:p-16 rounded-[2.5rem] text-white shadow-2xl relative overflow-hidden border border-slate-700">
                  <div className="absolute top-0 left-0 w-full h-1 bg-gradient-to-r from-transparent via-red-800 to-transparent" />
                  <div className="text-center mb-8 sm:mb-12">
                    <div className="w-12 sm:w-16 h-12 sm:h-16 bg-slate-800 rounded-xl sm:rounded-2xl flex items-center justify-center mx-auto mb-4 sm:mb-6 border border-slate-700 shadow-xl">
                      <Settings2 size={24} className="text-blue-400 sm:size-[30px]" />
                    </div>
                    <h2 className="text-xl sm:text-2xl font-bold uppercase tracking-tight">Parametrização</h2>
                    <p className="text-slate-500 text-[9px] sm:text-xs font-bold mt-2 uppercase tracking-widest">Indicadores de Produtividade</p>
                  </div>
                  <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 sm:gap-8">
                      <div className="space-y-4 sm:space-y-6 text-center">
                        <label className="text-[10px] sm:text-xs font-black uppercase text-blue-400 tracking-widest leading-none block h-3">Meta Vol.</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-900 border border-slate-800 p-3 sm:p-5 rounded-xl text-xl sm:text-3xl font-black text-slate-600 text-center outline-none cursor-not-allowed opacity-50" 
                          value={metas.VOLUME || ''} 
                          disabled
                          readOnly
                        />
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 leading-tight">PÇ / DIA</p>
                      </div>
                      <div className="space-y-2 sm:space-y-3 text-center">
                        <label className="text-[10px] sm:text-xs font-black uppercase text-blue-400 tracking-widest leading-none block h-3">Jornada</label>
                        <input 
                          type="number" 
                          step="0.5"
                          className="w-full bg-slate-900 border border-slate-800 p-3 sm:p-5 rounded-xl text-xl sm:text-3xl font-black text-slate-600 text-center outline-none cursor-not-allowed opacity-50" 
                          value={metas.JORNADA || ''} 
                          disabled
                          readOnly
                        />
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 leading-tight">H / DIA</p>
                      </div>
                    {selectedEnv !== 'separacao' && (
                      <div className="space-y-2 sm:space-y-3 text-center">
                        <label className="text-[10px] sm:text-xs font-black uppercase text-blue-400 tracking-widest leading-none block h-3">Meta {confLabel.substring(0, 4)}.</label>
                        <input 
                          type="number" 
                          className="w-full bg-slate-900 border border-slate-800 p-3 sm:p-5 rounded-xl text-xl sm:text-3xl font-black text-slate-600 text-center outline-none cursor-not-allowed opacity-50" 
                          value={metas.CONFERENTE || ''} 
                          disabled
                          readOnly
                        />
                        <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 leading-tight">PÇ / H</p>
                      </div>
                    )}
                    <div className="space-y-2 sm:space-y-3 text-center">
                      <label className="text-[10px] sm:text-xs font-black uppercase text-red-400 tracking-widest leading-none block h-3">Meta Aux.</label>
                      <input 
                        type="number" 
                        className="w-full bg-slate-900 border border-slate-800 p-3 sm:p-5 rounded-xl text-xl sm:text-3xl font-black text-slate-600 text-center outline-none cursor-not-allowed opacity-50" 
                        value={metas.AUXILIAR || ''} 
                        disabled
                        readOnly
                      />
                      <p className="text-[9px] sm:text-[10px] font-bold text-slate-500 uppercase tracking-widest px-2 leading-tight">PÇ / H</p>
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
          {selectedEnv && (
            <button 
              onClick={() => window.print()}
              className="fixed bottom-8 right-8 z-[60] bg-blue-900 hover:bg-blue-800 text-white w-16 h-16 rounded-full flex items-center justify-center shadow-[0_20px_50px_rgba(30,58,138,0.3)] hover:shadow-[0_20px_50px_rgba(30,58,138,0.5)] transition-all duration-300 transform hover:scale-110 active:scale-90 no-print group"
            >
              <Printer size={24} className="group-hover:rotate-12 transition-transform" />
              <span className="absolute right-20 bg-[#1E293B] text-white px-4 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none shadow-xl border border-slate-700">
                Exportar Relatório
              </span>
            </button>
          )}
        </main>
      </div>
    </>
  );
}
