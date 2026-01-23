// ===================================================================================================
// SERVEUR BACKEND TOURISME VERT - API REST pour le calcul d'éco-scores des gares françaises
// ===================================================================================================
// Ce serveur Node.js fournit toutes les données nécessaires au frontend pour évaluer la mobilité verte
// autour des gares ferroviaires : vélos, bornes électriques, covoiturage, qualité de l'air, biodiversité

// Chargement des variables d'environnement depuis le fichier .env (clés API, port serveur)
require('dotenv').config({ path: require('path').join(__dirname, '.env') });

// Import des modules Node.js nécessaires au fonctionnement du serveur
const express = require('express');     // Framework web pour créer l'API REST
const cors = require('cors');           // Autorisation des requêtes cross-origin depuis le frontend
const axios = require('axios');         // Client HTTP pour interroger les APIs externes
const fs = require('fs');               // Système de fichiers pour charger les données de secours
const path = require('path');           // Manipulation des chemins de fichiers
const NodeCache = require('node-cache'); // Système de cache mémoire pour optimiser les performances

// Initialisation de l'application Express
const app = express();

// Configuration du port d'écoute (par défaut 3000 si non spécifié dans .env)
const port = process.env.PORT || 3000;

// ===================================================================================================
// CONFIGURATION DU CACHE ET DES MIDDLEWARES
// ===================================================================================================

// Mise en cache des réponses API pour éviter de surcharger les serveurs externes
// stdTTL: 3600 secondes (1 heure) = durée de vie par défaut des données en cache
// Permet de réduire drastiquement le nombre d'appels aux APIs tierces
const apiCache = new NodeCache({ stdTTL: 3600 });

// Activation du CORS (Cross-Origin Resource Sharing) pour autoriser les requêtes depuis n'importe quel domaine
// Nécessaire pour que le frontend (qui tourne sur un port différent en dev) puisse communiquer avec le backend
app.use(cors());

// Middleware pour parser automatiquement le JSON dans le corps des requêtes POST
app.use(express.json());

// ===================================================================================================
// CHARGEMENT DES DONNÉES DE SECOURS POUR LES PARKINGS VÉLOS
// ===================================================================================================
// En cas de défaillance de l'API OpenDataSoft, un fichier GeoJSON local est utilisé comme fallback
// Ce fichier contient une copie statique des emplacements de parkings vélos sur le territoire français

// Initialisation d'une collection GeoJSON vide par défaut
let veloDataCache = { type: "FeatureCollection", features: [] };

try {
    // Construction du chemin absolu vers le fichier de secours velo.geojson
    const filePath = path.join(__dirname, 'velo.geojson');
    
    // Vérification de l'existence du fichier avant tentative de lecture
    if (fs.existsSync(filePath)) {
        // Lecture synchrone du fichier et parsing JSON en mémoire
        veloDataCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`🚲 Fichier vélo de secours chargé : ${veloDataCache.features.length} points`);
    }
} catch (e) { 
    // Si le fichier est absent ou corrompu, on continue avec la collection vide
    console.warn("⚠️ Fichier velo.geojson introuvable");
}

// ===================================================================================================
// ROUTE : /api/gares - Liste complète des gares ferroviaires françaises
// ===================================================================================================
// Récupère toutes les gares depuis l'API SNCF Open Data et les transforme en format exploitable
// par le frontend pour affichage sur la carte interactive

app.get('/api/gares', async (req, res) => {
    try {
        // Interrogation de l'API SNCF pour obtenir le dataset complet des gares de voyageurs
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json'
        );
        
        // Validation du format de réponse (doit être un tableau d'objets)
        if (!Array.isArray(r.data)) throw new Error('Format API invalide');

        // Transformation des données brutes SNCF en format simplifié pour le frontend
        const d = r.data
            .map((g, i) => ({
                id: i,  // Identifiant unique numérique séquentiel pour chaque gare
                nom: g.nom || 'Gare Inconnue',  // Nom de la gare avec fallback si absent
                lat: g.position_geographique?.lat,  // Latitude GPS (optionnel avec ?)
                lon: g.position_geographique?.lon,  // Longitude GPS (optionnel avec ?)
                // Détection du type de gare basée sur la présence de "TGV" dans le nom
                type: g.nom && g.nom.includes('TGV') ? 'TGV' : 'TER'
            }))
            // Filtrage : conservation uniquement des gares avec coordonnées GPS valides
            .filter((g) => g.lat && g.lon);

        // Renvoi du tableau JSON des gares transformées
        res.json(d);
    } catch (e) {
        // En cas d'erreur (API indisponible, timeout, etc.), renvoyer un tableau vide
        console.error('❌ Erreur API Gares:', e.message);
        res.json([]);
    }
});

