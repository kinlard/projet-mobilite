// ============================================================
// NOM FICHIER : backend/server.js
// FUSION COMPLÈTE : API vélo prioritaire + Cache + Air & Bio
// DATE : 06/01/2026
// ============================================================

require('dotenv').config();
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

// 6. QUALITÉ DE L'AIR (OpenAQ)
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
        const radius = 10000; // 10km
        const response = await axios.get(
            `https://api.openaq.org/v3/locations?coordinates=${lat},${lon}&radius=${radius}&limit=1`,
            {
                headers: {
                    'X-API-Key': process.env.OPENAQ_API_KEY
                }
            }
        );
        
        const data = response.data;
        
        if (data.results && data.results.length > 0) {
            const station = data.results[0];
            const pm25 = station.parameters?.find(p => p.parameter === 'pm25');
            
            let quality = 'Inconnue';
            let value = pm25?.lastValue || null;
            
            if (value !== null) {
                if (value < 10) quality = 'Excellent';
                else if (value < 20) quality = 'Bon';
                else if (value < 25) quality = 'Moyen';
                else if (value < 50) quality = 'Médiocre';
                else quality = 'Mauvais';
            }
            
            const result = {
                success: true,
                data: {
                    value: value,
                    unit: 'µg/m³',
                    quality: quality,
                    color: value < 10 ? '#10b981' : value < 25 ? '#f59e0b' : '#ef4444',
                    station: station.name
                }
            };
            
            apiCache.set(cacheKey, result, 3600);
            console.log(`✅ Air quality récupérée : ${quality}`);
            res.json(result);
        } else {
            res.json({ success: false, error: 'No data' });
        }
        
    } catch (error) {
        console.error('❌ OpenAQ error:', error.message);
        res.json({ success: false, error: error.message });
    }
});

// 7. BIODIVERSITÉ (iNaturalist)
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
        
        const species = observations.map(obs => ({
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
// FIN DU FICHIER
// ============================================================
