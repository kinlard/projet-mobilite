// ============================================================
// NOM DU FICHIER : frontend/app.js
// MODIFICATIONS : 4 bugs urgents corrigés (Rails, Loader, Zoom, Trad)
// ============================================================
// frontend/app.js
// Logique principale : Carte, Calculs, API, UI
// ============================================================

// ============================================================
// 0. STYLE & CONFIGURATION
// ============================================================

// URL de l'API (Localhost ou Prod)
const API_BASE_URL = (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1')
    ?
'http://localhost:3000'
    : '';

// ============================================================
// 1. INITIALISATION CARTE
// ============================================================
console.log("🚀 Initialisation Eco-Escapade - FIX ZONE PIETONNE");
const map = L.map('map', { zoomControl: false, minZoom: 4, maxZoom: 19 }).setView([46.6, 2.2], 5);
// Layer Satellite/Hybrid pour le look sombre
const googleSat = L.tileLayer('https://mt1.google.com/vt/lyrs=y&x={x}&y={y}&z={z}', { maxZoom: 20 });
map.addLayer(googleSat);

const counterDiv = L.DomUtil.create('div', 'visible-counter');
counterDiv.innerHTML = `<i class="fa-solid fa-eye"></i> <span id="count-val">0</span> gares`;
document.body.appendChild(counterDiv);

const toastDiv = document.createElement('div');
toastDiv.id = 'map-toast';
toastDiv.className = 'map-toast';
toastDiv.innerHTML = `<i class="fa-solid fa-person-walking" style="font-size:1.2rem;"></i> <span id="toast-text">Message</span>`;
document.body.appendChild(toastDiv);

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
    if(t) {
        document.getElementById('toast-text').innerHTML = msg;
        if(isError) t.style.borderColor = '#ef4444';
        else t.style.borderColor = '#334155';
        t.classList.add('active');
        setTimeout(() => t.classList.remove('active'), 4000);
    }
}

// ============================================================
// 2. DONNÉES GLOBALES & LAYERS
// ============================================================
let DATA = { gares: [], bornes: [], covoit: [], velos: [] };
let walkCircle = null;
let GLOBAL_STATS = null;

const createCluster = (cls) => L.markerClusterGroup({
    showCoverageOnHover: false, maxClusterRadius: 60, disableClusteringAtZoom: 16,
    iconCreateFunction: (c) => L.divIcon({ html: `<span>${c.getChildCount()}</span>`, className: `custom-cluster ${cls}`, iconSize: [40, 40] })
});

// Style UNIQUE rouge pour tous les rails + suppression Popup
const railsLayer = L.geoJSON(null, { 
    style: {
        color: "#ef4444",      // Rouge pour tous
        weight: 1.5,           // Épaisseur fixe
        opacity: 0.6,          // Opacité fixe
        dashArray: '4, 4'      // Pointillés
    },
    onEachFeature: function(feature, layer) {
        // Interaction au survol (Popup supprimé demande 1)
        layer.on('mouseover', function(e) {
            var layer = e.target;
            layer.setStyle({ weight: 4, opacity: 1 });
        });
        layer.on('mouseout', function(e) {
            railsLayer.resetStyle(e.target);
        });
    }
});

const markersLayer = createCluster('cluster-gare'); 
const irveLayer = createCluster('cluster-irve');
const covoitLayer = createCluster('cluster-covoit');
const veloParkingLayer = createCluster('cluster-velo');
// === MODIFIÉ : AJOUT CRITIQUE POUR LA ZONE PIÉTONNE ===
const walkLayerGroup = L.layerGroup().addTo(map);
// ======================================================

let osmb = null;

// AVIS INTELLIGENTS
const AVIS_BAD = ["Peu d'équipements.", "Gare isolée.", "Manque de connexions.", "À fuir."];
const AVIS_MID = ["Gare correcte.", "Quelques équipements.", "Bon pour un départ.", "Pratique mais basique."];
const AVIS_GOOD = ["Excellente gare !", "Top pour le vélo.", "Super connectée.", "Voyage vert idéal.", "Bien desservie."];
const MAJOR_CITIES = [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier", 
    "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims", "Saint-Étienne", 
    "Toulon", "Le Havre", "Grenoble", "Dijon", "Angers", "Nîmes", "Villeurbanne",
    "Saint-Denis", "Aix-en-Provence", "Clermont-Ferrand", "Le Mans", "Brest", 
    "Tours", "Amiens", "Limoges", "Annecy", "Perpignan", "Metz", "Besançon"
];
const FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&q=80", 
    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=500&q=80", 
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&q=80", 
    "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&q=80", 
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80"
];

// CORRIGÉ BUG URGENT 2 : Liste complète des messages de chargement
const LOADING_PHRASES = [
  "Gonflage des pneus...",
  "Alignement des rails...",
  "Calcul du bilan carbone...",
  "Démarrage machine...",
  "Plantation d'arbres...",
  "Recherche bornes...",
  "Connexion satellite...",
  "Vérification météo...",
  "Chargement cartes...",
  "Compostage des octets...",
  "Réchauffement du serveur (mais pas de la planète)...",
  "Arrosage automatique des données...",
  "Dressage des ours polaires virtuels...",
  "Polissage des panneaux solaires...",
  "Tri sélectif des paquets réseau...",
  "Recycle les anciennes versions du site...",
  "Capture de CO₂ numérique en cours...",
  "Comptage des abeilles pixelisées...",
  "Nettoyage de l'océan de données...",
  "Calibration des éoliennes virtuelles...",
  "Vérification de l'empreinte carbone de ce clic...",
  "Réintroduction des pandas dans la base de données...",
  "Optimisation de la photosynthèse du design...",
  "Ramassage des déchets dans le cache...",
  "Extinction des lumières inutiles du serveur...",
  "Conversion des cookies en cookies bio...",
  "Plantation de bits dans la forêt de données...",
  "Réglage de la température de la banquise GPU...",
  "Réparation de la couche d'ozone CSS...",
  "Dressage des serveurs pour qu'ils consomment moins...",
  "Réutilisation des blagues déjà recyclées...",
  "Neutralisation carbone de cette barre de chargement...",
  "Réveil des développeurs éco-responsables...",
  "Inspection technique des vélos de livraison de paquets...",
  "Sauvetage des tortues dans le flux réseau...",
  "Chasse au plastique dans les fichiers temporaires...",
  "Vérification du tri des variables globales...",
  "Stockage du surplus d'énergie dans un fichier .green...",
  "Récupération d'eau de pluie pour refroidir le CPU...",
  "Formation des pixels au zéro déchet...",
  "Désactivation des centrales à charbon Java...",
  "Installation de panneaux solaires sur le header...",
  "Compostage des lignes de code inutiles...",
  "Traçage d'un corridor écologique entre deux pages...",
  "Calcul de l'angle optimal du soleil sur le logo...",
  "Protection des espèces rares de bugs...",
  "Rénovation énergétique du HTML existant...",
  "Transport des données en covoiturage...",
  "Filtrage des particules fines dans la base SQL...",
  "Plantation de 14 arbres pour cette requête...",
  "Remplissage des gourdes de la RAM...",
  "Sensibilisation des cookies au RGPD et à la planète...",
  "Réparation des barrières coralliennes du front-end...",
  "Installation de nichoirs à oiseaux dans le footer...",
  "Remplissage des bornes de recharge à données vertes...",
  "Éteindre les volcans de logs trop bavards...",
  "Audit énergétique des animations inutiles...",
  "Préparation d'un monde un peu plus vert..."
];

