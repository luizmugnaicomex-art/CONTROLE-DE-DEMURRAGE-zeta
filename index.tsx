// @ts-nocheck
// Since we are using browser globals, we can disable TypeScript checks for them.
declare const XLSX: any;
declare const Chart: any;
declare const jspdf: any;
declare const html2canvas: any;
declare const ChartDataLabels: any;
declare const firebase: any; // Declaração do Firebase

import { GoogleGenAI } from "@google/genai";

// --- TYPE DEFINITIONS ---
interface ContainerData {
    [key:string]: any;
    'PO': string;
    'Vessel': string;
    'Container': string;
    'Discharge Date': Date | null;
    'Free Days': number;
    'Return Date'?: Date;
    'End of Free Time': Date;
    'Final Status': string;
    'Loading Type': string;
    'Cargo Type': string;
    'Shipowner': string;
    'Demurrage Days': number;
    'Demurrage Cost': number;
    hasDateError?: boolean;
}

interface DemurrageRates {
    [shipowner: string]: number;
    default: number;
}

interface PaidStatuses {
    [containerId: string]: boolean;
}

interface HistorySnapshot {
    timestamp: string;
    fileName: string;
    data: ContainerData[];
    rates: DemurrageRates;
    paidStatuses: PaidStatuses;
}

interface AppState {
    allData: ContainerData[];
    filteredData: ContainerData[];
    demurrageRates: DemurrageRates;
    paidStatuses: PaidStatuses;
    currentLanguage: 'pt' | 'en' | 'zh';
    isViewingHistory: boolean;
    charts: { [key: string]: any };
    currentSort: { key: string, direction: 'asc' | 'desc' | 'none' };
}

// --- GLOBAL STATE ---
const appState: AppState = {
    allData: [],
    filteredData: [],
    demurrageRates: { default: 100, MSC: 120, COSCO: 110, CSSC: 115 },
    paidStatuses: {},
    currentLanguage: 'pt',
    isViewingHistory: false,
    charts: {},
    currentSort: { key: 'Demurrage Days', direction: 'desc' },
};

const MAX_HISTORY_SNAPSHOTS = 20;

// --- FIREBASE & AI INITIALIZATION ---
// As chaves agora são lidas do arquivo .env através do Vite
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

const GEMINI_API_KEY = import.meta.env.VITE_GEMINI_API_KEY;


// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}
const db = firebase.firestore();
let isUpdatingFromFirestore = false; // Flag to prevent update loops

// --- FIREBASE FUNCTIONS ---

/**
 * Saves the entire application state to a single document in Firestore.
 */
async function salvarDados() {
    if (isUpdatingFromFirestore) return;

    console.log("Salvando dados no Firebase...");
    try {
        const toISO = (date) => (date && !isNaN(date.getTime())) ? date.toISOString() : null;

        const serializableAllData = appState.allData.map(d => ({
            ...d,
            'Discharge Date': toISO(d['Discharge Date']),
            'End of Free Time': toISO(d['End of Free Time']),
            'Return Date': toISO(d['Return Date']),
        }));

        const estadoParaSalvar = {
            allData: serializableAllData,
            demurrageRates: appState.demurrageRates,
            paidStatuses: appState.paidStatuses,
            lastUpdate: lastUpdateEl.innerHTML,
            _lastModified: new Date().toISOString()
        };
        await db.collection("demurrage_dashboard").doc("estado_atual").set(estadoParaSalvar);
        console.log("Dados salvos com sucesso no Firebase!");
    } catch (error) {
        console.error("Erro ao salvar dados no Firebase: ", error);
        showToast("Erro ao sincronizar dados.", 'error');
    }
}

/**
 * Listens for real-time changes in the Firestore document and updates the app state.
 */
