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

// --- FIREBASE INITIALIZATION & SETUP ---
// ** IMPORTANTE **
// Cole as suas credenciais do Firebase que você copiou do console do Firebase aqui.
// Substitua os valores de exemplo "SUA_..." pelas suas chaves reais.
const firebaseConfig = {
  apiKey: "AIzaSyCjaXjUIKS7HCX4fDnst17HoykFElNusNI",
  authDomain: "demurragecontrolzeta.firebaseapp.com",
  projectId: "demurragecontrolzeta",
  storageBucket: "demurragecontrolzeta.firebasestorage.app",
  messagingSenderId: "386182890771",
  appId: "1:386182890771:web:39e73709851b36eb7706e6",
  measurementId: "G-YC0THL90Q1"
};

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
    if (isUpdatingFromFirestore) return; // Don't save if the update came from Firestore

    console.log("Salvando dados no Firebase...");
    try {
        // NOTE: Firestore cannot store Date objects directly in arrays of objects.
        // We convert them to ISO strings before saving.
        const serializableAllData = appState.allData.map(d => ({
            ...d,
            'Discharge Date': d['Discharge Date'] ? d['Discharge Date'].toISOString() : null,
            'End of Free Time': d['End of Free Time'].toISOString(),
            'Return Date': d['Return Date'] ? d['Return Date'].toISOString() : undefined,
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
                isUpdatingFromFirestore = true; // Set flag

                const data = doc.data();

                // Restore data from Firestore, converting date strings back to Date objects
                appState.allData = (data.allData || []).map(d => ({
                    ...d,
                    'Discharge Date': d['Discharge Date'] ? new Date(d['Discharge Date']) : null,
                    'End of Free Time': new Date(d['End of Free Time']),
                    'Return Date': d['Return Date'] ? new Date(d['Return Date']) : undefined,
                }));

                appState.filteredData = appState.allData;
                appState.demurrageRates = data.demurrageRates || { default: 100 };
                appState.paidStatuses = data.paidStatuses || {};
                lastUpdateEl.innerHTML = data.lastUpdate || 'Carregue sua planilha para começar';

                renderDashboard();
                
                setTimeout(() => { isUpdatingFromFirestore = false; }, 500);
            } else {
                console.log("Nenhum dado no Firebase. Aguardando primeiro upload.");
                 // If no data in Firestore, clear local state too
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
    en: {
        main_title: "DEMURRAGE CONTROL DASHBOARD",
        upload_prompt_initial: "Upload your spreadsheet to start",
        upload_prompt_updated: "Last update:",
        global_search_placeholder: "Search all details...",
        clear_data_btn: "Clear Data",
        ai_insights_btn: "AI Insights",
        upload_btn: "Upload XLSX",
        filter_po: "Filter POs",
        filter_vessel: "Filter Vessels",
        vessel_search_placeholder: "Search...",
        filter_container: "Filter Container",
        filter_final_status: "Final Status",
        filter_loading_type: "Loading Type",
        filter_cargo_type: "Cargo Type",
        filter_shipowner: "Shipowner",
        filter_arrival_start: "Arrival Start",
        filter_arrival_end: "Arrival End",
        filter_freetime_start: "FreeTime Start",
        filter_freetime_end: "FreeTime End",
        filter_btn: "Filter",
        clear_btn: "Clear",
        tab_dashboard: "Dashboard",
        tab_analytics: "Analytics",
        tab_paid_demurrage: "Paid Demurrage",
        kpi_demurrage_title: "With Demurrage",
        kpi_demurrage_subtitle: "Containers past deadline",
        kpi_returned_late_title: "Returned with Demurrage",
        kpi_returned_late_subtitle: "Containers delivered with cost",
        kpi_risk_title: "At Risk (Next 15 days)",
        kpi_risk_subtitle: "Containers with expiring deadline",
        kpi_returned_title: "Returned on Time",
        kpi_returned_subtitle: "Containers returned without cost",
        kpi_cost_title: "Total Demurrage Cost",
        kpi_cost_subtitle: "*Cost of active and already returned containers",
        board_title_demurrage: "WITH DEMURRAGE (LATE)",
        board_title_high_risk: "HIGH RISK (DUE ≤ 15 DAYS)",
        board_title_medium_risk: "ATTENTION (DUE ≤ 30 DAYS)",
        board_title_low_risk: "SAFE (> 30 DAYS)",
        board_title_date_issue: "REVIEW DATE",
        chart_title_cost_analysis: "Cost Analysis: Actual vs. Managed Risk",
        chart_title_operational_efficiency: "Operational Efficiency",
        chart_title_demurrage_by_shipowner: "Demurrage Cost by Shipowner",
        chart_title_avg_days_by_shipowner: "Average Demurrage Days by Shipowner",
        analytics_placeholder_title: "Analytics Unavailable",
        analytics_placeholder_subtitle: "Current filters returned no data for analysis.",
        summary_total_cost_returned: "Total Cost (Returned)",
        summary_paid: "Total Paid",
        summary_unpaid: "Total Pending",
        placeholder_title: "Waiting for file...",
        placeholder_subtitle: "Select the spreadsheet to start the demurrage analysis.",
        loading_text: "Processing...",
        export_btn: "Export PDF",
        save_btn: "Save",
        rates_modal_title: "Demurrage Rates by Shipowner",
        rates_modal_footer_note: "Undefined values will use the default rate.",
        ai_modal_title: "AI Generated Insights",
        history_modal_title: "Upload History",
        return_to_live_btn: "Return to live view",
        toast_clear_data: "Data and history have been cleared.",
        toast_data_loaded: "Data loaded successfully!",
        toast_no_data: "No data found in the file.",
        toast_error_processing: "Error processing the file.",
        toast_settings_saved: "Settings saved successfully!",
        toast_history_loaded: "Viewing historical data from",
        toast_returned_to_live: "Returned to live data view.",
        cost_summary_text: (paid, potential) => `Actual demurrage cost (paid/incurred) is ${formatCurrency(paid)}, while the current cost from late active containers is ${formatCurrency(potential)}.`,
        performance_donut_summary_text: (p) => `Of the total containers analyzed, ${p}% were successfully returned, demonstrating excellent efficiency and cost savings.`,
        table_header_container: "Container",
        table_header_po: "PO",
        table_header_vessel: "Vessel",
        table_header_return_date: "Return Date",
        table_header_demurrage_days: "Demurrage Days",
        table_header_cost: "Cost",
        table_header_paid: "Paid?",
        tooltip_cost: "Cost",
        tooltip_containers: "Containers",
        chart_tooltip_avg_days: "Average Days",
        tooltip_from: "from",
        chart_label_returned_on_time: "Returned on Time",
        chart_label_returned_late: "Returned Late",
        chart_label_active_with_demurrage: "Active (with demurrage)",
        chart_label_active_in_free_period: "Active (in free period)",
        card_status_invalid_date: "Invalid Date",
        chart_label_actual_cost_returned: "Actual Cost (Returned)",
        chart_label_incurred_cost_active: "Incurred Cost (Active)",
        chart_no_data: "No data to display",
        chart_label_days_suffix: "days",
        generate_report_btn: "Generate Justification Report",
        toast_report_copied: "Report copied to clipboard!",
        generating_report: "Generating report...",
        report_title: "Demurrage Justification Report",
        copy_btn: "Copy",
        error_generating_report: "An error occurred while generating the report. Please check your API key and try again.",
    },
    zh: {
        main_title: "滞期费控制仪表板",
        upload_prompt_initial: "上传您的电子表格以开始",
        upload_prompt_updated: "最后更新:",
        global_search_placeholder: "搜索所有详情...",
        clear_data_btn: "清除数据",
        ai_insights_btn: "AI 洞察",
        upload_btn: "上传 XLSX",
        filter_po: "筛选采购订单",
        filter_vessel: "筛选船只",
        vessel_search_placeholder: "搜索...",
        filter_container: "筛选集装箱",
        filter_final_status: "最终状态",
        filter_loading_type: "装载类型",
        filter_cargo_type: "货物类型",
        filter_shipowner: "船东",
        filter_arrival_start: "抵达开始日期",
        filter_arrival_end: "抵达结束日期",
        filter_freetime_start: "免租期开始日期",
        filter_freetime_end: "免租期结束日期",
        filter_btn: "筛选",
        clear_btn: "清除",
        tab_dashboard: "仪表板",
        tab_analytics: "分析",
        tab_paid_demurrage: "已付滞期费",
        kpi_demurrage_title: "有滞期费",
        kpi_demurrage_subtitle: "超过期限的集装箱",
        kpi_returned_late_title: "退还有滞期费",
        kpi_returned_late_subtitle: "有成本交付的集装箱",
        kpi_risk_title: "有风险 (未来15天)",
        kpi_risk_subtitle: "期限即将到期的集装箱",
        kpi_returned_title: "准时退还",
        kpi_returned_subtitle: "无成本退还的集装箱",
        kpi_cost_title: "总滞期费成本",
        kpi_cost_subtitle: "*活动中和已退还集装箱的成本",
        board_title_demurrage: "有滞期费 (延迟)",
        board_title_high_risk: "高风险 (到期 ≤ 15天)",
        board_title_medium_risk: "注意 (到期 ≤ 30天)",
        board_title_low_risk: "安全 (> 30天)",
        board_title_date_issue: "审查日期",
        chart_title_cost_analysis: "成本分析：实际与管理风险",
        chart_title_operational_efficiency: "运营绩效",
        chart_title_demurrage_by_shipowner: "按船东划分的滞期费成本",
        chart_title_avg_days_by_shipowner: "船东平均滞期天数",
        analytics_placeholder_title: "分析不可用",
        analytics_placeholder_subtitle: "当前筛选器未返回可供分析的数据。",
        summary_total_cost_returned: "总成本 (已退还)",
        summary_paid: "总计已付",
        summary_unpaid: "总计待付",
        placeholder_title: "等待文件...",
        placeholder_subtitle: "选择电子表格以开始滞期费分析。",
        loading_text: "处理中...",
        export_btn: "导出 PDF",
        save_btn: "保存",
        rates_modal_title: "按船东划分的滞期费率",
        rates_modal_footer_note: "未定义的值将使用默认费率。",
        ai_modal_title: "AI 生成的洞察",
        history_modal_title: "上传历史",
        return_to_live_btn: "返回实时视图",
        toast_clear_data: "数据和历史记录已清除。",
        toast_data_loaded: "数据加载成功！",
        toast_no_data: "文件中未找到数据。",
        toast_error_processing: "处理文件时出错。",
        toast_settings_saved: "设置已成功保存！",
        toast_history_loaded: "正在查看历史数据从",
        toast_returned_to_live: "已返回实时数据视图。",
        cost_summary_text: (paid, potential) => `实际滞期费成本（已付/已发生）为 ${formatCurrency(paid)}，而当前延迟活动集装箱的成本为 ${formatCurrency(potential)}。`,
        performance_donut_summary_text: (p) => `在分析的总集装箱中，${p}% 已成功归还，显示出卓越的效率和成本节约。`,
        table_header_container: "集装箱",
        table_header_po: "采购订单",
        table_header_vessel: "船只",
        table_header_return_date: "退还日期",
        table_header_demurrage_days: "滞期天数",
        table_header_cost: "成本",
        table_header_paid: "已付?",
        tooltip_cost: "成本",
        tooltip_containers: "集装箱",
        chart_tooltip_avg_days: "平均天数",
        tooltip_from: "来自",
        chart_label_returned_on_time: "按时归还",
        chart_label_returned_late: "延迟归还",
        chart_label_active_with_demurrage: "活跃 (有滞期费)",
        chart_label_active_in_free_period: "活跃 (免租期内)",
        card_status_invalid_date: "无效日期",
        chart_label_actual_cost_returned: "实际成本 (已退还)",
        chart_label_incurred_cost_active: "发生费用 (活动中)",
        chart_no_data: "无数据显示",
        chart_label_days_suffix: "天",
        generate_report_btn: "生成理由报告",
        toast_report_copied: "报告已复制到剪贴板！",
        generating_report: "正在生成报告...",
        report_title: "滞期费理由报告",
        copy_btn: "复制",
        error_generating_report: "生成报告时出错。请检查您的 API 密钥并重试。",
    }
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
    if (!date) return 'N/A';
    return date.toLocaleDateString(locale === 'pt' ? 'pt-BR' : locale, {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        timeZone: 'UTC' // Display date in UTC to avoid off-by-one day errors
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
        if (isoMatch) return new Date(dateInput); // ISO strings are parsed as UTC

        const parts = dateInput.split(/[/.-]/);
        if (parts.length === 3) {
            const day = parseInt(parts[0], 10);
            const month = parseInt(parts[1], 10);
            let year = parseInt(parts[2], 10);
            if (year < 100) year += 2000;

            if (!isNaN(day) && !isNaN(month) && !isNaN(year)) {
                // Create a date in UTC to avoid timezone issues. Month is 1-based, JS Date is 0-based.
                return new Date(Date.UTC(year, month - 1, day));
            }
        }
    }
    // Excel's date serial number (days since 1900-01-01). This formula gives UTC milliseconds.
    if (typeof dateInput === 'number' && dateInput > 0) {
        return new Date(Math.round((dateInput - 25569) * 86400 * 1000));
    }
    throw new Error(`Invalid date format: ${dateInput}`);
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
                const dischargeDate = row['Discharge Date'] ? parseDate(row['Discharge Date']) : null;
                const freeDays = parseInt(row['Free Days'], 10) || 0;

                let endOfFreeTime: Date;
                if (row['End of Free Time']) {
                    endOfFreeTime = parseDate(row['End of Free Time']);
                } else if (dischargeDate) {
                    endOfFreeTime = new Date(dischargeDate.getTime());
                    endOfFreeTime.setUTCDate(dischargeDate.getUTCDate() + freeDays);
                } else {
                    console.error(`Skipping row, cannot determine end of free time for container ${row.Container}`);
                    return null; // Skip if no end date can be found
                }
                
                let hasDateError = false;
                const dischargeYear = dischargeDate ? dischargeDate.getUTCFullYear() : 0;
                const endOfFreeTimeYear = endOfFreeTime ? endOfFreeTime.getUTCFullYear() : 0;
                if (dischargeYear < 1950 || (endOfFreeTimeYear > 0 && endOfFreeTimeYear < 1950)) {
                    hasDateError = true;
                }

                // Determine Return Date based on Status
                const statusDepot = String(row['Status Depot'] || '').trim().toUpperCase();
                const actualReturnDateValue = row['Return Date'];
                let returnDate: Date | undefined = undefined;

                if (statusDepot === 'ENTREGUE' && actualReturnDateValue) {
                    try {
                        returnDate = parseDate(actualReturnDateValue);
                    } catch {
                        console.warn(`Container ${row.Container} has status ENTREGUE but invalid return date. Treating as active.`);
                        returnDate = undefined;
                    }
                }
                
                const today = new Date();
                const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
                
                let demurrageDays = 0;
                const effectiveDate = returnDate || todayUTC; 

                if (effectiveDate > endOfFreeTime) {
                    const diffTime = effectiveDate.getTime() - endOfFreeTime.getTime();
                    demurrageDays = Math.max(0, Math.ceil(diffTime / (1000 * 60 * 60 * 24)));
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
                // Silently log the error and skip the row.
                console.error(`Error processing row for container ${row.Container}:`, error);
                return null;
            }
        })
        .filter((item): item is ContainerData => item !== null);

    return processed;
}

const handleFileUpload = (event: Event) => {
    loadingOverlay.classList.remove('hidden');
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        loadingOverlay.classList.add('hidden');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
            // Use header:1 to get an array of arrays, easier to map headers this way
            const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 });

            if (jsonData.length < 2) {
                 throw new Error("Spreadsheet is empty or has no data rows.");
            }

            const headers: string[] = jsonData[0];
            const rows = jsonData.slice(1);

            const columnMapping: {[key: string]: string} = {
                'CNTRS ORIGINAL': 'Container',
                'PO SAP': 'PO',
                'ARRIVAL VESSEL': 'Vessel',
                'ATA': 'Discharge Date',
                'FREE TIME': 'Free Days',
                'DEADLINE RETURN CNTR': 'End of Free Time',
                'STATUS CNTR WAREHOUSE': 'Final Status',
                'LOADING TYPE': 'Loading Type',
                'TYPE OF CARGO': 'Cargo Type',
                'SHIPOWNER': 'Shipowner',
                'ACTUAL DEPOT RETURN DATE': 'Return Date',
                'STATUS': 'Status Depot'
            };
            
            // Create a map from the actual header name in the file to our target key
            const headerMap: {[key: string]: string} = {};
            headers.forEach(header => {
                for (const mapKey in columnMapping) {
                    if (String(header).trim().toUpperCase() === mapKey.toUpperCase()) {
                        headerMap[header] = columnMapping[mapKey];
                    }
                }
            });

            // Convert rows to objects using our mapped headers
            const mappedData = rows.map(rowArray => {
                const newRow: { [key: string]: any } = {};
                headers.forEach((header, index) => {
                     const mappedKey = headerMap[header] || header.trim();
                     newRow[mappedKey] = rowArray[index];
                });
                return newRow;
            });
            
            if (appState.allData.length > 0) {
                 saveHistorySnapshot(file.name);
            }

            appState.allData = processData(mappedData);
            
            if (appState.allData.length === 0) {
                showToast(translate('toast_no_data'), 'error');
                return;
            }
            
            appState.filteredData = appState.allData;
            appState.paidStatuses = {}; // Reset paid statuses on new upload
            updateLastUpdate(file.name);
            renderDashboard();
            salvarDados(); // << INTEGRATION: Saves new data to Firebase
            
            showToast(translate('toast_data_loaded'), 'success');
        } catch (error) {
            console.error(error);
            showToast(`${translate('toast_error_processing')}: ${error.message}`, 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            (event.target as HTMLInputElement).value = ''; // Reset file input
        }
    };
    reader.readAsBinaryString(file);
};

