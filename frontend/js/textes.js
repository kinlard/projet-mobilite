// ============================================================
// CENTRALIZED TEXT & TRANSLATIONS
// ============================================================

// ===== AVIS INTELLIGENTS =====
export const AVIS_BAD = ["Peu d'équipements.", "Gare isolée.", "Manque de connexions.", "À fuir."];
export const AVIS_MID = ["Gare correcte.", "Quelques équipements.", "Bon pour un départ.", "Pratique mais basique."];
export const AVIS_GOOD = ["Excellente gare !", "Top pour le vélo.", "Super connectée.", "Voyage vert idéal.", "Bien desservie."];

// ===== MAJOR CITIES =====
export const MAJOR_CITIES = [
    "Paris", "Marseille", "Lyon", "Toulouse", "Nice", "Nantes", "Montpellier",
    "Strasbourg", "Bordeaux", "Lille", "Rennes", "Reims", "Saint-Étienne",
    "Toulon", "Le Havre", "Grenoble", "Dijon", "Angers", "Nîmes", "Villeurbanne",
    "Saint-Denis", "Aix-en-Provence", "Clermont-Ferrand", "Le Mans", "Brest",
    "Tours", "Amiens", "Limoges", "Annecy", "Perpignan", "Metz", "Besançon"
];

// ===== FALLBACK IMAGES =====
export const FALLBACK_IMAGES = [
    "https://images.unsplash.com/photo-1500382017468-9049fed747ef?w=500&q=80",
    "https://images.unsplash.com/photo-1472214103451-9374bd1c798e?w=500&q=80",
    "https://images.unsplash.com/photo-1441974231531-c6227db76b6e?w=500&q=80",
    "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=500&q=80",
    "https://images.unsplash.com/photo-1506744038136-46273834b3fb?w=500&q=80"
];

// ===== LOADING PHRASES =====
export const LOADING_PHRASES = [
    "Gonflage des pneus...",
    "Alignement des rails...",
    "Calcul du bilan carbone...",
    "Démarrage machine...",
    "Plantation d'arbres...",
    "Recherche de bornes...",
    "Connexion satellite...",
    "Vérification météo...",
    "Chargement des cartes...",
    "Compostage des octets...",
    "Réchauffement du serveur (mais pas de la planète)...",
    "Arrosage automatique des données...",
    "Dressage des ours polaires virtuels...",
    "Polissage des panneaux solaires...",
    "Tri sélectif des paquets réseau...",
    "Recyclage des anciennes versions du site...",
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
    "Compostage des lignes de code inutiles..."
];

