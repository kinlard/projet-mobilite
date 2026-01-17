// ============================================================
// 0. IMPORTS ES MODULES
// ============================================================
import { 
    AVIS_BAD, AVIS_MID, AVIS_GOOD,
    MAJOR_CITIES, FALLBACK_IMAGES,
    LOADING_PHRASES,
    APP_TEXTS
} from './js/textes.js';

// ============================================================
// 1. STYLE & CONFIGURATION
// ============================================================

// URL de l'API (Localhost ou Prod)
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ? 'http://localhost:3000'
    : '';

// ============================================================
// 2. INITIALISATION CARTE
// ============================================================
console.log("🚀 Initialisation Eco-Escapade - FIX ZONE piétonne");

const map = L.map('map', {
    zoomControl: false,
    minZoom: 4,
    maxZoom: 19,
    // PERF: Optimisations zoom fluide low-end
    preferCanvas: true,
    zoomSnap: 0.5,
    zoomDelta: 0.5,
    wheelPxPerZoomLevel: 120
}).setView([46.6, 2.2], 5);

// Layer Satellite/Hybrid pour le look sombre
const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', {
    maxZoom: 20
});
map.addLayer(googleSat);

// FIX: Initialisation globale des données et des couches manquantes
// SAFETY: définitions minimales pour éviter les ReferenceError au démarrage
const DATA = {
    gares: [],
    garesById: new Map(), // PERF: Index O(1) par ID
    velos: [],
    bornes: [],
    covoit: [],
    proprete: {},       // Données propreté indexées par nom de gare
    defibrillateurs: [] // Données défibrillateurs avec coordonnées
};

const createCluster = (cls) => L.markerClusterGroup({
    showCoverageOnHover: false,
    // PERF: Optimisations clusters low-end
    chunkedLoading: true,
    chunkInterval: 50,
    chunkDelay: 25,
    removeOutsideVisibleBounds: true,
    disableClusteringAtZoom: 18,
    spiderfyOnMaxZoom: false,
    iconCreateFunction: (c) => L.divIcon({
        html: `<span>${c.getChildCount()}</span>`,
        className: `custom-cluster ${cls}`,
        iconSize: [40, 40]
    })
});

const markersLayer = createCluster('cluster-gare');
const irveLayer = createCluster('cluster-irve');
const covoitLayer = createCluster('cluster-covoit');
const veloParkingLayer = createCluster('cluster-velo');

const railsLayer = L.geoJSON(null, {
    style: {
        color: '#6b7280',
        weight: 2,
        opacity: 0.6
    },
    // PERF: Simplification géométrie pour low-end
    simplifyFactor: 1.5,
    bubblingMouseEvents: false
});

// Regroupe les éléments de localisation utilisateur (pin + cercle) pour nettoyage facile
const userLocationLayer = L.layerGroup().addTo(map);

// FIX: Initialiser variables globales pour la gestion de la zone piétonne
let walkCircle = null;

// FIX: Déclaration globale de GLOBAL_STATS pour éviter ReferenceError
let GLOBAL_STATS = null;

const counterDiv = L.DomUtil.create('div', 'visible-counter');
counterDiv.innerHTML = `<i class="fa-solid fa-eye"></i> <span id="count-val">0</span> gares`;
document.body.appendChild(counterDiv);

const toastDiv = document.createElement('div');
toastDiv.id = 'map-toast';
toastDiv.className = 'map-toast';
toastDiv.innerHTML = `<i class="fa-solid fa-person-walking" style="font-size:1.2rem;"></i> <span id="toast-text">Message</span>`;
document.body.appendChild(toastDiv);

// Notification persistante pour la zone piétonne (vélos)
const veloNotifDiv = document.createElement('div');
veloNotifDiv.id = 'velo-zone-notif';
veloNotifDiv.className = 'velo-zone-notif';
veloNotifDiv.innerHTML = `
    <div class="velo-notif-content">
        <div class="velo-notif-icon">
            <i class="fa-solid fa-bicycle"></i>
        </div>
        <div class="velo-notif-text">
            <span class="velo-notif-title" id="velo-zone-title">Zone piétonne active</span>
            <span class="velo-notif-count"><span id="velo-zone-count">0</span> <span id="velo-zone-label">parkings vélos à 10 min</span></span>
        </div>
        <div class="notif-arrows" id="velo-nav-arrows" style="display:none;margin-left:12px;gap:6px;align-items:center;">
            <svg class="arrow-left" id="velo-arrow-left" viewBox="0 0 24 24" width="28" height="28" style="cursor:pointer;background:#0A74D6;border-radius:50%;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:all 0.2s ease;">
                <path d="M15 18l-6-6 6-6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
            <svg class="arrow-right" id="velo-arrow-right" viewBox="0 0 24 24" width="28" height="28" style="cursor:pointer;background:#0A74D6;border-radius:50%;padding:4px;box-shadow:0 2px 8px rgba(0,0,0,0.3);transition:all 0.2s ease;">
                <path d="M9 18l6-6-6-6" fill="none" stroke="#fff" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/>
            </svg>
        </div>
        <button class="velo-notif-close" onclick="hideWalkZone()" title="Fermer la zone">
            <i class="fa-solid fa-xmark"></i>
        </button>
    </div>
`;
document.body.appendChild(veloNotifDiv);

// === NAVIGATION VÉLOS DANS ZONE 10 MIN ===
let velosInZone = [];
let velosZoneIndex = 0;

// Fonction pour afficher la popup d'un vélo et centrer la vue
function showVeloPopup() {
    if (velosInZone.length === 0) return;
    const velo = velosInZone[velosZoneIndex];
    const lat = velo.lat;
    const lon = velo.lon;
    
    // Fermer toutes les popups ouvertes
    map.closePopup();
    
    // Trouver le marker correspondant dans le layer veloParkingLayer
    let targetMarker = null;
    veloParkingLayer.eachLayer(function(marker) {
        const markerLatLng = marker.getLatLng();
        // Comparer les coordonnées avec une tolérance pour les erreurs d'arrondi
        if (Math.abs(markerLatLng.lat - lat) < 0.0001 && Math.abs(markerLatLng.lng - lon) < 0.0001) {
            targetMarker = marker;
        }
    });
    
    // Si on a trouvé le marker, ouvrir sa popup
    if (targetMarker) {
        // Centrer d'abord la carte sur le vélo
        map.setView([lat, lon], 17, { animate: true, duration: 0.5 });
        
        // Attendre que le zoom soit terminé avant d'ouvrir la popup
        setTimeout(() => {
            targetMarker.openPopup();
        }, 600);
    } else {
        console.warn('Marker de vélo non trouvé pour:', velo);
        // Fallback: juste centrer la carte
        map.setView([lat, lon], 17, { animate: true, duration: 0.5 });
    }
}

// Configuration des event listeners pour les flèches
document.addEventListener('DOMContentLoaded', function() {
    const arrowLeft = document.getElementById('velo-arrow-left');
    const arrowRight = document.getElementById('velo-arrow-right');
    const veloNotif = document.getElementById('velo-zone-notif');
    
    if (arrowLeft) {
        arrowLeft.addEventListener('click', function(e) {
            e.stopPropagation();
            if (velosInZone.length > 1) {
                velosZoneIndex = (velosZoneIndex - 1 + velosInZone.length) % velosInZone.length;
                showVeloPopup();
            }
        });
        // Hover effect
        arrowLeft.addEventListener('mouseenter', function() {
            this.style.background = '#085bb5';
            this.style.transform = 'scale(1.1)';
        });
        arrowLeft.addEventListener('mouseleave', function() {
            this.style.background = '#0A74D6';
            this.style.transform = 'scale(1)';
        });
    }
    
    if (arrowRight) {
        arrowRight.addEventListener('click', function(e) {
            e.stopPropagation();
            if (velosInZone.length > 1) {
                velosZoneIndex = (velosZoneIndex + 1) % velosInZone.length;
                showVeloPopup();
            }
        });
        // Hover effect
        arrowRight.addEventListener('mouseenter', function() {
            this.style.background = '#085bb5';
            this.style.transform = 'scale(1.1)';
        });
        arrowRight.addEventListener('mouseleave', function() {
            this.style.background = '#0A74D6';
            this.style.transform = 'scale(1)';
        });
    }
    
    // Support tactile (swipe) pour mobile sur la notification
    if (veloNotif) {
        let touchStartX = 0;
        let touchEndX = 0;
        const minSwipeDistance = 50;
        
        veloNotif.addEventListener('touchstart', function(e) {
            touchStartX = e.changedTouches[0].screenX;
        }, { passive: true });
        
        veloNotif.addEventListener('touchend', function(e) {
            touchEndX = e.changedTouches[0].screenX;
            const swipeDistance = touchEndX - touchStartX;
            
            if (velosInZone.length > 1) {
                if (swipeDistance > minSwipeDistance) {
                    // Swipe droite → vélo précédent
                    velosZoneIndex = (velosZoneIndex - 1 + velosInZone.length) % velosInZone.length;
                    showVeloPopup();
                } else if (swipeDistance < -minSwipeDistance) {
                    // Swipe gauche → vélo suivant
                    velosZoneIndex = (velosZoneIndex + 1) % velosInZone.length;
                    showVeloPopup();
                }
            }
        }, { passive: true });
    }
});

// Fonction pour mettre à jour les flèches de navigation
function updateVeloNavArrows(count) {
    const arrows = document.getElementById('velo-nav-arrows');
    if (arrows) {
        if (count > 1) {
            arrows.style.display = 'flex';
        } else {
            arrows.style.display = 'none';
        }
    }
}

// Fonction debounce pour performance
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

// Helper pour afficher les toasts d'erreur ou d'info
function showToast(msg, isError = false) {
    const t = document.getElementById('map-toast');
    if (t) {
        document.getElementById('toast-text').innerHTML = msg;
        if (isError) t.style.borderColor = '#ef4444';
        else t.style.borderColor = '#334155';
        t.classList.add('active');
        setTimeout(() => t.classList.remove('active'), 4000);
    }
}

// Fonction de calcul de distance (formule Haversine) - retourne la distance en km
function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371; // Rayon de la Terre en km
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
              Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
              Math.sin(dLon / 2) * Math.sin(dLon / 2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    return R * c;
}

// Fonction pour mettre à jour le compteur de gares visibles
function updateCount() {
    const countEl = document.getElementById('count-val');
    if (countEl) {
        const visibleCount = markersLayer.getLayers().length;
        countEl.textContent = visibleCount;
    }
}

// Gestion des favoris avec localStorage
function getFavoris() {
    try {
        // FIX: Utilisation de 'eco_favoris' pour cohérence avec carnet.html
        return JSON.parse(localStorage.getItem('eco_favoris') || '[]');
    } catch (e) {
        return [];
    }
}

function isFavori(id) {
    return getFavoris().some(f => f.id === id);
}

function toggleFavori(id, nom, type) {
    console.log('🔄 toggleFavori appelé:', { id, nom, type });
    
    let favoris = getFavoris();
    const index = favoris.findIndex(f => f.id === id);
    
    if (index >= 0) {
        // Supprimer des favoris
        favoris.splice(index, 1);
        console.log('❌ Supprimé des favoris. Nouveau count:', favoris.length);
        showToast(`${nom} ${APP_TEXTS.favoris.removed[currentLang]}`);
    } else {
        // Ajouter aux favoris
        favoris.push({ 
            id, 
            nom, 
            type,
            date: new Date().toISOString() 
        });
        console.log('✅ Ajouté aux favoris. Nouveau count:', favoris.length);
        showToast(`${nom} ${APP_TEXTS.favoris.added[currentLang]}`);
    }
    
    // Sauvegarder dans localStorage
    localStorage.setItem('eco_favoris', JSON.stringify(favoris));
    console.log('💾 localStorage updated:', localStorage.getItem('eco_favoris'));
    
    // Mettre à jour le cœur dans le popup
    const icon = document.getElementById(`fav-${id}`);
    if (icon) {
        icon.classList.toggle('fav-active');
        icon.classList.toggle('fav-inactive');
        console.log('🎯 Icon updated:', icon.className);
    } else {
        console.warn('⚠️ Icon not found for id:', `fav-${id}`);
    }
}

let osmb = null;

let currentLang = 'fr';

// Variable pour tracker l'étape affichée du tutoriel (1, 2, 3 ou 4)
let currentTutoDisplayStep = 1;