// --- RENDER FUNCTIONS ---
function renderDashboard() {
    if (appState.allData.length === 0) {
        mainContentArea.classList.add('hidden');
        placeholder.classList.remove('hidden');
        filterContainer.classList.add('hidden');
        clearDataBtn.classList.add('hidden');
        settingsBtn.classList.add('hidden');
        aiInsightsBtn.classList.add('hidden');
        historyBtn.classList.add('hidden');
        return;
    }
    mainContentArea.classList.remove('hidden');
    placeholder.classList.add('hidden');
    filterContainer.classList.remove('hidden');
    historyBtn.classList.remove('hidden');
    settingsBtn.classList.remove('hidden');
    clearDataBtn.classList.remove('hidden');
    aiInsightsBtn.classList.remove('hidden');

    populateFilters();
    updateKPIs();
    renderColumns();
    renderPaidDemurrageTable();
    createOrUpdateCharts();
    translateApp();
}

function updateLastUpdate(fileName: string) {
    const now = new Date();
    const formattedDate = `${now.toLocaleDateString()} ${now.toLocaleTimeString()}`;
    lastUpdateEl.innerHTML = `<span data-translate-key="upload_prompt_updated">${translate('upload_prompt_updated')}</span> ${fileName} em ${formattedDate}`;
}

