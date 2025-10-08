// NOVO: Aviso para o TypeScript sobre a variável global do Firebase
declare const firebase: any;

/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

// --- Type definitions for CDN libraries to inform TypeScript ---
declare const XLSX: any;
declare const jspdf: any;

// NOVO: Bloco de configuração e inicialização do Firebase
const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID,
  appId: import.meta.env.VITE_FIREBASE_APP_ID
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();


// --- DOM Elements ---
const fileUpload = document.getElementById('file-upload') as HTMLInputElement;
const searchInput = document.getElementById('search-input') as HTMLInputElement;
const lastUpdate = document.getElementById('last-update') as HTMLParagraphElement;
const placeholder = document.getElementById('placeholder') as HTMLDivElement;
const summaryStats = document.getElementById('summary-stats') as HTMLDivElement;
const deliveryDashboard = document.getElementById('delivery-dashboard') as HTMLDivElement;
const deliveryTabs = document.getElementById('delivery-tabs') as HTMLDivElement;
const deliveryContent = document.getElementById('delivery-content') as HTMLDivElement;
const exportExcelBtn = document.getElementById('export-excel-btn') as HTMLButtonElement;
const exportPdfBtn = document.getElementById('export-pdf-btn') as HTMLButtonElement;
const themeToggleBtn = document.getElementById('theme-toggle') as HTMLButtonElement;
const htmlEl = document.documentElement;

// --- Logo Elements ---
const logoUpload = document.getElementById('logo-upload') as HTMLInputElement;
const logoContainer = document.getElementById('logo-container') as HTMLDivElement;
const companyLogo = document.getElementById('company-logo') as HTMLImageElement;


// --- Modal Elements ---
const modalContainer = document.getElementById('confirmation-modal-container') as HTMLDivElement;
const modalEl = document.getElementById('confirmation-modal') as HTMLDivElement;
const modalTitle = document.getElementById('modal-title') as HTMLHeadingElement;
const modalMessage = document.getElementById('modal-message') as HTMLParagraphElement;
const modalConfirmBtn = document.getElementById('modal-confirm-btn') as HTMLButtonElement;
const modalCancelBtn = document.getElementById('modal-cancel-btn') as HTMLButtonElement;

// --- Theme Management (Refactored) ---
const themeIcon = themeToggleBtn.querySelector('i');

function setTheme(theme: 'light' | 'dark'): void {
    if (!themeIcon) return;

    // 1. Update the <html> class to apply CSS
    htmlEl.classList.toggle('dark', theme === 'dark');

    // 2. Update the button icon to reflect the current state
    themeIcon.classList.toggle('fa-sun', theme === 'light');
    themeIcon.classList.toggle('fa-moon', theme === 'dark');
}

function toggleTheme(): void {
    const newTheme = htmlEl.classList.contains('dark') ? 'light' : 'dark';
    
    // 1. Save the new preference to local storage
    localStorage.setItem('theme', newTheme);
    
    // 2. Apply the new theme to the UI
    setTheme(newTheme);
}

themeToggleBtn.addEventListener('click', toggleTheme);


// --- Logo Management ---
function handleLogoUpload(event: Event): void {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    if (!file) return;

    if (file.size > 2 * 1024 * 1024) { // 2MB size limit
        showToast('O arquivo de imagem é muito grande (máx 2MB).', 'error');
        return;
    }

    const reader = new FileReader();
    reader.onload = (e) => {
        if (typeof e.target?.result !== 'string') {
            showToast('Não foi possível ler o arquivo de imagem.', 'error');
            return;
        }
        const dataUrl = e.target.result;
        localStorage.setItem('companyLogo', dataUrl);
        companyLogo.src = dataUrl;
        logoContainer.classList.remove('hidden');
        showToast('Logo da empresa atualizado!', 'success');
    };
    reader.onerror = () => {
        showToast('Erro ao carregar o logo.', 'error');
    };
    reader.readAsDataURL(file);
    logoUpload.value = ''; // Reset input
}

function loadLogoFromStorage(): void {
    const savedLogo = localStorage.getItem('companyLogo');
    if (savedLogo) {
        companyLogo.src = savedLogo;
        logoContainer.classList.remove('hidden');
    }
}

logoUpload.addEventListener('change', handleLogoUpload);

// --- Initialize on Page Load ---
document.addEventListener('DOMContentLoaded', () => {
    // Sync theme toggle icon
    const initialTheme = htmlEl.classList.contains('dark') ? 'dark' : 'light';
    setTheme(initialTheme);
    // Load company logo if it exists
    loadLogoFromStorage();
    // NOVO: Inicia o "ouvinte" de dados em tempo real do Firebase
    escutarMudancasEmTempoReal();
});


// --- Global State ---
let deliveryData: any[] = [];
let searchDebounceTimer: number;
let activeStatusFilter: string | null = null;
let isUpdatingFromFirebase = false; // NOVO: Flag para evitar loops de salvamento

