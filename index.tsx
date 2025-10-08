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
 * Saves the raw spreadsheet data to Firestore.
 */
async function salvarDados(dataToSave: any[], fileName: string) {
    if (isUpdatingFromFirestore) return;

    console.log("Enviando dados da planilha para o Firebase...");
    try {
        await db.collection("demurrage_dashboard").doc("dados_planilha").set({
            dados: dataToSave,
            nomeArquivo: fileName,
            ultimaAtualizacao: new Date()
        });
        showToast("Planilha enviada com sucesso! Sincronizando...", "success");
    } catch (error) {
        console.error("Erro ao salvar dados no Firebase: ", error);
        showToast("Falha ao enviar planilha para o servidor.", "error");
    }
}

/**
 * Listens for real-time changes in the spreadsheet data and updates the app.
 */
function escutarMudancasEmTempoReal() {
    console.log("Iniciando ouvinte de dados do Firebase...");
    db.collection("demurrage_dashboard").doc("dados_planilha")
        .onSnapshot((doc) => {
            isUpdatingFromFirestore = true;
            
            if (doc.exists) {
                console.log("Dados da planilha recebidos do Firebase...");
                const data = doc.data();
                if (data && data.dados) {
                    
                    // Processa os dados brutos para a estrutura do app
                    const processedData = processData(data.dados);
                    
                    // Salva o estado anterior para o histórico antes de atualizar
                    if (appState.allData.length > 0) {
                        saveHistorySnapshot(appState.lastFileName || 'versão anterior');
                    }

                    // Atualiza o estado principal da aplicação
                    appState.allData = processedData;
                    appState.filteredData = processedData;
                    appState.lastFileName = data.nomeArquivo;

                    // Carrega configurações locais (taxas, status de pago) que não são sincronizadas
                    loadStateFromLocalStorage(); 

                    const ultimaAtualizacao = data.ultimaAtualizacao?.toDate();
                    if (ultimaAtualizacao) {
                        updateLastUpdate(data.nomeArquivo, ultimaAtualizacao);
                    }
                    
                    renderDashboard();
                    showToast('Dados atualizados em tempo real!', 'success');
                }
            } else {
                console.log("Nenhum dado no Firebase. Aguardando upload.");
                appState.allData = [];
                appState.filteredData = [];
                renderDashboard();
            }
            
            setTimeout(() => { isUpdatingFromFirestore = false; }, 500);

        }, (error) => {
            console.error("Erro no ouvinte do Firebase: ", error);
            showToast("Conexão com o servidor perdida.", "error");
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
// ... (Declarações de DOM Elements permanecem as mesmas)

// --- UTILITY FUNCTIONS ---
// ... (Funções de utilidade como formatDate, formatCurrency, etc. permanecem as mesmas)

// --- DATA PROCESSING ---
// ... (A sua função processData original e robusta permanece a mesma)

// --- File Handling ---
async function handleFileUpload(event: Event) {
    loadingOverlay.classList.remove('hidden');
    const file = (event.target as HTMLInputElement).files?.[0];
    if (!file) {
        loadingOverlay.classList.add('hidden');
        return;
    }

    const reader = new FileReader();
    reader.onload = async (e: ProgressEvent<FileReader>) => {
        try {
            const data = e.target?.result;
            const workbook = XLSX.read(data, { type: 'binary' });
            const sheetName = workbook.SheetNames[0];
            const sheet = workbook.Sheets[sheetName];
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
            
            const headerMap: {[key: string]: string} = {};
            headers.forEach(header => {
                for (const mapKey in columnMapping) {
                    if (String(header).trim().toUpperCase() === mapKey.toUpperCase()) {
                        headerMap[header] = columnMapping[mapKey];
                    }
                }
            });

            const mappedData = rows.map(rowArray => {
                const newRow: { [key: string]: any } = {};
                headers.forEach((header, index) => {
                     const mappedKey = headerMap[header] || header.trim();
                     newRow[mappedKey] = rowArray[index];
                });
                return newRow;
            });
            
            // Apenas salva os dados brutos. O listener irá processar e renderizar.
            await salvarDados(mappedData, file.name);
            
        } catch (error) {
            console.error(error);
            showToast(`${translate('toast_error_processing')}: ${error.message}`, 'error');
        } finally {
            loadingOverlay.classList.add('hidden');
            (event.target as HTMLInputElement).value = ''; // Reset file input
        }
    };
    reader.readAsBinaryString(file);
}

// --- RENDER FUNCTIONS ---
// ... (Todas as funções de renderização, filtros, modais, etc., permanecem as mesmas)

// --- PERSISTENCE (agora local) ---
function saveStateToLocalStorage() {
    if (appState.isViewingHistory) return;
    const stateToSave = {
      demurrageRates: appState.demurrageRates,
      paidStatuses: appState.paidStatuses,
      currentLanguage: appState.currentLanguage
    };
    localStorage.setItem('demurrageAppState', JSON.stringify(stateToSave));
}

function loadStateFromLocalStorage() {
    const savedState = localStorage.getItem('demurrageAppState');
    if (savedState) {
        const parsedState = JSON.parse(savedState);
        appState.demurrageRates = parsedState.demurrageRates || { default: 100 };
        appState.paidStatuses = parsedState.paidStatuses || {};
        appState.currentLanguage = parsedState.currentLanguage || 'pt';
    }
}

// --- Funções que agora salvam localmente ---
function saveRates() {
    // ... (lógica para criar newRates)
    appState.demurrageRates = newRates;

    // Recalcula os custos com as novas taxas
    appState.allData.forEach(container => {
        const shipowner = container.Shipowner.toUpperCase();
        const rate = appState.demurrageRates[shipowner] || appState.demurrageRates.default;
        container['Demurrage Cost'] = container['Demurrage Days'] * rate;
    });

    saveStateToLocalStorage(); // Salva no localStorage
    showToast(translate('toast_settings_saved'), 'success');
    
    applyFilters(); // Re-renderiza a UI com os novos cálculos
    closeModal('rates-modal');
}

function renderPaidDemurrageTable() {
    // ... (toda a lógica de renderização da tabela)
    
    container.querySelectorAll('.toggle-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const containerId = target.dataset.containerId!;
            appState.paidStatuses[containerId] = target.checked;
            saveStateToLocalStorage(); // Salva no localStorage
            renderPaidDemurrageTable(); 
        });
    });
}