function populateFilters() {
    const createOptions = (values: Set<string>): string => {
        return Array.from(values).sort().map(value => `<option value="${value}">${value}</option>`).join('');
    };
    
    const pos = new Set(appState.allData.map(d => d['PO']));
    const vessels = new Set(appState.allData.map(d => d['Vessel']));
    const containers = new Set(appState.allData.map(d => d['Container']));
    const finalStatuses = new Set(appState.allData.map(d => d['Final Status']));
    const loadingTypes = new Set(appState.allData.map(d => d['Loading Type']));
    const cargoTypes = new Set(appState.allData.map(d => d['Cargo Type']));
    const shipowners = new Set(appState.allData.map(d => d['Shipowner']));

    document.getElementById('po-filter')!.innerHTML = createOptions(pos);
    document.getElementById('vessel-filter')!.innerHTML = createOptions(vessels);
    document.getElementById('container-filter')!.innerHTML = createOptions(containers);
    document.getElementById('final-status-filter')!.innerHTML = createOptions(finalStatuses);
    document.getElementById('loading-type-filter')!.innerHTML = createOptions(loadingTypes);
    document.getElementById('cargo-type-filter')!.innerHTML = createOptions(cargoTypes);
    document.getElementById('shipowner-filter')!.innerHTML = createOptions(shipowners);
}

function updateKPIs() {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const activeContainers = appState.filteredData.filter(d => !d['Return Date']);
    
    const demurrageCount = activeContainers.filter(d => d['Demurrage Days'] > 0 && !d.hasDateError).length;
    const returnedLateCount = appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Days'] > 0).length;
    const riskCount = activeContainers.filter(d => {
        if (d.hasDateError) return false;
        const diffTime = d['End of Free Time'].getTime() - todayUTC.getTime();
        const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
        return diffDays >= 0 && diffDays <= 15;
    }).length;
    const returnedCount = appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Days'] === 0).length;
    const totalCost = appState.filteredData.reduce((acc, d) => acc + (d['Demurrage Cost'] || 0), 0);
    
    document.getElementById('demurrage-count')!.textContent = demurrageCount.toString();
    document.getElementById('returned-late-count')!.textContent = returnedLateCount.toString();
    document.getElementById('risk-count')!.textContent = riskCount.toString();
    document.getElementById('returned-count')!.textContent = returnedCount.toString();
    document.getElementById('total-cost')!.textContent = formatCurrency(totalCost);
}

function renderColumns() {
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

    const activeContainers = appState.filteredData.filter(d => !d['Return Date']);

    const dateIssueCol = document.querySelector('#col-date-issue .demurrage-column')!;
    const demurrageCol = document.querySelector('#col-demurrage .demurrage-column')!;
    const highRiskCol = document.querySelector('#col-high-risk .demurrage-column')!;
    const mediumRiskCol = document.querySelector('#col-medium-risk .demurrage-column')!;
    const lowRiskCol = document.querySelector('#col-low-risk .demurrage-column')!;

    dateIssueCol.innerHTML = '';
    demurrageCol.innerHTML = '';
    highRiskCol.innerHTML = '';
    mediumRiskCol.innerHTML = '';
    lowRiskCol.innerHTML = '';

    const containersWithDateIssues = activeContainers.filter(c => c.hasDateError);
    const otherActiveContainers = activeContainers.filter(c => !c.hasDateError);

    containersWithDateIssues
        .sort((a, b) => a.Container.localeCompare(b.Container))
        .forEach(container => {
            const card = createContainerCard(container, 0, true);
            dateIssueCol.appendChild(card);
        });

    otherActiveContainers
        .sort((a, b) => b['Demurrage Days'] - a['Demurrage Days'])
        .forEach(container => {
            const diffTime = container['End of Free Time'].getTime() - todayUTC.getTime();
            const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
            const card = createContainerCard(container, diffDays);

            if (diffDays < 0) {
                demurrageCol.appendChild(card);
            } else if (diffDays <= 15) {
                highRiskCol.appendChild(card);
            } else if (diffDays <= 30) {
                mediumRiskCol.appendChild(card);
            } else {
                lowRiskCol.appendChild(card);
            }
        });
}

function createContainerCard(container: ContainerData, diffDays: number, isDateIssue = false): HTMLElement {
    const card = document.createElement('div');
    card.className = 'container-card p-3 space-y-2';
    
    let borderColor = 'border-green-500';
    if (isDateIssue) {
        borderColor = 'border-purple-500';
    } else if (diffDays < 0) borderColor = 'border-red-500';
    else if (diffDays <= 15) borderColor = 'border-orange-500';
    else if (diffDays <= 30) borderColor = 'border-yellow-500';
    card.classList.add(borderColor);

    const statusHtml = isDateIssue ?
        `<p class="font-bold text-purple-600" data-translate-key="card_status_invalid_date">${translate('card_status_invalid_date')}</p>` :
        (diffDays < 0 ? 
            `<p class="font-bold text-red-600">${container['Demurrage Days']} days late</p>` :
            `<p class="font-bold text-green-600">${diffDays} days left</p>`
        );

    card.innerHTML = `
        <div class="flex justify-between items-start">
            <p class="font-bold text-sm text-gray-800 dark:text-slate-100">${container.Container}</p>
            <p class="text-xs font-semibold px-2 py-0.5 rounded-full ${diffDays < 0 ? 'bg-red-100 text-red-800 dark:bg-red-900/50 dark:text-red-300' : 'bg-gray-100 text-gray-800 dark:bg-slate-700 dark:text-slate-300'}">${container['Final Status']}</p>
        </div>
        <p class="text-xs text-gray-500 dark:text-slate-400">PO: <span class="font-medium text-gray-700 dark:text-slate-300">${container.PO}</span></p>
        <p class="text-xs text-gray-500 dark:text-slate-400">Vessel: <span class="font-medium text-gray-700 dark:text-slate-300">${container.Vessel}</span></p>
        <div class="flex justify-between text-xs pt-1">
            <p class="text-gray-500 dark:text-slate-400">Deadline: <span class="font-bold text-gray-800 dark:text-slate-200">${formatDate(container['End of Free Time'])}</span></p>
            ${statusHtml}
        </div>
        ${container['Demurrage Cost'] > 0 ? `<p class="text-right text-xs font-bold text-red-600">Cost: ${formatCurrency(container['Demurrage Cost'])}</p>` : ''}
    `;

    card.addEventListener('click', () => openDetailsModal(container));
    return card;
}