// CORRIGÉ BUG URGENT 4 : Traductions complètes et ajout des textes manquants
const JS_TEXTS = {
    // === TUTORIEL COMPLET (4 ÉTAPES) ===
    tuto1: { 
        title: { fr: "🎯 TUTORIEL - Étape 1/4", en: "🎯 TUTORIAL - Step 1/4" }, 
        text: { fr: "Bienvenue sur Eco-Escapade ! Cette carte interactive vous aide à voyager en train de manière écologique. Utilisez la barre de recherche en haut pour trouver une gare, ou cliquez directement sur un marqueur bleu sur la carte pour voir ses informations.", en: "Welcome to Eco-Escapade! This interactive map helps you travel by train in an eco-friendly way. Use the search bar at the top to find a station, or click directly on a blue marker on the map to see its information." } 
    },
    tuto2: { 
        title: { fr: "📊 ANALYSE - Étape 2/4", en: "📊 ANALYSIS - Step 2/4" }, 
        text: { fr: "Cliquez sur le bouton 'Analyser' dans la popup d'une gare. L'application va calculer automatiquement un score écologique basé sur plusieurs critères : les parkings vélos à proximité (10 minutes à pied), les bornes de recharge électrique IRVE, les options de covoiturage disponibles et l'accessibilité piétonne globale.", en: "Click the 'Analyze' button in a station's popup. The app will automatically calculate an eco-score based on several criteria: nearby bike parkings (10 minutes walking), IRVE electric charging stations, available carpooling options, and overall pedestrian accessibility." } 
    },
    tuto3: { 
        title: { fr: "🏆 RÉSULTAT - Étape 3/4", en: "🏆 RESULT - Step 3/4" }, 
        text: { fr: "Le score écologique s'affiche sur 10. Un score élevé (8-10) signifie que la gare est excellente pour les déplacements doux et écologiques. Un score moyen (5-7) indique des possibilités correctes. Vous pouvez activer la zone piétonne de 10 minutes pour visualiser tous les services accessibles à pied depuis la gare.", en: "The eco-score is displayed out of 10. A high score (8-10) means the station is excellent for soft mobility and eco-friendly travel. An average score (5-7) indicates decent possibilities. You can activate the 10-minute walking zone to visualize all services accessible on foot from the station." } 
    },
    tuto4: { 
        title: { fr: "✨ À VOUS ! - Étape 4/4", en: "✨ YOUR TURN! - Step 4/4" }, 
        text: { fr: "Vous savez tout maintenant ! Explorez les gares de France, comparez leurs scores écologiques, ajoutez vos gares préférées avec le bouton ❤️ favori, et planifiez vos voyages en train de manière écoresponsable. Utilisez le mode statistiques pour voir les meilleures gares du pays. Bon voyage !", en: "You know everything now! Explore French railway stations, compare their eco-scores, add your favorite stations with the ❤️ favorite button, and plan your train trips in an eco-responsible way. Use the statistics mode to see the best stations in the country. Have a great journey!" } 
    },
    
    // === BOUTONS TUTORIEL ===
    tutorialButtons: {
        next: { fr: "Suivant ➜", en: "Next ➜" },
        prev: { fr: "← Précédent", en: "← Previous" },
        finish: { fr: "Terminer ✓", en: "Finish ✓" },
        skip: { fr: "Passer le tutoriel", en: "Skip tutorial" },
        close: { fr: "Fermer", en: "Close" }
    },
    
    // === POPUPS ET TOASTS ===
    popup: {
        score: { fr: "Score Écolo", en: "Eco Score" },
        analyse: { fr: "Analyser", en: "Analyze" },
        zone: { fr: "Zone 10 min à pied", en: "10 min Walk Zone" },
        champ: { fr: "La meilleure gare du secteur", en: "Best local station" },
        alter: { fr: "Alternative :", en: "Alternative:" },
        analyzing: { fr: "Analyse en cours...", en: "Analyzing..." },
        noEquipment: { fr: "Peu d'équipements.", en: "Few facilities." },
        noConnections: { fr: "Manque de connexions.", en: "Lack of connections." }
    },
    
    toast: {
        zoneActivated: { fr: "Zone 10 min activée", en: "10 min zone activated" },
        zoneDeactivated: { fr: "Zone 10 min désactivée", en: "10 min zone deactivated" },
        bikesFound: { fr: "parkings vélos trouvés !", en: "bike parkings found!" },
        themeApplied: { fr: "Thème appliqué !", en: "Theme applied!" },
        cardCopied: { fr: "Carte copiée !", en: "Card copied!" },
        googleMapsActive: { fr: "Carte Google Maps Standard activée", en: "Google Maps Standard activated" },
        satelliteActive: { fr: "Vue satellite rétablie", en: "Satellite view restored" }
    },
    
    weather: { 
        loading: {fr:"Météo...", en:"Weather..."}, 
        error: {fr:"Météo indisponible", en:"Weather unavailable"} 
    },
    
    // === ANALYSE DÉTAILLÉE ===
    analysis: {
        score: { fr: "Score Écolo", en: "Eco Score" },
        bikes: { fr: "Vélos à 10min", en: "Bikes within 10min" },
        irve: { fr: "Recharge électrique", en: "EV Charging" },
        covoit: { fr: "Covoiturage", en: "Carpooling" },
        best: { fr: "🏆 La meilleure gare du secteur", en: "🏆 Best station in the area" },
        alt: { fr: "💡 Alternative :", en: "💡 Alternative:" },
        go: { fr: "Y aller ➜", en: "Go there ➜" },
        zone: { fr: "🚶 Zone 10 min à pied", en: "🚶 10 min Walk Zone" },
        details: {fr: "Détails éco-score", en: "Eco-score details"}
    },
    
    results: {
        loading: {fr:"Chargement en cours...", en:"Loading..."},
        top9: {fr: "Top 9 des gares sélectionnées.", en: "Top 9 selected stations."},
        bikes: {fr:"vélos", en:"bikes"},
        bornes: {fr:"bornes", en:"terminals"},
        go: {fr:"Y aller ➜", en:"Go there ➜"}
    },
    
    categories: {
        mer: {fr:"🌊 Mer & Plages", en:"🌊 Sea & Beaches"},
        ocean: {fr:"🏄 Océan & Vagues", en:"🏄 Ocean & Waves"},
        montagne: {fr:"🏔️ Montagne & Neige", en:"🏔️ Mountain & Snow"},
        ville: {fr:"🏙️ Grandes Métropoles", en:"🏙️ Major Cities"},
        paris: {fr:"🗼 Capitale", en:"🗼 Capital"},
        sud: {fr:"☀️ Le Sud", en:"☀️ The South"},
        nord: {fr:"🍺 Le Nord", en:"🍺 The North"}
    },
    
    location: {
        title: {fr: "📍 Votre position", en: "📍 Your location"},
        text: {fr: "Vous êtes localisé ici avec une précision de", en: "You are located here with an accuracy of"},
        meters: {fr: "mètres", en: "meters"},
        findStation: {fr: "Trouver une gare proche", en: "Find nearby station"}
    },
    
    // === BOUTONS UI ===
    buttons: {
        random: { fr: "Gare aléatoire", en: "Random station" },
        locate: { fr: "Me localiser", en: "Locate me" },
        stats: { fr: "Statistiques globales", en: "Global statistics" },
        heatmap: {fr: "Carte de chaleur affluence", en: "Crowd heatmap"},
        ignMap: {fr: "Carte Google Maps Standard", en: "Google Maps Standard"},
        themes: {fr: "Changer le thème", en: "Change theme"},
        ecoInfo: {fr: "Infos écologiques avancées", en: "Advanced ecological info"},
        discover: { fr: "DÉCOUVRIR", en: "DISCOVER" },
        addFavorite: { fr: "Ajouter aux favoris", en: "Add to favorites" },
        removeFavorite: { fr: "Retirer des favoris", en: "Remove from favorites" }
    },
    
    themes: {
        ecoVert: {fr: "🌿 Éco-Vert", en: "🌿 Eco-Green"},
        ocean: {fr: "🌊 Océan", en: "🌊 Ocean"},
        midnight: {fr: "🌙 Minuit", en: "🌙 Midnight"}
    },
    
    favs: {
        title: {fr: "❤️ Mes Favoris", en: "❤️ My Favorites"},
        noFav: {fr: "Aucun favori pour le moment.", en: "No favorites yet."},
        addedOn: {fr: "Ajouté le", en: "Added on"},
        remove: {fr: "Retirer", en: "Remove"},
        goTo: {fr: "Y aller", en: "Go there"}
    },
    
    ecoPanel: {
        title: {fr: "🌿 Informations Écologiques Avancées", en: "🌿 Advanced Ecological Information"},
        defaultText: {fr: "Sélectionnez une gare sur la carte pour voir ses données écologiques détaillées (qualité de l'air, biodiversité, arbres urbains).", en: "Select a station on the map to see its detailed ecological data (air quality, biodiversity, urban trees)."},
        loading: {fr: "Chargement des données écologiques...", en: "Loading ecological data..."}
    },
    
    search: {
        placeholder: {fr: "Rechercher une gare...", en: "Search for a station..."}
    },
    
    counter: {
        stations: {fr: "gares", en: "stations"}
    }
};