// --- NOVO: Funções de Integração com o Firebase ---
async function salvarDados(listaDeEntregas: any[]) {
    // Se a atualização veio do firebase, não salva de novo para evitar um loop.
    if (isUpdatingFromFirebase) {
        console.log("Atualização do Firebase em andamento, salvamento ignorado para evitar loop.");
        return;
    }
    console.log("Tentando salvar dados no Firebase...");
    try {
      await db.collection("painel").doc("entregas_atuais").set({
        dados: listaDeEntregas,
        ultimaAtualizacao: new Date()
      });
      console.log("Dados salvos com sucesso no Firebase!");
    } catch (error) {
      console.error("Erro ao salvar dados no Firebase: ", error);
      showToast("Falha ao sincronizar dados com o servidor.", "error");
    }
}

function escutarMudancasEmTempoReal() {
    console.log("Iniciando ouvinte de dados do Firebase...");
    db.collection("painel").doc("entregas_atuais").onSnapshot(doc => {
        isUpdatingFromFirebase = true; // Ativa a flag para bloquear salvamentos desnecessários
        console.log("Dados recebidos do Firebase!");
        if (doc.exists) {
            const data = doc.data();
            if (data && data.dados) {
                deliveryData = data.dados; // ATUALIZA A VARIÁVEL GLOBAL
                const ultimaAtualizacao = data.ultimaAtualizacao?.toDate();

                // Mantém a aba ativa após a atualização em tempo real
                const activeTab = deliveryTabs.querySelector('.tab-btn.active') as HTMLButtonElement;
                const activeTabId = activeTab ? activeTab.dataset.target : null;

                applyFiltersAndRender(activeTabId);
                
                if (ultimaAtualizacao) {
                    lastUpdate.textContent = `Dados sincronizados | Última alteração em: ${ultimaAtualizacao.toLocaleString('pt-BR')}`;
                }
            }
        } else {
            console.log("Nenhum documento de entregas no Firebase. Aguardando upload.");
            resetUI();
        }
        // Libera a flag após um pequeno delay para garantir que a renderização termine
        setTimeout(() => { isUpdatingFromFirebase = false; }, 500);
    }, error => {
        console.error("Erro no ouvinte do Firebase: ", error);
        showToast("Conexão com o servidor perdida. Verifique sua internet.", "error");
    });
}


// --- Confirmation Modal ---
function showConfirmationDialog(title: string, message: string): Promise<boolean> {
    const previouslyFocusedElement = document.activeElement as HTMLElement;

    return new Promise(resolve => {
        modalTitle.textContent = title;
        modalMessage.textContent = message;

        modalContainer.classList.remove('hidden');
        setTimeout(() => modalContainer.classList.add('visible'), 10);
        
        const focusableElements = Array.from(modalEl.querySelectorAll<HTMLElement>('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])'));
        const firstFocusableElement = focusableElements[0];
        const lastFocusableElement = focusableElements[focusableElements.length - 1];

        modalConfirmBtn.focus();

        const trapFocus = (e: KeyboardEvent) => {
            if (e.key !== 'Tab') return;
            if (e.shiftKey) { // Shift + Tab
                if (document.activeElement === firstFocusableElement) {
                    e.preventDefault();
                    lastFocusableElement.focus();
                }
            } else { // Tab
                if (document.activeElement === lastFocusableElement) {
                    e.preventDefault();
                    firstFocusableElement.focus();
                }
            }
        };

        const handleConfirm = () => {
            closeModal();
            resolve(true);
        };
        const handleCancel = () => {
            closeModal();
            resolve(false);
        };
        
        const closeModal = () => {
            modalContainer.removeEventListener('keydown', trapFocus);
            modalContainer.classList.remove('visible');
            setTimeout(() => modalContainer.classList.add('hidden'), 200);
            modalConfirmBtn.removeEventListener('click', handleConfirm);
            modalCancelBtn.removeEventListener('click', handleCancel);
            previouslyFocusedElement?.focus();
        };

        modalContainer.addEventListener('keydown', trapFocus);
        modalConfirmBtn.addEventListener('click', handleConfirm, { once: true });
        modalCancelBtn.addEventListener('click', handleCancel, { once: true });
    });
}

// --- Toast Notifications ---
function showToast(message: string, type: 'success' | 'error' | 'warning' = 'success'): void {
    const toastContainer = document.getElementById('toast-container');
    if (!toastContainer) return;
    const toast = document.createElement('div');
    const icons = { success: 'fa-check-circle', error: 'fa-times-circle', warning: 'fa-exclamation-triangle' };
    const colors = { success: 'bg-green-500', error: 'bg-red-500', warning: 'bg-yellow-500' };
    toast.className = `toast ${colors[type]} text-white py-3 px-5 rounded-lg shadow-xl flex items-center mb-2`;
    toast.setAttribute('role', 'alert');
    toast.innerHTML = `<i class="fas ${icons[type]} mr-3" aria-hidden="true"></i> <p>${message}</p>`;
    toastContainer.appendChild(toast);
    setTimeout(() => toast.remove(), 5000);
}