// --- FILTERING LOGIC ---
function applyFilters() {
    const getSelectedOptions = (id: string): string[] => Array.from(document.getElementById(id)!.selectedOptions).map(o => o.value);
    
    const poFilter = getSelectedOptions('po-filter');
    const vesselFilter = getSelectedOptions('vessel-filter');
    const containerFilter = getSelectedOptions('container-filter');
    const statusFilter = getSelectedOptions('final-status-filter');
    const loadingTypeFilter = getSelectedOptions('loading-type-filter');
    const cargoTypeFilter = getSelectedOptions('cargo-type-filter');
    const shipownerFilter = getSelectedOptions('shipowner-filter');

    const arrivalStartValue = (document.getElementById('arrival-start-date') as HTMLInputElement).value;
    const arrivalStartDate = arrivalStartValue ? new Date(arrivalStartValue + 'T00:00:00.000Z') : null;
    const arrivalEndValue = (document.getElementById('arrival-end-date') as HTMLInputElement).value;
    const arrivalEndDate = arrivalEndValue ? new Date(arrivalEndValue + 'T23:59:59.999Z') : null;

    const freetimeStartValue = (document.getElementById('freetime-start-date') as HTMLInputElement).value;
    const freetimeStartDate = freetimeStartValue ? new Date(freetimeStartValue + 'T00:00:00.000Z') : null;
    const freetimeEndValue = (document.getElementById('freetime-end-date') as HTMLInputElement).value;
    const freetimeEndDate = freetimeEndValue ? new Date(freetimeEndValue + 'T23:59:59.999Z') : null;

    appState.filteredData = appState.allData.filter(d => {
        const arrivalDateMatch = (!arrivalStartDate || (d['Discharge Date'] && d['Discharge Date'] >= arrivalStartDate)) &&
                                  (!arrivalEndDate || (d['Discharge Date'] && d['Discharge Date'] <= arrivalEndDate));
    
        const freetimeDateMatch = (!freetimeStartDate || d['End of Free Time'] >= freetimeStartDate) &&
                                   (!freetimeEndDate || d['End of Free Time'] <= freetimeEndDate);

        return (poFilter.length === 0 || poFilter.includes(d.PO)) &&
               (vesselFilter.length === 0 || vesselFilter.includes(d.Vessel)) &&
               (containerFilter.length === 0 || containerFilter.includes(d.Container)) &&
               (statusFilter.length === 0 || statusFilter.includes(d['Final Status'])) &&
               (loadingTypeFilter.length === 0 || loadingTypeFilter.includes(d['Loading Type'])) &&
               (cargoTypeFilter.length === 0 || cargoTypeFilter.includes(d['Cargo Type'])) &&
               (shipownerFilter.length === 0 || shipownerFilter.includes(d.Shipowner)) &&
               arrivalDateMatch &&
               freetimeDateMatch;
    });

    globalSearch((document.getElementById('global-search-input') as HTMLInputElement).value);
    renderDashboard();
}

function resetFilters() {
    const selects = filterContainer.querySelectorAll('select');
    selects.forEach(s => {
        s.selectedIndex = -1;
        // Also clear search inputs for filter dropdowns
        const searchInput = document.getElementById(`${s.id.replace('-filter', '-search-input')}`);
        if(searchInput) (searchInput as HTMLInputElement).value = '';
    });
    
    (document.getElementById('arrival-start-date') as HTMLInputElement).value = '';
    (document.getElementById('arrival-end-date') as HTMLInputElement).value = '';
    (document.getElementById('freetime-start-date') as HTMLInputElement).value = '';
    (document.getElementById('freetime-end-date') as HTMLInputElement).value = '';

    appState.filteredData = appState.allData;
    (document.getElementById('global-search-input') as HTMLInputElement).value = '';
    renderDashboard();
}

function setupFilterSearch() {
    ['vessel', 'container', 'shipowner'].forEach(filterName => {
        const searchInput = document.getElementById(`${filterName}-search-input`) as HTMLInputElement;
        const select = document.getElementById(`${filterName}-filter`) as HTMLSelectElement;
        
        searchInput.addEventListener('input', () => {
            const searchTerm = searchInput.value.toLowerCase();
            Array.from(select.options).forEach(option => {
                const text = option.textContent?.toLowerCase() || '';
                option.style.display = text.includes(searchTerm) ? '' : 'none';
            });
        });
    });
}

function globalSearch(term: string) {
    if (!term) {
        // if term is empty, applyFilters would have already reset the data
        return;
    }
    const lowerTerm = term.toLowerCase();
    appState.filteredData = appState.filteredData.filter(d => {
        return Object.values(d).some(val => 
            String(val).toLowerCase().includes(lowerTerm)
        );
    });
}

// --- MODAL FUNCTIONS ---
function setupModals() {
    const allModals = document.querySelectorAll('.modal');
    allModals.forEach(modal => {
        const closeBtn = modal.querySelector('.modal-content-wrapper ~ button, [id$="-close-btn"]');
        
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                closeModal(modal.id);
            }
        });

        if(closeBtn) {
            closeBtn.addEventListener('click', () => closeModal(modal.id));
        }
    });
}

function openModal(id: string) {
    const modal = document.getElementById(id);
    if(modal) {
      modal.classList.remove('hidden');
      setTimeout(() => modal.classList.add('modal-open'), 10);
    }
}

function closeModal(id: string) {
    const modal = document.getElementById(id);
    if(modal) {
      modal.classList.remove('modal-open');
      setTimeout(() => modal.classList.add('hidden'), 300);
    }
}

function openDetailsModal(container: ContainerData) {
    const header = document.getElementById('modal-header-content')!;
    header.innerHTML = `
        <h2 class="text-2xl font-bold text-gray-800 dark:text-slate-100">${container.Container}</h2>
        <p class="text-sm text-gray-500 dark:text-slate-400">PO: ${container.PO} / Navio: ${container.Vessel}</p>
    `;

    const detailsContent = document.getElementById('modal-details-content')!;
    const reportArea = document.getElementById('justification-report-area')!;
    reportArea.innerHTML = ''; // Clear previous report content

    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const diffTime = container['End of Free Time'].getTime() - todayUTC.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    detailsContent.innerHTML = `
        <div class="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div class="md:col-span-2 space-y-4">
                <h3 class="font-bold text-lg text-gray-700 dark:text-slate-200 border-b pb-2">Detalhes Operacionais</h3>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><p class="text-gray-500 dark:text-slate-400">Armador</p><p class="font-semibold text-gray-800 dark:text-slate-100">${container.Shipowner}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Status Final</p><p class="font-semibold text-gray-800 dark:text-slate-100">${container['Final Status']}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Tipo de Carga</p><p class="font-semibold text-gray-800 dark:text-slate-100">${container['Cargo Type']}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Tipo de Carregamento</p><p class="font-semibold text-gray-800 dark:text-slate-100">${container['Loading Type']}</p></div>
                </div>
                <h3 class="font-bold text-lg text-gray-700 dark:text-slate-200 border-b pb-2 pt-4">Datas Relevantes</h3>
                <div class="grid grid-cols-2 gap-4 text-sm">
                    <div><p class="text-gray-500 dark:text-slate-400">Data de Descarga</p><p class="font-semibold text-gray-800 dark:text-slate-100">${formatDate(container['Discharge Date'])}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Dias Livres</p><p class="font-semibold text-gray-800 dark:text-slate-100">${container['Free Days']}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Fim do Tempo Livre</p><p class="font-semibold text-gray-800 dark:text-slate-100">${formatDate(container['End of Free Time'])}</p></div>
                    <div><p class="text-gray-500 dark:text-slate-400">Data de Devolução</p><p class="font-semibold text-gray-800 dark:text-slate-100">${formatDate(container['Return Date'])}</p></div>
                </div>
            </div>
            <div class="space-y-4 bg-slate-50 dark:bg-slate-800/50 p-4 rounded-lg">
                <h3 class="font-bold text-lg text-gray-700 dark:text-slate-200 border-b pb-2">Análise de Demurrage</h3>
                <div class="text-center">
                     <p class="text-6xl font-extrabold ${container['Demurrage Cost'] > 0 ? 'text-red-500' : 'text-green-500'}">${formatCurrency(container['Demurrage Cost'])}</p>
                     <p class="text-sm font-medium text-gray-600 dark:text-slate-300">Custo de Demurrage</p>
                </div>
                <div class="text-center">
                     <p class="text-4xl font-bold ${container['Demurrage Days'] > 0 ? 'text-red-500' : 'text-green-500'}">${container['Demurrage Days']}</p>
                     <p class="text-sm font-medium text-gray-600 dark:text-slate-300">Dias de Demurrage</p>
                </div>
                <div class="text-center">
                     <p class="text-2xl font-bold ${diffDays < 0 ? 'text-red-500' : 'text-green-500'}">${diffDays < 0 ? `${Math.abs(diffDays)} dias atrasado` : `${diffDays} dias restantes`}</p>
                     <p class="text-sm font-medium text-gray-600 dark:text-slate-300">Status Atual</p>
                </div>
            </div>
        </div>
    `;

    if (container['Demurrage Cost'] > 0) {
        reportArea.innerHTML = `<button id="generate-report-btn" class="w-full bg-indigo-600 text-white px-4 py-2 rounded-md shadow-sm hover:bg-indigo-700 font-semibold flex items-center justify-center">
            <i class="fas fa-file-invoice-dollar mr-2"></i> <span data-translate-key="generate_report_btn">${translate('generate_report_btn')}</span>
        </button>`;
        document.getElementById('generate-report-btn')!.addEventListener('click', (e) => {
            const button = e.currentTarget as HTMLButtonElement;
            button.disabled = true;
            generateDemurrageJustification(container);
        });
    }

    openModal('details-modal');
}