window.updateAppLanguage = (isFr) => {
    currentLang = isFr ? 'fr' : 'en';
    
    console.log('🔄 updateAppLanguage appelé avec isFr=', isFr, '→ currentLang=', currentLang);
    console.log('   currentTutoDisplayStep =', currentTutoDisplayStep);
    
    // === MISE À JOUR DU TUTORIEL ===
    const tutoBox = document.getElementById('tutoBox');
    const tutoTitle = document.getElementById('tutoTitle');
    const tutoText = document.getElementById('tutoText');
    const tutoBtn = document.getElementById('tutoBtn');
    const skipBtn = document.querySelector('.tuto-skip-btn');
    
    console.log('   tutoTitle element:', tutoTitle ? 'FOUND' : 'NULL');
    console.log('   tutoText element:', tutoText ? 'FOUND' : 'NULL');
    
    // Toujours mettre à jour le tutoriel si les éléments existent
    if (tutoTitle && tutoText) {
        // Utiliser currentTutoDisplayStep pour savoir quelle étape afficher
        const tutoData = {
            1: APP_TEXTS.tuto1,
            2: APP_TEXTS.tuto2,
            3: APP_TEXTS.tuto3,
            4: APP_TEXTS.tuto4
        };
        
        const step = tutoData[currentTutoDisplayStep] || tutoData[1];
        console.log('   Mise à jour tutoriel avec:', step.title[currentLang]);
        tutoTitle.innerText = step.title[currentLang];
        tutoText.innerText = step.text[currentLang];
    } else {
        console.log('   ⚠️ Éléments tutoriel non trouvés!');
    }
    
    // Mettre à jour le bouton SUIVANT/NEXT ou TERMINER/FINISH
    if (tutoBtn) {
        if (currentTutoDisplayStep === 4) {
            tutoBtn.innerText = APP_TEXTS.tutorialButtons.finish[currentLang];
        } else {
            tutoBtn.innerText = APP_TEXTS.tutorialButtons.next[currentLang];
        }
    }
    
    // Mettre à jour le bouton "Passer le tuto"
    if (skipBtn) {
        skipBtn.innerText = APP_TEXTS.tutorialButtons.skip[currentLang];
    }
    
    // === MISE À JOUR DE LA NOTIFICATION VÉLO ===
    const veloTitleEl = document.getElementById('velo-zone-title');
    const veloLabelEl = document.getElementById('velo-zone-label');
    if (veloTitleEl) veloTitleEl.textContent = APP_TEXTS.veloZone.title[currentLang];
    if (veloLabelEl) veloLabelEl.textContent = APP_TEXTS.veloZone.count[currentLang];
    
    // === MISE À JOUR DES POPUPS DE GARE SI OUVERTES ===
    const openPopup = document.querySelector('.leaflet-popup-content');
    if (openPopup) {
        const analyseBtn = openPopup.querySelector('.btn-analyse');
        const walkBtn = openPopup.querySelector('.btn-walk');
        if (analyseBtn) {
            analyseBtn.innerHTML = APP_TEXTS.popup.analyse[currentLang];
        }
        if (walkBtn) {
            walkBtn.innerHTML = `<i class="fa-solid fa-person-walking"></i> ${APP_TEXTS.popup.zone[currentLang]}`;
        }
    }
    
    // === MISE À JOUR DU COMPTEUR DE GARES ===
    const counterDiv = document.querySelector('.visible-counter');
    if (counterDiv) {
        const countVal = document.getElementById('count-val');
        const count = countVal ? countVal.textContent : '0';
        counterDiv.innerHTML = `<i class="fa-solid fa-eye"></i> <span id="count-val">${count}</span> ${APP_TEXTS.counter.stations[currentLang]}`;
    }
};

// FIX: Properly escape HTML entities to prevent XSS and broken display
// SAFETY: Ensure input is string and handle null/undefined gracefully
const escapeHTML = (str) => {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"\/]/g, tag => ({
        '&': '&',
        '<': '<',
        '>': '>',
        "'": '\'',
        '"': '"',
        '/': '/'
    }[tag]));
};

// ============================================================
// 3. CHARGEMENT
// ============================================================

const FETCH_TIMEOUT_MS = 12000;

async function fetchJsonWithTimeout(url, fallback, label) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        const r = await fetch(url, { signal: controller.signal });
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return await r.json();
    } catch (e) {
        console.warn(`⚠️ ${label || 'fetch'} KO:`, e.message);
        return fallback;
    } finally {
        clearTimeout(timeoutId);
    }
}

/**
 * Charge toutes les donn�es initiales de l'application (Gares, Rails, IRVE, etc.).
 * G�re les promesses parall�les et l'initialisation de la carte.
 * Affiche un loader pendant le chargement et g�re les erreurs API via des toasts.
 * @async
 * @returns {Promise<void>}
 */
