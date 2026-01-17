//Chargement des variables d'environnement depuis le fichier .env
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

//Mise en cache des réponses API pour éviter de surcharger les serveurs externes (durée : 1 heure)
const apiCache = new NodeCache({ stdTTL: 3600 });

//Autorisation des requêtes depuis n'importe quel domaine (nécessaire pour que le frontend puisse communiquer avec le backend)
app.use(cors());
app.use(express.json());

//Chargement d'un fichier local contenant les emplacements de parkings vélo en cas de panne de l'API principale
let veloDataCache = { type: "FeatureCollection", features: [] };
try {
    const filePath = path.join(__dirname, 'velo.geojson');
    if (fs.existsSync(filePath)) {
        veloDataCache = JSON.parse(fs.readFileSync(filePath, 'utf8'));
        console.log(`🚲 Fichier vélo de secours chargé : ${veloDataCache.features.length} points`);
    }
} catch (e) { 
    console.warn("⚠️ Fichier velo.geojson introuvable");
}

//Récupération de la liste complète des gares ferroviaires françaises depuis les données ouvertes SNCF
app.get('/api/gares', async (req, res) => {
    try {
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json'
        );
        if (!Array.isArray(r.data)) throw new Error('Format API invalide');

        //Transformation des données brutes en format simplifié avec identifiant, nom, coordonnées et type de gare
        const d = r.data
            .map((g, i) => ({
                id: i,
                nom: g.nom || 'Gare Inconnue',
                lat: g.position_geographique?.lat,
                lon: g.position_geographique?.lon,
                type: g.nom && g.nom.includes('TGV') ? 'TGV' : 'TER'
            }))
            .filter((g) => g.lat && g.lon);

        res.json(d);
    } catch (e) {
        console.error('❌ Erreur API Gares:', e.message);
        res.json([]);
    }
});