function escutarMudancasEmTempoReal() {
    db.collection("demurrage_dashboard").doc("estado_atual")
        .onSnapshot((doc) => {
            if (doc.exists) {
                console.log("Dados recebidos do Firebase...");
                isUpdatingFromFirestore = true;

                const data = doc.data();

                appState.allData = (data.allData || []).map(d => {
                    const dischargeDate = d['Discharge Date'] ? new Date(d['Discharge Date']) : null;
                    const endOfFreeTime = d['End of Free Time'] ? new Date(d['End of Free Time']) : null;
                    const returnDate = d['Return Date'] ? new Date(d['Return Date']) : undefined;

                    if ((dischargeDate && isNaN(dischargeDate.getTime())) || (endOfFreeTime && isNaN(endOfFreeTime.getTime()))) {
                        return null;
                    }

                    return {
                        ...d,
                        'Discharge Date': dischargeDate,
                        'End of Free Time': endOfFreeTime,
                        'Return Date': returnDate,
                    };
                }).filter(Boolean);

                appState.filteredData = appState.allData;
                appState.demurrageRates = data.demurrageRates || { default: 100 };
                appState.paidStatuses = data.paidStatuses || {};
                lastUpdateEl.innerHTML = data.lastUpdate || 'Carregue sua planilha para começar';

                renderDashboard();
                
                setTimeout(() => { isUpdatingFromFirestore = false; }, 500);
            } else {
                console.log("Nenhum dado no Firebase. Aguardando primeiro upload.");
                appState.allData = [];
                appState.filteredData = [];
                renderDashboard();
            }
        }, (error) => {
            console.error("Erro ao escutar mudanças: ", error);
            showToast("Erro de conexão em tempo real.", 'error');
        });
}


const translations = {
    pt: {
        main_title: "DASHBOARD DE CONTROLE DE DEMURRAGE",
        upload_prompt_initial: "Carregue sua planilha para começar",
        upload_prompt_updated: "Última atualização:",
        global_search_placeholder: "Pesquisar em todos os detalhes...",
        clear_data_btn: "Limpar Dados",
        ai_insights_btn: "AI Insights",
        upload_btn: "Carregar XLSX",
        filter_po: "Filtrar POs",
        filter_vessel: "Filtrar Navios",
        vessel_search_placeholder: "Pesquisar...",
        filter_container: "Filtrar Contêiner",
        filter_final_status: "Status Final",
        filter_loading_type: "Tipo Carregamento",
        filter_cargo_type: "Tipo de Carga",
        filter_shipowner: "Armador (Shipowner)",
        filter_arrival_start: "Início da Chegada",
        filter_arrival_end: "Fim da Chegada",
        filter_freetime_start: "Início do FreeTime",
        filter_freetime_end: "Fim do FreeTime",
        filter_btn: "Filtrar",
        clear_btn: "Limpar",
        tab_dashboard: "Dashboard",
        tab_analytics: "Analytics",
        tab_paid_demurrage: "Demurrage Pago",
        kpi_demurrage_title: "Com Demurrage",
        kpi_demurrage_subtitle: "Contêineres com prazo vencido",
        kpi_returned_late_title: "Devolvidos com Demurrage",
        kpi_returned_late_subtitle: "Contêineres entregues com custo",
        kpi_risk_title: "Em Risco (Próx. 15 dias)",
        kpi_risk_subtitle: "Contêineres com prazo vencendo",
        kpi_returned_title: "Devolvidos no Prazo",
        kpi_returned_subtitle: "Contêineres retornados sem custo",
        kpi_cost_title: "Custo Total de Demurrage",
        kpi_cost_subtitle: "*Custo de contêineres ativos e já devolvidos",
        board_title_demurrage: "COM DEMURRAGE (ATRASADO)",
        board_title_high_risk: "ALTO RISCO (VENCE ≤ 15 DIAS)",
        board_title_medium_risk: "ATENÇÃO (VENCE ≤ 30 DIAS)",
        board_title_low_risk: "SEGURO (> 30 DIAS)",
        board_title_date_issue: "ANALISAR DATA",
        chart_title_cost_analysis: "Análise de Custos: Real vs. Risco Gerenciado",
        chart_title_operational_efficiency: "Eficiência Operacional",
        chart_title_demurrage_by_shipowner: "Custo de Demurrage por Armador",
        chart_title_avg_days_by_shipowner: "Dias Médios de Demurrage por Armador",
        analytics_placeholder_title: "Análise Indisponível",
        analytics_placeholder_subtitle: "Filtros atuais não retornaram dados para análise.",
        summary_total_cost_returned: "Custo Total (Devolvidos)",
        summary_paid: "Total Pago",
        summary_unpaid: "Total Pendente",
        placeholder_title: "Aguardando arquivo...",
        placeholder_subtitle: "Selecione a planilha para iniciar a análise de demurrage.",
        loading_text: "Processando...",
        export_btn: "Exportar PDF",
        save_btn: "Salvar",
        rates_modal_title: "Taxas de Demurrage por Armador",
        rates_modal_footer_note: "Valores não definidos usarão a taxa padrão.",
        ai_modal_title: "AI Generated Insights",
        history_modal_title: "Histórico de Uploads",
        return_to_live_btn: "Voltar à visualização atual",
        toast_clear_data: "Dados e histórico foram limpos.",
        toast_data_loaded: "Dados carregados com sucesso!",
        toast_no_data: "Nenhum dado encontrado no arquivo.",
        toast_error_processing: "Erro ao processar o arquivo.",
        toast_settings_saved: "Configurações salvas com sucesso!",
        toast_history_loaded: "Visualizando dados históricos de",
        toast_returned_to_live: "Retornou à visualização de dados ao vivo.",
        cost_summary_text: (paid, potential) => `Custo real de demurrage (pago/incorrido) é ${formatCurrency(paid)}, enquanto o custo atual de contêineres ativos atrasados é ${formatCurrency(potential)}.`,
        performance_donut_summary_text: (p) => `Do total de contêineres analisados, ${p}% foram devolvidos com sucesso, demonstrando excelente eficiência e economia de custos.`,
        table_header_container: "Container",
        table_header_po: "PO",
        table_header_vessel: "Navio",
        table_header_return_date: "Data Devolução",
        table_header_demurrage_days: "Dias Demurrage",
        table_header_cost: "Custo",
        table_header_paid: "Pago?",
        tooltip_cost: "Custo",
        tooltip_containers: "Contêineres",
        chart_tooltip_avg_days: "Dias Médios",
        tooltip_from: "de",
        chart_label_returned_on_time: "Devolvido no Prazo",
        chart_label_returned_late: "Devolvido com Atraso",
        chart_label_active_with_demurrage: "Ativo (com demurrage)",
        chart_label_active_in_free_period: "Ativo (em período livre)",
        card_status_invalid_date: "Data Inválida",
        chart_label_actual_cost_returned: "Custo Real (Devolvidos)",
        chart_label_incurred_cost_active: "Custo Incorrido (Ativos)",
        chart_no_data: "Sem dados para exibir",
        chart_label_days_suffix: "dias",
        generate_report_btn: "Gerar Relatório de Justificativa",
        toast_report_copied: "Relatório copiado para a área de transferência!",
        generating_report: "Gerando relatório...",
        report_title: "Relatório de Justificativa de Demurrage",
        copy_btn: "Copiar",
        error_generating_report: "Ocorreu um erro ao gerar o relatório. Verifique sua chave de API e tente novamente.",
    },
    // ... (traduções para 'en' e 'zh' omitidas para economizar espaço)
};