// --- INITIALIZATION ---
function init() {
    // ... (todos os event listeners)
    
    const savedTheme = localStorage.getItem('theme') || (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    if (savedTheme === 'dark') {
        document.documentElement.classList.add('dark');
        themeToggleIcon.className = 'fas fa-sun';
    } else {
        document.documentElement.classList.remove('dark');
        themeToggleIcon.className = 'fas fa-moon';
    }

    setupModals();
    setupFilterSearch();
    loadStateFromLocalStorage(); // Carrega configurações locais no início
    translateApp();
    
    escutarMudancasEmTempoReal(); // Inicia a escuta por dados da planilha
}

// --- RUN APP ---
document.addEventListener('DOMContentLoaded', init);
```

### O que fazer agora:

1.  **Substitua** todo o conteúdo do seu `index.tsx` pelo código acima.
2.  **Crie o arquivo `.env`**: Na raiz do seu projeto (mesma pasta do `index.html`), crie um arquivo chamado `.env` e cole suas chaves lá, com o prefixo `VITE_`, como no exemplo abaixo:

    ```
    VITE_FIREBASE_API_KEY="AIzaSy..."
    VITE_FIREBASE_AUTH_DOMAIN="..."
    VITE_FIREBASE_PROJECT_ID="..."
    VITE_FIREBASE_STORAGE_BUCKET="..."
    VITE_FIREBASE_MESSAGING_SENDER_ID="..."
    VITE_FIREBASE_APP_ID="..."
    VITE_GEMINI_API_KEY="AIzaSy..."
    