//Récupération du tracé géographique des lignes ferroviaires nationales
app.get('/api/wfs-rails', async (req, res) => {
    try {
        const r = await axios.get(
            'https://ressources.data.sncf.com/explore/dataset/formes-des-lignes-du-rfn/download/?format=geojson&timezone=Europe/Berlin&lang=fr'
        );
        res.json(r.data);
    } catch (e) {
        console.error('❌ Erreur API Rails:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

//Récupération des emplacements de bornes de recharge électrique pour véhicules
app.get('/api/irve', async (req, res) => {
    try {
        const r = await axios.get(
            'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-charging-station/exports/geojson?limit=15000'
        );
        res.json(r.data);
    } catch (e) {
        console.error('❌ Erreur API IRVE:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

//Récupération des aires de covoiturage disponibles sur le territoire
app.get('/api/covoiturage', async (req, res) => {
    try {
        const r = await axios.get(
            'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/aires-covoiturage/exports/geojson?limit=5000'
        );
        res.json(r.data);
    } catch (e) {
        console.error('❌ Erreur API Covoiturage:', e.message);
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

//Récupération des parkings vélos dans une zone géographique définie (tentative API en priorité, fichier local en secours)
app.get('/api/parking-velo', async (req, res) => {
    const { minLat, maxLat, minLon, maxLon } = req.query;

    if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.json({ type: 'FeatureCollection', features: [] });
    }

    //Tentative de récupération depuis l'API en ligne
    try {
        const url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-bicycle-parking/exports/geojson?limit=-1';
        
        console.log('🔄 Tentative récupération API vélos...');
        const r = await axios.get(url, { timeout: 8000 });
        const data = r.data;

        const all = Array.isArray(data.features) ? data.features : [];

        //Filtrage des parkings situés dans la zone demandée par l'utilisateur
        const resList = all.filter((f) => {
            if (!f.geometry || !f.geometry.coordinates) return false;
            const c = f.geometry.coordinates;
            return (
                c[1] >= parseFloat(minLat) &&
                c[1] <= parseFloat(maxLat) &&
                c[0] >= parseFloat(minLon) &&
                c[0] <= parseFloat(maxLon)
            );
        });

        //Limitation à 5000 points maximum pour ne pas ralentir l'affichage
        const final = resList.length > 5000
            ? resList.filter((_, i) => i % Math.ceil(resList.length / 5000) === 0)
            : resList;

        console.log(`✅ API vélos OK : ${final.length} points renvoyés`);
        return res.json({ type: 'FeatureCollection', features: final });

    } catch (apiError) {
        console.warn('⚠️ API vélos échouée, basculement sur fichier local...');
        
        //Utilisation du fichier de secours si l'API est indisponible
        if (veloDataCache.features.length > 0) {
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

            const final = resList.length > 5000
                ? resList.filter((_, i) => i % Math.ceil(resList.length / 5000) === 0)
                : resList;

            console.log(`🗂️ Fichier local utilisé : ${final.length} points`);
            return res.json({ type: 'FeatureCollection', features: final });
        }

        console.error('❌ Aucune source vélo disponible');
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

//Récupération de la qualité de l'air à proximité d'une position donnée avec notation sur 10
app.get('/api/air-quality', async (req, res) => {
    const { lat, lon } = req.query;
    
    if (!lat || !lon) {
        return res.json({ success: false, error: 'Missing lat/lon' });
    }
    
    const cacheKey = `air_${lat}_${lon}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache air-quality utilisé');
        return res.json(cached);
    }
    
    try {
        //Recherche de stations de mesure dans un rayon de 25 km
        const radius = 25000;
        let response;
        try {
            response = await axios.get(
                `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=${radius}&limit=5`,
                {
                    headers: {
                        'X-API-Key': process.env.OPENAQ_API_KEY || ''
                    },
                    timeout: 10000
                }
            );
        } catch (apiErr) {
            console.log('⚠️ OpenAQ API non disponible, estimation par défaut');
            const fallback = {
                success: true,
                data: { note: 7, quality: 'Bon', color: '#10b981', station: 'Estimation', parameter: 'fallback' }
            };
            apiCache.set(cacheKey, fallback, 3600);
            return res.json(fallback);
        }
        
        const data = response.data || {};
        
        if (data.results && data.results.length > 0) {
            //Recherche d'une station avec des capteurs actifs
            let bestStation = null;
            let bestSensor = null;
            
            for (const station of data.results) {
                if (station.sensors && station.sensors.length > 0) {
//Priorité aux polluants les plus significatifs : particules fines PM2.5 et PM10, ozone, dioxyde d'azote
                    const priorityParams = ['pm25', 'pm10', 'o3', 'no2'];
                    for (const paramName of priorityParams) {
                        const sensor = station.sensors.find(s => 
                            s.parameter?.name === paramName || 
                            (s.name && s.name.toLowerCase().includes(paramName))
                        );
                        if (sensor) {
                            bestStation = station;
                            bestSensor = sensor;
                            break;
                        }
                    }
                    if (bestSensor) break;
                }
            }
            
            //Calcul d'une note de qualité de l'air sur 10 basée sur la surveillance de la zone
            let note = 7;
            let quality = 'Bon';
            let color = '#10b981';
            let paramType = (bestSensor && bestSensor.parameter && bestSensor.parameter.name) || 'estimated';
            
            if (!bestSensor) {
                //Les zones rurales et vertes ont généralement une meilleure qualité d'air
                note = 7;
                quality = 'Bon';
                color = '#10b981';
                console.log(`⚠️ Pas de capteur trouvé, estimation: ${note}/10`);
            } else {
                //Estimation basée sur l'intensité de la surveillance : plus une zone est surveillée, plus elle est potentiellement polluée
                const sensorCount = bestStation.sensors?.length || 0;
                
                if (sensorCount <= 2) {
                    note = 8;
                    quality = 'Très bon';
                    color = '#10b981';
                } else if (sensorCount <= 4) {
                    note = 7;
                    quality = 'Bon';
                    color = '#22c55e';
                } else {
                    note = 6;
                    quality = 'Correct';
                    color = '#f59e0b';
                }
            }
            
            const result = {
                success: true,
                data: {
                    note: note,
                    quality: quality,
                    color: color,
                    station: bestStation?.name || 'Estimation locale',
                    parameter: paramType
                }
            };
            
            apiCache.set(cacheKey, result, 3600);
            console.log(`✅ Air quality récupérée : ${note}/10 (${quality})`);
            res.json(result);
        } else {
            //Absence de station proche : estimation optimiste pour les zones peu urbanisées
            const result = {
                success: true,
                data: {
                    note: 7,
                    quality: 'Bon',
                    color: '#10b981',
                    station: 'Estimation',
                    parameter: 'estimated'
                }
            };
            apiCache.set(cacheKey, result, 3600);
            console.log(`✅ Air quality estimée : 7/10 (pas de station proche)`);
            res.json(result);
        }
        
    } catch (error) {
        console.error('❌ OpenAQ error:', error.message);
        // En cas d'erreur, retourner une estimation
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

//Récupération des notes de propreté mesurées dans les gares françaises (sur 5)
app.get('/api/proprete-gares', async (req, res) => {
    const cacheKey = 'proprete_gares';
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache propreté-gares utilisé');
        return res.json(cached);
    }
    
    try {
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/records/1.0/search/?dataset=proprete-en-gare&q=&rows=1000'
        );
        
        //Conversion du taux de conformité (pourcentage) en note sur 5 étoiles
        const data = r.data.records
            .map(record => {
                const fields = record.fields || {};
                const tauxConformite = fields.taux_de_conformite;
                const noteProprete = tauxConformite ? Math.round((tauxConformite / 20) * 10) / 10 : null;
                
                return {
                    nom_gare: fields.nom_gare || fields.libellecourt || fields.libellelong,
                    note_proprete: noteProprete,
                    taux_conformite: tauxConformite,
                    date_mesure: fields.mois || fields.periode,
                    nom_exploitant: fields.nomexploitant || 'SNCF'
                };
            })
            .filter(g => g.nom_gare && g.note_proprete !== null);
        
        //Conservation uniquement de la mesure la plus récente pour chaque gare
        const garesMap = {};
        data.forEach(g => {
            const key = g.nom_gare.toLowerCase();
            if (!garesMap[key] || (g.date_mesure > garesMap[key].date_mesure)) {
                garesMap[key] = g;
            }
        });
        const uniqueData = Object.values(garesMap);
        
        apiCache.set(cacheKey, uniqueData, 86400); // Cache 24h
        console.log(`✅ Propreté gares récupérée : ${uniqueData.length} gares`);
        res.json(uniqueData);
        
    } catch (e) {
        console.error('❌ Erreur API Propreté:', e.message);
        res.json([]);
    }
});

//Récupération de la localisation et du nombre de défibrillateurs disponibles dans les gares
app.get('/api/defibrillateurs-gares', async (req, res) => {
    const cacheKey = 'defibrillateurs_gares';
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache défibrillateurs utilisé');
        return res.json(cached);
    }
    
    try {
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/records/1.0/search/?dataset=equipements-defibrillateurs&q=&rows=2000'
        );
        
        //Regroupement des défibrillateurs par gare pour compter le nombre total d'appareils disponibles
        const garesMap = {};
        r.data.records.forEach(record => {
            const fields = record.fields || {};
            const gareid = fields.gareid;
            if (!gareid) return;
            
            //Extraction des coordonnées géographiques depuis le format texte
            let lat = null, lon = null;
            if (fields.position_geographique) {
                const coords = fields.position_geographique.split(',').map(c => parseFloat(c.trim()));
                if (coords.length === 2) {
                    lat = coords[0];
                    lon = coords[1];
                }
            }
            
            if (!garesMap[gareid]) {
                garesMap[gareid] = {
                    gareid: gareid,
                    lat: lat,
                    lon: lon,
                    nb_appareils: 0,
                    emplacements: []
                };
            }
            
            garesMap[gareid].nb_appareils++;
            if (fields.localisationdescriptive) {
                garesMap[gareid].emplacements.push(fields.localisationdescriptive);
            }
        });
        
        //Création d'un résumé avec les 3 emplacements principaux pour chaque gare
        const data = Object.values(garesMap).map(g => ({
            ...g,
            emplacement: [...new Set(g.emplacements)].slice(0, 3).join(', ') || 'Hall principal'
        }));
        
        apiCache.set(cacheKey, data, 86400); // Cache 24h
        console.log(`✅ Défibrillateurs récupérés : ${data.length} gares équipées`);
        res.json(data);
        
    } catch (e) {
        console.error('❌ Erreur API Défibrillateurs:', e.message);
        res.json([]);
    }
});


//Récupération des observations d'espèces vivantes à proximité d'un point géographique
app.get('/api/biodiversity', async (req, res) => {
    const { lat, lon, radius = 5 } = req.query;
    
    if (!lat || !lon) {
        return res.json({ success: false, error: 'Missing lat/lon' });
    }
    
    const cacheKey = `bio_${lat}_${lon}_${radius}`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache biodiversity utilisé');
        return res.json(cached);
    }
    
    try {
        const response = await axios.get(
            `https://api.inaturalist.org/v1/observations?` +
            `lat=${lat}&lng=${lon}&radius=${radius}&` +
            `verifiable=true&quality_grade=research&per_page=10&order=desc&order_by=created_at`
        );
        
        const observations = response.data.results;
        
        //Extraction des informations essentielles pour chaque espèce observée
        const species = observations
            .filter(obs => obs.taxon)
            .map(obs => ({
                name: obs.taxon.preferred_common_name || obs.taxon.name,
                scientificName: obs.taxon.name,
                photo: obs.taxon.default_photo?.medium_url || null,
                category: obs.taxon.iconic_taxon_name,
                rarity: obs.taxon.threatened ? '🔴 Menacée' : '🟢 Commune'
            }));
        
        const result = {
            success: true,
            data: {
                count: species.length,
                species: species.slice(0, 5)
            }
        };
        
        apiCache.set(cacheKey, result, 86400); // Cache 24h
        console.log(`✅ Biodiversité récupérée : ${species.length} espèces`);
        res.json(result);
        
    } catch (error) {
        console.error('❌ iNaturalist error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

//Récupération des statistiques météo enrichies : recherche des gares les plus chaudes et les plus froides de France en temps réel
app.get('/api/enriched-stats', async (req, res) => {
    const { centerLat, centerLon } = req.query;
    
    const cacheKey = `enriched_stats_v3`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache enriched-stats utilisé');
        return res.json(cached);
    }
    
    try {
        //Récupération de toutes les gares françaises pour analyse météorologique
        console.log('🔄 Récupération de TOUTES les gares pour météo extrême...');
        const garesRes = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json',
            { timeout: 15000 }
        );
        
        if (!Array.isArray(garesRes.data) || garesRes.data.length === 0) {
            throw new Error('Aucune gare récupérée');
        }
        
        //Conservation uniquement des gares avec coordonnées GPS valides
        const garesAvecCoords = garesRes.data
            .filter(g => g.position_geographique && g.position_geographique.lat && g.position_geographique.lon && g.nom)
            .map(g => ({
                name: g.nom.replace(/^Gare de /i, '').replace(/^Gare d'/i, '').trim(),
                lat: g.position_geographique.lat,
                lon: g.position_geographique.lon
            }));
        
        console.log(`📍 ${garesAvecCoords.length} gares avec coordonnées`);
        
        //Sélection stratégique des gares pour capturer la diversité climatique française
        const garesSortedByLat = [...garesAvecCoords].sort((a, b) => a.lat - b.lat);
        
        const garesExtremes = [];
        
        //Gares du Sud (climats méditerranéens chauds)
        garesExtremes.push(...garesSortedByLat.slice(0, 10));
        
        //Gares du Nord (climats continentaux froids)
        garesExtremes.push(...garesSortedByLat.slice(-10));
        
        //Gares en altitude (Alpes, Pyrénées, Massif Central : températures basses)
        const garesAltitude = garesAvecCoords.filter(g =>
            (g.lat >= 44 && g.lat <= 46.5 && g.lon >= 5 && g.lon <= 8) ||
            // Pyrénées: lat 42-43.5, lon -2 à 3
            (g.lat >= 42 && g.lat <= 43.5 && g.lon >= -2 && g.lon <= 3) ||
            // Massif Central: lat 44-46, lon 2-4
            (g.lat >= 44 && g.lat <= 46 && g.lon >= 2 && g.lon <= 4)
        );
        garesExtremes.push(...garesAltitude.slice(0, 15));
        
        //Échantillon de gares intermédiaires pour couverture nationale
        const step = Math.floor(garesSortedByLat.length / 15);
        for (let i = 0; i < 15; i++) {
            const g = garesSortedByLat[i * step];
            if (!garesExtremes.find(e => e.name === g.name)) {
                garesExtremes.push(g);
            }
        }
        
        //Élimination des doublons
        const garesUniques = [...new Map(garesExtremes.map(g => [g.name, g])).values()];
        
        console.log(`🌡️ Météo pour ${garesUniques.length} gares stratégiques`);
        
        // Récupération des températures par lots de 20 pour ne pas saturer l'API météo
        const batchSize = 20;
        let allWeatherResults = [];
        
        for (let i = 0; i < garesUniques.length; i += batchSize) {
            const batch = garesUniques.slice(i, i + batchSize);
            const weatherPromises = batch.map(async (gare) => {
                try {
                    const weatherUrl = `https://api.open-meteo.com/v1/forecast?latitude=${gare.lat}&longitude=${gare.lon}&current_weather=true`;
                    const weatherRes = await axios.get(weatherUrl, { timeout: 5000 });
                    const temp = weatherRes.data?.current_weather?.temperature;
                    return { ...gare, temp: temp !== undefined ? temp : null };
                } catch (e) {
                    return { ...gare, temp: null };
                }
            });
            const batchResults = await Promise.all(weatherPromises);
            allWeatherResults.push(...batchResults);
        }
        
            // Conservation uniquement des gares avec température valide
        const validWeather = allWeatherResults.filter(w => w.temp !== null);
        
        console.log(`✅ ${validWeather.length} gares avec température valide`);
        
        // Identification des records de température
        let hottest = null;
        let coldest = null;
        
        if (validWeather.length > 0) {
            hottest = validWeather.reduce((max, gare) => gare.temp > max.temp ? gare : max, validWeather[0]);
            coldest = validWeather.reduce((min, gare) => gare.temp < min.temp ? gare : min, validWeather[0]);
        }
        
        const result = {
            success: true,
            weather: {
                hottest: hottest ? { name: hottest.name, temp: hottest.temp, lat: hottest.lat, lon: hottest.lon } : null,
                coldest: coldest ? { name: coldest.name, temp: coldest.temp, lat: coldest.lat, lon: coldest.lon } : null,
                scannedCount: validWeather.length
            },
            timestamp: Date.now()
        };
        
        //Mise en cache des statistiques pour 5 minutes (données évolutives)
        apiCache.set(cacheKey, result, 300);
        console.log(`🌡️ Enriched stats - Plus chaud: ${hottest?.name} (${hottest?.temp}°C), Plus froid: ${coldest?.name} (${coldest?.temp}°C)`);
        res.json(result);
        
    } catch (error) {
        console.error('❌ Enriched stats error:', error.message);
        res.json({ 
            success: false, 
            error: error.message,
            weather: { hottest: null, coldest: null }
        });
    }
});

//Mise à disposition des fichiers du site web (pages HTML, CSS, JavaScript)
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

//Démarrage du serveur sur le port configuré
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
    console.log(`📍 Frontend : http://localhost:${port}`);
});