// --- DOM ELEMENTS ---
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const lastUpdateEl = document.getElementById('last-update') as HTMLParagraphElement;
const loadingOverlay = document.getElementById('loading-overlay') as HTMLDivElement;
const placeholder = document.getElementById('placeholder') as HTMLDivElement;
const mainContentArea = document.getElementById('main-content-area') as HTMLDivElement;
const filterContainer = document.getElementById('filter-container') as HTMLDivElement;
const kpiContainer = document.getElementById('kpi-container') as HTMLDivElement;
const clearDataBtn = document.getElementById('clear-data-btn') as HTMLButtonElement;
const settingsBtn = document.getElementById('settings-btn') as HTMLButtonElement;
const aiInsightsBtn = document.getElementById('ai-insights-btn') as HTMLButtonElement;
const applyFiltersBtn = document.getElementById('apply-filters-btn') as HTMLButtonElement;
const resetFiltersBtn = document.getElementById('reset-filters-btn') as HTMLButtonElement;
const themeToggleBtn = document.getElementById('theme-toggle-btn') as HTMLButtonElement;
const themeToggleIcon = document.getElementById('theme-toggle-icon') as HTMLElement;
const translateBtn = document.getElementById('translate-btn') as HTMLButtonElement;
const translateBtnText = document.getElementById('translate-btn-text') as HTMLSpanElement;

// History Elements
const historyBtn = document.getElementById('history-btn') as HTMLButtonElement;
const historyModal = document.getElementById('history-modal') as HTMLDivElement;
const historyModalCloseBtn = document.getElementById('history-modal-close-btn') as HTMLButtonElement;
const historyModalBody = document.getElementById('history-modal-body') as HTMLDivElement;
const historyBanner = document.getElementById('history-banner') as HTMLDivElement;
const historyBannerText = document.getElementById('history-banner-text') as HTMLSpanElement;
const returnToLiveBtn = document.getElementById('return-to-live-btn') as HTMLButtonElement;

