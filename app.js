/**
 * app.js
 * Gestione dello stato, calcoli matematici e manipolazione del DOM.
 * Architettura modulare con separazione delle responsabilità.
 */

// --- 1. Gestione Persistenza (StorageManager) ---
class StorageManager {
    constructor() {
        this.storageKey = 'nutrizionista_data';
        this.data = this.loadData();
    }

    loadData() {
        try {
            const stored = localStorage.getItem(this.storageKey);
            if (stored) {
                return JSON.parse(stored);
            }
        } catch (e) {
            console.error("Errore nel parsing del localStorage", e);
        }
        // Struttura dati di default
        return {
            profiles: [],
            activeProfileId: null
        };
    }

    saveData() {
        localStorage.setItem(this.storageKey, JSON.stringify(this.data));
    }

    createProfile(name) {
        const newProfile = {
            id: 'prof_' + Date.now().toString(),
            name: name,
            history: [] // Array di misurazioni passate
        };
        this.data.profiles.push(newProfile);
        
        // Imposta automaticamente il nuovo profilo creato come attivo
        this.data.activeProfileId = newProfile.id;
        
        this.saveData();
        return newProfile;
    }

    deleteProfile(id) {
        this.data.profiles = this.data.profiles.filter(p => p.id !== id);
        // Se si elimina il profilo attivo, imposta il primo disponibile come attivo, o null
        if (this.data.activeProfileId === id) {
            this.data.activeProfileId = this.data.profiles.length > 0 ? this.data.profiles[0].id : null;
        }
        this.saveData();
    }

    setActiveProfile(id) {
        if (this.data.profiles.some(p => p.id === id)) {
            this.data.activeProfileId = id;
            this.saveData();
        }
    }

    getActiveProfile() {
        if (!this.data.activeProfileId) return null;
        return this.data.profiles.find(p => p.id === this.data.activeProfileId) || null;
    }

    addMeasurementToHistory(inputs, results) {
        const profile = this.getActiveProfile();
        if (profile) {
            profile.history.unshift({
                timestamp: new Date().toISOString(),
                inputs: inputs,
                results: results
            });
            this.saveData();
        }
    }
}

// --- 2. Motore di Calcolo Biometrico (CalculatorEngine) ---
class CalculatorEngine {
    
    /**
     * Calcolo Metabolismo Basale (BMR) con formula Mifflin-St Jeor
     */
    static calculateBMR(weight, height, age, gender) {
        let bmr = (10 * weight) + (6.25 * height) - (5 * age);
        if (gender === 'male') {
            bmr += 5;
        } else {
            bmr -= 161;
        }
        return bmr;
    }

    /**
     * Dispendio Energetico Totale (TDEE)
     */
    static calculateTDEE(bmr, activityLevel) {
        return bmr * activityLevel;
    }

    /**
     * Indice di Massa Corporea (BMI)
     */
    static calculateBMI(weight, heightCm) {
        const heightM = heightCm / 100;
        return weight / (heightM * heightM);
    }

    /**
     * Densità Corporea usando Jackson-Pollock 7 pliche
     */
    static calculateBodyDensity7(skinfoldsSum, age, gender) {
        const sumSq = skinfoldsSum * skinfoldsSum;
        let bodyDensity;

        if (gender === 'male') {
            bodyDensity = 1.112 - (0.00043499 * skinfoldsSum) + (0.00000055 * sumSq) - (0.00028826 * age);
        } else {
            bodyDensity = 1.097 - (0.00046971 * skinfoldsSum) + (0.00000056 * sumSq) - (0.00012828 * age);
        }
        return bodyDensity;
    }

    /**
     * Body Fat % usando l'equazione di Siri
     */
    static calculateBodyFatPercentage(bodyDensity) {
        return (495 / bodyDensity) - 450;
    }