function openListModal(category: string) {
    let dataToList: ContainerData[] = [];
    let title = '';
    const today = new Date();
    const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const activeContainers = appState.filteredData.filter(d => !d['Return Date'] && !d.hasDateError);

    switch (category) {
        case 'demurrage':
            title = 'Containers com Demurrage';
            dataToList = activeContainers.filter(d => d['Demurrage Days'] > 0);
            break;
        case 'risk':
            title = 'Containers em Risco (Vencimento em até 15 dias)';
            dataToList = activeContainers.filter(d => {
                const diffTime = d['End of Free Time'].getTime() - todayUTC.getTime();
                const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));
                return diffDays >= 0 && diffDays <= 15;
            });
            break;
        case 'returned':
            title = 'Containers Devolvidos no Prazo';
            dataToList = appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Days'] === 0);
            break;
    }

    document.getElementById('list-modal-title')!.textContent = title;
    renderListModalTable(dataToList);
    
    const filterInput = document.getElementById('list-modal-filter') as HTMLInputElement;
    filterInput.value = '';
    filterInput.oninput = () => {
        const term = filterInput.value.toLowerCase();
        const filtered = dataToList.filter(d => Object.values(d).some(v => String(v).toLowerCase().includes(term)));
        renderListModalTable(filtered);
    };

    openModal('list-modal');
}

function renderListModalTable(data: ContainerData[]) {
    const body = document.getElementById('list-modal-body')!;
    if (data.length === 0) {
        body.innerHTML = '<p class="text-center text-gray-500 dark:text-slate-400">Nenhum container para exibir.</p>';
        return;
    }
    
    const { key, direction } = appState.currentSort;

    const tableHeaders = [
        { key: 'Container', label: 'Container' },
        { key: 'PO', label: 'PO' },
        { key: 'Vessel', label: 'Navio' },
        { key: 'End of Free Time', label: 'Deadline' },
        { key: 'Demurrage Days', label: 'Dias Demurrage' },
        { key: 'Demurrage Cost', label: 'Custo' },
        { key: 'Shipowner', label: 'Armador' },
    ];
    
    const headerHtml = tableHeaders.map(h => {
        const isSorted = h.key === key;
        const sortClass = isSorted ? (direction === 'asc' ? 'sorted-asc' : 'sorted-desc') : '';
        return `<th data-sort-key="${h.key}" class="${sortClass}">${h.label}</th>`;
    }).join('');

    const sortedData = [...data].sort((a, b) => {
        if (direction === 'none') return 0;
        
        const valA = a[key];
        const valB = b[key];

        if (valA instanceof Date && valB instanceof Date) {
            return direction === 'asc' ? valA.getTime() - b.getTime() : b.getTime() - valA.getTime();
        }
        if (typeof valA === 'number' && typeof valB === 'number') {
            return direction === 'asc' ? valA - valB : valB - a;
        }
        if (typeof valA === 'string' && typeof valB === 'string') {
            return direction === 'asc' ? valA.localeCompare(valB) : valB.localeCompare(valA);
        }
        return 0;
    });

    const bodyHtml = sortedData.map(d => `
        <tr class="hover:bg-gray-50 dark:hover:bg-slate-700/50">
            <td>${d.Container}</td>
            <td>${d.PO}</td>
            <td>${d.Vessel}</td>
            <td>${formatDate(d['End of Free Time'])}</td>
            <td class="font-semibold ${d['Demurrage Days'] > 0 ? 'text-red-500' : ''}">${d['Demurrage Days']}</td>
            <td class="font-semibold ${d['Demurrage Cost'] > 0 ? 'text-red-500' : ''}">${formatCurrency(d['Demurrage Cost'])}</td>
            <td>${d.Shipowner}</td>
        </tr>
    `).join('');

    body.innerHTML = `
      <div class="overflow-x-auto">
        <table id="list-modal-table" class="data-table">
            <thead><tr>${headerHtml}</tr></thead>
            <tbody>${bodyHtml}</tbody>
        </table>
      </div>`;

    document.querySelectorAll('#list-modal-table th[data-sort-key]').forEach(th => {
        th.addEventListener('click', () => {
            const newKey = th.getAttribute('data-sort-key')!;
            if (key === newKey) {
                appState.currentSort.direction = direction === 'asc' ? 'desc' : 'asc';
            } else {
                appState.currentSort.key = newKey;
                appState.currentSort.direction = 'desc'; // Default to desc for new columns
            }
            renderListModalTable(data);
        });
    });
}

function openRatesModal() {
    const body = document.getElementById('rates-modal-body')!;
    const shipowners = ['default', ...Array.from(new Set(appState.allData.map(d => d.Shipowner.trim().toUpperCase())))];
    
    body.innerHTML = shipowners.filter(s => s && s !== 'N/A').map(owner => `
        <div>
            <label for="rate-${owner}" class="block text-sm font-medium text-gray-700 dark:text-slate-300">${owner === 'default' ? 'Taxa Padrão (Default)' : owner}</label>
            <input type="number" id="rate-${owner}" class="mt-1 block w-full rounded-md border-gray-300 dark:border-slate-600 dark:bg-slate-700 dark:text-slate-200 shadow-sm" value="${appState.demurrageRates[owner] || appState.demurrageRates.default}">
        </div>
    `).join('');
    
    openModal('rates-modal');
}

function saveRates() {
    const newRates = { ...appState.demurrageRates };
    document.querySelectorAll('#rates-modal-body input[type="number"]').forEach(input => {
        const id = input.id.replace('rate-', '');
        const value = parseFloat((input as HTMLInputElement).value);
        if (!isNaN(value)) {
            newRates[id] = value;
        }
    });
    appState.demurrageRates = newRates;

    // Efficiently recalculate cost without reprocessing all data from scratch
    appState.allData.forEach(container => {
        const shipowner = container.Shipowner.toUpperCase();
        const rate = appState.demurrageRates[shipowner] || appState.demurrageRates.default;
        container['Demurrage Cost'] = container['Demurrage Days'] * rate;
    });

    salvarDados(); // << INTEGRATION: Saves new rates to Firebase
    showToast(translate('toast_settings_saved'), 'success');
    
    applyFilters();
    
    closeModal('rates-modal');
}


// --- HISTORY MANAGEMENT ---
function saveHistorySnapshot(fileName: string) {
    const history: HistorySnapshot[] = JSON.parse(localStorage.getItem('demurrageHistory') || '[]');
    
    const snapshot: HistorySnapshot = {
        timestamp: new Date().toISOString(),
        fileName: fileName,
        data: appState.allData,
        rates: appState.demurrageRates,
        paidStatuses: appState.paidStatuses
    };

    history.unshift(snapshot);
    if (history.length > MAX_HISTORY_SNAPSHOTS) {
        history.pop();
    }
    
    localStorage.setItem('demurrageHistory', JSON.stringify(history));
}

function loadHistorySnapshot(timestamp: string) {
    const history: HistorySnapshot[] = JSON.parse(localStorage.getItem('demurrageHistory') || '[]');
    const snapshot = history.find(h => h.timestamp === timestamp);

    if (snapshot) {
        appState.allData = snapshot.data.map(d => {
            const dischargeDate = d['Discharge Date'] ? new Date(d['Discharge Date']) : null;
            const endOfFreeTime = new Date(d['End of Free Time']);
            
            let hasDateError = false;
            if ((dischargeDate && dischargeDate.getUTCFullYear() < 1950) || (endOfFreeTime && endOfFreeTime.getUTCFullYear() < 1950)) {
                hasDateError = true;
            }

            return {
                ...d,
                'Discharge Date': dischargeDate,
                'End of Free Time': endOfFreeTime,
                'Return Date': d['Return Date'] ? new Date(d['Return Date']) : undefined,
                hasDateError,
            };
        });
        appState.demurrageRates = snapshot.rates;
        appState.paidStatuses = snapshot.paidStatuses;
        
        resetFilters(); // Also calls renderDashboard
        
        appState.isViewingHistory = true;
        showHistoryBanner(snapshot.fileName, new Date(snapshot.timestamp));
        closeModal('history-modal');
        showToast(`${translate('toast_history_loaded')} ${snapshot.fileName}`, 'info');
    }
}

function renderHistoryModal() {
    const history: HistorySnapshot[] = JSON.parse(localStorage.getItem('demurrageHistory') || '[]');
    const body = document.getElementById('history-modal-body')!;
    
    if (history.length === 0) {
        body.innerHTML = '<p class="text-center text-gray-500 dark:text-slate-400">Nenhum histórico de upload encontrado.</p>';
    } else {
        body.innerHTML = history.map(h => `
            <div class="p-3 rounded-lg bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 flex justify-between items-center cursor-pointer" data-timestamp="${h.timestamp}">
                <div>
                    <p class="font-semibold text-gray-800 dark:text-slate-200">${h.fileName}</p>
                    <p class="text-xs text-gray-500 dark:text-slate-400">Salvo em: ${new Date(h.timestamp).toLocaleString()}</p>
                </div>
                <i class="fas fa-history text-gray-400 dark:text-slate-500"></i>
            </div>
        `).join('');

        body.querySelectorAll('[data-timestamp]').forEach(el => {
            el.addEventListener('click', () => {
                loadHistorySnapshot(el.getAttribute('data-timestamp')!);
            });
        });
    }

    openModal('history-modal');
}