let currentLang = 'fr';
window.updateAppLanguage = (isFr) => { currentLang = isFr ?
'fr' : 'en'; };

const escapeHTML = (str) => str ?
str.replace(/[&<>'"]/g, tag => ({
    '&': '&', '<': '<', '>': '>', "'": "'", '"': '"'
}[tag])) : '';
// ============================================================
// 3. CHARGEMENT
// ============================================================

/**
 * Charge toutes les données initiales de l'application (Gares, Rails, IRVE, etc.).
 * Gère les promesses parallèles et l'initialisation de la carte.
 * Affiche un loader pendant le chargement et gère les erreurs API via des toasts.
 * @async
 * @returns {Promise<void>}
 */
async function loadEverything() {
    console.log("📥 Début du chargement...");
    const loaderText = document.getElementById('loader-text');
    
    // CORRIGÉ BUG URGENT 2 : Initialisation première phrase drôle aléatoire
    if (loaderText) {
        loaderText.innerText = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
    }
    
    // CORRIGÉ BUG URGENT 2 : Rotation automatique des phrases toutes les 500ms
    const msgInterval = setInterval(() => {
        if (loaderText) {
            const randomPhrase = LOADING_PHRASES[Math.floor(Math.random() * LOADING_PHRASES.length)];
            loaderText.innerText = randomPhrase;
        }
    }, 500); 

    try {
        // === DÉBUT DU CHARGEMENT DES DONNÉES ===
        // Gestion d'erreurs robuste
        const promises = [
            fetch(`${API_BASE_URL}/api/wfs-rails`).then(r => r.json()).catch(e => { console.error("❌ Rails:", e); return null; }),
            fetch(`${API_BASE_URL}/api/gares`).then(r => r.json()).catch(e => { console.error("❌ Gares:", e); showToast("Erreur chargement Gares", true); return []; }),
            fetch(`${API_BASE_URL}/api/irve`).then(r => r.json()).catch(e => { console.error("❌ IRVE:", e); return {features:[]}; }),
            fetch(`${API_BASE_URL}/api/covoiturage`).then(r => r.json()).catch(e => { console.error("❌ Covoit:", e); return {features:[]}; }),
            fetch(`${API_BASE_URL}/api/parking-velo?minLat=41&maxLat=52&minLon=-5&maxLon=10`).then(r => r.json()).catch(e => { console.error("❌ Vélos:", e); return {features:[]}; })
        ];
        const [rails, gares, irve, covoit, velos] = await Promise.all(promises);

        if(rails) railsLayer.addData(rails);
        
        DATA.gares = gares;
        DATA.velos = (velos.features||[]).map(f=>({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}));
        DATA.bornes = (irve.features||[]).map(f=>({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}));
DATA.covoit = (covoit.features||[]).map(f=>({lat:f.geometry.coordinates[1],lon:f.geometry.coordinates[0]}));

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
        
        // CORRIGÉ BUG URGENT 2 : Arrêt de la rotation avant masquage du loader
        clearInterval(msgInterval);
        
} catch (error) { 
    console.error("Erreur critique chargement:", error); 
    showToast("Erreur critique de chargement", true);
    // CORRIGÉ BUG URGENT 2 : Arrêt rotation en cas d'erreur
    clearInterval(msgInterval);
    if (loaderText) {
        loaderText.innerText = 'Erreur de chargement...';
    }
} 
    finally {
        console.log("✅ Chargement terminé.");
        // === MASQUAGE DU LOADER ===
        setTimeout(() => {
            const loader = document.getElementById('map-loader');
            if(loader) { loader.style.opacity = '0'; setTimeout(() => loader.remove(), 800); }
            
            if(!checkTutorialMode()) {
                if (!checkUrlActions()) {
                
    map.flyTo([46.6, 2.2], 6, { animate: true, duration: 2.5 });
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
        const mask = [[[-180, 90], [180, 90], [180, -90], [-180, -90]]];
        d.geometry.coordinates.forEach(p => mask.push(p[0]));
L.geoJSON({ type: "Feature", geometry: { type: "Polygon", coordinates: mask } }, {
            style: { color: '#0f172a', weight: 1, fillColor: '#020617', fillOpacity: 0.75, interactive: false }
        }).addTo(map);
} catch (e) {}
}

function initMapMarkers() {
    const dl = document.getElementById('gares-list');
    if(dl) dl.innerHTML = '';
DATA.gares.forEach(g => {
        if(g.lat) {
            if(dl) { let o=document.createElement('option'); o.value=g.nom; dl.appendChild(o); }
            
            let isTGV = g.type === 'TGV';
            // Calcul score pour couleur pulsation (sans afficher le score)
            const analysis = analyser(g);
            const score = analysis.note;
            const pulseColor = score >= 8 ? '#10b981' : score >= 5 ? '#f59e0b' : '#ef4444';
            const pulseSpeed = score >= 8 ? '1.5s' : score >= 7 ? '2s' : '2.5s';

            // Icône originale avec pulsation dynamique
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
                iconSize: [30,30],
                iconAnchor:[15,30]
            });
            
            let m = L.marker([g.lat,g.lon], {icon:icon});
     
       m.bindPopup(() => generatePopupContent(g));
            m.on('popupopen', () => {
                // Reset panneau avant chargement nouvelles données
                resetEcoPanel();
                
                loadPhoto(g.nom, g.id);
                loadWeather(g.lat, g.lon, g.id);
                // Chargement qualité air
                loadAirQuality(g.lat, g.lon, g.id);
                // Chargement biodiversité
                loadBiodiversity(g.lat, g.lon, g.id);
            });
            g.marker = m; 
            markersLayer.addLayer(m);
  
      }
    });
    updateCount();
}

/**
 * Génère le contenu HTML du popup pour une gare donnée.
 * Inclut le score, l'avis, et les boutons d'action.
 * @param {Object} g - L'objet gare contenant nom, id, type, lat, lon.
 * @returns {string} Chaîne HTML du popup.
 */
function generatePopupContent(g) {
    const analysis = analyser(g);
    const score = analysis.note;
let avisList = score < 4 ? AVIS_BAD : score < 7 ? AVIS_MID : AVIS_GOOD;
let avis = avisList[Math.floor(Math.random() * avisList.length)];
    let colorScore = score < 4 ? '#ef4444' : score < 7 ?
'#f59e0b' : '#10b981';
    let isTGV = g.type === 'TGV';
    const t = JS_TEXTS.popup;
    const lang = currentLang;
const safeNom = escapeHTML(g.nom);

    return `
        <div style="font-family:'Inter',sans-serif;">
            <div class="photo-container"><img id="photo-${g.id}" class="city-photo" src="" alt="${safeNom}"></div>
            <div id="weather-${g.id}" class="weather-box">
                <span><i class="fa-solid fa-spinner fa-spin"></i> ${JS_TEXTS.weather.loading[lang]}</span>
            </div>
            <div style="padding:15px;">
          
                <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:10px;">
                    <div><h3 style="margin:0; font-size:1.2rem; color:#0f172a;">${safeNom}</h3><span style="background:${isTGV?'#3b82f6':'#10b981'}; color:white; padding:3px 8px; border-radius:4px; font-size:11px; font-weight:bold;">${g.type}</span></div>
                    <i id="fav-${g.id}" onclick="toggleFavori(${g.id}, '${safeNom.replace(/'/g, "\\'")}', '${g.type}')" class="fa-solid fa-heart fav-btn ${isFavori(g.id)?'fav-active':'fav-inactive'}"></i>
                </div>
               
 <div style="background:#f8fafc; padding:10px; border-radius:8px; margin-bottom:15px; font-style:italic; font-size:0.9rem; color:#475569; border-left: 3px solid ${colorScore};">" ${avis} "</div>
                <div id="action-container-${g.id}">
                    <button class="btn-analyse" onclick="event.stopPropagation();
lancerAnalyseComplete(${g.id})" style="width:100%; background:#0f172a; color:white; border:none; padding:12px; border-radius:8px; cursor:pointer; font-weight:bold; margin-bottom:5px;">${t.analyse[lang]}</button>
                    <button class="btn-walk" onclick="event.stopPropagation();
toggleWalkZone(${g.id}, ${g.lat}, ${g.lon}, '${safeNom.replace(/'/g, "\\'")}')"><i class="fa-solid fa-person-walking"></i> ${t.zone[lang]}</button>
                </div>
            </div>
        </div>`;
}

async function loadWeather(lat, lon, id) {
    const el = document.getElementById(`weather-${id}`);
    if(!el) return;
    try {
        const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current_weather=true`);
        const d = await r.json();
        const w = d.current_weather || d.current; 
 
       if(w) {
             el.innerHTML = `
                <div class="weather-item"><i class="fa-solid fa-temperature-half weather-icon"></i> ${w.temperature}°C</div>
                <div class="weather-item"><i class="fa-solid fa-wind weather-icon"></i> ${w.windspeed} km/h</div>
            `;
        } else { throw new Error('No Data'); }
    } catch(e) {
        // Utilisation de JS_TEXTS pour l'erreur
       el.innerHTML = `<span style="font-size:0.8rem;
color:#64748b;">${JS_TEXTS.weather.error[currentLang]}</span>`;
       console.error(`Météo err ${id}:`, e.message);
    }
}

// Refonte complète des popups IRVE & Covoiturage
function initSecondaryMarkers(irve, covoit, velos) {
    const iBuf=[], cBuf=[], vBuf=[];
    
    // Bornes IRVE
    (irve.features||[]).forEach(f=>{ 
        if(f.geometry.coordinates){
            const props = f.properties || {};
            const nom = props.nom_amenageur || props.n_enseigne || "Borne de recharge";
            const prise = props.nbre_pdc ? `${props.nbre_pdc} prises` : "Prises inconnues";
            const puissance = props.puissance_nominale ? `${props.puissance_nominale} kW` : "";
            const acces = props.acces_recharge || "Accès public";
            
            let h = `
            <div style="font-family:'Inter',sans-serif; width:250px;">
                <div class="simple-popup-header header-irve"><i class="fa-solid fa-charging-station"></i> Borne Électrique</div>
                <div class="simple-popup-body">
                    <div style="font-weight:bold; color:#0f172a; margin-bottom:10px;">${nom}</div>
                    <div><i class="fa-solid fa-plug" style="color:#f59e0b"></i> ${prise} ${puissance ? '• ' + puissance : ''}</div>
                    <div><i class="fa-solid fa-unlock" style="color:#64748b"></i> ${acces}</div>
                    <a href="https://www.google.com/maps/search/?api=1&query=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" target="_blank" class="btn-maps"><i class="fa-solid fa-map-location-dot"></i> Voir sur Google Maps</a>
                </div>
            </div>`;
            iBuf.push(L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{icon:L.divIcon({className:'c',html:`<div class="marker-pin irve"><i class="fa-solid fa-plug" style="color:black"></i></div>`,iconSize:[30,30]})}).bindPopup(h)); 
        }
    });

    // Covoiturage
    (covoit.features||[]).forEach(f=>{ 
        if(f.geometry.coordinates){
            const props = f.properties || {};
            const nom = props.nom_aire || props.ville || "Aire de covoiturage";
            const places = props.nb_places ? `${props.nb_places} places` : "Places inconnues";
            const type = props.type_aire || "Aire publique";
            
            let h = `
            <div style="font-family:'Inter',sans-serif; width:250px;">
                <div class="simple-popup-header header-covoit"><i class="fa-solid fa-car"></i> Covoiturage</div>
                <div class="simple-popup-body">
                    <div style="font-weight:bold; color:#0f172a; margin-bottom:10px;">${nom}</div>
                    <div><i class="fa-solid fa-square-parking" style="color:#a855f7"></i> ${places}</div>
                    <div><i class="fa-solid fa-road" style="color:#64748b"></i> ${type}</div>
                    <a href="https://www.google.com/maps/search/?api=1&query=${f.geometry.coordinates[1]},${f.geometry.coordinates[0]}" target="_blank" class="btn-maps"><i class="fa-solid fa-map-location-dot"></i> Voir sur Google Maps</a>
                </div>
            </div>`;
            cBuf.push(L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{icon:L.divIcon({className:'c',html:`<div class="marker-pin covoit"><i class="fa-solid fa-car" style="color:black"></i></div>`,iconSize:[30,30]})}).bindPopup(h));
        }
    });

    // Vélos (inchangé sauf si besoin de style)
    (velos.features||[]).forEach(f=>{ if(f.geometry.coordinates){ vBuf.push(L.marker([f.geometry.coordinates[1],f.geometry.coordinates[0]],{icon:L.divIcon({className:'c',html:`<div class="marker-pin velo"><i class="fa-solid fa-bicycle"></i></div>`,iconSize:[30,30]})})); }});
    
    irveLayer.addLayers(iBuf); covoitLayer.addLayers(cBuf); veloParkingLayer.addLayers(vBuf);
}