// --- Data Filtering & Rendering ---
function applyFiltersAndRender(activeTabId: string | null = null) {
    const query = searchInput.value.trim().toLowerCase();
    let filteredData = deliveryData;

    // 1. Apply status filter
    if (activeStatusFilter) {
        if (activeStatusFilter === 'PENDENTE') {
            filteredData = filteredData.filter(row => {
                const status = (row['STATUS'] || '').toUpperCase();
                return status === '' || status === 'PENDENTE';
            });
        } else {
            filteredData = filteredData.filter(row => (row['STATUS'] || '').toUpperCase() === activeStatusFilter);
        }
    }

    // 2. Apply search query filter
    if (query) {
        filteredData = filteredData.filter(row => {
            return Object.values(row).some(value => 
                String(value).toLowerCase().includes(query)
            );
        });
    }

    renderDeliveryDashboard(filteredData, activeTabId);
    updateStats(); // Update stats to reflect visual changes on cards
}


// --- File Handling ---
fileUpload.addEventListener('change', (event) => {
    const target = event.target as HTMLInputElement;
    const file = target.files?.[0];
    const uploadLabel = document.querySelector('label[for="file-upload"]');
    if (!file || !uploadLabel) return;

    const labelSpan = uploadLabel.querySelector('span');
    uploadLabel.classList.add('opacity-50', 'cursor-not-allowed');
    if(labelSpan) labelSpan.textContent = 'Processando...';
    uploadLabel.querySelector('i')?.classList.add('fa-spin');


    const reader = new FileReader();
    reader.onload = async (e) => { // MODIFICADO: para async
        try {
            if (!e.target?.result) throw new Error("Falha ao ler o arquivo.");
            const workbook = XLSX.read(new Uint8Array(e.target.result as ArrayBuffer), { type: 'array' });
            const deliverySheetName = findDeliverySheet(workbook);
            
            const dataFromSheet = XLSX.utils.sheet_to_json(workbook.Sheets[deliverySheetName], { raw: false, defval: '' });
            if (dataFromSheet.length === 0) throw new Error("A planilha de agendamento está vazia.");
            
            // NOVO: Salva os novos dados no Firebase. O ouvinte em tempo real cuidará da atualização da tela.
            await salvarDados(dataFromSheet);

            showToast('Planilha enviada com sucesso! Atualizando para todos...', 'success');
            
            // Limpa filtros para a nova visualização
            searchInput.value = ''; 
            activeStatusFilter = null;
            
        } catch (err: any) {
            showToast(err.message || 'Erro ao processar arquivo.', 'error');
            resetUI();
        } finally {
            uploadLabel.classList.remove('opacity-50', 'cursor-not-allowed');
            if(labelSpan) labelSpan.textContent = 'Carregar';
            uploadLabel.querySelector('i')?.classList.remove('fa-spin');
            fileUpload.value = '';
        }
    };
    reader.readAsArrayBuffer(file);
});