async function loadEverything() {
    console.log("D�but du chargement...");
    const loaderText = document.getElementById('loader-msg');
    const startTime = Date.now();
    const MIN_LOADING_TIME = 2000; // Temps de chargement minimum réduit pour éviter l'attente

    // Phase 1 : Afficher "Démarrage du serveur..." pendant 1 seconde
    if (loaderText) {
        loaderText.innerText = "Démarrage du serveur...";
    }
    await new Promise(resolve => setTimeout(resolve, 1000));

    // Phase 2 : Rotation automatique des phrases aléatoires toutes les 1 seconde
    const msgInterval = setInterval(() => {
        if (loaderText) {
            const randomPhrase = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
            loaderText.innerText = randomPhrase;
        }
    }, 1000);

    try {
        // === DÉBUT DU CHARGEMENT DES DONNÉES ===
        // Gestion d'erreurs robuste
        const promises = [
            fetchJsonWithTimeout(`${API_BASE_URL}/api/wfs-rails`, { type: 'FeatureCollection', features: [] }, 'Rails'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/gares`, [], 'Gares'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/irve`, { features: [] }, 'IRVE'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/covoiturage`, { features: [] }, 'Covoit'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/parking-velo?minLat=41&maxLat=52&minLon=-5&maxLon=10`, { features: [] }, 'Vélos'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/proprete-gares`, [], 'Propreté'),
            fetchJsonWithTimeout(`${API_BASE_URL}/api/defibrillateurs-gares`, [], 'Défibrillateurs')
        ];

        // Sécurité : timeout global pour débloquer le loader
        const globalTimeout = new Promise((_, reject) => setTimeout(() => reject(new Error('global-timeout')), 15000));
        const [rails, gares, irve, covoit, velos, proprete, defibrillateurs] = await Promise.race([
            Promise.all(promises),
            globalTimeout
        ]);

        if (rails) railsLayer.addData(rails);

        DATA.gares = gares;
        // PERF: Construire l'index O(1) par ID
        DATA.garesById.clear();
        gares.forEach(g => { if (g && g.id !== undefined) DATA.garesById.set(g.id, g); });
        
        DATA.velos = (velos.features || []).map(f => ({
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0]
        }));
        DATA.bornes = (irve.features || []).map(f => ({
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0]
        }));
        DATA.covoit = (covoit.features || []).map(f => ({
            lat: f.geometry.coordinates[1],
            lon: f.geometry.coordinates[0]
        }));
        
        // Indexer les données de propreté par nom de gare (lowercase pour matching)
        DATA.proprete = (proprete || []).reduce((acc, p) => {
            if (p.nom_gare) {
                // Indexation multiple : nom court + variantes pour meilleur matching
                const nomLower = p.nom_gare.toLowerCase().trim();
                acc[nomLower] = p;
                // Variante sans accents pour fallback
                const nomSansAccents = nomLower.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
                if (nomSansAccents !== nomLower) acc[nomSansAccents] = p;
            }
            return acc;
        }, {});
        console.log(`🧹 Propreté chargée : ${Object.keys(DATA.proprete).length} gares indexées`);
        
        // Stocker les défibrillateurs (matching par coordonnées géographiques)
        DATA.defibrillateurs = defibrillateurs || [];
        console.log(`❤️ Défibrillateurs chargés : ${DATA.defibrillateurs.length} gares équipées`);

        map.addLayer(markersLayer);
        map.addLayer(railsLayer);

        initMapMarkers();
        initSecondaryMarkers(irve, covoit, velos);
        preComputeScoresSync();

        // Calcul de TOUTES les stats au chargement pour le panneau Stats
        DATA.gares.forEach(g => {
            const an = analyser(g);
            g.computedScore = an.note;
            g.computedDetails = an.details;
        });

        GLOBAL_STATS = computeGlobalStats();
        await loadFranceMask();

        // Attendre le temps minimum de chargement (5 secondes au total)
        const elapsedTime = Date.now() - startTime;
        const remainingTime = MIN_LOADING_TIME - elapsedTime;
        if (remainingTime > 0) {
            await new Promise(resolve => setTimeout(resolve, remainingTime));
        }

        // Arr�t de la rotation des phrases al�atoires
        clearInterval(msgInterval);
        
        // Phase 3 : Afficher "Chargement de la page..." avant de terminer
        if (loaderText) {
            loaderText.innerText = "Chargement de la page...";
        }
        await new Promise(resolve => setTimeout(resolve, 1000));

    } catch (error) {
        console.error("Erreur critique chargement:", error);
        showToast("Erreur critique de chargement", true);
        // Arrêt rotation en cas d'erreur
        clearInterval(msgInterval);
        if (loaderText) {
            loaderText.innerText = 'Erreur de chargement...';
        }
    } finally {
        console.log("Chargement termin�.");
        // === MASQUAGE DU LOADER ===
        setTimeout(() => {
            const loader = document.getElementById('map-loader');
            if (loader) {
                loader.style.opacity = '0';
                setTimeout(() => loader.remove(), 800);
            }

            if (!checkTutorialMode()) {
                if (!checkUrlActions()) {
                    map.flyTo([46.6, 2.2], 6, {
                        animate: true,
                        duration: 2.5
                    });
                }
            }
            setupSearchListeners();
            startBackgroundAnalysis();
        }, 500);
    }
}

async function loadFranceMask() {
    try {
        const r = await fetch('https://raw.githubusercontent.com/gregoiredavid/france-geojson/master/metropole.geojson');
        const d = await r.json();
        
        // FIX: Gestion correcte du MultiPolygon pour �viter le bug du contour
        // Le GeoJSON de la France m�tropolitaine est un MultiPolygon avec plusieurs polygones
        // (Corse, �les, etc.). Chaque polygone doit �tre ajout� comme un trou s�par�.
        
        // Rectangle mondial en sens horaire (masque externe)
        const worldRect = [
            [-180, -90],
            [-180, 90],
            [180, 90],
            [180, -90],
            [-180, -90]
        ];
        
        // Fonction pour inverser les coordonn�es si n�cessaire (sens anti-horaire pour les trous)
        function ensureCounterClockwise(ring) {
            // Calcul de l'aire sign�e pour d�terminer le sens
            let area = 0;
            for (let i = 0; i < ring.length - 1; i++) {
                area += (ring[i + 1][0] - ring[i][0]) * (ring[i + 1][1] + ring[i][1]);
            }
            // Si l'aire est positive, les coordonn�es sont dans le sens horaire, on inverse
            if (area > 0) {
                return ring.slice().reverse();
            }
            return ring;
        }
        
        // Construction des trous pour chaque polygone de la France
        const holes = [];
        if (d.geometry.type === 'MultiPolygon') {
            // MultiPolygon: coordinates est un tableau de polygones
            d.geometry.coordinates.forEach(polygon => {
                // polygon[0] est l'anneau ext�rieur de chaque polygone
                if (polygon[0] && polygon[0].length > 0) {
                    holes.push(ensureCounterClockwise(polygon[0]));
                }
            });
        } else if (d.geometry.type === 'Polygon') {
            // Polygon simple: coordinates[0] est l'anneau ext�rieur
            if (d.geometry.coordinates[0] && d.geometry.coordinates[0].length > 0) {
                holes.push(ensureCounterClockwise(d.geometry.coordinates[0]));
            }
        }
        
        // Cr�ation du masque: rectangle mondial + trous pour la France
        const maskCoordinates = [worldRect, ...holes];
        
        L.geoJSON({
            type: "Feature",
            geometry: {
                type: "Polygon",
                coordinates: maskCoordinates
            }
        }, {
            style: {
                color: '#0f172a',
                weight: 1,
                fillColor: '#020617',
                fillOpacity: 0.75,
                interactive: false
            }
        }).addTo(map);
    } catch (e) {
        console.error('Erreur chargement masque France:', e);
    }
}

function initMapMarkers() {
    const dl = document.getElementById('gares-list');
    if (dl) dl.innerHTML = '';
    DATA.gares.forEach(g => {
        if (g.lat) {
            if (dl) {
                let o = document.createElement('option');
                o.value = g.nom;
                dl.appendChild(o);
            }

            let isTGV = g.type === 'TGV';
            // Calcul score pour couleur pulsation (sans afficher le score)
            const analysis = analyser(g);
            const score = analysis.note;
            const pulseColor = score >= 8 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';
            const pulseSpeed = score >= 8 ? '1.5s' : score >= 7 ? '2s' : '2.5s';

            // Ic�ne originale avec pulsation dynamique
            let icon = L.divIcon({
                className: 'marker-with-pulse',
                html: `
                    <style>
                        @keyframes pulse-gare-${g.id} {
                            0%, 100% { box-shadow: 0 0 0 0 ${pulseColor}80; }
                            50% { box-shadow: 0 0 0 15px ${pulseColor}00; }
                        }
                    </style>
                    <div class="marker-pin ${isTGV?'tgv':'ter'}" style="animation: pulse-gare-${g.id} ${pulseSpeed} infinite;">
                        <i class="fa-solid fa-train"></i>
                    </div>
                `,
                iconSize: [30, 30],
                iconAnchor: [15, 30]
            });

            let m = L.marker([g.lat, g.lon], {
                icon: icon
            });

            m.bindPopup(() => generatePopupContent(g));
            m.on('popupopen', () => {
                // FIX: Clear any existing walk zone when opening a new popup
                hideWalkZone();

                // Reset panneau avant chargement nouvelles donn�es
                resetEcoPanel();

                loadPhoto(g.nom, g.id);
                loadWeather(g.lat, g.lon, g.id);
                // Chargement qualit� air
                loadAirQuality(g.lat, g.lon, g.id);
                // Chargement biodiversit�
                loadBiodiversity(g.lat, g.lon, g.id);
            });
            g.marker = m;
            markersLayer.addLayer(m);
        }
    });
    updateCount();
}

/**
 * R�cup�re les donn�es de propret� pour une gare avec matching intelligent.
 * Essaie plusieurs variantes du nom pour trouver une correspondance.
 * @param {string} nomGare - Le nom de la gare � rechercher.
 * @returns {Object|null} Les donn�es de propret� ou null si non trouv�es.
 */
function getPropreteData(nomGare) {
    if (!DATA.proprete || !nomGare) return null;
    
    const nom = nomGare.toLowerCase().trim();
    
    // 1. Match exact
    if (DATA.proprete[nom]) return DATA.proprete[nom];
    
    // 2. Sans accents
    const nomSansAccents = nom.normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    if (DATA.proprete[nomSansAccents]) return DATA.proprete[nomSansAccents];
    
    // 3. Recherche partielle : nom de ville extrait (premier mot avant tiret/espace)
    const villePart = nom.split(/[-\s]/)[0];
    if (villePart.length >= 3) {
        for (const key of Object.keys(DATA.proprete)) {
            if (key.includes(villePart) || villePart.includes(key)) {
                return DATA.proprete[key];
            }
        }
    }
    
    // 4. Fuzzy matching basique : recherche si le nom contient une cl� ou vice-versa
    for (const key of Object.keys(DATA.proprete)) {
        if (nom.includes(key) || key.includes(nom)) {
            return DATA.proprete[key];
        }
    }
    
    return null;
}

/**
 * R�cup�re les donn�es de d�fibrillateurs pour une gare par matching g�ographique.
 * Cherche un d�fibrillateur dans un rayon de 500m de la gare.
 * @param {number} lat - Latitude de la gare.
 * @param {number} lon - Longitude de la gare.
 * @returns {Object|null} Les donn�es de d�fibrillateur ou null si non trouv�es.
 */
function getDefibData(lat, lon) {
    if (!DATA.defibrillateurs || DATA.defibrillateurs.length === 0 || !lat || !lon) return null;
    
    // Chercher un d�fibrillateur dans un rayon de 500m (0.005 degr�s � 500m)
    const tolerance = 0.005;
    
    for (const defib of DATA.defibrillateurs) {
        if (defib.lat && defib.lon) {
            const dLat = Math.abs(defib.lat - lat);
            const dLon = Math.abs(defib.lon - lon);
            if (dLat <= tolerance && dLon <= tolerance) {
                return defib;
            }
        }
    }
    
    return null;
}

/**
 * G�n�re le contenu HTML du popup pour une gare donn�e.
 * Inclut le score, l'avis, et les boutons d'action.
 * @param {Object} g - L'objet gare contenant nom, id, type, lat, lon.
 * @returns {string} Cha�ne HTML du popup.
 */
function generatePopupContent(g) {
    const analysis = analyser(g);
    const score = analysis.note;
    let avisList = score < 4 ? AVIS_BAD : score < 7 ? AVIS_MID : AVIS_GOOD;
    let avis = avisList[Math.floor(Math.random() * avisList.length)];
    let colorScore = score < 4 ? '#ef4444' : score < 7 ? '#f59e0b' : '#10b981';
    let isTGV = g.type === 'TGV';
    const t = APP_TEXTS.popup;
    const lang = currentLang;
    const safeNom = escapeHTML(g.nom);

    // === PROPRETÉ & DÉFIBRILLATEURS ===
    const propreteData = getPropreteData(g.nom);
    const defibData = getDefibData(g.lat, g.lon);
    
    let servicesHtml = '';
    const hasPropreteData = propreteData !== null;
    const hasDefibData = defibData && defibData.nb_appareils > 0;
    
    // Icône SVG défibrillateur
    const defibSvg = `<svg width="14" height="14" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg" style="vertical-align:middle;">
        <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" fill="${hasDefibData ? '#ef4444' : '#cbd5e1'}"/>
        <path d="M13 7h-2l-1 4h2l-1 5 4-6h-3l1-3z" fill="#ffffff"/>
    </svg>`;
    
    if (hasPropreteData || hasDefibData !== undefined) {
        const propreteColor = hasPropreteData ? 
            (propreteData.note_proprete >= 4 ? '#10b981' : propreteData.note_proprete >= 2 ? '#f59e0b' : '#ef4444') : '#94a3b8';
        
        servicesHtml = `
            <div style="display:flex;gap:12px;margin:10px 0;padding:10px;background:rgba(248,250,252,0.6);backdrop-filter:blur(10px);border-radius:10px;align-items:center;font-size:0.8rem;border:1px solid rgba(255,255,255,0.3);">
                ${hasPropreteData ? `
                <div style="display:flex;align-items:center;gap:4px;">
                    <span>🧹</span>
                    <span style="color:#0f172a;">Propreté:</span>
                    <span style="font-weight:700;color:${propreteColor};">${propreteData.note_proprete}/5</span>
                </div>` : ''}
                <div style="display:flex;align-items:center;gap:4px;">
                    <span style="color:#0f172a;">Défib:${defibSvg}</span>
                    <span style="font-weight:700;color:${hasDefibData ? '#10b981' : '#94a3b8'};">${hasDefibData ? 'Oui' : 'Non'}</span>
                </div>
            </div>`;
    }

    return `
        <div style="font-family:'Inter',sans-serif;max-width:320px;animation:popupSlideIn 0.3s ease-out;">
            <div class="photo-container" style="height:180px;overflow:hidden;border-radius:12px 12px 0 0;position:relative;">
                <img id="photo-${g.id}" class="city-photo" src="" alt="${safeNom}" style="width:100%;height:100%;object-fit:cover;">
                <div style="position:absolute;top:10px;right:10px;background:rgba(0,0,0,0.7);padding:6px 12px;border-radius:20px;color:white;font-size:11px;font-weight:bold;backdrop-filter:blur(5px);">${isTGV?'🚄 TGV':'🚂 TER'}</div>
            </div>
            <div id="weather-${g.id}" class="weather-box" style="background:linear-gradient(135deg,rgba(59,130,246,0.1),rgba(16,185,129,0.1));border-radius:0;padding:10px;text-align:center;font-size:0.85rem;color:#0f172a;">
                <span><i class="fa-solid fa-spinner fa-spin"></i> ${APP_TEXTS.weather.loading[lang]}</span>
            </div>
            <div style="padding:15px;background:rgba(255,255,255,0.95);border-radius:0 0 12px 12px;">
                <div style="display:flex;justify-content:space-between;align-items:start;margin-bottom:12px;">
                    <div style="flex:1;">
                        <h3 style="margin:0 0 5px 0;font-size:1.1rem;color:#0f172a;font-weight:800;">${safeNom}</h3>
                        <div style="display:inline-block;background:${isTGV?'linear-gradient(135deg,#3b82f6,#2563eb)':'linear-gradient(135deg,#10b981,#059669)'};color:white;padding:4px 10px;border-radius:6px;font-size:10px;font-weight:bold;">
                            <i class="fa-solid fa-circle" style="margin-right:4px;"></i>${g.type}
                        </div>
                    </div>
                    <i id="fav-${g.id}" onclick="toggleFavori(${g.id}, '${safeNom.replace(/'/g, "\\'")}', '${g.type}')" class="fa-solid fa-heart fav-btn ${isFavori(g.id)?'fav-active':'fav-inactive'}" style="font-size:1.4rem;cursor:pointer;transition:all 0.2s;"></i>
                </div>
                
                <div style="background:linear-gradient(135deg,rgba(248,250,252,0.8),rgba(241,245,249,0.8));padding:12px;border-radius:8px;margin-bottom:12px;font-style:italic;font-size:0.9rem;color:#475569;border-left:4px solid ${colorScore};backdrop-filter:blur(10px);">
                    <i class="fa-solid fa-quote-left" style="margin-right:4px;opacity:0.5;"></i>${avis}
                </div>
                ${servicesHtml}
                <div id="action-container-${g.id}" style="display:flex;flex-direction:column;gap:8px;">
                    <button class="btn-analyse" onclick="event.stopPropagation(); lancerAnalyseComplete(${g.id})" style="width:100%;background:linear-gradient(135deg,#0f172a,#1e293b);color:white;border:none;padding:12px;border-radius:8px;cursor:pointer;font-weight:bold;transition:all 0.3s;box-shadow:0 4px 12px rgba(15,23,42,0.2);">${t.analyse[lang]}</button>
                    <button class="btn-walk" onclick="event.stopPropagation(); showWalkZone(${g.lat}, ${g.lon})" style="width:100%;background:linear-gradient(135deg,rgba(16,185,129,0.2),rgba(5,150,105,0.2));color:#059669;border:1px solid rgba(16,185,129,0.3);padding:10px;border-radius:8px;cursor:pointer;font-weight:600;transition:all 0.3s;"><i class="fa-solid fa-person-walking"></i> ${t.zone[lang]}</button>
                </div>
            </div>
        </div>`;
}


// Fonction pour charger une photo de la gare via Wikimedia Commons
async function loadPhoto(nom, id) {
    const img = document.getElementById(`photo-${id}`);
    if (!img) {
        console.log(`Photo element not found for id: ${id}`);
        return;
    }
    
    // Afficher un placeholder pendant le chargement
    img.style.background = '#e2e8f0';
    img.alt = 'Chargement...';
    
    // Nettoyer le nom de la gare pour la recherche
    const cleanName = nom.replace(/['']/g, "'").trim();
    // Extraire le nom de ville principal
    const villeName = cleanName.split(/[-\s]/)[0];
    
    console.log(`Loading photo for: ${nom} (ville: ${villeName})`);
    
    // Construire les termes de recherche pour Wikimedia Commons
    const searchTerms = [
        `Gare de ${cleanName}`,
        `Gare ${villeName}`,
        `${villeName} gare SNCF`,
        `${villeName} train station`
    ];
    
    // Fonction pour chercher une image sur Wikimedia Commons
    async function searchWikimediaImage(searchTerm) {
        try {
            const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=6&srlimit=10&format=json&origin=*`;
            console.log(`Searching Wikimedia: ${searchTerm}`);
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.query && data.query.search && data.query.search.length > 0) {
                console.log(`Found ${data.query.search.length} results for "${searchTerm}"`);
                // Chercher une image valide parmi les r�sultats
                for (const result of data.query.search) {
                    const title = result.title;
                    console.log(`Checking: ${title}`);
                    // V�rifier que c'est bien une image (jpg, jpeg, png, gif, webp)
                    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(title)) {
                        // Extraire le nom du fichier sans le pr�fixe "File:"
                        const fileName = title.replace(/^File:/i, '');
                        // Construire l'URL de l'image via le service de thumbnails Wikimedia
                        const imageUrl = `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=500`;
                        console.log(`Image URL: ${imageUrl}`);
                        return imageUrl;
                    }
                }
            }
        } catch (e) {
            console.error(`Wikimedia search error for "${searchTerm}":`, e);
        }
        return null;
    }
    
    // Essayer chaque terme de recherche successivement
    for (const term of searchTerms) {
        const imageUrl = await searchWikimediaImage(term);
        if (imageUrl) {
            img.onload = () => {
                img.classList.add('loaded');
                console.log(`Photo loaded successfully for ${nom}`);
            };
            img.onerror = () => {
                console.log(`Image load failed, using fallback`);
                // Si l'image Wikimedia �choue, utiliser fallback
                const fallbackIndex = id % FALLBACK_IMAGES.length;
                img.src = FALLBACK_IMAGES[fallbackIndex];
                img.classList.add('loaded');
            };
            img.src = imageUrl;
            console.log(`Photo URL set for ${nom}: ${imageUrl}`);
            return;
        }
    }
    
    // Si aucune image trouv�e, utiliser une image de fallback nature/paysage
    console.log(`No image found for ${nom}, using fallback`);
    const fallbackIndex = id % FALLBACK_IMAGES.length;
    img.onload = () => img.classList.add('loaded');
    img.src = FALLBACK_IMAGES[fallbackIndex];
}