// ===== APP TEXTS (JS_TEXTS from app.js) =====
export const APP_TEXTS = {
    // === TUTORIEL COMPLET (4 TAPES) ===
    tuto1: {
        title: { fr: "🔔 TUTORIEL - étape 1/4", en: "🔔 TUTORIAL - Step 1/4" },
        text: { fr: "Bienvenue sur Eco-Escapade ! Cette carte interactive vous aide à voyager en train de manière écologique. Utilisez la barre de recherche en haut pour trouver une gare, ou cliquez directement sur un marqueur bleu sur la carte pour voir ses informations.", en: "Welcome to Eco-Escapade! This interactive map helps you travel by train in an eco-friendly way. Use the search bar at the top to find a station, or click directly on a blue marker on the map to see its information." }
    },
    tuto2: {
        title: { fr: "📊 ANALYSE - étape 2/4", en: "📊 ANALYSIS - Step 2/4" },
        text: { fr: "Cliquez sur le bouton 'Analyser' dans la popup d'une gare. L'application va calculer automatiquement un score écologique basé sur plusieurs critères : les parkings vélos à proximité (10 minutes à pied), les bornes de recharge électrique IRVE, les options de covoiturage disponibles et l'accessibilité piétonne globale.", en: "Click the 'Analyze' button in a station's popup. The app will automatically calculate an eco-score based on several criteria: nearby bike parkings (10 minutes walking), IRVE electric charging stations, available carpooling options, and overall pedestrian accessibility." }
    },
    tuto3: {
        title: { fr: "🎯 RÉSULTAT - étape 3/4", en: "🎯 RESULT - Step 3/4" },
        text: { fr: "Le score écologique s'affiche sur 10. Un score élevé (8-10) signifie que la gare est excellente pour les déplacements doux et écologiques. Un score moyen (5-7) indique des possibilités correctes. Vous pouvez activer la zone piétonne de 10 minutes pour visualiser tous les services accessibles à pied depuis la gare.", en: "The eco-score is displayed out of 10. A high score (8-10) means the station is excellent for soft mobility and eco-friendly travel. An average score (5-7) indicates decent possibilities. You can activate the 10-minute walking zone to visualize all services accessible on foot from the station." }
    },
    tuto4: {
        title: { fr: "🙌 À VOUS ! - étape 4/4", en: "🙌 YOUR TURN! - Step 4/4" },
        text: { fr: "Vous savez tout maintenant ! Explorez les gares de France, comparez leurs scores écologiques, ajoutez vos gares préférées avec le bouton 💕 favori, et planifiez vos voyages en train de manière écoresponsable. Utilisez le mode statistiques pour voir les meilleures gares du pays. Bon voyage !", en: "You know everything now! Explore French railway stations, compare their eco-scores, add your favorite stations with the 💕 favorite button, and plan your train trips in an eco-responsible way. Use the statistics mode to see the best stations in the country. Have a great journey!" }
    },

    // === BOUTONS TUTORIEL ===
    tutorialButtons: {
        next: { fr: "Suivant ➡️", en: "Next ➡️" },
        prev: { fr: "⬅️ Précédent", en: "⬅️ Previous" },
        finish: { fr: "Terminer ✅", en: "Finish ✅" },
        skip: { fr: "Passer le tutoriel", en: "Skip tutorial" },
        close: { fr: "Fermer", en: "Close" }
    },

    // === POPUPS ET TOASTS ===
    popup: {
        score: { fr: "Score écolo", en: "Eco Score" },
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
        bikesFound: { fr: "Parkings vélos trouvés !", en: "Bike parkings found!" },
        themeApplied: { fr: "Thème appliqué !", en: "Theme applied!" },
        cardCopied: { fr: "Carte copiée !", en: "Card copied!" },
        googleMapsActive: { fr: "Carte Google Maps Standard activée", en: "Google Maps Standard activated" },
        satelliteActive: { fr: "Vue satellite rétablie", en: "Satellite view restored" },
        heatmapOn: { fr: "Carte de chaleur (bientôt disponible)", en: "Heatmap (coming soon)" },
        heatmapOff: { fr: "Carte de chaleur désactivée", en: "Heatmap deactivated" }
    },

    weather: {
        loading: { fr: "Météo...", en: "Weather..." },
        error: { fr: "Météo indisponible", en: "Weather unavailable" }
    },

    // === ANALYSE DÉTAILLÉE ===
    analysis: {
        score: { fr: "Score écolo", en: "Eco Score" },
        bikes: { fr: "Vélos à 10min", en: "Bikes within 10min" },
        irve: { fr: "Recharge électrique", en: "EV Charging" },
        covoit: { fr: "Covoiturage", en: "Carpooling" },
        best: { fr: "La meilleure gare du secteur", en: "Best station in the area" },
        alt: { fr: "Alternative :", en: "Alternative:" },
        go: { fr: "Y aller ➡️", en: "Go there ➡️" },
        zone: { fr: "🚶 Zone 10 min à pied", en: "🚶 10 min Walk Zone" },
        details: { fr: "Détails éco-score", en: "Eco-score details" }
    },

    // NEW: Added missing translations for resetDiscover function
    discover: {
        title: { fr: "Envie de partir quelque part ?", en: "Want to go somewhere?" },
        subtitle: { fr: "Choisissez un environnement, le site trouve pour vous les gares les plus écologiques.", en: "Choose an environment, the site finds the most eco-friendly stations for you." }
    },

    results: {
        loading: { fr: "Chargement en cours...", en: "Loading..." },
        top9: { fr: "Top 9 des gares sélectionnées.", en: "Top 9 selected stations." },
        bikes: { fr: "vélos", en: "bikes" },
        bornes: { fr: "bornes", en: "terminals" },
        go: { fr: "Y aller ➡️", en: "Go there ➡️" }
    },

    categories: {
        mer: { fr: " Plages", en: " Beaches" },
        ocean: { fr: " Océan & Vagues", en: " Ocean & Waves" },
        montagne: { fr: " Montagne & Neige", en: " Mountain & Snow" },
        ville: { fr: " Grandes Métropoles", en: " Major Cities" },
        paris: { fr: " Capitale", en: " Capital" },
        sud: { fr: " ☀️ Le Sud", en: " ☀️ The South" },
        nord: { fr: " Nord", en: " North" }
    },

    location: {
        title: { fr: "Ma position", en: " My location" },
        text: { fr: "Vous êtes localisé ici avec une précision de", en: "You are located here with an accuracy of" },
        meters: { fr: "Mètres", en: "meters" },
        findStation: { fr: "Trouver une gare proche", en: "Find nearby station" }
    },

    // === BOUTONS UI ===
    buttons: {
        random: { fr: "Gare aléatoire", en: "Random station" },
        locate: { fr: "Me localiser", en: "Locate me" },
        stats: { fr: "Statistiques globales", en: "Global statistics" },
        heatmap: { fr: "Carte de chaleur affluence", en: "Crowd heatmap" },
        ignMap: { fr: "Carte Google Maps Standard", en: "Google Maps Standard" },
        themes: { fr: "Changer le Thème", en: "Change theme" },
        ecoInfo: { fr: "Infos écologiques avancées", en: "Advanced ecological info" },
        discover: { fr: "DÉCOUVRIR", en: "DISCOVER" },
        addFavorite: { fr: "Ajouter aux favoris", en: "Add to favorites" },
        removeFavorite: { fr: "Retirer des favoris", en: "Remove from favorites" }
    },

    themes: {
        ecoVert: { fr: "Vert", en: "Green" },
        ocean: { fr: "Océan", en: "Ocean" }
    },

    favs: {
        title: { fr: "💕 Mes Favoris", en: "💕 My Favorites" },
        noFav: { fr: "Aucun favori pour le moment.", en: "No favorites yet." },
        addedOn: { fr: "Ajouté le", en: "Added on" },
        remove: { fr: "Retirer", en: "Remove" },
        goTo: { fr: "Y aller", en: "Go there" }
    },

    ecoPanel: {
        title: { fr: "Informations écologiques avancées", en: "Advanced Ecological Information" },
        defaultText: { fr: "Sélectionnez une gare sur la carte pour voir ses données écologiques détaillées (qualité de l'air, biodiversité, arbres urbains).", en: "Select a station on the map to see its detailed ecological data (air quality, biodiversity, urban trees)." },
        loading: { fr: "Chargement des données écologiques...", en: "Loading ecological data..." },
        error: { fr: "Impossible de charger les données écologiques pour cette zone.", en: "Could not load ecological data for this area." }
    },

    search: {
        placeholder: { fr: "Rechercher une gare...", en: "Search for a station..." }
    },

    counter: {
        stations: { fr: "gares", en: "stations" }
    },

    // Notifications zone piétonne vélos
    veloZone: {
        title: { fr: "Zone piétonne active", en: "Walking zone active" },
        count: { fr: "parkings vélos à 10 min", en: "bike parkings within 10 min" }
    },

    // Toasts favoris
    favoris: {
        added: { fr: "ajouté aux favoris ❤️", en: "added to favorites ❤️" },
        removed: { fr: "retiré des favoris", en: "removed from favorites" }
    },

    // Popups IRVE/Covoit/Vélos
    irvePopup: {
        title: { fr: "Borne électrique", en: "Electric Charging" },
        prises: { fr: "prises", en: "plugs" },
        unknown: { fr: "Prises inconnues", en: "Unknown plugs" },
        access: { fr: "Accès public", en: "Public access" },
        maps: { fr: "Voir sur Google Maps", en: "View on Google Maps" }
    },

    covoitPopup: {
        title: { fr: "Covoiturage", en: "Carpooling" },
        places: { fr: "places", en: "spots" },
        unknown: { fr: "Places inconnues", en: "Unknown spots" },
        type: { fr: "Aire publique", en: "Public area" }
    },

    veloPopup: {
        title: { fr: "Parking vélo", en: "Bike Parking" },
        capacity: { fr: "places", en: "spots" },
        unknown: { fr: "Capacité inconnue", en: "Unknown capacity" },
        covered: { fr: "Couvert", en: "Covered" },
        uncovered: { fr: "Non couvert", en: "Not covered" },
        type: { fr: "Type", en: "Type" },
        commune: { fr: "Commune", en: "City" },
        maps: { fr: "Voir sur Google Maps", en: "View on Google Maps" }
    },

    // Biodiversité
    biodiversity: {
        title: { fr: "Biodiversité Locale", en: "Local Biodiversity" },
        species: { fr: "espèces observées dans un rayon de 5 km", en: "species observed within 5 km" },
        hotspot: { fr: "Hotspot Biodiversité !", en: "Biodiversity Hotspot!" }
    },

    // Erreurs et chargement
    errors: {
        localization: { fr: "Impossible de vous localiser.", en: "Unable to locate you." },
        loading: { fr: "Chargement en cours...", en: "Loading..." },
        unavailable: { fr: "Gare indisponible", en: "Station unavailable" },
        ecoLoading: { fr: "Chargement des données écologiques...", en: "Loading ecological data..." }
    }
};