    /**
     * Calcolo globale dei parametri
     */
    static computeAll(inputs) {
        const weight = parseFloat(inputs.weight);
        const height = parseFloat(inputs.height);
        const age = parseFloat(inputs.age);
        const gender = inputs.gender;
        const activity = parseFloat(inputs.activity);

        // Calcoli Base
        const bmr = this.calculateBMR(weight, height, age, gender);
        const tdee = this.calculateTDEE(bmr, activity);
        const bmi = this.calculateBMI(weight, height);

        // Somma delle 7 pliche
        const skinfoldsSum = 
            parseFloat(inputs.triceps) + 
            parseFloat(inputs.chest) + 
            parseFloat(inputs.midaxillary) + 
            parseFloat(inputs.subscapular) + 
            parseFloat(inputs.suprailiac) + 
            parseFloat(inputs.abdomenSF) + 
            parseFloat(inputs.thighSF);

        const bodyDensity = this.calculateBodyDensity7(skinfoldsSum, age, gender);
        let bodyFat = this.calculateBodyFatPercentage(bodyDensity);
        
        // Sanitizzazione risultato body fat per evitare aberrazioni matematiche da input errati
        if (bodyFat < 2) bodyFat = 2; 
        if (bodyFat > 60) bodyFat = 60;

        const fatMass = weight * (bodyFat / 100);
        const leanBodyMass = weight - fatMass;

        return {
            bmi: bmi.toFixed(1),
            bmr: Math.round(bmr),
            tdee: Math.round(tdee),
            bodyFat: bodyFat.toFixed(1),
            fatMass: fatMass.toFixed(1),
            lbm: leanBodyMass.toFixed(1)
        };
    }
}

// --- 3. Controller dell'Interfaccia Utente (UIController) ---
class UIController {
    constructor(storageManager, calculatorClass) {
        this.storage = storageManager;
        this.calc = calculatorClass;
        
        this.currentStep = 1;
        this.totalSteps = 3;

        this.initDOM();
        this.bindEvents();
        
        // Inizializza l'UI al caricamento
        this.renderProfiles();
        this.updateActiveProfileUI();
    }

    initDOM() {
        // Elementi Sidebar / Profili
        this.profileList = document.getElementById('profile-list');
        this.newProfileInput = document.getElementById('new-profile-name');
        this.btnAddProfile = document.getElementById('btn-add-profile');
        this.currentProfileName = document.getElementById('current-profile-name');

        // Elementi Tabs
        this.tabBtns = document.querySelectorAll('.tab-btn');
        this.tabContents = document.querySelectorAll('.tab-content');

        // Elementi Form Multistep
        this.form = document.getElementById('calc-form');
        this.steps = document.querySelectorAll('.form-step');
        this.btnNextList = document.querySelectorAll('.btn-next');
        this.btnPrevList = document.querySelectorAll('.btn-prev');
        this.progressBar = document.getElementById('progress-bar');
        this.stepIndicators = document.querySelectorAll('.step-indicator');
        
        // Elementi Dashboard Risultati
        this.dashboard = document.getElementById('results-dashboard');
        this.btnNewCalc = document.getElementById('btn-new-calc');
        
        // Elementi Storico
        this.historyContainer = document.getElementById('history-container');

        // Elementi Grafici
        this.chartParameter = document.getElementById('chart-parameter');
        this.rangeBtns = document.querySelectorAll('.range-btn');
        this.chartCanvas = document.getElementById('progress-chart');
        this.chartInstance = null;
        this.currentChartRange = 30; // Default 1 Mese
    }