// Fonction pour charger les photos dans la modal découvrir (réutilise la logique de loadPhoto)
async function loadDiscoverPhoto(nom, id) {
    const img = document.getElementById(`discover-photo-${id}`);
    if (!img) return;
    
    const cleanName = nom.replace(/['']/g, "'").trim();
    const villeName = cleanName.split(/[-\s]/)[0];
    
    const searchTerms = [
        `Gare de ${cleanName}`,
        `Gare ${villeName}`,
        `${villeName} gare SNCF`,
        `${villeName} train station`
    ];
    
    async function searchWikimediaImage(searchTerm) {
        try {
            const url = `https://commons.wikimedia.org/w/api.php?action=query&list=search&srsearch=${encodeURIComponent(searchTerm)}&srnamespace=6&srlimit=10&format=json&origin=*`;
            const response = await fetch(url);
            const data = await response.json();
            
            if (data.query && data.query.search && data.query.search.length > 0) {
                for (const result of data.query.search) {
                    const title = result.title;
                    if (/\.(jpg|jpeg|png|gif|webp)$/i.test(title)) {
                        const fileName = title.replace(/^File:/i, '');
                        return `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(fileName)}?width=500`;
                    }
                }
            }
        } catch (e) {
            console.error(`Wikimedia search error:`, e);
        }
        return null;
    }
    
    for (const term of searchTerms) {
        const imageUrl = await searchWikimediaImage(term);
        if (imageUrl) {
            img.onerror = () => {
                img.src = FALLBACK_IMAGES[id % FALLBACK_IMAGES.length];
            };
            img.src = imageUrl;
            return;
        }
    }
}

async function loadWeather(lat, lon, id) {
    const el = document.getElementById(`weather-${id}`);
    if (!el) return;
    try {
        // Charger la m�t�o
        const weatherRes = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const weatherData = await weatherRes.json();
        const w = weatherData.current_weather || weatherData.current;

        if (w) {
            // Afficher d'abord la météo
            el.innerHTML = `
                <div class="weather-item"><i class="fa-solid fa-temperature-half weather-icon"></i> ${w.temperature}&deg;C</div>
                <div class="weather-item"><i class="fa-solid fa-wind weather-icon"></i> ${w.windspeed} km/h</div>
                <div class="weather-item air-quality-loading"><i class="fa-solid fa-lungs weather-icon"></i> <span style="color:#64748b">...</span></div>
            `;
            
            // Puis charger la qualité de l'air en arrière-plan
            try {
                const airRes = await fetch(`${API_BASE_URL}/api/air-quality?lat=${lat}&lon=${lon}`);
                const airData = await airRes.json();
                
                if (airData.success && airData.data) {
                    const note = airData.data.note;
                    const color = airData.data.color;
                    const airEl = el.querySelector('.air-quality-loading');
                    if (airEl) {
                        airEl.innerHTML = `<i class="fa-solid fa-lungs weather-icon" style="color:${color}"></i> <span style="color:${color}">${note}/10</span>`;
                        airEl.classList.remove('air-quality-loading');
                    }
                }
            } catch (airErr) {
                console.log('Air quality non disponible:', airErr.message);
                // Enlever le placeholder si erreur
                const airEl = el.querySelector('.air-quality-loading');
                if (airEl) airEl.remove();
            }
        } else {
            throw new Error('No Data');
        }
    } catch (e) {
        el.innerHTML = `<span style="font-size:0.8rem; color:#64748b;">${APP_TEXTS.weather.error[currentLang]}</span>`;
        console.error(`M�t�o err ${id}:`, e.message);
    }
}

// Refonte compl�te des popups IRVE & Covoiturage
function initSecondaryMarkers(irve, covoit, velos) {
    const iBuf = [],
        cBuf = [],
        vBuf = [];
    
    const lang = currentLang;
    const tIrve = APP_TEXTS.irvePopup;
    const tCovoit = APP_TEXTS.covoitPopup;

    // Bornes IRVE
    (irve.features || []).forEach(f => {
        if (f.geometry.coordinates) {
            const props = f.properties || {};
            const nom = escapeHTML(props.nom_amenageur || props.n_enseigne || "Borne de recharge");
            const prise = props.nbre_pdc ? `${props.nbre_pdc} ${tIrve.prises[lang]}` : tIrve.unknown[lang];
            const puissance = props.puissance_nominale ? `${props.puissance_nominale} kW` : "";
            const acces = props.acces_recharge || tIrve.access[lang];

            let h = `
            <div style="font-family:'Inter',sans-serif; overflow:hidden; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #f59e0b, #d97706); color: white; padding: 16px; font-weight: 700; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-charging-station" style="font-size: 1.1rem;"></i>
                    </div>
                    <span>${tIrve.title[lang]}</span>
                </div>
                <div style="padding: 16px; background: white;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:12px; font-size:1rem;">${nom}</div>
                    <div style="margin-bottom:8px; display:flex; align-items:center; gap:8px; color:#334155;"><i class="fa-solid fa-plug" style="color:#f59e0b; width:20px;"></i> ${prise} ${puissance ? ' &bull; ' + puissance : ''}</div>
                    <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px; color:#334155;"><i class="fa-solid fa-unlock" style="color:#64748b; width:20px;"></i> ${acces}</div>
                    <a href="https://www.google.com/maps?q=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" target="_blank" style="display:inline-flex; align-items:center; justify-content:center; gap:8px; width:100%; text-align:center; background:#e2e8f0; color:#1e293b; padding:10px; border-radius:8px; text-decoration:none; font-weight:600; font-size:0.9rem; transition:all 0.2s ease; box-sizing:border-box;" onmouseover="this.style.background='#cbd5e1'" onmouseout="this.style.background='#e2e8f0'"><i class="fa-solid fa-map-location-dot"></i> ${tIrve.maps[lang]}</a>
                </div>
            </div>`;
            iBuf.push(L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
                icon: L.divIcon({
                    className: 'c',
                    html: `<div class="marker-pin irve"><i class="fa-solid fa-plug" style="color:black"></i></div>`,
                    iconSize: [30, 30]
                })
            }).bindPopup(h));
        }
    });

    // Covoiturage
    (covoit.features || []).forEach(f => {
        if (f.geometry.coordinates) {
            const props = f.properties || {};
            const nom = props.nom_aire || props.ville || "Aire de covoiturage";
            const places = props.nb_places ? `${props.nb_places} ${tCovoit.places[lang]}` : tCovoit.unknown[lang];
            const type = props.type_aire || tCovoit.type[lang];

            let h = `
            <div style="font-family:'Inter',sans-serif; width:250px;">
                <div class="simple-popup-header header-covoit"><i class="fa-solid fa-car"></i> ${tCovoit.title[lang]}</div>
                <div class="simple-popup-body">
                    <div style="font-weight:bold; color:#0f172a; margin-bottom:10px;">${nom}</div>
                    <div><i class="fa-solid fa-square-parking" style="color:#a855f7"></i> ${places}</div>
                    <div><i class="fa-solid fa-road" style="color:#64748b"></i> ${type}</div>
                    <a href="https://www.google.com/maps?q=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" target="_blank" class="btn-maps"><i class="fa-solid fa-map-location-dot"></i> ${tIrve.maps[lang]}</a>
                </div>
            </div>`;
            cBuf.push(L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
                icon: L.divIcon({
                    className: 'c',
                    html: `<div class="marker-pin covoit"><i class="fa-solid fa-car" style="color:black"></i></div>`,
                    iconSize: [30, 30]
                })
            }).bindPopup(h));
        }
    });

    // V�los
    const tVelo = APP_TEXTS.veloPopup;
    (velos.features || []).forEach(f => {
        if (f.geometry.coordinates) {
            const props = f.properties || {};
            const commune = escapeHTML(props.meta_name_com || props.nom || "Parking v�lo");
            const capacite = props.capacite ? `${props.capacite} ${tVelo.capacity[lang]}` : tVelo.unknown[lang];
            const mobilier = props.mobilier ? props.mobilier.charAt(0) + props.mobilier.slice(1).toLowerCase() : "";
            const couverture = props.couverture === "true" ? tVelo.covered[lang] : tVelo.uncovered[lang];

            let h = `
            <div style="font-family:'Inter',sans-serif; overflow:hidden; border-radius:12px; box-shadow: 0 4px 12px rgba(0,0,0,0.1);">
                <div style="background: linear-gradient(135deg, #3b82f6, #2563eb); color: white; padding: 16px; font-weight: 700; font-size: 1.1rem; display: flex; align-items: center; gap: 10px;">
                    <div style="width: 36px; height: 36px; background: rgba(255,255,255,0.2); border-radius: 50%; display: flex; align-items: center; justify-content: center;">
                        <i class="fa-solid fa-bicycle" style="font-size: 1.1rem;"></i>
                    </div>
                    <span>${tVelo.title[lang]}</span>
                </div>
                <div style="padding: 16px; background: white;">
                    <div style="font-weight:700; color:#0f172a; margin-bottom:12px; font-size:1rem;">${commune}</div>
                    <div style="margin-bottom:8px; display:flex; align-items:center; gap:8px; color:#334155;"><i class="fa-solid fa-square-parking" style="color:#3b82f6; width:20px;"></i> ${capacite}</div>
                    ${mobilier ? `<div style="margin-bottom:8px; display:flex; align-items:center; gap:8px; color:#334155;"><i class="fa-solid fa-lock" style="color:#64748b; width:20px;"></i> ${mobilier}</div>` : ''}
                    <div style="margin-bottom:12px; display:flex; align-items:center; gap:8px; color:#334155;"><i class="fa-solid fa-umbrella" style="color:#64748b; width:20px;"></i> ${couverture}</div>
                    <a href="https://www.google.com/maps?q=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" target="_blank" style="display:flex; align-items:center; justify-content:center; gap:8px; width:100%; text-align:center; background:#e2e8f0; color:#1e293b; padding:10px; border-radius:8px; text-decoration:none; font-weight:600; font-size:0.9rem; transition:all 0.2s ease;" onmouseover="this.style.background='#cbd5e1'" onmouseout="this.style.background='#e2e8f0'"><i class="fa-solid fa-map-location-dot"></i> ${tVelo.maps[lang]}</a>
                </div>
            </div>`;
            vBuf.push(L.marker([f.geometry.coordinates[1], f.geometry.coordinates[0]], {
                icon: L.divIcon({
                    className: 'c',
                    html: `<div class="marker-pin velo"><i class="fa-solid fa-bicycle"></i></div>`,
                    iconSize: [30, 30]
                })
            }).bindPopup(h));
        }
    });

    irveLayer.addLayers(iBuf);
    covoitLayer.addLayers(cBuf);
    veloParkingLayer.addLayers(vBuf);
}

function setupSearchListeners() {
    const sInput = document.getElementById('search-input');
    if (sInput) {
        sInput.addEventListener('focus', () => {});
        sInput.addEventListener('change', (e) => {
            const g = DATA.gares.find(x => x.nom === e.target.value);
            if (g) goToGare(g.id);
            if (tutoStep === 3) skipTuto();
        });
    }
}

// Bouton "Me localiser" exposé globalement pour les handlers inline
window.locateUser = () => {
    // Feedback rapide
    showToast(APP_TEXTS.buttons.locate[currentLang]);

    map.locate({
        setView: true,
        maxZoom: 15,
        enableHighAccuracy: true,
        timeout: 12000
    });
};

// Popup de localisation revisitée (look carte + puce précision)
map.on('locationfound', (e) => {
    userLocationLayer.clearLayers();

    const userIcon = L.divIcon({
        className: 'user-pin-icon',
        html: '<div class="user-pin"></div>',
        iconSize: [20, 20]
    });

    const t = APP_TEXTS.location;
    const lang = currentLang;
    const accuracyMeters = Math.round(e.accuracy);

    const popupContent = `
        <div class="location-popup">
            <div class="location-header">
                <i class="fa-solid fa-location-crosshairs"></i>
                ${t.title[lang]}
            </div>
            <div class="location-body">
                <div style="display:flex;justify-content:center;gap:8px;margin-bottom:10px;flex-wrap:wrap;">
                    <span style="background:#e0f2fe;color:#0369a1;padding:6px 10px;border-radius:999px;font-size:0.8rem;font-weight:700;display:inline-flex;align-items:center;gap:6px;">
                        <i class="fa-solid fa-bullseye"></i> ±${accuracyMeters} ${t.meters[lang]}
                    </span>
                </div>
                <p style="margin:0 0 10px 0; color:#0f172a;">
                    ${t.text[lang]} <b>${accuracyMeters} ${t.meters[lang]}</b>.
                </p>
                <small style="color:#64748b;display:block;margin-bottom:8px;">${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</small>
                <button class="location-btn" onclick="window.findNearbyStation(${e.latlng.lat}, ${e.latlng.lng})">
                    <i class="fa-solid fa-magnifying-glass-location"></i> ${t.findStation[lang]}
                </button>
            </div>
        </div>
    `;

    L.marker(e.latlng, { icon: userIcon }).addTo(userLocationLayer).bindPopup(popupContent).openPopup();
    L.circle(e.latlng, {
        radius: e.accuracy / 2,
        color: '#3b82f6',
        fillOpacity: 0.1,
        weight: 1
    }).addTo(userLocationLayer);
});