function showHistoryBanner(fileName: string, timestamp: Date) {
    historyBannerText.textContent = `Visualizando dados históricos: ${fileName} (${timestamp.toLocaleDateString()})`;
    historyBanner.classList.remove('hidden');
    document.body.classList.add('history-view');
}

function hideHistoryBanner() {
    historyBanner.classList.add('hidden');
    document.body.classList.remove('history-view');
    appState.isViewingHistory = false;
}

function returnToLiveView() {
    hideHistoryBanner();
    escutarMudancasEmTempoReal(); // Re-sync with live data
    showToast(translate('toast_returned_to_live'), 'success');
}

// --- PAID DEMURRAGE TAB ---
function renderPaidDemurrageTable() {
    const container = document.getElementById('paid-demurrage-table-container')!;
    const returnedWithCost = appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Cost'] > 0);

    // Update summary cards
    const totalCost = returnedWithCost.reduce((acc, d) => acc + d['Demurrage Cost'], 0);
    const paidCost = returnedWithCost.filter(d => appState.paidStatuses[d.Container]).reduce((acc, d) => acc + d['Demurrage Cost'], 0);
    document.getElementById('summary-total-cost')!.textContent = formatCurrency(totalCost);
    document.getElementById('summary-paid-cost')!.textContent = formatCurrency(paidCost);
    document.getElementById('summary-unpaid-cost')!.textContent = formatCurrency(totalCost - paidCost);

    if (returnedWithCost.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-500 dark:text-slate-400 py-8">Nenhum container devolvido com demurrage para exibir.</p>';
        return;
    }

    const tableRows = returnedWithCost.map(d => {
        const isPaid = appState.paidStatuses[d.Container];
        return `
            <tr class="${isPaid ? 'paid' : ''}">
                <td>${d.Container}</td>
                <td>${d.PO}</td>
                <td>${d.Vessel}</td>
                <td>${formatDate(d['Return Date'])}</td>
                <td>${d['Demurrage Days']}</td>
                <td class="font-bold text-red-600">${formatCurrency(d['Demurrage Cost'])}</td>
                <td>
                    <div class="flex items-center">
                        <input type="checkbox" id="paid-${d.Container}" class="toggle-checkbox hidden" data-container-id="${d.Container}" ${isPaid ? 'checked' : ''}>
                        <label for="paid-${d.Container}" class="toggle-label relative inline-block bg-gray-300 dark:bg-gray-600 rounded-full cursor-pointer transition-colors duration-200 ease-in-out after:content-[''] after:absolute after:bg-white after:rounded-full after:transition-transform after:duration-200 after:ease-in-out"></label>
                    </div>
                </td>
            </tr>
        `;
    }).join('');

    container.innerHTML = `
        <table class="data-table">
            <thead>
                <tr>
                    <th>${translate('table_header_container')}</th>
                    <th>${translate('table_header_po')}</th>
                    <th>${translate('table_header_vessel')}</th>
                    <th>${translate('table_header_return_date')}</th>
                    <th>${translate('table_header_demurrage_days')}</th>
                    <th>${translate('table_header_cost')}</th>
                    <th>${translate('table_header_paid')}</th>
                </tr>
            </thead>
            <tbody>${tableRows}</tbody>
        </table>`;
    
    container.querySelectorAll('.toggle-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const containerId = target.dataset.containerId!;
            appState.paidStatuses[containerId] = target.checked;
            salvarDados(); // << INTEGRATION: Saves new payment status to Firebase
            renderPaidDemurrageTable(); // Re-render to update summary and styles
        });
    });
}

// --- ANALYTICS/CHARTS ---
function destroyCharts() {
    Object.values(appState.charts).forEach(chart => chart.destroy());
    appState.charts = {};
}