function setupSearchListeners() {
    const sInput = document.getElementById('search-input');
if(sInput) {
        sInput.addEventListener('focus', () => { if (tutoStep === 3) skipTuto(); });
sInput.addEventListener('change', (e) => {
            const g = DATA.gares.find(x => x.nom === e.target.value);
            if(g) goToGare(g.id);
            if (tutoStep === 3) skipTuto(); 
        });
}
}

// Refonte Popup Localisation Found
map.on('locationfound', (e) => {
    map.eachLayer((layer) => { if(layer.options && layer.options.icon && layer.options.icon.options.className === 'user-pin-icon') map.removeLayer(layer); });
    const userIcon = L.divIcon({ className: 'user-pin-icon', html: '<div class="user-pin"></div>', iconSize: [20, 20] });
    
    const t = JS_TEXTS.location;
    const lang = currentLang;
    
    const popupContent = `
        <div class="location-popup">
            <div class="location-header">${t.title[lang]}</div>
            <div class="location-body">
                <i class="fa-solid fa-street-view" style="font-size:2rem; margin-bottom:10px; display:block;"></i>
                <p style="margin:0 0 10px 0;">${t.text[lang]} <b>${Math.round(e.accuracy)} ${t.meters[lang]}</b>.</p>
                <small style="color:#64748b;">${e.latlng.lat.toFixed(4)}, ${e.latlng.lng.toFixed(4)}</small>
                <button class="location-btn" onclick="window.findNearbyStation(${e.latlng.lat}, ${e.latlng.lng})">
                    <i class="fa-solid fa-magnifying-glass-location"></i> ${t.findStation[lang]}
                </button>
            </div>
        </div>
    `;

    L.marker(e.latlng, { icon: userIcon }).addTo(map).bindPopup(popupContent).openPopup();
    L.circle(e.latlng, { radius: e.accuracy / 2, color: '#3b82f6', fillOpacity: 0.1, weight: 1 }).addTo(map);
});
map.on('locationerror', () => alert("Impossible de vous localiser."));

window.randomGare = () => { if(DATA.gares.length) goToGare(DATA.gares[Math.floor(Math.random()*DATA.gares.length)].id); };
window.goToGare = (id) => {
    const g = DATA.gares.find(x => x.id === id);
if(g) markersLayer.zoomToShowLayer(g.marker, () => g.marker.openPopup());
};

// Nouvelle fonction pour la recherche proche
window.findNearbyStation = (lat, lon) => {
    if(!DATA.gares.length) return;
    // Tri par distance simple
    const sorted = [...DATA.gares].sort((a, b) => getDist(lat, lon, a.lat, a.lon) - getDist(lat, lon, b.lat, b.lon));
    const closest = sorted[0];
    if(closest) {
        map.flyTo([closest.lat, closest.lon], 13);
        setTimeout(() => {
            markersLayer.zoomToShowLayer(closest.marker, () => {
                closest.marker.openPopup();
            });
        }, 1500);
    }
};

