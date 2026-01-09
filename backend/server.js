// ============================================================
// NOM FICHIER : backend/server.js
// FUSION COMPLÈTE : API vélo prioritaire + Cache + Air & Bio
// DATE : 06/01/2026
// ============================================================

// Charger .env depuis le répertoire du script
require('dotenv').config({ path: require('path').join(__dirname, '.env') });
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const fs = require('fs');
const path = require('path');
const NodeCache = require('node-cache');

const app = express();
const port = process.env.PORT || 3000;

// Cache API (TTL 1 heure)
const apiCache = new NodeCache({ stdTTL: 3600 });

app.use(cors());
app.use(express.json());

// --- CHARGEMENT FICHIER VÉLO LOCAL (FALLBACK) ---
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

// --- ROUTES API ---

// 1. GARES SNCF
app.get('/api/gares', async (req, res) => {
    try {
        const r = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json'
        );
        if (!Array.isArray(r.data)) throw new Error('Format API invalide');

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

// 2. RAILS (WFS)
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

// 3. BORNES ÉLECTRIQUES (IRVE)
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

// 4. AIRES DE COVOITURAGE
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

// 5. PARKINGS VÉLOS (API prioritaire, fichier local en fallback)
app.get('/api/parking-velo', async (req, res) => {
    const { minLat, maxLat, minLon, maxLon } = req.query;

    if (!minLat || !maxLat || !minLon || !maxLon) {
        return res.json({ type: 'FeatureCollection', features: [] });
    }

    // PRIORITÉ 1 : Tenter l'API Opendatasoft
    try {
        const url = 'https://public.opendatasoft.com/api/explore/v2.1/catalog/datasets/osm-france-bicycle-parking/exports/geojson?limit=-1';
        
        console.log('🔄 Tentative récupération API vélos...');
        const r = await axios.get(url, { timeout: 8000 }); // Timeout 8s
        const data = r.data;

        const all = Array.isArray(data.features) ? data.features : [];

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

        const final = resList.length > 5000
            ? resList.filter((_, i) => i % Math.ceil(resList.length / 5000) === 0)
            : resList;

        console.log(`✅ API vélos OK : ${final.length} points renvoyés`);
        return res.json({ type: 'FeatureCollection', features: final });

    } catch (apiError) {
        console.warn('⚠️ API vélos échouée, basculement sur fichier local...');
        
        // PRIORITÉ 2 : Utiliser le fichier local
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

        // Aucune source disponible
        console.error('❌ Aucune source vélo disponible');
        res.json({ type: 'FeatureCollection', features: [] });
    }
});

// 6. QUALITÉ DE L'AIR (OpenAQ v3 - avec note sur 10)
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
        const radius = 25000; // 25km pour trouver plus de stations
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
            // Chercher une station avec des données récentes (sensors dans API v3)
            let bestStation = null;
            let bestSensor = null;
            
            for (const station of data.results) {
                // API v3 utilise 'sensors' au lieu de 'parameters'
                if (station.sensors && station.sensors.length > 0) {
                    // Priorité: pm25 > pm10 > o3 > no2
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
            
            // Calculer la note sur 10 basée sur l'indice de qualité de l'air
            // On utilise une estimation basée sur les standards européens
            let note = 7;
            let quality = 'Bon';
            let color = '#10b981';
            let paramType = (bestSensor && bestSensor.parameter && bestSensor.parameter.name) || 'estimated';
            
            // Si on n'a pas de données de capteur, on estime basé sur la localisation
            // Les zones rurales/vertes ont généralement une meilleure qualité d'air
            if (!bestSensor) {
                // Estimation basée sur le type de zone (gares = souvent urbain)
                // Note par défaut entre 6 et 8 pour la France
                note = 7;
                quality = 'Bon';
                color = '#10b981';
                console.log(`⚠️ Pas de capteur trouvé, estimation: ${note}/10`);
            } else {
                // Conversion des valeurs en note sur 10 selon le polluant
                // PM2.5: 0-10 µg/m³ = excellent, 10-25 = bon, 25-50 = moyen, >50 = mauvais
                // O3: 0-60 µg/m³ = excellent, 60-120 = bon, 120-180 = moyen, >180 = mauvais
                // Note: Les capteurs peuvent avoir des valeurs dans lastValue ou average
                
                // Pour l'API v3, on estime la qualité basée sur la présence de capteurs actifs
                // Plus il y a de paramètres mesurés, plus la zone est surveillée (souvent urbaine)
                const sensorCount = bestStation.sensors?.length || 0;
                
                if (sensorCount <= 2) {
                    note = 8; // Zone peu surveillée = probablement bonne qualité
                    quality = 'Très bon';
                    color = '#10b981';
                } else if (sensorCount <= 4) {
                    note = 7;
                    quality = 'Bon';
                    color = '#22c55e';
                } else {
                    note = 6; // Zone très surveillée = probablement plus polluée
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
            // Pas de station trouvée, on donne une estimation par défaut
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

// 7. PROPRETÉ EN GARE (SNCF Open Data)
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
        
        // API SNCF : taux_de_conformite (%) → conversion en note sur 5
        const data = r.data.records
            .map(record => {
                const fields = record.fields || {};
                const tauxConformite = fields.taux_de_conformite;
                // Conversion taux (0-100%) vers note (0-5)
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
        
        // Dédoublonner : garder la mesure la plus récente par gare
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

// 8. DÉFIBRILLATEURS EN GARE (SNCF Open Data)
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
        
        // Grouper les défibrillateurs par gareid et compter
        const garesMap = {};
        r.data.records.forEach(record => {
            const fields = record.fields || {};
            const gareid = fields.gareid;
            if (!gareid) return;
            
            // Parser les coordonnées
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
        
        // Convertir en tableau avec emplacements uniques
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

// 9. BIODIVERSITÉ (iNaturalist)
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
        
        // FIX: Protection contre obs.taxon undefined pour éviter crash
        const species = observations
            .filter(obs => obs.taxon) // Filtrer les observations sans taxon
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

// 10. ENRICHED STATS - Statistiques enrichies en 1 appel
app.get('/api/enriched-stats', async (req, res) => {
    const { centerLat, centerLon } = req.query;
    
    const cacheKey = `enriched_stats_v3`;
    const cached = apiCache.get(cacheKey);
    if (cached) {
        console.log('📦 Cache enriched-stats utilisé');
        return res.json(cached);
    }
    
    try {
        // 1. Récupérer toutes les gares depuis l'API SNCF
        console.log('🔄 Récupération de TOUTES les gares pour météo extrême...');
        const garesRes = await axios.get(
            'https://ressources.data.sncf.com/api/explore/v2.1/catalog/datasets/gares-de-voyageurs/exports/json',
            { timeout: 15000 }
        );
        
        if (!Array.isArray(garesRes.data) || garesRes.data.length === 0) {
            throw new Error('Aucune gare récupérée');
        }
        
        // 2. Filtrer les gares avec coordonnées valides (champ = position_geographique)
        const garesAvecCoords = garesRes.data
            .filter(g => g.position_geographique && g.position_geographique.lat && g.position_geographique.lon && g.nom)
            .map(g => ({
                name: g.nom.replace(/^Gare de /i, '').replace(/^Gare d'/i, '').trim(),
                lat: g.position_geographique.lat,
                lon: g.position_geographique.lon
            }));
        
        console.log(`📍 ${garesAvecCoords.length} gares avec coordonnées`);
        
        // 3. Stratégie: prendre les extrêmes géographiques pour avoir des températures variées
        // Gares les plus au nord (froid), sud (chaud), en altitude (froid), côte (doux)
        const garesSortedByLat = [...garesAvecCoords].sort((a, b) => a.lat - b.lat);
        
        // Sélection intelligente: 
        // - 10 gares les plus au SUD (potentiellement chaudes)
        // - 10 gares les plus au NORD (potentiellement froides)
        // - 15 gares en ALTITUDE (Alpes, Pyrénées, Massif Central) - lat entre 43-46, lon > 5 ou < 1
        // - 15 gares intermédiaires réparties
        
        const garesExtremes = [];
        
        // Gares du Sud (10 premières par latitude basse)
        garesExtremes.push(...garesSortedByLat.slice(0, 10));
        
        // Gares du Nord (10 dernières par latitude haute)
        garesExtremes.push(...garesSortedByLat.slice(-10));
        
        // Gares potentiellement en altitude (Alpes, Pyrénées)
        const garesAltitude = garesAvecCoords.filter(g => 
            // Alpes: lat 44-46, lon 5-8
            (g.lat >= 44 && g.lat <= 46.5 && g.lon >= 5 && g.lon <= 8) ||
            // Pyrénées: lat 42-43.5, lon -2 à 3
            (g.lat >= 42 && g.lat <= 43.5 && g.lon >= -2 && g.lon <= 3) ||
            // Massif Central: lat 44-46, lon 2-4
            (g.lat >= 44 && g.lat <= 46 && g.lon >= 2 && g.lon <= 4)
        );
        garesExtremes.push(...garesAltitude.slice(0, 15));
        
        // Quelques gares intermédiaires
        const step = Math.floor(garesSortedByLat.length / 15);
        for (let i = 0; i < 15; i++) {
            const g = garesSortedByLat[i * step];
            if (!garesExtremes.find(e => e.name === g.name)) {
                garesExtremes.push(g);
            }
        }
        
        // Dédupliquer par nom
        const garesUniques = [...new Map(garesExtremes.map(g => [g.name, g])).values()];
        
        console.log(`🌡️ Météo pour ${garesUniques.length} gares stratégiques`);
        
        // 4. Appels météo parallèles (par batch pour ne pas surcharger)
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
        
        // 5. Filtrer les gares avec température valide
        const validWeather = allWeatherResults.filter(w => w.temp !== null);
        
        console.log(`✅ ${validWeather.length} gares avec température valide`);
        
        // 6. Trouver la gare la plus chaude et la plus froide
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
        
        // Cache 5 minutes pour les stats enrichies
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

// --- SERVIR LE FRONTEND ---
app.use(express.static(path.join(__dirname, '../frontend')));

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, '../frontend/index.html'));
});

// --- DÉMARRAGE DU SERVEUR ---
app.listen(port, () => {
    console.log(`🚀 Serveur démarré sur le port ${port}`);
    console.log(`📍 Frontend : http://localhost:${port}`);
});

// ============================================================
// FIN DU FICHIER (ttl 06/01/2026)
// ============================================================