function createOrUpdateCharts() {
    destroyCharts();

    const analyticsContent = document.getElementById('analytics-content')!;
    const analyticsPlaceholder = document.getElementById('analytics-placeholder')!;
    const isDark = document.documentElement.classList.contains('dark');

    if(appState.filteredData.length === 0) {
        analyticsContent.classList.add('hidden');
        analyticsPlaceholder.classList.remove('hidden');
        return;
    }
    analyticsContent.classList.remove('hidden');
    analyticsPlaceholder.classList.add('hidden');
    
    // Register the datalabels plugin globally for all charts
    Chart.register(ChartDataLabels);

    // Plugin to display text when a chart has no data to show
    const noDataPlugin = {
      id: 'noData',
      afterDraw: (chart: any) => {
        if (chart.data.datasets.every((ds: any) => ds.data.length === 0 || ds.data.every((val: any) => val === 0))) {
          const { ctx, chartArea: { left, top, right, bottom } } = chart;
          ctx.save();
          ctx.textAlign = 'center';
          ctx.textBaseline = 'middle';
          ctx.font = 'bold 16px Inter';
          ctx.fillStyle = isDark ? '#64748b' : '#9ca3af'; // slate-500 or gray-400
          ctx.fillText(translate('chart_no_data'), (left + right) / 2, (top + bottom) / 2);
          ctx.restore();
        }
      }
    };

    const tooltipConfig = {
        enabled: true,
        backgroundColor: isDark ? '#334155' : '#1e293b',
        titleColor: isDark ? '#e2e8f0' : '#ffffff',
        bodyColor: isDark ? '#cbd5e1' : '#f1f5f9',
        boxPadding: 8,
        padding: 12,
        cornerRadius: 8,
        titleFont: { weight: 'bold', size: 14 },
        bodyFont: { size: 12 },
    };

    const chartOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { 
                labels: { color: isDark ? '#cbd5e1' : '#475569' } 
            },
            datalabels: {
                color: isDark ? '#e2e8f0' : '#334155',
                font: {
                    weight: 'bold',
                }
            },
            tooltip: tooltipConfig
        },
        scales: {
            x: { 
                ticks: { color: isDark ? '#94a3b8' : '#64748b' },
                grid: { color: isDark ? '#334155' : '#e2e8f0' }
            },
            y: { 
                ticks: { color: isDark ? '#94a3b8' : '#64748b' },
                grid: { color: isDark ? '#334155' : '#e2e8f0' }
            }
        }
    };
    
    // --- DATA SUBSETS (SINGLE SOURCE OF TRUTH) ---
    const dataForCharts = appState.filteredData.filter(d => !d.hasDateError);
    const returnedOnTime = dataForCharts.filter(d => d['Return Date'] && (d['Demurrage Days'] || 0) === 0);
    const returnedLate = dataForCharts.filter(d => d['Return Date'] && (d['Demurrage Days'] || 0) > 0);
    const activeLate = dataForCharts.filter(d => !d['Return Date'] && (d['Demurrage Days'] || 0) > 0);
    const activeOnTime = dataForCharts.filter(d => !d['Return Date'] && (d['Demurrage Days'] || 0) === 0);

    // Cost Analysis Chart
    const actualCost = returnedLate.reduce((sum, d) => sum + (d['Demurrage Cost'] || 0), 0);
    const incurringCost = activeLate.reduce((sum, d) => sum + (d['Demurrage Cost'] || 0), 0);
    
    appState.charts.costAnalysis = new window.Chart(document.getElementById('costAnalysisChart')!.getContext('2d'), {
        type: 'bar',
        data: {
            labels: [
                translate('chart_label_actual_cost_returned'), 
                translate('chart_label_incurred_cost_active')
            ],
            datasets: [{
                data: [actualCost, incurringCost],
                backgroundColor: ['#ef4444', '#f97316'],
                barPercentage: 0.5,
            }]
        },
        options: { 
            ...chartOptions, 
            plugins: { 
                ...chartOptions.plugins, 
                legend: { display: false },
                datalabels: {
                     ...chartOptions.plugins.datalabels,
                    anchor: 'end',
                    align: 'top',
                    formatter: (value) => (value > 0 ? formatCurrency(value) : null),
                },
                tooltip: {
                    ...tooltipConfig,
                    callbacks: {
                         title: (tooltipItems) => tooltipItems[0].label,
                         label: (tooltipItem) => `${translate('tooltip_cost')}: ${formatCurrency(tooltipItem.raw as number || 0)}`
                    }
                }
            } 
        }
    });
    document.getElementById('cost-summary-text')!.textContent = translate('cost_summary_text', actualCost, incurringCost);

    // Operational Performance Chart
    const performanceData = [
        returnedOnTime.length, 
        returnedLate.length, 
        activeLate.length, 
        activeOnTime.length
    ];
    const totalContainersForChart = performanceData.reduce((a, b) => a + b, 0);

    appState.charts.operationalPerformance = new window.Chart(document.getElementById('operationalPerformanceChart')!.getContext('2d'), {
        type: 'doughnut',
        data: {
            labels: [
                translate('chart_label_returned_on_time'),
                translate('chart_label_returned_late'),
                translate('chart_label_active_with_demurrage'),
                translate('chart_label_active_in_free_period'),
            ],
            datasets: [{
                data: performanceData,
                backgroundColor: ['#22c55e', '#f97316', '#ef4444', '#3b82f6'],
                borderColor: isDark ? '#1e293b' : '#ffffff',
                borderWidth: 4,
            }]
        },
        options: { 
            responsive: true,
            maintainAspectRatio: false,
            cutout: '70%',
            plugins: { 
                legend: { 
                    position: 'bottom',
                    labels: { 
                        color: isDark ? '#cbd5e1' : '#475569',
                        boxWidth: 12,
                        padding: 20
                    } 
                },
                datalabels: {
                    formatter: (value, ctx) => {
                        if (!value || value === 0) return null;
                        const total = ctx.chart.data.datasets[0].data.reduce((a, b) => (a || 0) + (b || 0), 0);
                        const percentage = (value / total) * 100;
                        return percentage > 5 ? value : null;
                    },
                    color: '#fff',
                    font: {
                        weight: 'bold',
                        size: 14
                    }
                },
                tooltip: {
                    ...tooltipConfig,
                    callbacks: {
                        title: (tooltipItems) => tooltipItems[0].label,
                        label: (tooltipItem) => {
                            const value = (tooltipItem.raw as number) || 0;
                            const percentage = totalContainersForChart > 0 ? (value * 100 / totalContainersForChart).toFixed(1) + '%' : '0.0%';
                            return `${value} ${translate('tooltip_containers')} (${percentage})`;
                        }
                    }
                }
            }
        }
    });
    const returnedOnTimePercentage = totalContainersForChart > 0 ? (returnedOnTime.length * 100 / totalContainersForChart).toFixed(1) : '0.0';
    document.getElementById('performance-summary-text')!.textContent = translate('performance_donut_summary_text', returnedOnTimePercentage);


    // Demurrage by Shipowner Chart
    const allLateContainers = [...returnedLate, ...activeLate];
    const costAndCountByShipowner = allLateContainers.reduce((acc, d) => {
        const cost = d['Demurrage Cost'] || 0;
        const shipowner = d.Shipowner;
        if (cost > 0) {
            if (!acc[shipowner]) {
                acc[shipowner] = { totalCost: 0, count: 0 };
            }
            acc[shipowner].totalCost += cost;
            acc[shipowner].count += 1;
        }
        return acc;
    }, {});
    
    const sortedShipownersData = Object.entries(costAndCountByShipowner)
        .map(([shipowner, data]) => ({ shipowner, ...data }))
        .sort((a, b) => b.totalCost - a.totalCost)
        .slice(0, 10);
    
    appState.charts.demurrageByShipowner = new window.Chart(document.getElementById('demurrageByShipownerChart')!.getContext('2d'), {
        type: 'bar',
        plugins: [noDataPlugin],
        data: {
            labels: sortedShipownersData.map(s => s.shipowner),
            datasets: [{
                label: 'Custo de Demurrage',
                data: sortedShipownersData.map(s => s.totalCost),
                backgroundColor: '#3b82f6',
            }]
        },
        options: { ...chartOptions, plugins: { ...chartOptions.plugins, legend: { display: false }, datalabels: { 
            ...chartOptions.plugins.datalabels,
            anchor: 'end', 
            align: 'top', 
            formatter: (value) => {
                if (!value || value === 0) return null;
                return new Intl.NumberFormat('en-US', {
                    style: 'currency',
                    currency: 'USD',
                    notation: 'compact',
                    compactDisplay: 'short',
                    maximumFractionDigits: 1
                }).format(value);
            }
        },
            tooltip: {
                ...tooltipConfig,
                callbacks: {
                    title: (tooltipItems) => tooltipItems[0].label,
                    label: (tooltipItem) => `${translate('tooltip_cost')}: ${formatCurrency(tooltipItem.raw as number || 0)}`,
                    afterLabel: (tooltipItem) => {
                       const shipowner = tooltipItem.label;
                       const originalData = sortedShipownersData.find(d => d.shipowner === shipowner);
                       return originalData ? `${translate('tooltip_from')} ${originalData.count} ${translate('tooltip_containers')}` : '';
                    }
                }
            }
         } }
    });

    // Average Demurrage Days by Shipowner Chart
    const daysByShipowner = allLateContainers.reduce((acc, d) => {
        const days = d['Demurrage Days'] || 0;
        if (days > 0) {
            if (!acc[d.Shipowner]) {
                acc[d.Shipowner] = { totalDays: 0, count: 0 };
            }
            acc[d.Shipowner].totalDays += days;
            acc[d.Shipowner].count += 1;
        }
        return acc;
    }, {});

    const avgDaysData = Object.entries(daysByShipowner).map(([shipowner, data]) => ({
        shipowner,
        avgDays: data.totalDays / data.count,
        count: data.count
    })).sort((a, b) => b.avgDays - a.avgDays).slice(0, 10);

    appState.charts.avgDaysByShipowner = new window.Chart(document.getElementById('avgDaysByShipownerChart')!.getContext('2d'), {
        type: 'bar',
        plugins: [noDataPlugin],
        data: {
            labels: avgDaysData.map(d => d.shipowner),
            datasets: [{
                label: 'Dias médios de demurrage',
                data: avgDaysData.map(d => d.avgDays),
                backgroundColor: '#8b5cf6',
            }]
        },
        options: { ...chartOptions, indexAxis: 'y', plugins: { ...chartOptions.plugins, legend: { display: false }, datalabels: {
            ...chartOptions.plugins.datalabels,
            anchor: 'end', 
            align: 'end', 
            formatter: (value) => value > 0 ? `${value.toFixed(1)} ${translate('chart_label_days_suffix')}` : null 
        },
            tooltip: {
                ...tooltipConfig,
                callbacks: {
                    title: (tooltipItems) => tooltipItems[0].label,
                    label: (tooltipItem) => {
                        const avgDays = ((tooltipItem.raw as number) || 0).toFixed(1);
                        return `${translate('chart_tooltip_avg_days')}: ${avgDays}`;
                    },
                    afterLabel: (tooltipItem) => {
                       const shipowner = tooltipItem.label;
                       const originalData = avgDaysData.find(d => d.shipowner === shipowner);
                       return originalData ? `${translate('tooltip_from')} ${originalData.count} ${translate('tooltip_containers')}` : '';
                    }
                }
            }
         } }
    });
}


// --- PERSISTENCE ---
function savePrefsToLocalStorage() {
    if (appState.isViewingHistory) return;
    const prefsToSave = {
        currentLanguage: appState.currentLanguage
    };
    localStorage.setItem('demurrageUserPrefs', JSON.stringify(prefsToSave));
}

function loadPrefsFromLocalStorage() {
    const savedPrefs = localStorage.getItem('demurrageUserPrefs');
    if (savedPrefs) {
        const parsedPrefs = JSON.parse(savedPrefs);
        appState.currentLanguage = parsedPrefs.currentLanguage || 'pt';
    }
}


function clearData() {
    if (confirm('Tem certeza de que deseja limpar todos os dados do dashboard? Esta ação não pode ser desfeita.')) {
        localStorage.removeItem('demurrageHistory'); // Clear local history
        
        // Clear the document in Firebase
        db.collection("demurrage_dashboard").doc("estado_atual").delete().then(() => {
            showToast(translate('toast_clear_data'), 'info');
            // The onSnapshot listener will automatically handle the UI update
        }).catch((error) => {
            console.error("Error removing document: ", error);
        });
    }
}