map.on('locationerror', () => {
    showToast(APP_TEXTS.errors.localization[currentLang], true);
});

// Choisit une gare al�atoire uniquement lorsque les marqueurs sont Pr�ts
// PERF: Cache du pool de gares valides pour �viter filter() � chaque clic
let cachedValidGares = null;
let cachedValidGaresTime = 0;

window.randomGare = () => {
    // PERF: D�sactivation bouton avec feedback visuel imm�diat (am�liore INP)
    const diceBtn = document.getElementById('btnRandomGare');
    if (diceBtn) {
        diceBtn.style.pointerEvents = 'none';
        diceBtn.style.opacity = '0.6';
    }
    
    // PERF: setTimeout(0) lib�re le thread principal imm�diatement pour le paint
    setTimeout(() => {
        if (!DATA.gares || !DATA.gares.length) {
            if (diceBtn) { diceBtn.style.pointerEvents = 'auto'; diceBtn.style.opacity = '1'; }
            return;
        }
        
        // PERF: Cache du pool valide pendant 60s pour �viter filter() r�p�t�s
        const now = Date.now();
        if (!cachedValidGares || now - cachedValidGaresTime > 60000) {
            cachedValidGares = DATA.gares.filter(g => g && g.marker);
            cachedValidGaresTime = now;
        }
        
        if (!cachedValidGares.length) {
            showToast(APP_TEXTS.errors.loading[currentLang], false);
            if (diceBtn) { diceBtn.style.pointerEvents = 'auto'; diceBtn.style.opacity = '1'; }
            return;
        }
        
        // Nettoyage l�ger
        hideWalkZone();
        
        const pick = cachedValidGares[Math.floor(Math.random() * cachedValidGares.length)];
        goToGare(pick.id);
        
        // R�activer le bouton
        setTimeout(() => {
            if (diceBtn) { diceBtn.style.pointerEvents = 'auto'; diceBtn.style.opacity = '1'; }
        }, 400);
    }, 0);
};

// Centre la carte sur la gare et ouvre de fa�on robuste la popup
window.goToGare = (id) => {
    // PERF: Acc�s O(1) via Map au lieu de find() O(n)
    const g = DATA.garesById.get(id) || DATA.gares.find(x => x.id === id);
    if (!g || !g.marker) {
        showToast(APP_TEXTS.errors.unavailable[currentLang], true);
        return;
    }

    const target = L.latLng(g.lat, g.lon);
    hideWalkZone();
    map.closePopup();
    if (!map.hasLayer(markersLayer)) map.addLayer(markersLayer);

    // PERF: Animation simplifi�e
    markersLayer.zoomToShowLayer(g.marker, () => {
        map.setView(target, Math.max(map.getZoom(), 14), { animate: true, duration: 0.4 });
        setTimeout(() => { try { g.marker.openPopup(); } catch (e) {} }, 100);
    });
};

// Naviguer vers une gare par ses coordonn�es (utilis� par les stats m�t�o et top v�lo)
window.goToGareByCoords = (lat, lon, gareName) => {
    // Fermer le panneau stats
    const statsPanel = document.getElementById('statsPanel');
    if (statsPanel) statsPanel.classList.remove('active');
    
    // Chercher la gare correspondante dans les donn�es
    const gare = DATA.gares.find(g => {
        // Correspondance par nom (partiel) ou par coordonn�es proches
        const nameMatch = g.nom && gareName && g.nom.toLowerCase().includes(gareName.toLowerCase().substring(0, 10));
        const coordMatch = Math.abs(g.lat - lat) < 0.01 && Math.abs(g.lon - lon) < 0.01;
        return nameMatch || coordMatch;
    });
    
    if (gare && gare.marker) {
        // Gare trouv�e, utiliser goToGare
        goToGare(gare.id);
    } else {
        // Gare non trouv�e dans les donn�es charg�es, naviguer vers les coordonn�es
        hideWalkZone();
        map.closePopup();
        map.flyTo([lat, lon], 14, { duration: 1 });
        showToast(`?? ${gareName}`, false);
    }
};

// Nouvelle fonction pour la recherche proche
window.findNearbyStation = (lat, lon) => {
    if (!DATA.gares.length) return;
    
    // PERF: Utiliser reduce au lieu de sort() pour trouver le min en O(n) au lieu de O(n log n)
    let closest = null;
    let minDist = Infinity;
    for (let i = 0; i < DATA.gares.length; i++) {
        const g = DATA.gares[i];
        if (!g.lat || !g.lon) continue;
        const d = getDist(lat, lon, g.lat, g.lon);
        if (d < minDist) {
            minDist = d;
            closest = g;
        }
    }
    
    if (closest) {
        map.flyTo([closest.lat, closest.lon], 13, { duration: 1 });
        setTimeout(() => {
            markersLayer.zoomToShowLayer(closest.marker, () => {
                closest.marker.openPopup();
            });
        }, 1200);
    }
};

// Fonction pour cacher la zone pi�tonne
function hideWalkZone() {
    // Supprime le cercle si présent, mais ferme toujours la notif même s'il n'existe plus
    if (walkCircle) {
        try { map.removeLayer(walkCircle); } catch (e) {}
    }
    walkCircle = null;
    // Reset des variables de navigation vélos
    velosInZone = [];
    velosZoneIndex = 0;
    // Cacher la notification persistante des vélos
    const veloNotif = document.getElementById('velo-zone-notif');
    if (veloNotif) veloNotif.classList.remove('active');
    // Cacher les flèches de navigation
    updateVeloNavArrows(0);
}

// Variable pour emp�cher les clics multiples rapides
let isCreatingWalkZone = false;

/**
 * Active l'affichage de la zone pi�tonne (10 min) autour d'une gare.
 * Calcule un cercle de 800m et compte les parkings v�los � l'int�rieur.
 */
window.showWalkZone = function(lat, lon) {
    // FIX: Emp�cher les clics multiples rapides
    if (isCreatingWalkZone) return;
    isCreatingWalkZone = true;
    // d�sactiver (invisiblement) le bouton � 10 min � dans la popup courante
    try {
        const walkBtn = document.querySelector('.leaflet-popup .btn-walk');
        if (walkBtn) {
            walkBtn.style.pointerEvents = 'none';
            walkBtn.setAttribute('aria-disabled', 'true');
            walkBtn.tabIndex = -1;
        }
    } catch (e) {}

    // SAFETY: Ensure any previous circle is removed before drawing a new one.
    hideWalkZone();

    // FIX: Fermer la popup avant de zoomer pour �viter les conflits visuels
    map.closePopup();

    // FIX: D'abord zoomer sur la gare, PUIS ajouter le cercle une fois le zoom termin�
    map.flyTo([lat, lon], 15, {
        duration: 1.2
    });

    // Attendre la fin de l'animation de zoom avant d'ajouter le cercle
    map.once('moveend', function() {
        // CR�ATION du cercle de 800m (10-15 min de marche).
        walkCircle = L.circle([lat, lon], {
            radius: 800,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 3,
            dashArray: '10, 10'
        }).addTo(map);

        // FIX: S'assurer que les rails restent au-dessus du cercle
        setTimeout(() => {
            if (railsLayer && map.hasLayer(railsLayer)) {
                railsLayer.bringToFront();
            }
        }, 50);

        // Comptage et collecte des parkings v�los dans la zone pour la navigation
        let count = 0;
        velosInZone = []; // Reset du tableau global
        velosZoneIndex = 0; // Reset de l'index
        const bounds = walkCircle.getBounds();
        const centerLat = lat;
        const centerLon = lon;
        
        DATA.velos.forEach(v => {
            // Vérifier d'abord si dans les bounds pour perf
            if (bounds.contains({ lat: v.lat, lng: v.lon })) {
                // Puis vérifier la distance réelle - 600m max pour vraiment 10 min de marche
                const distKm = getDist(centerLat, centerLon, v.lat, v.lon);
                if (distKm <= 0.6) { // 600m max = 10 min de marche réalistes
                    count++;
                    velosInZone.push(v); // Stocker le vélo pour navigation
                }
            }
        });

        checkTutoAdvancement('walk');

        // Afficher la notification persistante des v�los avec traductions
        const veloNotif = document.getElementById('velo-zone-notif');
        const veloCountEl = document.getElementById('velo-zone-count');
        const veloTitleEl = document.getElementById('velo-zone-title');
        const veloLabelEl = document.getElementById('velo-zone-label');
        if (veloNotif && veloCountEl) {
            veloCountEl.textContent = count;
            if (veloTitleEl) veloTitleEl.textContent = APP_TEXTS.veloZone.title[currentLang];
            if (veloLabelEl) veloLabelEl.textContent = APP_TEXTS.veloZone.count[currentLang];
            veloNotif.classList.add('active');
            // Mettre � jour les fl�ches de navigation
            updateVeloNavArrows(count);
        }

        // FIX: R�activer les clics apr�s un court d�lai
        setTimeout(() => {
            isCreatingWalkZone = false;
        }, 300);
    });
};

// === MODIFI� : OPTIMISATION CRITIQUE DES PERFORMANCES ===

/**
 * Analyse une gare pour calculer son score �cologique.
 * Comptabilise les v�los (800m), bornes IRVE (3km) et covoiturage (3km).
 * @param {Object} g - L'objet gare � analyser.
 * @returns {Object} Un objet contenant la note (/10), les d�tails des compteurs et le total.
 */
function analyser(g) {
    let d = {
        bornes: 0,
        covoit: 0,
        velos: 0
    };
    // Optimisation : Bounding Box (environ +/- 0.05 degr�s, soit ~5km)
    const latMin = g.lat - 0.05,
        latMax = g.lat + 0.05;
    const lonMin = g.lon - 0.05,
        lonMax = g.lon + 0.05;
    const fastFilter = (p) => p.lat >= latMin && p.lat <= latMax && p.lon >= lonMin && p.lon <= lonMax;
    DATA.velos.forEach(v => {
        if (fastFilter(v) && getDist(g.lat, g.lon, v.lat, v.lon) <= 0.8) d.velos++;
    });
    DATA.bornes.forEach(b => {
        if (fastFilter(b) && getDist(g.lat, g.lon, b.lat, b.lon) <= 3) d.bornes++;
    });
    DATA.covoit.forEach(c => {
        if (fastFilter(c) && getDist(g.lat, g.lon, c.lat, c.lon) <= 3) d.covoit++;
    });
    let s = (g.type === 'TGV' ? 1 : 0) + Math.min(d.velos * 1, 7) + Math.min(d.bornes * 0.5, 2) + Math.min(d.covoit * 0.5, 1);
    return {
        note: Math.min(Math.round(s * 10) / 10, 10),
        details: d,
        total: d.velos + d.bornes + d.covoit
    };
}
// ========================================================

function preComputeScoresSync() {
    for (let i = 0; i < DATA.gares.length; i++) {
        const g = DATA.gares[i];
        g.tags = [];

        if (g.lat < 45.7) g.tags.push('sud');
        if (g.lat > 49.0) g.tags.push('nord'); // Ajout Nord

        // Paris sp�cifique
        if (getDist(g.lat, g.lon, 48.8566, 2.3522) < 20) g.tags.push('paris');

        const isAlpes = (g.lon > 5.5 && g.lat < 46.2 && g.lat > 44.0);
        const isPyrenees = (g.lat < 43.2 && g.lon < 3.0);
        if (isAlpes || isPyrenees) g.tags.push('montagne');

        // S�paration Mer / Oc�an
        const isMed = (g.lat < 43.7 && g.lon > 3.0);
        const isAtlantique = (g.lon < -1.0 && g.lat < 48.0);
        const isManche = (g.lat > 48.5 && g.lon < -1.5);

        if (isMed) g.tags.push('mer');
        if (isAtlantique || isManche) g.tags.push('ocean');

        const cleanName = g.nom.replace(/Gare de\s?/i, '').trim();
        if (MAJOR_CITIES.some(city => cleanName.includes(city))) g.tags.push('ville');
    }
}

/**
 * Lance une analyse comparative compl�te pour une gare.
 * Compare avec les gares environnantes pour trouver une meilleure alternative.
 * Met � jour l'interface utilisateur avec les scores d�taill�s et les barres de progression.
 * @param {number} id - L'identifiant de la gare � analyser.
 */