/**
 * Active l'affichage de la zone piétonne (10 min) autour d'une gare.
 * Calcule un cercle approximatif et compte les parkings vélos à l'intérieur.
 * Déclenche une animation "flyTo" et met à jour le toast d'information.
 * @param {number} id - L'identifiant de la gare cible.
 */
// CORRIGÉ BUG URGENT 1 : Fix rails qui buguent avec zone piétonne (Signature et Logique)
window.toggleWalkZone = function(id, lat, lon, gareName) {
    const btn = document.querySelector('.btn-walk'); // Note: Ceci suppose un seul bouton actif, à ajuster si plusieurs
    
    // Récupérer la gare si pas de lat/lon passés (compatibilité ancienne signature)
    let gLat = lat, gLon = lon, gName = gareName;
    if (typeof id === 'number' && !lat) {
        const g = DATA.gares.find(x => x.id === id);
        if(!g) return;
        gLat = g.lat; gLon = g.lon; gName = g.nom;
    }

    if (!walkCircle) { // walkCircle variable globale existante
        // Création cercle 10 min (800m)
        walkCircle = L.circle([gLat, gLon], {
            radius: 800,
            color: '#10b981',
            fillColor: '#10b981',
            fillOpacity: 0.15,
            weight: 3,
            dashArray: '10, 10'
        }).addTo(walkLayerGroup); // Ajout au layerGroup
        
        btn.classList.add('active');
        btn.style.background = 'var(--primary)';
        
        // AJOUTÉ : Force le layer rails à rester au-dessus du cercle
        if (railsLayer && map.hasLayer(railsLayer)) {
            // Supprime temporairement le layer
            map.removeLayer(railsLayer);
            // Ajoute à nouveau (force recalcul des coordonnées)
            setTimeout(() => {
                map.addLayer(railsLayer);
                railsLayer.bringToFront();
            }, 5);
        }
        
        // AJOUTÉ : Event listener pour recalculer position rails au zoom/déplacement
        walkCircle._railsFixHandler = function() {
            if (railsLayer && map.hasLayer(railsLayer)) {
                // Force le redessinage du layer rails
                map.removeLayer(railsLayer);
                setTimeout(() => {
                    map.addLayer(railsLayer);
                    railsLayer.bringToFront();
                }, 10);
            }
        };
        
        // Attache les événements
        map.on('zoomend moveend', walkCircle._railsFixHandler);
        
        map.flyTo([gLat, gLon], 15, { duration: 1.5 });
        
        // Comptage vélos
        let count = 0;
        const latMin = gLat - 0.02, latMax = gLat + 0.02;
        const lonMin = gLon - 0.02, lonMax = gLon + 0.02;
        DATA.velos.forEach(v => { 
            if(v.lat >= latMin && v.lat <= latMax && v.lon >= lonMin && v.lon <= lonMax) {
                if(getDist(gLat, gLon, v.lat, v.lon) <= 0.8) count++; 
            }
        });
        
        checkTutoAdvancement('walk');
        
        // CORRIGÉ BUG URGENT 4 : Traduction toast
        showToast(`${JS_TEXTS.toast.zoneActivated[currentLang]} (${count} ${JS_TEXTS.results.bikes[currentLang]})`);

    } else {
        // Suppression zone
        map.removeLayer(walkCircle);
        
        // AJOUTÉ : Nettoyage des event listeners
        if (walkCircle._railsFixHandler) {
            map.off('zoomend moveend', walkCircle._railsFixHandler);
        }
        
        walkCircle = null;
        btn.classList.remove('active');
        btn.style.background = '';
        
        // AJOUTÉ : Restaure le layer rails proprement
        if (railsLayer && map.hasLayer(railsLayer)) {
            map.removeLayer(railsLayer);
            setTimeout(() => {
                map.addLayer(railsLayer);
            }, 5);
        }
        
        showToast(JS_TEXTS.toast.zoneDeactivated[currentLang]);
    }
};

window.isFavori = (id) => (JSON.parse(localStorage.getItem('eco_favoris'))||[]).some(f=>f.id===id);
window.toggleFavori = (id, nom, type) => {
    let favs = JSON.parse(localStorage.getItem('eco_favoris'))||[];
const idx = favs.findIndex(f=>f.id===id);
    const btn = document.getElementById(`fav-${id}`);
    if(idx>-1) { 
        favs.splice(idx,1);
if(btn) btn.className='fa-solid fa-heart fav-btn fav-inactive';
    } else {
        const g = DATA.gares.find(x=>x.id===id);
const an = analyser(g);
        favs.push({id, nom, type, date: new Date().toLocaleDateString(), score: an.note, details: an.details});
        if(btn) btn.className='fa-solid fa-heart fav-btn fav-active';
}
    localStorage.setItem('eco_favoris', JSON.stringify(favs));
};

// Optimisation updateCount
function updateCount() {
    if(!map.hasLayer(markersLayer)) return;
    
    // Optimisation : Utilise getBounds une seule fois
    const bounds = map.getBounds();
    let count = 0;
    
    // Optimisation : Évite la boucle si pas de gares
    if(!DATA.gares || DATA.gares.length === 0) {
        document.getElementById('count-val').innerText = 0;
        return;
    }
    
    // Optimisation : Break early si on atteint un seuil
    const maxDisplay = 999;
    for(let g of DATA.gares) {
        if(bounds.contains([g.lat, g.lon])) {
            count++;
            if(count > maxDisplay) {
                document.getElementById('count-val').innerText = '999+';
                return;
            }
        }
    }
    
    document.getElementById('count-val').innerText = count;
}
// Debounce updateCount pour performance
map.on('moveend', debounce(() => { 
    updateCount(); 
}, 150)); // Attend 150ms après arrêt du mouvement

async function loadPhoto(nom, id) {
    const img = document.getElementById(`photo-${id}`);
    if(!img) return;
    img.src = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mN88B8AAsUB4ZtVv0AAAAAASUVORK5CYII='; 
    img.style.opacity = '0.5';
const cleanCity = nom.replace("Gare de ", "").split(" ")[0].trim();
    try {
        const r = await fetch(`https://fr.wikipedia.org/w/api.php?action=query&titles=${cleanCity}&prop=pageimages&format=json&pithumbsize=400&origin=*`);
const d = await r.json();
        const pages = d.query.pages;
        const pid = Object.keys(pages)[0];
if(pid !== "-1" && pages[pid].thumbnail) {
            img.src = pages[pid].thumbnail.source;
} else {
            throw new Error();
}
    } catch(e) {
        img.src = FALLBACK_IMAGES[id % FALLBACK_IMAGES.length];
        // Log discret en cas d'erreur image
        console.warn("Photo fallback:", id);
}
    img.onload = () => { img.style.opacity = '1'; img.classList.add('loaded'); };
}

function getDist(lat1, lon1, lat2, lon2) {
    var p = 0.017453292519943295;
    var c = Math.cos;
var a = 0.5 - c((lat2 - lat1) * p)/2 + c(lat1 * p) * c(lat2 * p) * (1 - c((lon2 - lon1) * p))/2;
return 12742 * Math.asin(Math.sqrt(a));
}

// === MODIFIÉ : OPTIMISATION CRITIQUE DES PERFORMANCES ===

/**
 * Analyse une gare pour calculer son score écologique.
 * Comptabilise les vélos (800m), bornes IRVE (3km) et covoiturage (3km).
 * @param {Object} g - L'objet gare à analyser.
 * @returns {Object} Un objet contenant la note (/10), les détails des compteurs et le total.
 */
function analyser(g) {
    let d = {bornes:0, covoit:0, velos:0};
// Optimisation : Bounding Box (environ +/- 0.05 degrés, soit ~5km)
    const latMin = g.lat - 0.05, latMax = g.lat + 0.05;
const lonMin = g.lon - 0.05, lonMax = g.lon + 0.05;
const fastFilter = (p) => p.lat >= latMin && p.lat <= latMax && p.lon >= lonMin && p.lon <= lonMax;
DATA.velos.forEach(v => { 
        if(fastFilter(v) && getDist(g.lat, g.lon, v.lat, v.lon) <= 0.8) d.velos++; 
    });
DATA.bornes.forEach(b => { 
        if(fastFilter(b) && getDist(g.lat, g.lon, b.lat, b.lon) <= 3) d.bornes++; 
    });
DATA.covoit.forEach(c => { 
        if(fastFilter(c) && getDist(g.lat, g.lon, c.lat, c.lon) <= 3) d.covoit++; 
    });
let s = (g.type==='TGV'?1:0) + Math.min(d.velos*1, 7) + Math.min(d.bornes*0.5, 2) + Math.min(d.covoit*0.5, 1);
return { note: Math.min(Math.round(s*10)/10, 10), details: d, total: d.velos+d.bornes+d.covoit };
}
// ========================================================