// Modals
const detailsModal = document.getElementById('details-modal') as HTMLDivElement;
const listModal = document.getElementById('list-modal') as HTMLDivElement;
const ratesModal = document.getElementById('rates-modal') as HTMLDivElement;
const aiModal = document.getElementById('ai-modal') as HTMLDivElement;

// --- UTILITY FUNCTIONS ---
const formatDate = (date: Date | null | undefined, locale = appState.currentLanguage): string => {
    if (!date || isNaN(date.getTime())) return 'N/A';
    return date.toLocaleDateString(locale === 'pt' ? 'pt-BR' : locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC'
    });
};

const formatCurrency = (amount: number, currency = 'USD'): string => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency,
        minimumFractionDigits: 2
    }).format(amount);
};

const showToast = (message: string, type: 'success' | 'error' | 'info' = 'info') => {
    const container = document.getElementById('toast-container');
    if (!container) return;

    const colors = {
        success: 'bg-green-500',
        error: 'bg-red-500',
        info: 'bg-blue-500',
    };

    const toast = document.createElement('div');
    toast.className = `toast text-white p-4 rounded-lg shadow-lg mb-2 ${colors[type]}`;
    toast.textContent = message;

    container.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
};

function parseDate(dateInput: any): Date {
    if (dateInput instanceof Date && !isNaN(dateInput.getTime())) {
        return dateInput;
    }
    if (typeof dateInput === 'string') {
        const isoMatch = dateInput.match(/^(\d{4})-(\d{2})-(\d{2})/);
        if (isoMatch) return new Date(dateInput);

        const parts = dateInput.split(/[/.-]/);
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                return new Date(Date.UTC(year, month - 1, day));
            }
        }
    }
    if (typeof dateInput === 'number' && dateInput > 0) {
        return new Date(Math.round((dateInput - 25569) * 86400 * 1000));
    }
    // Return an invalid date that can be checked later
    return new Date('invalid');
}

// --- DATA PROCESSING ---
function processData(data: any[]): ContainerData[] {
    const processed = data
        .filter(row => {
            const container = String(row.Container || '').trim();
            if (!container || container.toLowerCase() === '(vazio)') return false;

            const dischargeDate = String(row['Discharge Date'] || '').trim();
            const endOfFreeTime = String(row['End of Free Time'] || '').trim();

            const hasValidDischargeDate = dischargeDate && dischargeDate.toLowerCase() !== '(vazio)';
            const hasValidEndOfFreeTime = endOfFreeTime && endOfFreeTime.toLowerCase() !== '(vazio)';
            
            return hasValidDischargeDate || hasValidEndOfFreeTime;
        })
        .map((row: any): ContainerData | null => {
            try {
                let dischargeDate = row['Discharge Date'] ? parseDate(row['Discharge Date']) : null;
                const freeDays = parseInt(row['Free Days'], 10) || 0;
                let endOfFreeTime = row['End of Free Time'] ? parseDate(row['End of Free Time']) : null;
                
                let hasDateError = false;

                if (dischargeDate && isNaN(dischargeDate.getTime())) {
                    hasDateError = true;
                    dischargeDate = null;
                }
                if (endOfFreeTime && isNaN(endOfFreeTime.getTime())) {
                    hasDateError = true;
                    endOfFreeTime = null;
                }

                if (!endOfFreeTime && dischargeDate) {
                    endOfFreeTime = new Date(dischargeDate.getTime());
                    endOfFreeTime.setUTCDate(dischargeDate.getUTCDate() + freeDays);
                } else if (!endOfFreeTime && !dischargeDate) {
                    hasDateError = true;
                }

                const statusDepot = String(row['Status Depot'] || '').trim().toUpperCase();
                const actualReturnDateValue = row['Return Date'];
                let returnDate: Date | undefined = undefined;

                if (statusDepot === 'ENTREGUE' && actualReturnDateValue) {
                    const parsedReturnDate = parseDate(actualReturnDateValue);
                    if (!isNaN(parsedReturnDate.getTime())) {
                       returnDate = parsedReturnDate;
                    }
                }
                
                const today = new Date();
                const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
                
                let demurrageDays = 0;
                if (endOfFreeTime && !hasDateError) {
                    const effectiveDate = returnDate || todayUTC; 
                    if (effectiveDate > endOfFreeTime) {
                        const diffTime = effectiveDate.getTime() - endOfFreeTime.getTime();
                        demurrageDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
                    }
                }
                
                const shipowner = String(row['Shipowner'] || 'DEFAULT').trim().toUpperCase();
                const rate = appState.demurrageRates[shipowner] || appState.demurrageRates.default;
                const demurrageCost = demurrageDays * rate;
                    
                return {
                    'PO': String(row['PO'] || ''),
                    'Vessel': String(row['Vessel'] || ''),
                    'Container': String(row['Container']),
                    'Discharge Date': dischargeDate,
                    'Free Days': freeDays,
                    'Return Date': returnDate,
                    'End of Free Time': endOfFreeTime,
                    'Final Status': String(row['Final Status'] || 'IN-TRANSIT'),
                    'Loading Type': String(row['Loading Type'] || 'N/A'),
                    'Cargo Type': String(row['Cargo Type'] || 'N/A'),
                    'Shipowner': String(row['Shipowner'] || 'N/A'),
                    'Demurrage Days': demurrageDays,
                    'Demurrage Cost': demurrageCost,
                    hasDateError,
                };

            } catch (error) {
                console.error(`Error processing row for container ${row.Container}:`, error);
                return null;
            }
        })
        .filter((item): item is ContainerData => item !== null && item['End of Free Time'] !== null);

    return processed;
}