window.lancerAnalyseComplete = function(id) {
    // PERF: Feedback visuel imm�diat pour am�liorer l'INP per�u
    const container = document.getElementById(`action-container-${id}`);
    if (container) {
        container.innerHTML = `<div style="text-align:center;padding:20px;color:#64748b;"><i class="fa-solid fa-spinner fa-spin"></i> Analyse...</div>`;
    }
    
    // PERF: setTimeout(0) lib�re compl�tement le thread pour le paint (meilleur INP que rAF)
    setTimeout(() => {
        // PERF: Acc�s O(1) via Map
        const g = DATA.garesById.get(id) || DATA.gares.find(x => x.id === id);
        if (!g) return;
        
        // PERF: Utiliser le score pr�-calcul� si disponible
        const s = g.computedScore ? { note: g.computedScore, details: g.computedDetails, total: (g.computedDetails?.velos || 0) + (g.computedDetails?.bornes || 0) + (g.computedDetails?.covoit || 0) } : analyser(g);
        
        let best = null;
        let bestS = s.note;
        let bestTotal = s.total;
        
        // PERF: Bounding box pr�-filtr�e + utilisation des scores pr�-calcul�s
        const latMin = g.lat - 0.15, latMax = g.lat + 0.15;
        const lonMin = g.lon - 0.15, lonMax = g.lon + 0.15;
        
        for (let i = 0; i < DATA.gares.length; i++) {
            const v = DATA.gares[i];
            if (v.id === id || v.lat < latMin || v.lat > latMax || v.lon < lonMin || v.lon > lonMax) continue;
            
            const dist = getDist(g.lat, g.lon, v.lat, v.lon);
            if (dist > 10) continue;
            
            // PERF: Utiliser score pr�-calcul� si dispo
            const sv = v.computedScore ? { note: v.computedScore, total: (v.computedDetails?.velos || 0) + (v.computedDetails?.bornes || 0) + (v.computedDetails?.covoit || 0) } : analyser(v);
            
            if (sv.note > bestS || (sv.note === bestS && sv.total > bestTotal)) {
                bestS = sv.note;
                bestTotal = sv.total;
                best = v;
            }
        }

        // Utilisation compl�te de APP_TEXTS.analysis pour la traduction dynamique
        const t = APP_TEXTS.analysis;
        const lang = currentLang;

        const pctV = Math.min((s.details.velos / 5) * 100, 100);
        const pctB = Math.min((s.details.bornes / 6) * 100, 100);
        const pctC = Math.min((s.details.covoit / 2) * 100, 100);
        const color = s.note >= 7 ? '#059669' : s.note >= 4 ? '#d97706' : '#dc2626';

        let html = `
            <div class="analyse-container">
                <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                    <span>${t.score[lang]}</span><span style="font-weight:900; color:${color}">${s.note}/10</span>
                </div>
                <div class="stat-row"><i class="fa-solid fa-bicycle" style="width:25px; color:#0891b2;"></i> <span style="flex:1">${t.bikes[lang]}</span> <b>${s.details.velos}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctV}%; background:#0891b2;"></div></div></div>
                <div class="stat-row"><i class="fa-solid fa-plug" style="width:25px; color:#d97706;"></i> <span style="flex:1">${t.irve[lang]}</span> <b>${s.details.bornes}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctB}%; background:#d97706;"></div></div></div>
                <div class="stat-row"><i class="fa-solid fa-car" style="width:25px; color:#9333ea;"></i> <span style="flex:1">${t.covoit[lang]}</span> <b>${s.details.covoit}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctC}%; background:#9333ea;"></div></div></div>
        `;

        if (best) {
            html += `<button onclick="goToGare(${best.id})" style="width:100%;
            margin-top:15px; background:white; border:1px solid ${color}; color:${color}; padding:10px 12px; border-radius:6px; font-weight:600; font-size:0.85rem; display:flex; justify-content:space-between; align-items:center;
            cursor:pointer;">
                        <span>${t.alt[lang]} ${escapeHTML(best.nom.replace("Gare de ", ""))}</span>
                        <span style="background:${color};
                        color:white; padding:2px 6px; border-radius:4px;">${bestS} ${t.go[lang].replace('Y aller ', '')}</span>
                     </button>`;
        } else {
            html += `<div style="margin-top:15px; background:#ecfdf5; color:#047857; padding:12px; border-radius:6px; font-weight:800; text-align:center; border:1px solid #a7f3d0;"><i class="fa-solid fa-trophy"></i> ${t.best[lang]}</div>`;
        }

        html += `<button class="btn-walk" onclick="event.stopPropagation(); showWalkZone(${g.lat}, ${g.lon})"><i class="fa-solid fa-person-walking"></i> ${t.zone[lang]}</button>`;
        html += `</div>`;
        
        if (container) container.innerHTML = html;

        // d�clenchement confettis si score excellent (d�port� pour ne pas bloquer)
        if (s.note >= 9) {
            setTimeout(() => {
                confetti({
                    particleCount: 150,
                    spread: 70,
                    origin: { y: 0.6 },
                    colors: ['#10b981', '#22c55e', '#84cc16', '#a3e635']
                });

                if (s.note === 10) {
                    setTimeout(() => {
                        confetti({ particleCount: 200, angle: 60, spread: 55, origin: { x: 0 } });
                        confetti({ particleCount: 200, angle: 120, spread: 55, origin: { x: 1 } });
                    }, 250);
                }
            }, 50);
        }

        checkTutoAdvancement('analyse');
    });
};

const overlays = {
    "?? Gares": markersLayer,
    "??? Rails": railsLayer,
    "? Bornes": irveLayer,
    "?? Covoit": covoitLayer,
    "?? V�los": veloParkingLayer
};
L.control.layers(null, overlays, {
    position: 'bottomright'
}).addTo(map);
L.control.scale({
    imperial: false
}).addTo(map);

try {
    new L.Control.MiniMap(L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), {
        toggleDisplay: true,
        position: 'bottomleft'
    }).addTo(map);
} catch (e) {}

// PERF: Cache du dernier niveau de zoom pour �viter les recalculs inutiles
let lastZoomLevel = -1;
let zoomRafId = null;

// PERF: Handler zoomend combin� et optimis� avec RAF throttling +30% CPU
const handleZoomEnd = () => {
    const zoom = map.getZoom();
    
    // PERF: Skip si le niveau de zoom n'a pas chang� significativement
    const zoomBand = zoom < 8 ? 0 : zoom < 12 ? 1 : zoom < 14 ? 2 : 3;
    const lastBand = lastZoomLevel < 8 ? 0 : lastZoomLevel < 12 ? 1 : lastZoomLevel < 14 ? 2 : 3;
    
    // OSMBuildings (toujours v�rifi�)
    if (zoom >= 15 && !osmb && typeof OSMBuildings !== 'undefined') {
        try {
            osmb = new OSMBuildings(map).load('https://{s}.data.osmbuildings.org/0.2/anonymous/tile/{z}/{x}/{y}.json');
        } catch (e) {
            console.warn('OSMBuildings non disponible');
        }
    }
    
    // PERF: Ne recalculer que si on change de bande de zoom
    if (zoomBand === lastBand && lastZoomLevel !== -1) return;
    lastZoomLevel = zoom;

    if (zoom < 8) {
        // Vue France : Seulement TGV + rails simplifi�s
        railsLayer.setStyle({
            weight: 1.5,
            opacity: 0.5
        });
        irveLayer.remove();
        covoitLayer.remove();
        veloParkingLayer.remove();

    } else if (zoom >= 8 && zoom < 12) {
        // Vue R�gionale : TGV + TER + rails normaux
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        railsLayer.setStyle({
            weight: 2,
            opacity: 0.6
        });
        irveLayer.remove();
        covoitLayer.remove();
        veloParkingLayer.remove();

    } else if (zoom >= 12 && zoom < 14) {
        // Vue locale : Tout afficher
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        railsLayer.setStyle({
            weight: 3,
            opacity: 0.7
        });
        if (!map.hasLayer(irveLayer)) map.addLayer(irveLayer);
        if (!map.hasLayer(covoitLayer)) map.addLayer(covoitLayer);
        if (!map.hasLayer(veloParkingLayer)) map.addLayer(veloParkingLayer);
    } else {
        // Vue locale : Tout visible
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        if (!map.hasLayer(irveLayer)) map.addLayer(irveLayer);
        if (!map.hasLayer(covoitLayer)) map.addLayer(covoitLayer);
        if (!map.hasLayer(veloParkingLayer)) map.addLayer(veloParkingLayer);
    }
};

// PERF: Debounce + RAF pour zoomend (�vite les appels excessifs pendant zoom continu)
map.on('zoomend', () => {
    if (zoomRafId) cancelAnimationFrame(zoomRafId);
    zoomRafId = requestAnimationFrame(handleZoomEnd);
});

loadEverything();

function checkUrlActions() {
    const urlParams = new URLSearchParams(window.location.search);
    const targetId = urlParams.get('target');
    const action = urlParams.get('action');
    if (targetId) {
        setTimeout(() => goToGare(parseInt(targetId)), 500);
        return true;
    } else if (action === 'random') {
        setTimeout(() => randomGare(), 500);
        return true;
    }
    return false;
}

window.openDiscoverModal = () => {
    document.getElementById('discoverModal').classList.add('active');
    document.getElementById('catGrid').style.display = 'grid';
    document.getElementById('resultsContainer').style.display = 'none';
};
window.closeDiscover = () => document.getElementById('discoverModal').classList.remove('active');

window.showCategory = (category, titleArg) => {
    document.getElementById('catGrid').style.display = 'none';
    document.getElementById('resultsContainer').style.display = 'grid';
    document.getElementById('btnBackCat').style.display = 'inline-block';

    // MODIFI� : Ignore le titre pass� en param�tre et utilise la traduction via l'ID category
    const tCats = APP_TEXTS.categories;
    const tRes = APP_TEXTS.results;
    const lang = currentLang;

    document.getElementById('discoverTitle').innerText = tCats[category] ? tCats[category][lang] : titleArg;
    document.getElementById('discoverSubtitle').innerText = tRes.top9[lang];

    if (!DATA.gares[0].computedScore) {
        DATA.gares.forEach(g => {
            const an = analyser(g);
            g.computedScore = an.note;
            g.computedDetails = an.details;
        });
    }

    let candidates = DATA.gares.filter(g => g.tags && g.tags.includes(category));
    candidates.sort((a, b) => b.computedScore - a.computedScore);
    const top9 = candidates.slice(0, 9);
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';

    if (top9.length === 0) {
        container.innerHTML = `<div style="color:white; grid-column:span 3;">${tRes.loading[lang]}</div>`;
    } else {
        top9.forEach((g, idx) => {
            const fallbackIndex = g.id % FALLBACK_IMAGES.length;
            const fallbackImg = FALLBACK_IMAGES[fallbackIndex];
            const html = `
                <div class="result-card rank-${idx+1}" style="overflow:hidden;">
                    <div style="height:120px; position:relative; overflow:hidden; background:#1e293b;">
                        <img id="discover-photo-${g.id}" src="${fallbackImg}" style="width:100%; height:100%; object-fit:cover; object-position:center;" alt="${escapeHTML(g.nom)}">
                        <div class="rank-badge">#${idx+1}</div>
                        <div class="street-view-btn" onclick="window.open('https://www.google.com/maps?q=${encodeURIComponent(g.nom)}', '_blank'); event.stopPropagation();"><i class="fa-solid fa-street-view"></i></div>
                    </div>
                    <div style="padding:15px;">
                        <h3 style="color:white; margin:0 0 5px 0;">${escapeHTML(g.nom)}</h3>
                        <div style="font-weight:900; color:#10b981; font-size:1.5rem;
margin-bottom:10px;">${g.computedScore}/10</div>
                        <div style="font-size:0.85rem;
color:#94a3b8; margin-bottom:15px;">
                            <i class="fa-solid fa-bicycle"></i> ${g.computedDetails.velos} ${tRes.bikes[lang]} &bull; 
                            <i class="fa-solid fa-plug"></i> ${g.computedDetails.bornes} ${tRes.bornes[lang]}
                        </div>
         
               <button onclick="goToGare(${g.id}); closeDiscover();" style="background:var(--primary); border:none;
padding:10px; width:100%; border-radius:6px; font-weight:bold; cursor:pointer; color:#022c22;">${tRes.go[lang]}</button>
                    </div>
                </div>`;
            container.innerHTML += html;
        });
        
        // Charger les vraies photos après insertion dans le DOM
        top9.forEach((g) => {
            setTimeout(() => {
                loadDiscoverPhoto(g.nom, g.id);
            }, 100);
        });
    }
};

window.resetDiscover = () => {
    document.getElementById('catGrid').style.display = 'grid';
    document.getElementById('resultsContainer').style.display = 'none';
    document.getElementById('btnBackCat').style.display = 'none';
    // FIX: Use translated texts from APP_TEXTS instead of hardcoded French strings.
    const t = APP_TEXTS.discover;
    const lang = currentLang;
    document.getElementById('discoverTitle').innerText = t.title[lang];
    document.getElementById('discoverSubtitle').innerText = t.subtitle[lang];
};