function preComputeScoresSync() {
    for (let i = 0; i < DATA.gares.length; i++) {
        const g = DATA.gares[i];
        g.tags = [];
        
        if(g.lat < 45.7) g.tags.push('sud');
        if(g.lat > 49.0) g.tags.push('nord'); // Ajout Nord
        
        // Paris spécifique
        if(getDist(g.lat, g.lon, 48.8566, 2.3522) < 20) g.tags.push('paris');

        const isAlpes = (g.lon > 5.5 && g.lat < 46.2 && g.lat > 44.0);
        const isPyrenees = (g.lat < 43.2 && g.lon < 3.0);
        if(isAlpes || isPyrenees) g.tags.push('montagne');

        // Séparation Mer / Océan
        const isMed = (g.lat < 43.7 && g.lon > 3.0);
        const isAtlantique = (g.lon < -1.0 && g.lat < 48.0);
        const isManche = (g.lat > 48.5 && g.lon < -1.5);
        
        if(isMed) g.tags.push('mer');
        if(isAtlantique || isManche) g.tags.push('ocean');

        const cleanName = g.nom.replace(/Gare de\s?/i, '').trim();
        if(MAJOR_CITIES.some(city => cleanName.includes(city))) g.tags.push('ville');
    }
}

/**
 * Lance une analyse comparative complète pour une gare.
 * Compare avec les gares environnantes pour trouver une meilleure alternative.
 * Met à jour l'interface utilisateur avec les scores détaillés et les barres de progression.
 * @param {number} id - L'identifiant de la gare à analyser.
 */
window.lancerAnalyseComplete = function(id) {
    const g = DATA.gares.find(x => x.id === id);
    const s = analyser(g);
    let best = null; let bestS = s.note; let bestTotal = s.total;
    // Optimisation boucle comparative
    const latMin = g.lat - 0.2, latMax = g.lat + 0.2;
    const lonMin = g.lon - 0.2, lonMax = g.lon + 0.2;
    DATA.gares.forEach(v => {
        if(v.id !== id && v.lat >= latMin && v.lat <= latMax && v.lon >= lonMin && v.lon <= lonMax) {
            let dist = getDist(g.lat, g.lon, v.lat, v.lon);
            if(dist <= 10) {
                let sv = analyser(v);
                if(sv.note > bestS) 
                { bestS = sv.note; bestTotal = sv.total; best = v; } 
                else if (sv.note === bestS && sv.total > bestTotal) { bestS = sv.note; bestTotal = sv.total; best = v; }
            }
        }
    });

    // Utilisation complète de JS_TEXTS.analysis pour la traduction dynamique
    const t = JS_TEXTS.analysis;
    const lang = currentLang;

    const pctV = Math.min((s.details.velos/5)*100,100); 
    const pctB = Math.min((s.details.bornes/6)*100,100);
    const pctC = Math.min((s.details.covoit/2)*100,100);
    const color = s.note>=7?'#059669':s.note>=4?'#d97706':'#dc2626';

    let html = `
        <div class="analyse-container">
            <div style="display:flex; justify-content:space-between; margin-bottom:10px;">
                <span>${t.score[lang]}</span><span style="font-weight:900; color:${color}">${s.note}/10</span>
            </div>
            <div class="stat-row"><i class="fa-solid fa-bicycle" style="width:25px; color:#0891b2;"></i> <span style="flex:1">${t.bikes[lang]}</span> <b>${s.details.velos}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctV}%; background:#0891b2;"></div></div></div>
            <div class="stat-row"><i class="fa-solid fa-plug" style="width:25px; 
            color:#d97706;"></i> <span style="flex:1">${t.irve[lang]}</span> <b>${s.details.bornes}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctB}%; background:#d97706;"></div></div></div>
            <div class="stat-row"><i class="fa-solid fa-car" style="width:25px; color:#9333ea;"></i> <span style="flex:1">${t.covoit[lang]}</span> <b>${s.details.covoit}</b><div class="progress-bg"><div class="progress-fill" style="width:${pctC}%;
            background:#9333ea;"></div></div></div>
    `;
    
    if(best) {
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
    
    // CORRIGÉ BUG URGENT 4 : Appel avec tous les arguments pour toggleWalkZone
    html += `<button class="btn-walk" onclick="event.stopPropagation(); toggleWalkZone(${id}, ${g.lat}, ${g.lon}, '${escapeHTML(g.nom.replace(/'/g, "\\'"))}')"><i class="fa-solid fa-person-walking"></i> ${t.zone[lang]}</button>`;
    html += `</div>`;
    document.getElementById(`action-container-${id}`).innerHTML = html;

    // Déclenchement confettis si score excellent
    if (s.note >= 9) {
        confetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#10b981', '#22c55e', '#84cc16', '#a3e635']
        });
        
        // Double explosion pour score parfait 10/10
        if (s.note === 10) {
            setTimeout(() => {
                confetti({
                    particleCount: 200,
                    angle: 60,
                    spread: 55,
                    origin: { x: 0 }
                });
                confetti({
                    particleCount: 200,
                    angle: 120,
                    spread: 55,
                    origin: { x: 1 }
                });
            }, 250);
        }
    }

    checkTutoAdvancement('analyse');
};

const overlays = { "🚂 Gares": markersLayer, "🛤️ Rails": railsLayer, "⚡ Bornes": irveLayer, "🚗 Covoit": covoitLayer, "🚲 Vélos": veloParkingLayer };
L.control.layers(null, overlays, { position: 'bottomright' }).addTo(map);
L.control.scale({ imperial: false }).addTo(map);
try { new L.Control.MiniMap(L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}'), { toggleDisplay: true, position: 'bottomleft' }).addTo(map);
} catch(e){}
map.on('zoomend', () => { if (map.getZoom() >= 15 && !osmb) osmb = new OSMBuildings(map).load('https://{s}.data.osmbuildings.org/0.2/anonymous/tile/{z}/{x}/{y}.json'); });