// O restante do arquivo (handleFileUpload, renderDashboard, etc.) permanece exatamente igual.
// ... (código omitido para economizar espaço)

// --- INITIALIZATION ---
function init() {
    // Event Listeners
    fileUpload.addEventListener('change', handleFileUpload);
    applyFiltersBtn.addEventListener('click', applyFilters);
    resetFiltersBtn.addEventListener('click', resetFilters);
    clearDataBtn.addEventListener('click', clearData);
    settingsBtn.addEventListener('click', openRatesModal);
    aiInsightsBtn.addEventListener('click', getAiInsights);
    historyBtn.addEventListener('click', renderHistoryModal);
    returnToLiveBtn.addEventListener('click', returnToLiveView);
    
    document.getElementById('rates-modal-save-btn')!.addEventListener('click', saveRates);
    
    document.getElementById('global-search-input')!.addEventListener('input', (e) => {
        const term = (e.target as HTMLInputElement).value;
        applyFilters(); 
        globalSearch(term);
        renderDashboard();
    });

    document.querySelectorAll('[data-tab]').forEach(tab => {
        tab.addEventListener('click', () => {
            const tabName = tab.getAttribute('data-tab');
            document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('active-tab'));
            tab.classList.add('active-tab');
            document.querySelectorAll('.tab-panel').forEach(p => p.classList.add('hidden'));
            document.getElementById(`tab-panel-${tabName}`)!.classList.remove('hidden');
        });
    });

    kpiContainer.addEventListener('click', (e) => {
        const card = (e.target as HTMLElement).closest('[data-kpi-category]') as HTMLElement;
        if(card) {
            openListModal(card.dataset.kpiCategory!);
        }

        const tabCard = (e.target as HTMLElement).closest('[data-kpi-tab]') as HTMLElement;
        if(tabCard) {
            const tabName = tabCard.dataset.kpiTab!;
            document.querySelector<HTMLElement>(`.tab-btn[data-tab="${tabName}"]`)?.click();
        }
    });

    document.getElementById('export-pdf-btn')!.addEventListener('click', async () => {
        const { jsPDF } = jspdf;
        const doc = new jsPDF();
        const table = document.getElementById('list-modal-table');
        if(table) {
            doc.autoTable({
                html: table,
                startY: 20,
                theme: 'grid',
                headStyles: { fillColor: [41, 128, 185] }
            });
            doc.text(document.getElementById('list-modal-title')!.textContent!, 14, 15);
            doc.save('demurrage_report.pdf');
        }
    });

    themeToggleBtn.addEventListener('click', toggleTheme);
    translateBtn.addEventListener('click', cycleLanguage);

    // Initial Setup
    if (localStorage.getItem('theme') === 'dark' || 
       (!('theme' in localStorage) && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
        document.documentElement.classList.add('dark');
        themeToggleIcon.className = 'fas fa-sun';
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleIcon.className = 'fas fa-moon';
    }

    setupModals();
    setupFilterSearch();
    loadPrefsFromLocalStorage(); 
    translateApp();
    
    escutarMudancasEmTempoReal();
}

// --- RUN APP ---
document.addEventListener('DOMContentLoaded', init);

