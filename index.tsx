// @ts-nocheck
// Since we are using browser globals, we can disable TypeScript checks for them.
declare const XLSX: any;
declare const Chart: any;
declare const jspdf: any;
declare const html2canvas: any;
declare const ChartDataLabels: any;
declare const firebase: any; // << 1. DECLARAÇÃO DO FIREBASE ADICIONADA AQUI

import { GoogleGenAI } from "@google/genai";

// --- TYPE DEFINITIONS ---
// ... (Nenhuma mudança aqui)

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

// --- FIREBASE INITIALIZATION & SETUP --- << 2. BLOCO DE INICIALIZAÇÃO DO FIREBASE
const firebaseConfig = {
    apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
    authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
    projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
    storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
    messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
    appId: import.meta.env.VITE_FIREBASE_APP_ID,
};

// Initialize Firebase
if (!firebase.apps.length) {
    firebase.initializeApp(firebaseConfig);
}

const db = firebase.firestore();
let isUpdatingFromFirestore = false; // Flag to prevent update loops

// --- FIREBASE FUNCTIONS --- << 3. FUNÇÕES DE "CONVERSA" COM O FIREBASE

/**
 * Saves the entire application state to a single document in Firestore.
 */
async function salvarDados() {
    if (isUpdatingFromFirestore) return; // Don't save if the update came from Firestore

    console.log("Salvando dados no Firebase...");
    try {
        const estadoParaSalvar = {
            allData: appState.allData,
            demurrageRates: appState.demurrageRates,
            paidStatuses: appState.paidStatuses,
            lastUpdate: lastUpdateEl.innerHTML,
            // Convert dates to ISO strings for Firestore compatibility
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
                appState.allData = data.allData.map(d => ({
                    ...d,
                    'Discharge Date': d['Discharge Date'] ? new Date(d['Discharge Date']) : null,
                    'End of Free Time': new Date(d['End of Free Time']),
                    'Return Date': d['Return Date'] ? new Date(d['Return Date']) : undefined,
                }));

                appState.filteredData = appState.allData;
                appState.demurrageRates = data.demurrageRates || { default: 100 };
                appState.paidStatuses = data.paidStatuses || {};
                lastUpdateEl.innerHTML = data.lastUpdate;

                renderDashboard();
                showToast("Dados sincronizados em tempo real.", 'success');
                
                // Unset flag after a short delay to allow UI to render
                setTimeout(() => { isUpdatingFromFirestore = false; }, 500); 
            } else {
                console.log("Nenhum dado no Firebase. Aguardando primeiro upload.");
            }
        }, (error) => {
            console.error("Erro ao escutar mudanças: ", error);
        });
}

// ... (const translations, const DOM Elements, e Utility Functions permanecem iguais)
// ...

const handleFileUpload = (event: Event) => {
    loadingOverlay.classList.remove('hidden');
    // ... (início da função permanece igual)

    reader.onload = (e: ProgressEvent<FileReader>) => {
        try {
            // ... (toda a lógica de processamento do XLSX permanece igual)

            appState.allData = processData(mappedData);
            
            if (appState.allData.length === 0) {
                showToast(translate('toast_no_data'), 'error');
                return;
            }
            
            appState.filteredData = appState.allData;
            appState.paidStatuses = {}; // Reset paid statuses on new upload
            
            // saveStateToLocalStorage(); // << Substituído pelo Firebase
            updateLastUpdate(file.name);
            renderDashboard();
            salvarDados(); // << 4. INTEGRAÇÃO: Salva os novos dados no Firebase
            
            showToast(translate('toast_data_loaded'), 'success');
        } catch (error) {
            // ... (bloco catch permanece igual)
        } finally {
            // ... (bloco finally permanece igual)
        }
    };
    reader.readAsBinaryString(file);
};

// ... (Render Functions, Filter Logic, Modal Functions, etc. permanecem iguais)
// ...

function saveRates() {
    // ... (lógica para atualizar as taxas permanece igual)
    
    appState.demurrageRates = newRates;

    // Efficiently recalculate cost without reprocessing all data from scratch
    appState.allData.forEach(container => {
        const shipowner = container.Shipowner.toUpperCase();
        const rate = appState.demurrageRates[shipowner] || appState.demurrageRates.default;
        container['Demurrage Cost'] = container['Demurrage Days'] * rate;
    });

    // saveStateToLocalStorage(); // << Substituído pelo Firebase
    salvarDados(); // << 4. INTEGRAÇÃO: Salva as novas taxas no Firebase

    showToast(translate('toast_settings_saved'), 'success');
    
    applyFilters();
    
    closeModal('rates-modal');
}

// ... (History Management permanece igual)
// ...

function renderPaidDemurrageTable() {
    // ... (início da função e cálculo dos resumos permanecem iguais)
    
    // ... (criação das linhas da tabela permanece igual)

    container.innerHTML = `...`; // (o innerHTML da tabela permanece igual)
    
    container.querySelectorAll('.toggle-checkbox').forEach(checkbox => {
        checkbox.addEventListener('change', (e) => {
            const target = e.target as HTMLInputElement;
            const containerId = target.dataset.containerId!;
            appState.paidStatuses[containerId] = target.checked;
            
            // saveStateToLocalStorage(); // << Apenas salva preferências agora
            salvarDados(); // << 4. INTEGRAÇÃO: Salva o novo status de pagamento

            renderPaidDemurrageTable(); // Re-render to update summary and styles
        });
    });
}

// ... (Analytics/Charts permanece igual)
// ...

// --- PERSISTENCE ---
function saveStateToLocalStorage() {
    // AGORA SÓ SALVA PREFERÊNCIAS LOCAIS (TEMA E IDIOMA)
    if (appState.isViewingHistory) return;
    const stateToSave = {
        currentLanguage: appState.currentLanguage
        // Os dados principais não são mais salvos aqui
    };
    localStorage.setItem('demurrageUserPrefs', JSON.stringify(stateToSave));
}

function loadStateFromLocalStorage() {
    // AGORA SÓ CARREGA PREFERÊNCIAS LOCAIS
    const savedPrefs = localStorage.getItem('demurrageUserPrefs');
    if (savedPrefs) {
        const parsedPrefs = JSON.parse(savedPrefs);
        appState.currentLanguage = parsedPrefs.currentLanguage || 'pt';
    }
    // Os dados principais agora vêm do Firebase através do 'escutarMudancasEmTempoReal'
}

function clearData() {
    if (confirm('Tem certeza de que deseja limpar todos os dados e o histórico? Esta ação não pode ser desfeita.')) {
        localStorage.removeItem('demurrageAppState'); // Remove o estado antigo se existir
        localStorage.removeItem('demurrageUserPrefs');
        localStorage.removeItem('demurrageHistory');
        
        // Limpa o documento no Firebase
        db.collection("demurrage_dashboard").doc("estado_atual").delete().then(() => {
            showToast(translate('toast_clear_data'), 'info');
            // Recarrega a página para um estado limpo
            location.reload();
        }).catch((error) => {
            console.error("Error removing document: ", error);
        });
    }
}

// ... (AI Insights & Reports, Theme & Translation permanecem iguais)
// ...

// --- INITIALIZATION ---
function init() {
    // ... (Todos os Event Listeners permanecem iguais)

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
    loadStateFromLocalStorage(); // Carrega apenas tema/idioma
    translateApp();
    
    // Inicia a "conversa" com o Firebase
    escutarMudancasEmTempoReal(); // << 4. INTEGRAÇÃO: Começa a ouvir por atualizações
}

// --- RUN APP ---
document.addEventListener('DOMContentLoaded', init);