// ===== HOME TEXTS (translations from index.html) =====
export const HOME_TEXTS = {
    title: { fr: "Voyagez Mieux.", en: "Travel Better." },
    subtitle: { fr: "L'outil idéal pour choisir la gare la plus optimisée écologiquement.", en: "The ideal tool to choose the most ecologically optimized station." },
    cta: { fr: 'COMMENCER <i class="fa-solid fa-arrow-right"></i>', en: 'START <i class="fa-solid fa-arrow-right"></i>' }
};

// ===== NAV TEXTS (translationsMap from map.html) =====
export const NAV_TEXTS = {
    navHome: { fr: "Accueil", en: "Home" },
    navFav: { fr: "Mes favoris", en: "My Favorites" },
    navApropos: { fr: "À propos", en: "About" },
    search: { fr: "Rechercher...", en: "Search..." },
    btnDiscover: { fr: "DÉCOUVRIR", en: "DISCOVER" },
    discTitle: { fr: "Envie de partir quelque part ?", en: "Want to go somewhere?" },
    discSub: { fr: "Choisissez un environnement, le site trouve pour vous les gares les plus écologiques.", en: "Choose an environment, the site finds the most eco-friendly stations for you." },
    btnBack: { fr: "← Choisir un autre environnement", en: "← Choose another environment" },
    catMer: { fr: "Mer Méditerranée", en: "Mediterranean Sea" },
    catOcean: { fr: "Océan Atlantique", en: "Atlantic Ocean" },
    catMontagne: { fr: "Montagne", en: "Mountain" },
    catVille: { fr: "Grandes Métropoles", en: "Major Metropolises" },
    catParis: { fr: "Paris", en: "Paris" },
    catSud: { fr: "Le Sud", en: "The South" },
    catNord: { fr: "Le Nord", en: "The North" },
    catNature: { fr: "Nature", en: "Nature" },
    tutoNext: { fr: "SUIVANT ➡️", en: "NEXT ➡️" },
    tutoSkip: { fr: "Passer le tuto", en: "Skip tutorial" },
    
    // --- NEW STATS & LOADER TRANSLATIONS ---
    loader: { fr: "Chargement de la carte...", en: "Loading map..." },
    statsTitle: { fr: "📊 Tableau de bord national", en: "📊 National Dashboard" },
    lblGares: { fr: "Gares analysées", en: "Analyzed stations" },
    lblScore: { fr: "Score moyen écolo", en: "Avg Eco Score" },
    lblTgv: { fr: "Part TGV", en: "TGV Share" },
    lblVelos: { fr: "Moy. parkings vélos", en: "Avg Bike Parking" },
    lblBornes: { fr: "Moy. bornes IRVE", en: "Avg Charging St." },
    lblCovoit: { fr: "Moy. aires covoit", en: "Avg Carpool Areas" },
    
    // --- NOUVELLES STATS (8 nouvelles) ---
    sectionAnalysis: { fr: "🔍 Analyse des gares", en: "🔍 Station Analysis" },
    sectionTotals: { fr: "📈 Totaux nationaux", en: "📈 National Totals" },
    sectionWeather: { fr: "🌡️ Météo en direct", en: "🌡️ Live Weather" },
    sectionRanking: { fr: "🏆 Classement vélos", en: "🏆 Bike Ranking" },
    lblTotalVelos: { fr: "Parkings vélo", en: "Bike Parkings" },
    lblTotalCovoit: { fr: "Points covoiturage", en: "Carpool Points" },
    lblTotalIrve: { fr: "Bornes IRVE", en: "EV Charging" },
    lblGaresVelo: { fr: "Gares avec vélo (10min)", en: "Stations w/ bike (10min)" },
    lblHottest: { fr: "Plus chaud", en: "Hottest" },
    lblColdest: { fr: "Plus froid", en: "Coldest" },
    lblTopVelo: { fr: "Gare top vélo (10min)", en: "Top bike station (10min)" },
    lblNoVelo: { fr: "Gares sans vélo (10min)", en: "Stations w/o bike (10min)" },
    statsRefresh: { fr: "🔄 Actualisation auto: 30s", en: "🔄 Auto-refresh: 30s" }
};