// --- AI INSIGHTS & REPORTS ---
function simpleMarkdownToHtml(text) {
    return text
        .replace(/^### (.*$)/gim, '<h3 class="text-lg font-semibold mt-3 mb-1">$1</h3>')
        .replace(/^## (.*$)/gim, '<h2 class="text-xl font-bold mt-4 mb-2">$1</h2>')
        .replace(/^\* (.*$)/gim, '<li class="ml-4">$1</li>')
        .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
        .replace(/\n/g, '<br>')
        .replace(/<br><li/g, '<li') // Fix extra breaks before list items
        .replace(/<\/li><br>/g, '</li>'); // Fix extra breaks after list items
}

async function getAiInsights() {
    const modalBody = document.getElementById('ai-modal-body')!;
    modalBody.innerHTML = `<div class="flex items-center justify-center"><i class="fas fa-spinner fa-spin text-2xl text-purple-500"></i><p class="ml-2">Gerando insights...</p></div>`;
    openModal('ai-modal');
    
    try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

        const allLateContainers = appState.filteredData.filter(d => d['Demurrage Cost'] > 0);
        
        const costByShipowner = allLateContainers.reduce((acc, d) => {
            acc[d.Shipowner] = (acc[d.Shipowner] || 0) + d['Demurrage Cost'];
            return acc;
        }, {});
        
        const daysByShipowner = allLateContainers.reduce((acc, d) => {
            if (!acc[d.Shipowner]) {
                acc[d.Shipowner] = { totalDays: 0, count: 0 };
            }
            acc[d.Shipowner].totalDays += d['Demurrage Days'];
            acc[d.Shipowner].count += 1;
            return acc;
        }, {});

        const avgDaysData = Object.entries(daysByShipowner).map(([shipowner, data]) => ({
            shipowner,
            avgDays: data.totalDays / data.count
        })).sort((a, b) => b.avgDays - a.avgDays);
        
        const topProblemContainers = [...allLateContainers]
            .sort((a, b) => b['Demurrage Cost'] - a['Demurrage Cost'])
            .slice(0, 3)
            .map(c => ({
                containerId: c.Container,
                shipowner: c.Shipowner,
                cost: formatCurrency(c['Demurrage Cost']),
                days: c['Demurrage Days']
            }));

        const today = new Date();
        const todayUTC = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));

        const dataSummary = {
            totalContainers: appState.filteredData.length,
            totalDemurrageCost: appState.filteredData.reduce((sum, d) => sum + d['Demurrage Cost'], 0),
            containerStatusBreakdown: {
                activeLate: appState.filteredData.filter(d => !d['Return Date'] && d['Demurrage Days'] > 0).length,
                returnedLate: appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Days'] > 0).length,
                atRiskNext15Days: appState.filteredData.filter(d => !d['Return Date'] && d['End of Free Time'].getTime() - todayUTC.getTime() > 0 && d['End of Free Time'].getTime() - todayUTC.getTime() <= 15 * 24 * 60 * 60 * 1000).length,
                returnedOnTime: appState.filteredData.filter(d => d['Return Date'] && d['Demurrage Days'] === 0).length,
            },
            shipownersByCost: Object.entries(costByShipowner).sort((a,b) => b[1] - a[1]).slice(0, 5).map(e => ({ shipowner: e[0], cost: formatCurrency(e[1]) })),
            shipownersByAvgDays: avgDaysData.slice(0, 5).map(d => ({ shipowner: d.shipowner, avgDays: d.avgDays.toFixed(1) })),
            topProblemContainers: topProblemContainers
        };
        
        const prompt = `
            As an expert logistics and supply chain analyst, analyze the following demurrage data summary for a logistics manager.
            Your analysis must be in markdown format and follow this structure precisely:
            
            ## Executive Summary
            A brief, high-level overview of the current operational and financial situation regarding demurrage.
            
            ## Performance Deep Dive
            Analyze the provided data points, identifying key trends, outliers, and areas of concern. Explicitly reference shipowner performance by comparing their total costs vs. their average delay days to distinguish between systemic issues and one-off problems.
            
            ## Actionable Recommendations
            Provide 3-5 specific, concrete, data-driven recommendations.
            - Start by suggesting targeted strategies for the specific 'Top 3 Problematic Containers' listed in the data.
            - Then, provide broader recommendations based on the shipowner performance analysis to address systemic issues.

            Here is the data summary:
            - Total Containers Analyzed: ${dataSummary.totalContainers}
            - Total Demurrage Cost (Active & Returned): ${formatCurrency(dataSummary.totalDemurrageCost)}
            - Container Status Breakdown: ${JSON.stringify(dataSummary.containerStatusBreakdown)}
            - Top 5 Shipowners by Total Demurrage Cost: ${JSON.stringify(dataSummary.shipownersByCost)}
            - Top 5 Shipowners by Average Demurrage Days: ${JSON.stringify(dataSummary.shipownersByAvgDays)}
            - Top 3 Problematic Containers (by cost): ${JSON.stringify(dataSummary.topProblemContainers)}
        `;

        const model = ai.getGenerativeModel({ model: "gemini-pro"});
        const result = await model.generateContent(prompt);
        const response = await result.response;
        
        modalBody.innerHTML = simpleMarkdownToHtml(response.text());

    } catch (error) {
        console.error("AI Insights Error:", error);
        modalBody.innerHTML = `<p class="text-red-500">Ocorreu um erro ao gerar os insights. Verifique a chave da API e tente novamente.</p>`;
    }
}

async function generateDemurrageJustification(container: ContainerData) {
    const reportArea = document.getElementById('justification-report-area')!;
    reportArea.innerHTML = `<div class="flex items-center justify-center p-4">
        <i class="fas fa-spinner fa-spin text-xl text-purple-500"></i>
        <p class="ml-3" data-translate-key="generating_report">${translate('generating_report')}</p>
    </div>`;

    try {
        const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

        const prompt = `
            As a senior logistics coordinator, I need to write a formal justification report for a demurrage charge to get payment approval. Based on the data for the container below, please generate a plausible and professional report.

            The report should:
            1.  Be structured with a clear subject line (e.g., "Subject: Justification for Demurrage Charges - Container [Container Number]").
            2.  Briefly summarize the key details of the shipment.
            3.  Provide a list of likely contributing factors for the delay. Infer these from common logistics scenarios. Do NOT state them as facts, but as high-probability causes (e.g., "customs clearance delays," "port congestion," "trucking/drayage availability issues," "warehouse receiving delays").
            4.  Conclude with a formal statement requesting approval for the payment of the demurrage cost.
            5.  The tone must be professional, formal, and concise.

            Container Data:
            - Container ID: ${container.Container}
            - Purchase Order (PO): ${container.PO}
            - Vessel: ${container.Vessel}
            - Shipowner: ${container.Shipowner}
            - Discharge Date: ${formatDate(container['Discharge Date'])}
            - End of Free Time: ${formatDate(container['End of Free Time'])}
            - Actual Return Date: ${formatDate(container['Return Date'])}
            - Demurrage Days: ${container['Demurrage Days']}
            - Total Demurrage Cost: ${formatCurrency(container['Demurrage Cost'])}
            - Final Status: ${container['Final Status']}
            - Cargo Type: ${container['Cargo Type']}

            Generate only the report text in markdown format.
        `;
        
        const model = ai.getGenerativeModel({ model: "gemini-pro"});
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const reportHtml = simpleMarkdownToHtml(response.text());

        reportArea.innerHTML = `
            <div class="relative">
                <h4 class="text-md font-bold mb-2 text-gray-800 dark:text-slate-100" data-translate-key="report_title">${translate('report_title')}</h4>
                <button id="copy-report-btn" title="${translate('copy_btn')}" class="absolute top-0 right-0 bg-slate-200 dark:bg-slate-600 hover:bg-slate-300 dark:hover:bg-slate-500 text-slate-600 dark:text-slate-200 text-xs font-semibold py-1 px-2 rounded">
                    <i class="fas fa-copy mr-1"></i> ${translate('copy_btn')}
                </button>
                <div id="report-content" class="text-sm text-gray-700 dark:text-slate-300 space-y-2 mt-2 bg-slate-50 dark:bg-slate-900/50 p-4 rounded-md border dark:border-slate-700">${reportHtml}</div>
            </div>
        `;

        document.getElementById('copy-report-btn')!.addEventListener('click', () => {
            const reportText = document.getElementById('report-content')!.innerText;
            navigator.clipboard.writeText(reportText);
            showToast(translate('toast_report_copied'), 'success');
        });

    } catch (error) {
        console.error("Justification Report Error:", error);
        reportArea.innerHTML = `<p class="text-red-500" data-translate-key="error_generating_report">${translate('error_generating_report')}</p>`;
    }
}


// --- THEME & TRANSLATION ---
function toggleTheme() {
    const isDark = document.documentElement.classList.toggle('dark');
    localStorage.setItem('theme', isDark ? 'dark' : 'light');
    themeToggleIcon.className = `fas fa-${isDark ? 'sun' : 'moon'}`;
    // Re-render charts for new theme colors
    if (appState.allData.length > 0) createOrUpdateCharts();
}

function translate(key: string, ...args: any[]): string {
    const textOrFn = translations[appState.currentLanguage][key] || translations.pt[key];
     if (typeof textOrFn === 'function') {
        return textOrFn(...args);
    }
    return textOrFn || key;
}

function translateApp() {
    document.querySelectorAll('[data-translate-key]').forEach(el => {
        const key = el.getAttribute('data-translate-key')!;
        if(el.hasAttribute('placeholder')) {
            el.setAttribute('placeholder', translate(key));
        } else {
            el.innerHTML = translate(key);
        }
    });

     // Special cases
    const nextLang = appState.currentLanguage === 'pt' ? 'en' : appState.currentLanguage === 'en' ? 'zh' : 'pt';
    translateBtnText.textContent = nextLang.toUpperCase();
    if(nextLang === 'zh') translateBtnText.textContent = '中文';
}

function cycleLanguage() {
    appState.currentLanguage = appState.currentLanguage === 'pt' ? 'en' : appState.currentLanguage === 'en' ? 'zh' : 'pt';
    savePrefsToLocalStorage();
    translateApp();
    if (appState.allData.length > 0) {
      renderPaidDemurrageTable(); // Re-render table with new headers
      createOrUpdateCharts(); // Re-render charts with new labels
    }
}

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
        // Re-apply filters first, then search within the filtered results
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
    
    // Inicia a "conversa" com o Firebase
    escutarMudancasEmTempoReal(); // << 4. INTEGRAÇÃO: Começa a ouvir por atualizações
}

// --- RUN APP ---
document.addEventListener('DOMContentLoaded', init);