// ===================================================================================================
// ROUTE : /api/wfs-rails - Tracé géographique des lignes ferroviaires
// ===================================================================================================
// Récupère les formes géométriques (LineString) des lignes du Réseau Ferré National (RFN)
// Permet d'afficher le tracé des voies ferrées sur la carte pour contextualiser les gares

app.get('/api/wfs-rails', async (req, res) => {
    try {
        // Téléchargement du dataset GeoJSON des formes de lignes ferroviaires
        const r = await axios.get(
            'https://ressources.data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/download/?format=geojson&timezone=Europe/Berlin&lang=fr'
        );
        
        // Renvoi direct du GeoJSON (format standardisé pour données géographiques)
        res.json(r.data);
    } catch (e) {
        // En cas d'erreur, renvoyer une FeatureCollection GeoJSON vide pour éviter les crashs frontend
        console.error('❌ Erreur API Rails:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

// ===================================================================================================
// ROUTE : /api/irve - Emplacements des bornes de recharge électrique
// ===================================================================================================
// IRVE = Infrastructure de Recharge pour Véhicules Électriques
// Récupère les positions des bornes depuis OpenStreetMap France pour évaluer l'accessibilité électrique

app.get('/api/irve', async (req, res) => {
    try {
        // Permettre un réglage du volume IRVE pour limiter la charge (par défaut 8000)
        const requestedLimit = parseInt(req.query.limit, 10);
        const irveLimit = Number.isFinite(requestedLimit)
            ? Math.min(Math.max(requestedLimit, 1000), 20000) // borne min/max
            : 8000;

        // Interrogation de l'API OpenDataSoft avec limite ajustable
        const r = await axios.get(
            `https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-charging-station/exports/geojson?limit=${irveLimit}`
        );
        
        // Renvoi du GeoJSON contenant les points de recharge
        res.json(r.data);
    } catch (e) {
        // Fallback sur collection vide si l'API est indisponible
        console.error('❌ Erreur API IRVE:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

// ===================================================================================================
// ROUTE : /api/covoiturage - Emplacements des aires de covoiturage
// ===================================================================================================
// Récupère les parkings dédiés au covoiturage pour évaluer les possibilités de mobilité partagée
// Critère important pour l'éco-score des gares (dernier kilomètre sans voiture individuelle)

app.get('/api/covoiturage', async (req, res) => {
    try {
        // Interrogation de l'API OpenDataSoft avec limite de 5000 aires (couverture suffisante)
        const r = await axios.get(
            'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/aires-covoiturage/exports/geojson?limit=5000'
        );
        
        // Renvoi du GeoJSON des aires de covoiturage
        res.json(r.data);
    } catch (e) {
        // Collection vide en cas d'échec pour maintenir la stabilité du frontend
        console.error('❌ Erreur API Covoiturage:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

// ===================================================================================================
// ROUTE : /api/parking-velo - Parkings vélos dans une zone géographique donnée
// ===================================================================================================
// Système intelligent avec double fallback : API en ligne → fichier local → collection vide
// Paramètres : minLat, maxLat, minLon, maxLon (définissent la bounding box de recherche)

app.get('/api/parking-velo', async (req, res) => {
    // Extraction des coordonnées de la zone géographique depuis les paramètres de requête
    const { minLat, maxLat, minLon, maxLon } = req.query;

    // Validation : si les coordonnées sont incomplètes, renvoyer une collection vide
    if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.json({ type: 'FeatureCollection', features: [] });
    }

    // TENTATIVE 1 : Récupération depuis l'API OpenDataSoft (source primaire)
    try {
        // URL de l'API avec limit=-1 pour obtenir TOUS les parkings (dataset complet)
        const url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-bicycle-parking/exports/geojson?limit=-1';
        
        console.log('🔄 Tentative récupération API vélos...');
        // Requête avec timeout de 60 secondes (augmenté pour charger tous les vélos)
        const r = await axios.get(url, { timeout: 60000 });
        const data = r.data;

        // Extraction du tableau de features depuis la FeatureCollection
        const all = Array.isArray(data.features) ? data.features : [];

        // Filtrage géographique : conservation uniquement des parkings dans la bounding box demandée
        const resList = all.filter((f) => {
            // Vérification de l'existence de la géométrie et des coordonnées
            if (!f.geometry || !f.geometry.coordinates) return false;
            const c = f.geometry.coordinates;  // [longitude, latitude] au format GeoJSON
            
            // Test d'inclusion dans le rectangle géographique défini
            return (
                c[1] >= parseFloat(minLat) &&   // Latitude minimum
                c[1] <= parseFloat(maxLat) &&   // Latitude maximum
                c[0] >= parseFloat(minLon) &&   // Longitude minimum
                c[0] <= parseFloat(maxLon)      // Longitude maximum
            );
        });

        // Limitation à 15000 points maximum pour charger tous les vélos
        // Si plus de 15000 points, on applique un échantillonnage régulier (1 point sur N)
        const final = resList.length > 15000
            ? resList.filter((_, i) => i % Math.ceil(resList.length / 15000) === 0)
            : resList;

        console.log(`✅ API vélos OK : ${final.length} points renvoyés`);
        return res.json({ type: 'FeatureCollection', features: final });

    } catch (apiError) {
        // TENTATIVE 2 : Basculement sur le fichier de secours local (fallback)
        console.warn('⚠️ API vélos échouée, basculement sur fichier local...');
        
        // Vérification de la disponibilité du fichier de secours chargé au démarrage
        if (veloDataCache.features.length > 0) {
            // Application du même filtrage géographique sur les données locales
            const resList = veloDataCache.features.filter(f => {
                if (!f.geometry || !f.geometry.coordinates) return false;
                const c = f.geometry.coordinates;
                return (
                    c[1] >= parseFloat(minLat) &&
                    c[1] <= parseFloat(maxLat) &&
                    c[0] >= parseFloat(minLon) &&
                    c[0] <= parseFloat(maxLon)
                );
            });

            // Même limitation à 15000 points pour cohérence avec le cas API
            const final = resList.length > 15000
                ? resList.filter((_, i) => i % Math.ceil(resList.length / 15000) === 0)
                : resList;

            console.log(`🗂️ Fichier local utilisé : ${final.length} points`);
            return res.json({ type: 'FeatureCollection', features: final });
        }

        // TENTATIVE 3 : Si aucune source n'est disponible, renvoyer une collection vide
        console.error('❌ Aucune source vélo disponible');
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

// ===================================================================================================
// ROUTE : /api/air-quality - Qualité de l'air à proximité d'une position GPS
// ===================================================================================================
// Interroge l'API OpenAQ pour obtenir les données de pollution atmosphérique
// Renvoie une note sur 10 basée sur l'intensité de la surveillance (indicateur indirect de pollution)
// Paramètres : lat (latitude), lon (longitude)

app.get('/api/air-quality', async (req, res) => {
    // Extraction des coordonnées GPS depuis les paramètres de requête
    const { lat, lon } = req.query;
    
    // Validation : latitude et longitude obligatoires
    if (!lat || !lon) {
        return res.json({ success: false, error: 'Missing lat/lon' });
    }
    
    // Création d'une clé unique pour le cache basée sur les coordonnées
    const cacheKey = `air_${lat}_${lon}`;
    
    // Vérification du cache : si les données existent déjà, les renvoyer immédiatement
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache air-quality utilisé');
        return res.json(cached);
    }
    
    try {
        // Rayon de recherche : 25 km autour de la position (25000 mètres)
        const radius = 25000;
        let response;
        
        try {
            // Interrogation de l'API OpenAQ v3 pour trouver les stations de mesure à proximité
            response = await axios.get(
                `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=${radius}&limit=5`,
                {
                    headers: {
                        // Clé API depuis les variables d'environnement (ou chaîne vide si absente)
                        'X-API-Key': process.env.OPENAQ_API_KEY || ''
                    },
                    timeout: 10000  // Timeout de 10 secondes pour éviter les blocages
                }
            );
        } catch (apiErr) {
            // Si l'API OpenAQ est indisponible, renvoyer une estimation par défaut optimiste
            console.log('⚠️ OpenAQ API non disponible, estimation par défaut');
            const fallback = {
                success: true,
                data: { 
                    note: 7,                    // Note moyenne positive (zones rurales/vertes)
                    quality: 'Bon', 
                    color: '#10b981',           // Couleur verte pour affichage visuel
                    station: 'Estimation',      // Indique qu'il s'agit d'une valeur estimée
                    parameter: 'fallback' 
                }
            };
            // Mise en cache de l'estimation pour 1 heure
            apiCache.set(cacheKey, fallback, 3600);
            return res.json(fallback);
        }
        
        // Extraction des données de la réponse API
        const data = response.data || {};
        
        // Si des stations de mesure ont été trouvées à proximité
        if (data.results && data.results.length > 0) {
            // Variables pour stocker la meilleure station trouvée
            let bestStation = null;
            let bestSensor = null;
            
            // Parcours de toutes les stations de mesure trouvées à proximité
            for (const station of data.results) {
                // Vérification de la présence de capteurs actifs dans la station
                if (station.sensors && station.sensors.length > 0) {
                    // Priorité aux polluants les plus significatifs pour la santé :
                    // PM2.5 et PM10 (particules fines), O3 (ozone), NO2 (dioxyde d'azote)
                    const priorityParams = ['pm25', 'pm10', 'o3', 'no2'];
                    
                    // Recherche du premier capteur mesurant un polluant prioritaire
                    for (const paramName of priorityParams) {
                        const sensor = station.sensors.find(s => 
                            s.parameter?.name === paramName || 
                            (s.name && s.name.toLowerCase().includes(paramName))
                        );
                        
                        // Dès qu'un capteur prioritaire est trouvé, on conserve cette station
                        if (sensor) {
                            bestStation = station;
                            bestSensor = sensor;
                            break;  // Sortie de la boucle des paramètres
                        }
                    }
                    // Si un capteur a été trouvé, inutile de chercher dans les autres stations
                    if (bestSensor) break;
                }
            }
            
            // ===============================================================================
            // ALGORITHME DE NOTATION DE LA QUALITÉ DE L'AIR
            // ===============================================================================
            // Stratégie : plus une zone est surveillée (nombreux capteurs), plus elle est
            // probablement polluée (zones urbaines, industrielles). Inversement, peu de
            // capteurs suggère une zone rurale/verte avec meilleure qualité de l'air.
            
            // Initialisation des variables de notation
            let note = 7;           // Note par défaut (bonne qualité)
            let quality = 'Bon';    // Label textuel de la qualité
            let color = '#10b981';  // Couleur d'affichage (vert par défaut)
            
            // Récupération du type de paramètre mesuré (pm25, pm10, o3, no2, etc.)
            let paramType = (bestSensor && bestSensor.parameter && bestSensor.parameter.name) || 'estimated';
            
            if (!bestSensor) {
                // CAS 1 : Aucun capteur prioritaire trouvé dans les stations proches
                // Les zones rurales et vertes ont généralement une meilleure qualité d'air
                note = 7;
                quality = 'Bon';
                color = '#10b981';  // Vert émeraude
                console.log(`⚠️ Pas de capteur trouvé, estimation: ${note}/10`);
            } else {
                // CAS 2 : Capteur trouvé, notation basée sur l'intensité de surveillance
                // Comptage du nombre total de capteurs dans la meilleure station
                const sensorCount = bestStation.sensors?.length || 0;
                
                if (sensorCount <= 2) {
                    // Peu de capteurs = zone peu surveillée = probablement peu polluée
                    note = 8;
                    quality = 'Très bon';
                    color = '#10b981';  // Vert émeraude
                } else if (sensorCount <= 4) {
                    // Nombre modéré de capteurs = surveillance moyenne
                    note = 7;
                    quality = 'Bon';
                    color = '#22c55e';  // Vert plus clair
                } else {
                    // Nombreux capteurs = zone fortement surveillée = probablement plus polluée
                    note = 6;
                    quality = 'Correct';
                    color = '#f59e0b';  // Orange (avertissement)
                }
            }
            
            // Construction de l'objet résultat avec toutes les informations
            const result = {
                success: true,
                data: {
                    note: note,                                      // Note sur 10
                    quality: quality,                                // Label qualité
                    color: color,                                    // Couleur d'affichage
                    station: bestStation?.name || 'Estimation locale', // Nom de la station
                    parameter: paramType                             // Type de polluant mesuré
                }
            };
            
            // Mise en cache du résultat pour 1 heure (3600 secondes)
            apiCache.set(cacheKey, result, 3600);
            console.log(`✅ Air quality récupérée : ${note}/10 (${quality})`);
            res.json(result);
        } else {
            // CAS 3 : Aucune station de mesure trouvée dans le rayon de 25 km
            // Estimation optimiste pour les zones peu urbanisées et naturelles
            const result = {
                success: true,
                data: {
                    note: 7,
                    quality: 'Bon',
                    color: '#10b981',
                    station: 'Estimation',        // Indique qu'aucune station réelle n'a été trouvée
                    parameter: 'estimated'
                }
            };
            // Cache de l'estimation pour 1 heure
            apiCache.set(cacheKey, result, 3600);
            console.log(`✅ Air quality estimée : 7/10 (pas de station proche)`);
            res.json(result);
        }
        
    } catch (error) {
        // Gestion globale des erreurs non anticipées
        console.error('❌ OpenAQ error:', error.message);
        
        // En cas d'erreur critique, toujours renvoyer une estimation pour éviter les crashs frontend
        res.json({ 
            success: true, 
            data: {
                note: 7,
                quality: 'Bon',
                color: '#10b981',
                station: 'Estimation',
                parameter: 'fallback'
            }
        });
    }
});

// ===================================================================================================
// ROUTE : /api/proprete-gares - Notes de propreté des gares françaises
// ===================================================================================================
// Récupère les taux de conformité de propreté mesurés par la SNCF et les convertit en notes sur 5
// Ces notes sont utilisées pour enrichir l'évaluation globale de la qualité des gares

app.get('/api/proprete-gares', async (req, res) => {
    // Clé de cache unique pour toutes les données de propreté
    const cacheKey = 'proprete_gares';
    
    // Vérification du cache avant interrogation de l'API
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache propreté-gares utilisé');
        return res.json(cached);
    }
    
    try {
        // Requête vers l'API SNCF avec limit de 1000 gares (suffisant pour couverture nationale)
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/records/1.0/search/?dataset=proprete-en-gare&q=&rows=1000'
        );
        
        // Transformation et nettoyage des données brutes
        const data = r.data.records
            .map(record => {
                const fields = record.fields || {};
                
                // Extraction du taux de conformité (pourcentage entre 0 et 100)
                const tauxConformite = fields.taux_de_conformite;
                
                // Conversion du taux en note sur 5 étoiles
                // Formule : (taux / 20) arrondi à 1 décimale
                // Exemple : 85% → (85/20) = 4.25 → 4.3/5
                const noteProprete = tauxConformite ? Math.round((tauxConformite / 20) * 10) / 10 : null;
                
                return {
                    // Nom de la gare avec fallback sur noms alternatifs
                    nom_gare: fields.nom_gare || fields.libellecourt || fields.libellelong,
                    note_proprete: noteProprete,           // Note finale sur 5
                    taux_conformite: tauxConformite,       // Taux original (pour référence)
                    date_mesure: fields.mois || fields.periode,  // Date de la mesure
                    nom_exploitant: fields.nomexploitant || 'SNCF'  // Exploitant de la gare
                };
            })
            // Filtrage : conservation uniquement des gares avec nom et note valides
            .filter(g => g.nom_gare && g.note_proprete !== null);
        
        // Déduplication : conservation uniquement de la mesure la plus récente pour chaque gare
        const garesMap = {};
        data.forEach(g => {
            // Normalisation du nom en minuscules pour la comparaison
            const key = g.nom_gare.toLowerCase();
            
            // Si la gare n'existe pas encore, ou si la mesure est plus récente, on la conserve
            if (!garesMap[key] || (g.date_mesure > garesMap[key].date_mesure)) {
                garesMap[key] = g;
            }
        });
        
        // Conversion de l'objet map en tableau de valeurs uniques
        const uniqueData = Object.values(garesMap);
        
        // Mise en cache pour 24 heures (86400 secondes) - données peu volatiles
        apiCache.set(cacheKey, uniqueData, 86400);
        console.log(`✅ Propreté gares récupérée : ${uniqueData.length} gares`);
        res.json(uniqueData);
        
    } catch (e) {
        // En cas d'échec, renvoyer un tableau vide pour éviter les erreurs frontend
        console.error('❌ Erreur API Propreté:', e.message);
        res.json([]);
    }
});

// ===================================================================================================
// ROUTE : /api/defibrillateurs-gares - Localisation des défibrillateurs dans les gares
// ===================================================================================================
// Récupère et regroupe les défibrillateurs par gare pour afficher le nombre total d'appareils
// et les emplacements précis (important pour la sécurité des usagers)

app.get('/api/defibrillateurs-gares', async (req, res) => {
    // Clé de cache pour les données de défibrillateurs
    const cacheKey = 'defibrillateurs_gares';
    
    // Vérification du cache (24h)
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache défibrillateurs utilisé');
        return res.json(cached);
    }
    
    try {
        // Requête vers l'API SNCF avec limit de 2000 appareils
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/records/1.0/search/?dataset=equipements-defibrillateurs&q=&rows=2000'
        );
        
        // Regroupement des défibrillateurs par gare pour compter le nombre total d'appareils
        const garesMap = {};
        
        r.data.records.forEach(record => {
            const fields = record.fields || {};
            const gareid = fields.gareid;  // Identifiant unique de la gare
            
            // Si pas d'ID de gare, on ignore cet enregistrement
            if (!gareid) return;
            
            // Extraction des coordonnées géographiques depuis le format texte "lat, lon"
            let lat = null, lon = null;
            if (fields.position_geographique) {
                // Parsing du format "48.8566, 2.3522" en tableau [48.8566, 2.3522]
                const coords = fields.position_geographique.split(',').map(c => parseFloat(c.trim()));
                if (coords.length === 2) {
                    lat = coords[0];  // Latitude
                    lon = coords[1];  // Longitude
                }
            }
            
            // Si la gare n'existe pas encore dans la map, on l'initialise
            if (!garesMap[gareid]) {
                garesMap[gareid] = {
                    gareid: gareid,
                    lat: lat,
                    lon: lon,
                    nb_appareils: 0,        // Compteur d'appareils
                    emplacements: []        // Liste des emplacements détaillés
                };
            }
            
            // Incrémentation du compteur d'appareils pour cette gare
            garesMap[gareid].nb_appareils++;
            
            // Ajout de l'emplacement descriptif (ex: "Hall 1", "Quai A", etc.)
            if (fields.localisationdescriptive) {
                garesMap[gareid].emplacements.push(fields.localisationdescriptive);
            }
        });
        
        // Création du tableau final avec résumé des emplacements (3 maximum)
        const data = Object.values(garesMap).map(g => ({
            ...g,  // Copie de toutes les propriétés existantes (gareid, lat, lon, nb_appareils, emplacements)
            // Création d'une chaîne d'emplacement : dédoublonnage + limit 3 + concaténation
            emplacement: [...new Set(g.emplacements)]  // Dédoublonnage avec Set
                .slice(0, 3)                          // Garder les 3 premiers
                .join(', ')                           // Joindre par virgules
                || 'Hall principal'                   // Fallback si aucun emplacement renseigné
        }));
        
        // Mise en cache pour 24 heures (données statiques)
        apiCache.set(cacheKey, data, 86400);
        console.log(`✅ Défibrillateurs récupérés : ${data.length} gares équipées`);
        res.json(data);
        
    } catch (e) {
        // Renvoi d'un tableau vide en cas d'erreur
        console.error('❌ Erreur API Défibrillateurs:', e.message);
        res.json([]);
    }
});


// ===================================================================================================
// ROUTE : /api/biodiversity - Observations d'espèces vivantes à proximité
// ===================================================================================================
// Interroge iNaturalist pour obtenir les observations scientifiques d'espèces animales et végétales
// Permet d'évaluer la richesse écologique autour d'une gare (indicateur de biodiversité)
// Paramètres : lat, lon, radius (en km, défaut 5 km)

app.get('/api/biodiversity', async (req, res) => {
    // Extraction des paramètres avec valeur par défaut pour le rayon
    const { lat, lon, radius = 5 } = req.query;
    
    // Validation des coordonnées obligatoires
    if (!lat || !lon) {
        return res.json({ success: false, error: 'Missing lat/lon' });
    }
    
    // Clé de cache incluant tous les paramètres pour différencier les recherches
    const cacheKey = `bio_${lat}_${lon}_${radius}`;
    
    // Vérification du cache (24h)
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache biodiversity utilisé');
        return res.json(cached);
    }
    
    try {
        // Interrogation de l'API iNaturalist v1 avec filtres de qualité
        const response = await axios.get(
            `https://api.inaturalist.org/v1/observations?` +
            `lat=${lat}&lng=${lon}&radius=${radius}&` +              // Zone de recherche
            `verifiable=true&` +                                      // Observations vérifiables uniquement
            `quality_grade=research&` +                               // Grade "recherche" (haute qualité)
            `per_page=10&` +                                          // Limit 10 observations
            `order=desc&order_by=created_at`                         // Plus récentes en premier
        );
        
        // Extraction du tableau d'observations depuis la réponse
        const observations = response.data.results;
        
        // Transformation des observations en objets espèces simplifiés
        const species = observations
            // Filtrage : garder uniquement les observations avec taxon identifié
            .filter(obs => obs.taxon)
            .map(obs => ({
                // Nom commun préféré (en français si disponible) ou nom scientifique
                name: obs.taxon.preferred_common_name || obs.taxon.name,
                // Nom scientifique latin complet (genre + espèce)
                scientificName: obs.taxon.name,
                // URL de la photo de l'espèce (taille moyenne)
                photo: obs.taxon.default_photo?.medium_url || null,
                // Catégorie iconique : Mammifère, Oiseau, Plante, Insecte, etc.
                category: obs.taxon.iconic_taxon_name,
                // Statut de conservation : espèce menacée ou commune
                rarity: obs.taxon.threatened ? '🔴 Menacée' : '🟢 Commune'
            }));
        
        // Construction de l'objet résultat avec comptage et limit 5 espèces
        const result = {
            success: true,
            data: {
                count: species.length,           // Nombre total d'espèces trouvées
                species: species.slice(0, 5)     // Les 5 premières espèces pour affichage
            }
        };
        
        // Mise en cache pour 24 heures (données peu volatiles)
        apiCache.set(cacheKey, result, 86400);
        console.log(`✅ Biodiversité récupérée : ${species.length} espèces`);
        res.json(result);
        
    } catch (error) {
        // Gestion des erreurs (API indisponible, timeout, etc.)
        console.error('❌ iNaturalist error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// ===================================================================================================
// ROUTE : /api/enriched-stats - Statistiques météo enrichies (gares extrêmes)
// ===================================================================================================
// Algorithme complexe qui scanne stratégiquement les gares françaises pour identifier :
// - La gare la plus CHAUDE de France en temps réel
// - La gare la plus FROIDE de France en temps réel
// Optimisé pour capturer la diversité climatique sans scanner les 3000+ gares (trop lent)
// Stratégie : échantillonnage géographique intelligent (Sud, Nord, Altitude, Répartition)

app.get('/api/enriched-stats', async (req, res) => {
    // Paramètres optionnels (non utilisés actuellement mais conservés pour évolutions futures)
    const { centerLat, centerLon } = req.query;
    
    // Clé de cache globale (v3 = version 3 de l'algorithme)
    const cacheKey = `enriched_stats_v3`;
    
    // Vérification du cache (5 minutes seulement car données météo volatiles)
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache enriched-stats utilisé');
        return res.json(cached);
    }
    
    try {
        // =================================================================================
        // ÉTAPE 1 : Récupération de TOUTES les gares françaises pour sélection stratégique
        // =================================================================================
        console.log('🔄 Récupération de TOUTES les gares pour météo extrême...');
        const garesRes = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json',
            { timeout: 15000 }  // Timeout élevé (15s) car dataset volumineux
        );
        
        // Validation de la réponse
        if (!Array.isArray(garesRes.data) || garesRes.data.length === 0) {
            throw new Error('Aucune gare récupérée');
        }
        
        // Filtrage : conservation uniquement des gares avec coordonnées GPS valides et nom
        const garesAvecCoords = garesRes.data
            .filter(g => g.position_geographique && g.position_geographique.lat && g.position_geographique.lon && g.nom)
            .map(g => ({
                // Nettoyage du nom : suppression des préfixes "Gare de" / "Gare d'"
                name: g.nom.replace(/^Gare de /i, '').replace(/^Gare d'/i, '').trim(),
                lat: g.position_geographique.lat,
                lon: g.position_geographique.lon
            }));
        
        console.log(`📍 ${garesAvecCoords.length} gares avec coordonnées`);
        
        // =================================================================================
        // ÉTAPE 2 : Sélection stratégique des gares pour capturer la diversité climatique
        // =================================================================================
        // Objectif : échantillonner ~60-80 gares représentatives au lieu de 3000+
        // Critères : latitude (Nord/Sud), altitude (montagne), répartition géographique
        
        // Tri des gares par latitude (Sud → Nord)
        const garesSortedByLat = [...garesAvecCoords].sort((a, b) => a.lat - b.lat);
        
        // Tableau pour stocker les gares sélectionnées
        const garesExtremes = [];
        
        // CRITÈRE 1 : Gares du Sud (climats méditerranéens chauds)
        // Les 10 gares les plus au sud (Provence, Côte d'Azur, Corse)
        garesExtremes.push(...garesSortedByLat.slice(0, 10));
        
        // CRITÈRE 2 : Gares du Nord (climats continentaux froids)
        // Les 10 gares les plus au nord (Nord-Pas-de-Calais, Normandie, etc.)
        garesExtremes.push(...garesSortedByLat.slice(-10));
        
        // CRITÈRE 3 : Gares en altitude (Alpes, Pyrénées, Massif Central : températures basses)
        const garesAltitude = garesAvecCoords.filter(g =>
            // Alpes : latitude 44-46.5°N, longitude 5-8°E
            (g.lat >= 44 && g.lat <= 46.5 && g.lon >= 5 && g.lon <= 8) ||
            // Pyrénées : latitude 42-43.5°N, longitude -2 à 3°E
            (g.lat >= 42 && g.lat <= 43.5 && g.lon >= -2 && g.lon <= 3) ||
            // Massif Central : latitude 44-46°N, longitude 2-4°E
            (g.lat >= 44 && g.lat <= 46 && g.lon >= 2 && g.lon <= 4)
        );
        // Ajout des 15 premières gares d'altitude trouvées
        garesExtremes.push(...garesAltitude.slice(0, 15));
        
        // CRITÈRE 4 : Échantillon de gares intermédiaires pour couverture nationale complète
        // Répartition uniforme sur tout le territoire (Ouest, Centre, Est)
        const step = Math.floor(garesSortedByLat.length / 15);  // Calcul du pas d'échantillonnage
        for (let i = 0; i < 15; i++) {
            const g = garesSortedByLat[i * step];  // Sélection tous les N-ième élément
            // Vérification que la gare n'est pas déjà dans la liste (pas de doublon)
            if (!garesExtremes.find(e => e.name === g.name)) {
                garesExtremes.push(g);
            }
        }
        
        // Élimination des doublons éventuels via Map (clé = nom de gare)
        const garesUniques = [...new Map(garesExtremes.map(g => [g.name, g])).values()];
        
        console.log(`🌡️ Météo pour ${garesUniques.length} gares stratégiques`);
        
        // =================================================================================
        // ÉTAPE 3 : Récupération des températures par lots pour éviter la surcharge API
        // =================================================================================
        // Limitation : max 20 requêtes parallèles simultanées (rate limiting)
        const batchSize = 20;
        let allWeatherResults = [];  // Tableau pour accumuler tous les résultats
        
        // Boucle sur les lots de 20 gares
        for (let i = 0; i < garesUniques.length; i += batchSize) {
            // Extraction du lot actuel (20 gares maximum)
            const batch = garesUniques.slice(i, i + batchSize);
            
            // Création d'un tableau de promesses pour exécution parallèle
            const weatherPromises = batch.map(async (gare) => {
                try {
                    // Construction de l'URL de l'API Open-Meteo pour cette gare
                    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${gare.lat}&longitude=${gare.lon}&current_weather=true`;
                    
                    // Requête météo avec timeout de 5 secondes
                    const weatherRes = await axios.get(weatherUrl, { timeout: 5000 });
                    
                    // Extraction de la température actuelle depuis la réponse
                    const temp = weatherRes.data?.current_weather?.temperature;
                    
                    // Retour de l'objet gare enrichi avec la température
                    return { ...gare, temp: temp !== undefined ? temp : null };
                } catch (e) {
                    // En cas d'erreur (timeout, API indisponible), temp = null
                    return { ...gare, temp: null };
                }
            });
            
            // Attente de la fin de toutes les requêtes du lot actuel
            const batchResults = await Promise.all(weatherPromises);
            
            // Ajout des résultats du lot au tableau global
            allWeatherResults.push(...batchResults);
        }
        
        // =================================================================================
        // ÉTAPE 4 : Filtrage et identification des records de température
        // =================================================================================
        
        // Conservation uniquement des gares avec température valide (non null)
        const validWeather = allWeatherResults.filter(w => w.temp !== null);
        
        console.log(`✅ ${validWeather.length} gares avec température valide`);
        
        // Variables pour stocker les records
        let hottest = null;   // Gare la plus chaude
        let coldest = null;   // Gare la plus froide
        
        if (validWeather.length > 0) {
            // Recherche de la température MAXIMALE (reduce avec comparaison)
            hottest = validWeather.reduce((max, gare) => 
                gare.temp > max.temp ? gare : max,  // Si temp actuelle > max, on la garde
                validWeather[0]  // Valeur initiale = première gare
            );
            
            // Recherche de la température MINIMALE (reduce avec comparaison)
            coldest = validWeather.reduce((min, gare) => 
                gare.temp < min.temp ? gare : min,  // Si temp actuelle < min, on la garde
                validWeather[0]  // Valeur initiale = première gare
            );
        }
        
        // Construction de l'objet résultat final avec les statistiques
        const result = {
            success: true,
            weather: {
                // Gare la plus chaude avec toutes ses infos (ou null si aucune donnée)
                hottest: hottest ? { 
                    name: hottest.name, 
                    temp: hottest.temp, 
                    lat: hottest.lat, 
                    lon: hottest.lon 
                } : null,
                // Gare la plus froide avec toutes ses infos (ou null si aucune donnée)
                coldest: coldest ? { 
                    name: coldest.name, 
                    temp: coldest.temp, 
                    lat: coldest.lat, 
                    lon: coldest.lon 
                } : null,
                // Nombre de gares scannées avec succès (pour info utilisateur)
                scannedCount: validWeather.length
            },
            // Timestamp de création des statistiques
            timestamp: Date.now()
        };
        
        // Mise en cache pour 5 minutes SEULEMENT (300 secondes)
        // Cache court car les températures changent rapidement
        apiCache.set(cacheKey, result, 300);
        
        // Log des résultats pour suivi console
        console.log(`🌡️ Enriched stats - Plus chaud: ${hottest?.name} (${hottest?.temp}°C), Plus froid: ${coldest?.name} (${coldest?.temp}°C)`);
        res.json(result);
        
    } catch (error) {
        // Gestion globale des erreurs de la route
        console.error('❌ Enriched stats error:', error.message);
        
        // Renvoi d'une réponse d'échec avec structure vide pour éviter crash frontend
        res.json({ 
            success: false, 
            error: error.message,
            weather: { hottest: null, coldest: null }
        });
    }
});

// ===================================================================================================
// ROUTES DE SERVICE - Hébergement du frontend et démarrage du serveur
// ===================================================================================================

// Middleware pour servir les fichiers statiques du frontend (HTML, CSS, JS, images)
// Tous les fichiers du dossier '../frontend' sont accessibles publiquement
// Exemple : http://localhost:3000/style.css pointe vers frontend/style.css

// Middleware pour définir le type MIME correct pour les fichiers JavaScript (modules ES6)
app.use((req, res, next) => {
    if (req.url.endsWith('.js')) {
        res.setHeader('Content-Type', 'application/javascript; charset=utf-8');
    }
    next();
});

app.use(express.static(path.join(__dirname, '../frontend')));

// Route racine : renvoi de la page d'accueil index.html
// Permet d'accéder au site via http://localhost:3000/
app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// ===================================================================================================
// DÉMARRAGE DU SERVEUR HTTP
// ===================================================================================================

// Lancement de l'écoute sur le port configuré (par défaut 3000)
app.listen(port, () => {
    // Affichage des informations de démarrage dans la console
    console.log(`🚀 Serveur démarré sur le port ${port}`);
    console.log(`📍 Frontend : http://localhost:${port}`);
});

// ===================================================================================================
// FIN DU FICHIER server.js - Serveur Backend Tourisme Vert
// ===================================================================================================