    bindEvents() {
        // Gestione Profili
        this.btnAddProfile.addEventListener('click', () => this.handleAddProfile());
        this.newProfileInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.handleAddProfile();
        });

        // Cambio Tab
        this.tabBtns.forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.currentTarget.dataset.target));
        });

        // Navigazione Step
        this.btnNextList.forEach(btn => {
            btn.addEventListener('click', () => {
                if (this.validateStep(this.currentStep)) {
                    this.goToStep(this.currentStep + 1);
                } else {
                    alert('Compila tutti i campi richiesti in questo step con valori maggiori di zero.');
                }
            });
        });

        this.btnPrevList.forEach(btn => {
            btn.addEventListener('click', () => this.goToStep(this.currentStep - 1));
        });

        // Submit Form Principale
        this.form.addEventListener('submit', (e) => this.handleCalculate(e));

        // Nuovo Calcolo
        this.btnNewCalc.addEventListener('click', () => this.resetFormUI());

        // Gestione Grafici
        if (this.chartParameter) {
            this.chartParameter.addEventListener('change', () => this.updateChart());
        }
        
        if (this.rangeBtns) {
            this.rangeBtns.forEach(btn => {
                btn.addEventListener('click', (e) => {
                    this.rangeBtns.forEach(b => b.classList.remove('active'));
                    e.currentTarget.classList.add('active');
                    this.currentChartRange = parseInt(e.currentTarget.dataset.range);
                    this.updateChart();
                });
            });
        }
    }

    // --- Metodi di Business Logic dell'UI ---

    handleAddProfile() {
        const name = this.newProfileInput.value.trim();
        if (name) {
            this.storage.createProfile(name);
            this.newProfileInput.value = '';
            this.renderProfiles();
            this.updateActiveProfileUI();
            this.resetFormUI();
        }
    }

    handleDeleteProfile(id, e) {
        e.stopPropagation(); // Previene il click sul <li> genitore
        if (confirm('Sei sicuro di voler eliminare questo profilo e tutto il suo storico?')) {
            this.storage.deleteProfile(id);
            this.renderProfiles();
            this.updateActiveProfileUI();
            this.resetFormUI();
        }
    }

    renderProfiles() {
        this.profileList.innerHTML = '';
        const profiles = this.storage.data.profiles;
        const activeId = this.storage.data.activeProfileId;

        if (profiles.length === 0) {
            this.profileList.innerHTML = '<li style="padding: 10px; color: var(--text-secondary); font-size: 0.9rem;">Nessun profilo presente.</li>';
            return;
        }

        profiles.forEach(p => {
            const li = document.createElement('li');
            li.className = `profile-item ${p.id === activeId ? 'active' : ''}`;
            li.innerHTML = `
                <span>${p.name}</span>
                <button class="delete-btn" title="Elimina Profilo"><i class="fa-solid fa-trash"></i></button>
            `;
            
            // Cambio profilo attivo
            li.addEventListener('click', () => {
                this.storage.setActiveProfile(p.id);
                this.renderProfiles();
                this.updateActiveProfileUI();
                this.resetFormUI();
            });
            
            // Eliminazione profilo
            const delBtn = li.querySelector('.delete-btn');
            delBtn.addEventListener('click', (e) => this.handleDeleteProfile(p.id, e));

            this.profileList.appendChild(li);
        });
    }

    updateActiveProfileUI() {
        const active = this.storage.getActiveProfile();
        this.currentProfileName.textContent = active ? active.name : 'Nessuno';
        
        // Disabilita il form se nessun profilo è selezionato
        if (!active) {
            this.form.style.opacity = '0.5';
            this.form.style.pointerEvents = 'none';
        } else {
            this.form.style.opacity = '1';
            this.form.style.pointerEvents = 'auto';
            this.renderHistory(); // Aggiorna lo storico quando cambia l'utente
            this.updateChart(); // Aggiorna il grafico
        }
    }

    switchTab(tabId) {
        // Reset classi
        this.tabBtns.forEach(b => b.classList.remove('active'));
        this.tabContents.forEach(c => c.classList.remove('active'));

        // Attiva Tab corrente
        document.querySelector(`[data-target="${tabId}"]`).classList.add('active');
        document.getElementById(tabId).classList.add('active');

        if (tabId === 'tab-history') {
            this.renderHistory();
        } else if (tabId === 'tab-charts') {
            this.updateChart();
        }
    }

    goToStep(stepNumber) {
        if (stepNumber < 1 || stepNumber > this.totalSteps) return;

        // Nascondi tutti, mostra il target
        this.steps.forEach(s => s.classList.remove('active'));
        document.getElementById(`step-${stepNumber}`).classList.add('active');
        
        this.currentStep = stepNumber;
        
        // Aggiorna progress bar
        const progressPercentage = (this.currentStep / this.totalSteps) * 100;
        this.progressBar.style.width = `${progressPercentage}%`;

        // Aggiorna indicatori di step
        this.stepIndicators.forEach(ind => {
            if (parseInt(ind.dataset.step) <= this.currentStep) {
                ind.classList.add('active');
            } else {
                ind.classList.remove('active');
            }
        });
    }

    validateStep(stepNumber) {
        const stepContainer = document.getElementById(`step-${stepNumber}`);
        const inputs = stepContainer.querySelectorAll('input[required], select[required]');
        let isValid = true;

        inputs.forEach(input => {
            const val = input.value.trim();
            // Controllo specifico per input numerici per evitare negativi e zeri dove non logico
            if (input.type === 'number') {
                if (!val || parseFloat(val) <= 0) {
                    isValid = false;
                    input.style.borderColor = 'var(--danger-color)';
                } else {
                    input.style.borderColor = 'var(--border-color)';
                }
            } else {
                if (!val) {
                    isValid = false;
                    input.style.borderColor = 'var(--danger-color)';
                } else {
                    input.style.borderColor = 'var(--border-color)';
                }
            }
        });

        return isValid;
    }

    handleCalculate(e) {
        e.preventDefault();
        
        if (!this.validateStep(this.currentStep)) {
            alert('Assicurati di aver compilato tutti i campi correttamente.');
            return;
        }

        const activeProfile = this.storage.getActiveProfile();
        if (!activeProfile) {
            alert('Seleziona o crea un profilo prima di procedere.');
            return;
        }

        // Estrazione dati dal form
        const inputs = {
            age: document.getElementById('age').value,
            weight: document.getElementById('weight').value,
            height: document.getElementById('height').value,
            gender: document.getElementById('gender').value,
            activity: document.getElementById('activity').value,
            
            // Pliche (per i calcoli JP7)
            triceps: document.getElementById('skinfold-triceps').value,
            chest: document.getElementById('skinfold-chest').value,
            midaxillary: document.getElementById('skinfold-midaxillary').value,
            subscapular: document.getElementById('skinfold-subscapular').value,
            suprailiac: document.getElementById('skinfold-suprailiac').value,
            abdomenSF: document.getElementById('skinfold-abdomen').value,
            thighSF: document.getElementById('skinfold-thigh').value,

            // Circonferenze (salvate per reference ma non strettamente usate nei calcoli attuali)
            c_shoulders: document.getElementById('girth-shoulders').value,
            c_chest: document.getElementById('girth-chest').value,
            c_abdomen: document.getElementById('girth-abdomen').value,
            c_hips: document.getElementById('girth-hips').value,
            c_arm: document.getElementById('girth-arm').value,
            c_forearm: document.getElementById('girth-forearm').value,
            c_thigh: document.getElementById('girth-thigh').value,
            c_calf: document.getElementById('girth-calf').value,
        };

        // Calcolo parametri
        const results = this.calc.computeAll(inputs);
        
        // Salvataggio nello storico
        this.storage.addMeasurementToHistory(inputs, results);

        // Rendering a schermo
        this.showResults(results);
    }

    showResults(results) {
        // Nascondi form, mostra dashboard
        this.form.classList.add('hidden');
        this.dashboard.classList.remove('hidden');

        document.getElementById('res-bmi').textContent = results.bmi;
        document.getElementById('res-bmr').textContent = results.bmr;
        document.getElementById('res-tdee').textContent = results.tdee;
        document.getElementById('res-bf').textContent = `${results.bodyFat}%`;
        document.getElementById('res-fm').textContent = results.fatMass;
        document.getElementById('res-lbm').textContent = results.lbm;
    }

    resetFormUI() {
        this.form.reset();
        this.goToStep(1);
        
        // Rimuovi errori visivi pregressi
        const inputs = this.form.querySelectorAll('input, select');
        inputs.forEach(i => i.style.borderColor = 'var(--border-color)');
        
        // Scambia visualizzazione
        this.dashboard.classList.add('hidden');
        this.form.classList.remove('hidden');
    }

    renderHistory() {
        this.historyContainer.innerHTML = '';
        const profile = this.storage.getActiveProfile();

        if (!profile || !profile.history || profile.history.length === 0) {
            this.historyContainer.innerHTML = '<div class="no-history">Nessuna misurazione presente nello storico. Effettua un calcolo!</div>';
            return;
        }

        profile.history.forEach(item => {
            const dateObj = new Date(item.timestamp);
            const dateStr = dateObj.toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' });
            const timeStr = dateObj.toLocaleTimeString('it-IT', { hour: '2-digit', minute:'2-digit' });

            const card = document.createElement('div');
            card.className = 'history-card';
            card.style.cursor = 'pointer'; // Cursore per indicare cliccabilità
            card.title = "Clicca per visualizzare i dettagli completi";
            
            card.innerHTML = `
                <div class="history-header">
                    <span><i class="fa-regular fa-calendar" style="margin-right:6px"></i> ${dateStr} - ${timeStr}</span>
                    <span>Peso: ${item.inputs.weight} kg <i class="fa-solid fa-chevron-right" style="margin-left: 8px; font-size: 0.8rem; opacity: 0.5;"></i></span>
                </div>
                <div class="history-grid">
                    <div class="history-item"><span class="history-label">Body Fat</span><span class="history-val">${item.results.bodyFat}%</span></div>
                    <div class="history-item"><span class="history-label">BMI</span><span class="history-val">${item.results.bmi}</span></div>
                    <div class="history-item"><span class="history-label">TDEE</span><span class="history-val">${item.results.tdee} kcal</span></div>
                    <div class="history-item"><span class="history-label">FM</span><span class="history-val">${item.results.fatMass} kg</span></div>
                    <div class="history-item"><span class="history-label">LBM</span><span class="history-val">${item.results.lbm} kg</span></div>
                </div>
            `;
            
            // Evento click per riaprire la dashboard dei risultati
            card.addEventListener('click', () => {
                this.switchTab('tab-calculator');
                this.showResults(item.results);
                window.scrollTo({ top: 0, behavior: 'smooth' }); // Riporta l'utente all'inizio della pagina
            });

            this.historyContainer.appendChild(card);
        });
    }

    updateChart() {
        if (!this.chartCanvas) return;
        
        const ctx = this.chartCanvas.getContext('2d');
        const profile = this.storage.getActiveProfile();
        
        if (!profile || !profile.history || profile.history.length === 0) {
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
            ctx.clearRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
            ctx.font = '16px Inter, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText('Nessun dato sufficiente per il grafico.', this.chartCanvas.width / 2, this.chartCanvas.height / 2);
            return;
        }

        const param = this.chartParameter.value;
        const paramLabels = {
            weight: 'Peso (kg)',
            bodyFat: 'Body Fat (%)',
            bmi: 'BMI',
            tdee: 'TDEE (kcal)',
            fatMass: 'Massa Grassa (kg)',
            lbm: 'Massa Magra (kg)'
        };
        const label = paramLabels[param];

        // Filtro per data
        const now = new Date();
        const cutoffDate = new Date(now.getTime() - (this.currentChartRange * 24 * 60 * 60 * 1000));
        
        // Ordine cronologico per il grafico (dal più vecchio al più nuovo)
        const filteredHistory = profile.history.filter(item => new Date(item.timestamp) >= cutoffDate).reverse();

        if (filteredHistory.length === 0) {
            if (this.chartInstance) {
                this.chartInstance.destroy();
                this.chartInstance = null;
            }
            ctx.clearRect(0, 0, this.chartCanvas.width, this.chartCanvas.height);
            ctx.font = '16px Inter, sans-serif';
            ctx.fillStyle = '#64748b';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            let dateText = this.currentChartRange + ' giorni';
            if (this.currentChartRange === 7) dateText = '7 giorni';
            if (this.currentChartRange === 30) dateText = '30 giorni';
            if (this.currentChartRange === 90) dateText = '3 mesi';
            if (this.currentChartRange === 180) dateText = '6 mesi';
            if (this.currentChartRange === 365) dateText = '1 anno';
            ctx.fillText(`Nessun dato in questo periodo di tempo (${dateText}).`, this.chartCanvas.width / 2, this.chartCanvas.height / 2);
            return;
        }

        const labels = filteredHistory.map(item => {
            const date = new Date(item.timestamp);
            if (this.currentChartRange <= 30) {
                return date.toLocaleDateString('it-IT', { day: '2-digit', month: 'short' });
            } else {
                return date.toLocaleDateString('it-IT', { month: 'short', year: 'numeric' });
            }
        });

        const data = filteredHistory.map(item => {
            if (param === 'weight') return parseFloat(item.inputs.weight);
            return parseFloat(item.results[param]);
        });

        let gradient = ctx.createLinearGradient(0, 0, 0, 400);
        gradient.addColorStop(0, 'rgba(59, 130, 246, 0.4)');
        gradient.addColorStop(1, 'rgba(59, 130, 246, 0.0)');

        const chartConfig = {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: label,
                    data: data,
                    borderColor: '#3b82f6',
                    backgroundColor: gradient,
                    borderWidth: 3,
                    pointBackgroundColor: '#ffffff',
                    pointBorderColor: '#3b82f6',
                    pointBorderWidth: 2,
                    pointRadius: 4,
                    pointHoverRadius: 6,
                    fill: true,
                    tension: 0.4
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                animation: {
                    duration: 800,
                    easing: 'easeOutQuart'
                },
                interaction: {
                    mode: 'index',
                    intersect: false,
                },
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.9)',
                        titleFont: { family: 'Inter', size: 13 },
                        bodyFont: { family: 'Inter', size: 14, weight: 'bold' },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: false,
                        callbacks: {
                            label: function(context) {
                                return `${context.dataset.label}: ${context.parsed.y}`;
                            }
                        }
                    }
                },
                scales: {
                    x: {
                        grid: {
                            display: false,
                            drawBorder: false
                        },
                        ticks: {
                            font: { family: 'Inter', size: 12 },
                            color: '#64748b'
                        }
                    },
                    y: {
                        grid: {
                            color: 'rgba(226, 232, 240, 0.6)',
                            drawBorder: false,
                            borderDash: [5, 5]
                        },
                        ticks: {
                            font: { family: 'Inter', size: 12 },
                            color: '#64748b',
                            padding: 10
                        },
                        beginAtZero: false
                    }
                }
            }
        };

        if (this.chartInstance) {
            this.chartInstance.data = chartConfig.data;
            this.chartInstance.options = chartConfig.options;
            this.chartInstance.update();
        } else {
            this.chartInstance = new Chart(ctx, chartConfig);
        }
    }
}

// Bootstrapping dell'applicazione al caricamento del DOM
document.addEventListener('DOMContentLoaded', () => {
    const storageManager = new StorageManager();
    // Instanziamo UIController iniettando le dipendenze
    const appUI = new UIController(storageManager, CalculatorEngine);
});