function findDeliverySheet(workbook: any): string {
    const sheetName = workbook.SheetNames.find((name: string) => {
        const upperName = name.toUpperCase();
        const keywords = ['DELIVERY', 'SCHEDULE', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY', 'SUNDAY', 'SEGUNDA', 'TERÇA', 'QUARTA', 'QUINTA', 'SEXTA', 'SÁBADO', 'DOMINGO'];
        return keywords.some(key => upperName.includes(key));
    });
    if (!sheetName) throw new Error("Nenhuma planilha de agendamento de entregas foi encontrada.");
    return sheetName;
}

// --- UI Rendering ---
function excelDateToJSDate(serial: string | number): Date | null {
    if (!serial) return null;
    if (typeof serial === 'string' && (serial.includes('/') || serial.includes('-'))) {
        const parts = serial.split(/[/\-]/);
        if (parts.length === 3) {
             const d1 = parseInt(parts[0], 10), d2 = parseInt(parts[1], 10), d3 = parseInt(parts[2], 10);
             if (d2 > 12) return new Date(d3, d1 - 1, d2);
             return new Date(d3, d2 - 1, d1);
        }
        const date = new Date(serial); return isNaN(date.getTime()) ? null : date;
    }
    if (typeof serial !== 'number' || serial < 1) return null;
    const utc_days = Math.floor(serial - 25569);
    const date_info = new Date(utc_days * 86400 * 1000);
    return new Date(date_info.getTime() + (date_info.getTimezoneOffset() * 60 * 1000));
}

function getStatusDetails(status: string): { icon: string; color: string; pillBg: string; pillText: string; } {
    const upperStatus = (status || 'PENDENTE').toUpperCase();
    switch (upperStatus) {
        case 'ENTREGUE':
            return { icon: 'fa-check-circle', color: 'text-green-600 dark:text-green-400', pillBg: 'bg-green-100 dark:bg-green-900/50', pillText: 'text-green-700 dark:text-green-300' };
        case 'A CAMINHO':
            return { icon: 'fa-truck', color: 'text-yellow-600 dark:text-yellow-400', pillBg: 'bg-yellow-100 dark:bg-yellow-900/50', pillText: 'text-yellow-700 dark:text-yellow-300' };
        case 'ADIADO':
            return { icon: 'fa-calendar-alt', color: 'text-blue-600 dark:text-blue-400', pillBg: 'bg-blue-100 dark:bg-blue-900/50', pillText: 'text-blue-700 dark:text-blue-300' };
        case 'CANCELADO':
             return { icon: 'fa-times-circle', color: 'text-red-600 dark:text-red-400', pillBg: 'bg-red-100 dark:bg-red-900/50', pillText: 'text-red-700 dark:text-red-300' };
        case 'PENDENTE':
        default:
            return { icon: 'fa-hourglass-half', color: 'text-slate-500 dark:text-slate-400', pillBg: 'bg-slate-200 dark:bg-slate-700', pillText: 'text-slate-700 dark:text-slate-200' };
    }
}

function getStatusPill(status: string): string {
    const upperStatus = (status || 'PENDENTE').toUpperCase();
    const details = getStatusDetails(upperStatus);
    
    return `<span class="status-pill ${details.pillBg} ${details.pillText}">
                <i class="fas ${details.icon} fa-fw" aria-hidden="true"></i>
                <span>${upperStatus}</span>
            </span>`;
}


function updateStats() {
    const total = deliveryData.length;
    const delivered = deliveryData.filter(d => (d['STATUS'] || '').toUpperCase() === 'ENTREGUE').length;
    const inTransit = deliveryData.filter(d => (d['STATUS'] || '').toUpperCase() === 'A CAMINHO').length;
    const postponed = deliveryData.filter(d => (d['STATUS'] || '').toUpperCase() === 'ADIADO').length;
    const canceled = deliveryData.filter(d => (d['STATUS'] || '').toUpperCase() === 'CANCELADO').length;
    const pending = total - delivered - inTransit - postponed - canceled;

    const isFilterActive = activeStatusFilter !== null;

    const getCardClasses = (cardStatus: string | null) => {
        const isActive = activeStatusFilter === cardStatus;
        let classes = 'summary-card bg-white dark:bg-slate-800 p-5 rounded-lg shadow-sm border flex items-center cursor-pointer';
        
        if (isActive || (activeStatusFilter === null && cardStatus === 'ALL')) {
            classes += ' border-blue-500 ring-2 ring-blue-500/50';
        } else {
            classes += ' border-slate-200 dark:border-slate-700';
        }
        if (isFilterActive && !isActive && !(activeStatusFilter === null && cardStatus === 'ALL')) {
            classes += ' opacity-60 hover:opacity-100';
        }
        return classes;
    };

    summaryStats.innerHTML = `
        <div class="${getCardClasses('ALL')}" data-status="ALL">
            <div class="bg-blue-100 text-blue-600 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-box-open text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">Total de Containers</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${total}</div>
            </div>
        </div>
        <div class="${getCardClasses('ENTREGUE')}" data-status="ENTREGUE">
            <div class="bg-green-100 text-green-600 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-check-circle text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">Entregues</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${delivered}</div>
            </div>
        </div>
        <div class="${getCardClasses('A CAMINHO')}" data-status="A CAMINHO">
            <div class="bg-yellow-100 text-yellow-600 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-truck text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">A Caminho</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${inTransit}</div>
            </div>
        </div>
        <div class="${getCardClasses('ADIADO')}" data-status="ADIADO">
            <div class="bg-blue-100 text-blue-600 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-calendar-alt text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">Adiados</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${postponed}</div>
            </div>
        </div>
        <div class="${getCardClasses('PENDENTE')}" data-status="PENDENTE">
            <div class="bg-slate-100 text-slate-500 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-hourglass-half text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">Pendentes</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${pending}</div>
            </div>
        </div>
        <div class="${getCardClasses('CANCELADO')}" data-status="CANCELADO">
            <div class="bg-red-100 text-red-600 rounded-full h-12 w-12 flex items-center justify-center mr-4 flex-shrink-0">
                <i class="fas fa-times-circle text-xl"></i>
            </div>
            <div>
                <div class="text-slate-500 dark:text-slate-400 text-sm font-medium">Cancelados</div>
                <div class="text-3xl font-bold text-slate-800 dark:text-slate-100">${canceled}</div>
            </div>
        </div>
    `;
}

function renderDeliveryDashboard(data: any[], activeTabId: string | null = null): void {
    placeholder.classList.add('hidden');
    deliveryDashboard.classList.remove('hidden');
    summaryStats.classList.remove('hidden');
    exportExcelBtn.classList.remove('hidden');
    exportPdfBtn.classList.remove('hidden');
    deliveryTabs.innerHTML = '';
    deliveryContent.innerHTML = '';

    if (data.length === 0) {
        deliveryTabs.classList.add('hidden');
        const searchTerm = searchInput.value.trim();
        const message = activeStatusFilter 
            ? `Nenhum resultado para o status "${activeStatusFilter}"` + (searchTerm ? ` e a pesquisa "${searchTerm}"` : '') 
            : `Nenhum resultado encontrado para "${searchTerm}"`;

        deliveryContent.innerHTML = `
            <div class="text-center py-20 bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700">
                <i class="fas fa-search text-6xl text-slate-300 dark:text-slate-600 mb-4" aria-hidden="true"></i>
                <h2 class="text-2xl font-semibold text-slate-700 dark:text-slate-200">Nenhum resultado encontrado</h2>
                <p class="text-slate-500 dark:text-slate-400 mt-2">${message}.</p>
            </div>
        `;
        return;
    }
     deliveryTabs.classList.remove('hidden');


    const groupedByDate = data.reduce((acc, row, index) => {
        if (row.originalIndex === undefined) {
            const originalRow = deliveryData.find(d => d['CONTAINER'] === row['CONTAINER'] && d['DELIVERY AT BYD'] === row['DELIVERY AT BYD']);
            row.originalIndex = deliveryData.indexOf(originalRow);
        }

        const dateStr = row['DELIVERY AT BYD'] || 'Data não definida';
        if (!acc[dateStr]) acc[dateStr] = [];
        acc[dateStr].push(row);
        return acc;
    }, {} as Record<string, any[]>);

    const sortedDates = Object.keys(groupedByDate).sort((a, b) => {
        const dateA = excelDateToJSDate(a), dateB = excelDateToJSDate(b);
        if (a === 'Data não definida') return 1; // Always last
        if (b === 'Data não definida') return -1;
         if (dateA && dateB) return dateA.getTime() - dateB.getTime();
        return a.localeCompare(b);
    });

    // If there's an activeTabId but it's no longer present in the filtered view, default to the first tab
    const availableContentIds = sortedDates.map((_, index) => `content-${index}`);
    if (activeTabId && !availableContentIds.includes(activeTabId)) {
        activeTabId = null;
    }

    sortedDates.forEach((dateStr, index) => {
        const deliveries = groupedByDate[dateStr];
        const jsDate = excelDateToJSDate(dateStr);
        const formattedDate = jsDate ? jsDate.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit' }) : 'N/D';
        const weekday = jsDate ? jsDate.toLocaleDateString('pt-BR', { weekday: 'long' }) : '';
        
        const contentId = `content-${index}`;
        let isActive: boolean;
        if (activeTabId) {
            isActive = contentId === activeTabId;
        } else {
            isActive = index === 0;
        }
        
        const tabBtn = document.createElement('button');
        tabBtn.className = `tab-btn flex-shrink-0 px-4 py-3 text-sm font-semibold transition-colors duration-200 flex items-center space-x-2 ${isActive ? 'active' : ''}`;
        tabBtn.innerHTML = `<span>${weekday}</span> <span class="font-bold">${formattedDate}</span> <span class="tab-count-badge bg-slate-200 dark:bg-slate-700 dark:text-slate-200 text-slate-600 font-bold">${deliveries.length}</span>`;
        tabBtn.dataset.target = contentId;
        tabBtn.setAttribute('role', 'tab');
        tabBtn.setAttribute('aria-controls', contentId);
        tabBtn.setAttribute('aria-selected', isActive ? 'true' : 'false');
        deliveryTabs.appendChild(tabBtn);

        const card = document.createElement('div');
        card.id = contentId;
        card.className = `date-card bg-white dark:bg-slate-800 rounded-lg shadow-sm border border-slate-200 dark:border-slate-700 ${!isActive ? 'hidden' : ''}`;
        card.setAttribute('role', 'tabpanel');
        card.setAttribute('aria-labelledby', tabBtn.id);
        
        // --- Daily Stats Calculation ---
        const deliveredInCard = deliveries.filter(d => (d['STATUS'] || '').toUpperCase() === 'ENTREGUE').length;
        const inTransitInCard = deliveries.filter(d => (d['STATUS'] || '').toUpperCase() === 'A CAMINHO').length;
        const postponedInCard = deliveries.filter(d => (d['STATUS'] || '').toUpperCase() === 'ADIADO').length;
        const canceledInCard = deliveries.filter(d => (d['STATUS'] || '').toUpperCase() === 'CANCELADO').length;
        const pendingInCard = deliveries.length - deliveredInCard - inTransitInCard - postponedInCard - canceledInCard;
        const totalInCard = deliveries.length;
        const percentage = totalInCard > 0 ? (deliveredInCard / totalInCard) * 100 : 0;
        
        const getPill = (count: number, text: string, type: 'ENTREGUE' | 'A CAMINHO' | 'ADIADO' | 'PENDENTE' | 'CANCELADO') => {
            if (count === 0) return '';
            const details = getStatusDetails(type);
            return `<span class="daily-stat-pill ${details.pillBg} ${details.pillText}"><i class="fas ${details.icon} fa-fw"></i> ${count} ${text}</span>`;
        };

        const dailyStatsHTML = `
            <div class="flex flex-wrap gap-2 px-4 pb-4 border-b border-slate-200 dark:border-slate-700">
                ${getPill(deliveredInCard, 'Entregue(s)', 'ENTREGUE')}
               ${getPill(inTransitInCard, 'A Caminho', 'A CAMINHO')}
               ${getPill(postponedInCard, 'Adiado(s)', 'ADIADO')}
                ${getPill(pendingInCard, 'Pendente(s)', 'PENDENTE')}
                ${getPill(canceledInCard, 'Cancelado(s)', 'CANCELADO')}
            </div>
        `;
        
        const tableRows = deliveries.map((row, rowIndex) => {
            const status = (row['STATUS'] || 'PENDENTE').toUpperCase();
            const isDelivered = status === 'ENTREGUE';
            const isCancelled = status === 'CANCELADO';
            const isPostponed = status === 'ADIADO';
            const isTerminalState = isDelivered || isCancelled;

            let isOverdue = false;
            const deliveryDate = excelDateToJSDate(row['DELIVERY AT BYD']);
            if (deliveryDate && !isTerminalState) {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                if (deliveryDate < today) isOverdue = true;
            }

            let rowClass = '';
            if (isDelivered) rowClass = 'is-delivered bg-green-50 dark:bg-green-900/20 opacity-70 dark:opacity-80';
            else if (isCancelled) rowClass = 'is-cancelled bg-red-50 dark:bg-red-900/20 opacity-70 dark:opacity-80 line-through';
            else if (isOverdue) rowClass = 'is-overdue bg-red-100 dark:bg-red-900/30';
            else if (isPostponed) rowClass = 'is-postponed bg-blue-50 dark:bg-blue-900/20';

            let statusCellContent = '';
            if (isTerminalState) {
                statusCellContent = getStatusPill(status);
            } else {
                const options = ['PENDENTE', 'A CAMINHO', 'ADIADO', 'ENTREGUE', 'CANCELADO'];
                 const optionsHTML = options.map(opt => `<option value="${opt}" ${status === opt ? 'selected' : ''}>${opt.charAt(0) + opt.slice(1).toLowerCase()}</option>`).join('');
                
                const overdueIndicator = isOverdue ? `<i class="fas fa-exclamation-triangle text-red-500 dark:text-red-400 w-4 text-center" title="Esta entrega está atrasada."></i>` : '';
                const { icon, color } = getStatusDetails(status);
                const statusIcon = `<i class="fas ${icon} ${color} w-4 text-center" title="Status: ${status}"></i>`;

                statusCellContent = `
                    <div class="flex items-center space-x-2">
                        ${statusIcon} ${overdueIndicator}
                        <select class="status-select bg-white dark:bg-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-500 text-slate-700 text-xs rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 block w-full p-1.5" data-original-index="${row.originalIndex}" aria-label="Alterar status do container ${row['CONTAINER'] || ''}">
                            ${optionsHTML}
                        </select>
                    </div>`;
            }

             return `<tr class="${rowClass}" data-original-index="${row.originalIndex}" tabindex="0" aria-label="Ver detalhes do container ${row['CONTAINER'] || 'sem identificação'}">
                <td class="px-4 py-3 text-xs text-center font-medium text-slate-500 dark:text-slate-400">${rowIndex + 1}</td>
                <td class="px-4 py-3 text-xs font-semibold text-slate-800 dark:text-slate-100">${row['CONTAINER'] || ''}</td>
                <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${row['TRANSPORTATION COMPANY'] || ''}</td>
                <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${row['TRUCK LICENSE PLATE 1'] || ''}</td>
                <td class="px-4 py-3 text-xs text-slate-600 dark:text-slate-300">${row['BONDED WAREHOUSE'] || ''}</td>
                <td class="px-4 py-3 text-xs status-cell">${statusCellContent}</td>
            </tr>`;
        }).join('');

        card.innerHTML = `
            <div class="p-4 border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 rounded-t-lg">
                <div class="flex justify-between items-center mb-2">
                    <h3 class="font-bold text-lg text-slate-800 dark:text-slate-100">${jsDate ? jsDate.toLocaleDateString('pt-BR', { weekday: 'long', day: '2-digit', month: 'long' }) : dateStr}</h3>
                    <span class="progress-text text-sm font-medium text-slate-500 dark:text-slate-400">${deliveredInCard} de ${totalInCard} containers entregues</span>
                </div>
                <div class="progress-bar">
                    <div class="progress-bar-inner" style="width: ${percentage}%"></div>
                </div>
            </div>
            ${dailyStatsHTML}
            <div class="table-responsive"><table class="min-w-full text-sm">
                <thead><tr class="border-b border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50">
                    <th scope="col" class="px-4 py-2 text-center font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">#</th>
                    <th scope="col" class="px-4 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">Container</th>
                    <th scope="col" class="px-4 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">Transportadora</th>
                    <th scope="col" class="px-4 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">Placa</th>
                    <th scope="col" class="px-4 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">Armazém</th>
                    <th scope="col" class="px-4 py-2 text-left font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase">Status</th>
                </tr></thead>
                <tbody class="bg-white dark:bg-slate-800 divide-y divide-slate-100 dark:divide-slate-700">${tableRows}</tbody>
            </table></div>`;
        deliveryContent.appendChild(card);
    });
}

// --- Event Listeners ---
searchInput.addEventListener('input', () => {
    clearTimeout(searchDebounceTimer);
    searchDebounceTimer = window.setTimeout(() => {
        applyFiltersAndRender();
    }, 300);
});

summaryStats.addEventListener('click', (event) => {
    const card = (event.target as HTMLElement).closest<HTMLDivElement>('[data-status]');
    if (!card || !card.dataset.status) return;

    const status = card.dataset.status;

    if (status === 'ALL') {
        activeStatusFilter = null;
    } else if (activeStatusFilter === status) {
        activeStatusFilter = null; // Toggle off if clicking the same filter
    } else {
        activeStatusFilter = status;
    }

    applyFiltersAndRender();
});

deliveryTabs.addEventListener('click', (event) => {
    const button = (event.target as HTMLElement).closest<HTMLButtonElement>('.tab-btn');
    if (button) {
        document.querySelectorAll('.tab-btn').forEach(btn => {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        });
        document.querySelectorAll<HTMLDivElement>('#delivery-content > div').forEach(content => content.classList.add('hidden'));
        
        button.classList.add('active');
        button.setAttribute('aria-selected', 'true');
        if (button.dataset.target) {
            const targetContent = document.getElementById(button.dataset.target);
            if (targetContent) {
                targetContent.classList.remove('hidden');
            }
        }
    }
});

deliveryTabs.addEventListener('keydown', (event) => {
    const target = event.target as HTMLButtonElement;
    if (!target.matches('.tab-btn')) return;

    const tabs = Array.from(deliveryTabs.querySelectorAll<HTMLButtonElement>('.tab-btn'));
    const currentIndex = tabs.indexOf(target);
    let nextIndex = -1;

    if (event.key === 'ArrowRight') {
        nextIndex = (currentIndex + 1) % tabs.length;
    } else if (event.key === 'ArrowLeft') {
        nextIndex = (currentIndex - 1 + tabs.length) % tabs.length;
    } else if (event.key === 'Home') {
        nextIndex = 0;
    } else if (event.key === 'End') {
        nextIndex = tabs.length - 1;
    }

    if (nextIndex !== -1) {
        event.preventDefault();
        tabs[nextIndex].focus();
    }
});


deliveryContent.addEventListener('change', async (event) => {
    const select = event.target as HTMLSelectElement;
    if (!select || !select.matches('.status-select')) return;

    const newStatus = select.value.toUpperCase();
    const originalIndex = parseInt(select.dataset.originalIndex, 10);
    
    if (isNaN(originalIndex) || !deliveryData[originalIndex]) return;

    const originalStatus = deliveryData[originalIndex]['STATUS'] || 'PENDENTE';
    const containerID = deliveryData[originalIndex]['CONTAINER'] || 'Este item';
    const isTerminalState = newStatus === 'ENTREGUE' || newStatus === 'CANCELADO';

    if (isTerminalState) {
        const confirmed = await showConfirmationDialog(
            `Confirmar Alteração de Status`,
            `Tem certeza que deseja alterar o status de ${containerID} para "${newStatus}"? Esta ação é definitiva.`
        );
        if (!confirmed) {
            select.value = originalStatus; // Revert if user cancels
            return;
        }
    }

    deliveryData[originalIndex]['STATUS'] = newStatus;

    const statusText = newStatus.charAt(0) + newStatus.slice(1).toLowerCase();
    showToast(`Container ${containerID} atualizado para ${statusText}!`, 'success');
    
    // NOVO: Salva o estado completo no Firebase após a mudança
    await salvarDados(deliveryData);
});

function escapeAttr(str: string): string {
    return str.replace(/"/g, '&quot;');
}

function handleRowInteraction(row: HTMLTableRowElement) {
    if (!row || row.classList.contains('details-row')) return;

    const table = row.closest('table');
    if (!table) return;

    const currentlyExpandedRow = table.querySelector('tr.is-expanded');
    const isAlreadyExpanded = row.classList.contains('is-expanded');

    if (currentlyExpandedRow) {
        currentlyExpandedRow.classList.remove('is-expanded');
        const existingDetails = currentlyExpandedRow.nextElementSibling;
        if (existingDetails && existingDetails.classList.contains('details-row')) {
            const wrapper = existingDetails.querySelector('.details-content-wrapper');
            if (wrapper) {
                wrapper.classList.remove('expanded');
                setTimeout(() => existingDetails.remove(), 350);
            }
        }
    }

    if (!isAlreadyExpanded) {
        row.classList.add('is-expanded');
        const originalIndex = parseInt(row.dataset.originalIndex, 10);
        const rowData = deliveryData[originalIndex];

        const newDetailsRow = document.createElement('tr');
        newDetailsRow.className = 'details-row';
        
        const detailsCell = document.createElement('td');
        detailsCell.colSpan = 6;
        detailsCell.className = 'details-cell';

        detailsCell.innerHTML = `
            <div class="details-content-wrapper bg-slate-50 dark:bg-slate-900/50">
                <div class="grid grid-cols-1 md:grid-cols-2 gap-x-6 gap-y-4">
                    <div>
                        <label for="details-vessel-${originalIndex}" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Navio (Vessel)</label>
                        <input type="text" id="details-vessel-${originalIndex}" value="${escapeAttr(rowData['VESSEL'] || '')}" data-field="VESSEL" data-original-index="${originalIndex}" class="editable-input">
                    </div>
                    <div>
                        <label for="details-warehouse-${originalIndex}" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Armazém</label>
                        <input type="text" id="details-warehouse-${originalIndex}" value="${escapeAttr(rowData['BONDED WAREHOUSE'] || '')}" data-field="BONDED WAREHOUSE" data-original-index="${originalIndex}" class="editable-input">
                    </div>
                    <div class="md:col-span-2">
                        <label for="details-notes-${originalIndex}" class="block text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider">Observações</label>
                        <textarea id="details-notes-${originalIndex}" data-field="NOTES" data-original-index="${originalIndex}" class="editable-textarea" rows="3">${rowData['NOTES'] || ''}</textarea>
                    </div>
                </div>
            </div>`;
        newDetailsRow.appendChild(detailsCell);
        row.after(newDetailsRow);
        
        setTimeout(() => {
            const wrapper = newDetailsRow.querySelector('.details-content-wrapper');
            if (wrapper) wrapper.classList.add('expanded');
        }, 10);
    }
}


deliveryContent.addEventListener('click', (event) => {
    const target = event.target as HTMLElement;
    const row = target.closest<HTMLTableRowElement>('tbody tr:not(.details-row)');
    
    if (row && !target.closest('.status-cell') && !target.closest('a, button, input, select, textarea')) {
        handleRowInteraction(row);
    }
});

deliveryContent.addEventListener('keydown', (event) => {
    const target = event.target as HTMLElement;
    if ((event.key === 'Enter' || event.key === ' ') && target.matches('tr[data-original-index]')) {
        event.preventDefault(); // Prevent spacebar from scrolling page
        handleRowInteraction(target as HTMLTableRowElement);
    }
});


// Listener for dirty state on inline edit fields
deliveryContent.addEventListener('input', (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (target.matches('.editable-input, .editable-textarea')) {
        target.classList.add('is-dirty');
    }
});

// MODIFICADO: para ser 'async'
deliveryContent.addEventListener('blur', async (event) => {
    const target = event.target as HTMLInputElement | HTMLTextAreaElement;
    if (!target.matches('.editable-input, .editable-textarea') || !target.classList.contains('is-dirty')) {
        return;
    }

    const originalIndex = parseInt(target.dataset.originalIndex, 10);
    const field = target.dataset.field;
    const newValue = target.value;

    if (isNaN(originalIndex) || !field || !deliveryData[originalIndex]) return;

    const originalValue = deliveryData[originalIndex][field] || '';
    if (newValue === originalValue) {
        target.classList.remove('is-dirty'); // Reverted, so not dirty
        return;
    }
    
    deliveryData[originalIndex][field] = newValue;
    showToast(`Campo "${field.replace(/_/g, ' ')}" atualizado.`, 'success');
    target.classList.remove('is-dirty');

    // NOVO: Salva o estado completo no Firebase após a mudança
    await salvarDados(deliveryData);

    // MODIFICADO: A atualização da UI agora é controlada pelo ouvinte do Firebase,
    // mas podemos forçar uma atualização visual imediata se necessário.
    if (field === 'BONDED WAREHOUSE') {
        const tableRow = document.querySelector<HTMLTableRowElement>(`tr[data-original-index="${originalIndex}"]`);
        if (tableRow && tableRow.cells[4]) {
            tableRow.cells[4].textContent = newValue;
        }
    }
}, true);


exportExcelBtn.addEventListener('click', async () => {
    if (deliveryData.length === 0) return showToast('Não há dados para exportar.', 'warning');
    
    const confirmed = await showConfirmationDialog('Exportar para Excel', 'Deseja gerar o arquivo .xlsx com os dados atuais?');
    if (!confirmed) return;

    const dataToExport = deliveryData.map(row => {
        const { originalIndex, ...rest } = row;
        return rest;
    });
    const worksheet = XLSX.utils.json_to_sheet(dataToExport);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Programacao_Entregas");
    XLSX.writeFile(workbook, "programacao_entregas.xlsx");
    showToast('Arquivo Excel gerado!', 'success');
});

exportPdfBtn.addEventListener('click', async () => {
    if (deliveryData.length === 0) return showToast('Não há dados para exportar.', 'warning');

    const confirmed = await showConfirmationDialog('Exportar para PDF', 'Deseja gerar o arquivo .pdf com os dados atuais?');
    if (!confirmed) return;

    const { jsPDF } = jspdf;
    const doc = new jsPDF({ orientation: 'landscape' });

    doc.setFontSize(18);
    doc.setTextColor(44, 6