function startBackgroundAnalysis() {
    let index = 0;
    const chunkSize = 100;

    function processChunk() {
        const end = Math.min(index + chunkSize, DATA.gares.length);
        for (let i = index; i < end; i++) {
            const g = DATA.gares[i];
            const analysis = analyser(g);
            g.computedScore = analysis.note;
            g.computedDetails = analysis.details;
            if (!g.tags) g.tags = [];
            if (g.computedDetails.velos > 2 && getDist(g.lat, g.lon, 48.8566, 2.3522) > 50) g.tags.push('nature');
        }
        index += chunkSize;
        if (index < DATA.gares.length) requestAnimationFrame(processChunk);
        else {
            const btn = document.querySelector('.btn-discover');
            if (btn) btn.style.opacity = '1';
        }
    }
    processChunk();
}

function computeGlobalStats() {
    if (!DATA.gares.length) return null;
    let totalScore = 0;
    let tgvCount = 0;
    let sumVelos = 0;
    let sumBornes = 0;
    let sumCovoit = 0;
    let n = 0;
    
    // Nouvelles stats
    let garesAvecVelo = 0;
    let garesSansVelo = 0;
    let topVeloGare = null;
    let topVeloCount = 0;
    let topVeloLat = null;
    let topVeloLon = null;
    
    DATA.gares.forEach(g => {
        if (!g.computedScore || !g.computedDetails) return;
        n++;
        totalScore += g.computedScore;
        if (g.type === 'TGV') tgvCount++;
        sumVelos += g.computedDetails.velos;
        sumBornes += g.computedDetails.bornes;
        sumCovoit += g.computedDetails.covoit;
        
        // Compter les gares avec/sans v�lo dans zone 10min (800m)
        if (g.computedDetails.velos > 0) {
            garesAvecVelo++;
            // Trouver la gare avec le plus de v�los
            if (g.computedDetails.velos > topVeloCount) {
                topVeloCount = g.computedDetails.velos;
                topVeloGare = g.nom;
                topVeloLat = g.lat;
                topVeloLon = g.lon;
            }
        } else {
            garesSansVelo++;
        }
    });
    if (n === 0) return null;
    return {
        gares: n,
        scoreMoyen: (totalScore / n).toFixed(1),
        partTGV: Math.round((tgvCount / n) * 100) + '%',
        moyVelos: (sumVelos / n).toFixed(1),
        moyBornes: (sumBornes / n).toFixed(1),
        moyCovoit: (sumCovoit / n).toFixed(1),
        // Nouvelles stats
        totalVelos: DATA.velos.length,
        totalCovoit: DATA.covoit.length,
        totalIrve: DATA.bornes.length,
        garesAvecVelo: garesAvecVelo,
        garesSansVelo: garesSansVelo,
        topVeloGare: topVeloGare,
        topVeloCount: topVeloCount,
        topVeloLat: topVeloLat,
        topVeloLon: topVeloLon,
        totalGares: n
    };
}

const statsPanel = document.getElementById('statsPanel');
const btnStats = document.getElementById('btnStats');
const btnStatsClose = document.getElementById('closeStats');

// Cache pour les donn�es m�t�o enrichies
let enrichedStatsCache = null;
let enrichedStatsLastFetch = 0;
let statsRefreshInterval = null;

// Fonction pour r�cup�rer les stats m�t�o enrichies depuis le backend
async function fetchEnrichedStats() {
    try {
        const center = map.getCenter();
        const url = `${API_BASE_URL}/api/enriched-stats?centerLat=${center.lat}&centerLon=${center.lng}`;
        const response = await fetch(url);
        if (response.ok) {
            enrichedStatsCache = await response.json();
            enrichedStatsLastFetch = Date.now();
            console.log('?? Enriched stats loaded:', enrichedStatsCache);
        }
    } catch (e) {
        console.warn('?? Impossible de charger les stats enrichies:', e.message);
    }
}

function refreshStatsPanel() {
    if (!GLOBAL_STATS) {
        // Recalculer si n�cessaire
        GLOBAL_STATS = computeGlobalStats();
    }
    if (!GLOBAL_STATS) return;
    
    // Anciennes stats
    document.getElementById('stat-gares').innerText = GLOBAL_STATS.gares;
    document.getElementById('stat-score').innerText = GLOBAL_STATS.scoreMoyen + '/10';
    document.getElementById('stat-tgv').innerText = GLOBAL_STATS.partTGV;
    document.getElementById('stat-velos').innerText = GLOBAL_STATS.moyVelos;
    document.getElementById('stat-bornes').innerText = GLOBAL_STATS.moyBornes;
    document.getElementById('stat-covoit').innerText = GLOBAL_STATS.moyCovoit;
    
    // Nouvelles stats - Totaux nationaux
    const totalVelosEl = document.getElementById('stat-total-velos');
    const totalCovoitEl = document.getElementById('stat-total-covoit');
    const totalIrveEl = document.getElementById('stat-total-irve');
    const garesVeloEl = document.getElementById('stat-gares-velo');
    const topVeloEl = document.getElementById('stat-top-velo');
    const noVeloEl = document.getElementById('stat-no-velo');
    const hottestEl = document.getElementById('stat-hottest');
    const coldestEl = document.getElementById('stat-coldest');
    
    if (totalVelosEl) totalVelosEl.innerText = GLOBAL_STATS.totalVelos || DATA.velos.length || 0;
    if (totalCovoitEl) totalCovoitEl.innerText = GLOBAL_STATS.totalCovoit || DATA.covoit.length || 0;
    if (totalIrveEl) totalIrveEl.innerText = GLOBAL_STATS.totalIrve || DATA.bornes.length || 0;
    if (garesVeloEl) garesVeloEl.innerText = `${GLOBAL_STATS.garesAvecVelo || 0}/${GLOBAL_STATS.totalGares || 0}`;
    
    // Classement v�los - avec bouton pour naviguer
    if (topVeloEl) {
        if (GLOBAL_STATS.topVeloGare && GLOBAL_STATS.topVeloLat && GLOBAL_STATS.topVeloLon) {
            const nom = GLOBAL_STATS.topVeloGare.length > 12 
                ? GLOBAL_STATS.topVeloGare.substring(0, 12) + '...'
                : GLOBAL_STATS.topVeloGare;
            topVeloEl.innerHTML = `<span class="stat-clickable" onclick="goToGareByCoords(${GLOBAL_STATS.topVeloLat}, ${GLOBAL_STATS.topVeloLon}, '${GLOBAL_STATS.topVeloGare.replace(/'/g, "\\'")}')">
                ${nom} (${GLOBAL_STATS.topVeloCount}) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;margin-left:4px;"></i>
            </span>`;
        } else if (GLOBAL_STATS.topVeloGare) {
            topVeloEl.innerText = `${GLOBAL_STATS.topVeloGare} (${GLOBAL_STATS.topVeloCount})`;
        } else {
            topVeloEl.innerText = '-';
        }
    }
    if (noVeloEl) noVeloEl.innerText = GLOBAL_STATS.garesSansVelo || 0;
    
    // M�t�o - depuis les stats enrichies - avec boutons pour naviguer
    if (enrichedStatsCache && enrichedStatsCache.weather) {
        const weather = enrichedStatsCache.weather;
        if (hottestEl && weather.hottest) {
            const nomHot = weather.hottest.name.length > 12 ? weather.hottest.name.substring(0, 12) + '...' : weather.hottest.name;
            if (weather.hottest.lat && weather.hottest.lon) {
                hottestEl.innerHTML = `<span class="stat-clickable" onclick="goToGareByCoords(${weather.hottest.lat}, ${weather.hottest.lon}, '${weather.hottest.name.replace(/'/g, "\\'")}')">
                    ${nomHot} (${weather.hottest.temp}&deg;C) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;margin-left:4px;"></i>
                </span>`;
            } else {
                hottestEl.innerText = `${nomHot} (${weather.hottest.temp}&deg;C)`;
            }
        }
        if (coldestEl && weather.coldest) {
            const nomCold = weather.coldest.name.length > 12 ? weather.coldest.name.substring(0, 12) + '...' : weather.coldest.name;
            if (weather.coldest.lat && weather.coldest.lon) {
                coldestEl.innerHTML = `<span class="stat-clickable" onclick="goToGareByCoords(${weather.coldest.lat}, ${weather.coldest.lon}, '${weather.coldest.name.replace(/'/g, "\\'")}')">
                    ${nomCold} (${weather.coldest.temp}&deg;C) <i class="fa-solid fa-arrow-up-right-from-square" style="font-size:0.7rem;margin-left:4px;"></i>
                </span>`;
            } else {
                coldestEl.innerText = `${nomCold} (${weather.coldest.temp}&deg;C)`;
            }
        }
    } else {
        // Charger les donn�es m�t�o si pas encore fait
        if (Date.now() - enrichedStatsLastFetch > 30000) {
            fetchEnrichedStats();
        }
        if (hottestEl) hottestEl.innerText = 'Chargement...';
        if (coldestEl) coldestEl.innerText = 'Chargement...';
    }
}

// Fonction pour forcer le rafra�chissement des stats
window.forceRefreshStats = async function() {
    const btn = document.getElementById('btnRefreshStats');
    if (btn) {
        btn.classList.add('spinning');
    }
    
    // Recalculer les stats globales
    GLOBAL_STATS = computeGlobalStats();
    
    // Recharger les donn�es m�t�o
    await fetchEnrichedStats();
    
    // Rafra�chir l'affichage
    refreshStatsPanel();
    
    if (btn) {
        setTimeout(() => btn.classList.remove('spinning'), 500);
    }
    
    showToast(currentLang === 'fr' ? 'Stats actualis�es !' : 'Stats refreshed!');
};

// D�marrer le rafra�chissement automatique toutes les 30s quand le panneau est ouvert
function startStatsAutoRefresh() {
    if (statsRefreshInterval) clearInterval(statsRefreshInterval);
    statsRefreshInterval = setInterval(() => {
        if (statsPanel && statsPanel.classList.contains('active')) {
            GLOBAL_STATS = computeGlobalStats();
            fetchEnrichedStats().then(() => refreshStatsPanel());
        }
    }, 30000);
}

if (btnStats && statsPanel) {
    btnStats.addEventListener('click', () => {
        GLOBAL_STATS = computeGlobalStats();
        refreshStatsPanel();
        fetchEnrichedStats().then(() => refreshStatsPanel());
        statsPanel.classList.add('active');
        startStatsAutoRefresh();
    });
}
if (btnStatsClose && statsPanel) {
    btnStatsClose.addEventListener('click', () => {
        statsPanel.classList.remove('active');
    });
}

// Fermer le statsPanel en cliquant en dehors
document.addEventListener('click', (e) => {
    if (statsPanel && statsPanel.classList.contains('active')) {
        // V�rifier si le clic est en dehors du panel et du bouton stats
        if (!statsPanel.contains(e.target) && !btnStats.contains(e.target)) {
            statsPanel.classList.remove('active');
        }
    }
});

let tutoStep = 0;

// ============================================================
// FONCTION POUR OUVRIR LA PAGE D'AIDE (TUTORIEL)
// ============================================================
window.openOnboarding = function() {
    console.log('🎓 Ouverture du tutoriel');
    window.location.href = 'map.html?tuto=true';
};
let currentTutoTarget = null;

function checkTutorialMode() {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tuto') === 'true') {
        startTutorialScenario();
        return true;
    }
    return false;
}

window.skipTuto = function() {
    const box = document.getElementById('tutoBox');
    box.classList.remove('active');
    window.history.replaceState({}, document.title, "map.html");
    document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
    const searchBox = document.getElementById('searchBox');
    if (searchBox) searchBox.classList.remove('highlight-target');
    tutoStep = 0;
    currentTutoTarget = null;
    map.flyTo([46.6, 2.2], 6, {
        animate: true,
        duration: 2
    });
    if (railsLayer.getLayers().length > 0 && !map.hasLayer(railsLayer)) map.addLayer(railsLayer);
};
// CORRIG� BUG URGENT 4 : Utilisation des traductions tutoriel
function updateTutoBox(title, text, showNext = false) {
    const box = document.getElementById('tutoBox');
    document.getElementById('tutoTitle').innerText = title;
    document.getElementById('tutoText').innerText = text;
    box.classList.add('active');
    const btn = document.getElementById('tutoBtn');
    if (showNext) {
        btn.style.display = 'inline-block';
        btn.innerText = APP_TEXTS.tutorialButtons.next[currentLang];
        btn.onclick = nextTutoStep;
    } else {
        btn.style.display = 'none';
    }
}

window.nextTutoStep = function() {
    if (tutoStep === 1) {
        markersLayer.zoomToShowLayer(currentTutoTarget.marker, () => {
            currentTutoTarget.marker.openPopup();
            setTimeout(() => {
                // Mettre � jour l'�tape affich�e (�tape 2)
                currentTutoDisplayStep = 2;
                updateTutoBox(APP_TEXTS.tuto2.title[currentLang], APP_TEXTS.tuto2.text[currentLang]);
                const btn = document.querySelector(`button[onclick*="lancerAnalyseComplete(${currentTutoTarget.id})"]`);
                if (btn) btn.classList.add('highlight-target');
            }, 1000);
        });
    }
    if (tutoStep === 3) {
        skipTuto();
    }
};

