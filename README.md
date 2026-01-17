# 🌿 Eco-Escapade - Tourisme Vert

Application web pour choisir les gares ferroviaires les plus écologiques de France.

## 📋 Description

Eco-Escapade permet de visualiser et comparer les gares françaises selon des critères écologiques :
- Accessibilité vélo (parkings vélos à proximité)
- Bornes de recharge électrique (IRVE)
- Aires de covoiturage
- Qualité de l'air
- Score écologique global

## 🛠️ Technologies utilisées

### Backend
- **Node.js** + **Express** - API REST
- **Axios** - Requêtes HTTP vers APIs externes
- **Node-Cache** - Cache en mémoire
- **Dotenv** - Gestion des variables d'environnement

### Frontend
- **Leaflet.js** - Carte interactive
- **Vanilla JavaScript** - Logique applicative
- **HTML5/CSS3** - Interface responsive
- **Font Awesome** - Icônes

### APIs externes
- SNCF Open Data (gares)
- OpenDataSoft (parkings vélos)
- Data.gouv.fr (IRVE, covoiturage)

## 📦 Installation

### 1. Cloner le projet
```bash
git clone [URL_DU_REPO]
cd Projet_Tourisme_Vert
```

### 2. Installer les dépendances backend
```bash
cd backend
npm install
```

### 3. Configuration
Créer un fichier `.env` dans le dossier `backend/` (facultatif) :
```bash
cp .env.example .env
```

## 🚀 Lancement

### Backend (serveur API)
```bash
cd backend
node server.js
```
Le serveur démarre sur `http://localhost:3000`

### Frontend
Ouvrir `frontend/index.html` avec :
- **Live Server** (extension VS Code)
- Ou directement dans le navigateur (double-clic)

## 📁 Structure du projet

```
Projet_Tourisme_Vert/
├── backend/
│   ├── server.js          # Serveur Express principal
│   ├── package.json       # Dépendances Node.js
│   └── .env.example       # Template de configuration
├── frontend/
│   ├── index.html         # Page d'accueil
│   ├── map.html           # Carte interactive
│   ├── apropos.html       # À propos
│   ├── carnet.html        # Gares favorites
│   ├── app.js             # Logique principale
│   ├── style.css          # Styles globaux
│   ├── responsive.css     # Adaptation mobile
│   └── js/
│       └── textes.js      # Textes centralisés (FR/EN)
└── README.md              # Ce fichier
```

## 🎯 Fonctionnalités

✅ Carte interactive des gares françaises  
✅ Calcul d'éco-score par gare  
✅ Filtrage par type (TGV/TER)  
✅ Zone piétonne 10 min (parkings vélos)  
✅ Gares favorites (localStorage)  
✅ Interface responsive (mobile/desktop)  
✅ Mode bilingue FR/EN  

## 📱 Compatibilité

- ✅ Chrome/Edge (recommandé)
- ✅ Firefox
- ✅ Safari
- ✅ Mobile (iOS/Android)

## 👨‍💻 Auteur

**Hanan JEMMAL** - Projet IUT 2025

## 📄 Licence

ISC License