// CORRIGÉ BUG URGENT 3 : Icônes gares adaptées par niveau de zoom (Zoom sémantique)
map.on('zoomend', function() {
    const zoom = map.getZoom();
    
    if (zoom < 8) {
        // Vue France : Seulement TGV + rails simplifiés
        railsLayer.setStyle({ weight: 1.5, opacity: 0.5 });
        irveLayer.remove();
        covoitLayer.remove();
        veloParkingLayer.remove();
        
        // Taille normale gares
        DATA.gares.forEach(g => {
            if (g.marker) {
                const icon = g.marker.getIcon();
                icon.options.iconSize = [30, 30];
                icon.options.iconAnchor = [15, 30];
                g.marker.setIcon(icon);
            }
        });
        
    } else if (zoom >= 8 && zoom < 12) {
        // Vue régionale : TGV + TER + rails normaux
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        railsLayer.setStyle({ weight: 2, opacity: 0.6 });
        irveLayer.remove();
        covoitLayer.remove();
        veloParkingLayer.remove();
        
        // Taille normale gares
        DATA.gares.forEach(g => {
            if (g.marker) {
                const icon = g.marker.getIcon();
                icon.options.iconSize = [30, 30];
                icon.options.iconAnchor = [15, 30];
                g.marker.setIcon(icon);
            }
        });
        
    } else if (zoom >= 12 && zoom < 14) {
        // Vue locale : Tout afficher + Gares moyennes
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        railsLayer.setStyle({ weight: 3, opacity: 0.7 });
        if (!map.hasLayer(irveLayer)) map.addLayer(irveLayer);
        if (!map.hasLayer(covoitLayer)) map.addLayer(covoitLayer);
        if (!map.hasLayer(veloParkingLayer)) map.addLayer(veloParkingLayer);
        
        DATA.gares.forEach(g => {
            if (g.marker) {
                const icon = g.marker.getIcon();
                icon.options.iconSize = [40, 40];
                icon.options.iconAnchor = [20, 20];
                g.marker.setIcon(icon);
            }
        });
    } else if (zoom >= 14) {
        // AJOUTÉ BUG 3 : Vue ultra-zoomée : gares TRÈS GROSSES (55px)
        if (!map.hasLayer(railsLayer)) map.addLayer(railsLayer);
        railsLayer.setStyle({ weight: 4, opacity: 0.8 });
        if (!map.hasLayer(irveLayer)) map.addLayer(irveLayer);
        if (!map.hasLayer(covoitLayer)) map.addLayer(covoitLayer);
        if (!map.hasLayer(veloParkingLayer)) map.addLayer(veloParkingLayer);
        
        DATA.gares.forEach(g => {
            if (g.marker) {
                const icon = g.marker.getIcon();
                icon.options.iconSize = [55, 55]; // 40 -> 55
                icon.options.iconAnchor = [27, 27];
                g.marker.setIcon(icon);
            }
        });
    }
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
    
    // MODIFIÉ : Ignore le titre passé en paramètre et utilise la traduction via l'ID category
    const tCats = JS_TEXTS.categories;
    const tRes = JS_TEXTS.results;
    const lang = currentLang;
    
    document.getElementById('discoverTitle').innerText = tCats[category] ? tCats[category][lang] : titleArg;
    document.getElementById('discoverSubtitle').innerText = tRes.top9[lang];

    if(!DATA.gares[0].computedScore) {
        DATA.gares.forEach(g => {
            const an = analyser(g);
            g.computedScore = an.note;
            g.computedDetails = an.details;
        });
    }

    let candidates = DATA.gares.filter(g => g.tags && g.tags.includes(category));
    candidates.sort((a,b) => b.computedScore - a.computedScore);
    const top9 = candidates.slice(0, 9);
    const container = document.getElementById('resultsContainer');
    container.innerHTML = '';
    
    if(top9.length === 0) {
        container.innerHTML = `<div style="color:white; grid-column:span 3;">${tRes.loading[lang]}</div>`;
    } else {
        top9.forEach((g, idx) => {
            const cleanName = g.nom.split(' ')[0].replace(/-/g, '');
            const imgUrl = `https://loremflickr.com/400/200/${cleanName},city/all?lock=${g.id}`;
            const html = `
                <div class="result-card rank-${idx+1}" style="overflow:hidden;">
                    <div 
style="height:120px; background:url('${imgUrl}') center/cover no-repeat; position:relative;">
                        <div class="rank-badge">#${idx+1}</div>
                        <div class="street-view-btn" onclick="window.open('https://www.google.com/maps/search/?api=1&query=Gare+$$$${encodeURIComponent(g.nom)}', '_blank'); event.stopPropagation();"><i class="fa-solid fa-street-view"></i></div>
                    </div>
                    <div 
style="padding:15px;">
                        <h3 style="color:white; margin:0 0 5px 0;">${escapeHTML(g.nom)}</h3>
                        <div style="font-weight:900; color:#10b981; font-size:1.5rem;
margin-bottom:10px;">${g.computedScore}/10</div>
                        <div style="font-size:0.85rem;
color:#94a3b8; margin-bottom:15px;">
                            <i class="fa-solid fa-bicycle"></i> ${g.computedDetails.velos} ${tRes.bikes[lang]} • 
                            <i class="fa-solid fa-plug"></i> ${g.computedDetails.bornes} ${tRes.bornes[lang]}
                        </div>
         
               <button onclick="goToGare(${g.id}); closeDiscover();" style="background:var(--primary); border:none;
padding:10px; width:100%; border-radius:6px; font-weight:bold; cursor:pointer; color:#022c22;">${tRes.go[lang]}</button>
                    </div>
                </div>`;
            container.innerHTML += html;
        });
    }
};

window.resetDiscover = () => {
    document.getElementById('catGrid').style.display = 'grid';
    document.getElementById('resultsContainer').style.display = 'none';
document.getElementById('btnBackCat').style.display = 'none';
    document.getElementById('discoverTitle').innerText = "Envie de partir où ?";
    document.getElementById('discoverSubtitle').innerText = "Choisissez une ambiance.";
};
function startBackgroundAnalysis() {
    let index = 0; const chunkSize = 100;
function processChunk() {
        const end = Math.min(index + chunkSize, DATA.gares.length);
for (let i = index; i < end; i++) {
            const g = DATA.gares[i];
const analysis = analyser(g);
            g.computedScore = analysis.note;
            g.computedDetails = analysis.details;
if(g.computedDetails.velos > 2 && getDist(g.lat, g.lon, 48.8566, 2.3522) > 50) g.tags.push('nature');
}
        index += chunkSize;
        if (index < DATA.gares.length) requestAnimationFrame(processChunk);
else { const btn = document.querySelector('.btn-discover'); if(btn) btn.style.opacity = '1'; }
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
DATA.gares.forEach(g => {
        if (!g.computedScore || !g.computedDetails) return;
        n++;
        totalScore += g.computedScore;
        if (g.type === 'TGV') tgvCount++;
        sumVelos += g.computedDetails.velos;
        sumBornes += g.computedDetails.bornes;
        sumCovoit += g.computedDetails.covoit;
    });
if (n === 0) return null;
    return {
        gares: n,
        scoreMoyen: (totalScore / n).toFixed(1),
        partTGV: Math.round((tgvCount / n) * 100) + '%',
        moyVelos: (sumVelos / n).toFixed(1),
        moyBornes: (sumBornes / n).toFixed(1),
        moyCovoit: (sumCovoit / n).toFixed(1),
    };
}

const statsPanel = document.getElementById('statsPanel');
const btnStats = document.getElementById('btnStats');
const btnStatsClose = document.getElementById('closeStats');
function refreshStatsPanel() {
    if (!GLOBAL_STATS) return;
    document.getElementById('stat-gares').innerText = GLOBAL_STATS.gares;
    document.getElementById('stat-score').innerText = GLOBAL_STATS.scoreMoyen + '/10';
    document.getElementById('stat-tgv').innerText = GLOBAL_STATS.partTGV;
document.getElementById('stat-velos').innerText = GLOBAL_STATS.moyVelos;
    document.getElementById('stat-bornes').innerText = GLOBAL_STATS.moyBornes;
    document.getElementById('stat-covoit').innerText = GLOBAL_STATS.moyCovoit;
}
if (btnStats && statsPanel) {
    btnStats.addEventListener('click', () => { refreshStatsPanel(); statsPanel.classList.add('active'); });
}
if (btnStatsClose && statsPanel) {
    btnStatsClose.addEventListener('click', () => { statsPanel.classList.remove('active'); });
}

let tutoStep = 0;
let currentTutoTarget = null;
function checkTutorialMode() {
    const urlParams = new URLSearchParams(window.location.search);
if(urlParams.get('tuto') === 'true') {
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
    if(searchBox) searchBox.classList.remove('highlight-target');
    tutoStep = 0;
    currentTutoTarget = null;
map.flyTo([46.6, 2.2], 6, { animate: true, duration: 2 });
    if(railsLayer.getLayers().length > 0 && !map.hasLayer(railsLayer)) map.addLayer(railsLayer);
};
// CORRIGÉ BUG URGENT 4 : Utilisation des traductions tutoriel
function updateTutoBox(title, text, showNext = false) {
    const box = document.getElementById('tutoBox');
    document.getElementById('tutoTitle').innerText = title;
    document.getElementById('tutoText').innerText = text;
box.classList.add('active');
    const btn = document.getElementById('tutoBtn');
    if(showNext) {
        btn.style.display = 'inline-block';
        btn.innerText = JS_TEXTS.tutorialButtons.next[currentLang];
        btn.onclick = nextTutoStep;
    } else {
        btn.style.display = 'none';
    }
}

window.nextTutoStep = function() {
    if(tutoStep === 1) {
        markersLayer.zoomToShowLayer(currentTutoTarget.marker, () => {
            currentTutoTarget.marker.openPopup();
            setTimeout(() => {
                const lang = currentLang;
 
               updateTutoBox(JS_TEXTS.tuto2.title[lang], JS_TEXTS.tuto2.text[lang]);
                const btn = document.querySelector(`button[onclick*="lancerAnalyseComplete(${currentTutoTarget.id})"]`);
                if(btn) btn.classList.add('highlight-target');
            }, 1000);
        });
    }
    if(tutoStep === 3) { skipTuto(); }
};

function startTutorialScenario() {
    console.log("🎬 DÉBUT SCÉNARIO TUTORIEL");
    const 
target = DATA.gares.find(g => g.nom.includes("Avignon Centre")) || DATA.gares[0];
    if(!target) return;
    currentTutoTarget = target;
    map.setView([46.6, 2.2], 6);
const lang = currentLang;
    updateTutoBox(JS_TEXTS.tuto1.title[lang], JS_TEXTS.tuto1.text[lang], true);
    tutoStep = 1;
}

function checkTutoAdvancement(action) {
    const urlParams = new URLSearchParams(window.location.search);
    if(urlParams.get('tuto') !== 'true') return;
    const lang = currentLang;
if(action === 'analyse' && tutoStep === 1) {
        tutoStep = 2;
setTimeout(() => {
            updateTutoBox(JS_TEXTS.tuto3.title[lang], JS_TEXTS.tuto3.text[lang]);
            const btnWalk = document.querySelector(`button[onclick*="toggleWalkZone(${currentTutoTarget.id})"]`);
            if(btnWalk) btnWalk.classList.add('highlight-target');
        }, 800);
}
    if(action === 'walk' && tutoStep === 2) {
        tutoStep = 3;
setTimeout(() => {
            document.querySelectorAll('.highlight-target').forEach(el => el.classList.remove('highlight-target'));
            const searchBox = document.getElementById('searchBox');
            if(searchBox) searchBox.classList.add('highlight-target');
            const btn = document.getElementById('tutoBtn');
            btn.innerText = JS_TEXTS.tutorialButtons.finish[lang];
            btn.style.display = "inline-block";
            btn.onclick 
= skipTuto;
            updateTutoBox(JS_TEXTS.tuto4.title[lang], JS_TEXTS.tuto4.text[lang]);
        }, 1500);
}
}

// ============================================================
// NOUVELLES FONCTIONS API - DONNÉES ÉCOLOGIQUES
// AJOUTÉ : 02/01/2026
// ============================================================

/**
 * Charge et affiche la qualité de l'air pour une gare
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
            
            // Utilise += seulement APRÈS avoir vidé au premier chargement
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-top:15px; border-left:4px solid ${airData.color};">
                    <h3 style="color:${airData.color}; margin-top:0;">
                        <i class="fa-solid fa-wind"></i> Qualité de l'Air
                    </h3>
                    <p style="font-size:1.2rem; font-weight:bold; color:white;">
                        ${airData.quality} - ${airData.value} ${airData.unit}
                    </p>
                    <small style="color:#94a3b8;">Station : ${airData.station}</small>
                </div>
            `;
        }
    } catch (error) {
        console.error('Erreur chargement qualité air:', error);
    }
}

/**
 * Charge et affiche la biodiversité locale pour une gare
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
            
            // Initialise le container vide si pas déjà fait
            if (!container.dataset.hasData) {
                container.innerHTML = '';
                container.dataset.hasData = 'true';
            }
            
            // Utilisation de innerHTML += pour empiler avec la qualité de l'air
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
            
            container.innerHTML += `
                <div style="background:rgba(255,255,255,0.05); padding:15px; border-radius:10px; margin-top:15px; border-left:4px solid #10b981;">
                    <h3 style="color:#10b981; margin-top:0;">
                        <i class="fa-solid fa-seedling"></i> Biodiversité Locale
                    </h3>
                    <p style="color:#cbd5e1; margin-bottom:15px;">
                        <strong>${bioData.count}</strong> espèces observées dans un rayon de 5 km
                    </p>
                    ${speciesHtml}
                </div>
            `;
            
            // Badge hotspot si >30 espèces
            if (bioData.count > 30) {
                container.innerHTML += `
                    <div style="background:#10b981; color:white; padding:10px; border-radius:8px; text-align:center; font-weight:bold; margin-top:10px;">
                        🌿 Hotspot Biodiversité !
                    </div>
                `;
            }
        }
    } catch (error) {
        console.error('Erreur chargement biodiversité:', error);
    }
}

// Fonction pour reset panneau éco quand on clique sur nouvelle gare
function resetEcoPanel() {
    const container = document.getElementById('ecoDataContainer');
    if (container) {
        container.innerHTML = '<p style="color:#94a3b8;">Chargement des données écologiques...</p>';
        container.dataset.initialized = 'false';
        container.dataset.hasData = 'false';
    }
}

// ============================================================
// NOUVELLES FONCTIONS UI - BOUTONS FEATURES
// AJOUTÉ : 02/01/2026 pour contrôles des nouvelles fonctionnalités
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
            'https://mt1.google.com/vt/lyrs=m&x={x}&y={y}&z={z}',
            {
                attribution: '© Google Maps',
                maxZoom: 20
            }
        );
    }
    
    if (!ignLayerActive) {
        map.removeLayer(googleSat);
        map.addLayer(ignReliefLayer);
        btn.classList.add('active');
        ignLayerActive = true;
        showToast('Carte Google Maps Standard activée');
    } else {
        map.removeLayer(ignReliefLayer);
        map.addLayer(googleSat);
        btn.classList.remove('active');
        ignLayerActive = false;
        showToast('Vue satellite rétablie');
    }
};

/**
 * Open Theme Selector Panel
 * Ouvre le panneau de sélection des thèmes visuels
 */
window.openThemeSelector = function() {
    const panel = document.getElementById('themeSelectorPanel');
    panel.classList.toggle('active');
};

// Changement thème VISIBLE sur tous les éléments
window.applyTheme = function(themeName) {
    const root = document.documentElement;
    
    // Suppression thèmes forest et sunset
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
        },
        'midnight': { 
            primary: '#8b5cf6', 
            secondary: '#6366f1', 
            bg: '#1e1b4b',
            bgLight: '#312e81',
            text: '#ede9fe'
        }
    };
    
    const theme = themes[themeName] || themes['default'];
    
    // Application des variables CSS
    root.style.setProperty('--primary', theme.primary);
    root.style.setProperty('--secondary', theme.secondary);
    root.style.setProperty('--dark', theme.bg);
    root.style.setProperty('--bg-light', theme.bgLight);
    root.style.setProperty('--text-color', theme.text);
    
    // Changement DIRECT des éléments visuels principaux
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
    
    // Thème Océan avec CartoDB Positron au lieu d'ArcGIS
    const mapThemes = {
        'default': googleSat,
        'ocean': L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 20,
            subdomains: 'abcd'
        }),
        'midnight': L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
            attribution: '© OpenStreetMap contributors © CARTO',
            maxZoom: 20
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
    showToast(`✨ Thème <b>${themeName}</b> appliqué !`);
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
 * Affiche/masque le panneau d'informations écologiques avancées
 */
window.toggleEcoPanel = function() {
    const modal = document.getElementById('ecoPanelModal');
    modal.classList.toggle('active');
};

/**
 * Toggle Heatmap
 * Active/désactive la carte de chaleur temporelle (placeholder pour implémentation future)
 */
let heatmapActive = false;
window.toggleHeatmap = function() {
    const btn = document.getElementById('btnHeatmap');
    
    if (!heatmapActive) {
        btn.classList.add('active');
        heatmapActive = true;
        showToast('Heatmap temporelle (à implémenter prochainement)');
    } else {
        btn.classList.remove('active');
        heatmapActive = false;
        showToast('Heatmap désactivée');
    }
};

// Thème par défaut "Éco-Vert" (default)
const savedTheme = localStorage.getItem('eco_theme');
if (savedTheme) {
    applyTheme(savedTheme);
} else {
    // Premier chargement : applique thème Éco-Vert par défaut
    applyTheme('default');
}

// ============================================================
// FIN DU FICHIER
// ============================================================