function startTutorialScenario() {
    console.log("SC�NARIO TUTORIEL");
    const target = DATA.gares.find(g => g.nom.includes("Avignon Centre")) || DATA.gares[0];
    if (!target) return;
    currentTutoTarget = target;
    map.setView([46.6, 2.2], 6);
    // Mettre � jour l'�tape affich�e et utiliser currentLang
    currentTutoDisplayStep = 1;
    updateTutoBox(APP_TEXTS.tuto1.title[currentLang], APP_TEXTS.tuto1.text[currentLang], true);
    tutoStep = 1;
}

function checkTutoAdvancement(action) {
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('tuto') !== 'true') return;
    
    if (action === 'analyse' && tutoStep === 1) {
        tutoStep = 2;
        setTimeout(() => {
            // Mettre � jour l'�tape affich�e (�tape 3)
            currentTutoDisplayStep = 3;
            updateTutoBox(APP_TEXTS.tuto3.title[currentLang], APP_TEXTS.tuto3.text[currentLang]);
            const btn = document.querySelector(`button[onclick*="toggleWalkZone(${currentTutoTarget.id})"]`);
            if (btn) btn.classList.add('highlight-target');
        }, 800);
    }
    if (action === 'walk' && tutoStep === 2) {
        tutoStep = 3;
        setTimeout(() => {
            document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
            const searchBox = document.getElementById('searchBox');
            if (searchBox) searchBox.classList.add('highlight-target');
            const btn = document.getElementById('tutoBtn');
            // Mettre � jour l'�tape affich�e (�tape 4)
            currentTutoDisplayStep = 4;
            btn.innerText = APP_TEXTS.tutorialButtons.finish[currentLang];
            btn.style.display = "inline-block";
            btn.onclick = skipTuto;
            updateTutoBox(APP_TEXTS.tuto4.title[currentLang], APP_TEXTS.tuto4.text[currentLang]);
        }, 1500);
    }
}

// ============================================================
// NOUVELLES FONCTIONS API - donn�es �cologiques
// AJOUT� : 02/01/2026
// ============================================================

/**
 * Charge et affiche la qualit� de l'air pour une gare
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} gareId - ID de la gare
 */
async function loadAirQuality(lat, lon, gareId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/air-quality?lat=${lat}&lon=${lon}`);
        const result = await response.json();

        if (result.success && result.data.value !== null) {
            const airData = result.data;

            const container = document.getElementById('ecoDataContainer');

            // Initialise le container vide
            if (!container.dataset.hasData) {
                container.innerHTML = '';
                container.dataset.hasData = 'true';
            }

            // Utilise innerHTML += seulement apr�s avoir vid� au premier chargement
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-top:15px; border-left:4px solid ${airData.color};">
                    <h3 style="color:${airData.color}; margin-top:0;">
                        <i class="fa-solid fa-wind"></i> Qualit� de l'Air
                    </h3>
                    <p style="font-size:1.2rem; font-weight:bold; color:white;">
                        ${airData.quality} - ${airData.value} ${airData.unit}
                    </p>
                    <small style="color:#94a3b8;">Station : ${airData.station}</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erreur chargement qualit� air:', error);
        // UX: Display an error message in the panel if the API call fails.
        const airContainer = document.getElementById(`air-quality-${gareId}`);
        if (airContainer) {
            airContainer.innerHTML = `<p style="color:#ef4444">${APP_TEXTS.ecoPanel.error[currentLang]}</p>`;
        }
    }
}

/**
 * Charge et affiche la biodiversit� locale pour une gare
 * @param {number} lat - Latitude
 * @param {number} lon - Longitude
 * @param {number} gareId - ID de la gare
 */
async function loadBiodiversity(lat, lon, gareId) {
    try {
        const response = await fetch(`${API_BASE_URL}/api/biodiversity?lat=${lat}&lon=${lon}&radius=5`);
        const result = await response.json();

        if (result.success && result.data.count > 0) {
            const bioData = result.data;

            const container = document.getElementById('ecoDataContainer');

            // Initialise le container vide si pas d�j� fait
            if (!container.dataset.hasData) {
                container.innerHTML = '';
                container.dataset.hasData = 'true';
            }

            // Utilisation de innerHTML += pour empiler avec la qualit� de l'air
            let speciesHtml = '';
            bioData.species.forEach(s => {
                if (s.photo) {
                    speciesHtml += `
                        <div style="display:flex; align-items:center; gap:10px; margin-bottom:10px;">
                            <img src="${s.photo}" style="width:60px; height:60px; object-fit:cover; border-radius:8px;">
                            <div>
                                <strong style="color:white;">${s.name}</strong><br>
                                <small style="color:#94a3b8;">${s.scientificName}</small><br>
                                <small>${s.rarity}</small>
                            </div>
                        </div>
                    `;
                }
            });

            const tBio = APP_TEXTS.biodiversity;
            const lang = currentLang;

            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-top:15px; border-left:4px solid #10b981;">
                    <h3 style="color:#10b981; margin-top:0;">
                        <i class="fa-solid fa-seedling"></i> ${tBio.title[lang]}
                    </h3>
                    <p style="color:#cbd5e1; margin-bottom:15px;">
                        <strong>${bioData.count}</strong> ${tBio.species[lang]}
                    </p>
                    ${speciesHtml}
                </div>
            `;

            // Badge hotspot si >30 esp�ces
            if (bioData.count > 30) {
                container.innerHTML += `
                    <div style="background:#10b981; color:white; padding:10px; border-radius:8px; text-align:center; font-weight:bold; margin-top:10px;">
                        ${tBio.hotspot[lang]}
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Erreur chargement biodiversit�:', error);
        // UX: Display an error message in the panel if the API call fails.
        const bioContainer = document.getElementById(`biodiversity-${gareId}`);
        if (bioContainer) {
            bioContainer.innerHTML = `<p style="color:#ef4444">${APP_TEXTS.ecoPanel.error[currentLang]}</p>`;
        }
    }
}

// Fonction pour reset panneau �co quand on clique sur nouvelle gare
function resetEcoPanel() {
    const container = document.getElementById('ecoDataContainer');
    if (container) {
        container.innerHTML = `<p style="color:#94a3b8;">${APP_TEXTS.errors.ecoLoading[currentLang]}</p>`;
        container.dataset.initialized = 'false';
        container.dataset.hasData = 'false';
    }
}

// ============================================================
// NOUVELLES FONCTIONS UI - BOUTONS FEATURES
// AJOUT� : 02/01/2026 pour contr�les des nouvelles fonctionnalit�s
// ============================================================

/**
 * Toggle IGN Relief Layer
 * Bascule entre Google Satellite et carte topographique IGN
 */
let ignLayerActive = false;
let ignReliefLayer = null;
// Google Maps Standard au lieu d'IGN Relief
window.toggleIgnLayer = function() {
    const btn = document.getElementById('btnIgn');

    if (!ignReliefLayer) {
        // Carte Google Maps Standard (pas satellite)
        ignReliefLayer = L.tileLayer(
            'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}', {
                attribution: '� Google Maps',
                maxZoom: 20
            }
        );
    }

    if (!ignLayerActive) {
        map.removeLayer(googleSat);
        map.addLayer(ignReliefLayer);
        btn.classList.add('active');
        ignLayerActive = true;
        // FIX: Use translation from APP_TEXTS for toast message.
        showToast(APP_TEXTS.toast.googleMapsActive[currentLang]);
    } else {
        map.removeLayer(ignReliefLayer);
        map.addLayer(googleSat);
        btn.classList.remove('active');
        ignLayerActive = false;
        // FIX: Use translation from APP_TEXTS for toast message.
        showToast(APP_TEXTS.toast.satelliteActive[currentLang]);
    }
};

/**
 * Open Theme Selector Panel
 * Ouvre le panneau de s�lection des Th�mes visuels
 */
window.openThemeSelector = function() {
    const panel = document.getElementById('themeSelectorPanel');
    panel.classList.toggle('active');
};

// Changement Th�me VISIBLE sur tous les �l�ments
window.applyTheme = function(themeName) {
    const root = document.documentElement;

    // Suppression Th�mes forest, sunset et midnight
    const themes = {
        'default': {
            primary: '#10b981',
            secondary: '#3b82f6',
            bg: '#0f172a',
            bgLight: '#1e293b',
            text: '#ffffff'
        },
        'ocean': {
            primary: '#06b6d4',
            secondary: '#0284c7',
            bg: '#0c4a6e',
            bgLight: '#075985',
            text: '#e0f2fe'
        }
    };

    const theme = themes[themeName] || themes['default'];

    // Application des variables CSS
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--dark', theme.bg);
    root.style.setProperty('--bg-light', theme.bgLight);
    root.style.setProperty('--text-color', theme.text);

    // Changement DIRECT des �l�ments visuels principaux
    const header = document.querySelector('.dashboard-header');
    if (header) {
        header.style.background = `rgba(${hexToRgb(theme.bg)}, 0.95)`;
        header.style.borderColor = `${theme.primary}30`;
    }

    const buttons = document.querySelectorAll('.btn-tool, .btn-analyse, .btn-walk');
    buttons.forEach(btn => {
        if (btn.classList.contains('active')) {
            btn.style.background = theme.primary;
        }
    });

    const statsPanel = document.querySelector('.stats-panel');
    if (statsPanel) {
        statsPanel.style.background = `rgba(${hexToRgb(theme.bg)}, 0.96)`;
        statsPanel.style.borderColor = `${theme.primary}50`;
    }

    const toast = document.getElementById('map-toast');
    if (toast) {
        toast.style.background = theme.bgLight;
        toast.style.borderColor = theme.primary;
    }

    // Th�me Oc�an avec CartoDB Positron au lieu d'ArcGIS
    const mapThemes = {
        'default': googleSat,
        'ocean': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '� OpenStreetMap contributors � CARTO',
            maxZoom: 20,
            subdomains: 'abcd'
        })
    };

    if (!ignLayerActive) {
        map.eachLayer(l => {
            if (l instanceof L.TileLayer && l !== railsLayer) {
                map.removeLayer(l);
            }
        });
        map.addLayer(mapThemes[themeName] || googleSat);
    }

    localStorage.setItem('eco_theme', themeName);
    document.getElementById('themeSelectorPanel').classList.remove('active');
    // FIX: Use translation from APP_TEXTS for the toast message.
    showToast(`?? ${APP_TEXTS.toast.themeApplied[currentLang]}`);
};

// Helper pour conversion hex to RGB
function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ?
        `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}` :
        '15, 23, 42';
}

/**
 * Toggle Eco Panel
 * Affiche/masque le panneau d'informations �cologiques avanc�es
 */
window.toggleEcoPanel = function() {
    const modal = document.getElementById('ecoPanelModal');
    modal.classList.toggle('active');
};

/**
 * Toggle Heatmap
 * Active/d�sactive la carte de chaleur temporelle (placeholder pour impl�mentation future)
 */
let heatmapActive = false;
window.toggleHeatmap = function() {
    const btn = document.getElementById('btnHeatmap');

    // FIX: Suppression de la red�finition inutile - les traductions existent d�j� dans APP_TEXTS.toast (lignes 284-285)

    if (!heatmapActive) {
        btn.classList.add('active');
        heatmapActive = true;
        // FIX: Use translation from APP_TEXTS for toast message.
        showToast(APP_TEXTS.toast.heatmapOn[currentLang]);
    } else {
        btn.classList.remove('active');
        heatmapActive = false;
        // FIX: Use translation from APP_TEXTS for toast message.
        showToast(APP_TEXTS.toast.heatmapOff[currentLang]);
    }
};

// Thème par défaut "co-Vert" (default)
const savedTheme = localStorage.getItem('eco_theme');
if (savedTheme) {
    applyTheme(savedTheme);
} else {
    // Premier chargement : applique Thème co-Vert par défaut
    applyTheme('default');
}

// ============================================================
// EXPOSE FUNCTIONS TO WINDOW FOR ONCLICK HANDLERS
// ============================================================
window.lancerAnalyseComplete = lancerAnalyseComplete;
window.randomGare = randomGare;
window.updateAppLanguage = updateAppLanguage;
window.toggleFavori = toggleFavori;
window.isFavori = isFavori;
window.getFavoris = getFavoris;
window.nextTutoStep = nextTutoStep;
window.skipTuto = skipTuto;
window.openDiscoverModal = openDiscoverModal;
window.closeDiscover = closeDiscover;
window.resetDiscover = resetDiscover;
window.showCategory = showCategory;
window.toggleHeatmap = toggleHeatmap;
window.toggleIgnLayer = toggleIgnLayer;
window.openThemeSelector = openThemeSelector;
window.toggleEcoPanel = toggleEcoPanel;
window.hideWalkZone = hideWalkZone;
// switchLangMap est défini dans map.html (module principal)
// ne pas réassigner ici pour éviter ReferenceError lorsque map.html charge app.js en premier.

// ============================================================
// FIN DU FICHIER
// ============================================================