// ===== DASHBOARD TEXTS (translationsCarnet from carnet.html) =====
export const DASHBOARD_TEXTS = {
    navCarte: { fr: "Carte", en: "Map" }, 
    navAide: { fr: "Aide", en: "Help" },
    navAbout: { fr: "À propos", en: "About" },
    mainTitle: { fr: "Tableau de Bord", en: "Dashboard" }, 
    mainSub: { fr: "Gérez vos futures aventures bas carbone.", en: "Manage your future low-carbon adventures." }, 
    emptyText: { fr: "Aucune donnée.", en: "No data." }, 
    btnScan: { fr: "Scanner la carte", en: "Scan map" }, 
    btnNuke: { fr: "💥 SÉQUENCE D'AUTODESTRUCTION", en: "💥 SELF-DESTRUCT SEQUENCE" }, 
    btnCompare: { fr: "COMPARER", en: "COMPARE" }, 
    onbTitle: { fr: "Bienvenue dans votre carnet de voyage !", en: "Welcome to your travel notebook!" },
    onbSubtitle: { fr: "Découvrez toutes les fonctionnalités de votre tableau de bord", en: "Discover all the features of your dashboard" },
    onbItem1Title: { fr: "Comparez 2 gares", en: "Compare 2 stations" },
    onbItem1Desc: { fr: "Sélectionnez deux favoris pour voir leurs scores côte à côte", en: "Select two favorites to see their scores side by side" },
    onbItem2Title: { fr: "Explorez les villes", en: "Explore cities" },
    onbItem2Desc: { fr: "Accédez aux images Wikipedia pour découvrir chaque destination", en: "Access Wikipedia images to discover each destination" },
    onbItem3Title: { fr: "Générez un QR Code", en: "Generate a QR Code" },
    onbItem3Desc: { fr: "Partagez facilement vos gares préférées via code scannable", en: "Easily share your favorite stations via scannable code" },
    onbItem4Title: { fr: "Visualisez la carte", en: "Visualize the map" },
    onbItem4Desc: { fr: "Voyez tous vos favoris en temps réel sur la mini-carte heatmap", en: "See all your favorites in real time on the mini heatmap" },
    onbItem5Title: { fr: "Gérez vos favoris", en: "Manage your favorites" },
    onbItem5Desc: { fr: "Supprimez individuellement ou lancez une séquence d'autodestruction complète", en: "Delete individually or launch a complete self-destruct sequence" },
    onbBtn: { fr: "Commencer l'exploration !", en: "Start exploring!" },
    googleTitle: { fr: "Images de la ville", en: "City Images" },
    qrTitle: { fr: "Partager", en: "Share" },
    qrText: { fr: "Scannez pour ouvrir Google Maps", en: "Scan to open Google Maps" },
    nukeTitle: { fr: "ATTENTION", en: "WARNING" },
    nukeText: { fr: "Voulez-vous vraiment détruire tout le carnet ?", en: "Do you really want to destroy the entire notebook?" },
    nukeNo: { fr: "Non", en: "No" },
    nukeYes: { fr: "OUI, DETRUIRE", en: "YES, DESTROY" },
    delTitle: { fr: "Supprimer ce favori ?", en: "Delete this favorite?" },
    delText: { fr: "Cette action est irréversible.", en: "This action is irreversible." },
    delNo: { fr: "Annuler", en: "Cancel" },
    delYes: { fr: "Supprimer", en: "Delete" },
    vsTitle: { fr: "COMPARATEUR", en: "COMPARATOR" },
    imgLoad: { fr: "Chargement des images...", en: "Loading images..." },
    imgError: { fr: "Aucune image trouvée.", en: "No image found." },
    conError: { fr: "Erreur de connexion.", en: "Connection error." },
    toastDel: { fr: "Favori supprimé.", en: "Favorite deleted." },
    toastMax: { fr: "Maximum 2 sélections.", en: "Maximum 2 selections." },
    txtGo: { fr: "Y aller", en: "Go there" },
    lblVelos: { fr: "Vélos", en: "Bikes" },
    lblBornes: { fr: "Bornes", en: "Terminals" },
    lblCovoit: { fr: "Covoit", en: "Carpool" }
};